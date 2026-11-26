import { LM, type Landmark } from "@motion-arena/shared";

/**
 * 15 Avatare (docs/FEATURES.md) – eigenständig gestaltete, stilisierte 2D-Figuren, die live den erkannten
 * Körperpunkten folgen. Keine fremden Modelle/Bilder; bewusst ohne Gesichtszüge (Mannequin-Stil).
 * Kein riggbares 3D-Modell – das bleibt ein späterer Schritt mit lizenzierten Assets.
 */
export type HairStyle = "short" | "buzz" | "slick" | "ponytail" | "bun" | "braid" | "curly" | "bangs" | "headband";
export type TopKind = "tee" | "bra" | "tank" | "hoodie" | "sleeveless" | "jacket" | "suit";
export type AvatarCategory = "trainer" | "athletisch" | "kaempferisch" | "balance" | "energie";

export interface AvatarDef {
  id: string;
  nr: number;
  name: string;
  focus: string;
  category: AvatarCategory;
  /** Intensität 1..5 (Balken auf der Karte). */
  level: number;
  skin: string;
  hair: string;
  hairStyle: HairStyle;
  top: TopKind;
  topColor: string;
  accent: string;
  bottomColor: string;
  shorts: boolean;
  shoeColor: string;
  /** Statur: Breite von Schultern und Gliedmaßen (0,9 schmal … 1,15 kräftig). */
  build: number;
}

export const AVATAR_CATEGORIES: Array<{ id: AvatarCategory | "alle"; label: string }> = [
  { id: "alle", label: "Alle" },
  { id: "trainer", label: "Trainer" },
  { id: "athletisch", label: "Athletisch" },
  { id: "kaempferisch", label: "Kämpferisch" },
  { id: "balance", label: "Balance" },
  { id: "energie", label: "Energie" },
];

