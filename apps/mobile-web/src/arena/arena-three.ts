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
import { JumpTracker } from "./jump";
import { TrainerPhoto } from "./trainer-photo";

/** Trainer mit vorab gerenderter Kniebeuge in Fotoqualität (tools/figuren/render_squat.py + pack_frames.py). */
const TRAINER_PHOTOS: Record<string, string> = Object.fromEntries(
  ["lukas", "elena", "ken", "mia", "david", "aiko", "viktor", "nova", "matteo", "raven", "finn", "sara", "leo", "zara", "echo"]
    .map((id) => [id, `renders/${id}/`]),
);
import { attachTrainerHair, trainerHair } from "./trainer-hair";
import { makeTrainerMaterial, type TrainerLook } from "./trainer-material";
import { avatarById } from "../render/avatars";
import { ROOM_GROUND, ROOM_PLATFORM, backdropZoom, roomBackdrop } from "../render/concept-art";

const asset = (name: string) => `${import.meta.env.BASE_URL}arena/${name}`;
/** Trainer steht so weit (Meter) hinter dem Spieler – fast gleiche Tiefe, damit beide gleich groß wirken. */
const TRAINER_BEHIND = 0.25;
const JOINT_COLOR = new THREE.Color(0.34, 2.6, 2.34);

/**
 * Avatar → realistischer CC0-Körper (Grab3D). Männer nutzen den ausstaffierten Lukas-Körper, Frauen
 * „Woman Base Mesh“ (Sport-Top, Shorts, barfuß → Schuhe dazu) bzw. „Female Athlete“ (mit Sneakern).
 */
type FigureRole = "trainer" | "player";

/** Konzeptfarben eines Avatars für den Lukas-Körper (Lukas selbst behält seinen Original-Look). */
function lookOf(id: string): TrainerLook | undefined {
  if (id === "lukas") return undefined;
  const a = avatarById(id);
  return { shirt: a.topColor, shorts: a.bottomColor, accent: a.accent, skin: a.skin, hair: a.hair };
}
const WOMAN_BASE = new Set(["elena", "mia", "aiko", "raven", "sara", "nova"]);
const ATHLETE = new Set(["zara"]);
type BodyKind = "lukas" | "woman" | "athlete" | "rocketbox";
/** Microsoft-Rocketbox-Figuren (MIT-Lizenz), umgewandelt mit src/dev/rocketbox.ts. */
const ROCKETBOX: Record<string, string> = {
  // eigene Figuren aus der Figuren-Werkstatt (tools/figuren: Blender + MPFB, CC0/CC-BY-Assets)
  lukas: "bodies/mpfb/lukas.glb",
  finn: "bodies/rocketbox/sports-male-04.glb",
  sara: "bodies/rocketbox/sports-female-02.glb",
};
function figureBody(id: string): { file: string; kind: BodyKind; barefoot: boolean } {
  if (ROCKETBOX[id]) return { file: ROCKETBOX[id]!, kind: "rocketbox", barefoot: false };
  if (WOMAN_BASE.has(id)) return { file: "bodies/woman-base-character.glb", kind: "woman", barefoot: true };
  if (ATHLETE.has(id)) return { file: "bodies/female-athlete.glb", kind: "athlete", barefoot: false };
  return { file: "trainer.glb", kind: "lukas", barefoot: true };
}

/** Hautton der Original-Texturen (Bezug für die Umrechnung auf den Hautton des Avatars). */
const BODY_SKIN: Record<"woman" | "athlete", string> = { woman: "#e2b49a", athlete: "#7a4b36" };
const vec = (c: THREE.Color) => `vec3(${c.r.toFixed(4)},${c.g.toFixed(4)},${c.b.toFixed(4)})`;

/**
 * Oberschenkel des Woman-Base-Scans verschlanken (der Fotoscan hat sehr breite Oberschenkel und Hüften):
 * jeder Hautpunkt rückt im Verhältnis seines Oberschenkel-Gewichts zur Knochenachse – stärkste Wirkung in der
 * Schenkelmitte, zu Hüfte und Knie weich auslaufend, damit keine Kanten entstehen. Bindepose, vor dem Rig.
 */
