import * as THREE from "three";
import { Reflector } from "three/addons/objects/Reflector.js";

const wood = new THREE.Color("#765038");
const frame = new THREE.Color("#171f22");

function surface(color: THREE.ColorRepresentation, strength: number, lines = false): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({ color, roughness: 0.82 });
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = `varying vec3 studioPoint;\n${shader.vertexShader}`.replace(
      "#include <begin_vertex>", "#include <begin_vertex>\nstudioPoint = position;",
    );
    shader.fragmentShader = `varying vec3 studioPoint;\n${shader.fragmentShader}`.replace("#include <color_fragment>", `
      #include <color_fragment>
      vec3 n = studioPoint * vec3(${lines ? "135., 4., 100." : "65., 67., 61."});
      float fine = fract(sin(dot(floor(n), vec3(87.2, 17.3, 51.9))) * 4385.138);
      float broad = sin(n.x * 0.078 + sin(n.y * 0.12)) * cos(n.z * 0.038 + n.y * 0.071);
      diffuseColor.rgb *= 1.0 + (fine - 0.5) * ${strength.toFixed(3)} + broad * 0.07;
    `);
  };
  material.customProgramCacheKey = () => `${strength}:${lines}`;
  return material;
}

function box(parent: THREE.Object3D, material: THREE.Material, size: [number, number, number], at: [number, number, number]): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
  mesh.position.set(...at);
  parent.add(mesh);
  return mesh;
}

function hills(parent: THREE.Object3D): void {
  const sky = new THREE.Mesh(new THREE.PlaneGeometry(125, 53), new THREE.ShaderMaterial({
    vertexShader: "varying vec2 uvSky; void main() { uvSky = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }",
    fragmentShader: `varying vec2 uvSky;
      void main() {
        vec3 sky = mix(vec3(.88,.58,.35), vec3(.20,.44,.64), smoothstep(.13,.78, uvSky.y));
        float band = sin(uvSky.y * 51. + sin(uvSky.x * 13.) + sin(uvSky.x * 47.) * .21);
        float cloud = smoothstep(.49,.95, band) * smoothstep(.06,.86, sin(uvSky.x * 33. + uvSky.y * 9.)) * .31;
        sky = mix(sky, vec3(1.,.82,.67), cloud);
        float sun = length((uvSky - vec2(.34,.43)) * vec2(2.3,1.));
        sky += vec3(.55,.29,.12) * exp(-sun * 13.) + vec3(1.,.71,.44) * (1. - smoothstep(.004,.009,sun));
        gl_FragColor = vec4(sky,1.);
        #include <colorspace_fragment>
      }`,
  }));
  sky.position.set(-11, 8, -67);
  parent.add(sky);

  const paint = [new THREE.Color("#8b9ca3"), new THREE.Color("#629097"), new THREE.Color("#516b63")];
  for (let layer = 0; layer < 3; layer++) {
    const geometry = new THREE.PlaneGeometry(105, 14, 106, 24);
    geometry.rotateX(-Math.PI / 2);
    const position = geometry.attributes.position!;
    const colors: number[] = [];
    for (let i = 0; i < position.count; i++) {
      const x = position.getX(i);
      const z = position.getZ(i);
      const taper = Math.sin(Math.PI * (z + 7) / 14) ** 0.69;
      const peaks = Math.abs(Math.sin(x * 0.28 + layer * 3.1)) ** 1.9;
      const ridges = Math.abs(Math.sin(x * 0.84 + z * 0.38)) * 0.6 + Math.sin(x * 1.7 - z * 0.8) * 0.26;
      const height = taper * (1.65 + (layer === 0 ? 5.25 : 3.25) * peaks + ridges);
      position.setY(i, height);
      const rock = paint[layer]!.clone().multiplyScalar(0.81 + 0.19 * peaks + (0.04 * ridges));
      if (layer === 0) rock.lerp(new THREE.Color("#dadbe2"), THREE.MathUtils.clamp((height - 4.6 + ridges * 0.35) / 2, 0, 0.83));
      colors.push(rock.r, rock.g, rock.b);
    }
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    geometry.computeVertexNormals();
    const mountain = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, side: THREE.DoubleSide }));
    mountain.position.set(-14, -4.6 + (2 - layer) * 0.15, -49 + 11 * layer);
    parent.add(mountain);
  }
}

function wallLogo(parent: THREE.Object3D): void {
  const canvas = document.createElement("canvas");
  canvas.width = 768;
  canvas.height = 330;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#f98a4a";
  ctx.beginPath();
  ctx.moveTo(61, 119);
  ctx.bezierCurveTo(183, -5, 525, -22, 708, 73);
  ctx.bezierCurveTo(532, 11, 269, 28, 61, 119);
  ctx.fill();
  ctx.fillStyle = "#e7e8e4";
  ctx.textAlign = "center";
  ctx.font = "italic 900 104px Arial";
  ctx.fillText("MOTION", 384, 156);
  ctx.fillText("ARENA", 400, 241);
  ctx.font = "bold 25px Arial";
  ctx.fillText("K I N E T I C   S T U D I O", 400, 291);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const logo = new THREE.Mesh(new THREE.PlaneGeometry(2.87, 1.23), new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false }));
  logo.position.set(1.74, 2.76, -4.96);
  parent.add(logo);
}

