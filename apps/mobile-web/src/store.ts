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
import {
  DEFAULT_SETTINGS,
  clearAll,
  loadCustom,
  loadHistory,
  loadProgram,
  loadSettings,
  saveCustom,
  saveHistory,
  saveProgram,
  loadWorkout,
  saveWorkout,
  saveSettings,
  type CustomWorkout,
  type Settings,
  type StoredProgram,
} from "./persist";
import { createPlan, sessionAt, totalSessions, type Answers, type Step } from "./program/planner";
import { exerciseById } from "./program/catalog";

/** Hauptbereiche (untere Navigation), Programm-Seiten, Live-Training und Ergebnis. */
export type Screen =
  | "home"
  | "training"
  | "progress"
  | "profile"
  | "studio"
  | "programs"
  | "planner"
  | "program"
  | "builder"
  | "workout"
  | "live"
  | "result"
  | "tv";

/** Ein Schritt im laufenden Training (Programm-Einheit oder eigenes Training). */
export interface WorkoutStep extends Step {
  setsDone: number;
  skipped: boolean;
}

export interface WorkoutRun {
  /** program = Programm-Einheit, custom = eigenes Training, single = einzelne Übung aus „Übungen“. */
  origin: "program" | "custom" | "single";
  title: string;
  steps: WorkoutStep[];
  /** Aktueller Schritt; gleich steps.length, wenn alles erledigt ist. */
  index: number;
  /** Einheit des Programms (nur origin "program"). */
  programIndex?: number;
  /** Fortschritt wurde schon gezählt (verhindert doppeltes Zählen). */
  counted: boolean;
}
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
  /** Aktives Programm (Antworten + Fortschritt) oder null. */
  program: StoredProgram | null;
  /** Zuletzt gebautes eigenes Training. */
  custom: CustomWorkout | null;
  /** Laufendes Training mit mehreren Schritten. */
  workout: WorkoutRun | null;
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
  program: loadProgram(),
  custom: loadCustom(),
  workout: loadWorkout(),
}));

// Training (Stand je Schritt) laufend sichern – „Fortsetzen“ klappt auch nach dem Schließen der App
useApp.subscribe((s, prev) => {
  if (s.workout !== prev.workout && s.workout) saveWorkout(s.workout);
});

const toRun = (origin: WorkoutRun["origin"], title: string, steps: Step[], programIndex?: number): WorkoutRun => ({
  origin,
  title,
  steps: steps.map((s) => ({ ...s, setsDone: 0, skipped: false })),
  index: 0,
  programIndex,
  counted: false,
});

