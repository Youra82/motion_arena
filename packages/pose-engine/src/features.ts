import { LM, type Landmark, type PoseFrame, type TrackingQuality } from "@motion-arena/shared";
import { angleDeg, clamp, dist, isFiniteVec, mid, toSquare } from "./geometry.js";
import {
  DEFAULT_QUALITY,
  assessSquatQuality,
  isReliable,
  reliableLegSides,
  validVisibility,
  type QualityOptions,
} from "./quality.js";

export type CameraView = "front" | "side" | "diagonal";

export interface SquatFeatures {
  t: number;
  quality: TrackingQuality;
  /** Kniewinkel je Seite in Grad (180 = gestreckt), null wenn Seite unzuverlässig. */
  kneeAngleL: number | null;
  kneeAngleR: number | null;
  /** Mittel der zuverlässigen Seiten. */
  kneeAngle: number | null;
  /**
   * "3d" = aus MediaPipe-Weltkoordinaten (geschätzte Tiefe), "2d" = aus Bildebene.
   * Gilt für alle Seiten dieses Frames gemeinsam, damit Links/Rechts vergleichbar bleiben.
   */
  kneeSource: "3d" | "2d" | null;
  /** Hüftmitte im Bild (normalisiert, y nach unten). */
  hipY: number | null;
  /** Hüftmitte im Bild, horizontal (winkeltreu mit Seitenverhältnis skaliert). */
  hipX: number | null;
  /** Vertikaler Abstand Hüfte → Knöchel im Bild (normalisiert). */
  legLength: number | null;
  /**
   * Beinlängen-Verhältnisse (abstands- und lageunabhängig): gerader Abstand Hüfte–Knöchel geteilt
   * durch eine beim Beugen konstante Länge. Sinkt beim Beugen.
   * - extent3d: Weltkoordinaten, geteilt durch 3D-Länge Oberschenkel + Schienbein (jede Ansicht).
   * - extentSeg2d: Bild, geteilt durch 2D-Länge Oberschenkel + Schienbein (nur seitlich gültig).
   * - extentShoulder2d: Bild, geteilt durch Schulterbreite (nur frontal gültig).
   */
  extent3d: number | null;
  extentSeg2d: number | null;
  extentShoulder2d: number | null;
  /** Bild: Beinabstand geteilt durch Rumpflänge – Zusatzbeleg für frontalen 2D-Stand. */
  extentTorso2d: number | null;
  /** Kopf (Nase) zuverlässig im Bild – Kalibrierung verlangt den ganzen Körper. */
  headVisible: boolean;
  /** Rumpfneigung gegen die Senkrechte in Grad (2D), null wenn unzuverlässig. */
  torsoLeanDeg: number | null;
  /** Schulterbreite / Rumpflänge im Bild – Hinweis auf Blickwinkel. */
  shoulderWidthRatio: number | null;
}

const SIDE_IDS = {
  left: { hip: LM.LEFT_HIP, knee: LM.LEFT_KNEE, ankle: LM.LEFT_ANKLE },
  right: { hip: LM.RIGHT_HIP, knee: LM.RIGHT_KNEE, ankle: LM.RIGHT_ANKLE },
} as const;

type Side = keyof typeof SIDE_IDS;

const mean = (v: number[]) => v.reduce((a, b) => a + b, 0) / v.length;

/** Weltkette nutzbar: Punkte vorhanden, endlich und ausreichend sichtbar. */
function worldChainOk(world: Landmark[] | null | undefined, side: Side, o: QualityOptions): boolean {
  if (!world || world.length < 33) return false;
  const ids = SIDE_IDS[side];
  return [ids.hip, ids.knee, ids.ankle].every((i) => {
    const p = world[i];
    return !!p && isFiniteVec(p, true) && validVisibility(p.visibility) && p.visibility >= o.minVisibility;
  });
}

function legAngle(side: Side, pts: Landmark[], use3d: boolean, aspect: number): number | null {
  const ids = SIDE_IDS[side];
  if (use3d) return angleDeg(pts[ids.hip]!, pts[ids.knee]!, pts[ids.ankle]!, true);
  return angleDeg(toSquare(pts[ids.hip]!, aspect), toSquare(pts[ids.knee]!, aspect), toSquare(pts[ids.ankle]!, aspect));
}

function positiveOrNull(v: number): number | null {
  return Number.isFinite(v) && v > 1e-6 ? v : null;
}

