export interface Vec {
  x: number;
  y: number;
  z?: number;
}

/** Winkel ABC in Grad (Scheitel B), 2D oder 3D. Liefert null bei degenerierten Strecken. */
export function angleDeg(a: Vec, b: Vec, c: Vec, use3d = false): number | null {
  if (![a, b, c].every((p) => isFiniteVec(p, use3d))) return null;
  const ax = a.x - b.x;
  const ay = a.y - b.y;
  const az = use3d ? (a.z ?? 0) - (b.z ?? 0) : 0;
  const cx = c.x - b.x;
  const cy = c.y - b.y;
  const cz = use3d ? (c.z ?? 0) - (b.z ?? 0) : 0;
  const na = Math.hypot(ax, ay, az);
  const nc = Math.hypot(cx, cy, cz);
  if (na < 1e-9 || nc < 1e-9) return null;
  const cos = (ax * cx + ay * cy + az * cz) / (na * nc);
  const deg = (Math.acos(Math.min(1, Math.max(-1, cos))) * 180) / Math.PI;
  return Number.isFinite(deg) ? deg : null;
}

export function isFiniteVec(p: Vec | undefined, use3d = false): boolean {
  return !!p && Number.isFinite(p.x) && Number.isFinite(p.y) && (!use3d || Number.isFinite(p.z ?? 0));
}

export function dist(a: Vec, b: Vec, use3d = false): number {
  return Math.hypot(a.x - b.x, a.y - b.y, use3d ? (a.z ?? 0) - (b.z ?? 0) : 0);
}

/** Bild-Landmark winkeltreu machen: x mit Seitenverhältnis (Breite/Höhe) skalieren. */
export function toSquare(p: Vec, aspect: number): Vec {
  return { x: p.x * aspect, y: p.y };
}

export function mid(a: Vec, b: Vec): Vec {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: ((a.z ?? 0) + (b.z ?? 0)) / 2 };
}

export function median(values: number[]): number {
  if (values.length === 0) return Number.NaN;
  const s = [...values].sort((p, q) => p - q);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

export function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}
