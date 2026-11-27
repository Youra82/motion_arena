"""Gesichts-Werkstatt: Konzeptporträts lokal auf 1024 px hochrechnen (Stable Diffusion XL, img2img, RTX-Grafikkarte).

Aufruf (venv mit torch+diffusers): python tools/figuren/gesicht_hochrechnen.py <avatars_15.png> <zielordner> [ids] [stärke]
Der Gesichtsausschnitt wird erst vergrößert und dann mit geringer Stärke nachgezeichnet: Person und Licht bleiben,
Haut, Augen und Haare bekommen fotografische Details. Modell: stabilityai/stable-diffusion-xl-base-1.0
(CreativeML Open RAIL++-M – Nutzung der Ergebnisse erlaubt), Download ohne Konto nach HF_HOME.
"""

import os
import sys

import cv2
import numpy as np
import torch
from diffusers import StableDiffusionXLImg2ImgPipeline
from PIL import Image

CENTRES = {"lukas": (122, 205), "elena": (333, 205), "ken": (545, 200), "mia": (735, 205), "david": (955, 200),
           "aiko": (1155, 210), "viktor": (1345, 200), "nova": (1560, 205), "matteo": (125, 600), "raven": (372, 605),
           "finn": (570, 600), "sara": (825, 605), "leo": (1065, 600), "zara": (1315, 605), "echo": (1555, 600)}
BESCHREIBUNG = {
    "lukas": "fit athletic man about 30, short dark brown hair, light stubble beard, caucasian",
    "elena": "fit athletic woman about 28, dark brown hair in a ponytail, light olive skin",
    "ken": "fit athletic asian man about 25, black hair with headband",
    "mia": "fit athletic woman about 26, blond hair in a high messy bun, smiling",
    "david": "muscular black man about 35, bald head, short black beard",
    "aiko": "fit athletic east asian woman about 27, black hair in a bun",
    "viktor": "fit man about 55, grey hair, short grey beard",
    "nova": "fit athletic woman about 28, red hair in a braid, freckles",
    "matteo": "fit mediterranean man about 30, curly dark hair, friendly smile",
    "raven": "fit athletic woman about 27, black hair with blunt bangs, neck tattoo",
    "finn": "fit athletic man about 28, light brown short hair, clean shaven",
    "sara": "fit athletic woman about 30, blond hair in a braid, smiling",
    "leo": "fit athletic man about 32, dark short hair, full dark beard",
    "zara": "fit athletic black woman about 26, curly dark hair in a ponytail, smiling",
    "echo": "fit athletic asian man about 28, black spiky hair",
}
R = 92  # halbe Kantenlänge des Ausschnitts auf dem Blatt (Kopf mit Haaren)


def main():
    sheet = cv2.imread(sys.argv[1])
    out = sys.argv[2]
    ids = sys.argv[3].split(",") if len(sys.argv) > 3 and sys.argv[3] else list(CENTRES)
    strength = float(sys.argv[4]) if len(sys.argv) > 4 else 0.38
    os.makedirs(out, exist_ok=True)
    pipe = StableDiffusionXLImg2ImgPipeline.from_pretrained(
        "stabilityai/stable-diffusion-xl-base-1.0", torch_dtype=torch.float16, variant="fp16", use_safetensors=True)
    pipe.enable_model_cpu_offload()  # passt so in 8 GB Grafikspeicher
    for avatar in ids:
        cx, cy = CENTRES[avatar]
        crop = sheet[cy - R:cy + R, cx - R:cx + R]
        big = cv2.resize(crop, (1024, 1024), interpolation=cv2.INTER_LANCZOS4)
        init = Image.fromarray(big[:, :, ::-1])
        prompt = (f"professional studio portrait photo of a {BESCHREIBUNG[avatar]}, looking at camera, "
                  "detailed natural skin texture with pores, sharp eyes, soft studio light, 85mm lens, high detail")
        neg = "cartoon, painting, illustration, 3d render, blurry, deformed, extra eyes, plastic skin, oversaturated"
        gen = torch.Generator("cuda").manual_seed(7)
        img = pipe(prompt=prompt, negative_prompt=neg, image=init, strength=strength, guidance_scale=6.0,
                   num_inference_steps=40, generator=gen).images[0]
        img.save(os.path.join(out, f"{avatar}.png"))
        cv2.imwrite(os.path.join(out, f"{avatar}_vorlage.png"), big)
        print("HOCHGERECHNET", avatar)


if __name__ == "__main__":
    main()
