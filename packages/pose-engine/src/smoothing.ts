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

  /** Letzter geglätteter Wert (null vor der ersten Messung). */
  get value(): number | null {
    return this.xPrev;
  }

  /** Geglättete Geschwindigkeit je Sekunde. */
  get velocity(): number {
    return this.dxPrev;
  }
}

/** Glättet alle Koordinaten eines Landmark-Satzes; Sichtbarkeit bleibt ungeglättet. */
export class LandmarkSmoother {
  private filters: OneEuroFilter[][] = [];
  private last: Landmark[] | null = null;
  private tLast = 0;

  constructor(
    private readonly minCutoff = 1.2,
    private readonly beta = 0.02,
  ) {}

  smooth(landmarks: Landmark[] | null | undefined, tMs: number): Landmark[] | null {
    if (!landmarks) {
      this.reset();
      return null;
    }
    this.tLast = tMs;
    if (this.filters.length !== landmarks.length) {
      this.filters = landmarks.map(() => [0, 1, 2].map(() => new OneEuroFilter(this.minCutoff, this.beta)));
    }
    this.last = landmarks.map((p, i) => {
      const f = this.filters[i]!;
      return {
        x: f[0]!.filter(p.x, tMs),
        y: f[1]!.filter(p.y, tMs),
        z: f[2]!.filter(p.z, tMs),
        visibility: p.visibility,
      };
    });
    return this.last;
  }

  /**
   * Pose zum Zeitpunkt `tMs` vorausberechnen: letzter geglätteter Wert + geglättete Geschwindigkeit × Abstand,
   * höchstens `maxAheadMs` weit (die Erkennung liefert seltener, als der Bildschirm zeichnet). So bewegt sich die
   * Figur zwischen zwei Kamerabildern weiter, statt im Erkennungstakt zu springen.
   */
  predict(tMs: number, maxAheadMs = 50): Landmark[] | null {
    if (!this.last) return null;
    const dt = Math.min(Math.max(0, tMs - this.tLast), maxAheadMs) / 1000;
    if (dt === 0) return this.last;
    return this.last.map((p, i) => {
      const f = this.filters[i];
      if (!f) return p;
      return { x: p.x + f[0]!.velocity * dt, y: p.y + f[1]!.velocity * dt, z: p.z + f[2]!.velocity * dt, visibility: p.visibility };
    });
  }

  reset(): void {
    this.filters = [];
    this.last = null;
  }
}
