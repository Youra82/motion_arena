import { LM, type Landmark, type PoseFrame } from "@motion-arena/shared";
import { angleDeg, clamp } from "@motion-arena/pose-engine";

/**
 * Live Body Load – freier Analysemodus (docs/LIVE_BODY_LOAD.md).
 *
 * Getrennt geführt:
 *  - Bewegungsintensität: aus der Geschwindigkeit der Gelenke, teilweise aus Video schätzbar.
 *  - Vermutete Beanspruchung: grobe, modellbasierte Heuristik je Körperzone.
 * NICHT messbar und daher nie behauptet: Muskelaktivität, Kräfte, Druck, Gewicht pro Bein, Verletzungsrisiko.
 * Ausgabe nur als Stufen (gering/mittel/hoch/unsicher), keine Prozentwerte.
 */
export type ZoneId =
  | "oberschenkelL"
  | "oberschenkelR"
  | "gesaessL"
  | "gesaessR"
  | "wadeL"
  | "wadeR"
  | "rumpf"
  | "schulterL"
  | "schulterR"
  | "armL"
  | "armR";

export const ZONE_LABELS: Record<ZoneId, string> = {
  oberschenkelL: "Oberschenkel links",
  oberschenkelR: "Oberschenkel rechts",
  gesaessL: "Gesäß/Hüfte links",
  gesaessR: "Gesäß/Hüfte rechts",
  wadeL: "Wade links",
  wadeR: "Wade rechts",
  rumpf: "Rumpf",
  schulterL: "Schulter links",
  schulterR: "Schulter rechts",
  armL: "Arm links",
  armR: "Arm rechts",
};

export const ZONES = Object.keys(ZONE_LABELS) as ZoneId[];

export type LoadLevel = "gering" | "mittel" | "hoch" | "unsicher";

export interface ZoneState {
  level: LoadLevel;
  /** Interner geglätteter Wert 0..1 – nur für Darstellung (Farbstärke), nie als Prozent zeigen. */
  value: number;
}

export type MovementId =
  | "keine-person"
  | "stehen"
  | "einbeinstand"
  | "kniebeuge"
  | "ausfallschritt"
  | "hampelmann"
  | "armheben"
  | "stuetz"
  | "unbekannt";

export const MOVEMENT_LABELS: Record<MovementId, string> = {
  "keine-person": "Keine Person",
  stehen: "Stehen",
  einbeinstand: "Einbeinstand",
  kniebeuge: "Kniebeuge",
  ausfallschritt: "Ausfallschritt",
  hampelmann: "Hampelmann",
  armheben: "Arme heben",
  stuetz: "Stütz / Plank",
  unbekannt: "Unbekannte Bewegung",
};

export type IntensityLevel = "ruhig" | "mäßig" | "lebhaft" | "unsicher";

export interface BodyLoadResult {
  t: number;
  movement: { id: MovementId; label: string; confidence: number };
  intensity: { level: IntensityLevel; value: number };
  zones: Record<ZoneId, ZoneState>;
}

/** Momentaufnahme der Körpermerkmale (Weltkoordinaten in Metern, y nach unten). */
export interface BodyFeatures {
  kneeFlexL: number;
  kneeFlexR: number;
  hipFlexL: number;
  hipFlexR: number;
  shoulderAbdL: number;
  shoulderAbdR: number;
  /** Rumpfneigung gegen die Senkrechte (0 = aufrecht, 90 = waagerecht). */
  trunkIncl: number;
  /** Welcher Fuß angehoben ist (deutlich höher als der andere), sonst null. */
  liftedFoot: "L" | "R" | null;
  /** Abstand der Knöchel relativ zur Beinlänge. */
  stance: number;
  legLength: number;
  /** Neigung der Beine (Hüftmitte → Knöchelmitte) gegen die Senkrechte: Stehen ≈ 0, Plank ≈ 70–90. */
  legIncl: number;
  /**
   * Waagerechter Abstand des Körperschwerpunkts (grob: Rumpf) von der Fußmitte, relativ zur Beinlänge.
   * Frei gehaltene Kniebeuge ≈ 0,05 (Schwerpunkt über den Füßen); Sitzen mit aufrechtem Rumpf ≈ 0,15.
   */
  comOffset: number;
}