export function extractSquatFeatures(frame: PoseFrame, o: QualityOptions = DEFAULT_QUALITY): SquatFeatures {
  const lms = frame.landmarks;
  const quality = assessSquatQuality(lms, o);
  const result: SquatFeatures = {
    t: frame.t,
    quality,
    kneeAngleL: null,
    kneeAngleR: null,
    kneeAngle: null,
    kneeSource: null,
    hipY: null,
    hipX: null,
    legLength: null,
    extent3d: null,
    extentSeg2d: null,
    extentShoulder2d: null,
    extentTorso2d: null,
    headVisible: false,
    torsoLeanDeg: null,
    shoulderWidthRatio: null,
  };
  if (!lms || lms.length < 33) return result;
  const aspect = Number.isFinite(frame.aspect) && frame.aspect > 0 ? frame.aspect : 1;
  const world = frame.worldLandmarks;

  const sides = reliableLegSides(lms, o);
  let legDist2d: number | null = null;
  if (sides.length) {
    // 3D nur, wenn alle zuverlässigen Seiten gültige Weltketten und Winkel haben; sonst alles 2D.
    const angles3d = sides.map((s) => (worldChainOk(world, s, o) ? legAngle(s, world!, true, aspect) : null));
    const use3d = angles3d.every((a) => a !== null);
    const angles = use3d ? angles3d : sides.map((s) => legAngle(s, lms, false, aspect));
    sides.forEach((s, k) => {
      const a = angles[k] ?? null;
      if (s === "left") result.kneeAngleL = a;
      else result.kneeAngleR = a;
    });
    const valid = angles.filter((a): a is number => a !== null);
    if (valid.length) {
      result.kneeAngle = mean(valid);
      result.kneeSource = use3d ? "3d" : "2d";
    }

    // Hüfthöhe/Beinlänge im Bild.
    const hipY = mean(sides.map((s) => lms[SIDE_IDS[s].hip]!.y));
    const ankleY = mean(sides.map((s) => lms[SIDE_IDS[s].ankle]!.y));
    result.hipY = hipY;
    result.hipX = mean(sides.map((s) => lms[SIDE_IDS[s].hip]!.x)) * aspect;
    result.legLength = ankleY - hipY;

    // Abstands- und lageunabhängige Beinlängen-Verhältnisse: gerader Abstand Hüfte→Knöchel statt
    // Projektion auf die Kamera-Senkrechte (gekippte/gerollte Kamera verfälscht sonst die Tiefe).
    if (use3d) {
      const ext = mean(sides.map((s) => dist(world![SIDE_IDS[s].hip]!, world![SIDE_IDS[s].ankle]!, true)));
      const seg = mean(
        sides.map((s) => {
          const id = SIDE_IDS[s];
          return dist(world![id.hip]!, world![id.knee]!, true) + dist(world![id.knee]!, world![id.ankle]!, true);
        }),
      );
      result.extent3d = seg > 1e-6 ? positiveOrNull(ext / seg) : null;
    }
    const sq = (i: number) => toSquare(lms[i]!, aspect);
    const seg2d = mean(
      sides.map((s) => {
        const id = SIDE_IDS[s];
        return dist(sq(id.hip), sq(id.knee)) + dist(sq(id.knee), sq(id.ankle));
      }),
    );
    legDist2d = mean(sides.map((s) => dist(sq(SIDE_IDS[s].hip), sq(SIDE_IDS[s].ankle))));
    if (seg2d > 1e-6) result.extentSeg2d = positiveOrNull(legDist2d / seg2d);
  }
  const nose = lms[LM.NOSE];
  result.headVisible = isReliable(nose, o);

  const ls = lms[LM.LEFT_SHOULDER]!;
  const rs = lms[LM.RIGHT_SHOULDER]!;
  const lh = lms[LM.LEFT_HIP]!;
  const rh = lms[LM.RIGHT_HIP]!;
  const shoulderOk = [ls, rs].filter((p) => isReliable(p, o));
  const hipOk = [lh, rh].filter((p) => isReliable(p, o));
  const bothShoulders = shoulderOk.length === 2;
  const shoulderWidth = bothShoulders ? dist(toSquare(ls, aspect), toSquare(rs, aspect)) : null;
  if (shoulderOk.length && hipOk.length) {
    const sh = bothShoulders ? mid(ls, rs) : shoulderOk[0]!;
    const hp = hipOk.length === 2 ? mid(lh, rh) : hipOk[0]!;
    const dx = (sh.x - hp.x) * aspect;
    const dy = hp.y - sh.y; // nach oben positiv
    const torsoLen = Math.hypot(dx, dy);
    if (torsoLen > 1e-6) {
      result.torsoLeanDeg = (Math.atan2(Math.abs(dx), dy) * 180) / Math.PI;
      // Schulterbreite in Bildebene; bei Seitenansicht klein, frontal groß.
      if (shoulderWidth !== null) result.shoulderWidthRatio = shoulderWidth / torsoLen;
      if (legDist2d !== null) result.extentTorso2d = positiveOrNull(legDist2d / torsoLen);
    }
  }
  if (shoulderWidth !== null && shoulderWidth > 1e-6 && legDist2d !== null) {
    result.extentShoulder2d = positiveOrNull(legDist2d / shoulderWidth);
  }
  return result;
}

