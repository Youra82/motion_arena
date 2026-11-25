import { expect } from "vitest";
import {
  Calibrator,
  cleanSquatSteps,
  extractSquatFeatures,
  synthFrame,
  synthSequence,
  type Calibration,
  type SquatScriptStep,
  type SynthOptions,
} from "@motion-arena/pose-engine";
import type { PoseFrame } from "@motion-arena/shared";
import { SquatCounter, type SquatEvent } from "../src/index.js";

export type Base = Omit<SynthOptions, "kneeFlexDeg">;

export function calibrateWith(base: Base): Calibration {
  const c = new Calibrator();
  let last;
  for (let t = 0; t <= 1600; t += 33) last = c.update(extractSquatFeatures(synthFrame(t, { ...base, kneeFlexDeg: 0 })));
  expect(last!.phase).toBe("done");
  return last!.result!;
}

export function runFrames(counter: SquatCounter, frames: PoseFrame[]): SquatEvent[] {
  const events: SquatEvent[] = [];
  for (const fr of frames) events.push(...counter.update(extractSquatFeatures(fr)).events);
  return events;
}

/** n saubere Kniebeugen mit 0,5 s Stand am Anfang. */
export function squatFrames(base: Base, n: number, depthFlex = 95, startT = 10_000): PoseFrame[] {
  const steps: SquatScriptStep[] = [{ ms: 500, toFlex: 0 }];
  for (let i = 0; i < n; i++) steps.push(...cleanSquatSteps(depthFlex));
  return synthSequence(steps, base, 30, startT);
}

export const reps = (ev: SquatEvent[]) => ev.filter((e) => e.type === "rep");
