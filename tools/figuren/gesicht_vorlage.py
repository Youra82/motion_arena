"""Gesichts-Werkstatt, Schritt 1: Gesichtspunkte der 15 Avatare aus dem Konzeptblatt lesen.

Aufruf (Python mit mediapipe, z. B. D:/tools/venv-figuren):
  python tools/figuren/gesicht_vorlage.py docs/references/avatars_15.png <modell.task> <ausgabe.json> [kontrollbild.jpg]
Ergebnis: je Avatar 478 Gesichtspunkte (normiert auf den Gesichtsausschnitt, x/y/z), Hautton, Haar- und Augenfarbe.
Zuordnung zu den Avataren nach Lage auf dem Blatt (Zeile, dann von links nach rechts) – wie die Nummern 01–15.
"""

import json
import sys

import cv2
import mediapipe as mp
import numpy as np
from mediapipe.tasks.python import BaseOptions
from mediapipe.tasks.python.vision import FaceLandmarker, FaceLandmarkerOptions

IDS = ["lukas", "elena", "ken", "mia", "david", "aiko", "viktor", "nova",
       "matteo", "raven", "finn", "sara", "leo", "zara", "echo"]
UP = 3  # hochskalieren: Gesichter sind auf dem Blatt nur ~60 px hoch


def main():
    sheet_path, model, out = sys.argv[1], sys.argv[2], sys.argv[3]
    check = sys.argv[4] if len(sys.argv) > 4 else None
    sheet = cv2.imread(sheet_path)
    big = cv2.resize(sheet, None, fx=UP, fy=UP, interpolation=cv2.INTER_CUBIC)
    opts = FaceLandmarkerOptions(base_options=BaseOptions(model_asset_path=model), num_faces=20,
                                 min_face_detection_confidence=0.3, min_face_presence_confidence=0.3)
    # Gesichtsmitten der 15 Karten auf dem Blatt (1672×941): obere Reihe 8, untere Reihe 7
    centres = [(122, 205), (333, 205), (545, 200), (735, 205), (955, 200), (1155, 210), (1345, 200), (1560, 205),
               (125, 600), (372, 605), (570, 600), (825, 605), (1065, 600), (1315, 605), (1555, 600)]
    ordered = []
    with FaceLandmarker.create_from_options(opts) as lm:
        for cx, cy in centres:
            r = 130
            x0, y0 = max(cx - r, 0), max(cy - r, 0)
            crop = big[y0 * UP:(cy + r) * UP, x0 * UP:(cx + r) * UP, ::-1]
            res = lm.detect(mp.Image(image_format=mp.ImageFormat.SRGB, data=np.ascontiguousarray(crop)))
            best = None
            for f in res.face_landmarks:
                pts = np.array([[p.x * crop.shape[1], p.y * crop.shape[0], p.z * crop.shape[1]] for p in f]) / UP + [x0, y0, 0]
                d = np.linalg.norm(pts[1, :2] - [cx, cy])
                if best is None or d < best[0]:
                    best = (d, pts)
            ordered.append(best[1] if best else None)
    top = [p for p in ordered[:8] if p is not None]
    bottom = [p for p in ordered[8:] if p is not None]
    print("Gesichter gefunden:", len(ordered), "(oben", len(top), "unten", len(bottom), ")")
    result = {}
    for avatar, pts in zip(IDS, ordered):
        if pts is None:
            print("KEIN GESICHT:", avatar)
            continue
        x0, y0 = pts[:, :2].min(0)
        x1, y1 = pts[:, :2].max(0)
        size = max(x1 - x0, y1 - y0)
        norm = (pts - [x0, y0, 0]) / size
        # Farben: Haut (Wangen), Haar (über der Stirn), Augen (Iris)
        def sample(ix, dy=0.0):
            p = pts[ix, :2] + [0, dy * size]
            xi, yi = int(round(p[0])), int(round(p[1]))
            patch = sheet[max(yi - 1, 0):yi + 2, max(xi - 1, 0):xi + 2].reshape(-1, 3)
            return [int(c) for c in np.median(patch, 0)[::-1]]
        result[avatar] = {
            "punkte": norm.round(5).tolist(),
            "haut": sample(205), "haut2": sample(425), "haar": sample(10, -0.12),
            "iris": sample(468) if len(pts) > 468 else sample(159),
            "groesse_px": round(float(size), 1),
        }
        if check is not None:
            for p in pts[:, :2]:
                cv2.circle(sheet, (int(p[0]), int(p[1])), 0, (0, 255, 0), -1)
            cv2.putText(sheet, avatar, (int(x0), int(y0) - 3), 0, 0.4, (0, 255, 255), 1)
    json.dump(result, open(out, "w", encoding="utf-8"))
    if check:
        cv2.imwrite(check, sheet)
    print("gespeichert:", out, list(result))


if __name__ == "__main__":
    main()
