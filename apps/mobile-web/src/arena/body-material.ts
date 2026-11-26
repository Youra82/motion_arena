import { LM } from "@motion-arena/shared";
import type { LoadLevel, ZoneId } from "@motion-arena/motion-scoring";
import { Color, MeshStandardMaterial } from "three";
import type { ArenaFrame } from "./arena-scene";

const segments: ReadonlyArray<readonly [ZoneId, number, number]> = [
  ["wadeL", LM.LEFT_KNEE, LM.LEFT_ANKLE], ["wadeR", LM.RIGHT_KNEE, LM.RIGHT_ANKLE],
  ["oberschenkelL", LM.LEFT_HIP, LM.LEFT_KNEE], ["oberschenkelR", LM.RIGHT_HIP, LM.RIGHT_KNEE],
  ["gesaessL", LM.LEFT_HIP, LM.LEFT_HIP], ["gesaessR", LM.RIGHT_HIP, LM.RIGHT_HIP],
  ["rumpf", LM.LEFT_HIP, LM.RIGHT_SHOULDER],
  ["schulterL", LM.LEFT_SHOULDER, LM.LEFT_ELBOW], ["schulterR", LM.RIGHT_SHOULDER, LM.RIGHT_ELBOW],
  ["armL", LM.LEFT_ELBOW, LM.LEFT_WRIST], ["armR", LM.RIGHT_ELBOW, LM.RIGHT_WRIST],
];

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

  constructor() {
    super({ color: "#172429", roughness: 0.45, metalness: 0.17 });
    this.onBeforeCompile = (shader) => {
      shader.uniforms.zoneColors = { value: this.colors };
      shader.uniforms.displayMode = this.mode;
      shader.vertexShader = `varying vec3 rigPoint;\n${shader.vertexShader}`.replace("#include <begin_vertex>", "#include <begin_vertex>\nrigPoint = position;");
      shader.fragmentShader = `varying vec3 rigPoint; uniform vec3 zoneColors[11]; uniform float displayMode;\n${shader.fragmentShader}`
        .replace("#include <opaque_fragment>", `
          float y = rigPoint.y;
          float x = abs(rigPoint.x);
          float side = smoothstep(-.025,.025,rigPoint.x);
          vec3 calf = mix(zoneColors[1], zoneColors[0], side);
          vec3 thigh = mix(zoneColors[3], zoneColors[2], side);
          vec3 hip = mix(zoneColors[5], zoneColors[4], side);
          vec3 shoulder = mix(zoneColors[8], zoneColors[7], side);
          vec3 arm = mix(zoneColors[10], zoneColors[9], side);
          vec3 signal = mix(calf, thigh, smoothstep(.45,.55,y));
          signal = mix(signal, hip, smoothstep(.83,.96,y));
          signal = mix(signal, zoneColors[6], smoothstep(.99,1.11,y));
          signal = mix(signal, shoulder, smoothstep(.12,.23,x) * smoothstep(1.20,1.39,y));
          signal = mix(signal, arm, smoothstep(.22,.35,x) * smoothstep(.91,1.05,y));
          signal = mix(signal, vec3(.06,.1,.11), smoothstep(1.46,1.57,y));
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

  update(frame: ArenaFrame): void {
    this.mode.value = frame.mode === "gitter" ? 2 : 0;
    if (this.mode.value === 2) return;
    segments.forEach(([zone, a, b], i) => {
      const color = this.colors[i]!;
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
