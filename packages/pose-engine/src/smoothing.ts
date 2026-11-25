import type { Landmark } from "@motion-arena/shared";

/**
 * One-Euro-Filter (Casiez et al. 2012): wenig Zittern im Stand, wenig Verzögerung bei schneller Bewegung.
 */
export class OneEuroFilter {
  private xPrev: number | null = null;
  private dxPrev = 0;
  private tPrev: number | null = null;

  constructor(
    private readonly minCutoff = 1.2,
    private readonly beta = 0.02,
    private readonly dCutoff = 1.0,
  ) {}

  private static alpha(cutoff: number, dt: number): number {
    const tau = 1 / (2 * Math.PI * cutoff);
    return 1 / (1 + tau / dt);
  }

  filter(x: number, tMs: number): number {
    if (!Number.isFinite(x) || !Number.isFinite(tMs)) {
      // Ungültige Messung nicht in den Zustand übernehmen; nächster gültiger Wert startet neu.
      this.reset();
      return x;
    }
    if (this.xPrev === null || this.tPrev === null || tMs <= this.tPrev) {
      this.xPrev = x;
      this.tPrev = tMs;
      this.dxPrev = 0;
      return x;
    }
    const dt = (tMs - this.tPrev) / 1000;
    const dx = (x - this.xPrev) / dt;
    const aD = OneEuroFilter.alpha(this.dCutoff, dt);
    const dxHat = aD * dx + (1 - aD) * this.dxPrev;
    const cutoff = this.minCutoff + this.beta * Math.abs(dxHat);
    const a = OneEuroFilter.alpha(cutoff, dt);
    const xHat = a * x + (1 - a) * this.xPrev;
    this.xPrev = xHat;
    this.dxPrev = dxHat;
    this.tPrev = tMs;
    return xHat;
  }

  reset(): void {
    this.xPrev = null;
    this.tPrev = null;
    this.dxPrev = 0;
  }
}

/** Glättet alle Koordinaten eines Landmark-Satzes; Sichtbarkeit bleibt ungeglättet. */
export class LandmarkSmoother {
  private filters: OneEuroFilter[][] = [];

  constructor(
    private readonly minCutoff = 1.2,
    private readonly beta = 0.02,
  ) {}

  smooth(landmarks: Landmark[] | null | undefined, tMs: number): Landmark[] | null {
    if (!landmarks) {
      this.reset();
      return null;
    }
    if (this.filters.length !== landmarks.length) {
      this.filters = landmarks.map(() => [0, 1, 2].map(() => new OneEuroFilter(this.minCutoff, this.beta)));
    }
    return landmarks.map((p, i) => {
      const f = this.filters[i]!;
      return {
        x: f[0]!.filter(p.x, tMs),
        y: f[1]!.filter(p.y, tMs),
        z: f[2]!.filter(p.z, tMs),
        visibility: p.visibility,
      };
    });
  }

  reset(): void {
    this.filters = [];
  }
}
