import { describe, expect, it } from "vitest";
import {
  SquatCounter,
  applySquatEvents,
  createSession,
  finishSession,
  pauseSession,
  pointsFor,
  resumeSession,
  scoreRep,
  startSession,
  summarize,
  type RepRecord,
} from "../src/index.js";
import { calibrateWith, runFrames, squatFrames } from "./helpers.js";

const rep = (over: Partial<RepRecord> = {}): RepRecord => ({
  index: 1,
  startT: 0,
  bottomT: 1000,
  endT: 2000,
  maxDepth: 1,
  minKneeAngle: 90,
  symmetryDiffDeg: 3,
  maxTorsoLeanDeg: 30,
  view: "side",
  ...over,
});

describe("Bewertung", () => {
  it("saubere Wiederholung → 100 und positives Feedback", () => {
    const s = scoreRep(rep());
    expect(s.total).toBe(100);
    expect(s.feedback).toEqual(["Saubere Wiederholung"]);
    expect(s.estimated).toBe(true);
  });

  it("flach + schnell → niedriger Wert mit verständlichen Hinweisen", () => {
    const s = scoreRep(rep({ maxDepth: 0.55, bottomT: 300 }));
    expect(s.total).toBeLessThan(65);
    expect(s.components.find((c) => c.key === "depth")!.points!).toBeLessThan(30);
    expect(s.feedback).toContain("Etwas tiefer gehen");
    expect(s.feedback).toContain("Langsamer absenken");
  });

  it("frontal: Haltung wird nicht bewertet statt geschätzt", () => {
    const s = scoreRep(rep({ view: "front", maxTorsoLeanDeg: null }));
    expect(s.components.find((c) => c.key === "posture")!.points).toBeNull();
    expect(s.total).toBe(100);
  });

  it("Combo-Bonus max. +50 %", () => {
    expect(pointsFor(100, 1)).toBe(100);
    expect(pointsFor(100, 3)).toBe(120);
    expect(pointsFor(100, 50)).toBe(150);
  });
});

describe("Session", () => {
  it("zählt Wiederholungen, Punkte und Combo über Zähler-Ereignisse", () => {
    const base = { view: "front" as const };
    const counter = new SquatCounter(calibrateWith(base));
    let s = startSession(createSession(5), 10_000);
    s = applySquatEvents(s, runFrames(counter, squatFrames(base, 3)));
    expect(s.reps).toHaveLength(3);
    expect(s.combo).toBe(3);
    expect(s.points).toBeGreaterThan(0);
    expect(s.reps.map((r) => r.rep.index)).toEqual([1, 2, 3]);
  });

  it("Erkennungsaussetzer: keine Strafpunkte, Combo bleibt", () => {
    let s = startSession(createSession(), 0);
    s = applySquatEvents(s, [{ type: "rep", t: 2000, rep: rep() }]);
    const before = s.points;
    s = applySquatEvents(s, [
      { type: "tracking-lost", t: 3000, missing: ["Füße"], abortedRep: true },
      { type: "tracking-restored", t: 4000 },
    ]);
    expect(s.points).toBe(before);
    expect(s.combo).toBe(1);
    expect(summarize(s).trackingInterruptions).toBe(1);
  });

  it("Fehlversuch beendet Combo ohne Punktabzug", () => {
    let s = startSession(createSession(), 0);
    s = applySquatEvents(s, [{ type: "rep", t: 2000, rep: rep() }]);
    const before = s.points;
    s = applySquatEvents(s, [{ type: "shallow", t: 3000, maxDepth: 0.4 }]);
    expect(s.combo).toBe(0);
    expect(s.points).toBe(before);
  });

  it("Pause ignoriert Ereignisse und zählt keine Pausenzeit", () => {
    let s = startSession(createSession(), 0);
    s = pauseSession(s, 10_000);
    s = applySquatEvents(s, [{ type: "rep", t: 11_000, rep: rep() }]);
    expect(s.reps).toHaveLength(0);
    s = resumeSession(s, 40_000);
    s = finishSession(s, 45_000);
    expect(summarize(s).activeSeconds).toBe(15);
    expect(s.status).toBe("finished");
  });
});
