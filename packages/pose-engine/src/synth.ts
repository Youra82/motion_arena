import { LANDMARK_COUNT, LM, type Landmark, type PoseFrame } from "@motion-arena/shared";

/**
 * Synthetische Posen für Tests und den Demo-Modus.
 * KEINE echten Messdaten – ein vereinfachtes Strichmännchen mit plausiblen Proportionen.
 */
export interface SynthOptions {
  /** Kniebeugung in Grad: 0 = gestreckt, 90 ≈ Kniewinkel 90°. */
  kneeFlexDeg: number;
  view: "front" | "side";
  /** Seitenverhältnis des Bildes (Breite/Höhe), z. B. 9/16 hochkant. */
  aspect?: number;
  /** Zusätzliche Rumpfvorneigung in Grad. */
  extraLeanDeg?: number;
  /** Asymmetrie: rechtes Knie wird um so viele Grad weniger gebeugt. */
  rightKneeOffsetDeg?: number;
  /** Bildhöhe der Person (normalisiert) – kleiner = weiter weg. */
  scale?: number;
  /** Horizontaler Mittelpunkt im Bild. */
  centerX?: number;
  /** Bodenlinie im Bild (y der Knöchel). */
  groundY?: number;
  /** Gaussches Rauschen (Standardabweichung, normalisierte Bildkoordinaten). */
  noise?: number;
  /** Zufallsquelle 0..1 (deterministisch in Tests). */
  rng?: () => number;
  /** Sichtbarkeit einzelner Landmarks überschreiben. */
  visibility?: Partial<Record<number, number>>;
  /** Ohne Weltkoordinaten erzeugen (nur 2D). */
  noWorld?: boolean;
  /** Zusätzliche Drehung der Weltkoordinaten um die Hochachse (Grad). */
  worldYawDeg?: number;
}

const SHIN = 0.45;
const THIGH = 0.45;
const TORSO = 0.55;
const HIP_W = 0.3;
const SHOULDER_W = 0.4;
const UPPER_ARM = 0.3;
const FOREARM = 0.28;
const BODY_H = 1.75;

interface P3 {
  lat: number; // seitlich (Person-links positiv)
  up: number; // nach oben
  fwd: number; // nach vorne (Blickrichtung der Person)
}