export const AVATARS: AvatarDef[] = [
  { id: "lukas", nr: 1, name: "Lukas", focus: "Kraft & Aufbau", category: "trainer", level: 3, skin: "#d9a888", hair: "#4a3020", hairStyle: "short", top: "tee", topColor: "#1d2023", accent: "#FF704B", bottomColor: "#16181a", shorts: false, shoeColor: "#2a2d30", build: 1.12 },
  { id: "elena", nr: 2, name: "Elena", focus: "Cardio & Ausdauer", category: "energie", level: 4, skin: "#c98e6c", hair: "#2b1a12", hairStyle: "ponytail", top: "bra", topColor: "#1a1b1e", accent: "#FF704B", bottomColor: "#141517", shorts: false, shoeColor: "#e8e8e8", build: 0.95 },
  { id: "ken", nr: 3, name: "Ken", focus: "Kampf & Reaktion", category: "kaempferisch", level: 3, skin: "#e0b48f", hair: "#121212", hairStyle: "headband", top: "sleeveless", topColor: "#1b1c1f", accent: "#F2BC60", bottomColor: "#1b1c1f", shorts: false, shoeColor: "#1b1c1f", build: 1.02 },
  { id: "mia", nr: 4, name: "Mia", focus: "HIIT & Fettverbrennung", category: "energie", level: 3, skin: "#f0c7a8", hair: "#d9b26a", hairStyle: "bun", top: "bra", topColor: "#8e4a6a", accent: "#F2BC60", bottomColor: "#2a2328", shorts: false, shoeColor: "#f1f1f1", build: 0.94 },
  { id: "david", nr: 5, name: "David", focus: "Power & Explosivität", category: "athletisch", level: 4, skin: "#6b4330", hair: "#151010", hairStyle: "buzz", top: "tank", topColor: "#8a8d90", accent: "#FF704B", bottomColor: "#1a1b1d", shorts: true, shoeColor: "#26282b", build: 1.16 },
  { id: "aiko", nr: 6, name: "Aiko", focus: "Yoga & Balance", category: "balance", level: 2, skin: "#ecc6a2", hair: "#14100e", hairStyle: "bun", top: "tank", topColor: "#9fb59a", accent: "#d8e04a", bottomColor: "#7f9a7a", shorts: false, shoeColor: "#d9d2c5", build: 0.92 },
  { id: "viktor", nr: 7, name: "Viktor", focus: "Gesundheit & Mobilität", category: "trainer", level: 3, skin: "#e2b394", hair: "#b9b6b1", hairStyle: "slick", top: "tee", topColor: "#1c1e20", accent: "#F2BC60", bottomColor: "#232528", shorts: false, shoeColor: "#2b2d2f", build: 1.08 },
  { id: "nova", nr: 8, name: "Nova", focus: "Outdoor & Ausdauer", category: "athletisch", level: 4, skin: "#f2cdb0", hair: "#b5522c", hairStyle: "braid", top: "jacket", topColor: "#5f6b26", accent: "#c9d34a", bottomColor: "#1d2433", shorts: false, shoeColor: "#3a3f45", build: 0.97 },
  { id: "matteo", nr: 9, name: "Matteo", focus: "Functional & Core", category: "athletisch", level: 3, skin: "#d9a27e", hair: "#2a1a10", hairStyle: "curly", top: "hoodie", topColor: "#8d9196", accent: "#d0d3d6", bottomColor: "#5a5e63", shorts: false, shoeColor: "#e6e6e6", build: 1.05 },
  { id: "raven", nr: 10, name: "Raven", focus: "Stärke & Bodyweight", category: "kaempferisch", level: 3, skin: "#e8bfa0", hair: "#0f0d0d", hairStyle: "bangs", top: "bra", topColor: "#151517", accent: "#E16C69", bottomColor: "#151517", shorts: false, shoeColor: "#151517", build: 1.0 },
  { id: "finn", nr: 11, name: "Finn", focus: "Athletik & Koordination", category: "athletisch", level: 3, skin: "#e8b896", hair: "#8a6a3a", hairStyle: "short", top: "tank", topColor: "#b9bcbf", accent: "#47D4D0", bottomColor: "#1f2a3d", shorts: true, shoeColor: "#f0f0f0", build: 1.06 },
  { id: "sara", nr: 12, name: "Sara", focus: "Rehabilitation & Stabilität", category: "balance", level: 3, skin: "#f2cfb2", hair: "#d8b878", hairStyle: "braid", top: "tank", topColor: "#6aa9b8", accent: "#bfe6ee", bottomColor: "#2e3236", shorts: false, shoeColor: "#e8e8e8", build: 0.94 },
  { id: "leo", nr: 13, name: "Leo", focus: "Ganzkörper & Intensität", category: "energie", level: 4, skin: "#d8a47f", hair: "#1c140e", hairStyle: "short", top: "sleeveless", topColor: "#17181a", accent: "#FF704B", bottomColor: "#17181a", shorts: false, shoeColor: "#26282a", build: 1.1 },
  { id: "zara", nr: 14, name: "Zara", focus: "Dance & Bewegung", category: "energie", level: 4, skin: "#8a5a3e", hair: "#1a110c", hairStyle: "curly", top: "bra", topColor: "#b8e04a", accent: "#b8e04a", bottomColor: "#121314", shorts: false, shoeColor: "#f2f2f2", build: 0.95 },
  { id: "echo", nr: 15, name: "Echo", focus: "Challenge & Performance", category: "kaempferisch", level: 4, skin: "#e3b48f", hair: "#0e0e10", hairStyle: "short", top: "suit", topColor: "#141518", accent: "#47D4D0", bottomColor: "#141518", shorts: false, shoeColor: "#141518", build: 1.04 },
];

export const DEFAULT_AVATAR = "lukas";
export const isAvatarId = (id: unknown): id is string => typeof id === "string" && AVATARS.some((a) => a.id === id);
export const avatarById = (id: string | null | undefined): AvatarDef => AVATARS.find((a) => a.id === id) ?? AVATARS[0]!;

type Pt = [number, number];
/** MediaPipe-Pose: Ohren (in LM nicht benannt). */
const LEFT_EAR = 7;
const RIGHT_EAR = 8;
type C = CanvasRenderingContext2D;

/** Farbe aufhellen (k > 0) oder abdunkeln (k < 0). */
export function shade(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16);
  const f = (c: number) => Math.round(k >= 0 ? c + (255 - c) * k : c * (1 + k));
  const r = f((n >> 16) & 255);
  const g = f((n >> 8) & 255);
  const b = f(n & 255);
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

const lerp = (a: Pt, b: Pt, t: number): Pt => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

