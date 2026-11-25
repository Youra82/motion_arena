import { create } from "zustand";
import type { TrackingQuality } from "@motion-arena/shared";
import type { Calibration, CalibrationProgress } from "@motion-arena/pose-engine";
import {
  createSession,
  finishSession,
  pauseSession,
  resumeSession,
  startSession,
  type SessionState,
  type SquatPhase,
} from "@motion-arena/motion-scoring";

export type Screen = "start" | "live" | "result";
export type Source = "camera" | "demo";

/** Spiegelungsmodi aus FEATURES.md, Phase 1: verfügbare Teilmenge. */
export type ViewMode = "echtbild" | "silhouette" | "skelett" | "avatar" | "spur" | "hybrid";

export const VIEW_MODES: Array<{ id: ViewMode; label: string; needsCamera: boolean; note?: string }> = [
  { id: "hybrid", label: "Hybrid", needsCamera: true },
  { id: "echtbild", label: "Echtbild", needsCamera: true },
  { id: "silhouette", label: "Silhouette", needsCamera: true, note: "lokal freigestellt" },
  { id: "skelett", label: "Skelett", needsCamera: false },
  { id: "spur", label: "Bewegungsspur", needsCamera: false },
  { id: "avatar", label: "Avatar", needsCamera: false, note: "Platzhalter – kein 3D-Modell" },
];

export type EngineStatus = "idle" | "loading-model" | "requesting-camera" | "running" | "error";

export type ErrorKind = "camera-denied" | "no-camera" | "insecure-context" | "model-failed" | "camera-busy" | "unknown";

export interface EngineError {
  kind: ErrorKind;
  message: string;
}

export type LiveStage = "calibrating" | "countdown" | "training";

export interface Hud {
  depth: number | null;
  phase: SquatPhase | null;
  armed: boolean;
  quality: TrackingQuality;
  /** Warum gerade nicht gewertet wird (z. B. „Blickwinkel geändert“), sonst null. */
  issue: string[] | null;
  fps: number;
}

export interface Feedback {
  id: number;
  text: string;
  tone: "good" | "info" | "warn";
}

export interface AppState {
  screen: Screen;
  source: Source;
  engineStatus: EngineStatus;
  error: EngineError | null;
  modelVariant: "lite" | "full";
  viewMode: ViewMode;
  stage: LiveStage;
  countdown: number;
  calibration: Calibration | null;
  calibrationProgress: CalibrationProgress | null;
  hud: Hud;
  session: SessionState;
  feedback: Feedback | null;
  recording: boolean;
  recordedFrames: number;
  /** Erhöht sich bei jedem Start, damit die Engine neu aufgebaut wird. */
  runId: number;
  /** Erhöht sich bei Pause/Fortsetzen/Neukalibrieren – die Engine verwirft dann den laufenden Versuch. */
  motionEpoch: number;
}

const initialHud: Hud = {
  depth: null,
  phase: null,
  armed: false,
  issue: null,
  quality: { status: "no-person", confidence: 0, missing: [] },
  fps: 0,
};

export const useApp = create<AppState>(() => ({
  screen: "start",
  source: "camera",
  engineStatus: "idle",
  error: null,
  modelVariant: "lite",
  viewMode: "hybrid",
  stage: "calibrating",
  countdown: 0,
  calibration: null,
  calibrationProgress: null,
  hud: initialHud,
  session: createSession(10),
  feedback: null,
  recording: false,
  recordedFrames: 0,
  runId: 0,
  motionEpoch: 0,
}));

let feedbackId = 0;
export function showFeedback(text: string, tone: Feedback["tone"]): void {
  useApp.setState({ feedback: { id: ++feedbackId, text, tone } });
}

export const actions = {
  openLive(source: Source, targetReps: number) {
    useApp.setState((s) => ({
      screen: "live",
      runId: s.runId + 1,
      engineStatus: "idle",
      recording: false,
      recordedFrames: 0,
      source,
      error: null,
      stage: "calibrating",
      calibration: null,
      calibrationProgress: null,
      hud: initialHud,
      feedback: null,
      session: createSession(targetReps),
      viewMode: source === "demo" ? "skelett" : s.viewMode,
    }));
  },
  setViewMode(viewMode: ViewMode) {
    // Ansichtswechsel berührt nur die Darstellung – Session bleibt unverändert.
    useApp.setState({ viewMode });
  },
  /** Nach Kalibrierung/Countdown: neue Session starten oder pausierte fortsetzen. */
  startTraining(now: number) {
    useApp.setState((s) => ({
      stage: "training",
      session: s.session.status === "paused" ? resumeSession(s.session, now) : startSession(s.session, now),
    }));
  },
  pause(now: number) {
    useApp.setState((s) => ({ session: pauseSession(s.session, now), motionEpoch: s.motionEpoch + 1 }));
  },
  resume(now: number) {
    useApp.setState((s) => ({ session: resumeSession(s.session, now), motionEpoch: s.motionEpoch + 1 }));
  },
  finish(now: number) {
    useApp.setState((s) => ({ session: finishSession(s.session, now), screen: "result" }));
  },
  /** Neu kalibrieren: laufende Session wird dafür pausiert. */
  recalibrate(now: number) {
    useApp.setState((s) => ({
      stage: "calibrating",
      calibration: null,
      calibrationProgress: null,
      session: pauseSession(s.session, now),
      motionEpoch: s.motionEpoch + 1,
    }));
  },
  home() {
    useApp.setState({ screen: "start", error: null, engineStatus: "idle" });
  },
};
