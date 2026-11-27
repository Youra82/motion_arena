import { afterEach, expect, it, vi } from "vitest";
import { loadProgram } from "./persist";

afterEach(() => vi.unstubAllGlobals());

const answers = { goal: "kraft", level: "neu", days: 3, minutes: 20, focus: ["beine"], pain: "keine" };
const load = (extra: Record<string, unknown>) => {
  vi.stubGlobal("localStorage", { getItem: () => JSON.stringify({ answers, done: 0, startedAt: "2026-11-01T00:00:00.000Z", ...extra }) });
  return loadProgram();
};

it("übernimmt die alte Wahl „zu schwer / passt / zu leicht“ als Stufe 3 / 5 / 7", () => {
  expect(load({ adjust: -1 })?.level).toBe(3);
  expect(load({ adjust: 0 })?.level).toBe(5);
  expect(load({ adjust: 1 })?.level).toBe(7);
  expect(load({})?.level).toBe(5);
});

it("liest Stufe 1–10 und verwirft Unsinn", () => {
  expect(load({ level: 1 })?.level).toBe(1);
  expect(load({ level: 10 })?.level).toBe(10);
  expect(load({ level: 11 })?.level).toBe(5);
  expect(load({ level: 2.5 })?.level).toBe(5);
});