/** Deterministischer Zufallsgenerator (mulberry32). */
export function seededRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gauss(rng: () => number): number {
  const u = Math.max(1e-12, rng());
  const v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function legChain(flexDeg: number, lat: number): { ankle: P3; knee: P3; hip: P3; heel: P3; toe: P3 } {
  const rad = (d: number) => (d * Math.PI) / 180;
  const s = rad(0.4 * flexDeg); // Schienbein-Vorlage
  const t = rad(0.6 * flexDeg); // Oberschenkel-Rücklage
  const ankle: P3 = { lat, up: 0.08, fwd: 0 };
  const knee: P3 = { lat, up: ankle.up + SHIN * Math.cos(s), fwd: SHIN * Math.sin(s) };
  const hip: P3 = { lat, up: knee.up + THIGH * Math.cos(t), fwd: knee.fwd - THIGH * Math.sin(t) };
  return {
    ankle,
    knee,
    hip,
    heel: { lat, up: 0.02, fwd: -0.06 },
    toe: { lat, up: 0.0, fwd: 0.16 },
  };
}

export function synthPose(o: SynthOptions): { landmarks: Landmark[]; worldLandmarks: Landmark[] | null } {
  const aspect = o.aspect ?? 9 / 16;
  const flexL = Math.max(0, o.kneeFlexDeg);
  const flexR = Math.max(0, o.kneeFlexDeg - (o.rightKneeOffsetDeg ?? 0));
  const L = legChain(flexL, HIP_W / 2);
  const R = legChain(flexR, -HIP_W / 2);
  const hipMid: P3 = { lat: 0, up: (L.hip.up + R.hip.up) / 2, fwd: (L.hip.fwd + R.hip.fwd) / 2 };
  const leanRad = ((0.55 * 0.6 * o.kneeFlexDeg + (o.extraLeanDeg ?? 0)) * Math.PI) / 180;
  const shoulderMid: P3 = {
    lat: 0,
    up: hipMid.up + TORSO * Math.cos(leanRad),
    fwd: hipMid.fwd + TORSO * Math.sin(leanRad),
  };
  const sh = (lat: number): P3 => ({ ...shoulderMid, lat });
  const ls = sh(SHOULDER_W / 2);
  const rs = sh(-SHOULDER_W / 2);
  // Arme nach vorne gestreckt (Gegengewicht), leicht unter Schulterhöhe.
  const armFwd = (s: P3, len: number): P3 => ({ lat: s.lat * 0.9, up: s.up - 0.05 * len, fwd: s.fwd + len });
  const le = armFwd(ls, UPPER_ARM);
  const re = armFwd(rs, UPPER_ARM);
  const lw = armFwd(ls, UPPER_ARM + FOREARM);
  const rw = armFwd(rs, UPPER_ARM + FOREARM);
  const nose: P3 = {
    lat: 0,
    up: shoulderMid.up + 0.22 * Math.cos(leanRad),
    fwd: shoulderMid.fwd + 0.22 * Math.sin(leanRad) + 0.1,
  };

  const pts: P3[] = Array.from({ length: LANDMARK_COUNT }, () => ({ ...nose }));
  const set = (i: number, p: P3) => (pts[i] = p);
  set(LM.NOSE, nose);
  set(LM.LEFT_SHOULDER, ls);
  set(LM.RIGHT_SHOULDER, rs);
  set(LM.LEFT_ELBOW, le);
  set(LM.RIGHT_ELBOW, re);
  set(LM.LEFT_WRIST, lw);
  set(LM.RIGHT_WRIST, rw);
  set(LM.LEFT_HIP, L.hip);
  set(LM.RIGHT_HIP, R.hip);
  set(LM.LEFT_KNEE, L.knee);
  set(LM.RIGHT_KNEE, R.knee);
  set(LM.LEFT_ANKLE, L.ankle);
  set(LM.RIGHT_ANKLE, R.ankle);
  set(LM.LEFT_HEEL, L.heel);
  set(LM.RIGHT_HEEL, R.heel);
  set(LM.LEFT_FOOT_INDEX, L.toe);
  set(LM.RIGHT_FOOT_INDEX, R.toe);
  // Restliche Gesichts-/Handpunkte nahe Nase bzw. Handgelenk.
  for (const i of [17, 19, 21]) set(i, lw);
  for (const i of [18, 20, 22]) set(i, rw);

  const scale = (o.scale ?? 0.75) / BODY_H; // normalisierte Bildhöhe je Meter
  const cx = o.centerX ?? 0.5;
  const ground = o.groundY ?? 0.92;
  const rng = o.rng ?? Math.random;
  const noise = o.noise ?? 0;

  const landmarks: Landmark[] = pts.map((p, i) => {
    // Seitenansicht: Person blickt nach rechts im Bild; Frontal: Person blickt zur Kamera
    // (Person-links erscheint im nicht gespiegelten Bild rechts).
    const screenX = o.view === "side" ? p.fwd + p.lat * 0.15 : p.lat;
    const depth = o.view === "side" ? -p.lat : -p.fwd; // Kamera bei negativer Tiefe
    let vis = 0.95;
    if (o.view === "side" && p.lat < 0 && i >= 11) vis = 0.7; // abgewandte Seite unsicherer
    const over = o.visibility?.[i];
    if (over !== undefined) vis = over;
    return {
      x: cx + (screenX * scale) / aspect + (noise ? gauss(rng) * noise : 0),
      y: ground - p.up * scale + (noise ? gauss(rng) * noise : 0),
      z: depth * scale,
      visibility: vis,
    };
  });

  // Weltkoordinaten kameraausgerichtet wie bei MediaPipe (x rechts im Bild, y unten, z von der Kamera weg),
  // Ursprung Hüftmitte; zusätzlich optional um die Hochachse gedreht.
  const yaw = ((o.view === "side" ? 90 : 0) + (o.worldYawDeg ?? 0)) * (Math.PI / 180);
  const worldLandmarks: Landmark[] | null = o.noWorld
    ? null
    : pts.map((p, i) => {
        const lat = p.lat - hipMid.lat;
        const fwd = p.fwd - hipMid.fwd;
        return {
          x: lat * Math.cos(yaw) + fwd * Math.sin(yaw),
          y: -(p.up - hipMid.up),
          z: lat * -Math.sin(yaw) + -fwd * Math.cos(yaw),
          visibility: landmarks[i]!.visibility,
        };
      });
  return { landmarks, worldLandmarks };
}

export function synthFrame(t: number, o: SynthOptions): PoseFrame {
  const { landmarks, worldLandmarks } = synthPose(o);
  return { t, landmarks, worldLandmarks, aspect: o.aspect ?? 9 / 16 };
}

export interface SquatScriptStep {
  /** Dauer in ms. */
  ms: number;
  /** Ziel-Kniebeugung am Ende des Schritts (Grad). */
  toFlex: number;
}

/**
 * Erzeugt eine Bildfolge aus Schritten (lineare Interpolation der Kniebeugung).
 * Startet bei Beugung 0 (Stand).
 */
export function synthSequence(
  steps: SquatScriptStep[],
  base: Omit<SynthOptions, "kneeFlexDeg">,
  fps = 30,
  startT = 0,
  startFlex = 0,
): PoseFrame[] {
  const frames: PoseFrame[] = [];
  const dt = 1000 / fps;
  let t = startT;
  let flex = startFlex;
  frames.push(synthFrame(t, { ...base, kneeFlexDeg: flex }));
  for (const s of steps) {
    const n = Math.max(1, Math.round(s.ms / dt));
    const from = flex;
    for (let k = 1; k <= n; k++) {
      t += dt;
      flex = from + ((s.toFlex - from) * k) / n;
      frames.push(synthFrame(t, { ...base, kneeFlexDeg: flex }));
    }
  }
  return frames;
}

/** Eine saubere Kniebeuge: 1 s runter, 0,3 s halten, 1 s hoch, 0,5 s stehen. */
export function cleanSquatSteps(depthFlex = 95): SquatScriptStep[] {
  return [
    { ms: 1000, toFlex: depthFlex },
    { ms: 300, toFlex: depthFlex },
    { ms: 1000, toFlex: 0 },
    { ms: 500, toFlex: 0 },
  ];
}