const VIS = 0.5;
/** Alle Punkte, aus denen die Stufe einer Zone tatsächlich berechnet wird (Winkel brauchen alle drei Punkte). */
const NEEDS: Record<ZoneId, number[]> = {
  oberschenkelL: [LM.LEFT_HIP, LM.LEFT_KNEE, LM.LEFT_ANKLE],
  oberschenkelR: [LM.RIGHT_HIP, LM.RIGHT_KNEE, LM.RIGHT_ANKLE],
  gesaessL: [LM.LEFT_SHOULDER, LM.LEFT_HIP, LM.LEFT_KNEE],
  gesaessR: [LM.RIGHT_SHOULDER, LM.RIGHT_HIP, LM.RIGHT_KNEE],
  wadeL: [LM.LEFT_HIP, LM.LEFT_KNEE, LM.LEFT_ANKLE],
  wadeR: [LM.RIGHT_HIP, LM.RIGHT_KNEE, LM.RIGHT_ANKLE],
  rumpf: [LM.LEFT_SHOULDER, LM.RIGHT_SHOULDER, LM.LEFT_HIP, LM.RIGHT_HIP],
  schulterL: [LM.LEFT_HIP, LM.LEFT_SHOULDER, LM.LEFT_ELBOW],
  schulterR: [LM.RIGHT_HIP, LM.RIGHT_SHOULDER, LM.RIGHT_ELBOW],
  armL: [LM.LEFT_HIP, LM.LEFT_SHOULDER, LM.LEFT_ELBOW, LM.LEFT_WRIST],
  armR: [LM.RIGHT_HIP, LM.RIGHT_SHOULDER, LM.RIGHT_ELBOW, LM.RIGHT_WRIST],
};
/** Gelenke für Geschwindigkeit/Intensität. */
const SPEED_JOINTS = [11, 12, 13, 14, 15, 16, 25, 26, 27, 28];
const CORE = [11, 12, 23, 24, 25, 26, 27, 28];
/** Schneller bewegt sich kein Gelenk im Training (m/s) – darüber ist es ein Erkennungsausreißer. */
const MAX_JOINT_SPEED = 10;
/** Längere Bildlücke: Geschwindigkeiten neu aufbauen statt alte Werte weiterzuführen (s). */
const MAX_GAP_S = 0.5;

/** Gelenke, deren Geschwindigkeit in die dynamische Beanspruchung einer Zone eingeht. */
const DYNAMIC: Record<ZoneId, number[]> = {
  oberschenkelL: [LM.LEFT_KNEE],
  oberschenkelR: [LM.RIGHT_KNEE],
  gesaessL: [LM.LEFT_KNEE],
  gesaessR: [LM.RIGHT_KNEE],
  wadeL: [LM.LEFT_ANKLE],
  wadeR: [LM.RIGHT_ANKLE],
  rumpf: [LM.LEFT_SHOULDER, LM.RIGHT_SHOULDER],
  schulterL: [LM.LEFT_ELBOW],
  schulterR: [LM.RIGHT_ELBOW],
  armL: [LM.LEFT_WRIST],
  armR: [LM.RIGHT_WRIST],
};

const lin = (v: number, lo: number, hi: number) => clamp((v - lo) / (hi - lo), 0, 1);
const finitePt = (p: Landmark | undefined) => !!p && Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z);
const mid = (a: Landmark, b: Landmark) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2 });
const dist3 = (a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }) =>
  Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