/** Gliedmaße als abgerundete Kapsel mit dezentem Licht von oben links. */
function limb(ctx: C, a: Pt, b: Pt, w: number, color: string): void {
  ctx.lineCap = "round";
  ctx.strokeStyle = shade(color, -0.25);
  ctx.lineWidth = w + 2;
  ctx.beginPath();
  ctx.moveTo(a[0], a[1]);
  ctx.lineTo(b[0], b[1]);
  ctx.stroke();
  ctx.strokeStyle = color;
  ctx.lineWidth = w;
  ctx.stroke();
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = Math.hypot(dx, dy) || 1;
  const ox = (-dy / len) * w * 0.2;
  const oy = (dx / len) * w * 0.2;
  const sx = ox < 0 || (ox === 0 && oy < 0) ? 1 : -1; // Lichtkante zur Bildoberseite/links
  ctx.strokeStyle = shade(color, 0.18);
  ctx.globalAlpha = 0.55;
  ctx.lineWidth = w * 0.3;
  ctx.beginPath();
  ctx.moveTo(a[0] + ox * sx, a[1] + oy * sx);
  ctx.lineTo(b[0] + ox * sx, b[1] + oy * sx);
  ctx.stroke();
  ctx.globalAlpha = 1;
}

const visible = (p: Landmark | undefined) => !!p && p.visibility >= 0.3;

/**
 * Avatar auf die erkannten Körperpunkte zeichnen.
 * P: Bildpunkt eines Landmarks in Pixeln (inkl. Spiegelung), s: Körpermaßstab (≈ Beinlänge in Pixeln).
 */
