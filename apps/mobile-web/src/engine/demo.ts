import { seededRng, synthPose } from "@motion-arena/pose-engine";
import type { Landmark } from "@motion-arena/shared";

/**
 * DEMO-Quelle: synthetische Kniebeugen ohne Kamera (klar gekennzeichnet in der UI).
 * Ablauf: 2,5 s stehen (Kalibrierung), dann Kniebeugen-Zyklen mit gelegentlicher
 * flacher Wiederholung und einem kurzen Erkennungsausfall zur Veranschaulichung.
 */
export class DemoSource {
  private readonly rng = seededRng(42);
  private readonly t0: number;

  constructor(now: number) {
    this.t0 = now;
  }

  /** Kniebeugung in Grad zum Zeitpunkt t (ms seit Start). */
  private flexAt(ms: number): number {
    const stand = 2500;
    if (ms < stand) return 0;
    const cycle = 3200;
    const k = Math.floor((ms - stand) / cycle);
    const p = ((ms - stand) % cycle) / cycle;
    const depth = k % 5 === 3 ? 45 : 92 + 6 * Math.sin(k); // jede 5. flach
    if (p < 0.35) return depth * easeInOut(p / 0.35);
    if (p < 0.45) return depth;
    if (p < 0.8) return depth * (1 - easeInOut((p - 0.45) / 0.35));
    return 0;
  }

  frame(now: number): { landmarks: Landmark[] | null; worldLandmarks: Landmark[] | null } {
    const ms = now - this.t0;
    // Kurz "verschwinden" nach ca. 25 s, um den Warnzustand zu zeigen.
    const cycleMs = 40_000;
    const local = ms % cycleMs;
    if (local > 25_000 && local < 26_200) return { landmarks: null, worldLandmarks: null };
    const pose = synthPose({ kneeFlexDeg: this.flexAt(local), view: "front", noise: 0.0015, rng: this.rng, aspect: 9 / 16, scale: 0.56, groundY: 0.76 });
    return pose;
  }
}

function easeInOut(x: number): number {
  return x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;
}
