"""Verkleinert eingebettete Texturen einer GLB-Datei (längste Kante begrenzen) und schreibt die GLB neu.

Aufruf: python scripts/shrink-glb-textures.py <eingabe.glb> <ausgabe.glb> [max_kante=1024]
Geometrie, Skin und Materialien bleiben unverändert; nur Bild-BufferViews werden ersetzt und alle Offsets neu gesetzt.
"""

import json
import struct
import sys

import cv2
import numpy as np


def read_glb(path):
    data = open(path, "rb").read()
    magic, version, _ = struct.unpack_from("<4sII", data, 0)
    assert magic == b"glTF" and version == 2, "keine glTF-2.0-GLB"
    jlen, jtype = struct.unpack_from("<I4s", data, 12)
    assert jtype == b"JSON"
    gltf = json.loads(data[20 : 20 + jlen])
    off = 20 + jlen
    blen, btype = struct.unpack_from("<I4s", data, off)
    assert btype == b"BIN\x00"
    return gltf, data[off + 8 : off + 8 + blen]


def write_glb(path, gltf, binary):
    js = json.dumps(gltf, separators=(",", ":")).encode()
    js += b" " * ((4 - len(js) % 4) % 4)
    binary += b"\x00" * ((4 - len(binary) % 4) % 4)
    total = 12 + 8 + len(js) + 8 + len(binary)
    with open(path, "wb") as f:
        f.write(struct.pack("<4sII", b"glTF", 2, total))
        f.write(struct.pack("<I4s", len(js), b"JSON") + js)
        f.write(struct.pack("<I4s", len(binary), b"BIN\x00") + binary)


def shrink(img_bytes, mime, max_edge):
    img = cv2.imdecode(np.frombuffer(img_bytes, np.uint8), cv2.IMREAD_UNCHANGED)
    if img is None:
        return img_bytes, mime
    h, w = img.shape[:2]
    scale = min(1.0, max_edge / max(h, w))
    if scale < 1.0:
        img = cv2.resize(img, (max(1, round(w * scale)), max(1, round(h * scale))), interpolation=cv2.INTER_AREA)
    has_alpha = img.ndim == 3 and img.shape[2] == 4 and int(img[:, :, 3].min()) < 255
    if has_alpha:
        ok, out = cv2.imencode(".png", img, [cv2.IMWRITE_PNG_COMPRESSION, 9])
        return (out.tobytes(), "image/png") if ok and len(out) < len(img_bytes) else (img_bytes, mime)
    if img.ndim == 3 and img.shape[2] == 4:
        img = img[:, :, :3]
    ok, out = cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, 88])
    return (out.tobytes(), "image/jpeg") if ok and len(out) < len(img_bytes) else (img_bytes, mime)


def main():
    src, dst = sys.argv[1], sys.argv[2]
    max_edge = int(sys.argv[3]) if len(sys.argv) > 3 else 1024
    gltf, binary = read_glb(src)
    replace = {}
    for image in gltf.get("images", []):
        if "bufferView" not in image:
            continue
        view = gltf["bufferViews"][image["bufferView"]]
        start = view.get("byteOffset", 0)
        new, mime = shrink(binary[start : start + view["byteLength"]], image.get("mimeType", ""), max_edge)
        replace[image["bufferView"]] = new
        image["mimeType"] = mime
    out = bytearray()
    for i, view in enumerate(gltf["bufferViews"]):
        start = view.get("byteOffset", 0)
        chunk = replace.get(i, binary[start : start + view["byteLength"]])
        out += b"\x00" * ((4 - len(out) % 4) % 4)  # 4-Byte-Ausrichtung für Accessoren
        view["byteOffset"] = len(out)
        view["byteLength"] = len(chunk)
        out += chunk
    gltf["buffers"][0]["byteLength"] = len(out)
    write_glb(dst, gltf, bytes(out))
    print(f"{src}: {len(binary) / 1e6:.2f} MB -> {dst}: {len(out) / 1e6:.2f} MB (Texturen max. {max_edge}px)")


if __name__ == "__main__":
    main()
