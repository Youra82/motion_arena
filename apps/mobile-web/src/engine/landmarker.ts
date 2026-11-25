import { DrawingUtils, FilesetResolver, PoseLandmarker, type MPMask, type PoseLandmarkerResult } from "@mediapipe/tasks-vision";
import type { Landmark } from "@motion-arena/shared";

export interface PoseDetection {
  landmarks: Landmark[] | null;
  worldLandmarks: Landmark[] | null;
  /**
   * Personenmaske als fertig eingefärbtes Bild (Türkis, Deckkraft = Personenwahrscheinlichkeit),
   * gleiche Maße wie das Kamerabild. Nur wenn angefordert.
   */
  mask: HTMLCanvasElement | null;
}

const base = import.meta.env.BASE_URL;

/**
 * Kapselt MediaPipe Pose Landmarker (lokal geladenes Modell + WASM).
 * Wird close() vor Ende des Ladens aufgerufen, wird das fertige Modell sofort wieder geschlossen.
 */
export class PoseDetector {
  private landmarker: PoseLandmarker | null = null;
  private closed = false;
  private lastTs = 0;
  /** Gewünschter und tatsächlich eingestellter Maskenzustand (getrennt geführt). */
  private wantMask = false;
  private appliedMask = false;
  private reconfiguring = false;
  /** WebGL-Canvas der Erkennung (GPU): Maske wird dort ohne Zurücklesen gezeichnet. */
  private glCanvas: HTMLCanvasElement | null = null;
  private drawer: DrawingUtils | null = null;
  /** 2D-Kopie der eingefärbten Maske – bleibt nach dem Callback gültig. */
  private maskOut: HTMLCanvasElement | null = null;
  private maskImage: ImageData | null = null;
  delegate: "GPU" | "CPU" = "GPU";

  async init(variant: "lite" | "full"): Promise<void> {
    const fileset = await FilesetResolver.forVisionTasks(`${base}mediapipe/wasm`);
    if (this.closed) return;
    // Eigene Canvas für den WebGL-Kontext der GPU-Erkennung (in Tests ohne DOM weggelassen).
    if (typeof document !== "undefined") this.glCanvas = document.createElement("canvas");
    const opts = (delegate: "GPU" | "CPU") => ({
      ...(delegate === "GPU" && this.glCanvas ? { canvas: this.glCanvas } : {}),
      baseOptions: { modelAssetPath: `${base}models/pose_landmarker_${variant}.task`, delegate },
      runningMode: "VIDEO" as const,
      numPoses: 1,
      minPoseDetectionConfidence: 0.5,
      minPosePresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
      outputSegmentationMasks: this.appliedMask,
    });
    let lm: PoseLandmarker;
    try {
      lm = await PoseLandmarker.createFromOptions(fileset, opts("GPU"));
      this.delegate = "GPU";
    } catch {
      // GPU nicht verfügbar → CPU (nur, wenn nicht inzwischen abgebrochen).
      if (this.closed) return;
      lm = await PoseLandmarker.createFromOptions(fileset, opts("CPU"));
      this.delegate = "CPU";
    }
    if (this.delegate === "GPU" && this.glCanvas) {
      const gl = this.glCanvas.getContext("webgl2");
      if (gl) this.drawer = new DrawingUtils(gl);
    }
    if (this.closed) {
      lm.close();
      return;
    }
    this.landmarker = lm;
  }

  /** true, solange Optionen umgestellt werden – dann keine Inferenz. */
  get busy(): boolean {
    return this.reconfiguring;
  }

