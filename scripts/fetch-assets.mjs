// Stellt MediaPipe-WASM und das Pose-Modell lokal bereit (kein CDN zur Laufzeit).
// WASM kommt aus node_modules, das Modell wird einmalig von Google geladen.
import { cpSync, existsSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pub = join(root, "apps/mobile-web/public");
const wasmSrc = join(root, "apps/mobile-web/node_modules/@mediapipe/tasks-vision/wasm");
const wasmDst = join(pub, "mediapipe/wasm");

const MODELS = {
  "pose_landmarker_lite.task":
    "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task",
  "pose_landmarker_full.task":
    "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/latest/pose_landmarker_full.task",
};

if (!existsSync(join(wasmDst, "vision_wasm_internal.wasm"))) {
  mkdirSync(wasmDst, { recursive: true });
  cpSync(wasmSrc, wasmDst, { recursive: true });
  console.log("[assets] MediaPipe-WASM kopiert");
}

const modelDir = join(pub, "models");
mkdirSync(modelDir, { recursive: true });
for (const [name, url] of Object.entries(MODELS)) {
  const dst = join(modelDir, name);
  if (existsSync(dst) && statSync(dst).size > 100_000) continue;
  console.log(`[assets] lade ${name} …`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Modell-Download fehlgeschlagen: ${res.status} ${url}`);
  writeFileSync(dst, Buffer.from(await res.arrayBuffer()));
  console.log(`[assets] ${name}: ${(statSync(dst).size / 1e6).toFixed(1)} MB`);
}
