import { describe, expect, it } from "vitest";
import { LM, type Landmark } from "@motion-arena/shared";
import { trainerFlip } from "./facing";

/** Pose mit Schultern/Hüften: linke Seite bei x=lx, rechte bei x=rx, linke Seite um dz näher (negativ) an der Kamera. */
function pose(lx: number, rx: number, dz: number): Landmark[] {
  const p: Landmark[] = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, z: 0, visibility: 0 }));
  for (const [l, r, y] of [[LM.LEFT_SHOULDER, LM.RIGHT_SHOULDER, 0.3], [LM.LEFT_HIP, LM.RIGHT_HIP, 0.55]] as const) {
    p[l] = { x: lx, y, z: dz, visibility: 1 };
    p[r] = { x: rx, y, z: 0, visibility: 1 };
  }
  return p;
}

describe("Trainer-Ausrichtung", () => {
  it("spiegelt den Trainer, wenn die näher liegende Schulter links im Bild ist", () => {
    // Bild (ungespiegelt): linke Körperseite rechts im Bild (x 0,6), näher an der Kamera → wie das Foto
    expect(trainerFlip(pose(0.6, 0.4, -0.2), false)).toBe(false);
    // dieselbe Pose im Spiegelbild: näher liegende Seite erscheint links → spiegeln
    expect(trainerFlip(pose(0.6, 0.4, -0.2), true)).toBe(true);
    // rechte Seite näher, rechte Seite rechts im Bild → wie das Foto
    expect(trainerFlip(pose(0.4, 0.6, 0.2), false)).toBe(false);
  });

  it("frontal oder ohne Person: letzte Entscheidung bleibt (kein Flackern)", () => {
    expect(trainerFlip(pose(0.6, 0.4, -0.2), true)).toBe(true);
    expect(trainerFlip(pose(0.6, 0.4, -0.01), false)).toBe(true);
    expect(trainerFlip(null, false)).toBe(true);
  });
});
