import { afterEach, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS, loadSettings } from "./persist";
import { actions, useApp } from "./store";

const initial = useApp.getState();

afterEach(() => {
  useApp.setState(initial);
  vi.unstubAllGlobals();
});

it("ergänzt alte Einstellungen und verwirft manipulierte Felder unabhängig voneinander", () => {
  let raw = '{"modelVariant":"full","defaultTarget":15,"defaultView":"gitter","weeklyGoal":4}';
  vi.stubGlobal("localStorage", { getItem: () => raw });
  expect(loadSettings()).toEqual({
    ...DEFAULT_SETTINGS, modelVariant: "full", defaultTarget: 15, defaultView: "gitter", weeklyGoal: 4,
  });
  raw = '{"avatar":{"id":"zara"},"room":"neon-arena","defaultView":"ungültig"}';
  expect(loadSettings()).toMatchObject({ avatar: DEFAULT_SETTINGS.avatar, room: "neon-arena", defaultView: DEFAULT_SETTINGS.defaultView });
  raw = '{"room":';
  expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
});

it("behält nach einer Avatar-Demo die zuvor gewählte Kameraansicht", () => {
  const setItem = vi.fn();
  vi.stubGlobal("localStorage", { setItem });
  useApp.setState({ settings: { ...DEFAULT_SETTINGS, avatar: "zara", room: "neon-arena", defaultView: "gitter" } });
  actions.openLive("demo", 15, "squat", "avatar");
  expect(useApp.getState()).toMatchObject({ viewMode: "avatar", settings: { defaultView: "gitter" } });
  actions.openLive("camera", 15);
  expect(useApp.getState()).toMatchObject({ viewMode: "gitter", settings: { avatar: "zara", room: "neon-arena" } });
  expect(setItem).not.toHaveBeenCalled();
});
