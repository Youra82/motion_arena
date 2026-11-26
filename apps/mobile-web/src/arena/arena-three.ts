import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { clone } from "three/addons/utils/SkeletonUtils.js";
import type { Reflector } from "three/addons/objects/Reflector.js";
import { angleDeg, clamp, toSquare } from "@motion-arena/pose-engine";
import { LM, type Landmark } from "@motion-arena/shared";
import { drawHologram, drawSkeleton, fillBodyShape, reducedMotion, usablePose, type Fit } from "../render/draw";
import { ArenaEnvironment } from "./arena-environment";
import { BodyMaterial } from "./body-material";
import { compositeArena } from "./composite-arena";
import type { ArenaFrame } from "./arena-scene";
import { GUIDE_CYCLE_MS, squatFlex } from "./metrics";
import { studioLoft } from "./studio-loft";
import { addTrainerContours, poseTrainerContours } from "./trainer-anatomy";
import { JOINTS, TrainerRig } from "./trainer-rig";
import { trainerFootwear } from "./trainer-footwear";
import { attachTrainerHair, trainerHair } from "./trainer-hair";
import { makeTrainerMaterial } from "./trainer-material";
import { ROOM_GROUND, ROOM_PLATFORM, backdropZoom, roomBackdrop } from "../render/concept-art";

const asset = (name: string) => `${import.meta.env.BASE_URL}arena/${name}`;
const JOINT_COLOR = new THREE.Color(0.34, 2.6, 2.34);

/** Kleine Detailteile der Mehrteil-Figur (nur in der Avatar-Ansicht sichtbar). */
const DETAIL_PART = /eye|lash|brow|hair|teeth|tongue/i;
function isDetailPart(mesh: THREE.Mesh, sources?: THREE.SkinnedMesh[]): boolean {
  const material = (sources?.find((part) => part.name === mesh.name) ?? mesh).material;
  const name = Array.isArray(material) ? material[0]?.name ?? "" : material.name;
  return DETAIL_PART.test(name) || DETAIL_PART.test(mesh.name);
}

/** Materialien der generierten Figur ans Studiolicht anpassen (Haut weich, Stoff matt, Haare mit Alphatest). */
function tuneFigureMaterial(material: THREE.MeshStandardMaterial): void {
  material.envMapIntensity = 0.85;
  if (/skin/i.test(material.name)) {
    material.roughness = Math.max(material.roughness, 0.55);
    material.metalness = 0;
  } else if (/hair|lash|brow/i.test(material.name)) {
    material.alphaTest = Math.max(material.alphaTest, 0.35);
    material.transparent = false;
    material.depthWrite = true;
    material.side = THREE.DoubleSide;
  } else if (/eye/i.test(material.name)) {
    material.roughness = 0.15;
  } else {
    material.roughness = Math.max(material.roughness, 0.7);
    material.metalness = 0;
  }
  material.needsUpdate = true;
}

function hologram(opacity: number, acid = false): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({ color: "#117575", emissive: "#034647", emissiveIntensity: 0.65,
    roughness: 0.31, transparent: true, opacity, depthWrite: opacity > 0.5 });
  material.customProgramCacheKey = () => acid ? "arena-green" : "arena-blue";
  material.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace("#include <opaque_fragment>", `
      float edge = pow(1.0 - abs(dot(normalize(normal), normalize(vViewPosition))), 2.7);
      float line = 0.72 + 0.28 * sin(gl_FragCoord.y * 2.06);
      outgoingLight = outgoingLight * .53 + ${acid ? "vec3(.085,.19,.014)" : "vec3(.014,.10,.22)"} * line + ${acid ? "vec3(.53,1.96,.055)" : "vec3(.10,1.02,1.94)"} * edge;
      diffuseColor.a *= .74 + edge * .26;
      #include <opaque_fragment>
    `);
  };
  return material;
}

function studioLight(scene: THREE.Scene) {
  const ambient = new THREE.HemisphereLight("#e7efff", "#695344", 1.05);
  const sun = new THREE.DirectionalLight("#ffe1c8", 2.85);
  sun.position.set(-3.9, 3.5, 1.9);
  const fill = new THREE.DirectionalLight("#c1d9ff", 0.85);
  fill.position.set(2.8, 2, 4.2);
  const edge = new THREE.DirectionalLight("#ffb66c", 1.9);
  edge.position.set(3.5, 3, -3.8);
  const glow = new THREE.PointLight("#ff943d", 13, 6, 1.55);
  glow.position.set(1.85, 0.82, -4.45);
  scene.add(ambient, sun, fill, edge, glow);
  return { ambient, sun, fill, edge, glow };
}