export function drawAvatar(ctx: C, lms: Landmark[], P: (i: number) => Pt, s: number, a: AvatarDef): void {
  /** Punkt vorhanden, sichtbar genug und mit endlicher Bildposition. */
  const ok = (i: number) => {
    if (!visible(lms[i])) return false;
    const [x, y] = P(i);
    return Number.isFinite(x) && Number.isFinite(y);
  };
  // Ohne Schultern und Hüften (oder mit ungültigem Maßstab) keine Figur zeichnen
  if (!Number.isFinite(s) || s <= 0) return;
  if (![LM.LEFT_SHOULDER, LM.RIGHT_SHOULDER, LM.LEFT_HIP, LM.RIGHT_HIP].every(ok)) return;
  const b = a.build;
  const sh = { L: P(LM.LEFT_SHOULDER), R: P(LM.RIGHT_SHOULDER) };
  const hp = { L: P(LM.LEFT_HIP), R: P(LM.RIGHT_HIP) };
  const sMid = lerp(sh.L, sh.R, 0.5);
  const hMid = lerp(hp.L, hp.R, 0.5);
  // Hintere Körperseite zuerst (größeres z = weiter weg von der Kamera)
  const zL = (lms[LM.LEFT_SHOULDER]?.z ?? 0) + (lms[LM.LEFT_HIP]?.z ?? 0);
  const zR = (lms[LM.RIGHT_SHOULDER]?.z ?? 0) + (lms[LM.RIGHT_HIP]?.z ?? 0);
  const far: "L" | "R" = zL > zR ? "L" : "R";
  const near: "L" | "R" = far === "L" ? "R" : "L";
  const idx = (side: "L" | "R") =>
    side === "L"
      ? { sh: LM.LEFT_SHOULDER, el: LM.LEFT_ELBOW, wr: LM.LEFT_WRIST, hip: LM.LEFT_HIP, kn: LM.LEFT_KNEE, an: LM.LEFT_ANKLE, toe: LM.LEFT_FOOT_INDEX }
      : { sh: LM.RIGHT_SHOULDER, el: LM.RIGHT_ELBOW, wr: LM.RIGHT_WRIST, hip: LM.RIGHT_HIP, kn: LM.RIGHT_KNEE, an: LM.RIGHT_ANKLE, toe: LM.RIGHT_FOOT_INDEX };

  const sleeveFull = a.top === "hoodie" || a.top === "jacket" || a.top === "suit";
  const sleeveShort = a.top === "tee";

  const arm = (side: "L" | "R", dim: number) => {
    const k = idx(side);
    if (!ok(k.sh) || !ok(k.el)) return; // ohne Schulter/Ellbogen kein Arm
    const s0 = P(k.sh), e = P(k.el);
    const handOk = ok(k.wr);
    const w = handOk ? P(k.wr) : e;
    const skin = shade(a.skin, dim);
    const upper = s * 0.105 * b;
    const fore = s * 0.085 * b;
    limb(ctx, s0, e, upper, sleeveFull ? shade(a.topColor, dim) : skin);
    if (!handOk) return; // Unterarm/Hand nicht erkannt: auslassen
    if (sleeveShort) limb(ctx, s0, lerp(s0, e, 0.5), upper + 2, shade(a.topColor, dim));
    limb(ctx, e, w, fore, sleeveFull ? shade(a.topColor, dim) : skin);
    if (a.top === "suit") limb(ctx, lerp(s0, e, 0.1), lerp(e, w, 0.9), Math.max(1.5, s * 0.008), a.accent);
    if (sleeveFull) limb(ctx, lerp(e, w, 0.88), w, fore * 0.9, skin); // Handgelenk
    if (a.id === "ken") limb(ctx, lerp(e, w, 0.7), w, fore + 2, "#1b1c1f"); // Bandagen
    ctx.fillStyle = skin;
    ctx.beginPath();
    ctx.arc(w[0], w[1], s * 0.05 * b, 0, Math.PI * 2);
    ctx.fill();
  };

  const leg = (side: "L" | "R", dim: number) => {
    const k = idx(side);
    if (!ok(k.hip) || !ok(k.kn)) return;
    const h = P(k.hip), kn = P(k.kn);
    const footOk = ok(k.an);
    const an = footOk ? P(k.an) : kn;
    const pants = shade(a.bottomColor, dim);
    const skin = shade(a.skin, dim);
    const thigh = s * 0.165 * b;
    const shin = s * 0.12 * b;
    if (a.shorts) {
      limb(ctx, h, kn, thigh * 0.92, skin);
      limb(ctx, kn, an, shin, skin);
      limb(ctx, h, lerp(h, kn, 0.6), thigh + 2, pants);
    } else {
      limb(ctx, h, kn, thigh, pants);
      limb(ctx, kn, an, shin, pants);
      if (a.top === "suit") limb(ctx, lerp(h, kn, 0.1), lerp(kn, an, 0.85), Math.max(1.5, s * 0.008), a.accent);
    }
    if (!footOk) return;
    // Schuh: vom Knöchel Richtung Zehen (falls erkannt), sonst nach vorn-unten
    const toe = visible(lms[k.toe]) ? P(k.toe) : ([an[0], an[1] + s * 0.06] as Pt);
    const dir = [toe[0] - an[0], toe[1] - an[1]];
    const len = Math.hypot(dir[0]!, dir[1]!) || 1;
    const tip: Pt = [an[0] + (dir[0]! / len) * s * 0.1, an[1] + (dir[1]! / len) * s * 0.1];
    limb(ctx, an, tip, s * 0.1, shade(a.shoeColor, dim));
  };

  ctx.save();
  ctx.lineJoin = "round";

  // Langes Haar hinter dem Kopf
  if (Math.hypot(sMid[0] - hMid[0], sMid[1] - hMid[1]) < 4) return; // kollabierter Rumpf
  const head = headGeometry(lms, P, s, sMid, hMid, ok);
  drawHairBack(ctx, head, a);

  arm(far, -0.22);
  leg(far, -0.18);
  leg(near, 0);

  // Rumpf: Schultern etwas breiter, Taille leicht eingezogen. In Seitenansicht schmales Band.
  const across: Pt = [sh.R[0] - sh.L[0], sh.R[1] - sh.L[1]];
  const acrossLen = Math.hypot(across[0], across[1]);
  const torsoLen = Math.hypot(hMid[0] - sMid[0], hMid[1] - sMid[1]) || 1;
  const minHalf = s * 0.13 * b;
  let ls = sh.L, rs = sh.R, lh = hp.L, rh = hp.R;
  if (acrossLen < minHalf * 2) {
    const nx = -(hMid[1] - sMid[1]) / torsoLen;
    const ny = (hMid[0] - sMid[0]) / torsoLen;
    ls = [sMid[0] + nx * minHalf, sMid[1] + ny * minHalf];
    rs = [sMid[0] - nx * minHalf, sMid[1] - ny * minHalf];
    lh = [hMid[0] + nx * minHalf * 0.9, hMid[1] + ny * minHalf * 0.9];
    rh = [hMid[0] - nx * minHalf * 0.9, hMid[1] - ny * minHalf * 0.9];
  } else {
    const ext = (s * 0.03 * b) / acrossLen;
    ls = [sh.L[0] - across[0] * ext, sh.L[1] - across[1] * ext];
    rs = [sh.R[0] + across[0] * ext, sh.R[1] + across[1] * ext];
  }
  const waistL = lerp(lerp(ls, lh, 0.62), lerp(rs, rh, 0.62), 0.06);
  const waistR = lerp(lerp(rs, rh, 0.62), lerp(ls, lh, 0.62), 0.06);
  const torsoPath = () => {
    ctx.beginPath();
    ctx.moveTo(ls[0], ls[1]);
    ctx.quadraticCurveTo(sMid[0], sMid[1] - s * 0.015, rs[0], rs[1]);
    ctx.quadraticCurveTo(waistR[0], waistR[1], rh[0], rh[1]);
    ctx.lineTo(lh[0], lh[1]);
    ctx.quadraticCurveTo(waistL[0], waistL[1], ls[0], ls[1]);
    ctx.closePath();
  };
  const bareTorso = a.top === "bra";
  const tg = ctx.createLinearGradient(ls[0], ls[1], rh[0], rh[1]);
  const base = bareTorso ? a.skin : a.topColor;
  tg.addColorStop(0, shade(base, 0.12));
  tg.addColorStop(1, shade(base, -0.18));
  ctx.fillStyle = tg;
  ctx.strokeStyle = shade(base, -0.35);
  ctx.lineWidth = 1.5;
  torsoPath();
  ctx.fill();
  ctx.stroke();
  ctx.save();
  torsoPath();
  ctx.clip();
  if (bareTorso) {
    // Sport-BH: Band im oberen Drittel
    const t0L = lerp(ls, lh, 0.05), t0R = lerp(rs, rh, 0.05);
    const t1L = lerp(ls, lh, 0.38), t1R = lerp(rs, rh, 0.38);
    ctx.fillStyle = a.topColor;
    ctx.beginPath();
    ctx.moveTo(t0L[0], t0L[1]);
    ctx.lineTo(t0R[0], t0R[1]);
    ctx.lineTo(t1R[0], t1R[1]);
    ctx.lineTo(t1L[0], t1L[1]);
    ctx.fill();
  }
  if (a.top === "tank" || a.top === "sleeveless") {
    // Armausschnitt zeigt Haut an den Schultern
    ctx.fillStyle = a.skin;
    for (const [p, q] of [
      [ls, lh],
      [rs, rh],
    ] as Array<[Pt, Pt]>) {
      ctx.beginPath();
      ctx.arc(p[0], p[1], s * 0.05 * b, 0, Math.PI * 2);
      ctx.fill();
      void q;
    }
  }
  // Hosenbund (bei kurzen Oberteilen sichtbar)
  const wbL = lerp(ls, lh, bareTorso || a.top === "tank" ? 0.8 : 0.9);
  const wbR = lerp(rs, rh, bareTorso || a.top === "tank" ? 0.8 : 0.9);
  ctx.fillStyle = a.bottomColor;
  ctx.beginPath();
  ctx.moveTo(wbL[0], wbL[1]);
  ctx.lineTo(wbR[0], wbR[1]);
  ctx.lineTo(rh[0] + (rh[0] - rs[0]) * 0.2, rh[1] + (rh[1] - rs[1]) * 0.2);
  ctx.lineTo(lh[0] + (lh[0] - ls[0]) * 0.2, lh[1] + (lh[1] - ls[1]) * 0.2);
  ctx.fill();
  // Akzent: Reißverschluss (Jacke/Anzug) oder kleines Logo
  ctx.strokeStyle = a.accent;
  ctx.lineWidth = Math.max(1.5, s * 0.01);
  if (a.top === "jacket" || a.top === "suit" || a.top === "hoodie") {
    ctx.beginPath();
    ctx.moveTo(sMid[0], sMid[1]);
    ctx.lineTo(hMid[0], hMid[1]);
    ctx.stroke();
  } else if (!bareTorso) {
    const c = lerp(lerp(ls, rs, 0.68), lerp(lh, rh, 0.68), 0.2);
    ctx.beginPath();
    ctx.moveTo(c[0] - s * 0.015, c[1]);
    ctx.lineTo(c[0] + s * 0.015, c[1] - s * 0.01);
    ctx.stroke();
  }
  ctx.restore();

  // Schulterkappen: runden den Übergang Rumpf → Arm
  for (const p of [ls, rs]) {
    ctx.fillStyle = sleeveFull || sleeveShort ? shade(a.topColor, 0.04) : a.skin;
    ctx.beginPath();
    ctx.arc(p[0], p[1], s * 0.065 * b, 0, Math.PI * 2);
    ctx.fill();
  }
  // Hals und Kopf
  limb(ctx, sMid, lerp(sMid, head.c, 0.6), s * 0.085, shade(a.skin, -0.08));
  if (a.top === "hoodie") limb(ctx, lerp(ls, sMid, 0.4), lerp(rs, sMid, 0.4), s * 0.06, shade(a.topColor, -0.1)); // Kapuze im Nacken
  drawHead(ctx, head, a);

  arm(near, 0);
  ctx.restore();
}

