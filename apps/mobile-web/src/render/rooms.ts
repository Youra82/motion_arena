/**
 * Die 20 Trainingsräume teilen ihre Motive mit dem Studio-Katalog. Während ein Motiv lädt oder offline noch nicht
 * vorliegt, zeichnet Canvas eine lokale Ersatzkulisse. Die Lichtreaktion folgt den Trainingsphasen.
 */
import { conceptImage, drawCover, roomBackdrop } from "./concept-art";

export type SceneKind =
  | "studio"
  | "mountains"
  | "beach"
  | "skyline"
  | "zen"
  | "forest"
  | "ice"
  | "lava"
  | "space"
  | "ocean"
  | "graffiti"
  | "lodge"
  | "desert"
  | "neon"
  | "stadium"
  | "waterfall"
  | "snow"
  | "cage"
  | "lab"
  | "sunrise";

export interface RoomDef {
  id: string;
  nr: number;
  name: string;
  focus: string;
  scene: SceneKind;
  /** Himmel/Wand oben → unten. */
  sky: [string, string];
  /** Boden hinten → vorne. */
  floor: [string, string];
  /** Lichtfarbe (Lichtleisten, Raumbeleuchtung). */
  light: string;
}

export const ROOMS: RoomDef[] = [
  { id: "core-studio", nr: 1, name: "Core Studio", focus: "Kraft · Stabilität", scene: "studio", sky: ["#1b2326", "#2a3236"], floor: ["#2b2f31", "#121618"], light: "#FF8A4B" },
  { id: "mountain-arena", nr: 2, name: "Mountain Arena", focus: "Ausdauer · Intervall", scene: "mountains", sky: ["#7fa6c4", "#d9e4ea"], floor: ["#5a4636", "#2a1f17"], light: "#FFB46B" },
  { id: "beach-bootcamp", nr: 3, name: "Beach Bootcamp", focus: "Cardio · HIIT", scene: "beach", sky: ["#3b4f86", "#f59a5b"], floor: ["#7a5a3e", "#3b2a1c"], light: "#FFC27A" },
  { id: "urban-roof", nr: 4, name: "Urban Roof", focus: "Functional · Cardio", scene: "skyline", sky: ["#0d1630", "#2c3f6e"], floor: ["#2a2f38", "#101318"], light: "#FFD08A" },
  { id: "zen-studio", nr: 5, name: "Zen Studio", focus: "Mobilität · Regeneration", scene: "zen", sky: ["#3a3029", "#5a4a3e"], floor: ["#6b5240", "#2e2219"], light: "#FFC98F" },
  { id: "forest-trail", nr: 6, name: "Forest Trail", focus: "Ausdauer · Beweglichkeit", scene: "forest", sky: ["#9cc28a", "#3d5a35"], floor: ["#5b4632", "#271c13"], light: "#FFE6A3" },
  { id: "ice-lab", nr: 7, name: "Ice Lab", focus: "Fokus · Körperkontrolle", scene: "ice", sky: ["#0b1d33", "#1d4466"], floor: ["#c9e4f2", "#4c7590"], light: "#7FD8FF" },
  { id: "lava-chamber", nr: 8, name: "Lava Chamber", focus: "Power · Explosivität", scene: "lava", sky: ["#1a0b08", "#3a120a"], floor: ["#2a1410", "#0d0605"], light: "#FF5A1F" },
  { id: "space-station", nr: 9, name: "Space Station", focus: "Balance · Core", scene: "space", sky: ["#02040c", "#0b1430"], floor: ["#2c3440", "#0f131a"], light: "#8FD3FF" },
  { id: "ocean-deck", nr: 10, name: "Ocean Deck", focus: "Atmung · Flow", scene: "ocean", sky: ["#0a3b5c", "#0b6f8f"], floor: ["#2a4b5a", "#0c1c24"], light: "#6FE6FF" },
  { id: "city-gym", nr: 11, name: "City Gym", focus: "Street Fitness", scene: "graffiti", sky: ["#1c1f24", "#2b2f36"], floor: ["#34373b", "#141618"], light: "#7AF0FF" },
  { id: "alpine-lodge", nr: 12, name: "Alpine Lodge", focus: "Ganzkörper", scene: "lodge", sky: ["#3b2618", "#5a3b25"], floor: ["#6e4b30", "#2c1c11"], light: "#FFB060" },
  { id: "desert-camp", nr: 13, name: "Desert Camp", focus: "Cardio · Ausdauer", scene: "desert", sky: ["#5d6fa3", "#f3b27a"], floor: ["#8a6a48", "#3a2b1c"], light: "#FFC685" },
  { id: "neon-arena", nr: 14, name: "Neon Arena", focus: "Reaktion · Koordination", scene: "neon", sky: ["#08030f", "#170a26"], floor: ["#140b1e", "#05030a"], light: "#FF3FD0" },
  { id: "stadium-circle", nr: 15, name: "Stadium Circle", focus: "Challenges · Performance", scene: "stadium", sky: ["#05080f", "#141c2a"], floor: ["#1d2733", "#0a0e14"], light: "#FFB347" },
  { id: "waterfall-oasis", nr: 16, name: "Waterfall Oasis", focus: "Regeneration · Mobility", scene: "waterfall", sky: ["#1f4a2c", "#2f6b3e"], floor: ["#3d4a3a", "#151c14"], light: "#BFFFE0" },
  { id: "nordic-field", nr: 17, name: "Nordic Field", focus: "Kondition", scene: "snow", sky: ["#8fb1d6", "#f6d7b8"], floor: ["#e8eef4", "#9fb3c6"], light: "#FFE2B8" },
  { id: "fight-arena", nr: 18, name: "Fight Arena", focus: "Kontaktlose Kampf-Fitness", scene: "cage", sky: ["#0a0a0c", "#1a1a1f"], floor: ["#202024", "#0b0b0d"], light: "#FF3B3B" },
  { id: "futuristic-lab", nr: 19, name: "Futuristic Lab", focus: "Körperanalyse", scene: "lab", sky: ["#06121c", "#0d2536"], floor: ["#13222e", "#060c12"], light: "#47D4D0" },
  { id: "sunrise-deck", nr: 20, name: "Sunrise Deck", focus: "Stretching · Entspannung", scene: "sunrise", sky: ["#2e3f73", "#ffb36b"], floor: ["#7b5838", "#33241a"], light: "#FFD29A" },
];

