import { describe, expect, it } from "vitest";
import { LM } from "@motion-arena/shared";
import { seededRng, synthFrame, synthSequence } from "@motion-arena/pose-engine";
import { SquatCounter } from "../src/index.js";
import { calibrateWith, reps, runFrames, squatFrames, type Base } from "./helpers.js";

function rotY<T extends { x: number; z: number }>(p: T, deg: number): T {
  const a = (deg * Math.PI) / 180;
  return { ...p, x: p.x * Math.cos(a) + p.z * Math.sin(a), z: -p.x * Math.sin(a) + p.z * Math.cos(a) };
}

const VIEWS: Array<[string, Base]> = [
  ["frontal 3D", { view: "front" }],
  ["seitlich 3D", { view: "side" }],
  ["frontal nur 2D", { view: "front", noWorld: true }],
  ["seitlich nur 2D", { view: "side", noWorld: true }],
  ["frontal 16:9 quer", { view: "front", aspect: 16 / 9, scale: 0.8 }],
];

describe("Kniebeugen-Zähler – Definition of Done", () => {
  for (const [name, base] of VIEWS) {
    it(`zählt drei saubere Kniebeugen als drei (${name})`, () => {
      const counter = new SquatCounter(calibrateWith(base));
      const ev = runFrames(counter, squatFrames(base, 3));
      expect(reps(ev)).toHaveLength(3);
      expect(counter.repCount).toBe(3);
    });
  }

  it("ist reproduzierbar mit Rauschen (20 Seeds, je 3 Kniebeugen)", () => {
    for (let seed = 1; seed <= 20; seed++) {
      const base: Base = { view: "front", noise: 0.003, rng: seededRng(seed) };
      const counter = new SquatCounter(calibrateWith(base));
      expect(reps(runFrames(counter, squatFrames(base, 3)))).toHaveLength(3);
    }
  });
});

