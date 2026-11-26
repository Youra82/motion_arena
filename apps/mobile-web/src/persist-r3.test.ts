import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { applySquatEvents, movementSummary, progressStats, type TrainingEntry } from "@motion-arena/motion-scoring";
import { DEFAULT_SETTINGS, loadHistory, loadSettings, saveHistory } from "./persist";
import { actions, useApp } from "./store";

const HISTORY = "motion-arena.history.v1";
const SETTINGS = "motion-arena.settings.v1";

function entry(i: number): TrainingEntry {
  return {
    id: String(i),
    date: new Date(Date.UTC(2026, 0, 1, 0, i)).toISOString(),
    exerciseId: "squat",
    reps: 5,
    targetReps: 10,
    points: 400,
    averageScore: 80,
    bestCombo: 1,
    activeSeconds: 20,
    components: {},
  };
}

function addRep() {
  actions.startTraining(1000);
  useApp.setState((s) => ({
    session: applySquatEvents(s.session, [{
      type: "rep",
      t: 3000,
      rep: {
        index: 1, startT: 1000, bottomT: 2000, endT: 3000, maxDepth: 1, minKneeAngle: 90,
        symmetryDiffDeg: 3, maxTorsoLeanDeg: null, view: "front",
      },
    }]),
  }));
}

const saved = new Map<string, string>();
const getItem = vi.fn((key: string) => saved.get(key) ?? null);
const setItem = vi.fn((key: string, value: string) => { saved.set(key, value); });
const removeItem = vi.fn((key: string) => { saved.delete(key); });

beforeEach(() => {
  saved.clear();
  vi.clearAllMocks();
  vi.stubGlobal("localStorage", { getItem, setItem, removeItem });
  useApp.setState(useApp.getInitialState(), true);
});

afterEach(() => {
  vi.unstubAllGlobals();
  useApp.setState(useApp.getInitialState(), true);
});

describe("Verlauf und Einstellungen – Speichergrenzen", () => {
  it.each(["{", "null", "[]", '{"weeklyGoal":42,"modelVariant":"other","defaultTarget":999}'])(
    "fällt bei kaputtem oder unpassendem Einstellungswert %s auf Standardwerte zurück",
    (raw) => {
      saved.set(SETTINGS, raw);
      expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
    },
  );

  it.each(["{", '"Text"', '{"reps":5}'])("ignoriert einen beschädigten Verlauf %s", (raw) => {
    saved.set(HISTORY, raw);
    expect(loadHistory()).toEqual([]);
  });

  it("behält gute Datensätze und verwirft unvollständige, ungültige und doppelte Einträge", () => {
    // CODEX-BEFUND: Die Prüfung akzeptiert kaputte Felder und doppelte IDs.
    const valid = entry(0);
    saved.set(HISTORY, JSON.stringify([
      valid, null, { date: entry(1).date, reps: 2 }, { ...entry(2), date: "kein Datum" },
      { ...entry(3), reps: -5 }, { ...entry(4), points: "999" }, { ...entry(5), components: null }, valid,
    ]));
    expect(loadHistory()).toEqual([valid]);
  });

  it("kann die Zusammenfassung auf der Startseite trotz eines defekten Eintrags berechnen", () => {
    // CODEX-BEFUND: Ein Datensatz ohne components erreicht movementSummary und löst einen TypeError aus.
    saved.set(HISTORY, JSON.stringify([{ ...entry(1), components: null }]));
    expect(() => movementSummary(progressStats(loadHistory(), new Date("2026-01-02")).last)).not.toThrow();
  });

  it("normalisiert eine unbekannte Standard-Ansicht bereits beim Laden", () => {
    // CODEX-BEFUND: Die Live-Ansicht fällt zurück, im Profil hat die Auswahl dagegen keinen aktiven Eintrag.
    saved.set(SETTINGS, '{"defaultView":"unbekannt"}');
    expect(loadSettings().defaultView).toBe(DEFAULT_SETTINGS.defaultView);
  });

  it("bleibt bei Lesefehler verwendbar und wirft bei vollem Speicher nicht", () => {
    getItem.mockImplementationOnce(() => { throw new Error("SecurityError"); });
    expect(loadHistory()).toEqual([]);
    setItem.mockImplementationOnce(() => { throw new Error("QuotaExceededError"); });
    expect(() => saveHistory([entry(0)])).not.toThrow();
    expect(loadHistory()).toEqual([]);
  });

  it("speichert von 2500 Einträgen genau die letzten 1000 in Eingabereihenfolge", () => {
    const entries = Array.from({ length: 2500 }, (_, i) => entry(i));
    saveHistory(entries);
    expect(loadHistory()).toEqual(entries.slice(-1000));
    expect(entries).toHaveLength(2500);
  });

  it("behält im aktuellen Store denselben Verlauf wie nach dem Neuladen", () => {
    // CODEX-BEFUND: Bei 1001 Einträgen sehen Statistik und Profil vor und nach Reload unterschiedliche Daten.
    const entries = Array.from({ length: 1000 }, (_, i) => entry(i));
    saveHistory(entries);
    useApp.setState({ history: loadHistory() });
    actions.openLive("camera", 10);
    addRep();
    actions.finish(4000);
    expect(useApp.getState().history).toEqual(loadHistory());
  });

  it("schreibt beim doppelten Beenden einer pausierten Kamera-Session nur einmal", () => {
    actions.openLive("camera", 10);
    addRep();
    actions.pause(3500);
    actions.finish(4000);
    actions.finish(4100);
    expect(setItem).toHaveBeenCalledTimes(1);
    expect(loadHistory()).toMatchObject([{ reps: 1, targetReps: 10 }]);
    expect(useApp.getState().history).toEqual(loadHistory());
  });

  it.each(["squat", "analysis"] as const)("lässt vorhandenen Kameraverlauf bei einer %s-Demo unangetastet", (mode) => {
    const previous = [entry(0)];
    saveHistory(previous);
    const original = saved.get(HISTORY);
    useApp.setState({ history: loadHistory() });
    setItem.mockClear();
    actions.openLive("demo", 10, mode);
    if (mode === "squat") addRep();
    actions.finish(4000);
    actions.finish(4100);
    expect(setItem).not.toHaveBeenCalled();
    expect(saved.get(HISTORY)).toBe(original);
    expect(useApp.getState().history).toEqual(previous);
  });

  it("verwendet nach der Analyse wieder die gewählte Standard-Ansicht fürs Kameratraining", () => {
    // CODEX-BEFUND: Die Analyse überschreibt viewMode im Speicher des Stores bis zum Reload.
    actions.openLive("camera", 10, "analysis");
    actions.finish(4000);
    actions.openLive("camera", 10);
    expect(useApp.getState().viewMode).toBe(DEFAULT_SETTINGS.defaultView);
  });

  it("zeigt den Verlauf nach einem fehlgeschlagenen Löschen weiterhin als vorhanden", () => {
    // CODEX-BEFUND: Der Store meldet implizit Erfolg, obwohl der Verlauf beim Reload zurückkommt.
    const previous = [entry(0)];
    saveHistory(previous);
    useApp.setState({ history: loadHistory() });
    removeItem.mockImplementationOnce(() => { throw new Error("SecurityError"); });
    actions.clearHistory();
    expect(useApp.getState().history).toEqual(loadHistory());
  });
});
