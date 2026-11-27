"""Gerenderte Kniebeuge-Bilder für die App packen: gemeinsamer Zuschnitt, WebP mit Transparenz, Begleitdatei.

Aufruf: python tools/figuren/pack_frames.py <render-ordner> <ziel-ordner> [max_hoehe]
meta.json: frames (Tiefen in %), size (Breite/Höhe), feetY (Fußlinie von oben, px), standPx (Kopf bis Fuß im Stand),
anchorX (Fußmitte, px) – die Arena stellt das Bild damit maßstabsgetreu auf den Boden.
"""

import glob
import json
import os
import sys

import cv2
import numpy as np

src, dst = sys.argv[1], sys.argv[2]
max_h = int(sys.argv[3]) if len(sys.argv) > 3 else 900
files = sorted(glob.glob(os.path.join(src, "squat_*.png")))
imgs = [cv2.imread(f, cv2.IMREAD_UNCHANGED) for f in files]
union = np.zeros(imgs[0].shape[:2], bool)
for im in imgs:
    union |= im[:, :, 3] > 5
ys, xs = np.nonzero(union)
pad = 16
y0, y1 = max(0, ys.min() - pad), min(union.shape[0], ys.max() + pad)
x0, x1 = max(0, xs.min() - pad), min(union.shape[1], xs.max() + pad)
scale = min(1.0, max_h / (y1 - y0))
stand = imgs[0][:, :, 3] > 40
sy, sx = np.nonzero(stand)
feet_rows = sy >= sy.max() - 12
meta = {
    "frames": [int(os.path.basename(f)[6:9]) for f in files],
    "size": [round((x1 - x0) * scale), round((y1 - y0) * scale)],
    "feetY": round((sy.max() - y0) * scale, 1),
    "standPx": round((sy.max() - sy.min()) * scale, 1),
    "anchorX": round((float(np.median(sx[feet_rows])) - x0) * scale, 1),
}
os.makedirs(dst, exist_ok=True)
total = 0
for f, im in zip(files, imgs):
    crop = im[y0:y1, x0:x1]
    if scale < 1:
        crop = cv2.resize(crop, (meta["size"][0], meta["size"][1]), interpolation=cv2.INTER_AREA)
    out = os.path.join(dst, os.path.basename(f).replace(".png", ".webp"))
    cv2.imwrite(out, crop, [cv2.IMWRITE_WEBP_QUALITY, 86])
    total += os.path.getsize(out)
json.dump(meta, open(os.path.join(dst, "meta.json"), "w"), indent=1)
print(dst, meta, f"{total / 1e6:.2f} MB")
