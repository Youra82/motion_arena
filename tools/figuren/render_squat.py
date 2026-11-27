"""Trainer-Kniebeuge mit Cycles rendern: Bildfolge nach Tiefe (0..100 %) mit transparentem Hintergrund.

Aufruf: blender -b <figur-sss.blend> --python tools/figuren/render_squat.py -- <hdr> <ausgabeordner> [bilder] [samples] [breite] [hoehe] [nur_tiefe]
Die Arena zeigt später je nach aktueller Tiefe das passende Bild – synchron zur Anleitung und zum Demo.
"""

import math
import os
import sys

import bpy
from mathutils import Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
# Bewegungsquelle: echte Mocap-Kniebeuge (FIGUR_BEWEGUNG gesetzt) oder berechnete Kniebeuge
if os.environ.get("FIGUR_BEWEGUNG"):
    import pose_mocap as pose_squat  # noqa: E402
else:
    import pose_squat  # noqa: E402

args = sys.argv[sys.argv.index("--") + 1 :]
hdr, out_dir = args[0], args[1]
frames = int(args[2]) if len(args) > 2 else 21
samples = int(args[3]) if len(args) > 3 else 96
width = int(args[4]) if len(args) > 4 else 720
height = int(args[5]) if len(args) > 5 else 1080
only = [float(x) for x in args[6].split(",")] if len(args) > 6 else None

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
scene.cycles.device = os.environ.get("FIGUR_GERAET", "GPU")
scene.cycles.samples = samples
scene.cycles.use_denoising = True
scene.render.film_transparent = True
scene.render.resolution_x, scene.render.resolution_y = width, height
scene.render.image_settings.file_format = "PNG"
scene.render.image_settings.color_mode = "RGBA"
scene.view_settings.view_transform = "AgX"
scene.view_settings.look = "AgX - Medium High Contrast"

# Licht wie Core Studio der Arena: HDR + warmes Fensterlicht von links + kühles Gegenlicht
world = scene.world or bpy.data.worlds.new("Studio")
scene.world = world
world.use_nodes = True
nt = world.node_tree
nt.nodes.clear()
env = nt.nodes.new("ShaderNodeTexEnvironment")
env.image = bpy.data.images.load(hdr)
bg = nt.nodes.new("ShaderNodeBackground")
bg.inputs["Strength"].default_value = 0.9
outn = nt.nodes.new("ShaderNodeOutputWorld")
nt.links.new(env.outputs["Color"], bg.inputs["Color"])
nt.links.new(bg.outputs["Background"], outn.inputs["Surface"])


def area(name, energy, size, loc, color):
    light = bpy.data.lights.new(name, "AREA")
    light.energy, light.size, light.color = energy, size, color
    obj = bpy.data.objects.new(name, light)
    obj.location = loc
    direction = Vector((0, 0, 0.9)) - Vector(loc)
    obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
    scene.collection.objects.link(obj)


area("Key", 420, 2.4, (-2.4, -2.6, 2.8), (1.0, 0.93, 0.85))
area("Rim", 260, 1.2, (1.8, 2.2, 2.4), (1.0, 0.62, 0.32))
area("Fill", 90, 3.0, (2.6, -2.4, 1.2), (0.85, 0.92, 1.0))

rig = next(o for o in scene.objects if o.type == "ARMATURE")
ctl = pose_squat.setup(rig)

# Kamera: Blick wie in der Arena auf den Trainer (leicht von rechts vorn, Augenhöhe ~1,25 m)
cam_data = bpy.data.cameras.new("Cam")
cam_data.lens = 50
cam = bpy.data.objects.new("Cam", cam_data)
scene.collection.objects.link(cam)
yaw = math.radians(24)
dist = 5.2
cam.location = (dist * math.sin(yaw), -dist * math.cos(yaw), 1.25)
cam.rotation_euler = (Vector((0, 0.05, 0.86)) - cam.location).to_track_quat("-Z", "Y").to_euler()
scene.camera = cam
cam_data.sensor_fit = "VERTICAL"
cam_data.sensor_height = 24
cam_data.lens = 24 / (2 * math.tan(math.radians(29) / 2))  # 29° vertikaler Bildwinkel

os.makedirs(out_dir, exist_ok=True)
depths = only if only is not None else [i / (frames - 1) for i in range(frames)]
for i, depth in enumerate(depths):
    pose_squat.apply(rig, ctl, depth)
    scene.render.filepath = os.path.join(out_dir, f"squat_{round(depth * 100):03d}.png")
    bpy.ops.render.render(write_still=True)
    print("BILD", scene.render.filepath)