function runwayGlow(color: THREE.ColorRepresentation, opacity: number): THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial> {
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { tint: { value: new THREE.Color(color) }, alpha: { value: opacity } },
    vertexShader: "varying vec2 glowUV; void main() { glowUV = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }",
    fragmentShader: `varying vec2 glowUV; uniform vec3 tint; uniform float alpha;
      void main() {
        float d = length(glowUV - .5) * 2.;
        gl_FragColor = vec4(tint, alpha * (1. - smoothstep(.13,1.,d)) * exp(-2.4*d));
        #include <colorspace_fragment>
      }`,
  }));
  mesh.rotation.x = -Math.PI / 2;
  return mesh;
}

function precisionRing(): { group: THREE.Group; ticks: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>[] } {
  const group = new THREE.Group();
  const halo = runwayGlow("#00e8de", 0.53);
  halo.scale.set(2.7, 2.4, 1);
  halo.position.y = -0.003;
  group.add(halo);
  for (const [radius, opacity] of [[0.66, 0.46], [0.79, 0.55], [0.90, 0.32], [0.94, 0.19]] as const) {
    const mesh = new THREE.Mesh(new THREE.RingGeometry(radius - 0.005, radius, 96),
      new THREE.MeshBasicMaterial({ color: "#91f9ee", transparent: true, opacity, depthWrite: false }));
    mesh.rotation.x = -Math.PI / 2;
    group.add(mesh);
  }
  const ticks = Array.from({ length: 16 }, (_, index) => {
    const rotation = index * Math.PI / 8 - 1.66;
    const tick = new THREE.Mesh(new THREE.RingGeometry(0.733, 0.76, 9, 1, rotation, Math.PI / 8 - 0.05), new THREE.MeshBasicMaterial({ color: "#d1fff6", transparent: true, opacity: 0.3, depthWrite: false }));
    tick.rotation.x = -Math.PI / 2;
    tick.position.y = 0.002;
    group.add(tick);
    return tick;
  });
  group.position.y = 0.011;
  return { group, ticks };
}

function flexFrom(frame: ArenaFrame): number | null {
  if (!frame.pose) return null;
  if (frame.kneeAngle != null && Number.isFinite(frame.kneeAngle)) return clamp(180 - frame.kneeAngle, 0, 110);
  const aspect = frame.v.sw / frame.v.sh;
  const points = frame.pose;
  const toScene = (p: Landmark) => ({ ...toSquare(p, aspect), z: p.z * (frame.demo ? 1 : aspect) });
  const indices = [[LM.LEFT_HIP, LM.LEFT_KNEE, LM.LEFT_ANKLE], [LM.RIGHT_HIP, LM.RIGHT_KNEE, LM.RIGHT_ANKLE]] as const;
  const angles = indices.flatMap(([a, b, c]) => {
    if (![points[a], points[b], points[c]].every((p) => p && p.visibility >= 0.5 && Number.isFinite(p.z))) return [];
    const angle = angleDeg(toScene(points[a]!), toScene(points[b]!), toScene(points[c]!), true);
    return angle === null ? [] : [angle];
  });
  return angles.length ? clamp(180 - angles.reduce((sum, angle) => sum + angle, 0) / angles.length, 0, 110) : null;
}

