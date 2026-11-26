import { LM, SKELETON_EDGES, type Landmark } from "@motion-arena/shared";
import { drawRoom, type RoomDef } from "./rooms";
import { drawAvatar, type AvatarDef } from "./avatars";
import type { ViewMode } from "../store";
import { bodyMesh, bodyShape, type Pt } from "./body-shapes";
import type { BodyLoadResult, LoadLevel, ZoneId } from "@motion-arena/motion-scoring";

export const COLORS = {
  background: "#101A1D",
  surface: "#1C2B30",
  surfaceRaised: "#26383D",
  text: "#F4F2EC",
  muted: "#A9B8BB",
  primary: "#FF704B",
  motion: "#47D4D0",
  success: "#41B883",
  warning: "#F2BC60",
};

export interface Viewport {
  cw: number;
  ch: number;
  /** Quellmaße (Video oder virtueller Demo-Rahmen). */
  sw: number;
  sh: number;
  mirror: boolean;
  /** cover = füllt den Schirm (beschneidet), contain = ganzes Quellbild sichtbar. */
  fit: "cover" | "contain";
}

export interface Fit {
  ox: number;
  oy: number;
  dw: number;
  dh: number;
}

export function coverFit(v: Viewport): Fit {
  const s = v.fit === "contain" ? Math.min(v.cw / v.sw, v.ch / v.sh) : Math.max(v.cw / v.sw, v.ch / v.sh);
  const dw = v.sw * s;
  const dh = v.sh * s;
  return { ox: (v.cw - dw) / 2, oy: (v.ch - dh) / 2, dw, dh };
}

export function toPx(p: Landmark, v: Viewport, f: Fit): [number, number] {
  const x = v.mirror ? 1 - p.x : p.x;
  return [f.ox + x * f.dw, f.oy + p.y * f.dh];
}

export interface RingState {
  depth: number | null;
  goodDepth: number;
  /** Zeitpunkt (ms) der letzten gezählten Wiederholung, für kurzes Aufleuchten. */
  repFlashAt: number;
  now: number;
}

export interface DrawInput {
  /** Trainingsraum als Hintergrund (Ansichten ohne Kamerabild); null = schlichter Verlauf. */
  room?: RoomDef | null;
  /** Avatar für die Ansicht „Avatar“. */
  avatar?: AvatarDef | null;
  ctx: CanvasRenderingContext2D;
  v: Viewport;
  mode: ViewMode;
  video: HTMLVideoElement | null;
  landmarks: Landmark[] | null;
  /** Eingefärbte Personenmaske (Türkis, transparent außerhalb der Person) oder null. */
  mask: HTMLCanvasElement | null;
  trail: Landmark[][];
  /** Körperanalyse (Muskelansicht) und Gelenkgeschwindigkeiten in m/s (Bewegungszonen). */
  bodyLoad?: BodyLoadResult | null;
  jointSpeeds?: ReadonlyMap<number, number> | null;
  ring: RingState;
}

const VIS = 0.5;

/**
 * Dynamische Raumbeleuchtung (Designsignatur): ruhige Grundstimmung, das Licht hebt sich etwas mit der
 * Beugetiefe und leuchtet nach einer gezählten Wiederholung kurz auf.
 */
function roomLight(ring: RingState): number {
  const flash = Math.exp(-Math.max(0, ring.now - ring.repFlashAt) / 600);
  const depth = ring.depth === null ? 0 : Math.max(0, Math.min(1, ring.depth / Math.max(0.01, ring.goodDepth)));
  return Math.min(1, 0.15 + depth * 0.25 + flash * 0.6);
}

function drawBackdrop(ctx: CanvasRenderingContext2D, v: Viewport): void {
  const g = ctx.createRadialGradient(v.cw / 2, v.ch * 0.45, 0, v.cw / 2, v.ch * 0.45, Math.max(v.cw, v.ch) * 0.75);
  g.addColorStop(0, "#1F3A40");
  g.addColorStop(1, COLORS.background);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, v.cw, v.ch);
}

