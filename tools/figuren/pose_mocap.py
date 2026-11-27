"""Bewegungs-Werkstatt: echte Bewegung (BVH, z. B. CMU Motion Capture) auf eine Figur übertragen.

Gleiche Schnittstelle wie pose_squat.py (setup/apply), damit render_squat.py beide nutzen kann. Auswahl über die
Umgebungsvariable FIGUR_BEWEGUNG = "<datei.bvh>:<startbild>-<endbild>" (BVH-Bilder, 120/s) – darin eine Kniebeuge
abwärts; die Tiefe 0..1 wählt das Bild nach Hüfthöhe (0 = Stand, 1 = tiefster Punkt).

Übertragung wie im Arena-Rig: jeder Knochen dreht sich mit kleinster Drehung in die Richtung des entsprechenden
Mocap-Knochens (Weltraum), die Hüfte folgt der Mocap-Hüfte, maßstäblich auf die Beinlänge der Figur umgerechnet.
"""

import math
import os

import bpy
from mathutils import Matrix, Vector

# Figur-Knochen → (Mocap-Knochen Anfang, Mocap-Knochen Ende): Richtung, in die der Figur-Knochen zeigen soll
MAP = {
    "Spine": ("LowerBack", "Spine1"), "Spine1": ("Spine", "Neck"), "Spine2": ("Spine1", "Neck"),
    "Neck": ("Neck", "Head"), "Head": ("Head", None),
    "LeftShoulder": ("LeftShoulder", "LeftArm"), "LeftArm": ("LeftArm", "LeftForeArm"),
    "LeftForeArm": ("LeftForeArm", "LeftHand"), "LeftHand": ("LeftHand", "LeftFingerBase"),
    "RightShoulder": ("RightShoulder", "RightArm"), "RightArm": ("RightArm", "RightForeArm"),
    "RightForeArm": ("RightForeArm", "RightHand"), "RightHand": ("RightHand", "RightFingerBase"),
    "LeftUpLeg": ("LeftUpLeg", "LeftLeg"), "LeftLeg": ("LeftLeg", "LeftFoot"), "LeftFoot": ("LeftFoot", "LeftToeBase"),
    "RightUpLeg": ("RightUpLeg", "RightLeg"), "RightLeg": ("RightLeg", "RightFoot"), "RightFoot": ("RightFoot", "RightToeBase"),
}
ORDER = ["Spine", "Spine1", "Spine2", "Neck", "Head", "LeftShoulder", "LeftArm", "LeftForeArm", "LeftHand",
         "RightShoulder", "RightArm", "RightForeArm", "RightHand", "LeftUpLeg", "LeftLeg", "LeftFoot",
         "RightUpLeg", "RightLeg", "RightFoot"]


def _import(path):
    before = set(bpy.data.objects)
    bpy.ops.import_anim.bvh(filepath=path, global_scale=0.056444, update_scene_fps=False, update_scene_duration=False,
                            rotate_mode="NATIVE", axis_forward="-Z", axis_up="Y")
    src = next(o for o in bpy.data.objects if o not in before and o.type == "ARMATURE")
    src.hide_render = True  # nur nicht rendern – ausgeblendet würde Blender die Animation nicht auswerten
    return src


def _pos(arm, bone, tail=False):
    pb = arm.pose.bones[bone]
    return arm.matrix_world @ (pb.tail if tail else pb.head)


def setup(rig):
    spec = os.environ["FIGUR_BEWEGUNG"]
    path, rng = spec.rsplit(":", 1)
    a, b = (int(x) for x in rng.split("-"))
    src = _import(path)
    scene = bpy.context.scene
    # Hüfthöhe je Bild im Abschnitt → Tiefe; nur der Weg nach unten (Stand → tiefster Punkt)
    heights = []
    for f in range(a, b + 1):
        scene.frame_set(f)
        heights.append((f, _pos(src, "Hips").z))
    low = min(heights, key=lambda fh: fh[1])
    stand = max(h for f, h in heights if f <= low[0])
    down = [(f, h) for f, h in heights if f <= low[0]]
    # Ausrichtung: Blickrichtung der Mocap-Person (aus der Hüftlinie im Stand) auf die der Figur (−Y) drehen
    scene.frame_set(down[0][0])
    hip_line = _pos(src, "LeftUpLeg") - _pos(src, "RightUpLeg")
    fig_line = (rig.matrix_world @ rig.data.bones["LeftUpLeg"].head_local) - (rig.matrix_world @ rig.data.bones["RightUpLeg"].head_local)
    yaw = math.atan2(fig_line.y, fig_line.x) - math.atan2(hip_line.y, hip_line.x)
    turn = Matrix.Rotation(yaw, 4, "Z")
    # Maßstab über die Beinlänge
    src_leg = (_pos(src, "LeftUpLeg") - _pos(src, "LeftLeg")).length + (_pos(src, "LeftLeg") - _pos(src, "LeftFoot")).length
    bones = rig.data.bones
    fig_leg = (bones["LeftUpLeg"].head_local - bones["LeftLeg"].head_local).length + \
              (bones["LeftLeg"].head_local - bones["LeftFoot"].head_local).length
    return {"src": src, "down": down, "stand": stand, "low": low[1], "turn": turn,
            "scale": fig_leg * rig.matrix_world.to_scale().x / src_leg,
            "src_hips0": _pos(src, "Hips").copy(), "fig_hips0": (rig.matrix_world @ bones["Hips"].head_local).copy()}


