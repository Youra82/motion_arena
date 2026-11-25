import { median } from "./geometry.js";
import { classifyView, type Calibration, type SquatFeatures } from "./features.js";

export interface CalibrationOptions {
  /** Wie lange die Person ruhig und vollständig sichtbar stehen muss. */
  holdMs: number;
  /** Mindest-Kniewinkel für "aufrecht stehen". */
  minStandingKneeAngle: number;
  /** Erlaubte Schwankung der Hüfthöhe relativ zur Beinlänge. */
  maxHipJitter: number;
  /** Minimale Beinlänge im Bild (zu weit weg → zu ungenau). */
  minLegLength: number;
  /** Größte erlaubte Lücke zwischen zwei Frames, sonst beginnt die Standzeit neu. */
  maxFrameGapMs: number;
  /**
   * Frontal ohne 3D ist der Kniewinkel nicht sichtbar. Dann muss die Beinhöhe mindestens
   * so viele Schulterbreiten betragen (Stand ≈ 2,0–2,9; tiefe Hocke ≈ 1,5).
   */
  minStandingExtentShoulder2d: number;
  /** Ebenso Bein/Rumpf (Stand ≈ 1,6–1,8; Hocke mit vorgeneigtem Rumpf ≈ 1,3–1,4). */
  minStandingExtentTorso2d: number;
}

export const DEFAULT_CALIBRATION: CalibrationOptions = {
  holdMs: 1500,
  minStandingKneeAngle: 150,
  maxHipJitter: 0.06,
  minLegLength: 0.12,
  maxFrameGapMs: 300,
  minStandingExtentShoulder2d: 1.8,
  minStandingExtentTorso2d: 1.45,
};

export type CalibrationPhase = "waiting" | "collecting" | "done";

export interface CalibrationProgress {
  phase: CalibrationPhase;
  /** 0..1 */
  progress: number;
  message: string;
  result?: Calibration;
}

const medianOrNull = (values: Array<number | null>): number | null => {
  const v = values.filter((x): x is number => x !== null && Number.isFinite(x));
  return v.length ? median(v) : null;
};

/** Sammelt ruhige Stand-Frames und leitet daraus Referenzwerte ab. */
export class Calibrator {
  private samples: SquatFeatures[] = [];
  private result: Calibration | null = null;
  private lastT: number | null = null;

  constructor(private readonly o: CalibrationOptions = DEFAULT_CALIBRATION) {}

  reset(): void {
    this.samples = [];
    this.result = null;
    this.lastT = null;
  }

  get calibration(): Calibration | null {
    return this.result;
  }

  private progressNow(): CalibrationProgress {
    if (this.samples.length < 1) return { phase: "waiting", progress: 0, message: "Stell dich vor die Kamera." };
    const elapsed = this.samples[this.samples.length - 1]!.t - this.samples[0]!.t;
    return { phase: "collecting", progress: Math.min(1, Math.max(0, elapsed / this.o.holdMs)), message: "Ruhig stehen bleiben …" };
  }

  update(f: SquatFeatures): CalibrationProgress {
    if (this.result) return { phase: "done", progress: 1, message: "Kalibriert", result: this.result };

    // Zeitstempel: nicht endlich oder nicht steigend → Frame ignorieren.
    if (!Number.isFinite(f.t) || (this.lastT !== null && f.t <= this.lastT)) return this.progressNow();
    const gap = this.lastT === null ? 0 : f.t - this.lastT;
    this.lastT = f.t;
    if (gap > this.o.maxFrameGapMs) this.samples = [];

    const reject = (message: string): CalibrationProgress => {
      this.samples = [];
      return { phase: "waiting", progress: 0, message };
    };

    if (f.quality.status === "no-person") return reject("Stell dich vor die Kamera.");
    if (f.quality.status === "partial")
      return reject(`Ganzer Körper muss sichtbar sein – fehlt: ${f.quality.missing.join(", ")}.`);
    if (f.quality.status === "low-confidence") return reject("Erkennung unsicher – mehr Licht oder etwas weiter weg.");
    if (f.kneeAngle === null || f.hipY === null || f.legLength === null) return reject("Beine nicht klar erkennbar.");
    if (f.legLength < this.o.minLegLength) return reject("Etwas näher an die Kamera kommen.");
    if (f.kneeAngle < this.o.minStandingKneeAngle) return reject("Aufrecht hinstellen, Beine gestreckt.");
    if (!f.headVisible) return reject("Ganzer Körper muss sichtbar sein – fehlt: Kopf.");
    if (f.kneeSource === "2d" && classifyView(f.shoulderWidthRatio) === "front") {
      // Frontal in 2D erscheint auch eine Hocke gestreckt – Stand über zwei unabhängige
      // Proportionen belegen (Bein/Schulterbreite und Bein/Rumpf), nicht über eine allein.
      const okShoulder = (f.extentShoulder2d ?? 0) >= this.o.minStandingExtentShoulder2d;
      const okTorso = (f.extentTorso2d ?? 0) >= this.o.minStandingExtentTorso2d;
      if (!okShoulder || !okTorso) return reject("Aufrecht hinstellen, Beine gestreckt.");
    }

    this.samples.push(f);
    const hipYs = this.samples.map((s) => s.hipY!);
    const legLen = median(this.samples.map((s) => s.legLength!));
    // Bewegt sich die Person zu stark (auch seitlich), neu beginnen.
    const hipXs = this.samples.map((s) => s.hipX).filter((v): v is number => v !== null);
    const spread = (v: number[]) => (v.length ? Math.max(...v) - Math.min(...v) : 0);
    if (spread(hipYs) > this.o.maxHipJitter * legLen || spread(hipXs) > this.o.maxHipJitter * 2 * legLen) {
      this.samples = [f];
      return { phase: "collecting", progress: 0, message: "Bitte ruhig stehen bleiben." };
    }

    const p = this.progressNow();
    if (p.progress < 1) return p;

    const shoulderWidthRatio = medianOrNull(this.samples.map((s) => s.shoulderWidthRatio));
    this.result = {
      standingKneeAngle: median(this.samples.map((s) => s.kneeAngle!)),
      standingHipY: median(hipYs),
      legLength: legLen,
      standingExtent3d: medianOrNull(this.samples.map((s) => s.extent3d)),
      standingExtentSeg2d: medianOrNull(this.samples.map((s) => s.extentSeg2d)),
      standingExtentShoulder2d: medianOrNull(this.samples.map((s) => s.extentShoulder2d)),
      shoulderWidthRatio,
      view: classifyView(shoulderWidthRatio),
      kneeSource: f.kneeSource ?? "2d",
    };
    this.samples = [];
    return { phase: "done", progress: 1, message: "Kalibriert", result: this.result };
  }
}
