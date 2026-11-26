"""Bereitet eine Generator-Figur (Ara 3D Gen / MakeHuman CC0) für die App auf.

Aufruf: python scripts/finalize-avatar.py <ein.glb> <aus.glb> [--hair #rrggbb] [--outfit #rrggbb] [--max 1024]

Der Generator färbt Haare und Anzüge multiplikativ über die Textur – auf dunklen Texturen entsteht so kein Blond
oder Beere. Hier wird die Textur dieser Materialien in Graustufen (Helligkeit normiert) umgewandelt und die Zielfarbe
als baseColorFactor gesetzt. Alle Texturen werden auf max. Kantenlänge begrenzt.
"""
import argparse
import importlib.util
from pathlib import Path

import cv2
import numpy as np

spec = importlib.util.spec_from_file_location("shrink", Path(__file__).with_name("shrink-glb-textures.py"))
shrink_mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(shrink_mod)


def srgb_to_linear(hexcolor):
    c = np.array([int(hexcolor[i : i + 2], 16) for i in (1, 3, 5)], dtype=np.float64) / 255
    lin = np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)
    return [float(x) for x in lin] + [1.0]


def neutralize(img_bytes):
    """Textur → Graustufen mit Mittelwert ~0,82 (Details bleiben), Alphakanal unverändert."""
    img = cv2.imdecode(np.frombuffer(img_bytes, np.uint8), cv2.IMREAD_UNCHANGED)
    alpha = img[:, :, 3] if img.ndim == 3 and img.shape[2] == 4 else None
    bgr = img[:, :, :3] if img.ndim == 3 else cv2.cvtColor(img, cv2.COLOR_GRAY2BGR)
    lum = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY).astype(np.float64)
    mask = alpha > 32 if alpha is not None else np.ones_like(lum, bool)
    mean = lum[mask].mean() if mask.any() else lum.mean()
    lum = np.clip(lum * (209.0 / max(mean, 1.0)), 0, 255).astype(np.uint8)
    out = cv2.merge([lum, lum, lum] + ([alpha] if alpha is not None else []))
    ok, buf = cv2.imencode(".png", out, [cv2.IMWRITE_PNG_COMPRESSION, 9])
    return buf.tobytes()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("src")
    ap.add_argument("dst")
    ap.add_argument("--hair")
    ap.add_argument("--outfit")
    ap.add_argument("--max", type=int, default=1024)
    a = ap.parse_args()
    gltf, binary = shrink_mod.read_glb(a.src)
    targets = {"hair": a.hair, "outfit": a.outfit}
    replace = {}
    for mat in gltf.get("materials", []):
        key = mat.get("name", "").lower()
        color = targets.get(key)
        pbr = mat.get("pbrMetallicRoughness", {})
        if not color or "baseColorTexture" not in pbr:
            continue
        image = gltf["images"][gltf["textures"][pbr["baseColorTexture"]["index"]]["source"]]
        view = gltf["bufferViews"][image["bufferView"]]
        start = view.get("byteOffset", 0)
        replace[image["bufferView"]] = neutralize(binary[start : start + view["byteLength"]])
        image["mimeType"] = "image/png"
        pbr["baseColorFactor"] = srgb_to_linear(color)
    # umgefärbte Bilder einsetzen, danach alle Texturen begrenzen (über das Verkleinerungs-Skript)
    out = bytearray()
    for i, view in enumerate(gltf["bufferViews"]):
        start = view.get("byteOffset", 0)
        chunk = replace.get(i, binary[start : start + view["byteLength"]])
        out += b"\x00" * ((4 - len(out) % 4) % 4)
        view["byteOffset"], view["byteLength"] = len(out), len(chunk)
        out += chunk
    gltf["buffers"][0]["byteLength"] = len(out)
    tmp = a.dst + ".tmp.glb"
    shrink_mod.write_glb(tmp, gltf, bytes(out))
    import sys

    sys.argv = ["", tmp, a.dst, str(a.max)]
    shrink_mod.main()
    Path(tmp).unlink()


if __name__ == "__main__":
    main()