def _aim(rig, name, direction):
    pb = rig.pose.bones[name]
    world = rig.matrix_world
    cur = (world @ pb.tail) - (world @ pb.head)
    if cur.length < 1e-6 or direction.length < 1e-6:
        return
    q = cur.normalized().rotation_difference(direction.normalized())
    rot = world.to_quaternion()
    qa = rot.inverted() @ q @ rot
    m = pb.matrix.copy()
    head = m.translation.copy()
    m = qa.to_matrix().to_4x4() @ m
    m.translation = head
    pb.matrix = m
    bpy.context.view_layer.update()


def apply(rig, ctl, depth):
    t = max(0.0, min(1.0, depth))
    # tiefste Stelle der Aufnahme ist eine sehr tiefe Hocke – für den Trainer bis 85 % davon
    target_h = ctl["stand"] - (ctl["stand"] - ctl["low"]) * t * float(os.environ.get("FIGUR_TIEFE", "0.85"))
    frame = min(ctl["down"], key=lambda fh: abs(fh[1] - target_h))[0]
    src = ctl["src"]
    bpy.context.scene.frame_set(frame)
    for pb in rig.pose.bones:
        pb.matrix_basis = Matrix.Identity(4)
    bpy.context.view_layer.update()
    turn = ctl["turn"]
    # Hüfte: Mocap-Verschiebung gegenüber dem Stand, gedreht und maßstäblich
    shift = turn @ (_pos(src, "Hips") - ctl["src_hips0"]) * ctl["scale"]
    hips = rig.pose.bones["Hips"]
    m = hips.matrix.copy()
    m.translation = rig.matrix_world.inverted() @ (ctl["fig_hips0"] + shift)
    hips.matrix = m
    bpy.context.view_layer.update()
    # Becken drehen wie die Hüftlinie der Mocap-Person
    hip_src = turn @ (_pos(src, "LeftUpLeg") - _pos(src, "RightUpLeg"))
    hip_fig = (rig.matrix_world @ rig.pose.bones["LeftUpLeg"].head) - (rig.matrix_world @ rig.pose.bones["RightUpLeg"].head)
    q = hip_fig.normalized().rotation_difference(hip_src.normalized())
    rot = rig.matrix_world.to_quaternion()
    m = hips.matrix.copy()
    head = m.translation.copy()
    m = (rot.inverted() @ q @ rot).to_matrix().to_4x4() @ m
    m.translation = head
    hips.matrix = m
    bpy.context.view_layer.update()
    for name in ORDER:
        if name not in rig.pose.bones:
            continue
        a, b = MAP[name]
        direction = (_pos(src, a, tail=True) if b is None else _pos(src, b)) - _pos(src, a)
        _aim(rig, name, turn @ direction)
    # Bodenkontakt: tiefsten Fußpunkt wieder auf die Standhöhe der Figur setzen (Umrechnung der Hüfthöhe bleibt sonst
    # ein paar Zentimeter daneben – Figur würde schweben oder einsinken)
    world = rig.matrix_world
    bones = rig.data.bones
    feet = [n for n in ("LeftFoot", "RightFoot", "LeftToeBase", "RightToeBase") if n in rig.pose.bones]
    now = min((world @ rig.pose.bones[n].head).z for n in feet)
    rest = min((world @ bones[n].head_local).z for n in feet)
    m = hips.matrix.copy()
    m.translation = m.translation + world.inverted().to_3x3() @ Vector((0, 0, rest - now))
    hips.matrix = m
    bpy.context.view_layer.update()
