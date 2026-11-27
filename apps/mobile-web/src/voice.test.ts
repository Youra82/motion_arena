import { afterEach, expect, it, vi } from "vitest";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.resetModules();
});

function fakeSynth(speaking: boolean) {
  const spoken: string[] = [];
  const s = {
    speaking,
    pending: false,
    cancel: vi.fn(() => {
      s.speaking = false;
    }),
    resume: vi.fn(),
    getVoices: () => [],
    speak: vi.fn((u: { text: string }) => spoken.push(u.text)),
  };
  vi.stubGlobal("window", { speechSynthesis: s });
  vi.stubGlobal("SpeechSynthesisUtterance", class { lang = ""; voice = null; rate = 1; volume = 1; constructor(public text: string) {} });
  return { s, spoken };
}

it("spricht sofort, wenn gerade nichts gesagt wird", async () => {
  const { s, spoken } = fakeSynth(false);
  const { say } = await import("./voice");
  say("Los!");
  expect(s.cancel).not.toHaveBeenCalled();
  expect(spoken).toEqual(["Los!"]);
});

it("bricht eine laufende Ansage ab und spricht kurz danach (Safari verschluckt sonst die neue)", async () => {
  vi.useFakeTimers();
  const { s, spoken } = fakeSynth(true);
  const { say } = await import("./voice");
  say("3");
  expect(s.cancel).toHaveBeenCalledOnce();
  expect(spoken).toEqual([]);
  vi.advanceTimersByTime(150);
  expect(spoken).toEqual(["3"]);
});

it("nur die letzte von mehreren schnellen Ansagen wird gesprochen", async () => {
  vi.useFakeTimers();
  const { s, spoken } = fakeSynth(true);
  const { say } = await import("./voice");
  say("2");
  s.speaking = true;
  say("1");
  vi.advanceTimersByTime(150);
  expect(spoken).toEqual(["1"]);
});
