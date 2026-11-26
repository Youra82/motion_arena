import {
  BufferGeometry, CatmullRomCurve3, ExtrudeGeometry, Float32BufferAttribute, Group, Mesh, MeshStandardMaterial,
  Shape, SkinnedMesh, TubeGeometry, Vector3,
} from "three";

type Profile = ReadonlyArray<readonly [z: number, centre: number, radius: number, height: number]>;

// Cross-sections of the shoe in the avatar's standing pose, from heel to toe (Lukas, von Hand abgestimmt).
const LUKAS_PROFILE: Profile = [
  [-0.163, 0.153, 0.021, 0.075], [-0.133, 0.162, 0.047, 0.132], [-0.093, 0.165, 0.064, 0.147],
  [-0.048, 0.180, 0.067, 0.135], [0.000, 0.192, 0.069, 0.113], [0.051, 0.199, 0.073, 0.094],
  [0.098, 0.203, 0.070, 0.079], [0.141, 0.199, 0.054, 0.058], [0.170, 0.185, 0.023, 0.035],
] as const;

function sole(outline: Shape, height: number, level: number, material: MeshStandardMaterial): Mesh {
  const geometry = new ExtrudeGeometry(outline, { depth: height, bevelEnabled: true, bevelSegments: 2, bevelSize: 0.005, bevelThickness: 0.003 });
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, level, 0);
  return new Mesh(geometry, material);
}

/**
 * Schuhquerschnitte aus dem echten Fuß einer Figur messen: alle Hautpunkte, die am Fuß/an den Zehen hängen,
 * in 9 Scheiben von der Ferse bis zur Spitze; der Schuh liegt mit wenigen Millimetern Luft darum.
 * So passt der Schuh auf jeden Körper statt Lukas' Schuh auf fremde Füße zu setzen.
 */
export function measureFootProfile(root: Group, side: "Left" | "Right"): Profile | null {
  const names = new Set([`${side}Foot`, `${side}ToeBase`, `${side}Toe_End`, `${side}Toe`]);
  const pts: Vector3[] = [];
  const v = new Vector3();
  root.updateMatrixWorld(true);
  root.traverse((node) => {
    if (!(node instanceof SkinnedMesh)) return;
    const bones = node.skeleton.bones.map((b) => names.has(b.name));
    if (!bones.some(Boolean)) return;
    const index = node.geometry.getAttribute("skinIndex");
    const weight = node.geometry.getAttribute("skinWeight");
    for (let i = 0; i < index.count; i++) {
      let w = 0;
      for (let k = 0; k < 4; k++) if (bones[index.getComponent(i, k)]) w += weight.getComponent(i, k);
      if (w < 0.5) continue;
      node.getVertexPosition(i, v);
      pts.push(root.worldToLocal(node.localToWorld(v.clone())));
    }
  });
  if (pts.length < 30) return null;
  const sign = side === "Left" ? 1 : -1;
  const ground = Math.min(...pts.map((p) => p.y));
  // Knöchelhöhe begrenzen: der Schuh endet unter dem Knöchel (Halbschuh), sonst wird er zum Stiefel
  const top = ground + 0.105;
  const foot = pts.filter((p) => p.y < top);
  const z0 = Math.min(...foot.map((p) => p.z));
  const z1 = Math.max(...foot.map((p) => p.z));
  const n = 9;
  const out: Array<[number, number, number, number]> = [];
  for (let s = 0; s < n; s++) {
    // Scheibenmitte; erste/letzte Scheibe an Ferse und Spitze (mit Luft für Kappe und Fersenkappe)
    const z = z0 - 0.012 + (z1 - z0 + 0.024) * s / (n - 1);
    const slice = foot.filter((p) => Math.abs(p.z - z) < (z1 - z0) / (n - 1) * 0.75);
    if (!slice.length) continue;
    const xs = slice.map((p) => sign * p.x);
    const lo = Math.min(...xs), hi = Math.max(...xs);
    const h = Math.max(...slice.map((p) => p.y)) - ground;
    const end = s === 0 || s === n - 1 ? 0.55 : 1;
    out.push([z, (lo + hi) / 2, ((hi - lo) / 2 + 0.007) * end, Math.min(h + 0.012, 0.13) * (end < 1 ? 0.8 : 1) + ground]);
  }
  return out.length >= 5 ? out : null;
}

function upper(side: number, material: MeshStandardMaterial, profile: Profile): Mesh {
  const vertices: number[] = [];
  const indices: number[] = [];
  const sections = 12;
  for (const [z, centre, radius, height] of profile) {
    for (let n = 0; n <= sections; n++) {
      const theta = n * Math.PI / sections;
      vertices.push(side * centre + Math.cos(theta) * radius, 0.020 + (height - 0.020) * Math.sin(theta), z);
    }
  }
  for (let row = 1; row < profile.length; row++) {
    for (let n = 0; n < sections; n++) {
      const a = (row - 1) * (sections + 1) + n;
      const b = a + sections + 1;
      indices.push(a, a + 1, b, a + 1, b + 1, b);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setIndex(indices);
  geometry.setAttribute("position", new Float32BufferAttribute(vertices, 3));
  geometry.computeVertexNormals();
  return new Mesh(geometry, material);
}

/** Fit the shoes in the bind pose, then parent them to the feet so they follow the animation. */
export function trainerFootwear(root: Group, fitted = false): Group[] {
  const textile = new MeshStandardMaterial({ color: "#181e22", roughness: 0.88 });
  const rubber = new MeshStandardMaterial({ color: "#d24d0b", roughness: 0.84 });
  const foam = new MeshStandardMaterial({ color: "#c8c5b7", roughness: 0.73 });
  const lace = new MeshStandardMaterial({ color: "#4d5459", roughness: 0.79 });
  const shoes: Group[] = [];
  for (const [name, side] of [["LeftFoot", 1], ["RightFoot", -1]] as const) {
    const foot = root.getObjectByName(name);
    if (!foot) continue;
    const profile = (fitted && measureFootProfile(root, name === "LeftFoot" ? "Left" : "Right")) || LUKAS_PROFILE;
    const outline = new Shape();
    profile.forEach(([z, centre, radius], n) => {
      const x = side * centre + radius;
      if (n === 0) outline.moveTo(x, -z);
      else outline.lineTo(x, -z);
    });
    [...profile].reverse().forEach(([z, centre, radius]) => outline.lineTo(side * centre - radius, -z));
    outline.closePath();
    const shoe = new Group();
    shoe.add(sole(outline, 0.007, 0.004, rubber), sole(outline, 0.014, 0.014, foam), upper(side, textile, profile));
    for (let n = 0; n < 5; n++) {
      const row = profile[n + 2]!;
      const next = profile[n + 3]!;
      const a = new Vector3(side * row[1] - row[2] * 0.51, row[3] * 0.92, row[0]);
      const b = new Vector3(side * next[1] + next[2] * 0.49, next[3] * 0.92, next[0]);
      const arc = a.clone().lerp(b, 0.5);
      arc.y += 0.014;
      shoe.add(new Mesh(new TubeGeometry(new CatmullRomCurve3([a, arc, b]), 7, 0.0027, 5, false), lace));
    }
    root.add(shoe);
    foot.attach(shoe);
    shoes.push(shoe);
  }
  return shoes;
}
