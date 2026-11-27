"""Vorschau einer gebauten Figur mit Cycles (GPU/OptiX) rendern.

Aufruf: blender -b <figur.blend> --python tools/figuren/render_preview.py -- <hdr> <ausgabe.png> [samples] [breite] [hoehe]
Licht: HDR-Umgebung (wie Core Studio der Arena) + weiches Hauptlicht; Hintergrund transparent (für Freistellung).
"""

import math
import sys

import bpy
from mathutils import Vector

args = sys.argv[sys.argv.index("--") + 1 :]
hdr, out = args[0], args[1]
samples = int(args[2]) if len(args) > 2 else 128
width = int(args[3]) if len(args) > 3 else 800
height = int(args[4]) if len(args) > 4 else 1200

scene = bpy.context.scene
scene.render.engine = "CYCLES"
prefs = bpy.context.preferences.addons["cycles"].preferences
for backend in ("OPTIX", "CUDA"):
    try:
        prefs.compute_device_type = backend
        prefs.get_devices()
        if any(d.type == backend for d in prefs.devices):
            break
    except TypeError:
        continue
for d in prefs.devices:
    d.use = d.type in ("OPTIX", "CUDA")
scene.cycles.device = "GPU"
scene.cycles.samples = samples
scene.cycles.use_denoising = True
scene.render.film_transparent = True
scene.render.resolution_x, scene.render.resolution_y = width, height
scene.view_settings.view_transform = "AgX"
scene.view_settings.look = "AgX - Medium High Contrast"

world = bpy.data.worlds.new("Studio") if not scene.world else scene.world
scene.world = world
world.use_nodes = True
nt = world.node_tree
nt.nodes.clear()
env = nt.nodes.new("ShaderNodeTexEnvironment")
env.image = bpy.data.images.load(hdr)
bg = nt.nodes.new("ShaderNodeBackground")
bg.inputs["Strength"].default_value = 1.0
outn = nt.nodes.new("ShaderNodeOutputWorld")
nt.links.new(env.outputs["Color"], bg.inputs["Color"])
nt.links.new(bg.outputs["Background"], outn.inputs["Surface"])

# Hauptlicht (weiches Fenster-/Softbox-Licht von vorn links oben)
light = bpy.data.lights.new("Key", "AREA")
light.energy = 450
light.size = 2.5
key = bpy.data.objects.new("Key", light)
key.location = (-2.2, -3.0, 3.0)
key.rotation_euler = (math.radians(55), 0, math.radians(-35))
scene.collection.objects.link(key)

# Kamera auf die Figur
meshes = [o for o in scene.objects if o.type == "MESH"]
lo = Vector((min(v[0] for o in meshes for v in o.bound_box), 0, min((o.matrix_world @ Vector(c)).z for o in meshes for c in o.bound_box)))
top = max((o.matrix_world @ Vector(c)).z for o in meshes for c in o.bound_box)
tall = top - lo.z
cam_data = bpy.data.cameras.new("Cam")
cam_data.lens = 85
cam = bpy.data.objects.new("Cam", cam_data)
scene.collection.objects.link(cam)
dist = tall * 2.9
cam.location = (dist * math.sin(math.radians(22)), -dist * math.cos(math.radians(22)), lo.z + tall * 0.55)
direction = Vector((0, 0, lo.z + tall * 0.5)) - cam.location
cam.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
scene.camera = cam

scene.render.filepath = out
bpy.ops.render.render(write_still=True)
print("RENDER", out)
