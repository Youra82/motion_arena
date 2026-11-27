"""GLB einer Figur verkleinern: Hauttextur (Material ".body") 2048 px, alle anderen 1024 px; JPEG ohne Alpha, PNG mit Alpha.
Aufruf: python tools/figuren/compress_glb.py <ein.glb> <aus.glb>
Geometrie, Skin und Materialien bleiben unverändert; nur Bild-Puffer werden ersetzt (Offsets neu gesetzt).
"""
import importlib.util
import os
import sys

here = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location("shrink", os.path.join(here, "..", "..", "scripts", "shrink-glb-textures.py"))
shrink = importlib.util.module_from_spec(spec)
spec.loader.exec_module(shrink)

src, dst = sys.argv[1], sys.argv[2]
gltf, binary = shrink.read_glb(src)
body_images = set()
for m in gltf.get("materials", []):
    if m.get("name", "").endswith(".body"):
        tex = m.get("pbrMetallicRoughness", {}).get("baseColorTexture")
        if tex:
            body_images.add(gltf["textures"][tex["index"]]["source"])
eye_images = set()
for m in gltf.get("materials", []):
    tex = m.get("pbrMetallicRoughness", {}).get("baseColorTexture")
    if tex and m.get("name", "").endswith(("high-poly", "low-poly")):
        eye_images.add(gltf["textures"][tex["index"]]["source"])

import cv2  # noqa: E402
import numpy as np  # noqa: E402

replace = {}
cutout = set()  # Bilder mit echter Transparenz (Haare, Brauen, Wimpern)
for i, image in enumerate(gltf.get("images", [])):
    view = gltf["bufferViews"][image["bufferView"]]
    a = view.get("byteOffset", 0)
    raw = binary[a : a + view["byteLength"]]
    img = cv2.imdecode(np.frombuffer(raw, np.uint8), cv2.IMREAD_UNCHANGED)
    if img is not None and img.ndim == 3 and img.shape[2] == 4 and int(img[:, :, 3].min()) >= 250:
        ok, enc = cv2.imencode(".png", img[:, :, :3])  # Alphakanal deckt überall: weglassen → wird JPEG
        raw = enc.tobytes()
    elif img is not None and img.ndim == 3 and img.shape[2] == 4:
        cutout.add(i)
    if i in eye_images and img is not None:
        # Augen: ohne Lidschatten leuchtet das Weiße im Raumlicht – Sklera etwas dunkler
        img = img.copy()
        img[:, :, :3] = (img[:, :, :3].astype(np.float32) * 0.78).astype(np.uint8)  # Alphakanal (Hornhaut) bleibt
        ok, enc = cv2.imencode(".png", img)
        raw = enc.tobytes()
    new, mime = shrink.shrink(raw, "image/png", 2048 if i in body_images else 1024)
    replace[image["bufferView"]] = new
    image["mimeType"] = mime
# Materialien: deckend, nur Haare/Brauen/Wimpern (Begleitdatei des Bau-Skripts) mit Alpha-Schnitt
import json  # noqa: E402

side = src + ".json"
cut_names = set(json.load(open(side, encoding="utf-8"))["cutout"]) if os.path.isfile(side) else None
for m in gltf.get("materials", []):
    tex = m.get("pbrMetallicRoughness", {}).get("baseColorTexture")
    source = gltf["textures"][tex["index"]]["source"] if tex else None
    wants_cut = m.get("name") in cut_names if cut_names is not None else source in cutout
    if wants_cut:
        m["alphaMode"] = "MASK"
        m["alphaCutoff"] = 0.45
        m["doubleSided"] = True
    else:
        m.pop("alphaMode", None)
        m.pop("alphaCutoff", None)
out = bytearray()
for i, view in enumerate(gltf["bufferViews"]):
    a = view.get("byteOffset", 0)
    chunk = replace.get(i, binary[a : a + view["byteLength"]])
    out += b"\0" * ((4 - len(out) % 4) % 4)
    view["byteOffset"] = len(out)
    view["byteLength"] = len(chunk)
    out += chunk
gltf["buffers"][0]["byteLength"] = len(out)
shrink.write_glb(dst, gltf, bytes(out))
print(f"{dst}: {len(out) / 1e6:.2f} MB", [im["mimeType"] for im in gltf["images"]])