export const DEFAULT_ROOM = "core-studio";
export const isRoomId = (id: unknown): id is string => typeof id === "string" && ROOMS.some((r) => r.id === id);
export const roomById = (id: string | null | undefined): RoomDef => ROOMS.find((r) => r.id === id) ?? ROOMS[0]!;

/** Deterministischer Zufall je Raum (gleiche Szene bei jedem Zeichnen). */
export function seededRandom(seed: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Horizont (Übergang Wand/Boden) als Anteil der Höhe. */
export const HORIZON = 0.62;

type C = CanvasRenderingContext2D;

function vGrad(ctx: C, y0: number, y1: number, stops: Array<[number, string]>): CanvasGradient {
  const g = ctx.createLinearGradient(0, y0, 0, y1);
  for (const [o, c] of stops) g.addColorStop(o, c);
  return g;
}

function glow(ctx: C, x: number, y: number, r: number, color: string, alpha: number): void {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, withAlpha(color, alpha));
  g.addColorStop(1, withAlpha(color, 0));
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
}

/** "#rrggbb" + Deckkraft → rgba(). */
export function withAlpha(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${Math.max(0, Math.min(1, a))})`;
}

function mountains(ctx: C, w: number, base: number, height: number, color: string, rnd: () => number, snow = false): void {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, base);
  const peaks: Array<[number, number]> = [];
  let x = -w * 0.05;
  while (x < w * 1.05) {
    const px = x + w * (0.08 + rnd() * 0.12);
    const py = base - height * (0.45 + rnd() * 0.55);
    peaks.push([px, py]);
    ctx.lineTo(px, py);
    x = px + w * (0.06 + rnd() * 0.1);
    ctx.lineTo(x, base - height * (0.1 + rnd() * 0.3));
  }
  ctx.lineTo(w, base);
  ctx.closePath();
  ctx.fill();
  if (snow) {
    ctx.fillStyle = "rgba(245,248,252,0.85)";
    for (const [px, py] of peaks) {
      const s = height * 0.18;
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(px - s * 0.7, py + s);
      ctx.lineTo(px - s * 0.2, py + s * 0.8);
      ctx.lineTo(px + s * 0.1, py + s * 1.05);
      ctx.lineTo(px + s * 0.7, py + s);
      ctx.closePath();
      ctx.fill();
    }
  }
}

function pine(ctx: C, x: number, base: number, h: number, color: string): void {
  ctx.fillStyle = color;
  for (let k = 0; k < 3; k++) {
    const top = base - h + k * h * 0.25;
    const wdt = h * (0.22 + k * 0.1);
    ctx.beginPath();
    ctx.moveTo(x, top);
    ctx.lineTo(x - wdt, top + h * 0.42);
    ctx.lineTo(x + wdt, top + h * 0.42);
    ctx.closePath();
    ctx.fill();
  }
  ctx.fillRect(x - h * 0.03, base - h * 0.12, h * 0.06, h * 0.12);
}

function palm(ctx: C, x: number, base: number, h: number, lean: number): void {
  ctx.strokeStyle = "#1a120d";
  ctx.fillStyle = "#1a120d";
  ctx.lineWidth = h * 0.035;
  ctx.lineCap = "round";
  const tx = x + lean * h * 0.35;
  const ty = base - h;
  ctx.beginPath();
  ctx.moveTo(x, base);
  ctx.quadraticCurveTo(x + lean * h * 0.05, base - h * 0.5, tx, ty);
  ctx.stroke();
  for (let k = 0; k < 7; k++) {
    const a = -Math.PI / 2 + (k - 3) * 0.55;
    const len = h * (0.32 + (k % 2) * 0.08);
    ctx.lineWidth = h * 0.02;
    ctx.beginPath();
    ctx.moveTo(tx, ty);
    ctx.quadraticCurveTo(tx + Math.cos(a) * len * 0.6, ty + Math.sin(a) * len * 0.6 - h * 0.05, tx + Math.cos(a) * len, ty + Math.sin(a) * len + h * 0.12);
    ctx.stroke();
  }
}

/** Fenster mit Sprossen (Innenräume mit Ausblick). */
function windowFrame(ctx: C, w: number, top: number, bottom: number, cols: number, color = "#0e1214"): void {
  ctx.fillStyle = color;
  ctx.fillRect(0, top - w * 0.02, w, w * 0.02);
  for (let k = 0; k <= cols; k++) ctx.fillRect((k / cols) * w - w * 0.006, top, w * 0.012, bottom - top);
  ctx.fillRect(0, top + (bottom - top) * 0.62, w, w * 0.008);
}

function lightStrip(ctx: C, x0: number, y0: number, x1: number, y1: number, color: string, width: number): void {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = width * 6;
  ctx.lineWidth = width;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.stroke();
  ctx.restore();
}

/** Boden mit Perspektive (Dielen oder Fliesen) zum Fluchtpunkt in der Bildmitte. */
function floor(ctx: C, r: RoomDef, w: number, h: number, kind: "planks" | "tiles" | "plain" | "snow" | "mat"): void {
  const hy = h * HORIZON;
  ctx.fillStyle = vGrad(ctx, hy, h, [
    [0, r.floor[0]],
    [1, r.floor[1]],
  ]);
  ctx.fillRect(0, hy, w, h - hy);
  const vx = w / 2;
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, hy, w, h - hy);
  ctx.clip();
  if (kind === "planks" || kind === "tiles" || kind === "mat") {
    ctx.strokeStyle = kind === "mat" ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.28)";
    ctx.lineWidth = Math.max(1, w * 0.002);
    const n = kind === "planks" ? 18 : 12;
    for (let k = -n; k <= n; k++) {
      ctx.beginPath();
      ctx.moveTo(vx + (k / n) * w * 0.25, hy);
      ctx.lineTo(vx + (k / n) * w * 2.2, h);
      ctx.stroke();
    }
    if (kind !== "planks") {
      for (let k = 1; k < 9; k++) {
        const y = hy + (h - hy) * Math.pow(k / 9, 1.8);
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }
    }
  }
  if (kind === "snow") {
    ctx.fillStyle = "rgba(255,255,255,0.5)";
    ctx.beginPath();
    ctx.ellipse(w * 0.3, hy + (h - hy) * 0.3, w * 0.5, (h - hy) * 0.12, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  // Glanz/Reflexion in der Mitte
  const g = ctx.createRadialGradient(vx, hy + (h - hy) * 0.35, 0, vx, hy + (h - hy) * 0.35, w * 0.6);
  g.addColorStop(0, withAlpha(r.light, kind === "snow" ? 0.1 : 0.16));
  g.addColorStop(1, withAlpha(r.light, 0));
  ctx.fillStyle = g;
  ctx.fillRect(0, hy, w, h - hy);
  ctx.restore();
  // Kante Wand/Boden
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.fillRect(0, hy - 1, w, Math.max(2, h * 0.004));
}

function railing(ctx: C, w: number, y: number, h: number): void {
  ctx.fillStyle = "rgba(20,14,10,0.85)";
  ctx.fillRect(0, y - h * 0.08, w, h * 0.006);
  for (let k = 0; k <= 24; k++) ctx.fillRect((k / 24) * w, y - h * 0.08, Math.max(1, w * 0.003), h * 0.08);
}

/** Zeichnet die statische Szene eines Raums (ohne Lichtreaktion). */
export function paintRoom(ctx: C, r: RoomDef, w: number, h: number): void {
  const rnd = seededRandom(r.id);
  const hy = h * HORIZON;
  ctx.save();
  ctx.fillStyle = vGrad(ctx, 0, hy, [
    [0, r.sky[0]],
    [1, r.sky[1]],
  ]);
  ctx.fillRect(0, 0, w, hy);

  switch (r.scene) {
    case "studio": {
      // Betonwand mit großen Fenstern, warme Lichtleisten
      ctx.fillStyle = "#3a464b";
      ctx.fillRect(w * 0.08, h * 0.12, w * 0.84, hy - h * 0.16);
      ctx.fillStyle = vGrad(ctx, h * 0.12, hy, [
        [0, "#55666c"],
        [1, "#2b3539"],
      ]);
      ctx.fillRect(w * 0.1, h * 0.14, w * 0.8, hy - h * 0.2);
      // Abendlicher Ausblick hinter den Fenstern
      ctx.fillStyle = vGrad(ctx, h * 0.14, hy - h * 0.06, [
        [0, "#3d5363"],
        [1, "#8a6a58"],
      ]);
      ctx.fillRect(w * 0.1, h * 0.14, w * 0.8, hy - h * 0.2);
      for (let x = w * 0.1; x < w * 0.9; ) {
        const bw = w * (0.03 + rnd() * 0.05);
        const bh = h * (0.05 + rnd() * 0.14);
        ctx.fillStyle = "rgba(30,38,44,0.85)";
        ctx.fillRect(x, hy - h * 0.06 - bh, bw, bh);
        x += bw + w * 0.006;
      }
      windowFrame(ctx, w, h * 0.14, hy - h * 0.06, 6, "#151b1d");
      lightStrip(ctx, w * 0.05, h * 0.06, w * 0.95, h * 0.06, r.light, Math.max(2, h * 0.006));
      lightStrip(ctx, w * 0.04, h * 0.1, w * 0.04, hy - h * 0.02, r.light, Math.max(2, h * 0.005));
      lightStrip(ctx, w * 0.96, h * 0.1, w * 0.96, hy - h * 0.02, r.light, Math.max(2, h * 0.005));
      floor(ctx, r, w, h, "tiles");
      break;
    }
    case "mountains": {
      mountains(ctx, w, hy - h * 0.04, h * 0.32, "#6f86a0", rnd, true);
      mountains(ctx, w, hy - h * 0.02, h * 0.2, "#3f5568", rnd);
      ctx.fillStyle = "#2c3e2c";
      ctx.fillRect(0, hy - h * 0.04, w, h * 0.04);
      windowFrame(ctx, w, h * 0.06, hy, 5, "#2a1d14");
      lightStrip(ctx, 0, h * 0.04, w, h * 0.04, r.light, Math.max(2, h * 0.005));
      floor(ctx, r, w, h, "planks");
      break;
    }
    case "beach":
    case "sunrise":
    case "desert": {
      const sunY = r.scene === "sunrise" ? hy - h * 0.06 : hy - h * 0.12;
      glow(ctx, w * 0.5, sunY, h * 0.35, "#FFD27A", 0.55);
      ctx.fillStyle = "#FFE3A3";
      ctx.beginPath();
      ctx.arc(w * 0.5, sunY, h * 0.045, 0, Math.PI * 2);
      ctx.fill();
      if (r.scene === "desert") {
        ctx.fillStyle = "#c98a55";
        ctx.beginPath();
        ctx.moveTo(0, hy);
        for (let k = 0; k <= 8; k++) ctx.quadraticCurveTo((k - 0.5) / 8 * w, hy - h * (0.04 + rnd() * 0.06), (k / 8) * w, hy - h * 0.01);
        ctx.lineTo(w, hy);
        ctx.fill();
      } else {
        ctx.fillStyle = vGrad(ctx, hy - h * 0.1, hy, [
          [0, "#3a5f8a"],
          [1, "#f0a070"],
        ]);
        ctx.fillRect(0, hy - h * 0.1, w, h * 0.1);
        ctx.fillStyle = "rgba(255,220,160,0.5)";
        for (let k = 0; k < 6; k++) ctx.fillRect(w * (0.46 - k * 0.012), hy - h * (0.09 - k * 0.016), w * (0.08 + k * 0.024), Math.max(1, h * 0.004));
      }
      if (r.scene === "beach") {
        palm(ctx, w * 0.08, hy, h * 0.5, 0.4);
        palm(ctx, w * 0.92, hy, h * 0.46, -0.45);
      } else {
        // Sonnensegel
        ctx.fillStyle = "rgba(230,205,170,0.9)";
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(w * 0.55, h * 0.06);
        ctx.lineTo(0, h * 0.16);
        ctx.fill();
        ctx.fillStyle = "#2a1d14";
        ctx.fillRect(w * 0.9, h * 0.04, w * 0.012, hy - h * 0.04);
      }
      floor(ctx, r, w, h, "planks");
      railing(ctx, w, hy + h * 0.005, h);
      break;
    }
    case "skyline": {
      for (let k = 0; k < 60; k++) {
        ctx.fillStyle = `rgba(255,255,255,${0.3 + rnd() * 0.5})`;
        ctx.fillRect(rnd() * w, rnd() * hy * 0.5, 1.5, 1.5);
      }
      let x = 0;
      while (x < w) {
        const bw = w * (0.04 + rnd() * 0.07);
        const bh = h * (0.12 + rnd() * 0.32);
        ctx.fillStyle = `rgb(${18 + rnd() * 14},${24 + rnd() * 14},${44 + rnd() * 20})`;
        ctx.fillRect(x, hy - bh, bw, bh);
        for (let yy = hy - bh + 6; yy < hy - 4; yy += 7)
          for (let xx = x + 3; xx < x + bw - 3; xx += 6) if (rnd() < 0.35) {
            ctx.fillStyle = `rgba(255,${200 + rnd() * 50},120,${0.5 + rnd() * 0.5})`;
            ctx.fillRect(xx, yy, 2.5, 3);
          }
        x += bw + w * 0.004;
      }
      lightStrip(ctx, w * 0.06, h * 0.08, w * 0.06, hy, r.light, Math.max(2, h * 0.005));
      lightStrip(ctx, w * 0.06, h * 0.08, w * 0.5, h * 0.08, r.light, Math.max(2, h * 0.005));
      floor(ctx, r, w, h, "tiles");
      break;
    }
    case "zen": {
      ctx.fillStyle = "#4b3c31";
      ctx.fillRect(w * 0.06, h * 0.08, w * 0.88, hy - h * 0.08);
      // Rundes Fenster mit Garten
      const cx = w * 0.68, cy = h * 0.3, rr = h * 0.16;
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, rr, 0, Math.PI * 2);
      ctx.clip();
      ctx.fillStyle = vGrad(ctx, cy - rr, cy + rr, [
        [0, "#bfe3d0"],
        [1, "#5f8f6a"],
      ]);
      ctx.fillRect(cx - rr, cy - rr, rr * 2, rr * 2);
      ctx.restore();
      ctx.strokeStyle = r.light;
      ctx.lineWidth = Math.max(2, h * 0.006);
      ctx.shadowColor = r.light;
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.arc(cx, cy, rr, 0, Math.PI * 2);
      ctx.stroke();
      ctx.shadowBlur = 0;
      // Kirschbaum
      ctx.strokeStyle = "#3a2518";
      ctx.lineWidth = h * 0.012;
      ctx.beginPath();
      ctx.moveTo(w * 0.2, hy);
      ctx.quadraticCurveTo(w * 0.18, h * 0.35, w * 0.26, h * 0.22);
      ctx.stroke();
      for (let k = 0; k < 40; k++) {
        ctx.fillStyle = `rgba(${240 + rnd() * 15},${150 + rnd() * 50},${190 + rnd() * 40},0.75)`;
        ctx.beginPath();
        ctx.arc(w * (0.14 + rnd() * 0.22), h * (0.12 + rnd() * 0.16), h * (0.015 + rnd() * 0.025), 0, Math.PI * 2);
        ctx.fill();
      }
      floor(ctx, r, w, h, "planks");
      break;
    }
    case "forest": {
      for (let k = 0; k < 5; k++) {
        const x = w * (k / 4);
        const rays = ctx.createLinearGradient(x, 0, x + w * 0.2, hy);
        rays.addColorStop(0, "rgba(255,240,180,0.25)");
        rays.addColorStop(1, "rgba(255,240,180,0)");
        ctx.fillStyle = rays;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x + w * 0.05, 0);
        ctx.lineTo(x + w * 0.3, hy);
        ctx.lineTo(x + w * 0.18, hy);
        ctx.fill();
      }
      for (let k = 0; k < 14; k++) {
        const x = rnd() * w;
        const tw = w * (0.015 + rnd() * 0.03);
        ctx.fillStyle = `rgb(${40 + rnd() * 20},${30 + rnd() * 14},${20 + rnd() * 10})`;
        ctx.fillRect(x, 0, tw, hy);
      }
      for (let k = 0; k < 50; k++) {
        ctx.fillStyle = `rgba(${40 + rnd() * 40},${90 + rnd() * 60},${40 + rnd() * 30},0.7)`;
        ctx.beginPath();
        ctx.arc(rnd() * w, rnd() * h * 0.28, h * (0.03 + rnd() * 0.05), 0, Math.PI * 2);
        ctx.fill();
      }
      floor(ctx, r, w, h, "planks");
      railing(ctx, w, hy + h * 0.005, h);
      break;
    }
    case "ice":
    case "lab": {
      if (r.scene === "ice") {
        for (let k = 0; k < 9; k++) {
          const x = w * (0.05 + rnd() * 0.9);
          const ch = h * (0.12 + rnd() * 0.25);
          const cw = ch * 0.3;
          ctx.fillStyle = vGrad(ctx, hy - ch, hy, [
            [0, "rgba(170,235,255,0.9)"],
            [1, "rgba(40,110,170,0.7)"],
          ]);
          ctx.beginPath();
          ctx.moveTo(x, hy - ch);
          ctx.lineTo(x + cw, hy - ch * 0.3);
          ctx.lineTo(x + cw * 0.5, hy);
          ctx.lineTo(x - cw * 0.5, hy);
          ctx.lineTo(x - cw, hy - ch * 0.35);
          ctx.closePath();
          ctx.fill();
          glow(ctx, x, hy - ch * 0.5, ch * 0.6, r.light, 0.18);
        }
        ctx.strokeStyle = withAlpha(r.light, 0.7);
        ctx.lineWidth = Math.max(2, h * 0.005);
        ctx.beginPath();
        ctx.ellipse(w / 2, h * 0.07, w * 0.22, h * 0.025, 0, 0, Math.PI * 2);
        ctx.stroke();
        floor(ctx, r, w, h, "tiles");
      } else {
        // Labor: Bildschirmpaneele an der Wand
        for (const [x0, y0, pw, ph] of [
          [0.06, 0.16, 0.22, 0.22],
          [0.72, 0.16, 0.22, 0.22],
          [0.36, 0.08, 0.28, 0.1],
        ] as Array<[number, number, number, number]>) {
          ctx.fillStyle = "rgba(20,60,80,0.85)";
          ctx.fillRect(x0 * w, y0 * h, pw * w, ph * h);
          ctx.strokeStyle = withAlpha(r.light, 0.9);
          ctx.lineWidth = 1.5;
          ctx.strokeRect(x0 * w, y0 * h, pw * w, ph * h);
          ctx.strokeStyle = withAlpha(r.light, 0.45);
          for (let k = 1; k < 5; k++) {
            ctx.beginPath();
            ctx.moveTo(x0 * w + 6, y0 * h + (k / 5) * ph * h);
            ctx.lineTo(x0 * w + pw * w * (0.3 + rnd() * 0.6), y0 * h + (k / 5) * ph * h);
            ctx.stroke();
          }
        }
        lightStrip(ctx, 0, h * 0.03, w, h * 0.03, r.light, Math.max(2, h * 0.004));
        floor(ctx, r, w, h, "tiles");
        ctx.strokeStyle = withAlpha(r.light, 0.6);
        ctx.lineWidth = Math.max(2, h * 0.004);
        for (const k of [1, 0.7]) {
          ctx.beginPath();
          ctx.ellipse(w / 2, h * 0.86, w * 0.32 * k, h * 0.05 * k, 0, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
      break;
    }
    case "lava": {
      for (let k = 0; k < 7; k++) {
        ctx.fillStyle = `rgb(${62 + rnd() * 30},${30 + rnd() * 14},${22 + rnd() * 10})`;
        ctx.beginPath();
        const x = rnd() * w;
        ctx.moveTo(x - w * 0.2, hy);
        ctx.lineTo(x, hy - h * (0.2 + rnd() * 0.3));
        ctx.lineTo(x + w * 0.2, hy);
        ctx.fill();
      }
      glow(ctx, w * 0.5, hy, h * 0.4, "#FF4A00", 0.35);
      ctx.strokeStyle = "#FF6A1F";
      ctx.shadowColor = "#FF4A00";
      ctx.shadowBlur = 14;
      for (let k = 0; k < 6; k++) {
        ctx.lineWidth = 1 + rnd() * 3;
        ctx.beginPath();
        let x = rnd() * w;
        let y = hy - rnd() * h * 0.3;
        ctx.moveTo(x, y);
        for (let s = 0; s < 5; s++) {
          x += (rnd() - 0.5) * w * 0.08;
          y += h * 0.04;
          ctx.lineTo(x, Math.min(y, hy));
        }
        ctx.stroke();
      }
      ctx.shadowBlur = 0;
      floor(ctx, r, w, h, "plain");
      // Lavafluss
      ctx.fillStyle = vGrad(ctx, hy, h, [
        [0, "rgba(255,120,30,0.9)"],
        [1, "rgba(255,60,0,0.3)"],
      ]);
      ctx.beginPath();
      ctx.moveTo(w * 0.62, hy);
      ctx.quadraticCurveTo(w * 0.72, hy + (h - hy) * 0.4, w * 0.95, h);
      ctx.lineTo(w * 1.05, h);
      ctx.quadraticCurveTo(w * 0.8, hy + (h - hy) * 0.3, w * 0.68, hy);
      ctx.fill();
      break;
    }
    case "space": {
      for (let k = 0; k < 160; k++) {
        ctx.fillStyle = `rgba(255,255,255,${0.2 + rnd() * 0.8})`;
        const s = rnd() < 0.1 ? 2 : 1;
        ctx.fillRect(rnd() * w, rnd() * hy, s, s);
      }
      const pr = w * 0.9;
      const pg = ctx.createRadialGradient(w * 0.55, hy + pr * 0.7, pr * 0.2, w * 0.55, hy + pr * 0.7, pr);
      pg.addColorStop(0, "#2f7fd0");
      pg.addColorStop(0.8, "#1b4f8f");
      pg.addColorStop(1, "rgba(120,200,255,0.0)");
      ctx.fillStyle = pg;
      ctx.beginPath();
      ctx.arc(w * 0.55, hy + pr * 0.7, pr, 0, Math.PI * 2);
      ctx.fill();
      // Stationsrahmen
      ctx.fillStyle = "#1a2029";
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(w, 0);
      ctx.lineTo(w, h * 0.1);
      ctx.lineTo(w * 0.8, h * 0.06);
      ctx.lineTo(w * 0.2, h * 0.06);
      ctx.lineTo(0, h * 0.1);
      ctx.fill();
      ctx.fillRect(0, 0, w * 0.06, hy);
      ctx.fillRect(w * 0.94, 0, w * 0.06, hy);
      lightStrip(ctx, w * 0.2, h * 0.06, w * 0.8, h * 0.06, r.light, Math.max(2, h * 0.004));
      floor(ctx, r, w, h, "tiles");
      break;
    }
    case "ocean": {
      for (let k = 0; k < 6; k++) {
        const x = w * (0.1 + k * 0.17);
        const ray = ctx.createLinearGradient(x, 0, x, hy);
        ray.addColorStop(0, "rgba(180,240,255,0.22)");
        ray.addColorStop(1, "rgba(180,240,255,0)");
        ctx.fillStyle = ray;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x + w * 0.04, 0);
        ctx.lineTo(x + w * 0.12, hy);
        ctx.lineTo(x - w * 0.02, hy);
        ctx.fill();
      }
      ctx.fillStyle = "rgba(5,30,45,0.8)";
      for (let k = 0; k < 7; k++) {
        const x = rnd() * w;
        const y = h * (0.1 + rnd() * 0.4);
        const s = h * (0.015 + rnd() * 0.04);
        ctx.beginPath();
        ctx.ellipse(x, y, s * 2, s * 0.6, 0, 0, Math.PI * 2);
        ctx.moveTo(x + s * 1.8, y);
        ctx.lineTo(x + s * 2.8, y - s * 0.7);
        ctx.lineTo(x + s * 2.8, y + s * 0.7);
        ctx.fill();
      }
      windowFrame(ctx, w, h * 0.04, hy, 4, "#0a1a22");
      floor(ctx, r, w, h, "planks");
      break;
    }
    case "graffiti": {
      ctx.fillStyle = "#3a2f2a";
      ctx.fillRect(0, h * 0.2, w, hy - h * 0.2);
      ctx.strokeStyle = "rgba(0,0,0,0.25)";
      ctx.lineWidth = 1;
      for (let y = h * 0.2; y < hy; y += h * 0.025) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }
      const cols = ["#ff3fa4", "#ffd23f", "#3fd0ff", "#7bff5a", "#a25aff"];
      for (let k = 0; k < 10; k++) {
        ctx.strokeStyle = cols[k % cols.length]!;
        ctx.lineWidth = h * (0.012 + rnd() * 0.02);
        ctx.lineCap = "round";
        ctx.beginPath();
        const x = rnd() * w;
        const y = h * (0.28 + rnd() * 0.25);
        ctx.moveTo(x, y);
        ctx.bezierCurveTo(x + w * 0.05, y - h * 0.08, x + w * 0.1, y + h * 0.08, x + w * 0.16, y - h * 0.02);
        ctx.stroke();
      }
      windowFrame(ctx, w, h * 0.02, h * 0.18, 8, "#101315");
      lightStrip(ctx, w * 0.02, h * 0.19, w * 0.98, h * 0.19, r.light, Math.max(2, h * 0.004));
      floor(ctx, r, w, h, "tiles");
      break;
    }
    case "lodge": {
      ctx.fillStyle = "#4a3020";
      for (let k = 0; k < 12; k++) ctx.fillRect(0, h * 0.06 + k * h * 0.05, w, h * 0.045);
      // Fenster mit Bergen
      ctx.save();
      ctx.beginPath();
      ctx.rect(w * 0.3, h * 0.12, w * 0.62, hy - h * 0.18);
      ctx.clip();
      ctx.fillStyle = vGrad(ctx, h * 0.12, hy, [
        [0, "#8fb3d1"],
        [1, "#e6eef4"],
      ]);
      ctx.fillRect(w * 0.3, h * 0.12, w * 0.62, hy);
      mountains(ctx, w, hy - h * 0.06, h * 0.25, "#7d93ab", rnd, true);
      ctx.restore();
      windowFrame(ctx, w, h * 0.12, hy - h * 0.06, 6, "#2a1b11");
      ctx.fillStyle = "#4a3020";
      ctx.fillRect(0, h * 0.12, w * 0.3, hy - h * 0.12);
      // Kamin
      ctx.fillStyle = "#5b5650";
      ctx.fillRect(w * 0.04, h * 0.3, w * 0.2, hy - h * 0.3);
      ctx.fillStyle = "#151210";
      ctx.fillRect(w * 0.08, h * 0.42, w * 0.12, hy - h * 0.46);
      glow(ctx, w * 0.14, hy - h * 0.08, h * 0.16, "#FF8A2A", 0.7);
      floor(ctx, r, w, h, "planks");
      break;
    }
    case "neon": {
      floor(ctx, r, w, h, "plain");
      const vx = w / 2;
      const vy = hy;
      const cols = [r.light, "#3FE0FF"];
      for (let k = 1; k <= 7; k++) {
        const s = Math.pow(k / 7, 1.6);
        const fw = w * 0.08 + s * w * 0.95;
        const fh = h * 0.06 + s * h * 0.9;
        const c = cols[k % 2]!;
        ctx.save();
        ctx.strokeStyle = c;
        ctx.shadowColor = c;
        ctx.shadowBlur = 10;
        ctx.lineWidth = 1 + s * 3;
        ctx.globalAlpha = 0.35 + s * 0.6;
        ctx.beginPath();
        ctx.moveTo(vx - fw / 2, vy + fh * 0.35);
        ctx.lineTo(vx - fw / 2, vy - fh * 0.65);
        ctx.lineTo(vx + fw / 2, vy - fh * 0.65);
        ctx.lineTo(vx + fw / 2, vy + fh * 0.35);
        ctx.stroke();
        ctx.restore();
      }
      break;
    }
    case "stadium": {
      for (let row = 0; row < 7; row++) {
        const y = h * (0.18 + row * 0.055);
        ctx.fillStyle = `rgba(${30 + row * 6},${38 + row * 6},${52 + row * 6},1)`;
        ctx.fillRect(0, y, w, h * 0.05);
        for (let k = 0; k < 40; k++) {
          if (rnd() < 0.5) continue;
          ctx.fillStyle = `rgba(255,255,255,${0.15 + rnd() * 0.4})`;
          ctx.fillRect(rnd() * w, y + h * 0.01 + rnd() * h * 0.03, 2, 2);
        }
      }
      ctx.save();
      ctx.strokeStyle = r.light;
      ctx.shadowColor = r.light;
      ctx.shadowBlur = 20;
      ctx.lineWidth = Math.max(3, h * 0.008);
      ctx.beginPath();
      ctx.ellipse(w / 2, h * 0.08, w * 0.3, h * 0.035, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
      floor(ctx, r, w, h, "plain");
      ctx.strokeStyle = "rgba(255,255,255,0.35)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(w / 2, h * 0.86, w * 0.4, h * 0.06, 0, 0, Math.PI * 2);
      ctx.stroke();
      break;
    }
    case "waterfall": {
      ctx.fillStyle = "#3b3f38";
      ctx.beginPath();
      ctx.moveTo(w * 0.25, hy);
      ctx.lineTo(w * 0.3, h * 0.06);
      ctx.lineTo(w * 0.7, h * 0.04);
      ctx.lineTo(w * 0.76, hy);
      ctx.fill();
      ctx.fillStyle = vGrad(ctx, h * 0.05, hy, [
        [0, "rgba(235,250,255,0.95)"],
        [1, "rgba(170,230,240,0.85)"],
      ]);
      ctx.fillRect(w * 0.42, h * 0.05, w * 0.16, hy - h * 0.05);
      for (let k = 0; k < 60; k++) {
        ctx.fillStyle = `rgba(${30 + rnd() * 40},${100 + rnd() * 80},${40 + rnd() * 40},0.8)`;
        ctx.beginPath();
        const side = rnd() < 0.5 ? rnd() * 0.3 : 0.7 + rnd() * 0.3;
        ctx.arc(side * w, h * (0.05 + rnd() * 0.5), h * (0.025 + rnd() * 0.05), 0, Math.PI * 2);
        ctx.fill();
      }
      glow(ctx, w * 0.5, hy, h * 0.2, "#E8FFFF", 0.5);
      floor(ctx, r, w, h, "plain");
      ctx.fillStyle = vGrad(ctx, hy, hy + h * 0.12, [
        [0, "rgba(60,210,210,0.85)"],
        [1, "rgba(20,120,130,0.2)"],
      ]);
      ctx.beginPath();
      ctx.ellipse(w * 0.5, hy + h * 0.04, w * 0.42, h * 0.07, 0, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case "snow": {
      glow(ctx, w * 0.75, hy - h * 0.05, h * 0.3, "#FFC98A", 0.6);
      for (let k = 0; k < 18; k++) {
        const x = rnd() * w;
        const th = h * (0.12 + rnd() * 0.22);
        pine(ctx, x, hy + h * 0.01, th, `rgba(${30 + rnd() * 20},${50 + rnd() * 20},${50 + rnd() * 20},0.95)`);
      }
      floor(ctx, r, w, h, "snow");
      for (let k = 0; k < 70; k++) {
        ctx.fillStyle = "rgba(255,255,255,0.7)";
        ctx.fillRect(rnd() * w, rnd() * hy, 2, 2);
      }
      break;
    }
    case "cage": {
      lightStrip(ctx, w * 0.1, h * 0.05, w * 0.9, h * 0.05, r.light, Math.max(2, h * 0.005));
      lightStrip(ctx, w * 0.2, h * 0.1, w * 0.8, h * 0.1, r.light, Math.max(1, h * 0.003));
      ctx.strokeStyle = "rgba(160,160,170,0.35)";
      ctx.lineWidth = 1;
      const step = Math.max(8, w * 0.018);
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, h * 0.16, w, hy - h * 0.16);
      ctx.clip();
      for (let x = -h; x < w + h; x += step) {
        ctx.beginPath();
        ctx.moveTo(x, h * 0.16);
        ctx.lineTo(x + hy, hy + h * 0.16);
        ctx.moveTo(x, h * 0.16);
        ctx.lineTo(x - hy, hy + h * 0.16);
        ctx.stroke();
      }
      ctx.restore();
      ctx.fillStyle = "#26262b";
      for (const x of [0.04, 0.96]) ctx.fillRect(w * x - w * 0.01, h * 0.14, w * 0.02, hy - h * 0.14);
      // Boxsack
      ctx.fillStyle = "#3a1d1d";
      ctx.fillRect(w * 0.14, h * 0.2, w * 0.06, h * 0.22);
      floor(ctx, r, w, h, "mat");
      break;
    }
  }
  ctx.restore();
}

/** Vorgerenderte Szenen (je Raum und Größe), damit pro Bild nur kopiert wird. */
const cache = new Map<string, HTMLCanvasElement>();
const MAX_CACHE = 3;

export function roomCanvas(r: RoomDef, w: number, h: number): HTMLCanvasElement {
  const key = `${r.id}:${w}x${h}`;
  let c = cache.get(key);
  if (!c) {
    // Hintergrund höchstens ~1100 px hoch vorrendern (Speicher: bei 3× Pixeldichte sonst > 10 MB je Raum)
    const k = Math.min(1, 1100 / Math.max(w, h));
    c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(w * k));
    c.height = Math.max(1, Math.round(h * k));
    paintRoom(c.getContext("2d")!, r, c.width, c.height);
    cache.set(key, c);
    if (cache.size > MAX_CACHE) cache.delete(cache.keys().next().value!);
  }
  return c;
}

/**
 * Raum zeichnen. `light` 0..1 = Lichtreaktion (z. B. kurz nach gezählter Wiederholung); die Grundstimmung
 * bleibt ruhig, das Licht hebt nur den Boden um die Person leicht an.
 */
export function drawRoom(ctx: C, r: RoomDef, w: number, h: number, light = 0): void {
  const artwork = typeof Image === "function" ? conceptImage(roomBackdrop(r.nr)) : null;
  if (artwork?.naturalWidth) drawCover(ctx, artwork, w, h);
  else ctx.drawImage(roomCanvas(r, w, h), 0, 0, w, h);
  // Lesbarkeit der Figur: Raum leicht abdunkeln (Figur und HUD bleiben im Vordergrund)
  ctx.fillStyle = artwork?.naturalWidth ? "rgba(8,14,16,0.12)" : "rgba(8,14,16,0.28)";
  ctx.fillRect(0, 0, w, h);
  if (light > 0.01) {
    const y = h * (HORIZON + (1 - HORIZON) * 0.45);
    const g = ctx.createRadialGradient(w / 2, y, 0, w / 2, y, Math.max(w, h) * 0.55);
    g.addColorStop(0, withAlpha(r.light, 0.22 * Math.min(1, light)));
    g.addColorStop(1, withAlpha(r.light, 0));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }
}
