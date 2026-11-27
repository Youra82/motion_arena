"""Figuren-Werkstatt: eine Figur aus einer JSON-Beschreibung mit Blender + MPFB 2 bauen und als GLB exportieren.

Aufruf (Blender im Hintergrund):
  blender -b --python tools/figuren/build_figure.py -- tools/figuren/figuren.json <id> <ausgabe.glb> [szene.blend]

Die Beschreibung nennt Körper (MakeHuman-Makros), Haut, Haare, Brauen, Wimpern und Kleidung (MakeHuman-Community-
Assets, CC0/CC-BY). Ergebnis: eine geriggte Figur mit Mixamo-Skelett, Knochennamen ohne „mixamorig:“ – damit
passt sie direkt zum Arena-Rig (Hips, Spine, LeftUpLeg …). Optional wird die Blender-Szene gespeichert (für Renders).
"""

import json
import os
import sys

import bpy

from bl_ext.user_default.mpfb.services.humanservice import HumanService
from bl_ext.user_default.mpfb.services.locationservice import LocationService
from bl_ext.user_default.mpfb.services.targetservice import TargetService

args = sys.argv[sys.argv.index("--") + 1 :]
spec_file, figure_id, out_glb = args[0], args[1], args[2]
blend_out = args[3] if len(args) > 3 else None
spec = json.load(open(spec_file, encoding="utf-8"))["figuren"][figure_id]
data = LocationService.get_user_data()


def asset(kind: str, name: str, ext: str) -> str:
    path = os.path.join(data, kind, name, f"{name}.{ext}")
    if not os.path.isfile(path):
        raise FileNotFoundError(path)
    return path


# leere Szene (ohne Werkseinstellungen neu zu laden – das würde MPFB abschalten)
for obj in list(bpy.data.objects):
    bpy.data.objects.remove(obj, do_unlink=True)

macro = TargetService.get_default_macro_info_dict()
for key, value in spec["koerper"].items():
    if key == "race":
        macro["race"].update(value)
    else:
        macro[key] = value
basemesh = HumanService.create_human(macro_detail_dict=macro, feet_on_ground=True, scale=0.1)
basemesh.name = f"{figure_id}_body"

# Gesicht aus der Gesichts-Werkstatt (an das Konzeptporträt angepasste MakeHuman-Formen)
for target_name, weight in spec.get("gesicht", {}).items():
    target_path = TargetService.target_full_path(target_name)
    if target_path:
        TargetService.load_target(basemesh, target_path, weight=weight)

# Hauttyp: GAMEENGINE (Laufzeit/GLB) oder ENHANCED_SSS (Cycles-Renders); Umgebungsvariable überschreibt
skin_type = os.environ.get("FIGUR_HAUT_TYP") or spec.get("haut_typ", "GAMEENGINE")
HumanService.set_character_skin(asset("skins", spec["haut"], "mhmat"), basemesh, skin_type=skin_type, material_instances=True)

# Skelett zuerst: Teile, die danach hinzukommen, erhalten ihre Hautgewichte vom Körper (sonst schweben Haare/Kleidung)
rig = HumanService.add_builtin_rig(basemesh, "mixamo", import_weights=True)

# Augen, Brauen, Wimpern
eyes_dir = os.path.join(data, "eyes", "high-poly")
HumanService.add_mhclo_asset(os.path.join(eyes_dir, "high-poly.mhclo"), basemesh, asset_type="Eyes", subdiv_levels=0, material_type="MAKESKIN")
for kind, name in (("eyebrows", spec["brauen"]), ("eyelashes", spec["wimpern"])):
    HumanService.add_mhclo_asset(asset(kind, name, "mhclo"), basemesh, asset_type=kind.capitalize(), subdiv_levels=0, material_type="MAKESKIN")
if spec.get("haare"):
    HumanService.add_mhclo_asset(asset("hair", spec["haare"], "mhclo"), basemesh, asset_type="Hair", subdiv_levels=0, material_type="MAKESKIN")
