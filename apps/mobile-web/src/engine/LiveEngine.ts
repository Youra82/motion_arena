import type { Landmark, PoseFrame } from "@motion-arena/shared";
import { Calibrator, LandmarkSmoother, extractSquatFeatures } from "@motion-arena/pose-engine";
import {
  BodyLoadAnalyzer,
  DEFAULT_SQUAT_OPTIONS,
  SquatCounter,
  applySquatEvents,
  type BodyLoadResult,
  type SquatEvent,
} from "@motion-arena/motion-scoring";
import { actions, showFeedback, useApp, type EngineError, type Source, type ViewMode } from "../store";
import { drawFrame, type Viewport } from "../render/draw";
import { ArenaRenderer } from "../arena/arena-renderer";
import { GUIDE_CYCLE_MS, activeTimeMs, squatFlex } from "../arena/metrics";
import { drawTrainerBeside } from "../render/trainer-beside";
import { roomById } from "../render/rooms";
import { hasLiveStage } from "../view-modes";
import { avatarById } from "../render/avatars";
import { DemoSource } from "./demo";
// MediaPipe erst beim Kameratraining laden (Start und Demo bleiben schlank).
import type { PoseDetector } from "./landmarker";
import { Recorder } from "./recorder";
import { attachLiveCanvas, detachLiveCanvas, sendPoseToTv, usePhoneLink } from "../tv/phone-link";

