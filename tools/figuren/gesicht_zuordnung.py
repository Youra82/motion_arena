"""Gesichts-Werkstatt, Schritt 3: MediaPipe-Gesichtspunkte (478) den Punkten des MakeHuman-Kopfes zuordnen.

Aufruf: python tools/figuren/gesicht_zuordnung.py <kopf.png> <standard.npy> <modell.task> <zuordnung.json> [kontrolle.jpg]
Auf dem frontalen Kopfbild des Standardkörpers werden die Gesichtspunkte erkannt; jeder bekommt den sichtbaren
(vordersten) Hautpunkt, der im Bild am nächsten liegt. Einmalig – die Topologie ist bei allen Körpern gleich.
"""

import json
import sys

import cv2
import mediapipe as mp
import numpy as np
from mediapipe.tasks.python import BaseOptions
from mediapipe.tasks.python.vision import FaceLandmarker, FaceLandmarkerOptions

sys.path.insert(0, __file__.rsplit("\\", 1)[0].rsplit("/", 1)[0])
from grundkoerper import laden  # noqa: E402

png, npy, model, out = sys.argv[1:5]
check = sys.argv[5] if len(sys.argv) > 5 else None
img = cv2.imread(png)
cam = json.load(open(png + ".json"))
verts = np.load(npy)
base = laden()
skin = sorted({i for f in base.faces for i in f})
head_ids = [i for i in skin if verts[i, 1] > base.j("neck")[1]]

opts = FaceLandmarkerOptions(base_options=BaseOptions(model_asset_path=model), num_faces=1)
with FaceLandmarker.create_from_options(opts) as lm:
    res = lm.detect(mp.Image(image_format=mp.ImageFormat.SRGB, data=np.ascontiguousarray(img[:, :, ::-1])))
if not res.face_landmarks:
    sys.exit("Kein Gesicht im Kopfbild erkannt")
size = cam["size"]
pts = np.array([[p.x * size, p.y * size] for p in res.face_landmarks[0]])
# MediaPipe-Messung des Standardkopfs (wie die Porträts: x/y in Pixel, z in Pixelbreite) – Bezug für die Anpassung
render_pts = [[p.x * size, p.y * size, p.z * size] for p in res.face_landmarks[0]]

# Kopfpunkte ins Bild projizieren (orthografisch, frontal)
V = verts[head_ids]
px = (V[:, 0] / 10 - cam["cx"]) / cam["scale"] * size + size / 2
py = -(V[:, 1] / 10 - cam["cz"]) / cam["scale"] * size + size / 2
depth = V[:, 2]
mapping = []
for x, y in pts:
    d = np.hypot(px - x, py - y)
    near = np.nonzero(d < 6)[0]
    if len(near) == 0:
        near = np.argsort(d)[:5]
    # vorderster der nahen Punkte (verdeckte Punkte am Hinterkopf ausschließen), dann der nächste
    front = near[depth[near] > depth[near].max() - 0.15]
    best = front[np.argmin(d[front])]
    mapping.append(int(head_ids[best]))
json.dump({"punkte": mapping, "standard_messung": render_pts}, open(out, "w"))
print("ZUORDNUNG", len(mapping), "Punkte,", len(set(mapping)), "verschiedene Kopfpunkte")
if check:
    for (x, y), v in zip(pts, mapping):
        cv2.circle(img, (int(x), int(y)), 2, (0, 255, 0), -1)
    cv2.imwrite(check, img)
