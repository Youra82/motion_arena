import { expect, it } from "vitest";
import { synthFrame } from "@motion-arena/pose-engine";
import { BodyLoadAnalyzer } from "../../src/index.js";

it("kann nach kollabierten Weltpunkten wieder eine gehaltene Kniebeuge erkennen", () => {
  const analyzer = new BodyLoadAnalyzer();
  const pose = { view: "side", kneeFlexDeg: 100, extraLeanDeg: 24 } as const;
  const collapse = (t: number) => {
    const frame = synthFrame(t, pose);
    frame.worldLandmarks = frame.worldLandmarks!.map((p) => ({ ...p, x: 0, y: 0, z: 0 }));
    return frame;
  };
  for (let i = 0; i < 20; i++) {
    expect(analyzer.update(collapse(i * 40)).movement.id).toBe("unbekannt");
  }
  const recovered = Array.from({ length: 50 }, (_, i) => analyzer.update(synthFrame((20 + i) * 40, pose)));
  expect(recovered.at(-1)?.movement.id).toBe("kniebeuge");
});
