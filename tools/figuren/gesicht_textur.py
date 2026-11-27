"""Gesichts-Werkstatt: hochgerechnetes Porträt auf den angepassten 3D-Kopf projizieren (Gesichtshaut-Textur).

Aufruf (venv mit mediapipe/scipy):
  python tools/figuren/gesicht_textur.py landmarks <hoch-ordner> <modell.task> <vorlage_hoch.json>
  python tools/figuren/gesicht_textur.py textur <id> <hoch-ordner> <kopf.npy> <zuordnung.json> <haut-name> <modell.task>

„landmarks“: 478 Gesichtspunkte je hochgerechnetem Porträt (für die Formanpassung, Format wie vorlage.json).
„textur“:   Hauttextur des Avatars mit projiziertem Gesicht → neues MakeHuman-Hautmaterial „ma_haut_<id>“.
Ablauf: Kopf (nach Formanpassung) per Ähnlichkeitstransformation + RBF-Feinverzerrung auf die Porträtpunkte legen;
je Hauttexel (UV-Raster der Kopfflächen) Porträtfarbe holen; Gewicht = Zuwendung zur Kamera × Gesichtsmaske;
Studiolicht grob herausrechnen; Körperhaut an den Gesichtston anpassen.
"""

import json
import os
import shutil
import sys

import cv2
import mediapipe as mp
import numpy as np
from mediapipe.tasks.python import BaseOptions
from mediapipe.tasks.python.vision import FaceLandmarker, FaceLandmarkerOptions
from scipy.interpolate import RBFInterpolator

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from grundkoerper import laden  # noqa: E402

USER = os.path.join(os.environ.get("APPDATA", ""), "Blender Foundation", "Blender", "4.5", "extensions", ".user",
                    "user_default", "mpfb", "data")
FACE_OVAL = [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176,
             149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109]
EYE_L = [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246]
EYE_R = [362, 382, 381, 380, 374, 373, 390, 249, 263, 466, 388, 387, 386, 385, 384, 398]
MOUTH_IN = [78, 95, 88, 178, 87, 14, 317, 402, 318, 324, 308, 415, 310, 311, 312, 13, 82, 81, 80, 191]


def detect(img, model):
    opts = FaceLandmarkerOptions(base_options=BaseOptions(model_asset_path=model), num_faces=1)
    with FaceLandmarker.create_from_options(opts) as lm:
        res = lm.detect(mp.Image(image_format=mp.ImageFormat.SRGB, data=np.ascontiguousarray(img[:, :, ::-1])))
    if not res.face_landmarks:
        return None
    h, w = img.shape[:2]
    return np.array([[p.x * w, p.y * h, p.z * w] for p in res.face_landmarks[0]])


def cmd_landmarks(folder, model, out):
    result = json.load(open(out, encoding="utf-8")) if os.path.isfile(out) else {}
    for f in sorted(os.listdir(folder)):
        if not f.endswith(".png") or "_" in f:
            continue
        avatar = f[:-4]
        pts = detect(cv2.imread(os.path.join(folder, f)), model)
        if pts is None:
            print("KEIN GESICHT", avatar)
            continue
        x0, y0 = pts[:, :2].min(0)
        size = np.ptp(pts[:, :2], 0).max()
        result[avatar] = {"punkte": ((pts - [x0, y0, 0]) / size).round(5).tolist()}
        print("PUNKTE", avatar)
    json.dump(result, open(out, "w", encoding="utf-8"))


def umeyama(src, dst):
    mu_s, mu_d = src.mean(0), dst.mean(0)
    a, b = src - mu_s, dst - mu_d
    u, sig, vt = np.linalg.svd(b.T @ a / len(src))
    d = np.sign(np.linalg.det(u @ vt))
    S = np.diag([1, 1, d])
    R = u @ S @ vt
    s = (sig * np.diag(S)).sum() / (a ** 2).sum(1).mean()
    return s, R, mu_d - s * R @ mu_s


