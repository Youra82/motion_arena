"""Gesichts-Werkstatt, Schritt 2 (Blender): Körper eines Avatars bauen (ohne Kleidung) und Punktpositionen exportieren.

Aufruf: blender -b --python tools/figuren/gesicht_export.py -- <figuren.json> <id> <ausgabe.npy> [kopfbild.png]
Positionen im MakeHuman-Raum (Dezimeter, Y oben, Z nach vorn) – passend zu den .target-Dateien.
Mit Kopfbild: frontales, orthografisches Render des Kopfes + <kopfbild>.json (Pixel ↔ Raum), für die Zuordnung
der MediaPipe-Gesichtspunkte zu Körperpunkten.
"""

import json
import os
import sys

import bpy
import numpy as np
from mathutils import Vector

from bl_ext.user_default.mpfb.services.humanservice import HumanService
from bl_ext.user_default.mpfb.services.locationservice import LocationService
from bl_ext.user_default.mpfb.services.targetservice import TargetService

args = sys.argv[sys.argv.index("--") + 1 :]
spec_file, figure_id, out_npy = args[0], args[1], args[2]
head_png = args[3] if len(args) > 3 else None
figs = json.load(open(spec_file, encoding="utf-8"))["figuren"]
spec = figs.get(figure_id, {"koerper": {}})

for obj in list(bpy.data.objects):
    bpy.data.objects.remove(obj, do_unlink=True)
macro = TargetService.get_default_macro_info_dict()
for key, value in spec.get("koerper", {}).items():
    if key == "race":
        macro["race"].update(value)
    else:
        macro[key] = value
# ohne Bodenausrichtung: Positionen bleiben im Grundkörper-Raum (gleicher Ursprung wie die .target-Dateien)
basemesh = HumanService.create_human(macro_detail_dict=macro, feet_on_ground=False, scale=0.1)
for name, weight in spec.get("gesicht", {}).items():
    path = TargetService.target_full_path(name)
    if path:
        TargetService.load_target(basemesh, path, weight=weight)

# Modifikatoren (Maske der Hilfsgeometrie) aus: Punktnummern müssen denen der .target-Dateien entsprechen
for mod in basemesh.modifiers:
    mod.show_viewport = False
deps = bpy.context.evaluated_depsgraph_get()
mesh = basemesh.evaluated_get(deps).to_mesh()
co = np.empty(len(mesh.vertices) * 3, np.float32)
mesh.vertices.foreach_get("co", co)
co = co.reshape(-1, 3)
# Blender (Meter, Z oben, Blick −Y) → MakeHuman (Dezimeter, Y oben, Z vorn)
mh = np.stack([co[:, 0], co[:, 2], -co[:, 1]], 1) * 10.0
np.save(out_npy, mh)
print("EXPORT", figure_id, mh.shape, "->", out_npy)

if head_png:
    if spec.get("haut"):
        skin = os.path.join(LocationService.get_user_data(), "skins", spec["haut"], spec["haut"] + ".mhmat")
        HumanService.set_character_skin(skin, basemesh, skin_type="MAKESKIN")
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE_NEXT"
    scene.render.resolution_x = scene.render.resolution_y = 1024
    world = bpy.data.worlds.new("w")
    scene.world = world
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs[1].default_value = 4.0
    scene.view_settings.view_transform = "Standard"
    for mod in basemesh.modifiers:
        mod.show_viewport = mod.show_render = mod.type == "MASK"  # im Bild ohne Hilfsgeometrie
    head = basemesh.matrix_world @ Vector(co[np.argmax(co[:, 2])])  # Scheitel
    cam_data = bpy.data.cameras.new("cam")
    cam_data.type = "ORTHO"
    cam_data.ortho_scale = 0.30
    cam = bpy.data.objects.new("cam", cam_data)
    scene.collection.objects.link(cam)
    centre = Vector((0.0, head.y, head.z - 0.12))
    cam.location = centre + Vector((0, -2.0, 0))
    cam.rotation_euler = (1.5707963, 0, 0)
    scene.camera = cam
    scene.render.filepath = head_png
    bpy.ops.render.render(write_still=True)
    # Pixel ↔ MakeHuman-Raum: x_px = (X/10 − cx)/scale·W + W/2, y_px = −(Y/10 − cz)/scale·H + H/2
    json.dump({"cx": centre.x, "cz": centre.z, "scale": cam_data.ortho_scale, "size": 1024},
              open(head_png + ".json", "w"))
    print("KOPFBILD", head_png)
