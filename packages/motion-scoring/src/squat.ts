import {
  squatDepthDetailed,
  type Calibration,
  type CameraView,
  type DepthResult,
  type SquatFeatures,
} from "@motion-arena/pose-engine";

export interface SquatCounterOptions {
  /** Ab dieser Tiefe beginnt ein Abstieg. */
  startDepth: number;
  /** Mindesttiefe, damit eine Wiederholung zählt (~Kniewinkel 125–130°). */
  minCountDepth: number;
  /** Ab hier gilt die Tiefe als gut (~Oberschenkel waagerecht). */
  goodDepth: number;
  /** Unter dieser Tiefe gilt die Person wieder als aufrecht. */
  topDepth: number;
  /** So weit muss die Tiefe vom Tiefpunkt zurückgehen, bevor "Aufstieg" gilt. */
  turnHysteresis: number;
  /** Kürzeste zählbare Wiederholung (Schutz gegen Zittern/Wippen). */
  minRepMs: number;
  /** Kurze Erkennungsaussetzer bis zu dieser Dauer werden überbrückt. */
  trackingGraceMs: number;
  /** Erst ab dieser Tiefe gibt es bei zu flachen Versuchen Feedback (sonst still verwerfen). */
  shallowFeedbackDepth: number;
  /** Längere Lücke zwischen zwei Frames gilt als Erkennungsausfall. */
  maxFrameGapMs: number;
  /** Größte plausible Tiefenänderung pro Sekunde (Parallel-Kniebeuge in ~0,2 s ≈ 5/s). */
  maxDepthRatePerS: number;
  /** Zusätzliche Toleranz für Sprünge zwischen zwei Frames. */
  depthJumpMargin: number;
  /** Mindestens so viele Bilder muss ein Versuch umfassen, um gewertet zu werden. */
  minRepFrames: number;
  /** Größte erlaubte Lücke zwischen zwei Bildern innerhalb eines Versuchs. */
  maxRepFrameGapMs: number;
}

/** Springt die Zeit weiter als das zurück, gilt es als neue Zeitbasis statt als Ausreißer. */
const TIMEBASE_RESET_MS = 5000;

export const DEFAULT_SQUAT_OPTIONS: SquatCounterOptions = {
  startDepth: 0.2,
  minCountDepth: 0.5,
  goodDepth: 0.85,
  topDepth: 0.12,
  turnHysteresis: 0.08,
  minRepMs: 600,
  trackingGraceMs: 300,
  shallowFeedbackDepth: 0.3,
  maxFrameGapMs: 500,
  maxDepthRatePerS: 6,
  depthJumpMargin: 0.15,
  minRepFrames: 4,
  maxRepFrameGapMs: 350,
};

export type SquatPhase = "standing" | "descending" | "ascending" | "uncertain";

export interface RepRecord {
  /** Laufende Nummer der gezählten Wiederholung (1-basiert). */
  index: number;
  startT: number;
  bottomT: number;
  endT: number;
  maxDepth: number;
  minKneeAngle: number | null;
  /** Größter Links/Rechts-Unterschied des Kniewinkels nahe dem Tiefpunkt (Grad). */
  symmetryDiffDeg: number | null;
  maxTorsoLeanDeg: number | null;
  view: CameraView;
}

export type SquatEvent =
  | { type: "rep"; t: number; rep: RepRecord }
  | { type: "shallow"; t: number; maxDepth: number }
  | { type: "too-fast"; t: number; durationMs: number }
  | { type: "tracking-lost"; t: number; missing: string[]; abortedRep: boolean }
  | { type: "tracking-restored"; t: number };

export interface SquatUpdate {
  phase: SquatPhase;
  /** Aktuelle normierte Tiefe oder null (unsicher). */
  depth: number | null;
  /** false, solange nach einem Aussetzer noch nicht wieder aufrecht gestanden wurde. */
  armed: boolean;
  /** Grund, warum gerade nicht gewertet wird (nur in Phase "uncertain"), sonst null. */
  issue: string[] | null;
  events: SquatEvent[];
}

interface RepInProgress {
  startT: number;
  bottomT: number;
  maxDepth: number;
  minKneeAngle: number | null;
  symmetryDiffDeg: number | null;
  maxTorsoLeanDeg: number | null;
  /** Kleinste Tiefe seit Beginn des Aufstiegs (für erneutes Absinken). */
  minSinceTurn: number;
  /** Messquelle bei Beginn – darf sich im Versuch nicht ändern. */
  source: "3d" | "2d" | null;
  /** Anzahl ausgewerteter Bilder und größte Lücke zwischen ihnen. */
  frames: number;
  lastFrameT: number;
  maxFrameGapMs: number;
}

/**
 * Zustandsmaschine für Kniebeugen.
 * standing → descending → ascending → (zurück oben) standing + Wiederholung.
 * Unsichere Erkennung bricht den laufenden Versuch ohne Strafe ab; gezählt wird erst
 * wieder, nachdem die Person sicher erkannt aufrecht steht.
 */