interface HeadGeo {
  c: Pt;
  r: number;
  /** Winkel der Körperachse (Kopf "oben"). */
  angle: number;
  /** Blickrichtung seitlich: -1 links, 1 rechts, 0 frontal. */
  facing: number;
}

function headGeometry(lms: Landmark[], P: (i: number) => Pt, s: number, sMid: Pt, hMid: Pt, ok: (i: number) => boolean): HeadGeo {
  const r = s * 0.135;
  // Nase nicht erkannt: Kopf in Verlängerung des Rumpfes über den Schultern
  const nose: Pt = ok(LM.NOSE) ? P(LM.NOSE) : [sMid[0] + (sMid[0] - hMid[0]) * 0.42, sMid[1] + (sMid[1] - hMid[1]) * 0.42];
  // Ohren nur verwenden, wenn sie plausibel neben der Nase liegen (synthetische Posen setzen sie auf die Nase)
  const ear = (i: number) => (ok(i) && Math.hypot(P(i)[0] - nose[0], P(i)[1] - nose[1]) > r * 0.2 ? P(i) : null);
  const eL = ear(LEFT_EAR);
  const eR = ear(RIGHT_EAR);
  const earMid = eL && eR ? lerp(eL, eR, 0.5) : (eL ?? eR);
  const up: Pt = [nose[0] - sMid[0], nose[1] - sMid[1]];
  const ul = Math.hypot(up[0], up[1]) || 1;
  const c: Pt = earMid
    ? [earMid[0] * 0.6 + nose[0] * 0.4, earMid[1] * 0.6 + nose[1] * 0.4]
    : [nose[0] - (up[0] / ul) * r * 0.1, nose[1] - (up[1] / ul) * r * 0.1];
  // Blickrichtung: aus Ohren, sonst aus dem seitlichen Versatz der Nase gegenüber der Körperachse
  const axis: Pt = [sMid[0] - hMid[0], sMid[1] - hMid[1]];
  const al = Math.hypot(axis[0], axis[1]) || 1;
  const side = ((nose[0] - sMid[0]) * -axis[1] + (nose[1] - sMid[1]) * axis[0]) / al; // senkrecht zur Achse
  const facingRaw = earMid ? (nose[0] - earMid[0]) / r : side / r;
  return { c, r, angle: Math.atan2(up[1], up[0]) + Math.PI / 2, facing: Math.max(-1, Math.min(1, facingRaw)) };
}