# Kleidung: Namen von MakeHuman-Assets oder Stücke aus der eigenen Kleidungs-Werkstatt (tools/figuren/kleidung.py)
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kleidung  # noqa: E402

clothes_names = []
for item in spec["kleidung"]:
    if isinstance(item, dict):
        name = kleidung.erzeugen(item["werkstatt"], item.get("farbe", "#1a1b1e"), item.get("akzent", "#ff704b"))
    else:
        name = item
    clothes_names.append(name)
    HumanService.add_mhclo_asset(asset("clothes", name, "mhclo"), basemesh, asset_type="Clothes", subdiv_levels=0, material_type="MAKESKIN")

# Kleidung umfärben: Farbtextur direkt einfärben (Helligkeit/Falten bleiben), damit die Farbe auch im GLB steckt
import numpy as np  # noqa: E402  (in Blender enthalten)


def box_blur(a, r):
    """Weichzeichnen (Kastenfilter, zweimal ≈ Gauß) – für Stoffe mit unruhiger Textur (Frottee-Look)."""
    for axis in (0, 1):
        c = np.cumsum(np.pad(a, [(r + 1, r) if i == axis else (0, 0) for i in range(a.ndim)], mode="edge"), axis=axis)
        hi = np.take(c, np.arange(2 * r + 1, c.shape[axis]), axis=axis)
        lo = np.take(c, np.arange(0, c.shape[axis] - 2 * r - 1), axis=axis)
        a = (hi - lo) / (2 * r + 1)
    return a


SMOOTH = set(spec.get("glatt", []))


def tint(obj_suffix: str, hex_color: str) -> None:
    rgb = np.array([int(hex_color[i : i + 2], 16) / 255 for i in (1, 3, 5)], np.float32) ** 2.2  # linear
    for obj in bpy.data.objects:
        if obj.type != "MESH" or not obj.name.endswith(obj_suffix):
            continue
        for slot in obj.material_slots:
            if not slot.material or not slot.material.use_nodes:
                continue
            for node in slot.material.node_tree.nodes:
                img = getattr(node, "image", None)
                if node.type != "TEX_IMAGE" or img is None:
                    continue
                print("  TEXTUR", obj_suffix, img.name, img.colorspace_settings.name)
                if img.colorspace_settings.name not in ("sRGB", "Filmic sRGB", "AgX Base sRGB"):
                    continue
                if any(k in img.name.lower() for k in ("normal", "nrm", "bump", "spec", "rough", "_ao")):
                    continue
                px = np.empty(len(img.pixels), np.float32)
                img.pixels.foreach_get(px)
                px = px.reshape(-1, 4)
                lum = px[:, :3] @ np.array([0.2126, 0.7152, 0.0722], np.float32)
                if obj_suffix in SMOOTH:
                    w, h = img.size
                    lum = box_blur(box_blur(lum.reshape(h, w), 5), 5).ravel().astype(np.float32)
                ref = float(np.median(lum[px[:, 3] > 0.5])) if (px[:, 3] > 0.5).any() else float(np.median(lum))
                shade = np.clip(lum / max(ref, 1e-3), 0.25, 1.6)[:, None]
                px[:, :3] = np.clip(rgb[None, :] * shade, 0, 1)
                img.name = f"{figure_id}_{obj_suffix}_{img.name}"
                img.pixels.foreach_set(px.ravel())
                img.pack()


for name, color in spec.get("farben", {}).items():
    tint(name, color)

# „glatt“: Oberflächenrelief dämpfen (Normal-/Bump-Karten), sonst wirkt Sportstoff wie Frottee oder Leder
for obj in bpy.data.objects:
    if obj.type != "MESH" or not any(obj.name.endswith(n) for n in SMOOTH):
        continue
    for slot in obj.material_slots:
        if not slot.material or not slot.material.use_nodes:
            continue
        nt = slot.material.node_tree
        for node in nt.nodes:
            if node.type in ("NORMAL_MAP", "BUMP"):
                # Relief ganz entfernen: glatter Sportstoff (der Export würde Bump-Karten sonst als Normalen ausgeben)
                for link in list(node.outputs[0].links):
                    nt.links.remove(link)
            elif node.type == "DISPLACEMENT":
                for link in list(node.outputs[0].links):
                    nt.links.remove(link)

