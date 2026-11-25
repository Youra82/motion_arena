import { describe, expect, it } from "vitest";
import { extractSquatFeatures, synthFrame, synthSequence } from "@motion-arena/pose-engine";
import { SquatCounter } from "../../src/index.js";
import { calibrateWith, reps, runFrames, squatFrames } from "../helpers.js";

const base = { view: "side" } as const;

describe("Bewegungskontinuität bei fehlenden und wechselnden Messungen", () => {
  it("verwirft einen Versuch nach 650 ms ohne verwertbare Messung", () => {
    const counter = new SquatCounter(calibrateWith(base));
    const frames = [
      ...squatFrames(base, 1).filter((f) => f.t <= 11_650.01),
      { ...synthFrame(12_040, { ...base, kneeFlexDeg: 0 }), landmarks: null },
      synthFrame(12_300, { ...base, kneeFlexDeg: 15 }),
      synthFrame(12_400, { ...base, kneeFlexDeg: 0 }),
    ];
    const events = runFrames(counter, frames);
    // CODEX-BEFUND: Der Teilkörper-Frame teilt die Lücke und lässt beide Zeitprüfungen passieren.
    expect(events.map((e) => e.type)).toContain("tracking-lost");
    expect(reps(events)).toHaveLength(0);
  });

  it("setzt nach bewusstem Reset über eine lange Pause ohne Tracking-Fehlalarm fort", () => {
    const counter = new SquatCounter(calibrateWith(base));
    const first = squatFrames(base, 2);
    expect(reps(runFrames(counter, first.filter((f) => f.t < 14_000)))).toHaveLength(1);
    counter.resetMotion();
    const crouch = counter.update(extractSquatFeatures(synthFrame(40_000, { ...base, kneeFlexDeg: 90 })));
    expect(crouch.events).toEqual([]);
    expect(crouch.armed).toBe(false);
    const resumed = runFrames(counter, squatFrames(base, 1, 95, 40_100));
    expect(resumed.filter((event) => event.type === "tracking-lost")).toEqual([]);
    expect(reps(resumed)).toHaveLength(1);
    expect(counter.repCount).toBe(2);
  });

  it("wertet einen durch 3D-Ausfall scheinbar zu flachen Versuch nicht als Bewegungsfehler", () => {
    const front = { view: "front" } as const;
    const calibration = calibrateWith(front);
    const frames = squatFrames(front, 1, 60);
    expect(reps(runFrames(new SquatCounter(calibration), frames))).toHaveLength(1);
    const fallback = frames.map((frame) =>
      frame.t > 10_850 && frame.t < 12_500 ? { ...frame, worldLandmarks: null } : frame,
    );
    const events = runFrames(new SquatCounter(calibration), fallback);
    // CODEX-BEFUND: 2D ersetzt mitten im Versuch die 3D-Tiefe und kann die Tiefenwertung verfälschen.
    expect(events.map((e) => e.type)).not.toContain("shallow");
  });

  it("zählt bei unregelmäßigen Frame-Abständen keinen isolierten Tiefen-Ausreißer", () => {
    const samples = [[0, 0], [450, 95], [900, 0], [1000, 0]] as const;
    const frames = samples.map(([t, kneeFlexDeg]) =>
      synthFrame(t, { ...base, kneeFlexDeg }),
    );
    const events = runFrames(new SquatCounter(calibrateWith(base)), frames);
    // CODEX-BEFUND: Mit 450 ms Abstand umgeht ein einzelnes Beugebild die Sprungprüfung.
    expect(reps(events)).toHaveLength(0);
  });

  it("zählt einen schnellen vollständigen Zyklus mit kontinuierlichen 60-fps-Daten", () => {
    const frames = synthSequence([
      { ms: 300, toFlex: 0 },
      { ms: 450, toFlex: 95 },
      { ms: 450, toFlex: 0 },
      { ms: 150, toFlex: 0 },
    ], base, 60);
    const events = runFrames(new SquatCounter(calibrateWith(base)), frames);
    expect(reps(events)).toHaveLength(1);
  });
});
