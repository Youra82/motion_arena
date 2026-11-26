"""Figuren-Standbilder freistellen: aus Schwarz- und Weiß-Render die exakte Deckkraft berechnen.

Bei gleichem Bild vor Schwarz (B) und Weiß (W) gilt je Pixel: W - B = 1 - Deckkraft, Farbe = B / Deckkraft.
So entstehen saubere, halbtransparente Kanten (Haare, Finger) ohne Farbsaum.
Aufruf: python scripts/matte-menu-figures.py   (liest assets-src/menu-figures-raw, schreibt public/menu/figures/*.webp)
"""

import glob
import os

import cv2
import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(ROOT, "assets-src", "menu-figures-raw")
OUT = os.path.join(ROOT, "apps", "mobile-web", "public", "menu", "figures")


def main():
    os.makedirs(OUT, exist_ok=True)
    for black_path in sorted(glob.glob(os.path.join(RAW, "*-black.png"))):
        name = os.path.basename(black_path)[: -len("-black.png")]
        b = cv2.imread(black_path).astype(np.float32) / 255
        w = cv2.imread(black_path.replace("-black.png", "-white.png")).astype(np.float32) / 255
        alpha = np.clip(1 - (w - b).mean(axis=2), 0, 1)
        color = np.where(alpha[..., None] > 1e-3, b / np.maximum(alpha[..., None], 1e-3), 0)
        rgba = np.dstack([np.clip(color, 0, 1), alpha])
        # auf die Figur zuschneiden (mit Rand), Höhe einheitlich
        ys, xs = np.nonzero(alpha > 0.02)
        y0, y1 = max(0, ys.min() - 12), min(alpha.shape[0], ys.max() + 12)
        x0, x1 = max(0, xs.min() - 12), min(alpha.shape[1], xs.max() + 12)
        crop = (rgba[y0:y1, x0:x1] * 255).round().astype(np.uint8)
        h = 720
        crop = cv2.resize(crop, (max(1, round(crop.shape[1] * h / crop.shape[0])), h), interpolation=cv2.INTER_AREA)
        path = os.path.join(OUT, f"{name}.webp")
        cv2.imwrite(path, crop, [cv2.IMWRITE_WEBP_QUALITY, 88])
        print(f"{path}: {crop.shape[1]}x{crop.shape[0]}, {os.path.getsize(path) // 1024} KB")


if __name__ == "__main__":
    main()
