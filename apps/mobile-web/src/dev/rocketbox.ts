/**
 * NUR ENTWICKLUNG (nicht im App-Bundle): Microsoft-Rocketbox-Figuren (MIT-Lizenz) aus FBX in das GLB-Format der
 * Arena umwandeln – Knochen auf die Arena-Namen umbenennen, auf Meter skalieren, Materialien setzen, exportieren.
 * Quelle der Dateien: assets-src/rocketbox/<Name>/ (Texturen vorher als PNG). Aufruf über den Vite-Server:
 * m.setSource("<Repo>/assets-src/rocketbox"); await m.convert("Sports_Male_04")
 */
import * as THREE from "three";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";

/** Quellordner (assets-src/rocketbox/) als Vite-/@fs/-Pfad – setzt das aufrufende Skript, kein fester lokaler Pfad. */
let SRC = "";
export function setSource(absoluteDir: string): void {
  const dir = absoluteDir.split("\\").join("/");
  SRC = `/@fs/${dir.endsWith("/") ? dir : `${dir}/`}`;
}

async function load(name: string): Promise<THREE.Group> {
  const manager = new THREE.LoadingManager();
  // FBX verweist auf .tga – wir liefern die umgewandelten .png aus demselben Ordner
  manager.setURLModifier((url) => {
    const file = url.split(/[\\/]/).pop()!;
    if (/\.tga$/i.test(file)) return `${SRC}${name}/${file.replace(/\.tga$/i, ".png")}`;
    return url;
  });
  return new FBXLoader(manager).loadAsync(`${SRC}${name}/${name}.fbx`);
}

/** Aufbau ausgeben: Knochenbaum, Meshes, Materialien, Maße. */
export async function inspect(name: string): Promise<unknown> {
  const root = await load(name);
  const bones: string[] = [];
  const meshes: unknown[] = [];
  root.traverse((n) => {
    if ((n as THREE.Bone).isBone) bones.push(`${n.parent?.name ?? ""} > ${n.name}`);
    if ((n as THREE.SkinnedMesh).isSkinnedMesh || (n as THREE.Mesh).isMesh) {
      const m = n as THREE.SkinnedMesh;
      const mats = (Array.isArray(m.material) ? m.material : [m.material]).map((x) => {
        const s = x as THREE.MeshPhongMaterial;
        const src = (t: THREE.Texture | null) => (t?.image as HTMLImageElement | undefined)?.src?.split("/").pop();
        return { type: s.type, name: s.name, map: src(s.map), normal: src(s.normalMap), spec: src(s.specularMap), alpha: src(s.alphaMap), transparent: s.transparent };
      });
      meshes.push({ name: m.name, skinned: !!m.isSkinnedMesh, verts: m.geometry.getAttribute("position").count, groups: m.geometry.groups.length, mats });
    }
  });
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  return { scale: root.scale.toArray(), size: box.getSize(new THREE.Vector3()).toArray(), min: box.min.toArray(), bones, meshes };
}

/** Biped-Knochen → Arena-Namen (wie Grab3d/Mixamo); Finger und Gesichtsknochen behalten ihren Namen. */
const RENAME: Record<string, string> = {
  Bip01_Pelvis: "Hips", Bip01_Spine: "Spine", Bip01_Spine1: "Spine1", Bip01_Spine2: "Spine2",
  Bip01_Neck: "neck", Bip01_Head: "Head", Bip01_MNose: "headfront",
  Bip01_L_Thigh: "LeftUpLeg", Bip01_L_Calf: "LeftLeg", Bip01_L_Foot: "LeftFoot", Bip01_L_Toe0: "LeftToeBase",
  Bip01_R_Thigh: "RightUpLeg", Bip01_R_Calf: "RightLeg", Bip01_R_Foot: "RightFoot", Bip01_R_Toe0: "RightToeBase",
  Bip01_L_Clavicle: "LeftShoulder", Bip01_L_UpperArm: "LeftArm", Bip01_L_Forearm: "LeftForeArm", Bip01_L_Hand: "LeftHand",
  Bip01_R_Clavicle: "RightShoulder", Bip01_R_UpperArm: "RightArm", Bip01_R_Forearm: "RightForeArm", Bip01_R_Hand: "RightHand",
};

