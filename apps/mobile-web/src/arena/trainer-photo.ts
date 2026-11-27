import * as THREE from "three";

/** Begleitdatei der gerenderten Bildfolge (tools/figuren/pack_frames.py). */
interface PhotoMeta {
  frames: number[];
  size: [number, number];
  feetY: number;
  standPx: number;
  anchorX: number;
}

/**
 * Trainer in Fotoqualität: vorab mit Cycles gerenderte Kniebeuge (Bild je Tiefe 0–100 %), als Bildtafel an die
 * Stelle des 3D-Trainers gestellt. Das Bild zur aktuellen Tiefe wird gezeigt – synchron zu Anleitung und Demo.
 * Maßstab: Standhöhe im Bild = Körperhöhe der 3D-Figur; Fußlinie und Fußmitte liegen auf dem Bodenpunkt.
 */
export class TrainerPhoto {
  readonly mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  private textures: THREE.Texture[] = [];
  private meta: PhotoMeta | null = null;
  private loaded = 0;
  private disposed = false;

  constructor(base: string) {
    this.mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ transparent: true, alphaTest: 0.02, toneMapped: false, depthWrite: false }),
    );
    this.mesh.visible = false;
    this.mesh.renderOrder = 4;
    void fetch(`${base}meta.json`).then((r) => {
      if (!r.ok) throw new Error(`Trainer-Bilder fehlen (${r.status})`);
      return r.json() as Promise<PhotoMeta>;
    }).then((meta) => {
      if (this.disposed) return;
      this.meta = meta;
      const loader = new THREE.TextureLoader();
      this.textures = meta.frames.map((f) => loader.load(`${base}squat_${String(f).padStart(3, "0")}.webp`, () => { this.loaded++; }));
      for (const t of this.textures) {
        t.colorSpace = THREE.SRGBColorSpace;
        t.anisotropy = 4;
      }
      // Tafel so verschieben, dass die Fußmitte im Ursprung steht (Ursprung = Bodenpunkt des Trainers)
      const [w, h] = meta.size;
      // Bild-y zählt von oben: Fußlinie liegt in Tafelkoordinaten bei 0,5 − feetY/h → um das Gegenteil verschieben
      this.mesh.geometry.translate(0.5 - meta.anchorX / w, meta.feetY / h - 0.5, 0);
    }).catch((error: unknown) => console.warn("Arena: Trainer-Bilder nicht ladbar – 3D-Trainer bleibt", error));
  }

  /** Bereit, sobald alle Bilder geladen sind (vorher bleibt der 3D-Trainer sichtbar). */
  get ready(): boolean {
    return !!this.meta && this.loaded === this.textures.length && this.textures.length > 0;
  }

  /**
   * Bild zur Tiefe zeigen und aufstellen. `ground` = Bodenpunkt des Trainers, `standHeight` = Körperhöhe (m),
   * `light` = Raumfarbe für eine leichte Anpassung an andere Räume als das Core Studio.
   */
  update(flex: number, ground: THREE.Vector3, standHeight: number, camera: THREE.Camera, light?: THREE.Color): void {
    if (!this.ready || !this.meta) return;
    const { frames, size, standPx } = this.meta;
    const target = Math.max(0, Math.min(100, flex));
    let best = 0;
    for (let i = 1; i < frames.length; i++) if (Math.abs(frames[i]! - target) < Math.abs(frames[best]! - target)) best = i;
    const material = this.mesh.material;
    if (material.map !== this.textures[best]) {
      material.map = this.textures[best]!;
      material.needsUpdate = true;
    }
    const metres = standHeight / standPx;
    this.mesh.scale.set(size[0] * metres, size[1] * metres, 1);
    this.mesh.position.copy(ground);
    // zur Kamera drehen (nur um die Hochachse – die Figur bleibt aufrecht)
    this.mesh.rotation.set(0, Math.atan2(camera.position.x - ground.x, camera.position.z - ground.z), 0);
    material.color.set(0xffffff);
    if (light) material.color.lerp(light, 0.12);
    this.mesh.visible = true;
  }

  hide(): void {
    this.mesh.visible = false;
  }

  dispose(): void {
    this.disposed = true;
    this.textures.forEach((t) => t.dispose());
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}