function inHeadSpace(ctx: C, h: HeadGeo, draw: () => void): void {
  ctx.save();
  ctx.translate(h.c[0], h.c[1]);
  ctx.rotate(h.angle);
  draw();
  ctx.restore();
}

function drawHairBack(ctx: C, h: HeadGeo, a: AvatarDef): void {
  const r = h.r;
  const back = -Math.sign(h.facing || 0.0001) * Math.min(1, Math.abs(h.facing) * 1.5);
  inHeadSpace(ctx, h, () => {
    ctx.fillStyle = a.hair;
    if (a.hairStyle === "ponytail" || (a.hairStyle === "curly" && a.name === "Zara")) {
      ctx.beginPath();
      ctx.ellipse(back * r * 0.9, r * 0.6, r * 0.32, r * 0.85, back * 0.3, 0, Math.PI * 2);
      ctx.fill();
    }
    if (a.hairStyle === "braid") {
      for (let k = 0; k < 6; k++) {
        ctx.beginPath();
        ctx.arc(r * (0.55 + back * 0.3), r * (0.5 + k * 0.32), r * (0.22 - k * 0.015), 0, Math.PI * 2);
        ctx.fill();
      }
    }
    if (a.hairStyle === "bangs") {
      ctx.beginPath();
      ctx.moveTo(-r * 1.05, -r * 0.2);
      ctx.lineTo(-r * 1.1, r * 1.5);
      ctx.lineTo(r * 1.1, r * 1.5);
      ctx.lineTo(r * 1.05, -r * 0.2);
      ctx.fill();
    }
  });
}