export class SquatCounter {
  private phase: SquatPhase = "standing";
  private armed = false;
  private rep: RepInProgress | null = null;
  private lastTopT: number | null = null;
  private badSince: number | null = null;
  private lastMissing: string[] = [];
  private lostReason: string[] = [];
  private count = 0;
  private lastT: number | null = null;
  /** Zeit der letzten verwertbaren Messung (für Lücken, auch wenn ungültige Frames dazwischen liegen). */
  private lastValidT: number | null = null;
  private lastDepth: number | null = null;
  private lastDepthT: number | null = null;
  private pending: { depth: number; t: number } | null = null;

  constructor(
    private calibration: Calibration,
    private readonly o: SquatCounterOptions = DEFAULT_SQUAT_OPTIONS,
  ) {}

  get repCount(): number {
    return this.count;
  }

  get currentPhase(): SquatPhase {
    return this.phase;
  }

  setCalibration(cal: Calibration): void {
    this.calibration = cal;
    this.resetMotion();
  }

  /** Setzt laufende Bewegung zurück (z. B. nach Pause), behält den Zähler. */
  resetMotion(): void {
    this.phase = "standing";
    this.armed = false;
    this.rep = null;
    this.lastTopT = null;
    this.badSince = null;
    this.lastMissing = [];
    this.lastDepth = null;
    this.lastDepthT = null;
    this.pending = null;
    this.lastT = null; // Pause o. Ä. ist keine Erkennungslücke
    this.lastValidT = null;
  }

  private loseTracking(t: number, missing: string[], events: SquatEvent[]): void {
    const abortedRep = this.rep !== null;
    this.rep = null;
    this.phase = "uncertain";
    this.armed = false;
    this.lastDepth = null;
    this.lastDepthT = null;
    this.pending = null;
    this.lostReason = missing;
    events.push({ type: "tracking-lost", t, missing, abortedRep });
  }

  update(f: SquatFeatures): SquatUpdate {
    const events: SquatEvent[] = [];
    const out = (depth: number | null): SquatUpdate => ({
      phase: this.phase,
      depth,
      armed: this.armed,
      issue: this.phase === "uncertain" ? this.lostReason : null,
      events,
    });

    // Zeitstempel prüfen: nicht endlich, doppelt oder leicht rückwärts → Frame ignorieren.
    if (!Number.isFinite(f.t)) return out(null);
    if (this.lastT !== null && f.t <= this.lastT) {
      if (this.lastT - f.t < TIMEBASE_RESET_MS) return out(null);
      this.resetMotion(); // neue Zeitbasis (z. B. Kamera neu gestartet)
    }
    this.lastT = f.t;

    let dr: DepthResult = f.quality.status === "ok" ? squatDepthDetailed(f, this.calibration) : { depth: null, issue: null };
    // Messquelle (3D/2D) darf innerhalb eines Versuchs nicht wechseln – sonst sind Tiefen nicht vergleichbar.
    // Wechsel gilt als fehlende Messung: kurz überbrückt, länger → Versuch ohne Wertung verworfen.
    // Ebenso muss sie der Kalibrierung entsprechen (2D frontal misst systematisch anders als 3D).
    const sourceChanged =
      f.kneeSource !== null && (f.kneeSource !== this.calibration.kneeSource || (this.rep !== null && f.kneeSource !== this.rep.source));
    if (dr.depth !== null && sourceChanged) {
      dr = { depth: null, issue: "Messung unsicher" };
    }
    const missing = dr.issue ? [dr.issue] : f.quality.missing;

    if (dr.depth === null) {
      if (this.badSince === null) this.badSince = f.t;
      this.lastMissing = missing;
      if (this.phase !== "uncertain" && f.t - this.badSince >= this.o.trackingGraceMs) {
        this.loseTracking(f.t, missing, events);
      }
      return out(null);
    }
    const depth = dr.depth;
    const gap = this.lastValidT === null ? 0 : f.t - this.lastValidT;
    this.lastValidT = f.t;

    // Lange Lücke ohne Frames oder zu langer Ausfall vor diesem Frame: Versuch ohne Wertung abbrechen.
    const lostFor = this.badSince === null ? 0 : f.t - this.badSince;
    if (this.phase !== "uncertain" && (gap > this.o.maxFrameGapMs || lostFor >= this.o.trackingGraceMs)) {
      this.loseTracking(f.t, lostFor > 0 && this.lastMissing.length ? this.lastMissing : ["Kamerabild"], events);
    }
    this.badSince = null;
    this.lastMissing = [];
    if (this.phase === "uncertain") {
      this.phase = "standing";
      events.push({ type: "tracking-restored", t: f.t });
    }

    // Physikalisch unplausible Sprünge (Einzelausreißer) verwerfen; zwei konsistente Frames gelten.
    if (this.lastDepth !== null && this.lastDepthT !== null) {
      const maxJump = (d: number, dtMs: number) => Math.abs(d) > this.o.maxDepthRatePerS * (dtMs / 1000) + this.o.depthJumpMargin;
      if (maxJump(depth - this.lastDepth, f.t - this.lastDepthT)) {
        const p = this.pending;
        if (!p || maxJump(depth - p.depth, f.t - p.t)) {
          this.pending = { depth, t: f.t };
          return out(this.lastDepth);
        }
      }
    }
    this.pending = null;
    this.lastDepth = depth;
    this.lastDepthT = f.t;

    if (!this.armed) {
      if (depth < this.o.topDepth) {
        this.armed = true;
        this.lastTopT = f.t;
      }
      return out(depth);
    }

    switch (this.phase) {
      case "standing": {
        if (depth < this.o.topDepth) {
          this.lastTopT = f.t;
        } else if (depth > this.o.startDepth) {
          this.phase = "descending";
          this.rep = {
            startT: this.lastTopT ?? f.t,
            bottomT: f.t,
            maxDepth: depth,
            minKneeAngle: f.kneeAngle,
            symmetryDiffDeg: null,
            maxTorsoLeanDeg: null,
            minSinceTurn: depth,
            source: f.kneeSource,
            frames: 0,
            lastFrameT: f.t,
            maxFrameGapMs: 0,
          };
          this.trackBottom(f, depth);
        }
        break;
      }
      case "descending": {
        const rep = this.rep!;
        this.trackBottom(f, depth);
        if (depth < rep.maxDepth - this.o.turnHysteresis) {
          this.phase = "ascending";
          rep.minSinceTurn = depth;
        }
        break;
      }
      case "ascending": {
        const rep = this.rep!;
        this.trackBottom(f, depth);
        rep.minSinceTurn = Math.min(rep.minSinceTurn, depth);
        if (depth > rep.minSinceTurn + this.o.turnHysteresis) {
          // Erneut abgesunken (Wippen am Tiefpunkt): gleicher Versuch.
          this.phase = "descending";
        } else if (depth < this.o.topDepth) {
          const r = this.rep!;
          r.frames += 1;
          r.maxFrameGapMs = Math.max(r.maxFrameGapMs, f.t - r.lastFrameT);
          this.finishRep(f.t, events);
          this.phase = "standing";
          this.lastTopT = f.t;
        }
        break;
      }
    }
    return out(depth);
  }