# Knochennamen wie im Arena-Rig
for bone in rig.data.bones:
    bone.name = bone.name.replace("mixamorig:", "")
rig.name = f"{figure_id}_rig"

# Unterteilungs-Modifikatoren entfernen (Laufzeitfigur), Hilfsgeometrie per Maske ausgeblendet lassen
for obj in bpy.data.objects:
    if obj.type == "MESH":
        for mod in list(obj.modifiers):
            if mod.type == "SUBSURF":
                obj.modifiers.remove(mod)

if blend_out:
    bpy.ops.wm.save_as_mainfile(filepath=blend_out)

# Bump-Karten nie als Normalen exportieren (glTF kennt nur Normal-Karten – Höhenwerte ergäben Zufallsreflexe)
for mat in bpy.data.materials:
    if mat.use_nodes:
        for node in mat.node_tree.nodes:
            if node.type == "BUMP":
                for link in list(node.outputs[0].links):
                    mat.node_tree.links.remove(link)

# Laufzeitfigur: keine Metall-/Glanzkarten im Export (würden im glTF zu Chrom/Glanz) – Stoff matt, Haut seidenmatt
for mat in bpy.data.materials:
    if not mat.use_nodes:
        continue
    nt = mat.node_tree
    for node in nt.nodes:
        if node.type != "BSDF_PRINCIPLED":
            continue
        for name in ("Metallic", "Roughness", "Specular IOR Level", "Specular"):
            sock = node.inputs.get(name)
            if sock is None:
                continue
            for link in list(sock.links):
                nt.links.remove(link)
        node.inputs["Metallic"].default_value = 0.0
        node.inputs["Roughness"].default_value = 0.5 if mat.name.endswith(".body") else 0.8

# Laufzeitfigur: sehr feine Kleidungsnetze (manche Assets > 50.000 Punkte) vereinfachen. Die Vereinfachung kommt
# vor das Skelett im Modifikator-Stapel – Hautgewichte werden dabei mit übernommen. (Renders nutzen die .blend.)
MAX_POINTS = 8000
for obj in bpy.data.objects:
    if obj.type != "MESH" or obj == basemesh or len(obj.data.vertices) <= MAX_POINTS:
        continue
    mod = obj.modifiers.new("Vereinfachen", "DECIMATE")
    mod.ratio = MAX_POINTS / len(obj.data.vertices)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_move_to_index(modifier=mod.name, index=0)
    print("  VEREINFACHT", obj.name, len(obj.data.vertices), "->", MAX_POINTS)

os.makedirs(os.path.dirname(os.path.abspath(out_glb)), exist_ok=True)
bpy.ops.object.select_all(action="SELECT")
bpy.ops.export_scene.gltf(
    filepath=out_glb, export_format="GLB", export_apply=True, export_animations=False, export_skins=True,
    export_yup=True, export_image_format="AUTO", use_selection=False,
)
# Begleitdatei: welche Materialien brauchen einen Alpha-Schnitt (Haare, Brauen, Wimpern, Hornhaut der Augen) – alles andere ist deckend
cutout = [m.name for o in bpy.data.objects if o.type == "MESH" and any(o.name.endswith("." + n) for n in
          [spec["brauen"], spec["wimpern"], spec.get("haare") or "-", "high-poly"]) for m in (s.material for s in o.material_slots) if m]
json.dump({"cutout": cutout}, open(out_glb + ".json", "w", encoding="utf-8"))
print("FIGUR", figure_id, "->", out_glb, "Alpha-Schnitt:", cutout)
for obj in bpy.data.objects:
    print("  OBJ", obj.type, obj.name, [m.name for m in obj.material_slots] if obj.type == "MESH" else "")
