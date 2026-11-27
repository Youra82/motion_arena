import { beforeEach, describe, expect, it } from "vitest";
import { applySquatEvents, type RepRecord } from "@motion-arena/motion-scoring";
import { actions, useApp } from "../store";
import { exerciseById } from "./catalog";
import type { Answers } from "./planner";

const answers: Answers = { goal: "kraft", level: "neu", days: 3, minutes: 10, focus: ["beine"], pain: "keine" };

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

/** Alle Sätze aller Schritte abhaken (ohne Kamera). */
function finishAllByHand() {
  for (let guard = 0; guard < 100; guard++) {
    const w = useApp.getState().workout!;
    if (w.index >= w.steps.length) return;
    actions.workoutSetDone();
  }
}

describe("Programm-Training", () => {
  beforeEach(() => {
    actions.removeProgram();
    useApp.setState({ workout: null, history: [], screen: "home" });
  });

  it("legt ein Programm an und startet die erste Einheit", () => {
    actions.createProgram(answers);
    expect(useApp.getState().program?.done).toBe(0);
    expect(useApp.getState().settings.weeklyGoal).toBe(3);
    actions.startProgramSession();
    const w = useApp.getState().workout!;
    expect(useApp.getState().screen).toBe("workout");
    expect(w.origin).toBe("program");
    expect(w.steps.length).toBeGreaterThanOrEqual(2);
  });

  it("zählt die Einheit genau einmal, wenn alles erledigt ist", () => {
    actions.createProgram(answers);
    actions.startProgramSession();
    finishAllByHand();
    expect(useApp.getState().program?.done).toBe(1);
    actions.workoutSetDone(); // nichts mehr offen → kein zweites Zählen
    expect(useApp.getState().program?.done).toBe(1);
    actions.endWorkout();
    actions.startProgramSession();
    expect(useApp.getState().workout?.programIndex).toBe(1);
  });

  it("alles übersprungen zählt nicht als Einheit", () => {
    actions.createProgram(answers);
    actions.startProgramSession();
    for (let i = 0; i < 20 && useApp.getState().workout!.index < useApp.getState().workout!.steps.length; i++) actions.workoutSkip();
    expect(useApp.getState().program?.done).toBe(0);
  });

  it("Kniebeugen-Satz mit Kamera zählt nach dem Ergebnis, Demo nicht", () => {
    actions.createProgram(answers);
    actions.startProgramSession();
    const w = useApp.getState().workout!;
    const squatAt = w.steps.findIndex((s) => exerciseById(s.exerciseId)?.tracked);
    expect(squatAt).toBe(0);
    actions.workoutLive("camera");
    expect(useApp.getState().screen).toBe("live");
    expect(useApp.getState().session.targetReps).toBe(w.steps[0]!.reps);
    actions.startTraining(1000);
    useApp.setState((s) => ({ session: applySquatEvents(s.session, [{ type: "rep", t: 2000, rep: rep(1) }]) }));
    actions.finish(5000);
    actions.returnToWorkout(true);
    expect(useApp.getState().screen).toBe("workout");
    expect(useApp.getState().workout!.steps[0]!.setsDone).toBe(1);
    actions.returnToWorkout(false);
    expect(useApp.getState().workout!.steps[0]!.setsDone).toBe(1);
  });

  it("eigenes Training startet und wird gespeichert", () => {
    actions.startCustom({ name: "Test", steps: [{ exerciseId: "glute-bridge", sets: 1, reps: 10 }] });
    expect(useApp.getState().custom?.name).toBe("Test");
    finishAllByHand();
    expect(useApp.getState().workout!.index).toBe(1);
    expect(useApp.getState().program).toBeNull();
  });
});
