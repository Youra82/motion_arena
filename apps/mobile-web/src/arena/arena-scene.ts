import { angleDeg, clamp, synthPose, toSquare } from "@motion-arena/pose-engine";
import { LM, type Landmark } from "@motion-arena/shared";
import { avatarById, drawAvatar } from "../render/avatars";
import { drawHologram, drawSkeleton, fillBodyShape, reducedMotion, toPx, usablePose, type Fit, type Viewport } from "../render/draw";
import { GUIDE_CYCLE_MS, squatFlex } from "./metrics";
import type { ArenaRoom } from "./rooms";
import type { ViewMode } from "../view-modes";
import type { RoomDef } from "../render/rooms";
import type { BodyLoadResult } from "@motion-arena/motion-scoring";

export interface ArenaFrame {
  v: Viewport;
  room: ArenaRoom;
  studioRoom?: RoomDef;
  /** Dein Avatar (id) – folgt deiner Bewegung, neben dem Trainer und in der Ansicht „Avatar“. */
  avatar?: string;
  /** Trainer-Avatar (id) – macht die Übung vor. */
  trainer?: string;
  mode?: ViewMode;
  pose: Landmark[] | null;
  worldPose?: Landmark[] | null;
  bodyLoad?: BodyLoadResult | null;
  speeds?: ReadonlyMap<number, number>;
  kneeAngle?: number | null;
  mask: HTMLCanvasElement | null;
  demo: boolean;
  /** Kniebeugen-Training: der Trainer steht in jeder Ansicht neben dir und macht vor. */
  squat?: boolean;
  now: number;
  activeMs: number;
  running: boolean;
  precision: number | null;
  capture?: boolean;
}

const TRAINER = { ...avatarById("lukas"), shorts: true };
const TRAINER_YAW = Math.PI / 5;

function studioBackdrop(ctx: CanvasRenderingContext2D, w: number, h: number, photo: HTMLImageElement | undefined): void {
  ctx.fillStyle = "#263235";
  ctx.fillRect(0, 0, w, h);
  if (photo?.naturalWidth) {
    const scale = Math.max(w / photo.naturalWidth, h / photo.naturalHeight);
    const dw = photo.naturalWidth * scale;
    const dh = photo.naturalHeight * scale;
    ctx.drawImage(photo, (w - dw) / 2, (h - dh) / 2, dw, dh);
  }
  const tint = ctx.createLinearGradient(0, 0, 0, h);
  tint.addColorStop(0, "rgba(18,25,27,.50)");
  tint.addColorStop(0.37, "rgba(20,30,31,.15)");
  tint.addColorStop(0.60, "rgba(16,30,33,.43)");
  tint.addColorStop(1, "rgba(12,22,24,.91)");
  ctx.fillStyle = tint;
  ctx.fillRect(0, 0, w, h);
}

