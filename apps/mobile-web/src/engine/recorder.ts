import type { PoseFrame } from "@motion-arena/shared";

const MAX_FRAMES = 30 * 60 * 5; // ~5 min bei 30 fps

/**
 * Nimmt Roh-Landmarks (keine Videobilder) lokal auf, um echte Bewegungen als
 * Testdaten zu speichern. Nichts wird übertragen – Export nur als Datei-Download.
 */
export class Recorder {
  private frames: PoseFrame[] = [];
  active = false;
  /** Limit erreicht – Aufrufer soll exportieren. */
  full = false;

  get count(): number {
    return this.frames.length;
  }

  start(): void {
    this.frames = [];
    this.active = true;
    this.full = false;
  }

  push(f: PoseFrame): void {
    if (!this.active) return;
    if (this.frames.length >= MAX_FRAMES) {
      this.full = true;
      return;
    }
    const round = (v: number) => Math.round(v * 1e5) / 1e5;
    const r = (l: PoseFrame["landmarks"]) =>
      l ? l.map((p) => ({ x: round(p.x), y: round(p.y), z: round(p.z), visibility: round(p.visibility) })) : null;
    this.frames.push({ t: Math.round(f.t * 10) / 10, aspect: f.aspect, landmarks: r(f.landmarks), worldLandmarks: r(f.worldLandmarks ?? null) });
  }

  stopAndExport(meta: Record<string, unknown>): void {
    this.active = false;
    this.full = false;
    if (!this.frames.length) return;
    const payload = {
      format: "motion-arena-pose-recording/1",
      createdAt: new Date().toISOString(),
      note: "Nur Landmarks, keine Bilder. expectedReps bitte manuell eintragen, bevor die Datei als Testfall dient.",
      expectedReps: null,
      ...meta,
      frames: this.frames,
    };
    const blob = new Blob([JSON.stringify(payload)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `pose-aufnahme-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    this.frames = [];
  }
}
