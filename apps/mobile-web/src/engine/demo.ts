import { seededRng, synthPose, type SynthOptions } from "@motion-arena/pose-engine";
import type { Landmark } from "@motion-arena/shared";
import { GUIDE_CYCLE_MS, squatFlex } from "../arena/metrics";

/**
 * DEMO-Quelle: synthetische Kniebeugen ohne Kamera (klar gekennzeichnet in der UI).
 * Ablauf: 2,5 s stehen (Kalibrierung), dann Kniebeugen-Zyklen mit gelegentlicher
 * flacher Wiederholung und einem kurzen Erkennungsausfall zur Veranschaulichung.
 */
export class DemoSource {
  private readonly rng = seededRng(42);
  private readonly t0: number;

  constructor(
    now: number,
    private readonly mode: "squat" | "analysis" = "squat",
  ) {
    this.t0 = now;
  }

  /**
   * Analyse-Demo: führt nacheinander typische Bewegungen vor (je 4 s, mit weichen Übergängen).
   * Rein synthetisch – zeigt, wie die Körperanalyse auf verschiedene Haltungen reagiert.
   */
  private analysisPose(ms: number): SynthOptions {
    const base = { view: "front" as const, noise: 0.0015, rng: this.rng, aspect: 9 / 16, scale: 0.56, groundY: 0.76 };
    const seg = 4000;
    const steps = ["stehen", "kniebeuge", "einbein", "ausfall", "hampel", "arme", "stuetz"] as const;
    const k = Math.floor(ms / seg) % steps.length;
    const p = (ms % seg) / seg;
    const ramp = easeInOut(Math.min(1, p / 0.25)); // erste Sekunde einblenden
    switch (steps[k]) {
      case "kniebeuge":
        return { ...base, kneeFlexDeg: 88 * ramp };
      case "einbein":
        return { ...base, kneeFlexDeg: 0, arms: "down", liftLeftKneeDeg: 80 * ramp };
      case "ausfall":
        return { ...base, kneeFlexDeg: 0, arms: "down", lunge: 0.85 * ramp };
      case "hampel": {
        const ph = (Math.sin((ms / 700) * Math.PI * 2) + 1) / 2;
        return { ...base, kneeFlexDeg: 0, arms: 15 + 155 * ph, legSpreadDeg: 18 * ph };
      }
      case "arme":
        return { ...base, kneeFlexDeg: 0, arms: 15 + 145 * ramp };
      case "stuetz":
        return { ...base, view: "side", kneeFlexDeg: 0, pitchDeg: 78 * ramp, scale: 0.32, groundY: 0.72, centerX: 0.5 - 0.27 * ramp };
      default:
        return { ...base, kneeFlexDeg: 0, arms: "down" };
    }
  }

  /** Kniebeugung in Grad zum Zeitpunkt t (ms seit Start). */
  private flexAt(ms: number): number {
    const stand = 2500;
    if (ms < stand) return 0;
    const k = Math.floor((ms - stand) / GUIDE_CYCLE_MS);
    const p = ((ms - stand) % GUIDE_CYCLE_MS) / GUIDE_CYCLE_MS;
    const depth = k % 5 === 3 ? 45 : 92 + 6 * Math.sin(k); // jede 5. flach
    return squatFlex(p, depth);
  }

  frame(now: number): { landmarks: Landmark[] | null; worldLandmarks: Landmark[] | null } {
    const ms = now - this.t0;
    if (this.mode === "analysis") return synthPose(this.analysisPose(ms));
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
