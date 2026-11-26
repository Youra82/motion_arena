import type { BodyLoadResult } from "@motion-arena/motion-scoring";
import type { TrackingQuality } from "@motion-arena/shared";
import type { AppState, Feedback } from "../store";

/**
 * Alles, was die Live-Anzeige darstellt – serialisierbar, damit der Fernseher exakt dieselbe Anzeige
 * wie das Handy rendern kann (gleiche Komponente, gleiche Daten).
 */
export interface HudView {
  stage: "calibrating" | "countdown" | "training" | "analysis";
  engineRunning: boolean;
  running: boolean;
  demo: boolean;
  quality: TrackingQuality["status"];
  reps: number;
  targetReps: number;
  points: number;
  combo: number;
  lastScore: number | null;
  phaseText: string | null;
  depth: number | null;
  bodyLoad: BodyLoadResult | null;
  feedback: Feedback | null;
  bannerText: string | null;
  /** Banner bietet "Neu kalibrieren" an (nur am Handy bedienbar). */
  bannerRecalibrate: boolean;
  calib: { progress: number; message: string } | null;
  countdown: number;
  countdownHold: boolean;
}

const PHASE_LABEL = { standing: "Bereit", descending: "Runter", ascending: "Hoch", uncertain: "Unsicher" } as const;

export function qualityHint(q: TrackingQuality): string {
  if (q.status === "no-person") return "Keine Person erkannt – stell dich ins Bild. Es wird nichts gewertet.";
  if (q.status === "partial") return `Nicht sichtbar: ${q.missing.join(", ")} – keine Wertung, bis alles im Bild ist.`;
  return "Erkennung unsicher – mehr Licht oder etwas Abstand. Keine Wertung.";
}

export function hudViewFrom(s: AppState): HudView {
  const { hud, session } = s;
  const running = session.status === "running";
  const last = session.reps[session.reps.length - 1];
  const showBanner = s.stage === "training" && running && (hud.quality.status !== "ok" || !!hud.issue);
  return {
    stage: s.stage,
    engineRunning: s.engineStatus === "running",
    running,
    demo: s.source === "demo",
    quality: hud.quality.status,
    reps: session.reps.length,
    targetReps: session.targetReps,
    points: session.points,
    combo: session.combo,
    lastScore: last ? last.score.total : null,
    phaseText: hud.phase ? (hud.phase === "standing" && !hud.armed ? "Aufrecht hinstellen" : PHASE_LABEL[hud.phase]) : null,
    depth: hud.depth,
    bodyLoad: hud.bodyLoad,
    feedback: s.feedback,
    bannerText: showBanner
      ? hud.quality.status !== "ok"
        ? qualityHint(hud.quality)
        : `Keine Wertung: ${hud.issue!.join(", ")}. Zurück in die Ausgangsposition und aufrecht hinstellen.`
      : null,
    bannerRecalibrate: showBanner && !!hud.issue?.includes("Blickwinkel geändert"),
    calib: s.stage === "calibrating" && s.engineStatus === "running"
      ? { progress: s.calibrationProgress?.progress ?? 0, message: s.calibrationProgress?.message ?? "Stell dich vor die Kamera." }
      : null,
    countdown: s.countdown,
    countdownHold: hud.quality.status !== "ok",
  };
}
