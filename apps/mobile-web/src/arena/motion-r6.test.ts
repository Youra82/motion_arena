import { describe, expect, it } from "vitest";
import { LM, type Landmark } from "@motion-arena/shared";
import { LandmarkSmoother, synthPose } from "@motion-arena/pose-engine";
import { JumpTracker } from "./jump";
import { boneZone } from "./body-material";

/** Stehende Person (Bildkoordinaten), um `up` Bildhöhen nach oben versetzt (Sprung). */
function standing(up = 0, hideAnkles = false): Landmark[] {
  const pose = synthPose({ kneeFlexDeg: 0, view: "front", aspect: 9 / 16, scale: 0.56, groundY: 0.76, noWorld: true }).landmarks;
  return pose.map((p, i) => ({
    ...p,
    y: p.y - up,
    visibility: hideAnkles && (i === LM.LEFT_ANKLE || i === LM.RIGHT_ANKLE) ? 0.1 : p.visibility,
  }));
}

describe("Sprung", () => {
  it("erkennt die Sprunghöhe aus dem Abstand der Füße zum Bodenstand", () => {
    const jump = new JumpTracker();
    for (let t = 0; t < 500; t += 33) expect(jump.update(standing(), t)).toBe(0);
    // Beine im Bild ≈ 0,28 Bildhöhen; 0,06 Bildhöhen nach oben ≈ 0,19 m
    const h = jump.update(standing(0.06), 533);
    expect(h).toBeGreaterThan(0.15);
    expect(h).toBeLessThan(0.25);
    expect(jump.update(standing(), 566)).toBe(0);
  });

  it("nutzt Ferse/Fußspitze, wenn die Knöchel beim Springen unscharf sind", () => {
    const jump = new JumpTracker();
    for (let t = 0; t < 500; t += 33) jump.update(standing(), t);
    expect(jump.update(standing(0.06, true), 533)).toBeGreaterThan(0.15);
  });

  it("hält die Höhe kurz, wenn die Füße ganz fehlen, und führt sie dann weich zum Boden", () => {
    const jump = new JumpTracker();
    for (let t = 0; t < 500; t += 33) jump.update(standing(), t);
    const h = jump.update(standing(0.06), 533);
    expect(jump.update(null, 566)).toBeCloseTo(h, 5);
    let last = h;
    for (let t = 800; t < 1400; t += 33) last = jump.update(null, t);
    expect(last).toBe(0);
  });
});

describe("Flüssige Darstellung", () => {
  it("rechnet die Pose zwischen zwei Messungen mit der Geschwindigkeit voraus (begrenzt)", () => {
    const s = new LandmarkSmoother(1.7, 3);
    const at = (x: number): Landmark[] => [{ x, y: 0.5, z: 0, visibility: 1 }];
    for (let t = 0, x = 0; t <= 330; t += 33, x += 0.033) s.smooth(at(x), t); // 1 Bildbreite je Sekunde
    const now = s.predict(330, 50)![0]!.x;
    const ahead = s.predict(330 + 25, 50)![0]!.x;
    const capped = s.predict(330 + 500, 50)![0]!.x;
    expect(ahead).toBeGreaterThan(now);
    expect(ahead - now).toBeLessThan(0.04);
    expect(capped - now).toBeCloseTo((ahead - now) * 2, 2);
  });
});

describe("Muskelzonen", () => {
  it("färbt Hände, Füße und Kopf nicht ein", () => {
    for (const bone of ["LeftHand", "RightHand", "LeftFoot", "RightToeBase", "Head", "neck", "headfront"]) expect(boneZone(bone)).toBe(11);
  });
  it("ordnet Beine, Arme und Rumpf ihren Zonen zu", () => {
    expect(boneZone("LeftUpLeg")).toBe(2);
    expect(boneZone("RightUpLeg")).toBe(3);
    expect(boneZone("LeftLeg")).toBe(0);
    expect(boneZone("RightLeg")).toBe(1);
    expect(boneZone("LeftArm")).toBe(7);
    expect(boneZone("RightShoulder")).toBe(8);
    expect(boneZone("LeftForeArm")).toBe(9);
    expect(boneZone("Spine01")).toBe(6);
    expect(boneZone("Hips")).toBe(12);
  });
});
