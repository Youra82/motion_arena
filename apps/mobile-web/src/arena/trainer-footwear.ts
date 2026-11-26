import {
  BufferGeometry, CatmullRomCurve3, ExtrudeGeometry, Float32BufferAttribute, Group, Mesh, MeshStandardMaterial,
  Shape, TubeGeometry, Vector3,
} from "three";

// Cross-sections of the shoe in the avatar's standing pose, from heel to toe.
const profile = [
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

function upper(side: number, material: MeshStandardMaterial): Mesh {
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
export function trainerFootwear(root: Group): Group[] {
  const textile = new MeshStandardMaterial({ color: "#181e22", roughness: 0.88 });
  const rubber = new MeshStandardMaterial({ color: "#d24d0b", roughness: 0.84 });
  const foam = new MeshStandardMaterial({ color: "#c8c5b7", roughness: 0.73 });
  const lace = new MeshStandardMaterial({ color: "#4d5459", roughness: 0.79 });
  const shoes: Group[] = [];
  for (const [name, side] of [["LeftFoot", 1], ["RightFoot", -1]] as const) {
    const foot = root.getObjectByName(name);
    if (!foot) continue;
    const outline = new Shape();
    profile.forEach(([z, centre, radius], n) => {
      const x = side * centre + radius;
      if (n === 0) outline.moveTo(x, -z);
      else outline.lineTo(x, -z);
    });
    [...profile].reverse().forEach(([z, centre, radius]) => outline.lineTo(side * centre - radius, -z));
    outline.closePath();
    const shoe = new Group();
    shoe.add(sole(outline, 0.007, 0.004, rubber), sole(outline, 0.014, 0.014, foam), upper(side, textile));
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