function drawHead(ctx: C, h: HeadGeo, a: AvatarDef): void {
  const r = h.r;
  inHeadSpace(ctx, h, () => {
    // Gesicht/Kopf (ohne Gesichtszüge), leichte Schattierung
    const g = ctx.createRadialGradient(-r * 0.3, -r * 0.35, r * 0.1, 0, 0, r * 1.1);
    g.addColorStop(0, shade(a.skin, 0.12));
    g.addColorStop(1, shade(a.skin, -0.2));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(0, 0, r * 0.84, r, 0, 0, Math.PI * 2);
    ctx.fill();
    // Ohr auf der Seite, die man im Profil sieht
    if (Math.abs(h.facing) > 0.35) {
      ctx.fillStyle = shade(a.skin, -0.12);
      ctx.beginPath();
      ctx.ellipse(-Math.sign(h.facing) * r * 0.1, r * 0.05, r * 0.14, r * 0.2, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    // Haare
    ctx.fillStyle = a.hair;
    const cap = (depth: number) => {
      ctx.beginPath();
      ctx.ellipse(0, -r * 0.08, r * 0.9, r * 0.98, 0, Math.PI, 2 * Math.PI);
      ctx.lineTo(r * 0.9, -r * 0.08 + depth);
      ctx.quadraticCurveTo(0, -r * 0.35 + depth, -r * 0.9, -r * 0.08 + depth);
      ctx.closePath();
      ctx.fill();
    };
    switch (a.hairStyle) {
      case "buzz":
        ctx.globalAlpha = 0.85;
        cap(r * 0.05);
        ctx.globalAlpha = 1;
        break;
      case "short":
      case "slick":
      case "headband":
        cap(r * 0.18);
        if (a.hairStyle === "short") {
          ctx.beginPath();
          ctx.ellipse(r * 0.2 * (h.facing || 1), -r * 0.92, r * 0.5, r * 0.22, -0.2, 0, Math.PI * 2);
          ctx.fill();
        }
        if (a.hairStyle === "headband") {
          ctx.fillStyle = "#1b1c1f";
          ctx.fillRect(-r * 0.9, -r * 0.42, r * 1.8, r * 0.2);
          ctx.fillStyle = a.accent;
          ctx.fillRect(-r * 0.2, -r * 0.4, r * 0.4, r * 0.16);
        }
        break;
      case "bun":
      case "ponytail":
      case "braid":
        cap(r * 0.12);
        if (a.hairStyle === "bun") {
          ctx.beginPath();
          ctx.arc(0, -r * 1.05, r * 0.36, 0, Math.PI * 2);
          ctx.fill();
        }
        break;
      case "curly":
        cap(r * 0.15);
        for (let k = 0; k < 9; k++) {
          const ang = Math.PI + (k / 8) * Math.PI;
          ctx.beginPath();
          ctx.arc(Math.cos(ang) * r * 0.85, -r * 0.08 + Math.sin(ang) * r * 0.95, r * 0.24, 0, Math.PI * 2);
          ctx.fill();
        }
        break;
      case "bangs":
        cap(r * 0.12);
        ctx.fillRect(-r * 0.82, -r * 0.5, r * 1.64, r * 0.32);
        break;
    }
  });
}
