import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS, loadSettings } from "./persist";
import { isTvState } from "./tv/protocol";
import { tvStateFrom } from "./tv/phone-link";
import { useApp } from "./store";

afterEach(() => vi.unstubAllGlobals());

function stored(value: unknown) {
  vi.stubGlobal("localStorage", { getItem: () => JSON.stringify(value), setItem: () => {}, removeItem: () => {} });
}

describe("Avatar & Raum – Einstellungen", () => {
  it("hat Lukas im Core Studio als Standard", () => {
    expect(DEFAULT_SETTINGS.avatar).toBe("lukas");
    expect(DEFAULT_SETTINGS.room).toBe("core-studio");
  });

  it("übernimmt gültige gespeicherte Auswahl", () => {
    stored({ avatar: "zara", room: "neon-arena" });
    expect(loadSettings()).toMatchObject({ avatar: "zara", room: "neon-arena" });
  });

  it.each([
    [{ avatar: "unbekannt", room: "keller" }],
    [{ avatar: 7, room: null }],
    [{ avatar: "<img src=x>", room: "x".repeat(500) }],
  ])("fällt bei ungültiger Auswahl %j auf den Standard zurück", (value) => {
    stored(value);
    expect(loadSettings()).toMatchObject({ avatar: "lukas", room: "core-studio" });
  });

  it("sendet Raum und Avatar an den Fernseher, und der Fernseher akzeptiert den Zustand", () => {
    useApp.setState({ settings: { ...DEFAULT_SETTINGS, avatar: "echo", room: "space-station" }, screen: "home" });
    const st = tvStateFrom(useApp.getState());
    expect(st).toMatchObject({ avatar: "echo", room: "space-station" });
    expect(isTvState(JSON.parse(JSON.stringify(st)))).toBe(true);
  });
});
