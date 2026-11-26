import { describe, expect, it } from "vitest";
import { synthPose } from "@motion-arena/pose-engine";
import { LM } from "@motion-arena/shared";
import { bodyMesh, bodyShape, insideBody, triangulate, type Pt } from "./body-shapes";

function doubleArea(points: Pt[], [a, b, c]: [number, number, number]): number {
  const [x, y] = points[a]!;
  const [bx, by] = points[b]!;
  const [cx, cy] = points[c]!;
  return (bx - x) * (cy - y) - (by - y) * (cx - x);
}

describe("Körpergitter – degenerierte und seitliche Projektionen", () => {
  it("liefert bei identischen oder kollinearen Punkten keine Dreiecke", () => {
    const repeated: Pt[] = Array.from({ length: 32 }, () => [5, 5]);
    const collinear = Array.from({ length: 32 }, (_, i): Pt => [i, 3 * i - 7]).reverse();
    expect(triangulate(repeated)).toEqual([]);
    expect(triangulate(collinear)).toEqual([]);
  });

  it("hält alle Gitterpunkte endlich, wenn alle projizierten Gelenke zusammenfallen", () => {
    const shape = bodyShape(() => [20, 20], 0);
    const mesh = bodyMesh(shape);
    expect(mesh.points.length).toBeGreaterThan(0);
    expect(mesh.points.every(([x, y]) => Number.isFinite(x) && Number.isFinite(y))).toBe(true);
    expect(mesh.triangles).toEqual([]);
    expect(insideBody([20, 20], shape)).toBe(true);
    expect(insideBody([25, 25], shape)).toBe(false);
  });

  it("behält bei einer seitlichen Kniebeuge gültige Dreiecke trotz Landmark-Überlappung", () => {
    // CODEX-BEFUND: Die seitliche Pose erzeugt Dreiecke mit praktisch null Fläche.
    const { landmarks } = synthPose({ view: "side", kneeFlexDeg: 90, arms: "forward", aspect: 1 });
    const project = (i: number): Pt => [landmarks[i]!.x * 800, landmarks[i]!.y * 800];
    const { points, triangles } = bodyMesh(bodyShape(project, 270));
    expect(triangles.length).toBeGreaterThan(0);
    expect(triangles.every((triangle) => triangle.every((i) => i >= 0 && i < points.length))).toBe(true);
    expect(triangles.filter((triangle) => Math.abs(doubleArea(points, triangle)) <= 1e-8)).toHaveLength(0);
  });

  it("behält bei exakt deckungsgleichen Seiten eine sichtbare Rumpfbreite", () => {
    // CODEX-BEFUND: Ein kollineares Rumpfpolygon hat keine Fläche und die Rumpfmitte fällt aus der Körperform.
    const joints: Partial<Record<number, Pt>> = {
      [LM.NOSE]: [60, 5],
      [LM.LEFT_SHOULDER]: [60, 35], [LM.RIGHT_SHOULDER]: [60, 35],
      [LM.LEFT_ELBOW]: [85, 35], [LM.RIGHT_ELBOW]: [85, 35],
      [LM.LEFT_WRIST]: [110, 35], [LM.RIGHT_WRIST]: [110, 35],
      [LM.LEFT_HIP]: [60, 90], [LM.RIGHT_HIP]: [60, 90],
      [LM.LEFT_KNEE]: [60, 125], [LM.RIGHT_KNEE]: [60, 125],
      [LM.LEFT_ANKLE]: [60, 160], [LM.RIGHT_ANKLE]: [60, 160],
    };
    const shape = bodyShape((i) => joints[i]!, 70);
    expect(insideBody([60, 62], shape)).toBe(true);
    expect(insideBody([63, 62], shape)).toBe(true);
    expect(insideBody([90, 62], shape)).toBe(false);
  });
});
