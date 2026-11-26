import { LM } from "@motion-arena/shared";
import type { LoadLevel, ZoneId } from "@motion-arena/motion-scoring";
import { Color, MeshStandardMaterial, type SkinnedMesh } from "three";
import type { ArenaFrame } from "./arena-scene";

const segments: ReadonlyArray<readonly [ZoneId, number, number]> = [
  ["wadeL", LM.LEFT_KNEE, LM.LEFT_ANKLE], ["wadeR", LM.RIGHT_KNEE, LM.RIGHT_ANKLE],
  ["oberschenkelL", LM.LEFT_HIP, LM.LEFT_KNEE], ["oberschenkelR", LM.RIGHT_HIP, LM.RIGHT_KNEE],
  ["gesaessL", LM.LEFT_HIP, LM.LEFT_HIP], ["gesaessR", LM.RIGHT_HIP, LM.RIGHT_HIP],
  ["rumpf", LM.LEFT_HIP, LM.RIGHT_SHOULDER],
  ["schulterL", LM.LEFT_SHOULDER, LM.LEFT_ELBOW], ["schulterR", LM.RIGHT_SHOULDER, LM.RIGHT_ELBOW],
  ["armL", LM.LEFT_ELBOW, LM.LEFT_WRIST], ["armR", LM.RIGHT_ELBOW, LM.RIGHT_WRIST],
];
/** Gegenseite je Segment (für das Spiegelbild). */
const OTHER_SIDE = [1, 0, 3, 2, 5, 4, 6, 8, 7, 10, 9];

/** Zone ohne Belastungsanzeige (Hände, Finger, Füße, Kopf) bzw. Gesäß, das sich nach der Körperseite teilt. */
const NEUTRAL = 11;
const GLUTE = 12;
const MAX_BONES = 96;

/**
 * Belastungszone eines Knochens (Index in `segments`). Hände, Finger, Füße und Kopf tragen keine Muskelbelastung
 * der Übungen – sie bleiben neutral (früher färbten sich die Handflächen mit dem Unterarm, weil die Zonen nach
 * der Raumposition im Ruhezustand eingeteilt wurden).
 */
export function boneZone(name: string): number {
  const side = /^Left/.test(name) ? 0 : /^Right/.test(name) ? 1 : -1;
  if (/Hand|Thumb|Index|Middle|Ring|Pinky|Finger|Foot|Toe|Head|Neck|Eye|Jaw/i.test(name)) return NEUTRAL;
  if (side >= 0 && /UpLeg$/.test(name)) return 2 + side;
  if (side >= 0 && /Leg$/.test(name)) return side;
  if (side >= 0 && /ForeArm$/.test(name)) return 9 + side;
  if (side >= 0 && /(Arm|Shoulder)$/.test(name)) return 7 + side;
  if (name === "Hips") return GLUTE;
  if (/Spine/i.test(name)) return 6;
  return NEUTRAL;
}

const loadColors: Record<LoadLevel, Color> = {
  gering: new Color("#819897"), mittel: new Color("#ffba2e"), hoch: new Color("#ff3d21"), unsicher: new Color("#5f7680"),
};
const still = new Color("#00baab");
const active = new Color("#acec26");
const brisk = new Color("#ffac17");
const fast = new Color("#ff3d22");

export class BodyMaterial extends MeshStandardMaterial {
  private readonly colors = segments.map(() => new Color());
  private readonly mode = { value: 0 };
  /** Knochen → Zone der gebundenen Figur. */
  private readonly zones = { value: new Float32Array(MAX_BONES).fill(NEUTRAL) };

  constructor() {
    super({ color: "#172429", roughness: 0.45, metalness: 0.17 });
    this.onBeforeCompile = (shader) => {
      shader.uniforms.zoneColors = { value: this.colors };
      shader.uniforms.displayMode = this.mode;
      shader.uniforms.boneZones = this.zones;
      // Zonenfarbe aus den Hautgewichten: jeder Knochen trägt die Farbe seiner Zone, Übergänge folgen der Haut.
      shader.vertexShader = `varying vec3 rigPoint;
        varying vec3 zoneSignal;
        uniform vec3 zoneColors[11];
        uniform float boneZones[${MAX_BONES}];
        vec3 zoneOf(float bone, float x) {
          int z = int(boneZones[int(bone)] + .5);
          if (z == ${NEUTRAL}) return vec3(.06,.1,.11);
          if (z == ${GLUTE}) return mix(zoneColors[5], zoneColors[4], smoothstep(-.025,.025,x));
          return zoneColors[z];
        }
        ${shader.vertexShader}`.replace("#include <begin_vertex>", `#include <begin_vertex>
        rigPoint = position;
        #ifdef USE_SKINNING
          zoneSignal = zoneOf(skinIndex.x, position.x) * skinWeight.x + zoneOf(skinIndex.y, position.x) * skinWeight.y
                     + zoneOf(skinIndex.z, position.x) * skinWeight.z + zoneOf(skinIndex.w, position.x) * skinWeight.w;
        #else
          zoneSignal = vec3(.06,.1,.11);
        #endif`);
      shader.fragmentShader = `varying vec3 rigPoint; varying vec3 zoneSignal; uniform float displayMode;\n${shader.fragmentShader}`
        .replace("#include <opaque_fragment>", `
          vec3 signal = zoneSignal;
          float rim = pow(1.0 - abs(dot(normalize(normal), normalize(vViewPosition))), 2.8);
          vec3 grid = abs(fract(rigPoint * vec3(28.,26.,29.) + .5) - .5);
          float bands = 1. - smoothstep(.018,.065,min(grid.y,min(grid.x,grid.z)));
          if (displayMode > 1.5) {
            outgoingLight = outgoingLight * .45 + vec3(.25,.88,.025) * (rim * .62 + bands * .75);
          } else {
            outgoingLight = outgoingLight * .74 + signal * (.42 + .8 * rim + .23 * bands);
          }
          #include <opaque_fragment>
        `);
    };
  }

  /** Knochen-Zonen der Figur übernehmen, die dieses Material trägt. */
  bind(mesh: SkinnedMesh): void {
    this.zones.value.fill(NEUTRAL);
    mesh.skeleton.bones.slice(0, MAX_BONES).forEach((bone, i) => { this.zones.value[i] = boneZone(bone.name); });
  }

  update(frame: ArenaFrame): void {
    this.mode.value = frame.mode === "gitter" ? 2 : 0;
    if (this.mode.value === 2) return;
    // Spiegelbild: die Figur bewegt ihre rechte Seite mit deiner linken – die Farben der Seiten tauschen mit
    const mirror = frame.v.mirror;
    segments.forEach(([zone, a, b], index) => {
      const color = this.colors[mirror ? OTHER_SIDE[index]! : index]!;
      if (frame.mode === "muskel") {
        color.copy(loadColors[frame.bodyLoad?.zones[zone]?.level ?? "unsicher"]);
        return;
      }
      const first = frame.speeds?.get(a);
      const second = frame.speeds?.get(b);
      if (first === undefined && second === undefined) {
        color.copy(loadColors.unsicher);
        return;
      }
      const strength = Math.min(1, ((first ?? second!) + (second ?? first!)) / 4);
      if (strength < 0.33) color.copy(still).lerp(active, strength / 0.33);
      else if (strength < 0.66) color.copy(active).lerp(brisk, (strength - 0.33) / 0.33);
      else color.copy(brisk).lerp(fast, (strength - 0.66) / 0.34);
    });
  }
}