export function slimThighs(mesh: THREE.SkinnedMesh, amount: number): void {
  const geometry = mesh.geometry;
  if (geometry.userData.slim) return;
  geometry.userData.slim = true;
  mesh.updateWorldMatrix(true, false);
  const bones = mesh.skeleton.bones;
  const legs = (["Left", "Right"] as const).map((side) => {
    const upper = bones.findIndex((b) => b.name === `${side}UpLeg`);
    const knee = bones.find((b) => b.name === `${side}Leg`);
    if (upper < 0 || !knee) return null;
    const a = mesh.worldToLocal(bones[upper]!.getWorldPosition(new THREE.Vector3()));
    const b = mesh.worldToLocal(knee.getWorldPosition(new THREE.Vector3()));
    return { upper, a, axis: b.clone().sub(a) };
  });
  const position = geometry.getAttribute("position");
  const index = geometry.getAttribute("skinIndex");
  const weight = geometry.getAttribute("skinWeight");
  const v = new THREE.Vector3();
  const closest = new THREE.Vector3();
  for (let i = 0; i < position.count; i++) {
    for (const leg of legs) {
      if (!leg) continue;
      let w = 0;
      for (let k = 0; k < 4; k++) if (index.getComponent(i, k) === leg.upper) w += weight.getComponent(i, k);
      if (w < 0.05) continue;
      v.fromBufferAttribute(position, i);
      const t = THREE.MathUtils.clamp(v.clone().sub(leg.a).dot(leg.axis) / leg.axis.lengthSq(), 0, 1);
      closest.copy(leg.a).addScaledVector(leg.axis, t);
      // Mitte des Schenkels am stärksten, Hüfte (t=0) und Knie (t=1) unverändert
      const taper = Math.sin(Math.PI * THREE.MathUtils.clamp(t * 1.1, 0, 1)) ** 0.7;
      const scale = 1 - amount * w * taper;
      // nur quer zur Achse verschlanken (Länge des Beins bleibt)
      v.sub(closest).multiplyScalar(scale).add(closest);
      position.setXYZ(i, v.x, v.y, v.z);
    }
  }
  const data = (position as THREE.InterleavedBufferAttribute).data;
  if (data) data.needsUpdate = true;
  else position.needsUpdate = true;
  geometry.computeBoundingSphere();
}

let maskTexture: THREE.Texture | null = null;
/** Bereichsmaske des Woman-Base-Atlas (einmal laden, von allen Frauenfiguren geteilt; glTF-UV ohne Spiegelung). */
function womanMask(): THREE.Texture {
  if (!maskTexture) {
    maskTexture = new THREE.TextureLoader().load(asset("bodies/woman-base-mask.png"));
    maskTexture.flipY = false;
    maskTexture.anisotropy = 8;
    maskTexture.colorSpace = THREE.NoColorSpace;
  }
  return maskTexture;
}

/**
 * Konzeptfarben auf einen Frauenkörper legen. Bereiche:
 * Woman Base – aus der vorab berechneten Maske (Top, Shorts, Haar, Rest Haut);
 * Female Athlete – korallfarbenes Top/Streifen (stark gesättigt), dunkle Haut. Schatten/Falten bleiben erhalten.
 */
