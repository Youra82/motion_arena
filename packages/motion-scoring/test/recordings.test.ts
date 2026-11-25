import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { Calibrator, LandmarkSmoother, extractSquatFeatures } from "@motion-arena/pose-engine";
import type { PoseFrame } from "@motion-arena/shared";
import { SquatCounter } from "../src/index.js";

/**
 * Echte Aufnahmen (Button „Posen aufnehmen“ in der App) als Regressionstests.
 * Ablage: fixtures/recordings/*.json, vorher "expectedReps" eintragen.
 * Verarbeitung wie in der App: Glättung → Merkmale → Kalibrierung → Zähler.
 */
const dir = join(dirname(fileURLToPath(import.meta.url)), "../../../fixtures/recordings");
const files = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".json")) : [];

interface Recording {
  format: string;
  expectedReps: number | null;
  frames: PoseFrame[];
}

export function replay(frames: PoseFrame[]): { reps: number; calibrated: boolean; events: string[] } {
  const sm = new LandmarkSmoother();
  const wsm = new LandmarkSmoother();
  const cal = new Calibrator();
  let counter: SquatCounter | null = null;
  const events: string[] = [];
  for (const raw of frames) {
    const f = extractSquatFeatures({
      ...raw,
      landmarks: sm.smooth(raw.landmarks, raw.t),
      worldLandmarks: wsm.smooth(raw.worldLandmarks ?? null, raw.t),
    });
    if (!counter) {
      const p = cal.update(f);
      if (p.result) counter = new SquatCounter(p.result);
      continue;
    }
    for (const e of counter.update(f).events) events.push(e.type);
  }
  return { reps: counter?.repCount ?? 0, calibrated: counter !== null, events };
}

describe("Echte Aufnahmen", () => {
  if (!files.length) {
    it.skip("keine Aufnahmen unter fixtures/recordings/ vorhanden", () => {});
    return;
  }
  for (const file of files) {
    const rec = JSON.parse(readFileSync(join(dir, file), "utf8")) as Recording;
    const run = rec.expectedReps === null ? it.skip : it;
    run(`${file}: ${rec.expectedReps ?? "?"} Wiederholungen`, () => {
      expect(rec.format).toBe("motion-arena-pose-recording/1");
      const r = replay(rec.frames);
      expect(r.calibrated).toBe(true);
      expect(r.reps).toBe(rec.expectedReps);
    });
  }
});