def cmd_textur(avatar, folder, kopf_npy, zuordnung, haut, model):
    portrait = cv2.imread(os.path.join(folder, f"{avatar}.png"))
    H, W = portrait.shape[:2]
    L = detect(portrait, model)
    if L is None:
        sys.exit("Kein Gesicht im Porträt")
    b = laden()
    verts = np.load(kopf_npy)
    mapping = np.array(json.load(open(zuordnung))["punkte"])
    # Modell → Porträt: Ähnlichkeitstransformation in 3D (Bild-y nach unten, MediaPipe-z zur Kamera negativ)
    L3 = np.stack([L[:, 0], -L[:, 1], -L[:, 2]], 1)
    s, R, t = umeyama(verts[mapping], L3)
    P = (s * (R @ verts.T)).T + t
    proj = np.stack([P[:, 0], -P[:, 1]], 1)
    # Feinverzerrung: Restabweichung an den 478 Punkten weich auf alle Kopfpunkte übertragen
    # Ankerpunkte mit Restabweichung 0 auf einem Ring um das Gesicht: kein Überschwingen außerhalb des Ovals
    resid = L[:, :2] - proj[mapping]
    centre = L[FACE_OVAL, :2].mean(0)
    ring = centre + (L[FACE_OVAL, :2] - centre) * 1.35
    rbf = RBFInterpolator(np.vstack([proj[mapping], ring]), np.vstack([resid, np.zeros((len(ring), 2))]),
                          kernel="thin_plate_spline", smoothing=8.0)
    head = sorted({i for f in b.faces for i in f if b.verts[i, 1] > b.j("neck")[1] - 0.3})
    proj_head = proj[head] + rbf(proj[head])
    proj_all = proj.copy()
    proj_all[head] = proj_head
    nrm = (R @ b.normals.T).T  # Drehung reicht für die Zuwendung (Normalen des Grundkörpers)
    facing = np.clip((nrm[:, 2] - 0.25) / 0.45, 0, 1)
    # Gesichtsmaske im Porträt: Oval (leicht verkleinert, weicher Rand), ohne Augen und Mundinnenraum
    mask = np.zeros((H, W), np.uint8)
    cv2.fillPoly(mask, [L[FACE_OVAL, :2].astype(np.int32)], 255)
    mask = cv2.erode(mask, np.ones((31, 31), np.uint8))
    for ring in (EYE_L, EYE_R, MOUTH_IN):
        cv2.fillPoly(mask, [L[ring, :2].astype(np.int32)], 0)
    mask = cv2.GaussianBlur(mask, (0, 0), 22).astype(np.float32) / 255
    # Studiolicht grob herausrechnen: Bild / breite Unschärfe × mittlerer Hautton (Gesichtszüge bleiben)
    img = portrait.astype(np.float32) / 255
    cheeks = np.concatenate([img[int(L[i, 1]) - 4:int(L[i, 1]) + 4, int(L[i, 0]) - 4:int(L[i, 0]) + 4].reshape(-1, 3)
                             for i in (205, 425, 50, 280)])
    tone = np.median(cheeks, 0)
    # nur Helligkeit ausgleichen (Farbe bleibt, keine Farbsäume an Bart/Brauen), Verhältnis begrenzt
    face_w = np.ptp(L[FACE_OVAL, 0])
    lum = img @ np.array([0.114, 0.587, 0.299], np.float32)
    broad = cv2.GaussianBlur(lum, (0, 0), face_w * 0.18)
    gain = np.clip(float(tone @ np.array([0.114, 0.587, 0.299])) / np.maximum(broad, 1e-3), 0.7, 1.45)
    flat = np.clip(img * gain[..., None], 0, 1)
    # Hauttextur des Avatars
    src_dir = os.path.join(USER, "skins", haut)
    mhmat = os.path.join(src_dir, f"{haut}.mhmat")
    diffuse_name = next(l.split(None, 1)[1].strip() for l in open(mhmat, encoding="utf-8", errors="ignore")
                        if l.startswith("diffuseTexture"))
    skin = cv2.imread(os.path.join(src_dir, os.path.basename(diffuse_name))).astype(np.float32) / 255
    T = skin.shape[0]
    # UV-Raster der Kopfflächen: je Texel Porträtkoordinate und Gewicht interpolieren
    px = np.zeros((T, T, 2), np.float32)
    wt = np.zeros((T, T), np.float32)
    headset = set(head)
    for f, tuv in zip(b.faces, b.face_uvs):
        if not all(i in headset for i in f):
            continue
        for k in range(1, len(f) - 1):
            tri, uvi = (f[0], f[k], f[k + 1]), (tuv[0], tuv[k], tuv[k + 1])
            p = np.array([[b.uvs[u][0] * T, (1 - b.uvs[u][1]) * T] for u in uvi])
            x0, y0 = np.floor(p.min(0)).astype(int)
            x1, y1 = np.ceil(p.max(0)).astype(int)
            x0, y0, x1, y1 = max(x0, 0), max(y0, 0), min(x1, T - 1), min(y1, T - 1)
            if x1 < x0 or y1 < y0:
                continue
            gx, gy = np.meshgrid(np.arange(x0, x1 + 1) + 0.5, np.arange(y0, y1 + 1) + 0.5)
            (ax, ay), (bx, by), (cx, cy) = p
            den = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy)
            if abs(den) < 1e-12:
                continue
            l1 = ((by - cy) * (gx - cx) + (cx - bx) * (gy - cy)) / den
            l2 = ((cy - ay) * (gx - cx) + (ax - cx) * (gy - cy)) / den
            l3 = 1 - l1 - l2
            inside = (l1 >= -0.01) & (l2 >= -0.01) & (l3 >= -0.01)
            if not inside.any():
                continue
            Lb = np.stack([l1, l2, l3], -1)
            sl = (slice(y0, y1 + 1), slice(x0, x1 + 1))
            px[sl][inside] = (Lb @ proj_all[list(tri)])[inside]
            wt[sl][inside] = (Lb @ facing[list(tri)])[inside]
    sample = cv2.remap(flat, px[..., 0], px[..., 1], cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)
    msk = cv2.remap(mask, px[..., 0], px[..., 1], cv2.INTER_LINEAR, borderValue=0)
    alpha = np.clip(wt * msk, 0, 1)[..., None]
    alpha = cv2.GaussianBlur(alpha, (0, 0), 2)[..., None]
    # Körperhaut an den Gesichtston angleichen (sonst Farbsprung am Hals)
    face_region = alpha[..., 0] > 0.6
    if face_region.any():
        ratio = np.median(sample[face_region], 0) / np.maximum(np.median(skin[face_region], 0), 1e-3)
        skin = np.clip(skin * np.clip(ratio, 0.5, 1.8), 0, 1)
    out = skin * (1 - alpha) + sample * alpha
    name = f"ma_haut_{avatar}"
    dst = os.path.join(USER, "skins", name)
    os.makedirs(dst, exist_ok=True)
    for f in os.listdir(src_dir):
        if f.endswith((".png", ".jpg")) and f != os.path.basename(diffuse_name):
            shutil.copy(os.path.join(src_dir, f), os.path.join(dst, f))
    cv2.imwrite(os.path.join(dst, f"{name}_diffuse.png"), (out * 255).astype(np.uint8))
    lines = []
    for line in open(mhmat, encoding="utf-8", errors="ignore"):
        if line.startswith("diffuseTexture"):
            line = f"diffuseTexture {name}_diffuse.png\n"
        elif line.startswith("name "):
            line = f"name {name}\n"
        lines.append(line)
    open(os.path.join(dst, f"{name}.mhmat"), "w", encoding="utf-8").writelines(lines)
    cv2.imwrite(os.path.join(folder, f"{avatar}_textur.jpg"), cv2.resize((out * 255).astype(np.uint8), (1024, 1024)))
    print("HAUT", name, "Gesichtsanteil", round(float((alpha > 0.5).mean()), 4))


if __name__ == "__main__":
    if sys.argv[1] == "landmarks":
        cmd_landmarks(*sys.argv[2:5])
    else:
        cmd_textur(*sys.argv[2:8])