function drawVideo(ctx: CanvasRenderingContext2D, video: HTMLVideoElement, v: Viewport, f: Fit, alpha = 1): void {
  ctx.save();
  ctx.globalAlpha = alpha;
  if (v.mirror) ctx.setTransform(-1, 0, 0, 1, v.cw, 0);
  ctx.drawImage(video, f.ox, f.oy, f.dw, f.dh);
  ctx.restore();
}

/** Zeichnet die fertig eingefärbte Personenmaske (vom Detektor) passend zum Kamerabild. */
function drawMask(ctx: CanvasRenderingContext2D, mask: HTMLCanvasElement, v: Viewport, f: Fit): void {
  ctx.save();
  if (v.mirror) ctx.setTransform(-1, 0, 0, 1, v.cw, 0);
  ctx.shadowColor = COLORS.motion;
  ctx.shadowBlur = 18;
  ctx.drawImage(mask, f.ox, f.oy, f.dw, f.dh);
  ctx.restore();
}

/** Bildmaßstab der Person: Oberschenkel + Schienbein der sichtbaren Beine (ändert sich beim Beugen kaum). */
function bodyScale(lms: Landmark[], v: Viewport, f: Fit): number {
  const legs = [
    [LM.LEFT_HIP, LM.LEFT_KNEE, LM.LEFT_ANKLE],
    [LM.RIGHT_HIP, LM.RIGHT_KNEE, LM.RIGHT_ANKLE],
  ].filter((ids) => ids.every((i) => lms[i]!.visibility >= VIS));
  if (!legs.length) {
    // Keine Beine erkannt: Maßstab aus dem Rumpf (Schulter- bis Hüftmitte ≈ 0,6 Beinlängen)
    const [s1, s2, h1, h2] = [LM.LEFT_SHOULDER, LM.RIGHT_SHOULDER, LM.LEFT_HIP, LM.RIGHT_HIP].map((i) => toPx(lms[i]!, v, f));
    const torso = Math.hypot((s1![0] + s2![0] - h1![0] - h2![0]) / 2, (s1![1] + s2![1] - h1![1] - h2![1]) / 2);
    return Math.max(20, Number.isFinite(torso) ? torso / 0.6 : 20);
  }
  const used = legs;
  const lens = used.map(([h, k, a]) => {
    const [hx, hy] = toPx(lms[h!]!, v, f);
    const [kx, ky] = toPx(lms[k!]!, v, f);
    const [ax, ay] = toPx(lms[a!]!, v, f);
    return Math.hypot(kx - hx, ky - hy) + Math.hypot(ax - kx, ay - ky);
  });
  return Math.max(20, lens.reduce((x, y) => x + y, 0) / lens.length);
}