  private trackBottom(f: SquatFeatures, depth: number): void {
    const rep = this.rep!;
    rep.frames += 1;
    rep.maxFrameGapMs = Math.max(rep.maxFrameGapMs, f.t - rep.lastFrameT);
    rep.lastFrameT = f.t;
    if (depth >= rep.maxDepth) {
      rep.maxDepth = depth;
      rep.bottomT = f.t;
    }
    if (f.kneeAngle !== null) rep.minKneeAngle = rep.minKneeAngle === null ? f.kneeAngle : Math.min(rep.minKneeAngle, f.kneeAngle);
    // Symmetrie und Rumpfneigung nur in der unteren Hälfte der Bewegung bewerten.
    if (depth >= 0.5 * Math.max(rep.maxDepth, this.o.minCountDepth)) {
      if (f.kneeAngleL !== null && f.kneeAngleR !== null) {
        const d = Math.abs(f.kneeAngleL - f.kneeAngleR);
        rep.symmetryDiffDeg = rep.symmetryDiffDeg === null ? d : Math.max(rep.symmetryDiffDeg, d);
      }
      if (f.torsoLeanDeg !== null && this.calibration.view !== "front") {
        rep.maxTorsoLeanDeg = rep.maxTorsoLeanDeg === null ? f.torsoLeanDeg : Math.max(rep.maxTorsoLeanDeg, f.torsoLeanDeg);
      }
    }
  }

  private finishRep(t: number, events: SquatEvent[]): void {
    const rep = this.rep!;
    this.rep = null;
    const durationMs = t - rep.startT;
    // Zu dünn beobachtet (wenige Bilder oder große Lücken): weder zählen noch als Fehler werten.
    if (rep.frames < this.o.minRepFrames || rep.maxFrameGapMs > this.o.maxRepFrameGapMs) return;
    if (rep.maxDepth < this.o.minCountDepth) {
      if (rep.maxDepth >= this.o.shallowFeedbackDepth) events.push({ type: "shallow", t, maxDepth: rep.maxDepth });
      return;
    }
    if (durationMs < this.o.minRepMs) {
      events.push({ type: "too-fast", t, durationMs });
      return;
    }
    this.count += 1;
    events.push({
      type: "rep",
      t,
      rep: {
        index: this.count,
        startT: rep.startT,
        bottomT: rep.bottomT,
        endT: t,
        maxDepth: rep.maxDepth,
        minKneeAngle: rep.minKneeAngle,
        symmetryDiffDeg: rep.symmetryDiffDeg,
        maxTorsoLeanDeg: rep.maxTorsoLeanDeg,
        view: this.calibration.view,
      },
    });
  }
}