describe("Kniebeugen-Zähler – Robustheit", () => {
  const base: Base = { view: "front" };

  it("zählt zu flache Kniebeugen nicht und gibt Feedback", () => {
    const counter = new SquatCounter(calibrateWith(base));
    const ev = runFrames(counter, squatFrames(base, 3, 40));
    expect(reps(ev)).toHaveLength(0);
    expect(ev.filter((e) => e.type === "shallow")).toHaveLength(3);
  });

  it("ignoriert leichtes Wippen im Stand (kein Feedback-Spam)", () => {
    const counter = new SquatCounter(calibrateWith(base));
    const steps = [{ ms: 500, toFlex: 0 }];
    for (let i = 0; i < 10; i++) steps.push({ ms: 200, toFlex: 20 }, { ms: 200, toFlex: 0 });
    const ev = runFrames(counter, synthSequence(steps, base, 30, 10_000));
    expect(ev).toHaveLength(0);
  });

  it("zählt Wippen am Tiefpunkt als eine Wiederholung", () => {
    const counter = new SquatCounter(calibrateWith(base));
    const steps = [
      { ms: 500, toFlex: 0 },
      { ms: 900, toFlex: 95 },
      { ms: 200, toFlex: 75 },
      { ms: 200, toFlex: 95 },
      { ms: 200, toFlex: 78 },
      { ms: 200, toFlex: 95 },
      { ms: 900, toFlex: 0 },
      { ms: 400, toFlex: 0 },
    ];
    expect(reps(runFrames(counter, synthSequence(steps, base, 30, 10_000)))).toHaveLength(1);
  });

  it("zählt ruckartige Mini-Wiederholungen nicht (zu schnell)", () => {
    const counter = new SquatCounter(calibrateWith(base));
    const steps = [{ ms: 500, toFlex: 0 }, { ms: 200, toFlex: 90 }, { ms: 200, toFlex: 0 }, { ms: 300, toFlex: 0 }];
    const ev = runFrames(counter, synthSequence(steps, base, 30, 10_000));
    expect(reps(ev)).toHaveLength(0);
    expect(ev.some((e) => e.type === "too-fast")).toBe(true);
  });

  it("zählt sehr langsame Kniebeugen (8 s)", () => {
    const counter = new SquatCounter(calibrateWith(base));
    const steps = [{ ms: 500, toFlex: 0 }, { ms: 4000, toFlex: 95 }, { ms: 4000, toFlex: 0 }, { ms: 300, toFlex: 0 }];
    expect(reps(runFrames(counter, synthSequence(steps, base, 30, 10_000)))).toHaveLength(1);
  });

  it("Teilkörper mitten in der Bewegung: Warnung, keine Zählung, keine Fehlwertung", () => {
    const cal = calibrateWith(base);
    const counter = new SquatCounter(cal);
    const occluded: Base = { ...base, visibility: { [LM.LEFT_ANKLE]: 0.1, [LM.RIGHT_ANKLE]: 0.1 } };
    const frames = [
      ...synthSequence([{ ms: 500, toFlex: 0 }, { ms: 800, toFlex: 90 }], base, 30, 10_000),
      // Füße 1 s verdeckt, Person kommt währenddessen hoch
      ...synthSequence([{ ms: 1000, toFlex: 0 }], occluded, 30, 11_340, 90),
      ...synthSequence([{ ms: 600, toFlex: 0 }], base, 30, 12_380),
    ];
    const ev = runFrames(counter, frames);
    expect(reps(ev)).toHaveLength(0);
    const lost = ev.find((e) => e.type === "tracking-lost");
    expect(lost).toMatchObject({ abortedRep: true, missing: ["Füße"] });
    expect(ev.some((e) => e.type === "tracking-restored")).toBe(true);
    expect(ev.some((e) => e.type === "shallow" || e.type === "too-fast")).toBe(false);
    // Danach wird normal weitergezählt.
    expect(reps(runFrames(counter, squatFrames(base, 2, 95, 13_100)))).toHaveLength(2);
  });

  it("Person verschwindet tief in der Hocke und taucht in der Hocke wieder auf: kein Halb-Zählen", () => {
    const counter = new SquatCounter(calibrateWith(base));
    const frames = [
      ...synthSequence([{ ms: 500, toFlex: 0 }, { ms: 900, toFlex: 95 }], base, 30, 10_000),
      ...Array.from({ length: 20 }, (_, i) => ({ t: 11_400 + i * 33, landmarks: null, worldLandmarks: null, aspect: 9 / 16 })),
      ...synthSequence([{ ms: 900, toFlex: 0 }, { ms: 300, toFlex: 0 }], base, 30, 12_100, 95),
    ];
    const ev = runFrames(counter, frames);
    expect(reps(ev)).toHaveLength(0);
    expect(ev.some((e) => e.type === "tracking-lost")).toBe(true);
  });

  it("überbrückt kurze Aussetzer (< 300 ms) ohne Abbruch", () => {
    const counter = new SquatCounter(calibrateWith(base));
    const frames = squatFrames(base, 1).map((f, i) =>
      i >= 30 && i < 36 ? { ...f, landmarks: null, worldLandmarks: null } : f,
    );
    const ev = runFrames(counter, frames);
    expect(reps(ev)).toHaveLength(1);
    expect(ev.some((e) => e.type === "tracking-lost")).toBe(false);
  });

  it("zählt nicht, bevor die Person einmal sicher aufrecht stand (Start in der Hocke)", () => {
    const counter = new SquatCounter(calibrateWith(base));
    const frames = synthSequence([{ ms: 800, toFlex: 0 }, { ms: 300, toFlex: 0 }], base, 30, 10_000, 95);
    expect(reps(runFrames(counter, frames))).toHaveLength(0);
    expect(counter.repCount).toBe(0);
  });

  it("asymmetrische Kniebeuge wird gezählt und Unterschied gemessen", () => {
    const b: Base = { view: "front", rightKneeOffsetDeg: 25 };
    const counter = new SquatCounter(calibrateWith({ view: "front" }));
    const ev = reps(runFrames(counter, squatFrames(b, 1)));
    expect(ev).toHaveLength(1);
    const rep = ev[0]!.type === "rep" ? ev[0]!.rep : null;
    expect(rep!.symmetryDiffDeg!).toBeGreaterThan(20);
  });

  it("frame-genau: Zählung erfolgt erst beim Wieder-Aufrichten", () => {
    const counter = new SquatCounter(calibrateWith(base));
    const down = synthSequence([{ ms: 500, toFlex: 0 }, { ms: 1000, toFlex: 95 }, { ms: 300, toFlex: 95 }], base, 30, 10_000);
    expect(reps(runFrames(counter, down))).toHaveLength(0);
    const up = synthSequence([{ ms: 1000, toFlex: 0 }], base, 30, 11_800, 95);
    expect(reps(runFrames(counter, up))).toHaveLength(1);
  });

  it("mit 3D-Weltkoordinaten: Drehung zur Kamera während der Übung unterbricht nicht", () => {
    const counter = new SquatCounter(calibrateWith({ view: "side" }));
    // Weltkoordinaten drehen sich während drei Kniebeugen langsam um 90° (seitlich → frontal).
    const frames = squatFrames({ view: "side" }, 3).map((f, i, all) => ({
      ...f,
      worldLandmarks: f.worldLandmarks!.map((p) => rotY(p, -90 * (i / all.length))),
    }));
    const ev = runFrames(counter, frames);
    expect(reps(ev)).toHaveLength(3);
    expect(ev.some((e) => e.type === "tracking-lost")).toBe(false);
  });

  it("ein einzelner Frame ohne Person stört eine stehende Person nicht", () => {
    const counter = new SquatCounter(calibrateWith(base));
    const ev = runFrames(counter, [
      synthFrame(10_000, { ...base, kneeFlexDeg: 0 }),
      { t: 10_033, landmarks: null, aspect: 9 / 16 },
      synthFrame(10_066, { ...base, kneeFlexDeg: 0 }),
    ]);
    expect(ev).toHaveLength(0);
  });
});