function drawSkeleton(ctx: CanvasRenderingContext2D, lms: Landmark[], v: Viewport, f: Fit, alpha = 1, width = 4): void {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.lineCap = "round";
  for (const [a, b] of SKELETON_EDGES) {
    const pa = lms[a]!;
    const pb = lms[b]!;
    const ok = pa.visibility >= VIS && pb.visibility >= VIS;
    const [x1, y1] = toPx(pa, v, f);
    const [x2, y2] = toPx(pb, v, f);
    ctx.strokeStyle = ok ? COLORS.motion : "rgba(169,184,187,0.45)";
    ctx.setLineDash(ok ? [] : [6, 6]);
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }
  ctx.setLineDash([]);
  const nose = lms[LM.NOSE]!;
  if (nose.visibility >= VIS) {
    const [hx, hy] = toPx(nose, v, f);
    ctx.strokeStyle = COLORS.motion;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.arc(hx, hy, bodyScale(lms, v, f) * 0.11, 0, Math.PI * 2);
    ctx.stroke();
  }
  const joints = [11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28];
  for (const i of joints) {
    const p = lms[i]!;
    if (p.visibility < VIS) continue;
    const [x, y] = toPx(p, v, f);
    ctx.fillStyle = COLORS.text;
    ctx.beginPath();
    ctx.arc(x, y, width * 1.1, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** Einfacher Platzhalter-Avatar aus Kapseln (kein riggbares 3D-Modell). */
function drawAvatarPlaceholder(ctx: CanvasRenderingContext2D, lms: Landmark[], v: Viewport, f: Fit): void {
  const s = bodyScale(lms, v, f);
  const P = (i: number) => toPx(lms[i]!, v, f);
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  // Rumpf
  const torso = [P(LM.LEFT_SHOULDER), P(LM.RIGHT_SHOULDER), P(LM.RIGHT_HIP), P(LM.LEFT_HIP)];
  ctx.fillStyle = COLORS.surfaceRaised;
  ctx.strokeStyle = COLORS.primary;
  ctx.lineWidth = 2;
  ctx.beginPath();
  torso.forEach(([x, y], k) => (k ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  const limbs: Array<[number, number, number]> = [
    [LM.LEFT_HIP, LM.LEFT_KNEE, 0.12],
    [LM.LEFT_KNEE, LM.LEFT_ANKLE, 0.09],
    [LM.RIGHT_HIP, LM.RIGHT_KNEE, 0.12],
    [LM.RIGHT_KNEE, LM.RIGHT_ANKLE, 0.09],
    [LM.LEFT_SHOULDER, LM.LEFT_ELBOW, 0.075],
    [LM.LEFT_ELBOW, LM.LEFT_WRIST, 0.06],
    [LM.RIGHT_SHOULDER, LM.RIGHT_ELBOW, 0.075],
    [LM.RIGHT_ELBOW, LM.RIGHT_WRIST, 0.06],
  ];
  for (const [a, b, w] of limbs) {
    const [x1, y1] = P(a);
    const [x2, y2] = P(b);
    ctx.strokeStyle = COLORS.primary;
    ctx.lineWidth = s * w + 3;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.strokeStyle = COLORS.surfaceRaised;
    ctx.lineWidth = s * w;
    ctx.stroke();
  }
  const [nx, ny] = P(LM.NOSE);
  ctx.fillStyle = COLORS.surfaceRaised;
  ctx.strokeStyle = COLORS.primary;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(nx, ny, s * 0.13, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

/** Präzisionsring am Boden: Fortschritt der Beugetiefe, leuchtet bei gezählter Wiederholung. */
function drawPrecisionRing(ctx: CanvasRenderingContext2D, lms: Landmark[], v: Viewport, f: Fit, ring: RingState): void {
  // Nur zuverlässige Knöchel verwenden.
  const ankles = [lms[LM.LEFT_ANKLE]!, lms[LM.RIGHT_ANKLE]!].filter((p) => p.visibility >= VIS);
  if (!ankles.length) return;
  const pts = ankles.map((p) => toPx(p, v, f));
  const s = bodyScale(lms, v, f);
  const cx = pts.reduce((a, p) => a + p[0], 0) / pts.length;
  const cy = Math.max(...pts.map((p) => p[1])) + s * 0.08;
  const rx = s * 0.42;
  const ry = s * 0.085;
  const flash = Math.max(0, 1 - (ring.now - ring.repFlashAt) / 700);
  ctx.save();
  ctx.lineWidth = 5;
  ctx.strokeStyle = "rgba(244,242,236,0.18)";
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  ctx.stroke();
  const prog = ring.depth === null ? 0 : Math.min(1, Math.max(0, ring.depth / ring.goodDepth));
  if (prog > 0) {
    ctx.strokeStyle = COLORS.primary;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, Math.PI / 2, Math.PI / 2 + prog * Math.PI * 2);
    ctx.stroke();
  }
  if (flash > 0) {
    ctx.strokeStyle = `rgba(71,212,208,${flash})`;
    ctx.shadowColor = COLORS.motion;
    ctx.shadowBlur = 24 * flash;
    ctx.lineWidth = 6 + 6 * flash;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx * (1 + 0.15 * (1 - flash)), ry * (1 + 0.15 * (1 - flash)), 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

/** Farben der Beanspruchungsstufen (Muskelansicht, Körperschema). */
export const LEVEL_COLORS: Record<LoadLevel, string> = {
  gering: "#2E7F80",
  mittel: "#F2BC60",
  hoch: "#FF704B",
  unsicher: "#5D6B6E",
};

/** Zuordnung Körperteil → Zone (anatomische Seiten). */
const LIMB_ZONES: Array<[number, number, ZoneId, number]> = [
  [LM.LEFT_HIP, LM.LEFT_KNEE, "oberschenkelL", 0.13],
  [LM.LEFT_KNEE, LM.LEFT_ANKLE, "wadeL", 0.1],
  [LM.RIGHT_HIP, LM.RIGHT_KNEE, "oberschenkelR", 0.13],
  [LM.RIGHT_KNEE, LM.RIGHT_ANKLE, "wadeR", 0.1],
  [LM.LEFT_SHOULDER, LM.LEFT_ELBOW, "schulterL", 0.085],
  [LM.LEFT_ELBOW, LM.LEFT_WRIST, "armL", 0.07],
  [LM.RIGHT_SHOULDER, LM.RIGHT_ELBOW, "schulterR", 0.085],
  [LM.RIGHT_ELBOW, LM.RIGHT_WRIST, "armR", 0.07],
];

/** Muskelansicht: stilisierter Körper, Zonen nach geschätzter Beanspruchung eingefärbt. */
function drawMuscleView(ctx: CanvasRenderingContext2D, lms: Landmark[], load: BodyLoadResult | null, v: Viewport, f: Fit): void {
  const s = bodyScale(lms, v, f);
  const P = (i: number) => toPx(lms[i]!, v, f);
  const level = (z: ZoneId): LoadLevel => load?.zones[z]?.level ?? "unsicher";
  const paint = (z: ZoneId) => {
    const l = level(z);
    ctx.fillStyle = LEVEL_COLORS[l];
    ctx.strokeStyle = LEVEL_COLORS[l];
    ctx.shadowColor = LEVEL_COLORS[l];
    ctx.shadowBlur = l === "hoch" ? 22 : l === "mittel" ? 10 : 0;
    ctx.setLineDash(l === "unsicher" ? [6, 6] : []);
    ctx.globalAlpha = l === "unsicher" ? 0.55 : 0.92;
  };
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  // Rumpf
  paint("rumpf");
  ctx.beginPath();
  [P(LM.LEFT_SHOULDER), P(LM.RIGHT_SHOULDER), P(LM.RIGHT_HIP), P(LM.LEFT_HIP)].forEach(([x, y], k) =>
    k ? ctx.lineTo(x, y) : ctx.moveTo(x, y),
  );
  ctx.closePath();
  if (level("rumpf") === "unsicher") ctx.stroke();
  else ctx.fill();
  // Rumpf zusätzlich als Kapsel Schulter- zu Hüftmitte: bleibt auch in Seitenansicht sichtbar.
  {
    const [lsx, lsy] = P(LM.LEFT_SHOULDER);
    const [rsx, rsy] = P(LM.RIGHT_SHOULDER);
    const [lhx, lhy] = P(LM.LEFT_HIP);
    const [rhx, rhy] = P(LM.RIGHT_HIP);
    ctx.lineWidth = s * 0.22;
    ctx.beginPath();
    ctx.moveTo((lsx + rsx) / 2, (lsy + rsy) / 2);
    ctx.lineTo((lhx + rhx) / 2, (lhy + rhy) / 2);
    ctx.stroke();
  }
  // Gliedmaßen
  for (const [a, b, z, w] of LIMB_ZONES) {
    paint(z);
    const [x1, y1] = P(a);
    const [x2, y2] = P(b);
    ctx.lineWidth = s * w;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }
  // Gesäß/Hüfte als Kreise an den Hüftgelenken
  for (const [hip, z] of [[LM.LEFT_HIP, "gesaessL"], [LM.RIGHT_HIP, "gesaessR"]] as Array<[number, ZoneId]>) {
    paint(z);
    const [x, y] = P(hip);
    ctx.beginPath();
    ctx.arc(x, y, s * 0.11, 0, Math.PI * 2);
    if (level(z) === "unsicher") ctx.stroke();
    else ctx.fill();
  }
  // Kopf neutral
  ctx.setLineDash([]);
  ctx.shadowBlur = 0;
  ctx.globalAlpha = 0.9;
  ctx.fillStyle = COLORS.surfaceRaised;
  ctx.strokeStyle = COLORS.muted;
  ctx.lineWidth = 2;
  const [nx, ny] = P(LM.NOSE);
  ctx.beginPath();
  ctx.arc(nx, ny, s * 0.12, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

/** Farbe für Geschwindigkeit (m/s): Türkis (ruhig) → Gelb → Koralle (lebhaft). */
const NEUTRAL = "#5D6B6E";
let rmQuery: MediaQueryList | null | undefined;
function reducedMotion(): boolean {
  if (rmQuery === undefined) rmQuery = typeof matchMedia === "function" ? matchMedia("(prefers-reduced-motion: reduce)") : null;
  return !!rmQuery?.matches;
}

function speedColor(v: number): string {
  const t = Math.max(0, Math.min(1, v / 2));
  const lerp = (a: number, b: number, k: number) => Math.round(a + (b - a) * k);
  const [r, g, b] =
    t < 0.5
      ? [lerp(0x47, 0xf2, t * 2), lerp(0xd4, 0xbc, t * 2), lerp(0xd0, 0x60, t * 2)]
      : [lerp(0xf2, 0xff, (t - 0.5) * 2), lerp(0xbc, 0x70, (t - 0.5) * 2), lerp(0x60, 0x4b, (t - 0.5) * 2)];
  return `rgb(${r},${g},${b})`;
}

/** Bewegungszonen: Gliedmaßen nach Bewegungsgeschwindigkeit eingefärbt (Intensität, nicht Beanspruchung). */
function drawMotionZones(ctx: CanvasRenderingContext2D, lms: Landmark[], speeds: ReadonlyMap<number, number> | null, v: Viewport, f: Fit): void {
  const s = bodyScale(lms, v, f);
  // Noch keine gültige Geschwindigkeit (Start, Bildlücke): neutral grau statt "ruhig" (türkis).
  const unknown = !speeds || speeds.size === 0;
  const sp = (i: number) => speeds?.get(i) ?? 0;
  const color = (i: number) => (unknown ? NEUTRAL : speedColor(sp(i)));
  ctx.save();
  ctx.lineCap = "round";
  for (const [a, b] of SKELETON_EDGES) {
    const pa = lms[a]!;
    const pb = lms[b]!;
    if (pa.visibility < VIS || pb.visibility < VIS) continue;
    const [x1, y1] = toPx(pa, v, f);
    const [x2, y2] = toPx(pb, v, f);
    const g = ctx.createLinearGradient(x1, y1, x2, y2);
    g.addColorStop(0, color(a));
    g.addColorStop(1, color(b));
    ctx.strokeStyle = g;
    ctx.lineWidth = s * 0.06;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }
  for (const i of [13, 14, 15, 16, 25, 26, 27, 28]) {
    const p = lms[i]!;
    if (p.visibility < VIS) continue;
    const v2 = sp(i);
    if (v2 < 0.15) continue;
    const [x, y] = toPx(p, v, f);
    const r = s * (0.06 + Math.min(0.2, v2 * 0.08));
    const rg = ctx.createRadialGradient(x, y, 0, x, y, r);
    rg.addColorStop(0, speedColor(v2));
    rg.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = rg;
    ctx.globalAlpha = 0.85;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** Gittermodell: triangulierte Körperhülle aus den Gelenkpunkten. */
function drawWireframe(ctx: CanvasRenderingContext2D, lms: Landmark[], v: Viewport, f: Fit): void {
  const P = (i: number): Pt => toPx(lms[i]!, v, f);
  const shape = bodyShape(P, bodyScale(lms, v, f));
  const { points, triangles } = bodyMesh(shape);
  ctx.save();
  ctx.lineWidth = 1.2;
  ctx.strokeStyle = "rgba(71,212,208,0.75)";
  ctx.fillStyle = "rgba(71,212,208,0.06)";
  ctx.shadowColor = COLORS.motion;
  ctx.shadowBlur = 6;
  ctx.beginPath();
  for (const [a, b, c] of triangles) {
    const pa = points[a]!, pb = points[b]!, pc = points[c]!;
    ctx.moveTo(pa[0], pa[1]);
    ctx.lineTo(pb[0], pb[1]);
    ctx.lineTo(pc[0], pc[1]);
    ctx.closePath();
  }
  ctx.fill();
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.fillStyle = COLORS.text;
  for (const [x, y] of points) ctx.fillRect(x - 1, y - 1, 2, 2);
  ctx.restore();
}

let holoCanvas: HTMLCanvasElement | null = null;
/** Hologramm-Puffer in halber Auflösung (weich gezeichnet ohnehin) – viertelt die Pixelarbeit je Frame. */
const HOLO_SCALE = 0.5;
let scanPattern: CanvasPattern | null = null;

/** Füllt die stilisierte Körperform (für Hologramm ohne Kameramaske, z. B. Demo). */
function fillBodyShape(ctx: CanvasRenderingContext2D, lms: Landmark[], v: Viewport, f: Fit): void {
  const P = (i: number): Pt => toPx(lms[i]!, v, f);
  const s = bodyShape(P, bodyScale(lms, v, f));
  ctx.beginPath();
  s.torso.forEach(([x, y], k) => (k ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
  ctx.fill();
  ctx.lineCap = "round";
  for (const c of s.capsules) {
    ctx.lineWidth = c.r * 2;
    ctx.beginPath();
    ctx.moveTo(c.a[0], c.a[1]);
    ctx.lineTo(c.b[0], c.b[1]);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.arc(s.head.c[0], s.head.c[1], s.head.r, 0, Math.PI * 2);
  ctx.fill();
}

/** Hologramm: Körperform (Kameramaske oder stilisiert) mit Verlauf, Scanlines, Leuchten und Flimmern. */
function drawHologram(
  ctx: CanvasRenderingContext2D,
  lms: Landmark[] | null,
  mask: HTMLCanvasElement | null,
  v: Viewport,
  f: Fit,
  now: number,
): void {
  if (!lms && !mask) return;
  if (!holoCanvas) holoCanvas = document.createElement("canvas");
  const hw = Math.max(1, Math.round(v.cw * HOLO_SCALE));
  const hh = Math.max(1, Math.round(v.ch * HOLO_SCALE));
  if (holoCanvas.width !== hw || holoCanvas.height !== hh) {
    holoCanvas.width = hw;
    holoCanvas.height = hh;
  }
  const h = holoCanvas.getContext("2d")!;
  h.setTransform(1, 0, 0, 1, 0, 0);
  h.clearRect(0, 0, hw, hh);
  // 1. Form (in Vollbild-Koordinaten gezeichnet, Puffer verkleinert)
  h.save();
  h.scale(HOLO_SCALE, HOLO_SCALE);
  h.fillStyle = "#fff";
  h.strokeStyle = "#fff";
  if (mask) {
    if (v.mirror) h.setTransform(-HOLO_SCALE, 0, 0, HOLO_SCALE, hw, 0);
    h.drawImage(mask, f.ox, f.oy, f.dw, f.dh);
  } else if (lms) {
    fillBodyShape(h, lms, v, f);
  }
  h.restore();
  // 2. Farbverlauf + Scanlines nur innerhalb der Form
  h.save();
  h.globalCompositeOperation = "source-in";
  const g = h.createLinearGradient(0, 0, 0, hh);
  g.addColorStop(0, "rgba(140,245,240,0.95)");
  g.addColorStop(1, "rgba(30,150,170,0.55)");
  h.fillStyle = g;
  h.fillRect(0, 0, hw, hh);
  h.globalCompositeOperation = "destination-out";
  // Scanlines als einmal erzeugtes Muster statt hunderter Einzelrechtecke je Frame.
  if (!scanPattern) {
    const tile = document.createElement("canvas");
    tile.width = 1;
    tile.height = 3;
    const tc = tile.getContext("2d")!;
    tc.fillStyle = "rgba(0,0,0,0.55)";
    tc.fillRect(0, 0, 1, 1);
    scanPattern = h.createPattern(tile, "repeat");
  }
  const offset = reducedMotion() ? 0 : Math.floor(now / 40) % 3;
  if (scanPattern) {
    h.translate(0, offset);
    h.fillStyle = scanPattern;
    h.fillRect(0, -offset, hw, hh + 3);
  }
  h.restore();
  // 3. Auf die Szene: leuchtend, leicht flimmernd, gelegentlich ein verschobener Streifen
  // Bei "Bewegung reduzieren" (Systemeinstellung) ruhiges Hologramm ohne Flackern und Bildsprünge.
  const calm = reducedMotion();
  const flicker = calm ? 0.9 : 0.82 + 0.12 * Math.sin(now / 90) + (Math.random() < 0.03 ? -0.25 : 0);
  ctx.save();
  ctx.globalAlpha = Math.max(0.4, Math.min(1, flicker));
  ctx.globalCompositeOperation = "lighter";
  ctx.shadowColor = COLORS.motion;
  ctx.shadowBlur = 22;
  ctx.drawImage(holoCanvas, 0, 0, v.cw, v.ch);
  if (!calm && Math.random() < 0.06) {
    const y = Math.random() * v.ch;
    const sh = 6 + Math.random() * 18;
    ctx.drawImage(holoCanvas, 0, y * HOLO_SCALE, hw, sh * HOLO_SCALE, (Math.random() - 0.5) * 14, y, v.cw, sh);
  }
  ctx.restore();
  // Bodenreflexion
  if (lms) {
    const [, ay] = toPx(lms[LM.LEFT_ANKLE]!, v, f);
    const [cx] = toPx(lms[LM.LEFT_HIP]!, v, f);
    const s = bodyScale(lms, v, f);
    const rg = ctx.createRadialGradient(cx, ay + s * 0.08, 0, cx, ay + s * 0.08, s * 0.6);
    rg.addColorStop(0, "rgba(71,212,208,0.35)");
    rg.addColorStop(1, "rgba(71,212,208,0)");
    ctx.fillStyle = rg;
    ctx.fillRect(cx - s, ay - s * 0.2, s * 2, s * 0.6);
  }
}

/**
 * Szene für die Startseite: stilisierte Figur in der Kniebeuge mit Bewegungsspur und Präzisionsring.
 * poses: von alt (blass) nach aktuell; letzte Pose wird voll gezeichnet.
 */
export function drawHeroScene(ctx: CanvasRenderingContext2D, w: number, h: number, poses: Landmark[][]): void {
  const v: Viewport = { cw: w, ch: h, sw: w, sh: h, mirror: false, fit: "contain" };
  const f: Fit = { ox: 0, oy: 0, dw: w, dh: h };
  ctx.clearRect(0, 0, w, h);
  // Bewegungsspur: feine Umrisse früherer Posen (Motion-Spur)
  poses.slice(0, -1).forEach((p, k) => {
    ctx.save();
    ctx.globalAlpha = 0.12 + ((k + 1) / poses.length) * 0.3;
    ctx.strokeStyle = COLORS.primary;
    ctx.lineWidth = 1.5;
    const P = (i: number): Pt => toPx(p[i]!, v, f);
    const s = bodyShape(P, bodyScale(p, v, f));
    ctx.beginPath();
    s.torso.forEach(([x, y], j) => (j ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
    for (const c of s.capsules) {
      ctx.moveTo(c.a[0], c.a[1]);
      ctx.lineTo(c.b[0], c.b[1]);
    }
    ctx.moveTo(s.head.c[0] + s.head.r, s.head.c[1]);
    ctx.arc(s.head.c[0], s.head.c[1], s.head.r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  });
  const last = poses[poses.length - 1];
  if (!last) return;
  drawAvatarPlaceholder(ctx, last, v, f);
  drawPrecisionRing(ctx, last, v, f, { depth: 0.8, goodDepth: 0.85, repFlashAt: -1e9, now: 0 });
}

/**
 * Pose für die Darstellung absichern: fehlende/ungültige Punkte werden unsichtbar (werden dann ausgelassen).
 * Ohne brauchbaren Rumpf (Schultern + Hüften, nicht zusammengefallen) wird keine Figur gezeichnet.
 */
function usablePose(raw: Landmark[] | null, v: Viewport, f: Fit): Landmark[] | null {
  if (!raw) return null;
  const lms: Landmark[] = Array.from({ length: 33 }, (_, i) => {
    const p = raw[i];
    if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) return { x: 0, y: 0, z: 0, visibility: 0 };
    return { x: p.x, y: p.y, z: Number.isFinite(p.z) ? p.z : 0, visibility: Number.isFinite(p.visibility) ? p.visibility : 0 };
  });
  const core = [LM.LEFT_SHOULDER, LM.RIGHT_SHOULDER, LM.LEFT_HIP, LM.RIGHT_HIP];
  if (core.some((i) => raw[i] === undefined || !Number.isFinite(raw[i]!.x) || !Number.isFinite(raw[i]!.y))) return null;
  const [s1, s2, h1, h2] = core.map((i) => toPx(lms[i]!, v, f));
  const torso = Math.hypot((s1![0] + s2![0] - h1![0] - h2![0]) / 2, (s1![1] + s2![1] - h1![1] - h2![1]) / 2);
  return torso >= 4 ? lms : null;
}

export function drawFrame(d: DrawInput): void {
  const { ctx, v, mode, video } = d;
  const f = coverFit(v);
  const lms = usablePose(d.landmarks, v, f);
  ctx.clearRect(0, 0, v.cw, v.ch);

  const hasVideo = !!video && video.readyState >= 2;
  if ((mode === "echtbild" || mode === "hybrid") && hasVideo) drawVideo(ctx, video!, v, f);
  else if (d.room) drawRoom(ctx, d.room, v.cw, v.ch, roomLight(d.ring));
  else drawBackdrop(ctx, v);

  if (mode === "silhouette") {
    if (d.mask) drawMask(ctx, d.mask, v, f);
  }

  if (mode === "spur") {
    d.trail.forEach((t, k) => drawSkeleton(ctx, t, v, f, ((k + 1) / (d.trail.length + 1)) * 0.35, 3));
  }

  if (mode === "hologramm") drawHologram(ctx, lms, d.mask, v, f, d.ring.now);

  if (lms) {
    if (mode === "hybrid" || mode === "skelett" || mode === "spur") drawSkeleton(ctx, lms, v, f);
    if (mode === "gitter") drawWireframe(ctx, lms, v, f);
    if (mode === "muskel") drawMuscleView(ctx, lms, d.bodyLoad ?? null, v, f);
    if (mode === "zonen") drawMotionZones(ctx, lms, d.jointSpeeds ?? null, v, f);
    if (mode === "avatar") {
      if (d.avatar) drawAvatar(ctx, lms, (i) => toPx(lms[i]!, v, f), bodyScale(lms, v, f), d.avatar);
      else drawAvatarPlaceholder(ctx, lms, v, f);
    }
    if (mode === "silhouette" && !d.mask) drawSkeleton(ctx, lms, v, f, 0.8); // Maske noch nicht da / Demo
    drawPrecisionRing(ctx, lms, v, f, d.ring);
  }
}
