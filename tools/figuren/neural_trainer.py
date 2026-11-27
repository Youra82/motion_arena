"""Neuronales Rendern: Cycles-Bilder des Trainers mit Stable Diffusion XL fotorealistisch nachzeichnen.

Aufruf (venv mit torch+diffusers): python tools/figuren/neural_trainer.py <render-ordner> <porträt.png> <ziel-ordner>
                                    "<beschreibung>" [stärke] [nur=squat_050.png,...]
3D liefert Pose, Licht, Kleidung und Umriss; SDXL (img2img, geringe Stärke) ersetzt Haut, Gesicht und Stoff durch
fotografische Details. IP-Adapter hält die Person aus dem hochgerechneten Konzeptporträt fest. Gleicher Startwert für
alle Bilder → gleichbleibendes Aussehen über die Bildfolge. Hintergrund bleibt transparent (Umriss aus dem Render).
Modelle: stabilityai/stable-diffusion-xl-base-1.0 (Open RAIL++-M), h94/IP-Adapter (Apache 2.0) – ohne Konto.
"""

import os
import sys

import cv2
import numpy as np
import torch
from diffusers import StableDiffusionXLImg2ImgPipeline
from PIL import Image


def main():
    src, portrait, dst, desc = sys.argv[1:5]
    strength = float(sys.argv[5]) if len(sys.argv) > 5 else 0.42
    only = sys.argv[6].split(",") if len(sys.argv) > 6 and sys.argv[6] else None
    os.makedirs(dst, exist_ok=True)
    pipe = StableDiffusionXLImg2ImgPipeline.from_pretrained(
        "stabilityai/stable-diffusion-xl-base-1.0", torch_dtype=torch.float16, variant="fp16", use_safetensors=True)
    pipe.load_ip_adapter("h94/IP-Adapter", subfolder="sdxl_models", weight_name="ip-adapter-plus-face_sdxl_vit-h.safetensors",
                         image_encoder_folder="models/image_encoder")
    pipe.set_ip_adapter_scale(0.68)  # Identität stärker binden (sonst wandern z. B. Haarfarben in tiefen Stufen)
    pipe.enable_model_cpu_offload()
    face = Image.open(portrait).convert("RGB")
    files = sorted(f for f in os.listdir(src) if f.endswith(".png") and (only is None or f in only))
    for f in files:
        rgba = cv2.imread(os.path.join(src, f), cv2.IMREAD_UNCHANGED)
        alpha = rgba[:, :, 3].astype(np.float32) / 255
        h, w = alpha.shape
        # auf neutralen Studiohintergrund legen, auf SDXL-Größe (Vielfaches von 64) bringen
        bg = np.full((h, w, 3), (38, 34, 32), np.float32)
        comp = rgba[:, :, :3] * alpha[..., None] + bg * (1 - alpha[..., None])
        W, H = 832, 1216
        comp_r = cv2.resize(comp.astype(np.uint8), (W, H), interpolation=cv2.INTER_CUBIC)
        init = Image.fromarray(comp_r[:, :, ::-1])
        prompt = (f"professional fitness photo of {desc}, performing a squat, full body, photorealistic, natural skin "
                  "texture, sharp focus, soft studio lighting, dark studio background, 50mm photo")
        neg = ("cartoon, 3d render, cgi, plastic skin, doll, blurry, deformed hands, extra limbs, extra fingers, "
               "text, watermark, oversaturated")
        gen = torch.Generator("cuda").manual_seed(1234)
        out = pipe(prompt=prompt, negative_prompt=neg, image=init, ip_adapter_image=face, strength=strength,
                   guidance_scale=5.5, num_inference_steps=40, generator=gen).images[0]
        res = cv2.resize(np.array(out)[:, :, ::-1], (w, h), interpolation=cv2.INTER_LANCZOS4)
        # Umriss aus dem Render (leicht geweitet), damit nichts vom generierten Hintergrund mitkommt
        a = cv2.GaussianBlur(cv2.dilate((alpha * 255).astype(np.uint8), np.ones((3, 3), np.uint8)), (3, 3), 0)
        cv2.imwrite(os.path.join(dst, f), np.dstack([res, a]))
        cv2.imwrite(os.path.join(dst, f.replace(".png", "_vorschau.jpg")), np.hstack([comp_r, cv2.resize(res, (W, H))]))
        print("NEURAL", f)


if __name__ == "__main__":
    main()
