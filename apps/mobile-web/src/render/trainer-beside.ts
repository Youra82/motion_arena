import { LM, type Landmark } from "@motion-arena/shared";
import { toPx, type Fit, type Viewport } from "./draw";
import { trainerFlip } from "./facing";

/**
 * Kamera-Ansichten (Echtbild, Hybrid, Silhouette): Der Foto-Trainer steht im Bild neben dir – auf deiner Fußhöhe und
 * in deiner Körpergröße – und macht die Kniebeuge vor. Dieselbe Bildfolge wie in der Arena.
 */

interface PhotoMeta {
  frames: number[];
  size: [number, number];
  feetY: number;
  standPx: number;
  anchorX: number;
}

interface FrameSet {
  meta: PhotoMeta | null;
  images: HTMLImageElement[];
}

const sets = new Map<string, FrameSet>();

function frameSet(id: string): FrameSet {
  let set = sets.get(id);
  if (set) return set;
  const s: FrameSet = { meta: null, images: [] };
  sets.set(id, s);
  const base = `${import.meta.env.BASE_URL}arena/renders/${id}/`;
  void fetch(`${base}meta.json`)
    .then((r) => (r.ok ? (r.json() as Promise<PhotoMeta>) : null))
    .then((meta) => {
      if (!meta) return;
      s.images = meta.frames.map((f) => {
        const img = new Image();
        img.decoding = "async";
        img.src = `${base}squat_${String(f).padStart(3, "0")}.webp`;
        return img;
      });
      s.meta = meta;
    })
    .catch(() => {});
  return s;
}

/** Standhöhe der Person (Kopf–Fuß in Pixeln): Höchstwert der letzten 3 s, damit Kniebeugen den Trainer nicht schrumpfen. */
let stand: Array<{ at: number; px: number; foot: number }> = [];
/** Zuletzt bekannte Stelle neben der Person (falls sie kurz nicht erkannt wird). */
let lastSpot: { x: number; feetY: number; height: number } | null = null;

/**
 * `real` = Hintergrund ist dein echtes Kamerabild: dann Licht und Farbe des Trainers an das Bild anpassen, damit er
 * wirkt, als stünde er wirklich mit dir im Raum.
 */
