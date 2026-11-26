import { describe, expect, it } from "vitest";
import { decodePose, encodePose, isPhoneMessage, newPairCode, normalizeCode, PROTOCOL_VERSION } from "./protocol";

const pose = Array.from({ length: 33 }, () => ({ x: -0.1234, y: 1.2346, z: 0.2, visibility: 0.8764 }));
const packed = encodePose(pose)!;
const poseMessage = { k: "pose", t: 200, a: 9 / 16, m: 1, p: packed };

describe("TV-Protokoll", () => {
  it("rekonstruiert 33 Punkte, einschließlich leicht außerhalb des Bilds liegender Punkte", () => {
    expect(isPhoneMessage(poseMessage)).toBe(true);
    expect(decodePose(packed)).toEqual(Array.from({ length: 33 }, () => ({ x: -0.123, y: 1.235, z: 0, visibility: 0.876 })));
    expect(isPhoneMessage({ ...poseMessage, p: null })).toBe(true);
    expect(decodePose(null)).toBeNull();
  });

  it("weist zu große Posen schon bei der Nachrichtenprüfung ab", () => {
    expect(isPhoneMessage({ ...poseMessage, p: new Array(102).fill(0) })).toBe(false);
  });

  it("begrenzt auch beim direkten Dekodieren auf das vereinbarte Format", () => {
    // CODEX-BEFUND: Mehr als 33 Punkte werden als gültige Pose dekodiert.
    expect(decodePose(new Array(102).fill(0)) === null).toBe(true);
  });

  it("weist falsch typisierte Koordinaten auch beim Dekodieren ab", () => {
    // CODEX-BEFUND: Division konvertiert einen String vor der Prüfung stillschweigend zur Zahl.
    const values: unknown[] = [...packed];
    values[0] = "500";
    expect(isPhoneMessage({ ...poseMessage, p: values })).toBe(false);
    expect(decodePose(values as number[]) === null).toBe(true);
  });

  it.each([
    ["unvollständige Pose", { p: [0, 0, 0] }],
    ["Lücke im Array", { p: new Array(99) }],
    ["NaN", { p: [NaN, ...packed.slice(1)] }],
    ["ungültige Sichtbarkeit", { p: [500, 500, 1001, ...packed.slice(3)] }],
    ["ungültige Metadaten", { t: "200", a: Infinity, m: true }],
  ])("weist %s ab", (_name, patch) => {
    // CODEX-BEFUND: Länge, numerische Grenzen und Metadaten sind Teil des Nachrichtenvertrags.
    expect(isPhoneMessage({ ...poseMessage, ...patch })).toBe(false);
  });

  it.each([
    ["fehlender Zustand", { k: "state" }],
    ["fehlender Viewport", { k: "state", s: { screen: "live" } }],
    ["unbrauchbarer Viewport", { k: "state", s: { screen: "idle", hud: null, viewport: { w: 0, h: 844 }, viewMode: "hybrid", video: false, demo: false, summary: null } }],
    ["falsche Version", { k: "hello", v: PROTOCOL_VERSION + 1, app: "Testversion" }],
    ["überlange Versionsangabe", { k: "hello", v: PROTOCOL_VERSION, app: "v".repeat(8192) }],
  ])("weist %s vor dem Rendern ab", (_name, input) => {
    // CODEX-BEFUND: Für hello und state genügt der Nachrichtentyp allein.
    expect(isPhoneMessage(input)).toBe(false);
  });

  it("normalisiert Kleinbuchstaben und den sichtbaren Trenner", () => {
    expect(normalizeCode("  aBc  234  ")).toBe("ABC234");
    for (const input of ["ABC023", "ABI234", "ABC123", "ABCD", "ABCDE23"]) expect(normalizeCode(input)).toBeNull();
    for (const rand of [() => 0, () => 0.5, () => 0.999]) {
      const code = newPairCode(rand);
      expect(normalizeCode(code)).toBe(code);
      expect(code).toHaveLength(6);
    }
  });

  it("akzeptiert den formatierten Code mit Bindestrich", () => {
    // FRAGE: Welche weiteren Trennzeichen sollen toleriert werden?
    expect(normalizeCode("abc-234")).toBe("ABC234");
  });
});