export class ArenaThree {
  status: "loading" | "ready" | "unavailable" = "loading";
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly environment = new ArenaEnvironment(this.scene);
  private readonly lights = studioLight(this.scene);
  private readonly camera = new THREE.PerspectiveCamera(39, 1, 0.05, 150);
  private readonly loft = new THREE.Group();
  private readonly floor: Reflector;
  private readonly ring = precisionRing();
  private readonly shadow = runwayGlow("#090b10", 1);
  private readonly footShadows = Array.from({ length: 4 }, () => runwayGlow("#151007", 0.91));
  private readonly roomBounce = new THREE.DirectionalLight("#ffc27a", 0.74);
  private readonly screen = new THREE.Vector3();
  private readonly dots: THREE.InstancedMesh;
  private readonly dotMatrix = new THREE.Matrix4();
  private readonly analysisMaterial = new BodyMaterial();
  private readonly green = hologram(0.83, true);
  private readonly plates = new Map<number, THREE.Texture | null>();
  private readonly abort = new AbortController();
  private alternateBackdrop: THREE.Texture | null = null;
  private alternateRequested = false;
  private trainer: TrainerRig | null = null;
  private player: TrainerRig | null = null;
  private playerMesh: THREE.SkinnedMesh | null = null;
  private trainerMesh: THREE.SkinnedMesh | null = null;
  private playerHologram: THREE.Material | null = null;
  private playerKit: THREE.Material | null = null;
  private playerHair: THREE.Mesh | null = null;
  private playerShoes: THREE.Group[] = [];
  /** Mehrteil-Figur (Ara/MakeHuman): Spieler-Teile mit ihrem eigenen Material für die Avatar-Ansicht. */
  private playerParts: Array<{ mesh: THREE.SkinnedMesh; kit: THREE.Material; detail: boolean }> = [];
  private ghosts: TrainerRig[] = [];
  private trail: Array<{ at: number; flex: number; joints: Landmark[] | null; metric: boolean }> = [];
  private nextTrailAt = 0;
  private cameraHeight = 0;
  private cameraTrail: Array<{ at: number; pose: Landmark[]; fit: Fit }> = [];
  private nextCameraSample = 0;

