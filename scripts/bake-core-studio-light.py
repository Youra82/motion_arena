"""Approximate Core Studio's HDR illumination from the project's approved room image on CUDA."""

from pathlib import Path
from time import perf_counter

import cv2
import numpy as np
import torch
from PIL import Image
from torch.nn import functional as F

ROOT = Path(__file__).resolve().parents[1] / "apps/mobile-web/public/arena"
WIDTH, HEIGHT = 768, 384


def srgb_to_linear(rgb):
    return torch.where(rgb < 0.04045, rgb / 12.92, ((rgb + 0.055) / 1.055) ** 2.4)


def area_light(directions, center, width, height, color, intensity):
    aim = F.normalize(directions.new_tensor(center), dim=0)
    right = F.normalize(torch.linalg.cross(directions.new_tensor([0, 1, 0]), aim), dim=0)
    up = torch.linalg.cross(aim, right)
    front = directions @ aim
    dx = torch.atan2(directions @ right, front) / width
    dy = torch.atan2(directions @ up, front) / height
    falloff = torch.exp(-0.67 * (dx.abs() ** 4 + dy.abs() ** 4))
    return falloff[..., None] * directions.new_tensor(color) * intensity


def main():
    if not torch.cuda.is_available():
        raise SystemExit("A CUDA-enabled PyTorch runtime is needed to bake the arena light probe.")
    device = torch.device("cuda")
    started = perf_counter()
    with Image.open(ROOT / "concepts/core-studio.webp") as image:
        photo = np.array(image.convert("RGB"), dtype=np.float32) / 255
    image = srgb_to_linear(torch.from_numpy(photo).to(device)).permute(2, 0, 1).unsqueeze(0)
    latitude = (0.5 - (torch.arange(HEIGHT, device=device) + 0.5) / HEIGHT) * torch.pi
    longitude = ((torch.arange(WIDTH, device=device) + 0.5) / WIDTH - 0.5) * (2 * torch.pi)
    lat, lon = torch.meshgrid(latitude, longitude, indexing="ij")
    directions = torch.stack((lat.cos() * lon.cos(), lat.sin(), lat.cos() * lon.sin()), dim=-1)

    # Project the photographed part of the room towards the rear of the rendered stage.
    x, y, z = directions.unbind(dim=-1)
    axial = (-z).clamp(min=0.05)
    u, v = x / (1.18 * axial), (-y / axial - 0.10) / 0.67
    pixels = torch.stack((u, v), dim=-1).unsqueeze(0)
    room = F.grid_sample(image, pixels, mode="bilinear", align_corners=False)[0].permute(1, 2, 0)
    falloff = ((1.0 - torch.maximum(u.abs(), v.abs())) * 7).clamp(0, 1) * (-z * 6).clamp(0, 1)
    luma = room @ directions.new_tensor([0.2126, 0.7152, 0.0722])
    lift = 0.8 + 1.9 * luma ** 2
    floor = (-y).clamp(0, 1)[..., None]
    ambient = directions.new_tensor([0.073, 0.092, 0.129]) * (1 - floor * 0.55)
    ambient = ambient + floor * directions.new_tensor([0.078, 0.038, 0.018])
    radiance = ambient + room * (falloff * lift)[..., None]

    # Source shapes outside the camera's view complete the estimated room lighting.
    radiance += area_light(directions, [-0.89, 0.29, 0.36], 0.39, 0.65, [0.66, 0.83, 1.0], 1.74)
    radiance += area_light(directions, [-0.28, 0.91, 0.29], 0.71, 0.075, [1.0, 0.76, 0.49], 3.2)
    radiance += area_light(directions, [0.85, 0.32, -0.49], 0.085, 0.64, [1.0, 0.43, 0.095], 3.45)
    radiance += area_light(directions, [0.06, 0.27, 0.97], 0.66, 0.49, [0.87, 0.92, 1.0], 0.33)
    rgb = radiance.clamp(0, 16).cpu().numpy()
    destination = ROOT / "concepts/core-studio-light.hdr"
    if not cv2.imwrite(str(destination), np.ascontiguousarray(rgb[..., ::-1])):
        raise SystemExit(f"Could not write {destination}")
    print(f"{WIDTH} x {HEIGHT} HDR | {torch.cuda.get_device_name(device)} | {perf_counter() - started:.2f} s")


if __name__ == "__main__":
    main()