/** Merkmale aus Weltkoordinaten; null, wenn die nötigen Punkte fehlen. */
export function bodyFeatures(world: Landmark[] | null | undefined): BodyFeatures | null {
  if (!world || world.length < 33) return null;
  const need = [11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28];
  if (!need.every((i) => finitePt(world[i]))) return null;
  const W = (i: number) => world[i]!;
  const flex = (a: number, b: number, c: number) => 180 - (angleDeg(W(a), W(b), W(c), true) ?? 180);
  const abd = (hip: number, sh: number, el: number) => angleDeg(W(hip), W(sh), W(el), true) ?? 0;
  const sMid = mid(W(LM.LEFT_SHOULDER), W(LM.RIGHT_SHOULDER));
  const hMid = mid(W(LM.LEFT_HIP), W(LM.RIGHT_HIP));
  const tv = { x: sMid.x - hMid.x, y: sMid.y - hMid.y, z: sMid.z - hMid.z };
  const tl = Math.hypot(tv.x, tv.y, tv.z) || 1;
  if (Math.hypot(tv.x, tv.y, tv.z) < 0.05) return null; // kollabierter Rumpf: nicht auswertbar
  const trunkIncl = (Math.acos(clamp(-tv.y / tl, -1, 1)) * 180) / Math.PI; // "oben" = -y
  const legL = dist3(W(LM.LEFT_HIP), W(LM.LEFT_KNEE)) + dist3(W(LM.LEFT_KNEE), W(LM.LEFT_ANKLE));
  const legR = dist3(W(LM.RIGHT_HIP), W(LM.RIGHT_KNEE)) + dist3(W(LM.RIGHT_KNEE), W(LM.RIGHT_ANKLE));
  if (legL < 0.1 || legR < 0.1) return null; // Beinsegmente ohne Länge: nicht auswertbar
  const legLength = (legL + legR) / 2;
  // Höhenunterschied der Knöchel entlang der Körperachse (Hüfte → Schulter) statt der Bildsenkrechten:
  // so erzeugt eine schräg gehaltene Kamera (Rollwinkel) keinen scheinbaren Einbeinstand.
  const up = { x: tv.x / tl, y: tv.y / tl, z: tv.z / tl };
  const la = W(LM.LEFT_ANKLE);
  const ra = W(LM.RIGHT_ANKLE);
  const rise = (la.x - ra.x) * up.x + (la.y - ra.y) * up.y + (la.z - ra.z) * up.z; // > 0: links höher
  // Angehoben nur bei aufrechtem Rumpf (im Stütz liegen die Füße ohnehin unterschiedlich).
  const liftedFoot = trunkIncl < 45 && Math.abs(rise) > 0.14 * legLength ? (rise > 0 ? "L" : "R") : null;
  const aMid = mid(la, ra);
  const lv = { x: aMid.x - hMid.x, y: aMid.y - hMid.y, z: aMid.z - hMid.z };
  const legIncl = (Math.acos(clamp(lv.y / (Math.hypot(lv.x, lv.y, lv.z) || 1), -1, 1)) * 180) / Math.PI;
  // Fußmitte aus Knöcheln, Fersen und Zehen (falls vorhanden), Schwerpunkt grob 1/3 Schulter- + 2/3 Hüftmitte.
  const feet = [27, 28, 29, 30, 31, 32].filter((i) => finitePt(world[i])).map(W);
  const fx = feet.reduce((a, q) => a + q.x, 0) / feet.length;
  const fz = feet.reduce((a, q) => a + q.z, 0) / feet.length;
  const comOffset = Math.hypot((sMid.x + 2 * hMid.x) / 3 - fx, (sMid.z + 2 * hMid.z) / 3 - fz) / legLength;
  return {
    kneeFlexL: flex(LM.LEFT_HIP, LM.LEFT_KNEE, LM.LEFT_ANKLE),
    kneeFlexR: flex(LM.RIGHT_HIP, LM.RIGHT_KNEE, LM.RIGHT_ANKLE),
    hipFlexL: flex(LM.LEFT_SHOULDER, LM.LEFT_HIP, LM.LEFT_KNEE),
    hipFlexR: flex(LM.RIGHT_SHOULDER, LM.RIGHT_HIP, LM.RIGHT_KNEE),
    shoulderAbdL: abd(LM.LEFT_HIP, LM.LEFT_SHOULDER, LM.LEFT_ELBOW),
    shoulderAbdR: abd(LM.RIGHT_HIP, LM.RIGHT_SHOULDER, LM.RIGHT_ELBOW),
    trunkIncl,
    liftedFoot,
    stance: dist3(W(LM.LEFT_ANKLE), W(LM.RIGHT_ANKLE)) / legLength,
    legLength,
    legIncl,
    comOffset,
  };
}

