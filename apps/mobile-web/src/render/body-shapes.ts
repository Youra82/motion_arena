import { LM, type Landmark } from "@motion-arena/shared";

/**
 * Geometrie für stilisierte Körperdarstellungen (Gittermodell, Hologramm, Avatar-Form).
 * Arbeitet in Pixelkoordinaten; reine Funktionen, unabhängig vom Canvas.
 */
export type Pt = [number, number];

/** Gliedmaßen als Kapseln: [von, bis, Breite relativ zur Beinlänge]. */
export const LIMBS: Array<[number, number, number]> = [
  [LM.LEFT_HIP, LM.LEFT_KNEE, 0.12],
  [LM.LEFT_KNEE, LM.LEFT_ANKLE, 0.09],
  [LM.RIGHT_HIP, LM.RIGHT_KNEE, 0.12],
  [LM.RIGHT_KNEE, LM.RIGHT_ANKLE, 0.09],
  [LM.LEFT_SHOULDER, LM.LEFT_ELBOW, 0.075],
  [LM.LEFT_ELBOW, LM.LEFT_WRIST, 0.06],
  [LM.RIGHT_SHOULDER, LM.RIGHT_ELBOW, 0.075],
  [LM.RIGHT_ELBOW, LM.RIGHT_WRIST, 0.06],
];

export interface BodyShape {
  capsules: Array<{ a: Pt; b: Pt; r: number }>;
  torso: Pt[];
  head: { c: Pt; r: number };
}

const polyArea = (poly: Pt[]): number => {
  let a = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) a += poly[j]![0] * poly[i]![1] - poly[i]![0] * poly[j]![1];
  return Math.abs(a) / 2;
};

/**
 * Rumpf als Viereck Schultern–Hüften. In (fast) reiner Seitenansicht fallen linke und rechte Seite zusammen und das
 * Viereck hätte keine Fläche – dann ein schmales Band zwischen Schulter- und Hüftmitte (wie die Muskelansicht).
 */
function torsoPolygon(ls: Pt, rs: Pt, rh: Pt, lh: Pt, scale: number): Pt[] {
  const quad: Pt[] = [ls, rs, rh, lh];
  const ms: Pt = [(ls[0] + rs[0]) / 2, (ls[1] + rs[1]) / 2];
  const mh: Pt = [(lh[0] + rh[0]) / 2, (lh[1] + rh[1]) / 2];
  const len = Math.hypot(mh[0] - ms[0], mh[1] - ms[1]);
  const hw = scale * 0.09;
  if (len === 0 || hw === 0 || polyArea(quad) >= len * hw) return quad;
  const nx = -(mh[1] - ms[1]) / len;
  const ny = (mh[0] - ms[0]) / len;
  return [
    [ms[0] + nx * hw, ms[1] + ny * hw],
    [ms[0] - nx * hw, ms[1] - ny * hw],
    [mh[0] - nx * hw, mh[1] - ny * hw],
    [mh[0] + nx * hw, mh[1] + ny * hw],
  ];
}

export function bodyShape(P: (i: number) => Pt, scale: number): BodyShape {
  return {
    capsules: LIMBS.map(([a, b, w]) => ({ a: P(a), b: P(b), r: (scale * w) / 2 + 1.5 })),
    torso: torsoPolygon(P(LM.LEFT_SHOULDER), P(LM.RIGHT_SHOULDER), P(LM.RIGHT_HIP), P(LM.LEFT_HIP), scale),
    head: { c: P(LM.NOSE), r: scale * 0.13 },
  };
}

function distToSegment(p: Pt, a: Pt, b: Pt): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

function inPolygon(p: Pt, poly: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]!;
    const [xj, yj] = poly[j]!;
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi || 1e-9) + xi) inside = !inside;
  }
  return inside;
}

export function insideBody(p: Pt, s: BodyShape, margin = 1): boolean {
  if (Math.hypot(p[0] - s.head.c[0], p[1] - s.head.c[1]) <= s.head.r + margin) return true;
  if (inPolygon(p, s.torso)) return true;
  return s.capsules.some((c) => distToSegment(p, c.a, c.b) <= c.r + margin);
}

/** Punkte für das Gittermodell: Rand und Mittellinie der Gliedmaßen, Rumpfraster, Kopfkreis. */
export function meshPoints(s: BodyShape): Pt[] {
  const pts: Pt[] = [];
  for (const c of s.capsules) {
    const dx = c.b[0] - c.a[0];
    const dy = c.b[1] - c.a[1];
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    const n = Math.min(12, Math.max(3, Math.round(len / (c.r * 1.2)))); // nach oben begrenzt (Rechenzeit je Frame)
    for (let k = 0; k <= n; k++) {
      const t = k / n;
      const x = c.a[0] + dx * t;
      const y = c.a[1] + dy * t;
      pts.push([x + nx * c.r, y + ny * c.r], [x - nx * c.r, y - ny * c.r]);
      if (k % 2 === 0) pts.push([x, y]);
    }
  }
  // Rumpf: bilineares Raster zwischen Schultern und Hüften
  const [ls, rs, rh, lh] = s.torso as [Pt, Pt, Pt, Pt];
  for (let i = 0; i <= 4; i++)
    for (let j = 0; j <= 3; j++) {
      const u = j / 3;
      const v = i / 4;
      const top: Pt = [ls[0] + (rs[0] - ls[0]) * u, ls[1] + (rs[1] - ls[1]) * u];
      const bot: Pt = [lh[0] + (rh[0] - lh[0]) * u, lh[1] + (rh[1] - lh[1]) * u];
      pts.push([top[0] + (bot[0] - top[0]) * v, top[1] + (bot[1] - top[1]) * v]);
    }
  for (let k = 0; k < 10; k++) {
    const a = (k / 10) * Math.PI * 2;
    pts.push([s.head.c[0] + Math.cos(a) * s.head.r, s.head.c[1] + Math.sin(a) * s.head.r]);
  }
  pts.push(s.head.c);
  return dedupe(pts, 0.5);
}

