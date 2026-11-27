import { describe, expect, it } from "vitest";
import { EXERCISES, exerciseById } from "./catalog";
import {
  allowed,
  createPlan,
  explain,
  isAnswers,
  phaseOf,
  phaseRanges,
  positionOf,
  sessionAt,
  totalSessions,
  type Answers,
  type Pain,
} from "./planner";

const base: Answers = { goal: "kraft", level: "neu", days: 3, minutes: 20, focus: ["beine"], pain: "keine" };

describe("Programm-Planer", () => {
  it("legt Wochentage mit Ruhetagen und Dauer nach Fitness fest", () => {
    const p = createPlan(base);
    expect(p.weekdays).toEqual(["Mo", "Mi", "Fr"]);
    expect(p.weeks).toBe(6);
    expect(createPlan({ ...base, level: "regel" }).weeks).toBe(8);
    expect(createPlan({ ...base, days: 5 }).weekdays).toHaveLength(5);
    expect(totalSessions(p)).toBe(18);
  });

  it("ist deterministisch (gleiche Antworten → gleiches Programm)", () => {
    expect(createPlan(base)).toEqual(createPlan({ ...base }));
    expect(sessionAt(createPlan(base), 4)).toEqual(sessionAt(createPlan(base), 4));
  });

  it("verteilt mehrere Schwerpunkte und Ziel-Extras auf die Woche", () => {
    const p = createPlan({ ...base, goal: "ausdauer", focus: ["beine", "rumpf"], days: 4 });
    expect(p.slots).toEqual(["beine", "rumpf", "ausdauer", "beine"]);
    expect(createPlan({ ...base, focus: [] }).slots.every((s) => s === "ganzkoerper")).toBe(true);
  });

  it("hält die gewünschte Zeit ungefähr ein und nimmt mindestens zwei Übungen", () => {
    for (const minutes of [10, 20, 30, 45] as const) {
      const p = createPlan({ ...base, minutes, focus: ["ganzkoerper"] });
      for (let i = 0; i < totalSessions(p); i++) {
        const s = sessionAt(p, i);
        expect(s.steps.length).toBeGreaterThanOrEqual(2);
        if (s.steps.length > 2) expect(s.minutes).toBeLessThanOrEqual(minutes + 1);
      }
    }
    const short = sessionAt(createPlan({ ...base, minutes: 10 }), 0).steps.length;
    const long = sessionAt(createPlan({ ...base, minutes: 45 }), 0).steps.length;
    expect(long).toBeGreaterThan(short);
  });

  it("ersetzt bei Beschwerden alle belastenden Übungen – in jeder Einheit", () => {
    for (const pain of ["knie", "ruecken", "schultern"] as Pain[]) {
      for (const goal of ["alltag", "kraft", "ausdauer", "beweglich"] as const) {
        const p = createPlan({ ...base, goal, pain, days: 5, minutes: 45, focus: ["beine", "rumpf", "oberkoerper", "ganzkoerper"] });
        for (let i = 0; i < totalSessions(p); i++) {
          for (const st of sessionAt(p, i).steps) {
            const e = exerciseById(st.exerciseId)!;
            expect(allowed(e, pain), `${e.name} bei ${pain}`).toBe(true);
          }
        }
      }
    }
    // Knie: keine Kniebeugen, keine Sprünge – dafür halbe Kniebeuge
    const knee = sessionAt(createPlan({ ...base, pain: "knie" }), 0).steps.map((s) => s.exerciseId);
    expect(knee).not.toContain("squat");
    expect(knee).toContain("half-squat");
  });

  it("steigert die Belastung über die Phasen und reagiert auf „zu schwer/zu leicht“", () => {
    const p = createPlan(base);
    expect(phaseRanges(p).map((r) => r.name)).toEqual(["Grundlage", "Aufbau", "Steigerung"]);
    expect([1, 3, 6].map((w) => phaseOf(p, w))).toEqual([0, 1, 2]);
    const squatOf = (i: number, adj = 0) => sessionAt(p, i, adj).steps.find((s) => s.exerciseId === "squat")!;
    const w1 = squatOf(0);
    const w6 = squatOf(15);
    expect(w6.sets * (w6.reps ?? 0)).toBeGreaterThan(w1.sets * (w1.reps ?? 0));
    expect(squatOf(0, -1).reps!).toBeLessThan(w1.reps!);
    expect(squatOf(0, 1).reps!).toBeGreaterThan(w1.reps!);
  });

  it("rechnet Woche und Wochentag einer Einheit aus", () => {
    const p = createPlan(base);
    expect(positionOf(p, 0)).toEqual({ week: 1, slot: 0, weekday: "Mo" });
    expect(positionOf(p, 4)).toEqual({ week: 2, slot: 1, weekday: "Mi" });
  });

  it("erklärt den Plan mit den Antworten und ehrlich zur Kamera-Zählung", () => {
    const why = explain(createPlan({ ...base, pain: "knie" }));
    expect(why.join(" ")).toMatch(/Knie/);
    expect(why.join(" ")).toMatch(/Kamera/);
    expect(why.length).toBeGreaterThanOrEqual(3);
  });

  it("nur die Kniebeuge ist als Kamera-Übung markiert", () => {
    expect(EXERCISES.filter((e) => e.tracked).map((e) => e.id)).toEqual(["squat"]);
  });

  it("prüft gespeicherte Antworten streng", () => {
    expect(isAnswers(base)).toBe(true);
    expect(isAnswers({ ...base, days: 7 })).toBe(false);
    expect(isAnswers({ ...base, focus: ["arme"] })).toBe(false);
    expect(isAnswers(null)).toBe(false);
  });
});