function precisionRing(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, precision: number | null): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(1, 0.28);
  const glow = ctx.createRadialGradient(0, 0, radius * 0.35, 0, 0, radius * 1.5);
  glow.addColorStop(0, "rgba(57,234,226,0)");
  glow.addColorStop(0.6, "rgba(57,234,226,.30)");
  glow.addColorStop(1, "rgba(57,234,226,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(-radius * 1.5, -radius * 1.5, radius * 3, radius * 3);

  [1.17, 1.06, 0.88].forEach((factor) => {
    ctx.beginPath();
    ctx.arc(0, 0, radius * factor, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(173,255,247,.55)";
    ctx.lineWidth = radius * 0.013;
    ctx.stroke();
  });
  for (let i = 0; i < 16; i++) {
    const start = -Math.PI / 2 + (i * Math.PI) / 8;
    const active = precision !== null && i < Math.ceil(precision * 0.16);
    ctx.beginPath();
    ctx.arc(0, 0, radius, start, start + Math.PI / 8 - 0.035);
    ctx.strokeStyle = active ? (i < 9 ? "#84fff3" : "#ff933f") : "rgba(182,248,238,.38)";
    ctx.lineWidth = radius * 0.05;
    ctx.stroke();
  }
  ctx.restore();
}

function trainerPose(flex: number): Landmark[] {
  return synthPose({ kneeFlexDeg: flex, view: "front", aspect: 1, scale: 1, groundY: 1, noWorld: true })
    .landmarks.map((p) => ({ ...p, x: 0.5 + (p.x - 0.5) * Math.cos(TRAINER_YAW) + p.z * Math.sin(TRAINER_YAW) }));
}

/** Gemeinsame 2D-Ersatzszene für Handy und Fernseher, bis der 3D-Renderer verfügbar ist. */
export class ArenaScene {
  private photos = new Map<ArenaRoom, HTMLImageElement>();
  private trail: Array<{ pose: Landmark[]; fit: Fit; at: number }> = [];
  private nextTrail = 0;
  private playerHeight = 0;
  private demoFlex = 0;
  private lastPaint = -Infinity;
  private renderWidth = 0;
  private renderHeight = 0;

  reset(): void {
    this.trail = [];
    this.nextTrail = 0;
    this.playerHeight = 0;
    this.demoFlex = 0;
    this.lastPaint = -Infinity;
  }

  draw(ctx: CanvasRenderingContext2D, frame: ArenaFrame): void {
    const { v, room, pose, mask, demo, now, running, activeMs, precision } = frame;
    const { cw: w, ch: h } = v;
    if (w < 1 || h < 1) return;
    if (w !== this.renderWidth || h !== this.renderHeight) {
      this.reset();
      this.renderWidth = w;
      this.renderHeight = h;
    }
    if (now - this.lastPaint < 30) return;
    this.lastPaint = now;

    let photo = this.photos.get(room);
    if (!photo) {
      photo = new Image();
      photo.src = `${import.meta.env.BASE_URL}arena/${room}.jpg`;
      this.photos.set(room, photo);
    }
    studioBackdrop(ctx, w, h, photo);
    ctx.canvas.dataset.arena = photo.naturalWidth > 0 ? room : "lädt";

    const compact = w < h * 1.1;
    const playerX = w * (compact ? 0.26 : 0.39);
    const playerY = h * (compact ? 0.655 : 0.70);
    const trainerX = w * (compact ? 0.73 : 0.65);
    const trainerY = h * (compact ? 0.64 : 0.67);
    const height = Math.min(h * (compact ? 0.34 : 0.46), w * 0.58);
    const radius = Math.min(height * 0.43, w * (compact ? 0.20 : 0.125));
    precisionRing(ctx, playerX, playerY, radius, precision);

    if (demo && pose && running) {
      const point = (i: number) => toSquare(pose[i]!, v.sw / v.sh);
      const angle = frame.kneeAngle ?? angleDeg(point(LM.LEFT_HIP), point(LM.LEFT_KNEE), point(LM.LEFT_ANKLE), true);
      if (angle !== null) this.demoFlex = clamp(180 - angle, 0, 110);
    }
    const flex = demo ? this.demoFlex : squatFlex((activeMs % GUIDE_CYCLE_MS) / GUIDE_CYCLE_MS, 94);
    const trainer = trainerPose(flex);
    const trainerFit = { ox: trainerX - height / 2, oy: trainerY - height, dw: height, dh: height };
    const trainerView = { ...v, mirror: false };
    const paintTrainer = () => drawAvatar(ctx, trainer, (i) => toPx(trainer[i]!, trainerView, trainerFit), height * 0.52, TRAINER);
    ctx.save();
    ctx.translate(0, trainerY * 1.2);
    ctx.scale(1, -0.2);
    ctx.globalAlpha = 0.15;
    paintTrainer();
    ctx.restore();
    paintTrainer();

    const aspect = v.sw / v.sh;
    const sourceFit = { ox: 0, oy: 0, dw: aspect * height, dh: height };
    const player = usablePose(pose, v, sourceFit);
    const feet = player && [player[LM.LEFT_ANKLE]!, player[LM.RIGHT_ANKLE]!].filter((p) => p.visibility >= 0.5);
    const calm = reducedMotion();
    if (!player || !feet?.length || calm || !running) this.trail = [];
    if (!player || !feet?.length) return;
    const footX = feet.reduce((sum, p) => sum + (v.mirror ? 1 - p.x : p.x), 0) / feet.length;
    const footY = Math.max(...feet.map((p) => p.y));
    const nose = player[LM.NOSE]!;
    const observedHeight = clamp(footY - nose.y + 0.06, 0.16, 1);
    // Der Bezugsmaßstab bleibt beim Absenken erhalten; der Spieler schrumpft wie im Kamerabild.
    this.playerHeight = Math.max(observedHeight, this.playerHeight * 0.998);
    const dh = height / (demo ? 0.56 : this.playerHeight);
    const dw = dh * aspect;
    const playerFit = { ox: playerX - footX * dw, oy: playerY - footY * dh, dw, dh };

    this.trail = this.trail.filter(({ at }) => now - at < 520);
    this.trail.forEach((sample, index) => {
      const age = this.trail.length - index;
      const fit = { ...sample.fit, ox: sample.fit.ox - radius * 0.17 * age, oy: sample.fit.oy - radius * 0.05 * age };
      ctx.save();
      ctx.globalAlpha = 0.10;
      ctx.fillStyle = ctx.strokeStyle = "#5cf5e9";
      fillBodyShape(ctx, sample.pose, v, fit);
      ctx.restore();
      drawSkeleton(ctx, sample.pose, v, fit, 0.12, Math.max(1, h * 0.0016));
    });
    if (!calm && running && now >= this.nextTrail) {
      this.nextTrail = now + 125;
      this.trail.push({ pose: player, fit: playerFit, at: now });
      if (this.trail.length > 3) this.trail.shift();
    }
    drawHologram(ctx, player, mask, v, playerFit, now, true);
    drawSkeleton(ctx, player, v, playerFit, 0.88, Math.max(1.6, h * 0.0026));
  }
}
