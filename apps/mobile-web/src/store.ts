import { create } from "zustand";
import type { TrackingQuality } from "@motion-arena/shared";
import type { Calibration, CalibrationProgress } from "@motion-arena/pose-engine";
import {
  createSession,
  finishSession,
  pauseSession,
  resumeSession,
  entryFromSession,
  startSession,
  type SessionState,
  type SquatPhase,
  type BodyLoadResult,
  type TrainingEntry,
} from "@motion-arena/motion-scoring";
import { DEFAULT_SETTINGS, clearAll, loadHistory, loadSettings, saveHistory, saveSettings, type Settings } from "./persist";

/** Hauptbereiche (untere Navigation) plus Live-Training und Ergebnis. */
export type Screen = "home" | "training" | "progress" | "profile" | "studio" | "live" | "result" | "tv";
export type Source = "camera" | "demo";

export { VIEW_MODES, isViewMode, type ViewMode } from "./view-modes";
import { isViewMode, type ViewMode } from "./view-modes";

export type EngineStatus = "idle" | "loading-model" | "requesting-camera" | "running" | "error";

export type ErrorKind = "camera-denied" | "no-camera" | "insecure-context" | "model-failed" | "camera-busy" | "unknown";

export interface EngineError {
  kind: ErrorKind;
  message: string;
}

export type LiveStage = "calibrating" | "countdown" | "training" | "analysis";

/** Live-Modus: Kniebeugen-Training (zählen, bewerten) oder freie Körperanalyse (Live Body Load). */
export type LiveMode = "squat" | "analysis";

export interface Hud {
  depth: number | null;
  phase: SquatPhase | null;
  armed: boolean;
  quality: TrackingQuality;
  /** Warum gerade nicht gewertet wird (z. B. „Blickwinkel geändert“), sonst null. */
  issue: string[] | null;
  fps: number;
  /** Ergebnis der Körperanalyse (nur im Analysemodus bzw. Muskel-/Zonen-Ansicht). */
  bodyLoad: BodyLoadResult | null;
}

export interface Feedback {
  id: number;
  text: string;
  tone: "good" | "info" | "warn";
}

export interface AppState {
  screen: Screen;
  source: Source;
  liveMode: LiveMode;
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
  /** Gespeicherte Trainings (nur echte Kamera-Trainings, keine Demo). */
  history: TrainingEntry[];
  /** Letztes Speichern des Verlaufs ist fehlgeschlagen (Speicher voll/gesperrt) – Profil zeigt das an. */
  historySaveFailed: boolean;
  /** Letztes Speichern der Einstellungen ist fehlgeschlagen. */
  settingsSaveFailed: boolean;
  settings: Settings;
  /** Ziel der nächsten Session (Startseite/Training). */
  targetReps: number;
}

const initialHud: Hud = {
  depth: null,
  phase: null,
  armed: false,
  issue: null,
  quality: { status: "no-person", confidence: 0, missing: [] },
  fps: 0,
  bodyLoad: null,
};

const initialSettings = loadSettings();

export const useApp = create<AppState>(() => ({
  screen: "home",
  source: "camera",
  liveMode: "squat",
  engineStatus: "idle",
  error: null,
  modelVariant: initialSettings.modelVariant,
  viewMode: initialSettings.defaultView,
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
  history: loadHistory(),
  historySaveFailed: false,
  settingsSaveFailed: false,
  settings: initialSettings,
  targetReps: initialSettings.defaultTarget,
}));

let feedbackId = 0;
export function showFeedback(text: string, tone: Feedback["tone"]): void {
  useApp.setState({ feedback: { id: ++feedbackId, text, tone } });
}

export const actions = {
  /** `view` erzwingt eine Ansicht für diesen Durchlauf (z. B. Avatar-Demo), ohne die Standard-Ansicht zu ändern. */
  openLive(source: Source, targetReps: number, liveMode: LiveMode = "squat", view?: ViewMode) {
    useApp.setState((s) => ({
      screen: "live",
      liveMode,
      runId: s.runId + 1,
      engineStatus: "idle",
      recording: false,
      recordedFrames: 0,
      source,
      error: null,
      stage: liveMode === "analysis" ? "analysis" : "calibrating",
      calibration: null,
      calibrationProgress: null,
      hud: initialHud,
      feedback: null,
      session: createSession(targetReps),
      // Kameratraining startet immer mit der gespeicherten Standard-Ansicht (Analyse/Demo überschreiben sie nicht).
      viewMode: view ?? (liveMode === "analysis" ? "muskel" : source === "demo" ? DEFAULT_SETTINGS.defaultView : s.settings.defaultView),
    }));
  },
  setViewMode(viewMode: ViewMode) {
    // Ansichtswechsel berührt nur die Darstellung – Session bleibt unverändert.
    useApp.setState({ viewMode });
    const s = useApp.getState();
    if (s.source === "camera" && s.liveMode === "squat") actions.updateSettings({ defaultView: viewMode });
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
    if (useApp.getState().liveMode === "analysis") {
      // Analyse hat kein Ergebnis/Punkte – zurück zur Startseite.
      useApp.setState({ screen: "home", engineStatus: "idle", error: null });
      return;
    }
    useApp.setState((s) => {
      const session = finishSession(s.session, now);
      // Nur echte Kamera-Trainings zählen für den Fortschritt (Demo ist synthetisch).
      const entry = s.source === "camera" && s.session.status !== "finished" ? entryFromSession(session, new Date()) : null;
      // Store hält dieselbe (gekappte) Liste wie der Speicher – vor und nach dem Neuladen gleich.
      if (!entry) return { session, screen: "result" };
      const saved = saveHistory([...s.history, entry]);
      return { session, screen: "result", history: saved.entries, historySaveFailed: !saved.ok };
    });
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
    useApp.setState({ screen: "home", error: null, engineStatus: "idle" });
  },
  /** Dieses Gerät als Fernseher verwenden (zeigt Kopplungscode). */
  openTv() {
    useApp.setState({ screen: "tv", error: null, engineStatus: "idle" });
  },
  navigate(screen: Exclude<Screen, "live" | "result" | "tv">) {
    useApp.setState({ screen, error: null, engineStatus: "idle" });
  },
  setTarget(targetReps: number) {
    useApp.setState({ targetReps });
  },
  /** Einstellungen ändern; false, wenn sie nicht dauerhaft gespeichert werden konnten (gelten dann nur bis zum Neustart). */
  updateSettings(patch: Partial<Settings>): boolean {
    let ok = true;
    useApp.setState((s) => {
      const settings = { ...s.settings, ...patch };
      ok = saveSettings(settings);
      return {
        settings,
        settingsSaveFailed: !ok,
        ...(patch.modelVariant ? { modelVariant: patch.modelVariant } : {}),
        ...(patch.defaultTarget ? { targetReps: patch.defaultTarget } : {}),
      };
    });
    return ok;
  },
  /** Verlauf löschen; false, wenn der Speicher das Löschen verweigert (Verlauf bleibt dann sichtbar). */
  clearHistory(): boolean {
    if (!clearAll()) return false;
    useApp.setState({ history: [], historySaveFailed: false });
    return true;
  },
};
