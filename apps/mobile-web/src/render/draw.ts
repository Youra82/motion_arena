import { LM, SKELETON_EDGES, type Landmark } from "@motion-arena/shared";
import type { ViewMode } from "../store";

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
  ctx: CanvasRenderingContext2D;
  v: Viewport;
  mode: ViewMode;
  video: HTMLVideoElement | null;
  landmarks: Landmark[] | null;
  /** Eingefärbte Personenmaske (Türkis, transparent außerhalb der Person) oder null. */
  mask: HTMLCanvasElement | null;
  trail: Landmark[][];
  ring: RingState;
}

const VIS = 0.5;

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
  const used = legs.length ? legs : [[LM.LEFT_HIP, LM.LEFT_KNEE, LM.LEFT_ANKLE]];
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

export function drawFrame(d: DrawInput): void {
  const { ctx, v, mode, video, landmarks: lms } = d;
  const f = coverFit(v);
  ctx.clearRect(0, 0, v.cw, v.ch);

  const hasVideo = !!video && video.readyState >= 2;
  if ((mode === "echtbild" || mode === "hybrid") && hasVideo) drawVideo(ctx, video!, v, f);
  else drawBackdrop(ctx, v);

  if (mode === "silhouette") {
    if (d.mask) drawMask(ctx, d.mask, v, f);
  }

  if (mode === "spur") {
    d.trail.forEach((t, k) => drawSkeleton(ctx, t, v, f, ((k + 1) / (d.trail.length + 1)) * 0.35, 3));
  }

  if (lms) {
    if (mode === "hybrid" || mode === "skelett" || mode === "spur") drawSkeleton(ctx, lms, v, f);
    if (mode === "avatar") drawAvatarPlaceholder(ctx, lms, v, f);
    if (mode === "silhouette" && !d.mask) drawSkeleton(ctx, lms, v, f, 0.8); // Maske noch nicht da / Demo
    drawPrecisionRing(ctx, lms, v, f, d.ring);
  }
}
