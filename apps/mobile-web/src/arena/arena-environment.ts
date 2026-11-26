import { Color, EquirectangularReflectionMapping, type Scene, type Texture } from "three";
import { HDRLoader } from "three/addons/loaders/HDRLoader.js";
import { GroundedSkybox } from "three/addons/objects/GroundedSkybox.js";
import type { ArenaRoom } from "./rooms";

type LightRoom = ArenaRoom | "core-studio";

/** Liefert lokales HDR-Licht für beide Räume und projiziert Lebombos Foto bis zum Boden. */
export class ArenaEnvironment {
  private readonly maps = new Map<LightRoom, Texture | null>();
  private readonly background = new Color("#283742");
  private sky: GroundedSkybox | null = null;
  private disposed = false;

  constructor(private readonly scene: Scene) {}

  get coreLightReady(): boolean { return !!this.maps.get("core-studio"); }

  private load(room: LightRoom): void {
    if (!this.maps.has(room)) {
      this.maps.set(room, null);
      const file = room === "core-studio" ? "concepts/core-studio-light.hdr" : `${room}.hdr`;
      void new HDRLoader().loadAsync(`${import.meta.env.BASE_URL}arena/${file}`).then((map) => {
        if (this.disposed) {
          map.dispose();
          return;
        }
        map.mapping = EquirectangularReflectionMapping;
        this.maps.set(room, map);
        if (room === "lebombo") {
          this.sky = new GroundedSkybox(map, 1.5, 70, 48);
          this.sky.position.set(0.1, 1.5, 4.1);
          this.sky.rotation.y = -Math.PI / 180;
          this.sky.renderOrder = -100;
          this.sky.visible = false;
          this.scene.add(this.sky);
        }
      }).catch(() => {
        if (!this.disposed && room === "core-studio") this.load("loft");
      });
    }
  }

  select(room: ArenaRoom, studioRoom?: string): boolean {
    const profile = room === "loft" && studioRoom === "core-studio" ? "core-studio" : room;
    this.load(profile);
    const core = profile === "core-studio" && this.coreLightReady;
    this.scene.environment = this.maps.get(profile) ?? this.maps.get(room) ?? null;
    this.scene.environmentIntensity = core ? 0.98 : room === "loft" ? 0.22 : 0.43;
    this.scene.environmentRotation.y = core ? 0 : room === "loft" ? Math.PI * 0.82 : -Math.PI / 180;
    this.scene.background = this.background;
    if (this.sky) this.sky.visible = room === "lebombo";
    return room === "loft" || !!this.sky;
  }

  dispose(): void {
    this.disposed = true;
    this.sky?.geometry.dispose();
    this.sky?.material.dispose();
    this.maps.forEach((map) => map?.dispose());
    this.maps.clear();
  }
}
