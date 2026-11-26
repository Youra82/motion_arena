import { describe, expect, it } from "vitest";
import {
  applySquatEvents,
  challenge30,
  createSession,
  dayKey,
  entryFromSession,
  finishSession,
  movementSummary,
  progressStats,
  startSession,
  weekPlan,
  type RepRecord,
  type TrainingEntry,
} from "../src/index.js";

const entry = (iso: string, reps = 5, points = 400): TrainingEntry => ({
  id: iso,
  date: new Date(iso).toISOString(),
  exerciseId: "squat",
  reps,
  targetReps: 10,
  points,
  averageScore: 80,
  bestCombo: 3,
  activeSeconds: 60,
  components: { depth: 0.9, control: 0.7, symmetry: 0.95 },
});

const rep = (i: number): RepRecord => ({
  index: i,
  startT: 0,
  bottomT: 1000,
  endT: 2000,
  maxDepth: 1,
  minKneeAngle: 90,
  symmetryDiffDeg: 3,
  maxTorsoLeanDeg: null,
  view: "front",
});

describe("Fortschritt", () => {
  it("Eintrag aus Session: nur mit Wiederholungen, Teilwerte gemittelt", () => {
    let s = startSession(createSession(10), 0);
    expect(entryFromSession(finishSession(s, 1000), new Date(2026, 10, 25, 18))).toBeNull();
    s = applySquatEvents(s, [1, 2, 3].map((i) => ({ type: "rep" as const, t: i * 2000, rep: rep(i) })));
    const e = entryFromSession(finishSession(s, 9000), new Date(2026, 10, 25, 18))!;
    expect(e.reps).toBe(3);
    expect(e.averageScore).toBe(100);
    expect(e.components.depth).toBeCloseTo(1);
    expect(e.components.posture).toBeUndefined(); // frontal nicht bewertet
  });

  it("Statistik: Summen, letzte 14 Tage, Serie bis heute bzw. gestern", () => {
    const now = new Date(2026, 10, 25, 20);
    const es = [entry("2026-11-23T10:00"), entry("2026-11-24T10:00"), entry("2026-11-24T19:00", 3, 100), entry("2026-11-20T10:00")];
    const st = progressStats(es, now);
    expect(st.totalTrainings).toBe(4);
    expect(st.totalReps).toBe(18);
    expect(st.streakDays).toBe(2); // 23. + 24., heute noch nicht
    expect(st.recentDays).toHaveLength(14);
    expect(st.recentDays.at(-2)).toMatchObject({ day: "2026-11-24", reps: 8, trainings: 2 });
    expect(st.last!.date).toBe(new Date("2026-11-24T19:00").toISOString());
    expect(progressStats([...es, entry("2026-11-25T08:00")], now).streakDays).toBe(3);
  });

  it("Wochenplan Mo–So mit heutigem Tag und Ziel", () => {
    const now = new Date(2026, 10, 25, 12); // Mittwoch
    const wp = weekPlan([entry("2026-11-23T10:00"), entry("2026-11-25T08:00"), entry("2026-11-16T08:00")], now, 3);
    expect(wp.days.map((d) => d.label)).toEqual(["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"]);
    expect(wp.days.map((d) => d.trained)).toEqual([true, false, true, false, false, false, false]);
    expect(wp.days[2]!.isToday).toBe(true);
    expect(wp.days[3]!.isFuture).toBe(true);
    expect(wp.done).toBe(2);
  });

  it("30-Tage-Challenge: startet mit erstem Training, zählt Trainingstage, läuft in Abschnitten weiter", () => {
    expect(challenge30([], new Date()).day).toBe(0);
    const es = [entry("2026-11-01T10:00"), entry("2026-11-01T18:00"), entry("2026-11-05T10:00"), entry("2026-11-12T10:00")];
    const c = challenge30(es, new Date(2026, 10, 12, 20));
    expect(c).toMatchObject({ day: 12, trainedDays: 3, goalDays: 20, completed: false });
    const next = challenge30(es, new Date(2026, 11, 2, 9)); // Tag 32 → neuer Abschnitt ab 1.12.
    expect(next.day).toBe(2);
    expect(next.trainedDays).toBe(0);
  });

  it("Bewegungsbeschreibung aus den Teilwerten", () => {
    expect(movementSummary(entry("2026-11-24T10:00"))).toEqual(["Tief", "Langsamer absenken", "Gleichmäßig"]);
    expect(movementSummary(null)).toEqual([]);
  });

  it("dayKey nutzt lokale Zeit", () => {
    expect(dayKey(new Date(2026, 0, 5, 23, 59))).toBe("2026-01-05");
  });
});
