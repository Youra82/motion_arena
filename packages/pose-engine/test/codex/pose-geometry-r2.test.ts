import { describe, expect, it } from "vitest";
import { LM } from "@motion-arena/shared";
import { Calibrator, extractSquatFeatures, squatDepthDetailed, synthFrame } from "../../src/index.js";

describe("Geometrie unter veränderter Kameraansicht", () => {
  it("erkennt einen unverändert gestreckten Stand auch bei gerollter Kamera als Stand", () => {
    const calibrator = new Calibrator();
    for (let t = 0; t <= 1500; t += 50) {
      calibrator.update(extractSquatFeatures(synthFrame(t, { view: "front", kneeFlexDeg: 0 })));
    }
    const calibration = calibrator.calibration!;
    expect(calibration).not.toBeNull();

    const frame = synthFrame(1550, { view: "front", kneeFlexDeg: 0, aspect: 1, scale: 0.6 });
    const roll = (50 * Math.PI) / 180;
    const rotate = (x: number, y: number) => ({
      x: x * Math.cos(roll) - y * Math.sin(roll),
      y: x * Math.sin(roll) + y * Math.cos(roll),
    });
    frame.worldLandmarks = frame.worldLandmarks!.map((p) => ({ ...p, ...rotate(p.x, p.y) }));
    frame.landmarks = frame.landmarks!.map((p) => {
      const { x, y } = rotate(p.x - 0.5, p.y - 0.6);
      return { ...p, x: x + 0.5, y: y + 0.6 };
    });
    const features = extractSquatFeatures(frame);
    expect(features.quality.status).toBe("ok");
    expect(features.kneeAngle).toBeCloseTo(180);
    // CODEX-BEFUND: Die Kamera-y-Projektion ergibt bei geraden Knien eine zählbare Tiefe.
    const depth = squatDepthDetailed(features, calibration).depth;
    expect(depth ?? 0).toBeLessThan(0.12);
  });

  it("akzeptiert eine frontale tiefe 2D-Hocke mit schmaleren Schultern nicht als Stand", () => {
    const calibrator = new Calibrator();
    for (let t = 0; t <= 1500; t += 50) {
      const frame = synthFrame(t, { view: "front", kneeFlexDeg: 85, noWorld: true });
      for (const i of [LM.LEFT_SHOULDER, LM.RIGHT_SHOULDER]) {
        const p = frame.landmarks![i]!;
        p.x = 0.5 + (p.x - 0.5) * 0.8;
      }
      const features = extractSquatFeatures(frame);
      expect(features.shoulderWidthRatio).toBeGreaterThan(0.55);
      calibrator.update(features);
    }
    // CODEX-BEFUND: Ein fester Grenzwert für Schulterbreiten hängt von Körperproportionen ab.
    expect(calibrator.calibration).toBeNull();
  });

  it("fordert bei abgeschnittenem Kopf das vollständige Bild für die Kalibrierung an", () => {
    const calibrator = new Calibrator();
    for (let t = 0; t <= 1500; t += 50) {
      const frame = synthFrame(t, { view: "front", kneeFlexDeg: 0, scale: 1.07 });
      expect(frame.landmarks![LM.NOSE]!.y).toBeLessThan(-0.02);
      calibrator.update(extractSquatFeatures(frame));
    }
    // CODEX-BEFUND: Die Kalibrierung akzeptiert Teilkörper entgegen der Anweisung „ganzer Körper“.
    expect(calibrator.calibration).toBeNull();
  });
});
