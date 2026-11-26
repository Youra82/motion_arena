/**
 * Gemeinsame Typen für Motion Arena.
 * Koordinaten folgen MediaPipe: Bildkoordinaten normalisiert [0,1], y nach unten.
 * Weltkoordinaten in Metern, Ursprung zwischen den Hüften, y nach unten.
 */

export interface Landmark {
  x: number;
  y: number;
  z: number;
  /** 0..1, Wahrscheinlichkeit, dass der Punkt sichtbar ist (nicht verdeckt). */
  visibility: number;
}

export interface PoseFrame {
  /** Zeitstempel in Millisekunden (monoton). */
  t: number;
  /** 33 Bild-Landmarks oder null, wenn keine Person erkannt wurde. */
  landmarks: Landmark[] | null;
  /** 33 Welt-Landmarks (Meter) oder null. */
  worldLandmarks?: Landmark[] | null;
  /** Seitenverhältnis Breite/Höhe des Kamerabilds (für winkeltreue 2D-Geometrie). */
  aspect: number;
}

/** MediaPipe-Pose-Indizes. "LEFT" = linke Körperseite der Person. */
export const LM = {
  NOSE: 0,
  LEFT_EAR: 7,
  RIGHT_EAR: 8,
  LEFT_SHOULDER: 11,
  RIGHT_SHOULDER: 12,
  LEFT_ELBOW: 13,
  RIGHT_ELBOW: 14,
  LEFT_WRIST: 15,
  RIGHT_WRIST: 16,
  LEFT_PINKY: 17,
  RIGHT_PINKY: 18,
  LEFT_INDEX: 19,
  RIGHT_INDEX: 20,
  LEFT_HIP: 23,
  RIGHT_HIP: 24,
  LEFT_KNEE: 25,
  RIGHT_KNEE: 26,
  LEFT_ANKLE: 27,
  RIGHT_ANKLE: 28,
  LEFT_HEEL: 29,
  RIGHT_HEEL: 30,
  LEFT_FOOT_INDEX: 31,
  RIGHT_FOOT_INDEX: 32,
} as const;

export const LANDMARK_COUNT = 33;

/** Verbindungen für die Skelettdarstellung (Rumpf, Arme, Beine; ohne Gesicht/Hände). */
export const SKELETON_EDGES: ReadonlyArray<readonly [number, number]> = [
  [LM.LEFT_SHOULDER, LM.RIGHT_SHOULDER],
  [LM.LEFT_SHOULDER, LM.LEFT_ELBOW],
  [LM.LEFT_ELBOW, LM.LEFT_WRIST],
  [LM.RIGHT_SHOULDER, LM.RIGHT_ELBOW],
  [LM.RIGHT_ELBOW, LM.RIGHT_WRIST],
  [LM.LEFT_SHOULDER, LM.LEFT_HIP],
  [LM.RIGHT_SHOULDER, LM.RIGHT_HIP],
  [LM.LEFT_HIP, LM.RIGHT_HIP],
  [LM.LEFT_HIP, LM.LEFT_KNEE],
  [LM.LEFT_KNEE, LM.LEFT_ANKLE],
  [LM.RIGHT_HIP, LM.RIGHT_KNEE],
  [LM.RIGHT_KNEE, LM.RIGHT_ANKLE],
  [LM.LEFT_ANKLE, LM.LEFT_HEEL],
  [LM.LEFT_HEEL, LM.LEFT_FOOT_INDEX],
  [LM.LEFT_ANKLE, LM.LEFT_FOOT_INDEX],
  [LM.RIGHT_ANKLE, LM.RIGHT_HEEL],
  [LM.RIGHT_HEEL, LM.RIGHT_FOOT_INDEX],
  [LM.RIGHT_ANKLE, LM.RIGHT_FOOT_INDEX],
];

/** Erkennungsqualität eines Frames, Grundlage für Warnung statt Fehlbewertung. */
export type TrackingStatus =
  | "no-person" // keine Person im Bild
  | "partial" // benötigte Körperteile fehlen / außerhalb des Bildes
  | "low-confidence" // Punkte da, aber unsicher
  | "ok";

export interface TrackingQuality {
  status: TrackingStatus;
  /** Mittlere Sichtbarkeit der benötigten Punkte, 0..1. */
  confidence: number;
  /** Deutsche Namen fehlender/unsicherer Körperbereiche für das Feedback. */
  missing: string[];
}
