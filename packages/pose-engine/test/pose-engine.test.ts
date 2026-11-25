import { describe, expect, it } from "vitest";
import { LM } from "@motion-arena/shared";
import {
  Calibrator,
  OneEuroFilter,
  angleDeg,
  assessSquatQuality,
  extractSquatFeatures,
  seededRng,
  squatDepth,
  synthFrame,
  synthPose,
  type Calibration,
} from "../src/index.js";

function calibrate(view: "front" | "side", extra: Partial<Parameters<typeof synthFrame>[1]> = {}): Calibration {
  const c = new Calibrator();
  let last;
  for (let t = 0; t <= 1600; t += 33) last = c.update(extractSquatFeatures(synthFrame(t, { kneeFlexDeg: 0, view, ...extra })));
  expect(last!.phase).toBe("done");
  return last!.result!;
}

describe("Geometrie", () => {
  it("berechnet rechte Winkel in 2D und 3D", () => {
    expect(angleDeg({ x: 1, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 1 })).toBeCloseTo(90);
    expect(angleDeg({ x: 0, y: 0, z: 1 }, { x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, true)).toBeCloseTo(90);
    expect(angleDeg({ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 1, y: 0 })).toBeNull();
  });

  it("Kniewinkel in Seitenansicht stimmt trotz Hochkant-Seitenverhältnis (2D)", () => {
    for (const flex of [0, 45, 90]) {
      const f = extractSquatFeatures(synthFrame(0, { kneeFlexDeg: flex, view: "side", noWorld: true, aspect: 9 / 16 }));
      expect(f.kneeSource).toBe("2d");
      expect(f.kneeAngle!).toBeCloseTo(180 - flex, 0);
    }
  });

  it("Kniewinkel aus 3D-Weltkoordinaten ist blickwinkelunabhängig", () => {
    const side = extractSquatFeatures(synthFrame(0, { kneeFlexDeg: 80, view: "side" }));
    const front = extractSquatFeatures(synthFrame(0, { kneeFlexDeg: 80, view: "front" }));
    expect(side.kneeSource).toBe("3d");
    expect(side.kneeAngle!).toBeCloseTo(100, 0);
    expect(front.kneeAngle!).toBeCloseTo(100, 0);
  });
});

describe("Erkennungsqualität", () => {
  it("erkennt keine Person", () => {
    expect(assessSquatQuality(null).status).toBe("no-person");
  });

  it("meldet fehlende Füße, wenn Knöchel außerhalb des Bildes liegen", () => {
    const { landmarks } = synthPose({ kneeFlexDeg: 0, view: "front", groundY: 1.15 });
    const q = assessSquatQuality(landmarks);
    expect(q.status).toBe("partial");
    expect(q.missing).toContain("Füße");
  });

  it("meldet Teilkörper, wenn keine Beinkette vollständig ist", () => {
    const { landmarks } = synthPose({
      kneeFlexDeg: 0,
      view: "front",
      visibility: { [LM.LEFT_KNEE]: 0.1, [LM.RIGHT_ANKLE]: 0.1 },
    });
    expect(assessSquatQuality(landmarks).status).toBe("partial");
  });

  it("geringe Sichtbarkeit → low-confidence", () => {
    const vis: Record<number, number> = {};
    for (let i = 0; i < 33; i++) vis[i] = 0.55;
    const { landmarks } = synthPose({ kneeFlexDeg: 0, view: "front", visibility: vis });
    expect(assessSquatQuality(landmarks).status).toBe("low-confidence");
  });

  it("vollständige frontale Person → ok", () => {
    expect(assessSquatQuality(synthPose({ kneeFlexDeg: 0, view: "front" }).landmarks).status).toBe("ok");
  });
});

describe("Kalibrierung", () => {
  it("kalibriert nach ruhigem Stehen und erkennt den Blickwinkel", () => {
    expect(calibrate("front").view).toBe("front");
    expect(calibrate("side").view).toBe("side");
    expect(calibrate("side").standingKneeAngle).toBeCloseTo(180, 0);
  });

  it("startet neu, wenn die Person in die Hocke geht", () => {
    const c = new Calibrator();
    for (let t = 0; t < 1000; t += 33) c.update(extractSquatFeatures(synthFrame(t, { kneeFlexDeg: 0, view: "front" })));
    const p = c.update(extractSquatFeatures(synthFrame(1000, { kneeFlexDeg: 70, view: "front" })));
    expect(p.phase).toBe("waiting");
    expect(p.message).toMatch(/Aufrecht/);
  });

  it("verlangt den ganzen Körper", () => {
    const c = new Calibrator();
    const p = c.update(extractSquatFeatures(synthFrame(0, { kneeFlexDeg: 0, view: "front", groundY: 1.2 })));
    expect(p.phase).toBe("waiting");
    expect(p.message).toMatch(/Ganzer Körper/);
  });

  it("kalibriert nicht, während die Person seitlich durchs Bild geht", () => {
    const c = new Calibrator();
    let last;
    for (let t = 0; t <= 2500; t += 33)
      last = c.update(extractSquatFeatures(synthFrame(t, { kneeFlexDeg: 0, view: "front", centerX: 0.25 + 0.5 * (t / 2500) })));
    expect(last!.phase).not.toBe("done");
  });

  it("toleriert Rauschen beim Stehen", () => {
    const rng = seededRng(7);
    const c = new Calibrator();
    let last;
    for (let t = 0; t <= 1700; t += 33)
      last = c.update(extractSquatFeatures(synthFrame(t, { kneeFlexDeg: 0, view: "front", noise: 0.002, rng })));
    expect(last!.phase).toBe("done");
  });
});

describe("Beugetiefe", () => {
  it("steigt monoton mit der Kniebeugung, ~1 bei Kniewinkel 90°", () => {
    for (const view of ["front", "side"] as const) {
      const cal = calibrate(view);
      const d = [0, 30, 60, 90].map((flex) => squatDepth(extractSquatFeatures(synthFrame(0, { kneeFlexDeg: flex, view })), cal)!);
      expect(d[0]!).toBeCloseTo(0, 1);
      for (let i = 1; i < d.length; i++) expect(d[i]!).toBeGreaterThan(d[i - 1]!);
      expect(d[3]!).toBeGreaterThan(0.85);
      expect(d[3]!).toBeLessThan(1.4);
    }
  });

  it("frontal ohne 3D: nutzt nur Hüftabsenkung, Tiefe trotzdem plausibel", () => {
    const cal = calibrate("front", { noWorld: true });
    expect(cal.kneeSource).toBe("2d");
    const d = squatDepth(extractSquatFeatures(synthFrame(0, { kneeFlexDeg: 90, view: "front", noWorld: true })), cal)!;
    expect(d).toBeGreaterThan(0.85);
  });
});

describe("One-Euro-Filter", () => {
  it("dämpft Rauschen um einen konstanten Wert", () => {
    const f = new OneEuroFilter();
    const rng = seededRng(1);
    let maxDev = 0;
    for (let i = 0; i < 300; i++) {
      const v = f.filter(1 + (rng() - 0.5) * 0.02, i * 33);
      if (i > 30) maxDev = Math.max(maxDev, Math.abs(v - 1));
    }
    expect(maxDev).toBeLessThan(0.008);
  });
});