function applyWomanLook(m: THREE.MeshPhysicalMaterial, kind: "woman" | "athlete", id: string): void {
  const a = avatarById(id);
  const ref = new THREE.Color(BODY_SKIN[kind]);
  const tone = new THREE.Color(a.skin);
  const skinMul = new THREE.Color(Math.min(1.7, tone.r / ref.r), Math.min(1.7, tone.g / ref.g), Math.min(1.7, tone.b / ref.b));
  const top = new THREE.Color(a.topColor);
  const bottom = new THREE.Color(a.bottomColor);
  const hair = new THREE.Color(a.hair);
  // Woman Base: vorab berechnete Bereichsmaske (scripts/woman-look-mask.py) – R Top, G Shorts, B Haar.
  // Farbschwellen allein ordnen die Schnipselkanten des Fotoscan-Atlas falsch zu (Saum, Sprenkel).
  // Helligkeit relativ zum Mittel der Klasse (linear: Top .24, Shorts .033, Haar .022) erhält Falten und Schatten;
  // nach oben eng begrenzt – an Schnipselnähten eingemischte Haut-Texel würden sonst als helle Adern aufleuchten.
  const classify = kind === "woman"
    ? `vec3 mk = smoothstep(vec3(.22), vec3(.62), texture2D(lookMask, vMapUv).rgb); // Kanten nicht halb Haut/halb Stoff
       float isSkin = clamp(1. - mk.r - mk.g - mk.b, 0., 1.);
       lookFabric = mk.r + mk.g;
       vec3 recol = ${vec(top)} * clamp(lum / .24, .35, 1.12) * mk.r
                  + ${vec(bottom)} * clamp(lum / .033, .35, 1.12) * mk.g
                  + ${vec(hair)} * clamp(lum / .022, .3, 2.2) * mk.b
                  + c * ${vec(skinMul)} * isSkin;`
    : `float isTop = step(.16, lum) * step(.6, sat) * step(4. * c.g, c.r);
       vec3 recol = mix(c * ${vec(skinMul)}, ${vec(top)} * clamp(lum / .33, .3, 1.6), isTop);
       lookFabric = isTop + step(lum, .06) * step(sat, .3);`;
  m.customProgramCacheKey = () => `woman:${kind}:${id}`;
  m.onBeforeCompile = (shader) => {
    if (kind === "woman") {
      shader.uniforms.lookMask = { value: womanMask() };
      shader.fragmentShader = `uniform sampler2D lookMask;
${shader.fragmentShader}`;
    }
    // Samtglanz (sheen) nur auf Stoff: auf Haut und Augen wirkt der kühle Glanz wie ein grauer Schleier
    shader.fragmentShader = shader.fragmentShader.replace("#include <lights_physical_fragment>", `#include <lights_physical_fragment>
      #ifdef USE_SHEEN
        material.sheenColor *= lookFabric;
      #endif`);
    shader.fragmentShader = shader.fragmentShader.replace("#include <map_fragment>", `#include <map_fragment>
      float lookFabric = 0.;
      {
        vec3 c = diffuseColor.rgb;
        float mx = max(max(c.r, c.g), c.b);
        float mn = min(min(c.r, c.g), c.b);
        float sat = mx > .0001 ? (mx - mn) / mx : 0.;
        float lum = dot(c, vec3(.2126, .7152, .0722));
        ${classify}
        diffuseColor.rgb = recol;
      }`);
  };
}

/** Natürliches Material für Grab3D-Körper: Textur bleibt, Haut weich, Stoff matt, leichter Glanz wie bei Lukas. */
/** Rocketbox: Haut und Stoff aus den Original-Karten (Farbe, Normalen, Rauheit aus der Glanzkarte); Haare per Alpha-Test. */
function makeRocketboxMaterial(source: THREE.MeshStandardMaterial): THREE.MeshPhysicalMaterial {
  const m = new THREE.MeshPhysicalMaterial({
    name: source.name, map: source.map, normalMap: source.normalMap, roughnessMap: source.roughnessMap,
    roughness: source.roughnessMap ? 1 : 0.75, metalness: 0, specularIntensity: 0.55,
    alphaTest: source.alphaTest > 0 ? source.alphaTest : source.transparent ? 0.45 : 0,
    side: source.alphaTest > 0 || source.transparent || source.side === THREE.DoubleSide ? THREE.DoubleSide : THREE.FrontSide,
  });
  m.normalScale.setScalar(0.9);
  m.envMapIntensity = 1.0;
  for (const t of [m.map, m.normalMap, m.roughnessMap]) if (t) t.anisotropy = 8;
  return m;
}