/** Fast gleiche Punkte (überlappende Gliedmaßen in Seitenansicht) zusammenführen – sonst entstehen Nullflächen-Dreiecke. */
function dedupe(pts: Pt[], eps: number): Pt[] {
  const seen = new Set<string>();
  const out: Pt[] = [];
  for (const p of pts) {
    if (!Number.isFinite(p[0]) || !Number.isFinite(p[1])) continue;
    const key = `${Math.round(p[0] / eps)},${Math.round(p[1] / eps)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(p);
  }
  return out;
}

/** Delaunay-Triangulierung (Bowyer–Watson), ausreichend schnell für ~200 Punkte. */
export function triangulate(points: Pt[]): Array<[number, number, number]> {
  if (points.length < 3) return [];
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of points) {
    minX = Math.min(minX, x); minY = Math.min(minY, y);
    maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
  }
  const d = Math.max(maxX - minX, maxY - minY) * 20 + 1;
  const mx = (minX + maxX) / 2;
  const my = (minY + maxY) / 2;
  const pts: Pt[] = [...points, [mx - d, my - d], [mx, my + d], [mx + d, my - d]];
  const n = points.length;
  type Tri = { a: number; b: number; c: number; cx: number; cy: number; r2: number };
  const circum = (a: number, b: number, c: number): Tri => {
    const [ax, ay] = pts[a]!, [bx, by] = pts[b]!, [cx, cy] = pts[c]!;
    const dd = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by)) || 1e-12;
    const ux = ((ax * ax + ay * ay) * (by - cy) + (bx * bx + by * by) * (cy - ay) + (cx * cx + cy * cy) * (ay - by)) / dd;
    const uy = ((ax * ax + ay * ay) * (cx - bx) + (bx * bx + by * by) * (ax - cx) + (cx * cx + cy * cy) * (bx - ax)) / dd;
    return { a, b, c, cx: ux, cy: uy, r2: (ax - ux) ** 2 + (ay - uy) ** 2 };
  };
  let tris: Tri[] = [circum(n, n + 1, n + 2)];
  for (let i = 0; i < n; i++) {
    const [px, py] = pts[i]!;
    const bad: Tri[] = [];
    const keep: Tri[] = [];
    for (const t of tris) ((px - t.cx) ** 2 + (py - t.cy) ** 2 < t.r2 ? bad : keep).push(t);
    const edges = new Map<string, [number, number]>();
    for (const t of bad)
      for (const [u, w] of [[t.a, t.b], [t.b, t.c], [t.c, t.a]] as Array<[number, number]>) {
        const key = u < w ? `${u},${w}` : `${w},${u}`;
        if (edges.has(key)) edges.delete(key);
        else edges.set(key, [u, w]);
      }
    tris = keep;
    for (const [u, w] of edges.values()) tris.push(circum(u, w, i));
  }
  // Super-Dreieck entfernen und (fast) flache Dreiecke verwerfen – Grenze relativ zur Ausdehnung.
  const minArea2 = 1e-6 * Math.max(maxX - minX, maxY - minY) ** 2;
  return tris
    .filter((t) => {
      if (t.a >= n || t.b >= n || t.c >= n) return false;
      const [ax, ay] = pts[t.a]!, [bx, by] = pts[t.b]!, [cx, cy] = pts[t.c]!;
      return Math.abs((bx - ax) * (cy - ay) - (by - ay) * (cx - ax)) > minArea2;
    })
    .map((t) => [t.a, t.b, t.c]);
}

/** Gitter: Dreiecke, deren Schwerpunkt im Körper liegt (keine Brücken zwischen Beinen/Armen). */
export function bodyMesh(s: BodyShape): { points: Pt[]; triangles: Array<[number, number, number]> } {
  const points = meshPoints(s);
  const triangles = triangulate(points).filter(([a, b, c]) => {
    const pa = points[a]!, pb = points[b]!, pc = points[c]!;
    const centroid: Pt = [(pa[0] + pb[0] + pc[0]) / 3, (pa[1] + pb[1] + pc[1]) / 3];
    const mids: Pt[] = [
      [(pa[0] + pb[0]) / 2, (pa[1] + pb[1]) / 2],
      [(pb[0] + pc[0]) / 2, (pb[1] + pc[1]) / 2],
      [(pc[0] + pa[0]) / 2, (pc[1] + pa[1]) / 2],
    ];
    return insideBody(centroid, s, 2) && mids.every((m) => insideBody(m, s, 3));
  });
  return { points, triangles };
}