/** Verlauf im Erkennungsfenster, aus dem dynamische Belege kommen. */
export interface MotionContext {
  /** Spannweite der Armabspreizung im Fenster (Grad). */
  armRange: number;
  /** Spannweite der Fußstellung im Fenster (relativ zur Beinlänge). */
  stanceRange: number;
}

/**
 * Bewegung aus Merkmalen + Geschwindigkeit (m/s) + Verlauf. Reihenfolge = Priorität.
 * Jede Bewegung braucht einen eigenen Beleg; mehrdeutige Posen werden "unbekannt" statt geraten.
 */
export function classifyMovement(
  f: BodyFeatures,
  speed: number,
  ctx: MotionContext | number,
): { id: MovementId; margin: number } {
  const { armRange, stanceRange } = typeof ctx === "number" ? { armRange: ctx, stanceRange: Infinity } : ctx;
  const kneeMax = Math.max(f.kneeFlexL, f.kneeFlexR);
  const kneeMin = Math.min(f.kneeFlexL, f.kneeFlexR);
  const abdAvg = (f.shoulderAbdL + f.shoulderAbdR) / 2;
  // Stütz: Rumpf UND Beine flach. Vorbeugen mit senkrechten Beinen ist kein Plank.
  if (f.trunkIncl > 55 && !f.liftedFoot) {
    if (f.legIncl > 45) return { id: "stuetz", margin: Math.min(1, (f.trunkIncl - 55) / 35) };
    // Vorbeuge mit gestreckten Beinen: kein Plank, keine bekannte Übung. Mit gebeugten Knien weiter prüfen.
    if (kneeMax < 35) return { id: "unbekannt", margin: 0.3 };
  }
  // Hampelmann: Arme UND Beine öffnen/schließen sich; Armschwingen allein reicht nicht.
  if (speed > 0.9 && armRange > 70 && stanceRange > 0.25)
    return { id: "hampelmann", margin: Math.min(1, (speed - 0.9) / 0.9) };
  if (f.liftedFoot) return { id: "einbeinstand", margin: 0.8 };
  if (f.stance > 0.8 && kneeMax > 50)
    return { id: "ausfallschritt", margin: Math.min(1, (f.stance - 0.8) / 0.4) };
  if (kneeMin > 35 && Math.abs(f.kneeFlexL - f.kneeFlexR) < 25) {
    // Frei gehalten nur, wenn der Schwerpunkt über den Füßen liegt – sonst sitzt die Person vermutlich.
    if (f.comOffset > 0.12) return { id: "unbekannt", margin: 0.3 };
    const balance = 1 - lin(f.comOffset, 0.08, 0.12);
    return { id: "kniebeuge", margin: Math.min(1, (kneeMin - 35) / 40) * (0.5 + 0.5 * balance) };
  }
  if (abdAvg > 70 && kneeMax < 25) return { id: "armheben", margin: Math.min(1, (abdAvg - 70) / 60) };
  if (kneeMax < 20 && speed < 0.5) return { id: "stehen", margin: 1 - kneeMax / 20 };
  return { id: "unbekannt", margin: 0.3 };
}