  constructor(canvas: HTMLCanvasElement, context: WebGL2RenderingContext) {
    this.renderer = new THREE.WebGLRenderer({ canvas, context, alpha: false, antialias: true });
    this.renderer.domElement.addEventListener("webglcontextlost", () => { this.status = "unavailable"; }, { signal: this.abort.signal });
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.camera.layers.enable(1);
    this.floor = studioLoft(this.loft);
    this.scene.add(this.loft, this.floor, this.ring.group, this.shadow, ...this.footShadows);
    this.shadow.scale.set(1.54, 0.94, 1);
    this.shadow.position.y = 0.008;
    this.footShadows.forEach((shadow) => { shadow.scale.set(0.34, 0.58, 1); });
    this.roomBounce.position.set(-2, 1.6, -1);
    this.scene.add(this.roomBounce);
    this.dots = new THREE.InstancedMesh(new THREE.SphereGeometry(0.018, 8, 6), new THREE.MeshBasicMaterial({ color: JOINT_COLOR, toneMapped: false }), JOINTS.length);
    this.dots.frustumCulled = false;
    this.scene.add(this.dots);
    const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).register((parser) => {
      // Embedded textures are local blob images. Use the image policy instead of a fetch.
      parser.textureLoader = new THREE.TextureLoader(loader.manager);
      return { name: "MotionArenaImageLoader" };
    });
    void fetch(asset("trainer.glb"), { signal: this.abort.signal }).then((response) => {
      if (!response.ok) throw new Error(`Trainer konnte nicht geladen werden (${response.status})`);
      return response.arrayBuffer();
    }).then((bytes) => loader.parseAsync(bytes, asset(""))).then(({ scene }) => {
      if (this.abort.signal.aborted) {
        this.disposeObjects(scene);
        return;
      }
      this.trainer = new TrainerRig(scene);
      this.trainer.root.rotation.y = 0.42;
      const parts: THREE.SkinnedMesh[] = [];
      scene.traverse((node) => { if (node instanceof THREE.SkinnedMesh) parts.push(node); });
      if (parts.length > 1) {
        // Figur aus dem Menschengenerator: Haut, Augen, Haare, Kleidung und Schuhe sind eigene Teile mit
        // eigenem Material – keine nachträglichen Haare/Schuhe/Konturen nötig.
        parts.forEach((part) => {
          part.frustumCulled = false;
          tuneFigureMaterial(part.material as THREE.MeshStandardMaterial);
        });
        this.player = this.makeHologram(scene, 0.92);
        this.player.root.traverse((node) => {
          if (node instanceof THREE.SkinnedMesh) {
            const source = parts.find((part) => part.name === node.name) ?? parts[0]!;
            this.playerParts.push({ mesh: node, kit: source.material as THREE.Material, detail: isDetailPart(source) });
            this.playerHologram = node.material as THREE.Material;
          }
        });
        this.ghosts = [this.makeHologram(scene, 0.29), this.makeHologram(scene, 0.17), this.makeHologram(scene, 0.10)];
        for (const ghost of this.ghosts) ghost.root.traverse((node) => { if (node instanceof THREE.SkinnedMesh && isDetailPart(node, parts)) node.visible = false; });
        this.scene.add(this.trainer.root);
        this.status = "ready";
        return;
      }
      scene.traverse((node) => {
        if (node instanceof THREE.SkinnedMesh) {
          node.frustumCulled = false;
          const source = node.material as THREE.MeshStandardMaterial;
          const m = makeTrainerMaterial(source);
          node.material = m;
          source.dispose();
          addTrainerContours(node);
          this.trainerMesh = node;
          this.playerKit = m;
        }
      });
      this.player = this.makeHologram(scene, 0.92);
      this.player.root.traverse((node) => {
        if (node instanceof THREE.SkinnedMesh && !Array.isArray(node.material)) {
          this.playerMesh = node;
          this.playerHologram = node.material;
        }
      });
      this.ghosts = [this.makeHologram(scene, 0.29), this.makeHologram(scene, 0.17), this.makeHologram(scene, 0.10)];
      if (this.trainerMesh && this.playerKit instanceof THREE.MeshStandardMaterial && this.playerKit.map) {
        const hair = trainerHair(this.trainerMesh, this.playerKit.map);
        if (hair) {
          this.playerHair = hair.clone();
          attachTrainerHair(this.trainer.root, hair);
          attachTrainerHair(this.player.root, this.playerHair);
        }
      }
      trainerFootwear(this.trainer.root);
      this.playerShoes = trainerFootwear(this.player.root);
      this.scene.add(this.trainer.root);
      this.status = "ready";
    }).catch((error: unknown) => {
      if (!this.abort.signal.aborted) console.warn("Arena: Trainer nicht ladbar – 2D-Ersatzszene", error);
      this.status = "unavailable";
    });
  }

  private makeHologram(source: THREE.Group, opacity: number): TrainerRig {
    const body = clone(source);
    const material = hologram(opacity);
    body.traverse((node) => {
      if (node instanceof THREE.SkinnedMesh) {
        node.material = material;
        node.frustumCulled = false;
        node.renderOrder = opacity > 0.5 ? 7 : 3;
        if (opacity < 0.5) node.layers.set(1);
      }
    });
    const rig = new TrainerRig(body);
    rig.root.rotation.y = 0.42;
    this.scene.add(rig.root);
    return rig;
  }

  /** Bodenpunkt (y = 0) unter einem Bildpunkt; null, wenn der Sichtstrahl den Boden nicht trifft. */
  private onFloor(x: number, y: number): THREE.Vector3 | null {
    const ray = this.screen.set(x * 2 - 1, 1 - 2 * y, 0).unproject(this.camera).sub(this.camera.position);
    if (ray.y >= -1e-4) return null;
    return ray.multiplyScalar(-this.camera.position.y / ray.y).add(this.camera.position).clone();
  }

  /** Verschiebung der Standhöhe gegenüber dem Core Studio für das aktuelle Raumbild (Bildschirmanteil). */
  private groundShift(frame: ArenaFrame): { player: number; trainer: number } {
    const number = frame.room === "loft" ? frame.studioRoom?.nr : undefined;
    const plate = number !== undefined ? this.plates.get(number) : null;
    const g = number !== undefined ? ROOM_GROUND[number] : undefined;
    const core = ROOM_GROUND[1]!;
    if (!g || !plate || this.scene.background !== plate) return { player: 0, trainer: 0 };
    // Bildkoordinate → Bildschirm: der Hintergrund ist mittig zugeschnitten (repeat/offset)
    const r = plate.repeat.y || 1;
    // sichtbarer Bildbereich (von oben): [1 - offset.y - r, 1 - offset.y]
    const top = 1 - plate.offset.y - r;
    const toScreen = (v: number) => (v - top) / r;
    return { player: toScreen(g.player) - toScreen(core.player), trainer: toScreen(g.trainer) - toScreen(core.trainer) };
  }

  private place(x: number, y: number, atZ: number): THREE.Vector3 {
    const ray = this.screen.set(x * 2 - 1, 1 - 2 * y, 0).unproject(this.camera).sub(this.camera.position);
    return ray.multiplyScalar((atZ - this.camera.position.z) / ray.z).add(this.camera.position);
  }

  private useRoom(frame: ArenaFrame): void {
    const ready = this.environment.select(frame.room, frame.studioRoom?.id);
    const useCoreLight = frame.room === "loft" && frame.studioRoom?.id === "core-studio" && this.environment.coreLightReady;
    const { ambient, sun, fill, edge, glow } = this.lights;
    ambient.intensity = useCoreLight ? 0.46 : 1.05;
    sun.color.set(useCoreLight ? "#f0f3fe" : "#ffe1c8");
    sun.intensity = useCoreLight ? 1.28 : 2.85;
    fill.intensity = useCoreLight ? 0.51 : 0.85;
    edge.intensity = useCoreLight ? 1.34 : 1.9;
    glow.intensity = useCoreLight ? 6 : 13;
    this.roomBounce.intensity = useCoreLight ? 0.15 : 0.74;
    this.roomBounce.color.set(frame.studioRoom?.light ?? "#ffc27a");
    this.floor.visible = true;
    const number = frame.room === "loft" ? frame.studioRoom?.nr : undefined;
    if (number !== undefined) {
      if (!this.plates.has(number)) {
        this.plates.set(number, null);
        void new THREE.TextureLoader().loadAsync(roomBackdrop(number)).then((plate) => {
          if (this.abort.signal.aborted) { plate.dispose(); return; }
          plate.colorSpace = THREE.SRGBColorSpace;
          this.plates.set(number, plate);
        }).catch(() => { /* Das beleuchtete 3D-Loft bleibt bei fehlendem Motiv spielbar. */ });
      }
      const plate = this.plates.get(number);
      if (plate && plate.image instanceof HTMLImageElement) {
        const imageAspect = plate.image.width / plate.image.height;
        const zoom = backdropZoom(number);
        plate.repeat.set(Math.min(1, this.camera.aspect / imageAspect) / zoom, Math.min(1, imageAspect / this.camera.aspect) / zoom);
        // Bei Vergrößerung unten verankern (Boden rückt nach oben), sonst mittig zuschneiden
        plate.offset.set((1 - plate.repeat.x) / 2, zoom > 1 ? 0 : (1 - plate.repeat.y) / 2);
        this.scene.background = plate;
        this.loft.visible = false;
        this.floor.visible = ROOM_PLATFORM.has(number);
        return;
      }
    }
    this.loft.visible = frame.room === "loft" || (!ready && !this.alternateBackdrop);
    if (ready) {
      return;
    }
    if (!this.alternateRequested) {
      this.alternateRequested = true;
      void new THREE.TextureLoader().loadAsync(asset("lebombo.jpg")).then((texture) => {
        if (this.abort.signal.aborted) { texture.dispose(); return; }
        texture.colorSpace = THREE.SRGBColorSpace;
        this.alternateBackdrop = texture;
      }).catch(() => { /* Das Studio bleibt verfügbar, wenn die Raumdatei fehlt. */ });
    }
    if (this.alternateBackdrop) this.scene.background = this.alternateBackdrop;
  }

  draw(ctx: CanvasRenderingContext2D, frame: ArenaFrame): boolean {
    if (this.status !== "ready" || !this.trainer || !this.player) return false;
    const { cw: w, ch: h } = frame.v;
    const compact = w < h * 1.1;
    const solo = !!frame.mode && frame.mode !== "arena";
    const soloAvatar = frame.mode === "avatar";
    const guidedAvatar = soloAvatar && frame.demo;
    // Standhöhe je Raumbild: um den Abstand zum Core Studio verschieben (dessen Feinabstimmung bleibt erhalten)
    const ground = this.groundShift(frame);
    const playerX = solo ? 0.50 : compact ? 0.28 : 0.392;
    const playerY = Math.min(0.95, (solo ? (compact ? 0.73 : 0.82) : compact ? 0.66 : 0.714) + ground.player);
    const trainerX = compact ? 0.72 : 0.679;
    const trainerY = Math.min(0.93, (compact ? 0.64 : 0.662) + ground.trainer);
    const pixelBudget = compact ? 420_000 : frame.studioRoom ? 1_120_000 : 650_000;
    const pxScale = Math.min(1, Math.sqrt(pixelBudget / (w * h)));
    const bufferW = Math.max(1, Math.round(w * pxScale));
    const bufferH = Math.max(1, Math.round(h * pxScale));
    if (this.renderer.domElement.width !== bufferW || this.renderer.domElement.height !== bufferH) this.renderer.setSize(bufferW, bufferH, false);
    this.camera.aspect = w / h;
    this.camera.fov = compact ? 2 * THREE.MathUtils.radToDeg(Math.atan(Math.tan(THREE.MathUtils.degToRad(21)) / this.camera.aspect)) : 42;
    this.camera.position.set(0.10, 1.63, 4.6);
    this.camera.lookAt(0.0, 1.15, -1.4);
    this.camera.updateProjectionMatrix();
    this.camera.updateMatrixWorld();

    const baseDepth = compact ? -0.48 : soloAvatar ? 1.36 : solo ? 0.45 : 0.05;
    const playerPoint = this.place(playerX, playerY, baseDepth).clone();
    const trainerPoint = this.place(trainerX, trainerY, baseDepth - 0.45).clone();
    this.camera.position.y -= playerPoint.y;
    this.camera.updateMatrixWorld();
    // Trainer genau dort auf den Boden stellen, wo sein Sichtstrahl den Boden trifft (Füße = Bodenlinie im Raumbild)
    const trainerFloor = this.onFloor(trainerX, trainerY);
    const trainerZ = trainerFloor && trainerFloor.z < baseDepth - 0.15 && trainerFloor.z > baseDepth - 3 ? trainerFloor.z : baseDepth - 0.45;
    const trainerXWorld = trainerFloor && trainerZ === trainerFloor.z ? trainerFloor.x : trainerPoint.x;
    this.player.root.position.set(playerPoint.x, 0, baseDepth);
    this.player.root.rotation.y = guidedAvatar ? 0.56 : solo ? 0 : 0.42;
    this.trainer.root.position.set(trainerXWorld, 0, trainerZ);
    this.shadow.position.set(solo ? playerPoint.x : trainerXWorld, 0.009, solo ? baseDepth : trainerZ);
    this.shadow.material.uniforms.alpha!.value = soloAvatar ? 0.64 : 1;
    this.ring.group.visible = !soloAvatar;
    this.ring.group.position.set(playerPoint.x, 0.011, baseDepth);
    this.ring.ticks.forEach((tick, i) => {
      const lit = frame.precision !== null && i < Math.ceil(frame.precision * 0.16);
      tick.material.opacity = lit ? 1 : 0.40;
      const left = Math.cos(i * Math.PI / 8 - 1.48) < 0;
      tick.material.color.set(lit ? (left ? "#8affeb" : "#ff9449") : "#a5f1e6");
      tick.material.toneMapped = !lit;
    });

    const flex = flexFrom(frame);
    const filmed = !solo && !frame.demo && !!frame.pose && !!frame.mask;
    const calm = reducedMotion();
    this.trainer.root.visible = !solo;
    const guideFlex = frame.demo ? flex ?? 0 : squatFlex((frame.activeMs % GUIDE_CYCLE_MS) / GUIDE_CYCLE_MS, 94);
    if (!solo) {
      this.trainer.pose(guideFlex);
      poseTrainerContours(this.trainerMesh, guideFlex, true);
    }
    const analytic = frame.mode === "muskel" || frame.mode === "zonen" || frame.mode === "gitter";
    if (analytic) this.analysisMaterial.update(frame);
    if (this.playerMesh && this.playerHologram && this.playerKit) {
      this.playerMesh.material = analytic ? this.analysisMaterial : frame.mode === "avatar" ? this.playerKit : frame.mode === "skelett" ? this.green : this.playerHologram;
    }
    if (this.playerParts.length && this.playerHologram) {
      const avatar = frame.mode === "avatar";
      for (const part of this.playerParts) {
        part.mesh.material = analytic ? this.analysisMaterial : avatar ? part.kit : frame.mode === "skelett" ? this.green : this.playerHologram;
        // Augen, Wimpern, Brauen, Haare nur in der Avatar-Ansicht – im Hologramm/Analysebild stören sie
        part.mesh.visible = avatar || !part.detail;
      }
    }
    this.playerShoes.forEach((shoe) => { shoe.visible = soloAvatar; });
    if (this.playerHair) this.playerHair.visible = soloAvatar;
    poseTrainerContours(this.playerMesh, flex ?? 0, soloAvatar || frame.mode === "muskel");
    const joints = frame.worldPose ?? frame.pose;
    const aspect = frame.v.sw / frame.v.sh;
    const sourcePose = (solo && !guidedAvatar) || (!frame.demo && !filmed);
    if (sourcePose) this.player.root.rotation.y = 0;
    const follows = sourcePose && !!joints && this.player.follow(joints, aspect, !!frame.worldPose, frame.demo);
    this.player.root.visible = sourcePose ? follows : flex !== null && !filmed;
    this.dots.visible = this.player.root.visible && (!solo || frame.mode === "skelett");
    if (!sourcePose && flex !== null && !filmed) this.player.pose(flex);
    this.updateFootShadows(this.trainer, 0, this.trainer.root.visible);
    this.updateFootShadows(this.player, 2, soloAvatar && this.player.root.visible);
    if (this.dots.visible) {
      JOINTS.forEach((name, i) => {
        const joint = this.player!.joint(name, this.screen);
        this.dots.setMatrixAt(i, this.dotMatrix.makeTranslation(joint.x, joint.y, joint.z + 0.065));
      });
      this.dots.instanceMatrix.needsUpdate = true;
    }
    if ((!frame.running && !solo) || calm || flex === null || filmed || (solo && frame.mode !== "spur")) this.trail = [];
    else if (frame.now > this.nextTrailAt) {
      this.nextTrailAt = frame.now + 108;
      this.trail.unshift({ at: frame.now, flex, joints: sourcePose ? joints : null, metric: !!frame.worldPose });
      this.trail = this.trail.slice(0, this.ghosts.length);
    }
    this.ghosts.forEach((ghost, i) => {
      const sample = this.trail[i];
      ghost.root.visible = !!sample && frame.now - sample.at < 420;
      if (!sample) return;
      ghost.root.position.set(playerPoint.x - (i + 1) * 0.146, 0, baseDepth - (i + 1) * 0.12);
      ghost.root.rotation.y = this.player!.root.rotation.y;
      if (sample.joints) ghost.follow(sample.joints, aspect, sample.metric, frame.demo);
      else ghost.pose(sample.flex);
    });
    this.useRoom(frame);
    this.renderer.render(this.scene, this.camera);
    compositeArena(ctx, this.renderer.domElement, frame.capture ?? false);
    if (frame.mode === "skelett" && this.player.root.visible) this.drawRigSkeleton(ctx, this.player, w, h);
    if (filmed) this.drawCameraPlayer(ctx, frame, playerX * w, playerY * h, Math.min(h * (compact ? 0.34 : 0.57), w * 0.66), calm);
    else this.cameraTrail = [];
    ctx.canvas.dataset.arena = frame.room;
    ctx.canvas.dataset.arenaLight = frame.room === "loft" && frame.studioRoom?.id === "core-studio" && this.environment.coreLightReady ? "core-hdr" : "studio";
    if (frame.studioRoom) ctx.canvas.dataset.studioRoom = frame.studioRoom.id;
    const shownArtwork = frame.studioRoom && frame.room === "loft" && this.plates.get(frame.studioRoom.nr) === this.scene.background;
    if (shownArtwork) ctx.canvas.dataset.studioArtwork = frame.studioRoom!.id;
    else delete ctx.canvas.dataset.studioArtwork;
    ctx.canvas.dataset.liveVisual = frame.mode ?? "arena";
    ctx.canvas.dataset.arenaRenderer = "3d";
    ctx.canvas.dataset.arenaPose = flex === null ? "missing" : flex >= 72 ? "deep" : "upright";
    return true;
  }

  private updateFootShadows(rig: TrainerRig, offset: number, visible: boolean): void {
    for (const [i, name] of (["LeftFoot", "RightFoot"] as const).entries()) {
      const shadow = this.footShadows[offset + i]!;
      shadow.visible = visible;
      if (visible) {
        const joint = rig.joint(name, this.screen);
        shadow.position.set(joint.x, 0.007, joint.z + 0.059);
        shadow.rotation.z = rig.root.rotation.y;
        shadow.material.uniforms.alpha!.value = 0.88 * (1 - THREE.MathUtils.smoothstep(joint.y, 0.14, 0.32));
      }
    }
  }

  private drawRigSkeleton(ctx: CanvasRenderingContext2D, rig: TrainerRig, width: number, height: number): void {
    const points = JOINTS.map((name) => {
      const p = rig.joint(name, this.screen).project(this.camera);
      return [(p.x + 1) * width * 0.5, (1 - p.y) * height * 0.5] as const;
    });
    const edges = [[0, 1], [0, 2], [2, 4], [1, 3], [3, 5], [0, 6], [1, 7], [6, 7], [6, 8], [8, 10], [7, 9], [9, 11]] as const;
    ctx.save();
    ctx.strokeStyle = "#c5ffb2";
    ctx.shadowColor = "#80ff38";
    ctx.shadowBlur = 10;
    ctx.lineWidth = Math.max(1.4, height * 0.0028);
    ctx.beginPath();
    for (const [a, b] of edges) {
      ctx.moveTo(...points[a]!);
      ctx.lineTo(...points[b]!);
    }
    ctx.stroke();
    ctx.restore();
  }

  private drawCameraPlayer(ctx: CanvasRenderingContext2D, frame: ArenaFrame, x: number, y: number, height: number, calm: boolean): void {
    const { v, mask } = frame;
    const aspect = v.sw / v.sh;
    const pose = usablePose(frame.pose, v, { ox: 0, oy: 0, dw: aspect * height, dh: height });
    if (!pose) return;
    const feet = [pose[LM.LEFT_ANKLE]!, pose[LM.RIGHT_ANKLE]!].filter((p) => p.visibility >= 0.5);
    if (!feet.length) return;
    const footX = feet.reduce((sum, p) => sum + (v.mirror ? 1 - p.x : p.x), 0) / feet.length;
    const footY = Math.max(...feet.map((p) => p.y));
    this.cameraHeight = Math.max(clamp(footY - pose[LM.NOSE]!.y + 0.065, 0.16, 1.1), this.cameraHeight * 0.998);
    const dh = height / this.cameraHeight;
    const dw = dh * aspect;
    const fit = { ox: x - footX * dw, oy: y - footY * dh, dw, dh };
    if (calm || !frame.running) this.cameraTrail = [];
    else {
      this.cameraTrail = this.cameraTrail.filter((sample) => frame.now - sample.at < 400);
      this.cameraTrail.forEach((sample, i) => {
        ctx.save();
        ctx.globalAlpha = (1 - (frame.now - sample.at) / 400) * 0.20;
        ctx.fillStyle = ctx.strokeStyle = "#60efdf";
        fillBodyShape(ctx, sample.pose, v, { ...sample.fit, ox: sample.fit.ox - height * 0.075 * (i + 1) });
        ctx.restore();
      });
      if (frame.now >= this.nextCameraSample) {
        this.nextCameraSample = frame.now + 115;
        this.cameraTrail = [{ at: frame.now, pose, fit }, ...this.cameraTrail].slice(0, 3);
      }
    }
    drawHologram(ctx, pose, mask, v, fit, frame.now, true);
    drawSkeleton(ctx, pose, v, fit, 0.77, Math.max(1.4, v.ch * 0.0023));
  }

  private disposeObjects(root: THREE.Object3D): void {
    const resources = new Set<{ dispose: () => void }>();
    root.traverse((node) => {
      if (!(node instanceof THREE.Mesh)) return;
      resources.add(node.geometry);
      if (node instanceof THREE.SkinnedMesh) resources.add(node.skeleton);
      for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
        resources.add(material);
        for (const value of Object.values(material)) if (value instanceof THREE.Texture) resources.add(value);
      }
    });
    resources.forEach((resource) => resource.dispose());
  }

  dispose(): void {
    this.abort.abort();
    this.renderer.domElement.remove();
    this.disposeObjects(this.scene);
    this.floor.dispose();
    this.alternateBackdrop?.dispose();
    for (const plate of this.plates.values()) plate?.dispose();
    this.analysisMaterial.dispose();
    this.green.dispose();
    this.playerHologram?.dispose();
    this.environment.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }
}
