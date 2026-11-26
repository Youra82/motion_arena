import { beforeEach, describe, expect, it } from "vitest";
import { applySquatEvents, type RepRecord } from "@motion-arena/motion-scoring";
import { actions, useApp } from "./store";

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

function trainAndFinish(source: "camera" | "demo", reps: number) {
  actions.openLive(source, 10);
  actions.startTraining(1000);
  const events = Array.from({ length: reps }, (_, i) => ({ type: "rep" as const, t: 2000 + i * 2000, rep: rep(i + 1) }));
  useApp.setState((s) => ({ session: applySquatEvents(s.session, events) }));
  actions.finish(30_000);
}

describe("Verlauf", () => {
  beforeEach(() => useApp.setState({ history: [] }));

  it("speichert ein Kamera-Training mit Wiederholungen genau einmal", () => {
    trainAndFinish("camera", 3);
    expect(useApp.getState().history).toHaveLength(1);
    expect(useApp.getState().history[0]).toMatchObject({ reps: 3, targetReps: 10 });
    actions.finish(31_000); // doppeltes Beenden speichert nicht erneut
    expect(useApp.getState().history).toHaveLength(1);
    expect(useApp.getState().screen).toBe("result");
  });

  it("speichert keine Demo und kein Training ohne Wiederholung", () => {
    trainAndFinish("demo", 4);
    trainAndFinish("camera", 0);
    expect(useApp.getState().history).toHaveLength(0);
  });
});