export function classifyView(shoulderWidthRatio: number | null): CameraView {
  if (shoulderWidthRatio === null) return "side";
  if (shoulderWidthRatio >= 0.55) return "front";
  if (shoulderWidthRatio <= 0.3) return "side";
  return "diagonal";
}

export interface Calibration {
  standingKneeAngle: number;
  standingHipY: number;
  legLength: number;
  /** Stand-Referenzen der Beinhöhen-Verhältnisse (null, wenn bei Kalibrierung nicht verfügbar). */
  standingExtent3d: number | null;
  standingExtentSeg2d: number | null;
  standingExtentShoulder2d: number | null;
  shoulderWidthRatio: number | null;
  view: CameraView;
  kneeSource: "3d" | "2d";
}

export interface DepthResult {
  /** 0 = Stand, 1 ≈ Oberschenkel waagerecht (grob), >1 tiefer. null = nicht bestimmbar. */
  depth: number | null;
  /** Grund, falls nicht bestimmbar (für Feedback), z. B. Blickwinkel geändert. */
  issue: string | null;
}

/** Ab diesem Anteil "frontaler" bzw. "seitlicher" gilt der Blickwinkel als gewechselt. */
const VIEW_SWITCH_FRONT = 0.6;
const VIEW_SWITCH_SIDE = 0.4;

/**
 * Normierte Beugetiefe aus Kniebeugung und abstandsunabhängiger Beinhöhe.
 * - Mit 3D-Weltkoordinaten: blickwinkel- und abstandsunabhängig.
 * - Nur 2D: seitlich Kniewinkel + Segment-Verhältnis, frontal nur Schulterbreiten-Verhältnis.
 *   Wechselt der Blickwinkel gegenüber der Kalibrierung, ist 2D nicht mehr vergleichbar → null.
 */
export function squatDepthDetailed(f: SquatFeatures, cal: Calibration): DepthResult {
  const signals: number[] = [];
  const kneeOk = f.kneeAngle !== null && Number.isFinite(f.kneeAngle);
  const range = Math.max(30, cal.standingKneeAngle - 90);
  const dropSignal = (cur: number | null, ref: number | null) =>
    cur !== null && ref !== null && ref > 1e-6 ? (ref - cur) / (0.3 * ref) : null;

  if (f.kneeSource === "3d" && kneeOk) {
    signals.push((cal.standingKneeAngle - f.kneeAngle!) / range);
    const d = dropSignal(f.extent3d, cal.standingExtent3d);
    if (d !== null) signals.push(d);
  } else if (f.kneeSource === "2d" || f.kneeSource === null) {
    const swr = f.shoulderWidthRatio;
    const calFront = cal.view === "front";
    if (swr !== null && !calFront && swr >= VIEW_SWITCH_FRONT) return { depth: null, issue: "Blickwinkel geändert" };
    if (swr !== null && calFront && swr <= VIEW_SWITCH_SIDE) return { depth: null, issue: "Blickwinkel geändert" };
    if (calFront) {
      const d = dropSignal(f.extentShoulder2d, cal.standingExtentShoulder2d);
      if (d !== null) signals.push(d);
    } else {
      if (kneeOk) signals.push((cal.standingKneeAngle - f.kneeAngle!) / range);
      const d = dropSignal(f.extentSeg2d, cal.standingExtentSeg2d);
      if (d !== null) signals.push(d);
    }
  }
  const finite = signals.filter(Number.isFinite);
  if (!finite.length) return { depth: null, issue: null };
  return { depth: clamp(mean(finite), -0.5, 1.6), issue: null };
}

export function squatDepth(f: SquatFeatures, cal: Calibration): number | null {
  return squatDepthDetailed(f, cal).depth;
}