function plant(parent: THREE.Object3D, x: number, z: number, scale: number): void {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  group.scale.setScalar(scale);
  parent.add(group);
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.29, 0.22, 0.44, 16), surface("#303435", 0.13));
  pot.position.y = 0.22;
  group.add(pot);
  const leaf = new THREE.SphereGeometry(1, 7, 5);
  const material = new THREE.MeshStandardMaterial({ color: "#849051", roughness: 0.85 });
  const leaves = new THREE.InstancedMesh(leaf, material, 164);
  const instance = new THREE.Object3D();
  const bark = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.048, 1.78, 7), surface("#63513a", 0.21, true));
  bark.position.y = 1.25;
  bark.rotation.z = -0.085;
  group.add(bark, leaves);
  for (let i = 0; i < leaves.count; i++) {
    const a = i * 2.39996;
    const dy = ((i * 59) % 167) / 167;
    const radius = (0.16 + 0.48 * Math.sin(Math.PI * dy)) * (0.56 + ((i * 37) % 19) / 43);
    instance.position.set(Math.cos(a) * radius + 0.1, 1.28 + dy * 1.28, Math.sin(a) * radius);
    instance.rotation.set(Math.sin(i * 1.3), a, Math.cos(i * 1.7));
    const length = 0.062 + ((i * 37) % 17) * 0.0041;
    instance.scale.set(length, length * 0.12, length * 0.48);
    instance.updateMatrix();
    leaves.setMatrixAt(i, instance.matrix);
    leaves.setColorAt(i, new THREE.Color().setHSL(0.17 + dy * 0.085, 0.39, 0.24 + dy * 0.26));
  }
}

export function studioLoft(parent: THREE.Object3D): Reflector {
  const space = new THREE.Group();
  parent.add(space);
  hills(space);
  const wall = surface("#344145", 0.15);
  const dark = surface(frame, 0.15);
  const timber = surface(wood, 0.22, true);
  const bench = surface("#322921", 0.17, true);
  const lamp = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.8, 0.69, 0.24) });
  box(space, wall, [8.35, 4.2, 0.20], [3.3, 2.10, -5.10]);
  box(space, dark, [5.15, 0.15, 0.12], [1.87, 1.96, -4.98]);
  box(space, timber, [15, 0.23, 14], [0, 4.04, -1.8]);
  box(space, bench, [4.64, 0.29, 0.54], [2.02, 0.32, -4.61]);
  box(space, wall, [4.7, 0.25, 0.47], [2.02, 0.14, -4.62]);
  box(space, lamp, [4.57, 0.028, 0.071], [2, 0.49, -4.9]);
  for (const x of [0.58, 1.27, 2.84, 3.51]) box(space, dark, [0.53, 0.29, 0.28], [x, 0.57, -4.66]);
  for (let i = 0; i < 9; i++) box(space, timber, [0.045, 4, 0.09], [-0.91 + i * 0.072, 2.01, -4.96]);
  box(space, lamp, [0.017, 3.75, 0.05], [-0.94, 1.9, -4.92]);

  for (let x = -7.1; x <= -0.95; x += 0.78) box(space, dark, [0.065, 4, 0.13], [x, 2.0, -5.02]);
  for (const y of [0.08, 0.77, 2.95, 3.96]) box(space, dark, [6.8, y === 2.95 ? 0.095 : 0.062, 0.14], [-4.19, y, -5.02]);
  for (let z = -5; z < 4; z += 1.08) box(space, dark, [0.14, 4, 0.067], [-5.5, 2, z]);
  for (const y of [0.08, 0.77, 2.95, 3.96]) box(space, dark, [0.14, 0.07, 9], [-5.5, y, -0.6]);
  wallLogo(space);
  plant(space, -1.06, -4.31, 1.02);
  plant(space, 4.01, -4.57, 1.06);
  plant(space, -4.74, -4.25, 0.9);

  const footprint = 15;
  const shader = {
    name: "ArenaFloor",
    uniforms: { color: { value: new THREE.Color() }, tDiffuse: { value: null }, textureMatrix: { value: new THREE.Matrix4() } },
    vertexShader: `uniform mat4 textureMatrix; varying vec4 vUv; varying vec2 floorUV;
      void main() {
        floorUV = position.xy;
        vUv = textureMatrix * vec4(position, 1.);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.);
      }`,
    fragmentShader: `uniform sampler2D tDiffuse; varying vec4 vUv; varying vec2 floorUV;
      void main() {
        vec4 base = texture2DProj(tDiffuse, vUv);
        vec2 tile = floorUV / vec2(1.02, .81);
        tile.x += mod(floor(tile.y), 2.) * .51;
        vec2 seam = abs(fract(tile + .5) - .5);
        float grout = smoothstep(.006,.018,min(seam.x,seam.y));
        float grain = fract(sin(dot(floor(floorUV * 180.), vec2(75.3,52.9))) * 4173.81);
        float tileShade = fract(sin(dot(floor(tile), vec2(73.6,41.9))) * 5173.62);
        float grit = 0.015 * grain + 0.014 * tileShade + 0.009 * sin(floorUV.x * 6. + sin(floorUV.y * 13.) * 2.);
        vec3 light = max(base.rgb, vec3(0.));
        float sunset = 1. - smoothstep(-4.8,1.5,floorUV.x + floorUV.y * .25);
        float mullion = smoothstep(.045,.19,abs(fract((floorUV.x + floorUV.y * .63) * 1.09) - .5));
        vec3 surface = vec3(.031,.041,.044) + grit + mix(vec3(.017,.024,.029),vec3(.135,.064,.027) * mix(.60,1.,mullion),sunset);
        gl_FragColor = vec4((surface + light * .16) * mix(.73,1.,grout), 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  };
  const floor = new Reflector(new THREE.PlaneGeometry(footprint, 16), { shader, textureWidth: 448, textureHeight: 280, multisample: 0, clipBias: 0.001 });
  floor.rotation.x = -Math.PI / 2;
  floor.position.z = -1.7;
  parent.add(floor);
  return floor;
}
