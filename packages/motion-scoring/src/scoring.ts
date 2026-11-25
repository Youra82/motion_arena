import { clamp } from "@motion-arena/pose-engine";
import { DEFAULT_SQUAT_OPTIONS, type RepRecord, type SquatCounterOptions } from "./squat.js";

/**
 * Schematische Bewertung einer Kniebeuge. Bewusst einfach und nachvollziehbar:
 * KEINE medizinische oder biomechanisch validierte Beurteilung.
 */
export interface ScoreComponent {
  key: "depth" | "control" | "symmetry" | "posture";
  label: string;
  /** Erreichte Punkte (0..max) oder null, wenn nicht bewertbar (z. B. Blickwinkel). */
  points: number | null;
  max: number;
}

export interface RepScore {
  /** 0..100, normiert über die bewertbaren Teile. */
  total: number;
  components: ScoreComponent[];
  /** Kurze, verständliche Hinweise auf Deutsch. */
  feedback: string[];
  /** Immer true: Werte sind kamerabasierte Schätzungen. */
  estimated: true;
}

const lerp01 = (v: number, lo: number, hi: number) => clamp((v - lo) / (hi - lo), 0, 1);

export function scoreRep(input: RepRecord, o: SquatCounterOptions = DEFAULT_SQUAT_OPTIONS): RepScore {
  // Nicht endliche Messwerte gelten als "nicht bewertbar" statt den Score zu vergiften.
  const fin = (v: number | null) => (v !== null && Number.isFinite(v) ? v : null);
  const rep: RepRecord = {
    ...input,
    maxDepth: fin(input.maxDepth) ?? o.minCountDepth,
    bottomT: Math.max(input.startT, fin(input.bottomT) ?? input.startT),
    symmetryDiffDeg: fin(input.symmetryDiffDeg),
    maxTorsoLeanDeg: fin(input.maxTorsoLeanDeg),
  };
  const feedback: string[] = [];

  // Tiefe: an der Zählgrenze 25/50, ab "gut" 50/50.
  const depthPts = 25 + 25 * lerp01(rep.maxDepth, o.minCountDepth, o.goodDepth);
  if (rep.maxDepth < o.goodDepth) feedback.push("Etwas tiefer gehen");

  // Kontrolle: Absenkphase ≥ 0,8 s volle Punkte, ≤ 0,25 s kaum Punkte.
  const descentMs = rep.bottomT - rep.startT;
  const controlPts = 5 + 20 * lerp01(descentMs, 250, 800);
  if (descentMs < 500) feedback.push("Langsamer absenken");

  // Symmetrie: ≤ 8° Unterschied voll, ≥ 25° null.
  let symmetryPts: number | null = null;
  if (rep.symmetryDiffDeg !== null) {
    symmetryPts = 15 * (1 - lerp01(rep.symmetryDiffDeg, 8, 25));
    if (rep.symmetryDiffDeg > 15) feedback.push("Beide Beine gleichmäßiger beugen");
  }

  // Haltung: nur seitlich/schräg bewertbar. ≤ 45° voll, ≥ 65° null.
  let posturePts: number | null = null;
  if (rep.maxTorsoLeanDeg !== null && rep.view !== "front") {
    posturePts = 10 * (1 - lerp01(rep.maxTorsoLeanDeg, 45, 65));
    if (rep.maxTorsoLeanDeg > 55) feedback.push("Oberkörper aufrechter halten");
  }

  const components: ScoreComponent[] = [
    { key: "depth", label: "Tiefe", points: depthPts, max: 50 },
    { key: "control", label: "Kontrolle", points: controlPts, max: 25 },
    { key: "symmetry", label: "Symmetrie", points: symmetryPts, max: 15 },
    { key: "posture", label: "Haltung", points: posturePts, max: 10 },
  ];
  const assessed = components.filter((c) => c.points !== null);
  const got = assessed.reduce((a, c) => a + c.points!, 0);
  const max = assessed.reduce((a, c) => a + c.max, 0);
  const total = Math.round((100 * got) / max);
  if (total >= 85 && feedback.length === 0) feedback.push("Saubere Wiederholung");

  return { total, components, feedback, estimated: true };
}

/** Combo-Regel: Wiederholungen mit Score ≥ 70 verlängern die Serie. */
export const COMBO_MIN_SCORE = 70;
export const COMBO_MAX_BONUS_STEPS = 5;

/** Punkte einer Wiederholung inkl. Combo-Bonus (+10 % je Stufe, max. +50 %). */
export function pointsFor(score: number, comboAfter: number): number {
  const bonusSteps = Math.min(Math.max(0, comboAfter - 1), COMBO_MAX_BONUS_STEPS);
  return Math.round(score * (1 + 0.1 * bonusSteps));
}
