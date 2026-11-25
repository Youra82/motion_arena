import type { Landmark, PoseFrame } from "@motion-arena/shared";
import { Calibrator, LandmarkSmoother, extractSquatFeatures } from "@motion-arena/pose-engine";
import { DEFAULT_SQUAT_OPTIONS, SquatCounter, applySquatEvents, type SquatEvent } from "@motion-arena/motion-scoring";
import { actions, showFeedback, useApp, type EngineError, type Source } from "../store";
import { drawFrame } from "../render/draw";
import { DemoSource } from "./demo";
import { PoseDetector } from "./landmarker";
import { Recorder } from "./recorder";

const HUD_INTERVAL_MS = 100;
const COUNTDOWN_S = 3;
const TRAIL_SAMPLE_MS = 90;
const TRAIL_LEN = 10;
const CANCELLED = Symbol("cancelled");

/**
 * Verbindet Quelle (Kamera oder Demo) → Pose-Erkennung → Merkmale → Kalibrierung/Zähler → Store,
 * und zeichnet jedes Bild. Logik liegt in den Paketen; hier nur Ablaufsteuerung.
 */
export class LiveEngine {
  private stream: MediaStream | null = null;
  private detector: PoseDetector | null = null;
  private demo: DemoSource | null = null;
  private raf = 0;
  private videoCb = 0;
  private stopped = false;
  private readonly smoother = new LandmarkSmoother();
  private readonly worldSmoother = new LandmarkSmoother();
  private calibrator = new Calibrator();
  private counter: SquatCounter | null = null;
  private lastHud = 0;
  private countdownStart = 0;
  /** Pause/Fortsetzen/Neukalibrieren erhöhen die Epoche → laufender Versuch wird verworfen. */
  private lastEpoch = 0;
  private runId = 0;
  private goalTimer: ReturnType<typeof setTimeout> | null = null;
  private mirror = true;
  private repFlashAt = -1e9;
  private trail: Landmark[][] = [];
  private lastTrail = 0;
  private fpsFrames: number[] = [];
  private mask: HTMLCanvasElement | null = null;
  readonly recorder = new Recorder();
  private unsubscribe: (() => void) | null = null;
  private lastVideoTime = -1;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly video: HTMLVideoElement,
    private readonly source: Source,
  ) {}

  async start(): Promise<void> {
    this.stopped = false;
    this.runId = useApp.getState().runId;
    try {
      if (this.source === "camera") {
        await this.startCamera();
        if (this.stopped) throw CANCELLED;
        useApp.setState({ engineStatus: "loading-model" });
        const det = new PoseDetector();
        this.detector = det;
        try {
          await det.init(useApp.getState().modelVariant);
        } catch (e) {
          if (this.stopped) throw CANCELLED;
          throw { kind: "model-failed", message: `Pose-Modell konnte nicht geladen werden (${String(e)}).` } satisfies EngineError;
        }
        // Wurde inzwischen abgebrochen, hat det.close() das spät geladene Modell bereits geschlossen.
        if (this.stopped) throw CANCELLED;
        void det.setMask(useApp.getState().viewMode === "silhouette");
        this.unsubscribe = useApp.subscribe((s, prev) => {
          if (s.viewMode !== prev.viewMode) void this.detector?.setMask(s.viewMode === "silhouette");
        });
      } else {
        this.demo = new DemoSource(performance.now());
      }
      if (this.stopped) throw CANCELLED;
      useApp.setState({ engineStatus: "running" });
      this.lastEpoch = useApp.getState().motionEpoch;
      this.loop();
    } catch (e) {
      if (e === CANCELLED || this.stopped) {
        this.stop();
        return;
      }
      this.fail(e);
    }
  }

  /** Einheitlicher Fehlerübergang: nur für die aktuelle Engine, Ressourcen freigeben, Session bleibt. */
  private fail(e: unknown): void {
    if (this.stopped) return;
    const err = (e && typeof e === "object" && "kind" in e ? e : { kind: "unknown", message: String(e) }) as EngineError;
    this.stop();
    if (useApp.getState().runId === this.runId) useApp.setState({ engineStatus: "error", error: err });
  }

  private async startCamera(): Promise<void> {
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      throw {
        kind: "insecure-context",
        message: "Kamera nur über HTTPS oder localhost verfügbar. Auf dem Handy mit „pnpm dev:phone“ starten.",
      } satisfies EngineError;
    }
    useApp.setState({ engineStatus: "requesting-camera" });
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
      });
    } catch (e) {
      const name = (e as DOMException)?.name;
      if (name === "NotAllowedError" || name === "SecurityError")
        throw { kind: "camera-denied", message: "Kamerazugriff wurde verweigert." } satisfies EngineError;
      if (name === "NotFoundError" || name === "OverconstrainedError")
        throw { kind: "no-camera", message: "Keine passende Kamera gefunden." } satisfies EngineError;
      if (name === "NotReadableError")
        throw { kind: "camera-busy", message: "Kamera wird von einer anderen App benutzt." } satisfies EngineError;
      throw { kind: "unknown", message: `Kamera-Fehler: ${String(e)}` } satisfies EngineError;
    }
    if (this.stopped) {
      // Während des Wartens auf die Freigabe beendet: nur die eigenen Tracks stoppen,
      // das (evtl. von einer neueren Engine genutzte) Video nicht anfassen.
      stream.getTracks().forEach((t) => t.stop());
      throw CANCELLED;
    }
    this.stream = stream;
    const track = stream.getVideoTracks?.()[0];
    // Nur die Frontkamera spiegeln (facingMode ist nur ein Wunsch; Desktop-Webcams melden oft nichts).
    this.mirror = track?.getSettings?.().facingMode !== "environment";
    track?.addEventListener?.("ended", () =>
      this.fail({ kind: "camera-ended", message: "Die Kamera wurde getrennt oder von einer anderen App übernommen." }),
    );
    this.video.srcObject = stream;
    this.video.muted = true;
    this.video.playsInline = true;
    await this.video.play();
  }

  stop(): void {
    this.stopped = true;
    cancelAnimationFrame(this.raf);
    if (this.videoCb && "cancelVideoFrameCallback" in this.video) this.video.cancelVideoFrameCallback(this.videoCb);
    if (this.goalTimer !== null) clearTimeout(this.goalTimer);
    this.goalTimer = null;
    this.unsubscribe?.();
    this.unsubscribe = null;
    const own = this.stream;
    own?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    // Video nur leeren, wenn es noch den eigenen Stream zeigt.
    if (own && this.video.srcObject === own) this.video.srcObject = null;
    this.detector?.close();
    this.detector = null;
  }

  private loop = (): void => {
    if (this.stopped) return;
    try {
      this.tick(performance.now());
    } catch (e) {
      this.fail({ kind: "unknown", message: `Fehler in der Bewegungserkennung: ${String(e)}` });
      return;
    }
    if (this.stopped) return;
    if (this.source === "camera" && "requestVideoFrameCallback" in this.video) {
      this.videoCb = this.video.requestVideoFrameCallback(() => this.loop());
    } else {
      this.raf = requestAnimationFrame(this.loop);
    }
  };

  private tick(now: number): void {
    let landmarks: Landmark[] | null = null;
    let worldLandmarks: Landmark[] | null = null;
    let aspect = 9 / 16;
    if (this.detector && this.video.readyState >= 2 && this.video.videoWidth > 0) {
      // Während Optionen umgestellt werden (Maske), keine Inferenz – Bild wird später ausgewertet.
      if (this.detector.busy) return;
      // rAF-Fallback: dasselbe Videobild nicht mehrfach mit neuem Zeitstempel auswerten.
      if (this.video.currentTime === this.lastVideoTime) return;
      this.lastVideoTime = this.video.currentTime;
      const det = this.detector.detect(this.video, now);
      landmarks = det.landmarks;
      worldLandmarks = det.worldLandmarks;
      this.mask = det.mask;
      aspect = this.video.videoWidth / this.video.videoHeight;
    } else if (this.demo) {
      const d = this.demo.frame(now);
      landmarks = d.landmarks;
      worldLandmarks = d.worldLandmarks;
    }

    const raw: PoseFrame = { t: now, landmarks, worldLandmarks, aspect };
    if (this.recorder.active) {
      this.recorder.push(raw);
      if (this.recorder.full) {
        // Limit erreicht: sofort sichern statt beim nächsten Start zu überschreiben.
        this.exportRecording();
        showFeedback("Aufnahme voll – als Datei gespeichert", "info");
      } else if (this.recorder.count % 15 === 0) useApp.setState({ recordedFrames: this.recorder.count });
    }

    const smooth: PoseFrame = {
      t: now,
      landmarks: this.smoother.smooth(landmarks, now),
      worldLandmarks: this.worldSmoother.smooth(worldLandmarks, now),
      aspect,
    };
    const features = extractSquatFeatures(smooth);
    const state = useApp.getState();

    let depth: number | null = null;
    let phase = this.counter?.currentPhase ?? null;
    let armed = false;
    let issue: string[] | null = null;

    if (state.stage === "calibrating") {
      if (state.calibrationProgress === null && this.calibrator.calibration) this.calibrator.reset();
      const p = this.calibrator.update(features);
      useApp.setState({ calibrationProgress: p });
      if (p.phase === "done" && p.result) {
        if (this.counter) this.counter.setCalibration(p.result);
        else this.counter = new SquatCounter(p.result);
        this.countdownStart = now;
        useApp.setState({ calibration: p.result, stage: "countdown", countdown: COUNTDOWN_S });
      }
    } else if (state.stage === "countdown") {
      // Countdown läuft nur, solange die Person sicher erkannt wird; sonst beginnt er neu.
      if (features.quality.status !== "ok") this.countdownStart = now;
      const left = COUNTDOWN_S - Math.floor((now - this.countdownStart) / 1000);
      if (left !== state.countdown) useApp.setState({ countdown: Math.max(0, left) });
      if (now - this.countdownStart >= COUNTDOWN_S * 1000) {
        this.counter?.resetMotion();
        actions.startTraining(now);
      }
    } else if (state.stage === "training" && this.counter) {
      const status = state.session.status;
      // Pause/Fortsetzen – auch zwischen zwei Bildern – verwirft den angefangenen Versuch.
      if (state.motionEpoch !== this.lastEpoch) {
        this.lastEpoch = state.motionEpoch;
        this.counter.resetMotion();
      }
      if (status === "running") {
        const upd = this.counter.update(features);
        depth = upd.depth;
        phase = upd.phase;
        armed = upd.armed;
        issue = upd.issue;
        if (upd.events.length) this.handleEvents(upd.events, now);
      }
    }

    if (landmarks && now - this.lastTrail > TRAIL_SAMPLE_MS && smooth.landmarks) {
      this.trail.push(smooth.landmarks);
      if (this.trail.length > TRAIL_LEN) this.trail.shift();
      this.lastTrail = now;
    }
    if (!landmarks) this.trail = [];

    this.fpsFrames.push(now);
    while (this.fpsFrames.length && now - this.fpsFrames[0]! > 1000) this.fpsFrames.shift();
    if (now - this.lastHud > HUD_INTERVAL_MS) {
      this.lastHud = now;
      useApp.setState({ hud: { depth, phase, armed, issue, quality: features.quality, fps: this.fpsFrames.length } });
    }

    const ctx = this.canvas.getContext("2d");
    if (ctx) {
      drawFrame({
        ctx,
        v: {
          cw: this.canvas.width,
          ch: this.canvas.height,
          sw: this.source === "camera" ? this.video.videoWidth || 1280 : 900,
          sh: this.source === "camera" ? this.video.videoHeight || 720 : 1600,
          mirror: this.source === "camera" && this.mirror,
          // Ganzes ausgewertetes Bild zeigen (contain), damit sichtbar = erkannt – auch im Querformat.
          fit: "contain",
        },
        mode: state.viewMode,
        video: this.source === "camera" ? this.video : null,
        landmarks: smooth.landmarks,
        mask: state.viewMode === "silhouette" ? this.mask : null,
        trail: state.viewMode === "spur" ? this.trail : [],
        ring: { depth, goodDepth: DEFAULT_SQUAT_OPTIONS.goodDepth, repFlashAt: this.repFlashAt, now },
      });
    }
  }

  private handleEvents(events: SquatEvent[], now: number): void {
    const before = useApp.getState().session;
    const after = applySquatEvents(before, events);
    useApp.setState({ session: after });
    for (const e of events) {
      if (e.type === "rep") {
        this.repFlashAt = now;
        const last = after.reps[after.reps.length - 1];
        if (last) {
          const combo = last.comboAfter > 1 ? ` · Combo ×${last.comboAfter}` : "";
          showFeedback(`+${last.points} · ${last.score.feedback[0] ?? ""}${combo}`, last.score.total >= 70 ? "good" : "info");
        }
      } else if (e.type === "shallow") showFeedback("Zu flach – nicht gezählt", "info");
      else if (e.type === "too-fast") showFeedback("Zu schnell – nicht gezählt", "info");
      else if (e.type === "tracking-lost") showFeedback("Körper nicht sicher erkannt – keine Wertung", "warn");
      else if (e.type === "tracking-restored") showFeedback("Wieder erkannt – kurz aufrecht stehen", "info");
    }
    if (after.reps.length >= after.targetReps && after.status === "running" && this.goalTimer === null) {
      showFeedback("Ziel erreicht!", "good");
      const runId = this.runId;
      this.goalTimer = setTimeout(() => {
        this.goalTimer = null;
        const s = useApp.getState();
        if (!this.stopped && s.runId === runId && s.session.status === "running") actions.finish(performance.now());
      }, 1500);
    }
  }

  /** Aufnahme beenden und als Datei sichern (nur Landmarks). */
  exportRecording(): void {
    const s = useApp.getState();
    this.recorder.stopAndExport({
      source: this.source,
      countedReps: s.session.reps.length,
      calibration: s.calibration,
      modelVariant: s.modelVariant,
      userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "",
    });
    useApp.setState({ recording: false, recordedFrames: 0 });
  }
}