export function drawTrainerBeside(ctx: CanvasRenderingContext2D, v: Viewport, f: Fit, pose: Landmark[] | null, trainerId: string, flex: number, now: number, real = false): void {
  const set = frameSet(trainerId);
  const meta = set.meta;
  if (!meta || !set.images.length) return;
  let best = 0;
  for (let i = 1; i < meta.frames.length; i++) if (Math.abs(meta.frames[i]! - flex) < Math.abs(meta.frames[best]! - flex)) best = i;
  const img = set.images[best];
  if (!img || !img.complete || !img.naturalWidth) return;

  let spot = lastSpot;
  const seen = (i: number) => pose?.[i] && pose[i]!.visibility >= 0.5 ? toPx(pose[i]!, v, f) : null;
  const nose = seen(LM.NOSE);
  const feet = [seen(LM.LEFT_ANKLE), seen(LM.RIGHT_ANKLE)].filter((p): p is [number, number] => !!p);
  // Sohle: Ferse/Zehen, falls erkannt – sonst Knöchel plus Knöchelhöhe (≈ 4 % der Körperhöhe)
  const soles = [seen(LM.LEFT_HEEL), seen(LM.RIGHT_HEEL), seen(LM.LEFT_FOOT_INDEX), seen(LM.RIGHT_FOOT_INDEX)].filter((p): p is [number, number] => !!p);
  const hips = [seen(LM.LEFT_HIP), seen(LM.RIGHT_HIP)].filter((p): p is [number, number] => !!p);
  const ankle = feet.length ? Math.max(...feet.map((p) => p[1])) : NaN;
  const px = nose ? (ankle - nose[1]) * 1.12 : NaN; // Nase→Knöchel ≈ 89 % der Körperhöhe
  // nur eine plausible, aufrechte Person übernehmen (Fehlerkennungen liefern sonst Füße über dem Kopf → negative Größe)
  if (nose && hips.length && px > f.dh * 0.12) {
    const footNow = soles.length ? Math.max(ankle, ...soles.map((p) => p[1])) : ankle + px * 0.04;
    // im Maßstab des aktuellen Bildzuschnitts merken – so passt es auch direkt nach einem Ansichtswechsel
    stand = [...stand.filter((s) => now - s.at < 3000), { at: now, px: px / f.dh, foot: (footNow - f.oy) / f.dh }];
    const height = Math.max(...stand.map((s) => s.px)) * f.dh;
    // Boden = tiefster Fußpunkt der letzten Sekunden (beim Springen bleibt der Trainer am Boden)
    const feetY = f.oy + Math.max(...stand.map((s) => s.foot)) * f.dh;
    const personX = hips.reduce((t, p) => t + p[0], 0) / hips.length;
    // Tatsächliche Ausdehnung des Trainerbilds links/rechts der Fußmitte (Bilder sind nicht mittig zugeschnitten;
    // gespiegelt tauschen die Seiten)
    const s = height / meta.standPx;
    const flipNow = trainerFlip(pose, v.mirror);
    const leftExt = (flipNow ? meta.size[0] - meta.anchorX : meta.anchorX) * s;
    const rightExt = meta.size[0] * s - leftExt;
    const margin = height * 0.03;
    const personHalf = height * 0.2; // halbe Körperbreite der Person
    // größtmöglicher Abstand der Fußmitten, ohne über den Bildrand zu ragen
    const room = (toRight: boolean) => (toRight ? v.cw - margin - rightExt - personX : personX - margin - leftExt);
    // kleinster Abstand, ohne die Person zu überdecken
    const clear = (toRight: boolean) => (toRight ? leftExt : rightExt) + personHalf;
    const fits = (toRight: boolean) => room(toRight) >= clear(toRight);
    // Seite: bevorzugt die, auf der der Trainer frei steht; sonst die mit mehr Platz
    const right = fits(true) && fits(false) ? room(true) >= room(false) : fits(true) || (!fits(false) && room(true) >= room(false));
    // gut ein Schritt Abstand (≈ 0,85 Körperhöhe), aber nur so weit, wie das Bild reicht
    const gap = Math.max(Math.min(height * 0.85, room(right)), Math.min(clear(right), room(right)));
    const x = right ? personX + gap : personX - gap;
    spot = { x, feetY, height };
    lastSpot = spot;
  }
  // noch keine Person erkannt: rechts im Kamerabild, in üblicher Größe
  if (!spot) spot = { x: f.ox + f.dw * 0.72, feetY: Math.min(v.ch * 0.86, f.oy + f.dh * 0.92), height: Math.min(v.ch * 0.5, f.dh * 0.62) };
  if (!(spot.height > 1) || !Number.isFinite(spot.x) || !Number.isFinite(spot.feetY)) return;

  const scale = spot.height / meta.standPx;
  const dw = meta.size[0] * scale;
  const dh = meta.size[1] * scale;

  // Bodenschatten: weicher Kontaktschatten unter den Füßen – der Trainer steht auf dem Boden, nicht davor
  ctx.save();
  ctx.translate(spot.x, spot.feetY);
  ctx.scale(1, 0.16);
  const r = spot.height * 0.3;
  const shade = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
  shade.addColorStop(0, "rgba(0,0,0,0.5)");
  shade.addColorStop(0.55, "rgba(0,0,0,0.22)");
  shade.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = shade;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Licht an das Bild anpassen: Helligkeit und Farbstich der Umgebung (alle ~0,5 s gemessen)
  const look = real ? lightOf(ctx, spot, now) : null;
  const person = prepared(img, dw, dh, look);
  // in dieselbe Richtung wie du ausrichten (Bild ggf. um die Fußmitte spiegeln)
  const flip = trainerFlip(pose, v.mirror);
  ctx.save();
  if (flip) {
    ctx.translate(spot.x, 0);
    ctx.scale(-1, 1);
    ctx.translate(-spot.x, 0);
  }
  if (look && "filter" in ctx) ctx.filter = `brightness(${look.brightness.toFixed(2)}) saturate(${look.saturate.toFixed(2)}) blur(${(spot.height / 900).toFixed(2)}px)`;
  ctx.drawImage(person, spot.x - meta.anchorX * scale, spot.feetY - meta.feetY * scale, dw, dh);
  ctx.restore();
}

