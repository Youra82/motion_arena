import { describe, expect, it } from "vitest";
import { synthPose } from "@motion-arena/pose-engine";
import { bodyMesh, bodyShape, insideBody, triangulate, type Pt } from "./body-shapes";

describe("Körperformen", () => {
  it("Delaunay: Quadrat mit Mittelpunkt ergibt 4 Dreiecke", () => {
    const pts: Pt[] = [[0, 0], [10, 0], [10, 10], [0, 10], [5, 5]];
    expect(triangulate(pts)).toHaveLength(4);
  });

  it("Gitter einer stehenden Figur: viele Dreiecke, keines überbrückt den Spalt zwischen den Beinen", () => {
    const { landmarks } = synthPose({ kneeFlexDeg: 0, view: "front", aspect: 1, scale: 0.8 });
    const P = (i: number): Pt => [landmarks[i]!.x * 1000, landmarks[i]!.y * 1000];
    const s = bodyShape(P, 400);
    const { points, triangles } = bodyMesh(s);
    expect(triangles.length).toBeGreaterThan(60);
    // Punkt mittig zwischen den Knöcheln liegt außerhalb des Körpers …
    const gap: Pt = [(P(27)[0] + P(28)[0]) / 2, (P(27)[1] + P(28)[1]) / 2];
    expect(insideBody(gap, s)).toBe(false);
    // … und kein Dreieck enthält ihn.
    const contains = ([a, b, c]: [number, number, number]) => {
      const [p1, p2, p3] = [points[a]!, points[b]!, points[c]!];
      const sign = (q: Pt, r: Pt, t: Pt) => (q[0] - t[0]) * (r[1] - t[1]) - (r[0] - t[0]) * (q[1] - t[1]);
      const d1 = sign(gap, p1, p2), d2 = sign(gap, p2, p3), d3 = sign(gap, p3, p1);
      return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
    };
    expect(triangles.some(contains)).toBe(false);
  });
});
