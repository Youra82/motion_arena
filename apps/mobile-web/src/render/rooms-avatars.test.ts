import { describe, expect, it } from "vitest";
import { AVATARS, AVATAR_CATEGORIES, avatarById, isAvatarId, shade } from "./avatars";
import { ROOMS, isRoomId, roomById, seededRandom, withAlpha } from "./rooms";

const HEX = /^#[0-9a-fA-F]{6}$/;

describe("Trainingsräume", () => {
  it("bietet genau die 20 Räume aus dem Feature-Katalog in Reihenfolge", () => {
    expect(ROOMS).toHaveLength(20);
    expect(ROOMS.map((r) => r.nr)).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
    expect(new Set(ROOMS.map((r) => r.id)).size).toBe(20);
    expect(ROOMS.map((r) => r.name)).toContain("Core Studio");
    expect(ROOMS.map((r) => r.name)).toContain("Futuristic Lab");
  });

  it("hat gültige Farben und je Raum eine eigene Szene", () => {
    for (const r of ROOMS) for (const c of [...r.sky, ...r.floor, r.light]) expect(c).toMatch(HEX);
    expect(new Set(ROOMS.map((r) => r.scene)).size).toBeGreaterThanOrEqual(18);
  });

  it("fällt bei unbekannter ID auf Core Studio zurück", () => {
    expect(isRoomId("lava-chamber")).toBe(true);
    expect(isRoomId("gibt-es-nicht")).toBe(false);
    expect(isRoomId(42)).toBe(false);
    expect(roomById("gibt-es-nicht").id).toBe("core-studio");
  });

  it("zeichnet jeden Raum deterministisch (gleicher Zufall je Raum)", () => {
    const a = seededRandom("ice-lab");
    const b = seededRandom("ice-lab");
    const c = seededRandom("lava-chamber");
    const seqA = Array.from({ length: 5 }, a);
    expect(Array.from({ length: 5 }, b)).toEqual(seqA);
    expect(Array.from({ length: 5 }, c)).not.toEqual(seqA);
    expect(seqA.every((v) => v >= 0 && v < 1)).toBe(true);
  });

  it("wandelt Farben mit Deckkraft um und begrenzt sie", () => {
    expect(withAlpha("#FF704B", 0.5)).toBe("rgba(255,112,75,0.5)");
    expect(withAlpha("#000000", 2)).toBe("rgba(0,0,0,1)");
  });
});

describe("Avatare", () => {
  it("bietet die 15 Avatare aus dem Feature-Katalog", () => {
    expect(AVATARS).toHaveLength(15);
    expect(AVATARS.map((a) => a.nr)).toEqual(Array.from({ length: 15 }, (_, i) => i + 1));
    expect(AVATARS.map((a) => a.name)).toEqual([
      "Lukas", "Elena", "Ken", "Mia", "David", "Aiko", "Viktor", "Nova", "Matteo", "Raven", "Finn", "Sara", "Leo", "Zara", "Echo",
    ]);
    expect(new Set(AVATARS.map((a) => a.id)).size).toBe(15);
  });

  it("hat gültige Farben, Statur und Kategorien", () => {
    const cats = new Set(AVATAR_CATEGORIES.map((c) => c.id));
    for (const a of AVATARS) {
      for (const c of [a.skin, a.hair, a.topColor, a.accent, a.bottomColor, a.shoeColor]) expect(c).toMatch(HEX);
      expect(a.build).toBeGreaterThanOrEqual(0.85);
      expect(a.build).toBeLessThanOrEqual(1.2);
      expect(a.level).toBeGreaterThanOrEqual(1);
      expect(a.level).toBeLessThanOrEqual(5);
      expect(cats.has(a.category)).toBe(true);
    }
    // Jede Kategorie (außer "alle") ist belegt
    for (const c of AVATAR_CATEGORIES) if (c.id !== "alle") expect(AVATARS.some((a) => a.category === c.id)).toBe(true);
  });

  it("fällt bei unbekannter ID auf Lukas zurück", () => {
    expect(isAvatarId("zara")).toBe(true);
    expect(isAvatarId("")).toBe(false);
    expect(avatarById(undefined).id).toBe("lukas");
  });

  it("hellt Farben auf und dunkelt sie ab, ohne den Bereich zu verlassen", () => {
    expect(shade("#808080", 0)).toBe("#808080");
    expect(shade("#000000", 1)).toBe("#ffffff");
    expect(shade("#ffffff", -1)).toBe("#000000");
    expect(shade("#336699", 0.2)).toMatch(HEX);
  });
});
