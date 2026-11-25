import { FilesetResolver, PoseLandmarker, type PoseLandmarkerResult } from "@mediapipe/tasks-vision";
import type { Landmark } from "@motion-arena/shared";

export interface PoseDetection {
  landmarks: Landmark[] | null;
  worldLandmarks: Landmark[] | null;
  /** Personenmaske (0..1 je Pixel), nur wenn angefordert. */
  mask: { data: Float32Array; width: number; height: number } | null;
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
  private maskBuffer: Float32Array | null = null;
  delegate: "GPU" | "CPU" = "GPU";

  async init(variant: "lite" | "full"): Promise<void> {
    const fileset = await FilesetResolver.forVisionTasks(`${base}mediapipe/wasm`);
    if (this.closed) return;
    const opts = (delegate: "GPU" | "CPU") => ({
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
      let mask: PoseDetection["mask"] = null;
      const m = r.segmentationMasks?.[0];
      if (m) {
        // Kopie nötig: Maskenspeicher ist nur im Callback gültig. Puffer wird wiederverwendet.
        const src = m.getAsFloat32Array();
        if (!this.maskBuffer || this.maskBuffer.length !== src.length) this.maskBuffer = new Float32Array(src.length);
        this.maskBuffer.set(src);
        mask = { data: this.maskBuffer, width: m.width, height: m.height };
      }
      out = {
        landmarks: lm ? lm.map((p) => ({ x: p.x, y: p.y, z: p.z, visibility: p.visibility ?? 0 })) : null,
        worldLandmarks: wl ? wl.map((p) => ({ x: p.x, y: p.y, z: p.z, visibility: p.visibility ?? 0 })) : null,
        mask,
      };
    });
    return out;
  }

  close(): void {
    this.closed = true;
    this.landmarker?.close();
    this.landmarker = null;
  }
}