/** Statische (haltungsbedingte) Beanspruchung je Zone, 0..1 – grobe Heuristik. */
export function staticLoad(f: BodyFeatures, m: MovementId): Record<ZoneId, number> {
  const side = (s: "L" | "R") => {
    const knee = s === "L" ? f.kneeFlexL : f.kneeFlexR;
    const hip = s === "L" ? f.hipFlexL : f.hipFlexR;
    const abdS = s === "L" ? f.shoulderAbdL : f.shoulderAbdR;
    const lifted = f.liftedFoot === s;
    const stanceLeg = f.liftedFoot !== null && !lifted;
    const frontLunge = m === "ausfallschritt" && knee >= (s === "L" ? f.kneeFlexR : f.kneeFlexL);
    return {
      oberschenkel: lifted ? 0.3 : lin(knee, 10, 90) * 0.95 + (stanceLeg ? 0.4 : 0) + (frontLunge ? 0.15 : 0),
      gesaess: lifted ? 0.25 : lin(hip, 20, 100) * 0.85 + (stanceLeg ? 0.45 : 0) + (frontLunge ? 0.15 : 0),
      wade: lifted ? 0.1 : (stanceLeg ? 0.45 : 0) + lin(knee, 30, 100) * 0.25,
      schulter: m === "stuetz" ? 0.7 : lin(abdS, 30, 130) * 0.7,
      arm: m === "stuetz" ? 0.6 : lin(abdS, 60, 160) * 0.3,
    };
  };
  const L = side("L");
  const R = side("R");
  const rumpf =
    m === "stuetz"
      ? 0.85
      : lin(f.trunkIncl, 10, 60) * 0.7 +
        (f.liftedFoot ? 0.4 : 0) +
        (m === "ausfallschritt" ? 0.4 : 0) +
        (m === "kniebeuge" ? 0.3 : 0) +
        lin((f.shoulderAbdL + f.shoulderAbdR) / 2, 120, 180) * 0.2;
  const c = (v: number) => clamp(v, 0, 1);
  return {
    oberschenkelL: c(L.oberschenkel),
    oberschenkelR: c(R.oberschenkel),
    gesaessL: c(L.gesaess),
    gesaessR: c(R.gesaess),
    wadeL: c(L.wade),
    wadeR: c(R.wade),
    rumpf: c(rumpf),
    schulterL: c(L.schulter),
    schulterR: c(R.schulter),
    armL: c(L.arm),
    armR: c(R.arm),
  };
}

export interface BodyLoadOptions {
  /** Zeitkonstante der Glättung (ms). */
  tauMs: number;
  /** Hysterese um die Stufengrenzen 1/3 und 2/3. */
  hysteresis: number;
  /** Fenster für die Bewegungserkennung (ms). */
  windowMs: number;
}

export const DEFAULT_BODYLOAD: BodyLoadOptions = { tauMs: 450, hysteresis: 0.05, windowMs: 1500 };

const emptyZones = (level: LoadLevel): Record<ZoneId, ZoneState> =>
  Object.fromEntries(ZONES.map((z) => [z, { level, value: 0 }])) as Record<ZoneId, ZoneState>;

/** Analysiert eine Bildfolge (geglättete Frames, steigende Zeit). */
export class BodyLoadAnalyzer {
  private lastT: number | null = null;
  private lastWorld: Landmark[] | null = null;
  private speeds = new Map<number, number>();
  private values = new Map<ZoneId, number>();
  private levels = new Map<ZoneId, LoadLevel>();
  private history: Array<{ t: number; id: MovementId; abd: number; stance: number; margin: number; side: "L" | "R" | null }> = [];
  private speedAvg = 0;
  /** Wie viele Bilder in Folge ein Punkt als Ausreißer festgehalten wurde. */
  private outlierRun = new Map<number, number>();

  constructor(private readonly o: BodyLoadOptions = DEFAULT_BODYLOAD) {}

  reset(): void {
    this.lastT = null;
    this.lastWorld = null;
    this.speeds.clear();
    this.outlierRun.clear();
    this.values.clear();
    this.levels.clear();
    this.history = [];
    this.speedAvg = 0;
  }

  private levelFor(z: ZoneId, v: number): LoadLevel {
    const prev = this.levels.get(z);
    const h = this.o.hysteresis;
    const lo = 1 / 3 + (prev === "gering" ? h : prev === "mittel" ? -h : 0);
    const hi = 2 / 3 + (prev === "hoch" ? -h : h);
    const lvl: LoadLevel = v >= hi ? "hoch" : v >= lo ? "mittel" : "gering";
    this.levels.set(z, lvl);
    return lvl;
  }

  /** Zone nicht beurteilbar: Filterzustand verwerfen, damit keine alte Stufe stehen bleibt. */
  private dropZone(z: ZoneId): ZoneState {
    this.values.delete(z);
    this.levels.delete(z);
    return { level: "unsicher", value: 0 };
  }

