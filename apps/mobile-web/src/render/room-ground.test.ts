import { describe, expect, it } from "vitest";
import { ROOM_GROUND, ROOM_PLATFORM, backdropZoom } from "./concept-art";
import { ROOMS } from "./rooms";

/** Figuren müssen in jedem Raumbild auf dem Boden stehen – nie schweben, nie hinter Banner/Leiste verschwinden. */
describe("Standhöhe je Raumbild", () => {
  it("hat für jeden der 20 Räume eine Bodenhöhe für Spieler und Trainer", () => {
    for (const r of ROOMS) {
      const g = ROOM_GROUND[r.nr];
      expect(g, r.name).toBeDefined();
      // Trainer steht weiter hinten → im Bild höher als der Spieler
      expect(g!.trainer, r.name).toBeLessThan(g!.player);
      expect(g!.player, r.name).toBeGreaterThan(0.6);
      expect(g!.player, r.name).toBeLessThan(0.95);
    }
  });

  it("vergrößert Bilder mit tiefem Boden, damit die Füße über den Bedienelementen bleiben", () => {
    for (const r of ROOMS) {
      const g = ROOM_GROUND[r.nr]!;
      const zoom = backdropZoom(r.nr);
      // unten verankert: sichtbarer Bereich [1 - 1/zoom, 1]
      const screen = (v: number) => (v - (1 - 1 / zoom)) * zoom;
      expect(screen(g.player), r.name).toBeLessThanOrEqual(0.88);
    }
  });

  it("stellt die Figuren im Waterfall auf eine Plattform (Vordergrund ist Wasser)", () => {
    expect(ROOM_PLATFORM.has(16)).toBe(true);
    expect([...ROOM_PLATFORM].every((n) => ROOMS.some((r) => r.nr === n))).toBe(true);
  });
});
