"""Erzeugt die fotografischen Arenahintergründe aus den lokalen CC0-Panoramen."""

from pathlib import Path

import cv2
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "assets-src/cc0"
DEST = ROOT / "apps/mobile-web/public/arena"


def tonemap(photo, exposure):
    photo = np.maximum(photo * exposure, 0)
    photo = np.clip(photo * (2.51 * photo + 0.03) / (photo * (2.43 * photo + 0.59) + 0.14), 0, 1)
    photo = np.where(photo < 0.0031308, 12.92 * photo, 1.055 * photo ** (1 / 2.4) - 0.055)
    return np.rint(photo * 255).astype("uint8")


def project(filename, target, yaw, exposure):
    panorama = cv2.imread(str(SOURCE / filename), cv2.IMREAD_UNCHANGED)
    if panorama is None:
        raise FileNotFoundError(filename)
    height, width = panorama.shape[:2]
    # Perspektivisches Bild, Kamera auf die Aufstellfläche geneigt.
    x, y = np.meshgrid(np.linspace(-1, 1, 1536), np.linspace(9 / 16, -9 / 16, 864))
    focal = 1 / np.tan(np.deg2rad(50))
    pitch = np.deg2rad(-24)
    dy = y * np.cos(pitch) + focal * np.sin(pitch)
    dz = focal * np.cos(pitch) - y * np.sin(pitch)
    longitude = np.arctan2(x, dz) + np.deg2rad(yaw)
    latitude = np.arctan2(dy, np.hypot(x, dz))
    u = ((longitude / (2 * np.pi) + 0.5) * width - 0.5) % width
    v = (0.5 - latitude / np.pi) * height - 0.5
    photo = cv2.remap(panorama, u.astype("float32"), v.astype("float32"), cv2.INTER_LINEAR, borderMode=cv2.BORDER_WRAP)
    # ACES-Filmkurve und sRGB-Übertragung in die Aufnahme für den 2D-Fallback einbacken.
    if not cv2.imwrite(str(DEST / f"{target}.jpg"), tonemap(photo, exposure), [cv2.IMWRITE_JPEG_QUALITY, 87]):
        raise OSError(f"JPG-Ausgabe fehlgeschlagen: {target}")
    # Lineares HDR für Bild und indirekte Beleuchtung im WebGL-Renderer.
    env = cv2.resize(panorama * exposure, (1024, 512), interpolation=cv2.INTER_AREA)
    if not cv2.imwrite(str(DEST / f"{target}.hdr"), env):
        raise OSError(f"HDR-Ausgabe fehlgeschlagen: {target}")


if __name__ == "__main__":
    DEST.mkdir(parents=True, exist_ok=True)
    project("photo_studio_loft_hall_2k.hdr", "loft", 57, 0.24)
    project("lebombo_2k.hdr", "lebombo", -91, 0.81)
