"""Porträt (Kopf und Schultern) einer gebauten Figur mit Cycles rendern – zur Kontrolle der Gesichter.
Aufruf: blender -b <figur.blend> --python tools/figuren/render_portrait.py -- <hdr> <ausgabe.png> [samples]
"""
import math
import sys

import bpy
from mathutils import Vector

args = sys.argv[sys.argv.index("--") + 1:]
hdr, out = args[0], args[1]
samples = int(args[2]) if len(args) > 2 else 128
scene = bpy.context.scene
scene.render.engine = "CYCLES"
prefs = bpy.context.preferences.addons["cycles"].preferences
prefs.compute_device_type = "OPTIX"
prefs.get_devices()
for d in prefs.devices:
    d.use = d.type in ("OPTIX", "CUDA")
scene.cycles.device = "GPU"
scene.cycles.samples = samples
scene.cycles.use_denoising = True
scene.render.resolution_x, scene.render.resolution_y = 600, 760
scene.view_settings.view_transform = "AgX"
scene.view_settings.look = "AgX - Medium High Contrast"
world = scene.world or bpy.data.worlds.new("W")
scene.world = world
world.use_nodes = True
nt = world.node_tree
nt.nodes.clear()
env = nt.nodes.new("ShaderNodeTexEnvironment")
env.image = bpy.data.images.load(hdr)
bg = nt.nodes.new("ShaderNodeBackground")
bg.inputs["Strength"].default_value = 0.55
o = nt.nodes.new("ShaderNodeOutputWorld")
nt.links.new(env.outputs["Color"], bg.inputs["Color"])
nt.links.new(bg.outputs["Background"], o.inputs["Surface"])
rig = next(x for x in scene.objects if x.type == "ARMATURE")
head = rig.matrix_world @ rig.data.bones["Head"].head_local
for name, energy, loc, col in (("Key", 70, (-1.2, -1.6, 0.5), (1, .93, .86)), ("Rim", 60, (1.0, 1.2, 0.6), (1, .66, .38)),
                               ("Fill", 18, (1.4, -1.2, -0.2), (.85, .92, 1))):
    light = bpy.data.lights.new(name, "AREA")
    light.energy, light.size, light.color = energy, 1.0, col
    obj = bpy.data.objects.new(name, light)
    obj.location = head + Vector(loc)
    obj.rotation_euler = (head - obj.location).to_track_quat("-Z", "Y").to_euler()
    scene.collection.objects.link(obj)
cam = bpy.data.objects.new("Cam", bpy.data.cameras.new("Cam"))
cam.data.lens = 85
scene.collection.objects.link(cam)
target = head + Vector((0, 0, 0.02))
cam.location = target + Vector((0.45 * math.sin(math.radians(15)), -1.15, 0.03))
cam.rotation_euler = (target - cam.location).to_track_quat("-Z", "Y").to_euler()
scene.camera = cam
scene.render.filepath = out
bpy.ops.render.render(write_still=True)
print("PORTRAET", out)
