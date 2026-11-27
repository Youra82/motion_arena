"""Bewegungs-Werkstatt, Schritt 1 (Blender): BVH-Aufnahme laden und Gelenkbahnen ausgeben (zum Finden der Übungsabschnitte).

Aufruf: blender -b --factory-startup --python tools/figuren/bewegung_analyse.py -- <datei.bvh> <ausgabe.csv> [schritt]
CSV: Bild, Hüfte xyz, Kopf z, linke/rechte Hand xyz, linker/rechter Fuß xyz (Meter, Z oben).
"""

import sys

import bpy

args = sys.argv[sys.argv.index("--") + 1 :]
bvh, out = args[0], args[1]
step = int(args[2]) if len(args) > 2 else 4
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_anim.bvh(filepath=bvh, global_scale=0.056444, update_scene_fps=False, update_scene_duration=True,
                        rotate_mode="NATIVE", axis_forward="-Z", axis_up="Y")
arm = next(o for o in bpy.context.scene.objects if o.type == "ARMATURE")
scene = bpy.context.scene
start, end = int(arm.animation_data.action.frame_range[0]), int(arm.animation_data.action.frame_range[1])
names = ["Hips", "Head", "LeftHand", "RightHand", "LeftFoot", "RightFoot"]
with open(out, "w") as f:
    f.write("frame,hx,hy,hz,head_z,lhx,lhy,lhz,rhx,rhy,rhz,lfx,lfy,lfz,rfx,rfy,rfz\n")
    for frame in range(start, end + 1, step):
        scene.frame_set(frame)
        p = {n: arm.matrix_world @ arm.pose.bones[n].head for n in names}
        row = [frame, *p["Hips"], p["Head"].z, *p["LeftHand"], *p["RightHand"], *p["LeftFoot"], *p["RightFoot"]]
        f.write(",".join(f"{v:.4f}" if isinstance(v, float) else str(v) for v in row) + "\n")
print("ANALYSE", bvh, start, end, "->", out)
