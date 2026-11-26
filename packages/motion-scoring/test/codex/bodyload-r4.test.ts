import { describe, expect, it } from "vitest";
import { synthFrame, type SynthOptions } from "@motion-arena/pose-engine";
import { LM, type PoseFrame } from "@motion-arena/shared";
import { BodyLoadAnalyzer, bodyFeatures } from "../../src/index.js";

const stand = { view: "front", kneeFlexDeg: 0, arms: "down", aspect: 1 } satisfies SynthOptions;

function analyze(makeFrame: (t: number) => PoseFrame, frames = 50) {
  const analyzer = new BodyLoadAnalyzer();
  return Array.from({ length: frames }, (_, i) => analyzer.update(makeFrame(i * 40)));
}

function roll(frame: PoseFrame, degrees: number): PoseFrame {
  const a = degrees * Math.PI / 180;
  const rotate = (points: NonNullable<PoseFrame["landmarks"]>, center: number) => points.map((p) => ({
    ...p,
    x: center + Math.cos(a) * (p.x - center) - Math.sin(a) * (p.y - center),
    y: center + Math.sin(a) * (p.x - center) + Math.cos(a) * (p.y - center),
  }));
  return { ...frame, landmarks: rotate(frame.landmarks!, 0.5), worldLandmarks: rotate(frame.worldLandmarks!, 0) };
}

describe("Live-Körperanalyse – neue Grenzfälle", () => {
  it("erkennt einen Ausfallschritt auch bei einer moderat gekippten Kamera", () => {
    const lunge = { ...stand, lunge: 1, view: "side" } satisfies SynthOptions;
    expect(analyze((t) => synthFrame(t, lunge)).at(-1)?.movement.id).toBe("ausfallschritt");
    for (const degrees of [-30, 30]) {
      expect(analyze((t) => roll(synthFrame(t, lunge), degrees)).at(-1)?.movement.id).toBe("ausfallschritt");
    }
  });

  it("erkennt eine tiefe Kniebeuge mit deutlicher Vorlage und Schwerpunkt über den Füßen", () => {
    // CODEX-BEFUND: Die Stütz-Vorprüfung beendet die Klassifikation trotz tiefer, symmetrischer Kniewinkel.
    const squat = { ...stand, view: "side", kneeFlexDeg: 100, extraLeanDeg: 24 } satisfies SynthOptions;
    const f = bodyFeatures(synthFrame(0, squat).worldLandmarks)!;
    expect(f.trunkIncl).toBeGreaterThan(55);
    expect(f.comOffset).toBeLessThan(0.12);
    expect(analyze((t) => synthFrame(t, squat)).at(-1)?.movement.id).toBe("kniebeuge");
  });

  it("trennt schnelles Armheben mit geringer Fußbewegung vom weit geöffneten Hampelmann", () => {
    // FRAGE: Die Grenze ist bei gelenkschonenden Varianten mit kleinen Schritten eine Produktentscheidung.
    function jumping(maxSpread: number) {
      return analyze((t) => {
        const phase = (1 + Math.sin(2 * Math.PI * t / 840)) / 2;
        return synthFrame(t, { ...stand, arms: 15 + 145 * phase, legSpreadDeg: maxSpread * phase });
      }, 100).slice(-25);
    }
    expect(jumping(18).some((r) => r.movement.id === "hampelmann")).toBe(true);
    expect(jumping(4).some((r) => r.movement.id === "hampelmann")).toBe(false);
  });

  it("verwendet einen einzelnen unmöglichen Knöchelsprung nicht als Beleg für Hampelmänner", () => {
    // CODEX-BEFUND: Obwohl die Geschwindigkeit verworfen wird, bleibt der rohe Fußabstand im Erkennungsfenster.
    function swing(t: number, outlier: boolean) {
      const frame = synthFrame(t, { ...stand, arms: 90 + 75 * Math.sin(2 * Math.PI * t / 700) });
      if (outlier && t === 2000) frame.worldLandmarks![LM.LEFT_ANKLE]!.x += 6;
      return frame;
    }
    expect(analyze((t) => swing(t, false), 80).some((r) => r.movement.id === "hampelmann")).toBe(false);
    expect(analyze((t) => swing(t, true), 80).slice(50).some((r) => r.movement.id === "hampelmann")).toBe(false);
  });

  it("wertet identische Welt-Kernpunkte als unbrauchbare Bewegungsdaten", () => {
    // CODEX-BEFUND: Ein kollabierter Körper wird trotz fehlender Segmentlängen als Stütz klassifiziert.
    const result = analyze((t) => {
      const frame = synthFrame(t, stand);
      return { ...frame, worldLandmarks: frame.worldLandmarks!.map((p) => ({ ...p, x: 0, y: 0, z: 0 })) };
    }).at(-1)!;
    expect(result.movement.id).toBe("unbekannt");
    expect(result.movement.confidence).toBe(0);
  });
});