  /**
   * Maske nur bei Bedarf (Silhouette). Wünsche werden auf den jüngsten zusammengefasst und
   * nacheinander angewendet; ein Fehler lässt die Erkennung ohne Maske weiterlaufen.
   */
  async setMask(want: boolean): Promise<void> {
    this.wantMask = want;
    if (this.reconfiguring) return;
    this.reconfiguring = true;
    try {
      while (this.landmarker && !this.closed && this.appliedMask !== this.wantMask) {
        const target = this.wantMask;
        await this.landmarker.setOptions({ outputSegmentationMasks: target });
        this.appliedMask = target;
      }
    } catch {
      // Bleibt beim bisherigen Zustand; Darstellung fällt auf Skelett zurück, Session läuft weiter.
      this.wantMask = this.appliedMask;
    } finally {
      this.reconfiguring = false;
    }
  }

  detect(video: HTMLVideoElement, nowMs: number): PoseDetection {
    if (!this.landmarker || this.closed) return { landmarks: null, worldLandmarks: null, mask: null };
    // MediaPipe verlangt streng steigende Zeitstempel.
    const ts = Math.max(nowMs, this.lastTs + 1);
    this.lastTs = ts;
    let out: PoseDetection = { landmarks: null, worldLandmarks: null, mask: null };
    this.landmarker.detectForVideo(video, ts, (r: PoseLandmarkerResult) => {
      const lm = r.landmarks[0];
      const wl = r.worldLandmarks[0];
      const m = r.segmentationMasks?.[0];
      // Maske ist nur im Callback gültig → sofort in eine eigene 2D-Canvas übertragen.
      const mask = m ? this.renderMask(m) : null;
      out = {
        landmarks: lm ? lm.map((p) => ({ x: p.x, y: p.y, z: p.z, visibility: p.visibility ?? 0 })) : null,
        worldLandmarks: wl ? wl.map((p) => ({ x: p.x, y: p.y, z: p.z, visibility: p.visibility ?? 0 })) : null,
        mask,
      };
    });
    return out;
  }

  /**
   * Färbt die Maske türkis ein (Deckkraft = Wahrscheinlichkeit) und kopiert sie in eine 2D-Canvas.
   * GPU: direkt in WebGL zeichnen – ein Zurücklesen per getAsFloat32Array() scheitert dort
   * (glReadPixels: "Invalid format and type combination") und ergäbe eine leere, schwarze Maske.
   * CPU: Werte liegen im Arbeitsspeicher und werden pixelweise übertragen.
   */
  private renderMask(m: MPMask): HTMLCanvasElement | null {
    if (typeof document === "undefined") return null;
    if (!this.maskOut) this.maskOut = document.createElement("canvas");
    const out = this.maskOut;
    if (out.width !== m.width || out.height !== m.height) {
      out.width = m.width;
      out.height = m.height;
      this.maskImage = null;
    }
    const ctx = out.getContext("2d");
    if (!ctx) return null;

    if (m.hasWebGLTexture() && this.drawer && this.glCanvas) {
      const gl = this.glCanvas;
      if (gl.width !== m.width || gl.height !== m.height) {
        gl.width = m.width;
        gl.height = m.height;
      }
      this.drawer.drawConfidenceMask(m, [0, 0, 0, 0], [0x47, 0xd4, 0xd0, 230]);
      ctx.clearRect(0, 0, out.width, out.height);
      ctx.drawImage(gl, 0, 0); // im selben Takt kopieren, solange der WebGL-Puffer gültig ist
      return out;
    }

    const data = m.getAsFloat32Array();
    if (!this.maskImage) this.maskImage = new ImageData(m.width, m.height);
    const px = this.maskImage.data;
    for (let i = 0, j = 0; i < data.length; i++, j += 4) {
      px[j] = 0x47;
      px[j + 1] = 0xd4;
      px[j + 2] = 0xd0;
      px[j + 3] = Math.round(Math.min(1, Math.max(0, data[i]!)) * 230);
    }
    ctx.putImageData(this.maskImage, 0, 0);
    return out;
  }

  close(): void {
    this.closed = true;
    this.drawer?.close();
    this.drawer = null;
    this.landmarker?.close();
    this.landmarker = null;
  }
}
