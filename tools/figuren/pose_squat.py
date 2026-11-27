"""Kniebeuge in Blender stellen – für Cycles-Renders des Trainers.

Wie das Arena-Rig (trainer-rig.ts): Gelenkpositionen werden ausgerechnet (Füße fest, Knie per Zwei-Glied-Rechnung,
Hüfte nach hinten-unten, Rumpf vorgeneigt, Hände vor der Brust), jeder Knochen zeigt per „Damped Track“ auf sein
nächstes Gelenk (kleinste Drehung). Figur im MakeHuman-Raum: Z oben, Blick nach -Y, links = +X.
"""

import math

import bpy
from mathutils import Matrix, Vector

UP = Vector((0, 0, 1))
FORWARD = Vector((0, -1, 0))


def _empty(name):
    obj = bpy.data.objects.get(name)
    if obj is None:
        obj = bpy.data.objects.new(name, None)
        bpy.context.scene.collection.objects.link(obj)
    return obj


def _track(pose_bone, target):
    c = pose_bone.constraints.new("DAMPED_TRACK")
    c.target = target
    c.track_axis = "TRACK_Y"


def _two_bone(start, end, a, b, bend):
    """Mittleres Gelenk zweier Glieder (Längen a, b) zwischen start und end, gebeugt Richtung bend."""
    d = end - start
    dist = min(d.length, a + b - 1e-4)
    d.normalize()
    along = (a * a - b * b + dist * dist) / (2 * dist)
    side = bend - d * bend.dot(d)
    side.normalize()
    return start + d * along + side * math.sqrt(max(0.0, a * a - along * along))


def setup(rig):
    world = rig.matrix_world
    bones = rig.data.bones
    pos = lambda n: world @ bones[n].head_local  # noqa: E731
    rest = {n: pos(n) for n in ("Hips", "Spine", "Spine2", "Neck", "Head", "LeftUpLeg", "LeftLeg", "LeftFoot",
                                "RightUpLeg", "RightLeg", "RightFoot", "LeftArm", "LeftForeArm", "LeftHand",
                                "RightArm", "RightForeArm", "RightHand")}
    ctl = {"rest": rest, "e": {}}
    pose = rig.pose.bones
    hip_t = _empty("T_Hips")
    c = pose["Hips"].constraints.new("COPY_LOCATION")
    c.target = hip_t
    ctl["e"]["Hips"] = hip_t
    for name, child in (("Spine", "T_Chest"), ("Neck", "T_Head"), ("Head", "T_Gaze")):
        e = _empty(child)
        _track(pose[name], e)
        ctl["e"][child] = e
    for side in ("Left", "Right"):
        for bone, target in ((f"{side}UpLeg", f"T_{side}Knee"), (f"{side}Leg", f"T_{side}Ankle"),
                             (f"{side}Arm", f"T_{side}Elbow"), (f"{side}ForeArm", f"T_{side}Wrist")):
            e = _empty(target)
            _track(pose[bone], e)
            ctl["e"][target] = e
        # Fuß flach und leicht nach außen gedreht (Weltrotation fest)
        sign = 1 if side == "Left" else -1
        fr = _empty(f"R_{side}Foot")
        fr.rotation_mode = "QUATERNION"
        restq = (world @ bones[f"{side}Foot"].matrix_local).to_quaternion()
        fr.rotation_quaternion = Matrix.Rotation(math.radians(14 * sign), 4, "Z").to_quaternion() @ restq
        c = pose[f"{side}Foot"].constraints.new("COPY_ROTATION")
        c.target = fr
    ctl["len"] = {
        "thigh": (rest["LeftLeg"] - rest["LeftUpLeg"]).length,
        "shin": (rest["LeftFoot"] - rest["LeftLeg"]).length,
        "upper": (rest["LeftForeArm"] - rest["LeftArm"]).length,
        "fore": (rest["LeftHand"] - rest["LeftForeArm"]).length,
        "spine": (rest["Spine2"] - rest["Spine"]).length,
        "neck": (rest["Head"] - rest["Neck"]).length,
    }
    return ctl


def apply(rig, ctl, depth):
    """depth 0..1 (0 = stehen, 1 = tiefe Kniebeuge, Oberschenkel etwa waagerecht)."""
    t = max(0.0, min(1.0, depth))
    r, e, L = ctl["rest"], ctl["e"], ctl["len"]
    leg = L["thigh"] + L["shin"]
    # Hüfte: tiefer und nach hinten (Gewicht über dem Mittelfuß)
    drop = leg * 0.52 * t ** 1.08
    back = leg * 0.32 * t
    hips = r["Hips"] + Vector((0, back, -drop))
    e["Hips"].location = hips
    move = hips - r["Hips"]
    lean = math.radians(8 + 34 * t)  # Rumpf vor, Rücken gerade
    spine_dir = Vector((0, -math.sin(lean), math.cos(lean)))
    e["T_Chest"].location = r["Spine"] + move + spine_dir * 2.0
    head_up = Vector((0, -math.sin(lean * 0.25), math.cos(lean * 0.25)))  # Blick bleibt nach vorn
    for side, sign in (("Left", 1), ("Right", -1)):
        hip_joint = r[f"{side}UpLeg"] + move
        ankle = r[f"{side}Foot"] + Vector((sign * 0.07, 0, 0))  # etwas breiterer Stand
        knee = _two_bone(hip_joint, ankle, L["thigh"], L["shin"], FORWARD + Vector((sign * 0.45, 0, 0)))
        e[f"T_{side}Knee"].location = knee
        e[f"T_{side}Ankle"].location = ankle
    bpy.context.view_layer.update()
    # Schultern/Kopf nach der Rumpfneigung: aktuelle Lage aus der Pose lesen
    world = rig.matrix_world
    pose = rig.pose.bones
    neck = world @ pose["Neck"].head
    e["T_Head"].location = neck + head_up * 2.0
    # Kopf: Scheitel nach oben, Blick geradeaus (leicht nach vorn geneigt wie beim Training)
    head = world @ pose["Head"].head
    e["T_Gaze"].location = head + Vector((0, -0.12, 1.0)) * 2.0
    chest = world @ pose["Spine2"].head
    for side, sign in (("Left", 1), ("Right", -1)):
        shoulder = world @ pose[f"{side}Arm"].head
        # Hände vor der Brust zusammen (wie im Konzeptbild), mit der Tiefe etwas weiter vorn
        # Hände vor dem Brustbein gefaltet: Bezug ist der Rumpf (nach vorn/unten mit der Neigung), nicht die Welt
        fwd = Vector((0, -math.cos(lean), -math.sin(lean)))
        down = Vector((0, -math.sin(lean), math.cos(lean))) * -1
        wrist = chest + fwd * (0.30 + 0.05 * t) + down * (0.04 - 0.10 * t) + Vector((sign * 0.06, 0, 0))
        elbow = _two_bone(shoulder, wrist, L["upper"], L["fore"], Vector((sign * 0.8, 0.1, -1.0)))
        e[f"T_{side}Elbow"].location = elbow
        e[f"T_{side}Wrist"].location = wrist
    bpy.context.view_layer.update()