function makeNaturalMaterial(source: THREE.MeshStandardMaterial): THREE.MeshPhysicalMaterial {
  const m = new THREE.MeshPhysicalMaterial({
    map: source.map, normalMap: source.normalMap, roughnessMap: source.roughnessMap, aoMap: source.aoMap,
    color: source.color, roughness: 0.72, metalness: 0, specularIntensity: 0.8, sheen: 0.6,
    sheenColor: new THREE.Color("#a1aeb7"), sheenRoughness: 0.55, clearcoat: 0.12, clearcoatRoughness: 0.4,
  });
  m.normalScale.setScalar(0.8);
  m.envMapIntensity = 1.05;
  // Fotoscan-Atlas: schräg gesehene Flächen scharf abtasten, sonst mischen sich Nachbarschnipsel an den Nähten ein
  for (const t of [m.map, m.normalMap, m.roughnessMap]) if (t) t.anisotropy = 8;
  return m;
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
  /** Foto-Trainer (falls für diese Figur gerendert) und Körperhöhe der 3D-Figur für den Maßstab. */
  private trainerPhoto: TrainerPhoto | null = null;
  private trainerHeight = 1.75;
  private playerHologram: THREE.Material | null = null;
  /** Teile der Spielerfigur mit ihrem Avatar- und Hologramm-Material (je Ansicht umgeschaltet). */
  private playerParts: Array<{ mesh: THREE.SkinnedMesh; kit: THREE.Material | THREE.Material[]; hologram: THREE.Material }> = [];
  private playerHair: THREE.Mesh | null = null;
  private playerShoes: THREE.Group[] = [];
  private readonly figureId: Record<FigureRole, string | null> = { trainer: null, player: null };
  /** Sprunghöhe aus dem Kamerabild (Füße über ihrem Bodenstand). */
  private readonly jump = new JumpTracker();
  private readonly figureLoading: Record<FigureRole, string | null> = { trainer: null, player: null };
  private readonly figureFailed = new Set<string>();
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
    this.loadFigure("trainer", "lukas");
    this.loadFigure("player", "lukas");
  }

  /**
   * Figur für eine Rolle laden: „trainer“ (macht vor) oder „player“ (du – folgt deiner Bewegung). Beide Rollen
   * haben eigene Figuren; ein Wechsel tauscht nur die betroffene Rolle aus, die andere bleibt sichtbar.
   */
  private loadFigure(role: FigureRole, id: string): void {
    const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).register((parser) => {
      // Embedded textures are local blob images. Use the image policy instead of a fetch.
      parser.textureLoader = new THREE.TextureLoader(loader.manager);
      return { name: "MotionArenaImageLoader" };
    });
    const body = figureBody(id);
    this.figureLoading[role] = id;
    void fetch(asset(body.file), { signal: this.abort.signal }).then((response) => {
      if (!response.ok) throw new Error(`Figur konnte nicht geladen werden (${response.status})`);
      return response.arrayBuffer();
    }).then((bytes) => loader.parseAsync(bytes, asset(""))).then(({ scene }) => {
      if (this.abort.signal.aborted || this.figureLoading[role] !== id) {
        this.disposeObjects(scene);
        return;
      }
      this.figureLoading[role] = null;
      this.figureId[role] = id;
      let mesh: THREE.SkinnedMesh | null = null;
      let kit: THREE.MeshStandardMaterial | null = null;
      /** Material je Teil-Mesh in Durchlaufreihenfolge (Rocketbox besteht aus mehreren Teilen: Körper, Kopf, Haare). */
      const kits: Array<THREE.Material | THREE.Material[]> = [];
      scene.traverse((node) => {
        if (node instanceof THREE.SkinnedMesh && (body.kind === "rocketbox" || !mesh)) {
          node.frustumCulled = false;
          if (body.kind === "woman") slimThighs(node, 0.15);
          if (body.kind === "rocketbox") {
            // mehrere Materialien (Körper, Kopf, ggf. Haare) – jedes mit seinen Original-Karten
            const sources = (Array.isArray(node.material) ? node.material : [node.material]) as THREE.MeshStandardMaterial[];
            const list = sources.map(makeRocketboxMaterial);
            node.material = list.length === 1 ? list[0]! : list;
            kit ??= list[0]!;
            kits.push(node.material);
            sources.forEach((x) => x.dispose());
            mesh ??= node;
            return;
          }
          const source = node.material as THREE.MeshStandardMaterial;
          if (body.kind === "lukas") kit = makeTrainerMaterial(source, lookOf(id));
          else {
            const natural = makeNaturalMaterial(source as THREE.MeshStandardMaterial);
            applyWomanLook(natural, body.kind as "woman" | "athlete", id);
            kit = natural;
          }
          node.material = kit;
          kits.push(kit);
          source.dispose();
          if (body.kind === "lukas") addTrainerContours(node);
          mesh = node;
        }
      });
      const m = mesh as THREE.SkinnedMesh | null;
      const k = kit as THREE.MeshStandardMaterial | null;
      if (role === "trainer") {
        this.dropRole("trainer");
        const rig = new TrainerRig(scene);
        rig.root.rotation.y = 0.42;
        if (body.kind === "lukas" && m && k?.map) {
          const hair = trainerHair(m, k.map);
          if (hair) attachTrainerHair(rig.root, hair);
        }
        if (body.barefoot) trainerFootwear(rig.root, body.kind !== "lukas");
        this.trainer = rig;
        this.trainerMesh = m;
        rig.root.updateMatrixWorld(true);
        this.trainerHeight = new THREE.Box3().setFromObject(rig.root).getSize(new THREE.Vector3()).y;
        if (TRAINER_PHOTOS[id]) {
          this.trainerPhoto = new TrainerPhoto(asset(TRAINER_PHOTOS[id]!));
          this.scene.add(this.trainerPhoto.mesh);
        }
        this.scene.add(rig.root);
      } else {
        this.dropRole("player");
        // Spieler: Klon mit Hologramm-Material; das eigene Material (Avatar-Look) wird je Ansicht eingesetzt
        this.player = this.makeHologram(scene, 0.92);
        // Teile des Klons in derselben Reihenfolge wie im Original: jedem Teil sein eigenes Avatar-Material
        const parts: THREE.SkinnedMesh[] = [];
        this.player.root.traverse((node) => { if (node instanceof THREE.SkinnedMesh) parts.push(node); });
        this.playerParts = parts.map((part, i) => ({ mesh: part, kit: kits[i] ?? kits[0]!, hologram: part.material as THREE.Material }));
        this.playerMesh = parts[0] ?? null;
        this.playerHologram = this.playerParts[0]?.hologram ?? null;
        if (this.playerMesh) this.analysisMaterial.bind(this.playerMesh);
        this.ghosts = [this.makeHologram(scene, 0.29), this.makeHologram(scene, 0.17), this.makeHologram(scene, 0.10)];
        if (body.kind === "lukas" && m && k?.map) {
          const hair = trainerHair(m, k.map);
          if (hair) {
            this.playerHair = hair;
            attachTrainerHair(this.player.root, hair);
          }
        }
        if (body.barefoot) this.playerShoes = trainerFootwear(this.player.root, body.kind !== "lukas");
      }
      if (this.trainer && this.player) this.status = "ready";
    }).catch((error: unknown) => {
      if (this.abort.signal.aborted) return;
      this.figureLoading[role] = null;
      if (role === "trainer" ? this.trainer : this.player) {
        console.warn(`Arena: Avatar ${id} (${role}) nicht ladbar – bisherige Figur bleibt`, error);
        this.figureFailed.add(`${role}:${id}`);
        return;
      }
      console.warn("Arena: Figur nicht ladbar – 2D-Ersatzszene", error);
      this.status = "unavailable";
    });
  }

  /** Figur einer Rolle aus der Szene nehmen und Speicher freigeben. */
  private dropRole(role: FigureRole): void {
    const roots = role === "trainer"
      ? [this.trainer?.root]
      : [this.player?.root, ...this.ghosts.map((g) => g.root)];
    for (const root of roots) {
      if (!root) continue;
      this.scene.remove(root);
      this.disposeObjects(root);
    }
    if (role === "trainer") {
      this.trainer = null;
      this.trainerMesh = null;
      if (this.trainerPhoto) {
        this.scene.remove(this.trainerPhoto.mesh);
        this.trainerPhoto.dispose();
        this.trainerPhoto = null;
      }
    } else {
      this.player = null;
      this.ghosts = [];
      this.playerMesh = null;
      this.playerParts = [];
      this.playerHair = null;
      this.playerShoes = [];
    }
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

  /**
   * Sprunghöhe in Metern aus den 2D-Körperpunkten: Abstand der Füße zu ihrem Bodenstand, umgerechnet über die
   * Beinlänge im Bild (≈ 0,9 m). Der Bodenstand folgt Stand und Kamera langsam, Absprünge sofort sichtbar.
   */
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
    for (const [role, id] of [["trainer", frame.trainer], ["player", frame.avatar]] as const) {
      const wanted = id && /^[a-z]+$/.test(id) ? id : "lukas";
      if (wanted !== this.figureId[role] && wanted !== this.figureLoading[role] && !this.figureFailed.has(`${role}:${wanted}`)) {
        this.loadFigure(role, wanted);
      }
    }
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
    // Trainer steht neben dem Spieler auf (fast) derselben Tiefe – so haben beide im Raum dieselbe Körpergröße.
    // (Früher stand er auf der weiter hinten liegenden Bodenlinie des Raumbilds und wirkte dadurch deutlich kleiner.)
    const trainerZ = baseDepth - TRAINER_BEHIND;
    const trainerPoint = this.place(trainerX, Math.min(trainerY, playerY), trainerZ).clone();
    this.camera.position.y -= playerPoint.y;
    this.camera.updateMatrixWorld();
    const trainerXWorld = trainerPoint.x;
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
    // Foto-Trainer: gerendertes Bild zur Tiefe zeigen, das 3D-Netz dann ausblenden (Pose läuft für Schatten weiter)
    const photo = this.trainerPhoto?.ready && !solo ? this.trainerPhoto : null;
    this.trainer.root.traverse((node) => { if ((node as THREE.Mesh).isMesh) node.visible = !photo; });
    if (photo) photo.update(guideFlex, this.trainer.root.position, this.trainerHeight, this.camera, frame.studioRoom?.light ? new THREE.Color(frame.studioRoom.light) : undefined);
    else this.trainerPhoto?.hide();
    const analytic = frame.mode === "muskel" || frame.mode === "zonen" || frame.mode === "gitter";
    // Du erscheinst als dein gewählter Avatar – in der Arena (neben dem Trainer) und in der Ansicht „Avatar“
    const kitShown = frame.mode === "avatar" || !frame.mode || frame.mode === "arena";
    if (analytic) this.analysisMaterial.update(frame);
    for (const part of this.playerParts) {
      part.mesh.material = analytic ? this.analysisMaterial : kitShown ? part.kit : frame.mode === "skelett" ? this.green : part.hologram;
    }
    this.playerShoes.forEach((shoe) => { shoe.visible = kitShown; });
    if (this.playerHair) this.playerHair.visible = kitShown;
    poseTrainerContours(this.playerMesh, flex ?? 0, kitShown || frame.mode === "muskel");
    const joints = frame.worldPose ?? frame.pose;
    const aspect = frame.v.sw / frame.v.sh;
    const sourcePose = (solo && !guidedAvatar) || (!frame.demo && !filmed);
    if (sourcePose) this.player.root.rotation.y = 0;
    const follows = sourcePose && !!joints && this.player.follow(joints, aspect, !!frame.worldPose, frame.demo, frame.v.mirror);
    // Sprünge: Weltkoordinaten sind hüftzentriert – die Sprunghöhe kommt aus dem Bild (Füße über ihrem Bodenstand)
    if (follows) this.player.root.position.y += this.jump.update(frame.pose, frame.now);
    else this.jump.reset();
    this.player.root.visible = sourcePose ? follows : flex !== null && !filmed;
    // Leuchtende Gelenkpunkte nur zur Hologramm-/Skelett-Darstellung, nicht auf dem realistischen Avatar
    this.dots.visible = this.player.root.visible && !kitShown && (!solo || frame.mode === "skelett");
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
    this.trainerPhoto?.dispose();
    this.environment.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }
}
