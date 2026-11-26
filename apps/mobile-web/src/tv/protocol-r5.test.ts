import { describe, expect, it } from "vitest";
import { synthPose } from "@motion-arena/pose-engine";
import { LM } from "@motion-arena/shared";
import { decodePose, encodePose, isPhoneMessage, PROTOCOL_VERSION } from "./protocol";

describe("Pose auf dem TV-Datenkanal", () => {
  it("erhält bei Profilposen die Tiefenreihenfolge für die Avatar-Überdeckung", () => {
    // CODEX-BEFUND: Die Posekodierung sendet kein z. Der TV zeichnet überlappende Gliedmaßen in fester Reihenfolge.
    const { landmarks } = synthPose({ view: "side", kneeFlexDeg: 45 });
    const left = LM.LEFT_SHOULDER;
    const right = LM.RIGHT_SHOULDER;
    expect(landmarks[left]!.z).toBeLessThan(landmarks[right]!.z);
    for (const points of [landmarks, landmarks.map((p) => ({ ...p, z: -p.z }))]) {
      const decoded = decodePose(encodePose(points))!;
      expect(Math.sign(decoded[left]!.z - decoded[right]!.z)).toBe(Math.sign(points[left]!.z - points[right]!.z));
    }
  });

  it("akzeptiert Randpunkte und die vereinbarten Grenzwerte ohne stilles Begrenzen", () => {
    const p = Array.from({ length: 33 }, () => [-1000, 2000, 1000]).flat();
    for (const a of [0.2, 5]) {
      expect(isPhoneMessage({ k: "pose", t: 0, a, m: 1, p })).toBe(true);
    }
    expect(decodePose(p)).toHaveLength(33);
    expect(decodePose(p)?.[32]).toMatchObject({ x: -1, y: 2, visibility: 1 });
    expect(isPhoneMessage({ k: "hello", v: PROTOCOL_VERSION, app: "Test" })).toBe(true);
    expect(isPhoneMessage({ k: "hello", v: PROTOCOL_VERSION + 1, app: "Test" })).toBe(false);
  });

  it.each([[0, -1001], [1, 2001], [2, -1], [2, 1001], [2, 0.5], [0, NaN], [1, Infinity]])(
    "verwirft Wert %s an der jeweiligen Tripelposition (%s)",
    (index, value) => {
      const p = Array<number>(99).fill(0);
      p[index!] = value!;
      expect(isPhoneMessage({ k: "pose", t: 1, a: 1, m: 0, p })).toBe(false);
      expect(decodePose(p)).toBeNull();
    },
  );
});