const HUD_INTERVAL_MS = 100;
const COUNTDOWN_S = 3;
const TRAIL_SAMPLE_MS = 90;
const TRAIL_LEN = 10;
const DEMO_STEP_MS = 33;
const DEMO_CATCH_UP_MS = 220;
const CANCELLED = Symbol("cancelled");
/** Ansichten, die die Personenmaske brauchen (kostet Rechenzeit, daher nur dann). */
const needsMask = (m: ViewMode) => m === "silhouette" || m === "hybrid" || m === "arena";

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
  /**
   * Anzeige-Glätter: reagiert schnell (hohe Geschwindigkeitsanpassung), damit Figur und Silhouette schnellen
   * Bewegungen und Sprüngen ohne Verzögerung folgen. Zählung und Bewertung nutzen weiter den ruhigen Glätter.
   */
  private readonly displaySmoother = new LandmarkSmoother(1.7, 3);
  private readonly displayWorld = new LandmarkSmoother(1.7, 3);
  /** Letzter Analysestand für die Darstellung (Kamera: eigene Zeichenschleife im Bildschirmtakt). */
  private view: {
    features: ReturnType<typeof extractSquatFeatures>;
    depth: number | null;
    phase: ReturnType<SquatCounter["update"]>["phase"] | null;
    wantsBodyLoad: boolean;
  } | null = null;
  private renderRaf = 0;
  private calibrator = new Calibrator();
  private counter: SquatCounter | null = null;
  /** Körperanalyse (Live Body Load) – im Analysemodus und für Muskel-/Zonen-Ansicht. */
  private readonly bodyLoad = new BodyLoadAnalyzer();
  private lastBodyLoad: BodyLoadResult | null = null;
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
  private readonly arena = new ArenaRenderer();
  readonly recorder = new Recorder();
  private unsubscribe: (() => void) | null = null;
  private lastVideoTime = -1;
  private lastDemoFrame: number | null = null;

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
        let det: PoseDetector;
        try {
          const { PoseDetector: Detector } = await import("./landmarker");
          if (this.stopped) throw CANCELLED;
          det = new Detector();
        } catch (e) {
          if (e === CANCELLED || this.stopped) throw CANCELLED;
          throw { kind: "model-failed", message: `Pose-Erkennung konnte nicht geladen werden (${String(e)}).` } satisfies EngineError;
        }
        this.detector = det;
        try {
          await det.init(useApp.getState().modelVariant);
        } catch (e) {
          if (this.stopped) throw CANCELLED;
          throw { kind: "model-failed", message: `Pose-Modell konnte nicht geladen werden (${String(e)}).` } satisfies EngineError;
        }
        // Wurde inzwischen abgebrochen, hat det.close() das spät geladene Modell bereits geschlossen.
        if (this.stopped) throw CANCELLED;
        void det.setMask(needsMask(useApp.getState().viewMode));
        this.unsubscribe = useApp.subscribe((s, prev) => {
          if (s.viewMode !== prev.viewMode) void this.detector?.setMask(needsMask(s.viewMode));
        });
      } else {
        this.demo = new DemoSource(performance.now(), useApp.getState().liveMode);
      }
      if (this.stopped) throw CANCELLED;
      useApp.setState({ engineStatus: "running" });
      attachLiveCanvas(this.canvas); // gekoppelter Fernseher bekommt (mit Zustimmung) dasselbe Live-Bild
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
    detachLiveCanvas(this.canvas);
    cancelAnimationFrame(this.raf);
    cancelAnimationFrame(this.renderRaf);
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
    this.arena.leave(this.canvas);
  }

  private loop = (): void => {
    if (this.stopped) return;
    try {
      const now = performance.now();
      if (this.demo && useApp.getState().liveMode === "squat") {
        // Demo-Posen sind deterministisch. Wenn der Grafiktreiber einen Anzeigetakt
        // verzögert, erhält der Zähler die fehlenden synthetischen Zwischenposen.
        if (this.lastDemoFrame !== null) {
          const from = Math.max(this.lastDemoFrame + DEMO_STEP_MS, now - DEMO_CATCH_UP_MS);
          for (let t = from; t < now - DEMO_STEP_MS / 2; t += DEMO_STEP_MS) this.tick(t, false);
        }
        this.lastDemoFrame = now;
      }
      this.tick(now);
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

  private tick(now: number, draw = true): void {
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
    const display = this.displaySmoother.smooth(landmarks, now);
    this.displayWorld.smooth(worldLandmarks, now);
    // Mit dem TV gekoppelt? Dann Gelenkpunkte (keine Bilder) weitergeben.
    // (schnell geglättete Anzeige-Punkte: der Fernseher zeigt Bewegungen und Sprünge ohne Verzögerung)
    if (draw) sendPoseToTv(display, aspect, this.source === "camera" ? this.mirror : true, now);
    const state = useApp.getState();

    let depth: number | null = null;
    let phase = this.counter?.currentPhase ?? null;
    let armed = false;
    let issue: string[] | null = null;

    // Körperanalyse: läuft im Analysemodus und für die Ansichten, die sie darstellen.
    const wantsBodyLoad = state.stage === "analysis" || state.viewMode === "muskel" || state.viewMode === "zonen";
    if (wantsBodyLoad) this.lastBodyLoad = this.bodyLoad.update(smooth);
    else if (this.lastBodyLoad) {
      this.bodyLoad.reset();
      this.lastBodyLoad = null;
    }

    if (state.stage === "analysis") {
      // Kein Zählen, keine Kalibrierung – nur Analyse und Darstellung.
    } else if (state.stage === "calibrating") {
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

    if (!draw) return;
    this.view = { features, depth, phase, wantsBodyLoad };
    // Bewegungsspur nur pflegen, wenn sie angezeigt wird.
    if (state.viewMode !== "spur") this.trail = [];
    else if (landmarks && now - this.lastTrail > TRAIL_SAMPLE_MS && smooth.landmarks) {
      this.trail.push(smooth.landmarks);
      if (this.trail.length > TRAIL_LEN) this.trail.shift();
      this.lastTrail = now;
    }
    if (!landmarks) this.trail = [];

    this.fpsFrames.push(now);
    while (this.fpsFrames.length && now - this.fpsFrames[0]! > 1000) this.fpsFrames.shift();
    if (now - this.lastHud > HUD_INTERVAL_MS) {
      this.lastHud = now;
      useApp.setState({
        hud: { depth, phase, armed, issue, quality: features.quality, fps: this.fpsFrames.length, bodyLoad: this.lastBodyLoad },
      });
    }

    // Kamera: gezeichnet wird in einer eigenen Schleife im Bildschirmtakt (Pose dazwischen vorausberechnet);
    // Demo: die Posen entstehen ohnehin je Bildschirmbild.
    if (this.source === "camera") {
      if (!this.renderRaf) this.renderRaf = requestAnimationFrame(this.renderLoop);
      return;
    }
    this.render(now);
  }

  private renderLoop = (): void => {
    if (this.stopped) return;
    try {
      this.render(performance.now());
    } catch (e) {
      this.fail({ kind: "unknown", message: `Fehler in der Darstellung: ${String(e)}` });
      return;
    }
    this.renderRaf = requestAnimationFrame(this.renderLoop);
  };

  /** Ein Bild zeichnen: Pose zum Zeitpunkt `now` (Kamera: aus dem letzten Messwert vorausberechnet). */
  private render(now: number): void {
    const view = this.view;
    if (!view) return;
    const { features, depth, wantsBodyLoad } = view;
    const state = useApp.getState();
    const live = this.source === "camera";
    const pose = live ? this.displaySmoother.predict(now) : this.displaySmoother.predict(now, 0);
    const worldPose = live ? this.displayWorld.predict(now) : this.displayWorld.predict(now, 0);
    const ctx = this.canvas.getContext("2d");
    if (ctx) {
      const v: Viewport = {
        cw: this.canvas.width,
        ch: this.canvas.height,
        sw: this.source === "camera" ? this.video.videoWidth || 1280 : 900,
        sh: this.source === "camera" ? this.video.videoHeight || 720 : 1600,
        mirror: this.source === "camera" ? this.mirror : true,
        fit: "contain",
      };
      if (hasLiveStage(state.viewMode, state.settings.avatar)) {
        const session = useApp.getState().session;
        if (this.arena.draw(ctx, {
          v, room: state.settings.arenaRoom, studioRoom: roomById(state.settings.room), avatar: state.settings.avatar, trainer: state.settings.trainer, mode: state.viewMode,
          pose, worldPose, bodyLoad: this.lastBodyLoad,
          speeds: wantsBodyLoad ? this.bodyLoad.jointSpeeds() : undefined, mask: this.mask, kneeAngle: features.kneeAngle,
          demo: this.source === "demo", squat: state.liveMode === "squat", now, activeMs: activeTimeMs(session, now),
          running: session.status === "running", precision: session.reps.at(-1)?.score.total ?? null,
          capture: usePhoneLink.getState().streaming,
        })) return;
      } else this.arena.leave(this.canvas);
      const fit = drawFrame({
        ctx,
        v,
        mode: state.viewMode === "arena" ? "hologramm" : state.viewMode,
        room: roomById(state.settings.room),
        avatar: avatarById(state.settings.avatar),
        video: this.source === "camera" ? this.video : null,
        landmarks: pose,
        mask: needsMask(state.viewMode) ? this.mask : null,
        trail: state.viewMode === "spur" ? this.trail : [],
        bodyLoad: this.lastBodyLoad,
        jointSpeeds: wantsBodyLoad ? this.bodyLoad.jointSpeeds() : null,
        ring: { depth, goodDepth: DEFAULT_SQUAT_OPTIONS.goodDepth, repFlashAt: this.repFlashAt, now },
        besideTrainer: state.liveMode === "squat",
      });
      // Training: Trainer steht auch in den Kamera-Ansichten neben dir und macht im Takt der Anleitung vor
      if (state.liveMode === "squat") {
        const session = useApp.getState().session;
        const guide = session.status === "running" ? squatFlex((activeTimeMs(session, now) % GUIDE_CYCLE_MS) / GUIDE_CYCLE_MS, 94) : 0;
        const real = this.source === "camera" && (state.viewMode === "echtbild" || state.viewMode === "hybrid");
        drawTrainerBeside(ctx, v, fit, pose, state.settings.trainer, guide, now, real);
      }
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