  private clearMotion(): void {
    this.lastT = null;
    this.lastWorld = null;
    this.speeds.clear();
    this.speedAvg = 0;
  }

  update(frame: PoseFrame): BodyLoadResult {
    const t = frame.t;
    const lms = frame.landmarks;
    const world = frame.worldLandmarks ?? null;
    if (!lms) {
      this.reset();
      return {
        t,
        movement: { id: "keine-person", label: MOVEMENT_LABELS["keine-person"], confidence: 0 },
        intensity: { level: "unsicher", value: 0 },
        zones: emptyZones("unsicher"),
      };
    }
    if (!world || world.length < 33) {
      // Person im Bild, aber keine 3D-Punkte: nichts beurteilbar – aber nicht "keine Person".
      this.reset();
      return {
        t,
        movement: { id: "unbekannt", label: "Körper nicht auswertbar", confidence: 0 },
        intensity: { level: "unsicher", value: 0 },
        zones: emptyZones("unsicher"),
      };
    }
    // Ein Punkt zählt nur, wenn er im Bild sichtbar ist UND gültige Weltkoordinaten hat.
    const usable = (ids: number[]) => ids.every((i) => (lms[i]?.visibility ?? 0) >= VIS && finitePt(world[i]));
    const dt = this.lastT === null ? 0 : (t - this.lastT) / 1000;

    // Nach einer Bildlücke keine alte Bewegung weiterführen: Geschwindigkeiten neu aufbauen.
    if (dt >= MAX_GAP_S || dt < 0) this.clearMotion();
    const step = this.lastT === null ? 0 : (t - this.lastT) / 1000;
    const a = step > 0 ? 1 - Math.exp(-(step * 1000) / this.o.tauMs) : 1;
    // Unmögliche Sprünge einzelner Punkte (Erkennungsausreißer) gelten für Geschwindigkeit, Haltung UND
    // Erkennungsfenster nicht: der Punkt behält seine letzte plausible Lage.
    // Springt der ganze Körper (Bildwechsel/Neuerkennung), ist das kein Ausreißer, sondern ein Neuanfang.
    // Ein einzelner Punkt gilt höchstens zwei Bilder lang als Ausreißer, danach zählt seine neue Lage.
    const prevW = this.lastWorld;
    const jumpedRaw = (i: number) => {
      const p = world[i];
      const q = prevW?.[i];
      return !!q && step > 0 && finitePt(p) && finitePt(q) && dist3(p!, q) / step > MAX_JOINT_SPEED;
    };
    const jumpedIds = world.map((_, i) => jumpedRaw(i));
    const nJumped = jumpedIds.filter(Boolean).length;
    if (nJumped > world.length / 3) {
      this.clearMotion();
      this.outlierRun.clear();
    }
    const holdPrev = (i: number) => {
      if (!this.lastWorld || !jumpedIds[i]) {
        this.outlierRun.delete(i);
        return false;
      }
      const run = (this.outlierRun.get(i) ?? 0) + 1;
      this.outlierRun.set(i, run);
      return run <= 2;
    };
    const clean = world.map((p, i) => (holdPrev(i) ? { ...prevW![i]! } : p));
    const f = bodyFeatures(clean);

    // Geschwindigkeiten (m/s), geglättet; unplausible Sprünge (Erkennungsausreißer) werden verworfen.
    if (this.lastWorld && step > 0) {
      for (const i of SPEED_JOINTS) {
        const p = clean[i]!;
        const q = this.lastWorld[i]!;
        if (!finitePt(p) || !finitePt(q)) continue;
        const v = dist3(p, q) / step;
        if (v > MAX_JOINT_SPEED) continue;
        this.speeds.set(i, (this.speeds.get(i) ?? v) * (1 - a) + v * a);
      }
    }
    this.lastT = t;
    // Referenzpunkte: Ausreißer nicht übernehmen (sonst zählt der Rücksprung als zweiter Sprung).
    this.lastWorld = clean.map((p) => ({ ...p }));
    const known = (ids: number[]) => ids.filter((i) => this.speeds.has(i));
    const sp = (ids: number[]) => {
      const k = known(ids);
      return k.length ? k.reduce((s, i) => s + this.speeds.get(i)!, 0) / k.length : 0;
    };
    const speedIds = [15, 16, 27, 28, 13, 14, 25, 26];
    const speedKnown = known(speedIds).length >= speedIds.length / 2;
    const speed = sp(speedIds);
    this.speedAvg = speed;
    const intensityOf = (): BodyLoadResult["intensity"] =>
      speedKnown
        ? { level: speed < 0.25 ? "ruhig" : speed < 0.8 ? "mäßig" : "lebhaft", value: speed }
        : { level: "unsicher", value: 0 }; // erst nach zwei verwertbaren Zeitpunkten

    if (!f || !usable(CORE)) {
      return {
        t,
        movement: { id: "unbekannt", label: "Körper nicht vollständig sichtbar", confidence: 0 },
        intensity: { level: "unsicher", value: 0 },
        zones: Object.fromEntries(
          ZONES.map((z) => [
            z,
            usable(NEEDS[z]) ? { level: this.levels.get(z) ?? "gering", value: this.values.get(z) ?? 0 } : this.dropZone(z),
          ]),
        ) as Record<ZoneId, ZoneState>,
      };
    }

    // Bewegung: Verlauf im Fenster (Arm- und Fußspanne) und Mehrheitsentscheid gegen Flackern.
    const abd = (f.shoulderAbdL + f.shoulderAbdR) / 2;
    this.history = this.history.filter((h) => t - h.t <= this.o.windowMs);
    const span = (vals: number[]) => Math.max(...vals) - Math.min(...vals);
    const armRange = span([...this.history.map((h) => h.abd), abd]);
    const stanceRange = span([...this.history.map((h) => h.stance), f.stance]);
    const raw = classifyMovement(f, speed, { armRange, stanceRange });
    this.history.push({ t, id: raw.id, abd, stance: f.stance, margin: raw.margin, side: raw.id === "einbeinstand" ? f.liftedFoot : null });
    const votes = new Map<MovementId, number>();
    for (const h of this.history) votes.set(h.id, (votes.get(h.id) ?? 0) + 1);
    const [id, n] = [...votes.entries()].sort((x, y) => y[1] - x[1])[0]!;
    const winners = this.history.filter((h) => h.id === id);
    // Wechselndes Standbein im Fenster = Gehen/Schritte, kein Einbeinstand.
    const sideSwitch = id === "einbeinstand" && new Set(winners.map((h) => h.side)).size > 1;
    const share = n / this.history.length;
    const margin = winners.reduce((s, h) => s + h.margin, 0) / winners.length; // Sicherheit des gewählten Kandidaten
    const visConf = CORE.reduce((s, i) => s + lms[i]!.visibility, 0) / CORE.length;
    const confidence = sideSwitch ? 0 : clamp(share * visConf * (0.6 + 0.4 * margin), 0, 1);
    const movementId: MovementId = confidence < 0.35 ? "unbekannt" : id;

    // Beanspruchung = Haltung + Dynamik, geglättet; nicht beurteilbare Zonen → "unsicher" (Filter verworfen).
    const stat = staticLoad(f, movementId);
    const zones = {} as Record<ZoneId, ZoneState>;
    for (const z of ZONES) {
      if (!usable(NEEDS[z])) {
        zones[z] = this.dropZone(z);
        continue;
      }
      const dyn = clamp(sp(DYNAMIC[z]) / 3, 0, 0.5);
      const target = clamp(stat[z] + dyn, 0, 1);
      const v = (this.values.get(z) ?? target) * (1 - a) + target * a;
      this.values.set(z, v);
      zones[z] = { level: this.levelFor(z, v), value: v };
    }
    return {
      t,
      movement: { id: movementId, label: MOVEMENT_LABELS[movementId], confidence },
      intensity: intensityOf(),
      zones,
    };
  }

  /** Aktuelle Gelenkgeschwindigkeiten (m/s) – für die Ansicht „Bewegungszonen“. */
  jointSpeeds(): ReadonlyMap<number, number> {
    return this.speeds;
  }
}