interface Look {
  brightness: number;
  saturate: number;
  tint: [number, number, number];
}

let lastLook: { at: number; look: Look } | null = null;

/** Mittlere Helligkeit/Farbe des Kamerabilds rund um den Standplatz des Trainers. */
function lightOf(ctx: CanvasRenderingContext2D, spot: { x: number; feetY: number; height: number }, now: number): Look | null {
  if (lastLook && now - lastLook.at < 500) return lastLook.look;
  try {
    const w = Math.max(8, Math.round(spot.height * 0.6));
    const x = Math.max(0, Math.round(spot.x - w / 2));
    const y = Math.max(0, Math.round(spot.feetY - spot.height));
    const h = Math.max(8, Math.round(spot.height));
    const data = ctx.getImageData(x, y, Math.min(w, ctx.canvas.width - x), Math.min(h, ctx.canvas.height - y)).data;
    let r = 0, g = 0, b = 0, n = 0;
    for (let i = 0; i < data.length; i += 4 * 16) {
      r += data[i]!; g += data[i + 1]!; b += data[i + 2]!; n++;
    }
    if (!n) return null;
    r /= n; g /= n; b /= n;
    const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    // Studio-Bilder sind auf mittlere Helligkeit (~0,45) abgestimmt; dunkle Räume dunkeln den Trainer ab
    const look: Look = {
      brightness: Math.max(0.55, Math.min(1.2, 0.55 + lum * 1.0)),
      saturate: Math.max(0.75, Math.min(1.05, 0.8 + lum * 0.4)),
      tint: [r, g, b],
    };
    lastLook = { at: now, look };
    return look;
  } catch {
    return null;
  }
}

let tintCanvas: HTMLCanvasElement | null = null;

/**
 * Trainerbild aufbereiten: Freistellungskante ~1 px nach innen ziehen (die Renderbilder haben einen dunklen Saum,
 * der vor hellem Hintergrund wie ausgeschnitten aussieht) und im Echtbild leicht in den Farbstich des Raums tönen.
 */
function prepared(img: HTMLImageElement, dw: number, dh: number, look: Look | null): CanvasImageSource {
  if (typeof document === "undefined") return img;
  const w = Math.max(1, Math.round(dw));
  const h = Math.max(1, Math.round(dh));
  tintCanvas ??= document.createElement("canvas");
  const c = tintCanvas;
  if (c.width !== w || c.height !== h) {
    c.width = w;
    c.height = h;
  }
  const g = c.getContext("2d");
  if (!g) return img;
  g.globalCompositeOperation = "source-over";
  g.clearRect(0, 0, w, h);
  g.drawImage(img, 0, 0, w, h);
  // Kante erodieren: Alpha mit verschobenen Kopien multiplizieren (≈ Minimumfilter)
  const e = Math.max(1, Math.round(w / 260));
  g.globalCompositeOperation = "destination-in";
  for (const [x, y] of [[e, 0], [-e, 0], [0, e], [0, -e]] as const) g.drawImage(img, x, y, w, h);
  if (look) {
    g.globalCompositeOperation = "source-atop";
    g.globalAlpha = 0.14;
    g.fillStyle = `rgb(${look.tint.map((v) => Math.round(v)).join(",")})`;
    g.fillRect(0, 0, w, h);
    g.globalAlpha = 1;
  }
  g.globalCompositeOperation = "source-over";
  return c;
}