const texture = async (url: string, color: boolean) => {
  const t = await new THREE.TextureLoader().loadAsync(url);
  t.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.flipY = true;
  return t;
};

/**
 * Umwandeln und als GLB (Base64) zurückgeben. Materialien: Farbe + Normalen aus Rocketbox, Rauheit aus der
 * Glanzkarte (glänzend = glatt) als Metall/Rauheit-Textur; Haare mit Deckkraftkarte als Alpha-Test.
 */
export async function convert(name: string): Promise<{ glb: string; info: unknown }> {
  const root = await load(name);
  const dir = `${SRC}${name}/`;
  root.scale.setScalar(0.01); // Zentimeter → Meter
  root.traverse((n) => {
    if ((n as THREE.Bone).isBone && RENAME[n.name]) n.name = RENAME[n.name]!;
  });
  const meshes: THREE.SkinnedMesh[] = [];
  root.traverse((n) => { if ((n as THREE.SkinnedMesh).isSkinnedMesh) meshes.push(n as THREE.SkinnedMesh); });
  for (const mesh of meshes) {
    const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const next = await Promise.all(list.map(async (old) => {
      const prefix = old.name.replace(/_(body|head|opacity).*$/, "");
      const part = /head/.test(old.name) ? "head" : /opacity/.test(old.name) ? "opacity" : "body";
      const m = new THREE.MeshStandardMaterial({ name: old.name, roughness: 1, metalness: 0 });
      m.map = await texture(`${dir}${prefix}_${part === "opacity" ? "opacity" : part}_color.png`, true);
      if (part !== "opacity") {
        m.normalMap = await texture(`${dir}${prefix}_${part}_normal.png`, false);
        m.roughnessMap = await roughnessFrom(`${dir}${prefix}_${part}_specular.png`);
      } else {
        m.alphaTest = 0.45;
        m.side = THREE.DoubleSide;
        m.roughness = 0.75;
      }
      return m;
    }));
    mesh.material = Array.isArray(mesh.material) ? next : next[0]!;
  }
  root.updateMatrixWorld(true);
  const bone = (n: string) => root.getObjectByName(n)!.getWorldPosition(new THREE.Vector3()).toArray().map((v) => +v.toFixed(3));
  const info = { LeftUpLeg: bone("LeftUpLeg"), LeftFoot: bone("LeftFoot"), LeftArm: bone("LeftArm"), Head: bone("Head"), headfront: bone("headfront"), Hips: bone("Hips"),
    materials: meshes.flatMap((m) => (Array.isArray(m.material) ? m.material : [m.material]).map((x) => x.name)) };
  const result = await new GLTFExporter().parseAsync(root, { binary: true, onlyVisible: true, maxTextureSize: 2048 });
  const bytes = new Uint8Array(result as ArrayBuffer);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return { glb: btoa(bin), info };
}

/** Glanzkarte → glTF-Metall/Rauheit-Textur (G = Rauheit): glänzende Stellen (Augen, Lippen) werden glatt. */
async function roughnessFrom(url: string): Promise<THREE.Texture> {
  const img = await new THREE.ImageLoader().loadAsync(url);
  const c = document.createElement("canvas");
  c.width = img.width;
  c.height = img.height;
  const g = c.getContext("2d")!;
  g.drawImage(img, 0, 0);
  const d = g.getImageData(0, 0, c.width, c.height);
  for (let i = 0; i < d.data.length; i += 4) {
    const spec = (d.data[i]! + d.data[i + 1]! + d.data[i + 2]!) / (3 * 255);
    d.data[i] = 0;
    d.data[i + 1] = Math.round(255 * Math.min(1, Math.max(0.25, 0.92 - spec * 0.85)));
    d.data[i + 2] = 0;
  }
  g.putImageData(d, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.NoColorSpace;
  return t;
}

export { load, GLTFExporter };
