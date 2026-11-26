import { afterEach, describe, expect, it, vi } from "vitest";
import { applySquatEvents, createSession, pauseSession, scoreRep, startSession, type RepRecord } from "@motion-arena/motion-scoring";
import { loadSettings } from "../persist";
import { isViewMode, VIEW_MODES } from "../view-modes";
import { activeTimeMs, arenaChecks, estimateKcal, squatFlex } from "./metrics";

const squat: RepRecord = {
  index: 1,
  startT: 1000,
  bottomT: 2000,
  endT: 3500,
  maxDepth: 0.95,
  minKneeAngle: 83,
  symmetryDiffDeg: 4,
  maxTorsoLeanDeg: 36,
  view: "diagonal",
};

afterEach(() => vi.unstubAllGlobals());

describe("Arena-Anzeigedaten", () => {
  it("leitet die Checks aus den tatsächlich bewerteten Teilwertungen ab", () => {
    expect(arenaChecks(scoreRep(squat))).toEqual({ posture: "good", symmetry: "good", depth: "good" });
    expect(arenaChecks(scoreRep({ ...squat, view: "front", symmetryDiffDeg: 21, maxDepth: 0.65 })))
      .toEqual({ posture: "unknown", symmetry: "improve", depth: "improve" });
    expect(arenaChecks(undefined)).toEqual({ posture: "unknown", symmetry: "unknown", depth: "unknown" });
  });

  it("schätzt Bruttoenergie nur für die Dauer gezählter Wiederholungen", () => {
    const session = startSession(createSession(), 0);
    expect(estimateKcal(session.reps)).toBe(0);
    const counted = applySquatEvents(session, [{ type: "rep", t: squat.endT, rep: squat }]);
    expect(estimateKcal(counted.reps)).toBe(0.1);
    expect(estimateKcal([...counted.reps, { ...counted.reps[0]!, rep: { ...squat, endT: NaN } }])).toBe(0.1);
    expect(estimateKcal(applySquatEvents(session, [{ type: "rep", t: 61_000, rep: { ...squat, endT: 61_000 } }]).reps)).toBe(3.5);
  });

  it("hält während einer Pause die aktive Zeit und das Trainertempo an", () => {
    const session = startSession(createSession(10), 100);
    expect(activeTimeMs(session, 2_000)).toBe(1_900);
    expect(activeTimeMs(pauseSession(session, 2_000), 30_000)).toBe(1_900);
    expect([0, 0.35, 0.45, 0.8].map((phase) => squatFlex(phase, 94))).toEqual([0, 94, 94, 0]);
  });

  it("speichert Arena und Raum, erkennt alte Modi und fängt ungültige Einstellungen ab", () => {
    expect(VIEW_MODES).toHaveLength(11);
    expect(isViewMode("arena")).toBe(true);
    expect(isViewMode("arena-ungültig")).toBe(false);
    const getItem = vi.fn();
    vi.stubGlobal("localStorage", { getItem });
    getItem.mockReturnValue('{"defaultView":"arena","arenaRoom":"lebombo"}');
    expect(loadSettings()).toMatchObject({ defaultView: "arena", arenaRoom: "lebombo" });
    getItem.mockReturnValue('{"defaultView":"hybrid"}');
    expect(loadSettings()).toMatchObject({ defaultView: "hybrid", arenaRoom: "loft" });
    getItem.mockReturnValue('{"defaultView":"andere","arenaRoom":"../foo"}');
    expect(loadSettings()).toMatchObject({ defaultView: "arena", arenaRoom: "loft" });
  });
});
