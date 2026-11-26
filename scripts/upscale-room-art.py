"""Build sharp live backdrops from concept tiles using the Real-ESRGAN general model."""

from argparse import ArgumentParser
from pathlib import Path
from time import perf_counter

import numpy as np
import torch
from PIL import Image
from torch import nn, Tensor
from torch.nn import functional as F

CONCEPTS = Path(__file__).resolve().parents[1] / "apps/mobile-web/public/arena/concepts"
WIDE_ROOMS = {1, 2, 10, 14}
SCALE = 4


class RoomUpsampler(nn.Module):
    """VGG-style network compatible with the upstream general-x4v3 checkpoints."""

    def __init__(self):
        super().__init__()
        layers = [nn.Conv2d(3, 64, 3, padding=1), nn.PReLU(64)]
        for _ in range(32):
            layers.extend((nn.Conv2d(64, 64, 3, padding=1), nn.PReLU(64)))
        layers.append(nn.Conv2d(64, 3 * SCALE**2, 3, padding=1))
        self.body = nn.Sequential(*layers)

    def forward(self, rgb: Tensor) -> Tensor:
        residual = F.pixel_shuffle(self.body(rgb), SCALE)
        return residual + F.interpolate(rgb, scale_factor=SCALE, mode="nearest")


def main():
    parser = ArgumentParser(description=__doc__)
    parser.add_argument("weights", type=Path, help="Official realesr-general-wdn-x4v3.pth checkpoint")
    args = parser.parse_args()

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    checkpoint = torch.load(args.weights, map_location="cpu", weights_only=True)
    model = RoomUpsampler()
    model.load_state_dict(checkpoint["params_ema"] if "params_ema" in checkpoint else checkpoint["params"])
    model.eval().to(device)
    if device.type == "cuda":
        model.half()
    destination = CONCEPTS / "live"
    destination.mkdir(exist_ok=True)
    started = perf_counter()
    with torch.inference_mode():
        for tile in sorted((CONCEPTS / "rooms").glob("*.webp")):
            if int(tile.stem) in WIDE_ROOMS:
                continue
            with Image.open(tile) as image:
                rgb = torch.from_numpy(np.array(image.convert("RGB"))).permute(2, 0, 1).unsqueeze(0)
            rgb = rgb.to(device=device, dtype=next(model.parameters()).dtype).div_(255)
            # Pad the tile edges to stop reflections and bright fixtures from darkening against zero padding.
            pad = 10
            result = model(F.pad(rgb, (pad, pad, pad, pad), mode="reflect"))
            result = result[0, :, pad * SCALE : -pad * SCALE, pad * SCALE : -pad * SCALE]
            pixels = result.clamp_(0, 1).permute(1, 2, 0).mul_(255).round_().byte().cpu().numpy()
            Image.fromarray(pixels).save(destination / tile.name, quality=89)
    print(f"{len(list(destination.glob('*.webp')))} rooms, {device.type}, {perf_counter() - started:.1f} seconds")


if __name__ == "__main__":
    main()
