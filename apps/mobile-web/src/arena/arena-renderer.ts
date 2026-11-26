import type { ArenaFrame, ArenaScene } from "./arena-scene";
import type { ArenaThree } from "./arena-three";

/** Hält den Import aus dem Startbündel und die Darstellung pro Leinwand getrennt. */
export class ArenaRenderer {
  private scene: ArenaScene | null = null;
  private requested = false;
  private active = false;
  private three: ArenaThree | null = null;
  private threeGeneration = 0;
  private nextFrame = 0;
  private lastSize = "";

  draw(ctx: CanvasRenderingContext2D, frame: ArenaFrame): boolean {
    if (!this.active) {
      this.active = true;
      const generation = ++this.threeGeneration;
      void import("./arena-three").then(({ ArenaThree }) => {
        if (generation !== this.threeGeneration) return;
        if (!globalThis.WebGL2RenderingContext) return;
        const canvas = document.createElement("canvas");
        const gl = canvas.getContext("webgl2", { antialias: true, alpha: false, powerPreference: "high-performance" });
        if (gl) this.three = new ArenaThree(canvas, gl);
      }).catch(() => { /* Bei fehlendem WebGL bleibt die Trainingsanzeige bedienbar. */ });
    }
    if (this.three?.status === "ready") {
      const size = `${frame.v.cw},${frame.v.ch},${frame.mode},${frame.studioRoom?.id},${frame.room}`;
      if (!frame.v.cw || !frame.v.ch || (frame.now < this.nextFrame && size === this.lastSize)) return true;
      this.lastSize = size;
      const started = performance.now();
      try {
        if (this.three.draw(ctx, frame)) {
          const finished = performance.now();
          const cost = finished - started;
          // Langsame Grafiktreiber lassen der Pose-Erkennung Takte zum Weiterarbeiten.
          this.nextFrame = Math.max(frame.now + 31, finished + Math.min(92, cost * 0.55));
          return true;
        }
      } catch (error) {
        console.warn("Arena: 3D-Zeichnen fehlgeschlagen – 2D-Ersatzszene", error);
        this.three.dispose();
        this.three = null;
      }
    }
    if (this.three?.status === "unavailable") {
      this.three.dispose();
      this.three = null;
      delete ctx.canvas.dataset.arenaRenderer;
      delete ctx.canvas.dataset.arenaPose;
    }
    if (frame.mode && frame.mode !== "arena") return false;
    if (this.scene) {
      this.scene.draw(ctx, frame);
      return true;
    }
    if (!this.requested) {
      this.requested = true;
      void import("./arena-scene").then(
        ({ ArenaScene }) => { this.scene = new ArenaScene(); },
        () => { /* Die bestehende Hologramm-Ansicht hält das Training auch offline bedienbar. */ },
      );
    }
    return false;
  }

  leave(canvas: HTMLCanvasElement): void {
    if (!this.active) return;
    this.active = false;
    this.threeGeneration++;
    this.three?.dispose();
    this.three = null;
    this.nextFrame = 0;
    this.scene?.reset();
    delete canvas.dataset.arena;
    delete canvas.dataset.arenaRenderer;
    delete canvas.dataset.arenaPose;
    delete canvas.dataset.arenaLight;
    delete canvas.dataset.liveVisual;
    delete canvas.dataset.studioRoom;
    delete canvas.dataset.studioArtwork;
  }
}

/** Höchstens rund 1,25 Megapixel und 1,5-fache Pixeldichte für die Arena-Leinwand. */
export function arenaDpr(w: number, h: number, dpr: number): number {
  return Math.min(1.5, dpr, Math.sqrt(1_250_000 / Math.max(1, w * h)));
}