/** Nach einem erledigten/übersprungenen Satz: weiter zum nächsten offenen Schritt, am Ende Programmfortschritt zählen. */
function advance(run: WorkoutRun, program: StoredProgram | null): { workout: WorkoutRun; program: StoredProgram | null } {
  let index = run.index;
  while (index < run.steps.length && (run.steps[index]!.skipped || run.steps[index]!.setsDone >= run.steps[index]!.sets)) index++;
  const next = { ...run, index };
  if (index < run.steps.length || run.counted) return { workout: next, program };
  next.counted = true;
  // Nur zählen, wenn mindestens ein Satz wirklich gemacht wurde (alles übersprungen = keine Einheit)
  const didSomething = run.steps.some((s) => s.setsDone > 0);
  if (run.origin === "program" && program && didSomething && run.programIndex === program.done) {
    const p = { ...program, done: program.done + 1 };
    saveProgram(p);
    return { workout: next, program: p };
  }
  return { workout: next, program };
}

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
      viewMode: view ?? (liveMode === "analysis" ? "muskel" : source === "demo" ? "arena" : s.settings.defaultView),
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
  /** Neues Programm aus den Planer-Antworten anlegen (ersetzt ein laufendes). */
  createProgram(answers: Answers, name?: string) {
    const program: StoredProgram = { answers, done: 0, level: 5, startedAt: new Date().toISOString(), ...(name ? { name } : {}) };
    saveProgram(program);
    useApp.setState({ program });
    actions.updateSettings({ weeklyGoal: answers.days });
  },
  removeProgram() {
    saveProgram(null);
    useApp.setState({ program: null });
  },
  /** Stufe 1–10: Belastung ab der nächsten Einheit anpassen. */
  setProgramLevel(level: number) {
    useApp.setState((s) => {
      if (!s.program) return {};
      const program = { ...s.program, level: Math.max(1, Math.min(10, Math.round(level))) };
      saveProgram(program);
      return { program };
    });
  },
  /** Nächste offene Einheit des Programms starten (Übersicht der Schritte). */
  startProgramSession() {
    const p = useApp.getState().program;
    if (!p) return;
    const plan = createPlan(p.answers);
    const index = Math.min(p.done, totalSessions(plan) - 1);
    const session = sessionAt(plan, index, p.level);
    useApp.setState({ workout: toRun("program", session.title, session.steps, index), screen: "workout", error: null, engineStatus: "idle" });
  },
  saveCustom(custom: CustomWorkout) {
    saveCustom(custom);
    useApp.setState({ custom });
  },
  startCustom(custom: CustomWorkout) {
    actions.saveCustom(custom);
    useApp.setState({ workout: toRun("custom", custom.name, custom.steps), screen: "workout", error: null, engineStatus: "idle" });
  },
  /** Einzelne Übung aus „Übungen“ als geführtes Training starten (Standard: 3 × 10 bzw. 2 × 30 s). */
  startSingle(exerciseId: string) {
    const e = exerciseById(exerciseId);
    if (!e) return;
    const step: Step = e.measure === "reps" ? { exerciseId, sets: 3, reps: 10 } : { exerciseId, sets: 2, seconds: 30 };
    useApp.setState({ workout: toRun("single", e.name, [step]), screen: "workout", error: null, engineStatus: "idle" });
  },
  /** Kniebeugen mit Kamera als eigenes Training (3 Sätze) starten – so lässt es sich auf der Startseite fortsetzen. */
  startSquat(target: number) {
    const e = exerciseById("squat");
    if (!e) return;
    useApp.setState({ workout: toRun("single", e.name, [{ exerciseId: "squat", sets: 3, reps: target }]), error: null });
    actions.openLive("camera", target);
  },
  /** Übung ans eigene Training anhängen und den Baukasten öffnen. */
  addToCustom(exerciseId: string) {
    const e = exerciseById(exerciseId);
    if (!e) return;
    const cur = useApp.getState().custom ?? { name: "Mein Training", steps: [] };
    if (!cur.steps.some((s) => s.exerciseId === exerciseId) && cur.steps.length < 12) {
      const step: Step = e.measure === "reps" ? { exerciseId, sets: 3, reps: 10 } : { exerciseId, sets: 2, seconds: 30 };
      actions.saveCustom({ ...cur, steps: [...cur.steps, step] });
    }
    actions.navigate("builder");
  },
  /** Aktuellen Satz als erledigt markieren. */
  workoutSetDone() {
    useApp.setState((s) => {
      const run = s.workout;
      if (!run || run.index >= run.steps.length) return {};
      const steps = run.steps.map((st, i) => (i === run.index ? { ...st, setsDone: Math.min(st.sets, st.setsDone + 1) } : st));
      return advance({ ...run, steps }, s.program);
    });
  },
  /** Aktuelle Übung überspringen. */
  workoutSkip() {
    useApp.setState((s) => {
      const run = s.workout;
      if (!run || run.index >= run.steps.length) return {};
      const steps = run.steps.map((st, i) => (i === run.index ? { ...st, skipped: true } : st));
      return advance({ ...run, steps }, s.program);
    });
  },
  /** Kamera-Übung des aktuellen Schritts live starten (Kniebeugen). */
  workoutLive(source: Source) {
    const run = useApp.getState().workout;
    const step = run?.steps[run.index];
    if (!step || !exerciseById(step.exerciseId)?.tracked) return;
    actions.openLive(source, step.reps ?? 10);
  },
  /** Vom Ergebnis zurück ins laufende Training; der Satz zählt, wenn mindestens eine Wiederholung erkannt wurde. */
  returnToWorkout(countSet: boolean) {
    if (countSet) actions.workoutSetDone();
    useApp.setState({ screen: "workout", error: null, engineStatus: "idle" });
  },
  /** Zurück zum laufenden Training (z. B. nach Abbruch der Kamera). */
  openWorkout() {
    if (useApp.getState().workout) useApp.setState({ screen: "workout", error: null, engineStatus: "idle" });
  },
  /** Zuletzt gestartetes Training noch einmal von vorn (Stand zurücksetzen). */
  restartWorkout() {
    const w = useApp.getState().workout;
    if (!w) return;
    const fresh: WorkoutRun = { ...w, steps: w.steps.map((s) => ({ ...s, setsDone: 0, skipped: false })), index: 0, counted: false };
    useApp.setState({ workout: fresh, screen: "workout", error: null, engineStatus: "idle" });
  },
  /** Training verlassen: bleibt gespeichert (Startseite bietet „Fortsetzen“ und „Neu starten“). */
  endWorkout() {
    useApp.setState({ screen: "home", error: null, engineStatus: "idle" });
  },
  /** Verlauf löschen; false, wenn der Speicher das Löschen verweigert (Verlauf bleibt dann sichtbar). */
  clearHistory(): boolean {
    if (!clearAll()) return false;
    useApp.setState({ history: [], historySaveFailed: false });
    return true;
  },
};
