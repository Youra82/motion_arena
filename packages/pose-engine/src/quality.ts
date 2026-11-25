import { LM, type Landmark, type TrackingQuality } from "@motion-arena/shared";

export interface QualityOptions {
  /** Mindest-Sichtbarkeit, damit ein Punkt als zuverlässig gilt. */
  minVisibility: number;
  /** Mindest-Mittelwert für Status "ok". */
  minConfidence: number;
  /** Toleranz, wie weit ein Punkt außerhalb des Bildes liegen darf (normalisiert). */
  frameMargin: number;
}

export const DEFAULT_QUALITY: QualityOptions = {
  minVisibility: 0.5,
  minConfidence: 0.65,
  frameMargin: 0.02,
};

export function isReliable(p: Landmark | undefined, o: QualityOptions = DEFAULT_QUALITY): boolean {
  if (!p) return false;
  const m = o.frameMargin;
  return (
    validVisibility(p.visibility) &&
    p.visibility >= o.minVisibility &&
    Number.isFinite(p.x) &&
    Number.isFinite(p.y) &&
    p.x >= -m &&
    p.x <= 1 + m &&
    p.y >= -m &&
    p.y <= 1 + m
  );
}

/** Sichtbarkeit muss eine endliche Zahl in [0, 1] sein (MediaPipe-Wertebereich). */
export function validVisibility(v: number): boolean {
  return Number.isFinite(v) && v >= 0 && v <= 1;
}

const LEG_CHAINS = {
  left: [LM.LEFT_HIP, LM.LEFT_KNEE, LM.LEFT_ANKLE],
  right: [LM.RIGHT_HIP, LM.RIGHT_KNEE, LM.RIGHT_ANKLE],
} as const;

export function reliableLegSides(lms: Landmark[], o: QualityOptions = DEFAULT_QUALITY): Array<"left" | "right"> {
  return (Object.keys(LEG_CHAINS) as Array<"left" | "right">).filter((side) =>
    LEG_CHAINS[side].every((i) => isReliable(lms[i], o)),
  );
}

/**
 * Bewertet, ob ein Frame für die Kniebeugen-Auswertung taugt.
 * Benötigt: mindestens eine vollständige Beinkette (Hüfte–Knie–Knöchel) und eine Schulter.
 */
export function assessSquatQuality(lms: Landmark[] | null | undefined, o: QualityOptions = DEFAULT_QUALITY): TrackingQuality {
  if (!lms || lms.length < 33) return { status: "no-person", confidence: 0, missing: [] };

  const missing: string[] = [];
  const anyOk = (ids: number[]) => ids.some((i) => isReliable(lms[i], o));
  if (!anyOk([LM.LEFT_SHOULDER, LM.RIGHT_SHOULDER])) missing.push("Oberkörper");
  if (!anyOk([LM.LEFT_HIP, LM.RIGHT_HIP])) missing.push("Hüfte");
  if (!anyOk([LM.LEFT_KNEE, LM.RIGHT_KNEE])) missing.push("Knie");
  if (!anyOk([LM.LEFT_ANKLE, LM.RIGHT_ANKLE])) missing.push("Füße");

  const sides = reliableLegSides(lms, o);
  if (sides.length === 0 && missing.length === 0) missing.push("ein vollständiges Bein");

  // Konfidenz nur aus tatsächlich verwendbaren Punkten; unbrauchbare zählen als 0.
  const usable = (i: number) => (isReliable(lms[i], o) ? lms[i]!.visibility : 0);
  const chainSides = sides.length ? sides : (["left", "right"] as const);
  const vis = [
    ...chainSides.flatMap((s) => LEG_CHAINS[s].map(usable)),
    Math.max(usable(LM.LEFT_SHOULDER), usable(LM.RIGHT_SHOULDER)),
  ];
  const confidence = vis.reduce((a, b) => a + b, 0) / vis.length;

  if (missing.length) return { status: "partial", confidence, missing };
  if (confidence < o.minConfidence) return { status: "low-confidence", confidence, missing: [] };
  return { status: "ok", confidence, missing: [] };
}
