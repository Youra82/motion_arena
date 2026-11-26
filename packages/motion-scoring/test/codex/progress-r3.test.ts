import { describe, expect, it } from "vitest";
import { challenge30, dayKey, progressStats, weekPlan, type TrainingEntry } from "../../src/index.js";

function entry(date: Date, id = date.toISOString()): TrainingEntry {
  return {
    id,
    date: date.toISOString(),
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

describe("Fortschritt – gegnerische Kalenderfälle", () => {
  it.each([
    { month: 2, sunday: 29, before: "2026-03-28", change: "2026-03-29", after: "2026-03-30" },
    { month: 9, sunday: 25, before: "2026-10-24", change: "2026-10-25", after: "2026-10-26" },
    { month: 2, sunday: 8, before: "2026-03-07", change: "2026-03-08", after: "2026-03-09" },
    { month: 10, sunday: 1, before: "2026-10-31", change: "2026-11-01", after: "2026-11-02" },
  ])("zählt über den Zeitwechsel am $change drei Kalendertage", ({ month, sunday, before, change, after }) => {
    // Je nach TZ (Europe/Berlin oder America/Los_Angeles) liegen zwischen den Mitternachten 23 bzw. 25 Stunden.
    const now = new Date(2026, month, sunday + 1, 0, 1);
    const entries = [
      entry(new Date(2026, month, sunday - 1, 23, 59)),
      entry(new Date(2026, month, sunday, 0, 0)),
      entry(new Date(2026, month, sunday, 23, 59)),
      entry(new Date(2026, month, sunday + 1, 0, 0)),
    ];
    const stats = progressStats(entries, now, 3);
    expect(stats.recentDays.map(({ day, trainings }) => [day, trainings])).toEqual([
      [before, 1], [change, 2], [after, 1],
    ]);
    expect(stats.streakDays).toBe(3);
    const week = weekPlan(entries, now);
    expect(week.done).toBe(1);
    expect(week.days[0]).toMatchObject({ day: after, label: "Mo", isToday: true });
    expect(challenge30(entries, now)).toMatchObject({ day: 3, trainedDays: 3 });
  });

  it("ordnet einen ISO-Zeitpunkt anhand der lokalen Mitternacht ein", () => {
    // FRAGE: Soll ein Training bei einer späteren Reise am ursprünglich lokalen Tag bleiben?
    const before = new Date(2026, 0, 4, 23, 59, 59, 999);
    const after = new Date(before.getTime() + 1);
    expect(dayKey(new Date(entry(before).date))).toBe("2026-01-04");
    expect(dayKey(new Date(entry(after).date))).toBe("2026-01-05");
  });

  it("trennt Tag 30 von Tag 1 des nächsten Abschnitts über Monats- und DST-Grenze", () => {
    const first = entry(new Date(2026, 2, 15, 23, 59));
    const last = entry(new Date(2026, 3, 13));
    const next = entry(new Date(2026, 3, 14));
    expect(challenge30([last, first], new Date(last.date), 2)).toMatchObject({
      day: 30, trainedDays: 2, completed: true, progress: 1,
    });
    expect(challenge30([next, last, first], new Date(next.date), 2)).toMatchObject({
      day: 1, trainedDays: 1, completed: false, progress: 0.5,
    });
  });

  it("rechnet einen großen unsortierten Verlauf mit mehreren Trainings pro Tag vollständig ab", () => {
    const old = new Date(2025, 0, 1, 12);
    const now = new Date(2026, 0, 5, 12);
    const newest = entry(now);
    const entries = [newest, ...Array.from({ length: 25_000 }, (_, i) => entry(old, String(i)))];
    expect(progressStats(entries, now, 2)).toMatchObject({
      totalTrainings: 25_001,
      totalReps: 125_005,
      totalPoints: 10_000_400,
      streakDays: 1,
      last: newest,
      recentDays: [{ trainings: 0 }, { trainings: 1 }],
    });
  });

  it("zählt bei zurückgestellter Uhr keine künftigen Trainingstage", () => {
    // CODEX-BEFUND: Wochenplan und Challenge rechnen bereits den morgigen Eintrag an.
    const monday = new Date(2026, 10, 23, 12);
    const entries = [entry(new Date(2026, 10, 23, 10)), entry(new Date(2026, 10, 24, 10))];
    expect([weekPlan(entries, monday).done, challenge30(entries, monday).trainedDays]).toEqual([1, 1]);
  });

  it("wählt den letzten Eintrag nach Zeitpunkt auch bei ISO-Offsets", () => {
    // CODEX-BEFUND: Das Sortieren der ISO-Texte kann eine ältere Session als letzte anzeigen.
    const older = { ...entry(new Date("2026-11-23T09:30:00Z")), date: "2026-11-23T11:30:00+02:00" };
    const newer = entry(new Date("2026-11-23T10:00:00Z"));
    expect(progressStats([newer, older], new Date("2026-11-23T12:00:00Z")).last).toEqual(newer);
  });
});
