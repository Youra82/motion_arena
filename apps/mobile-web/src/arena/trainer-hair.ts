import {
  BufferGeometry, Color, DoubleSide, Float32BufferAttribute, Group, Mesh, MeshStandardMaterial, Vector3,
  type SkinnedMesh, type Texture,
} from "three";

/** The darkest part of the source hair texture distinguishes the hairline from the forehead. */
function hairTexture(map: Texture): Uint8ClampedArray | null {
  const source = map.image;
  if (!(source instanceof HTMLImageElement)) return null;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 512;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(source, 0, 0, 512, 512);
  return ctx.getImageData(0, 0, 512, 512).data;
}

type Hair = Mesh<BufferGeometry, MeshStandardMaterial>;

/** Grow short ribbons on the original sculpted scalp. No billboard follows the camera. */
export function trainerHair(body: SkinnedMesh, map: Texture): Hair | null {
  const { index, attributes: { position, normal, uv } } = body.geometry;
  if (!index || !position || !normal || !uv) return null;
  const image = hairTexture(map);
  if (!image) return null;
  const out: number[] = [], normals: number[] = [], colors: number[] = [], indices: number[] = [];
  const a = new Vector3(), b = new Vector3(), c = new Vector3(), edge = new Vector3(), pole = new Vector3();
  const point = new Vector3(), up = new Vector3(), flow = new Vector3(), side = new Vector3(), strand = new Vector3();
  const dark = new Color("#1b120d"), chestnut = new Color("#3b2418"), light = new Color();
  let seed = 13;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let i = 0; i < index.count; i += 3) {
    const ia = index.getX(i), ib = index.getX(i + 1), ic = index.getX(i + 2);
    if (Math.min(position.getY(ia), position.getY(ib), position.getY(ic)) < 1.66) continue;
    a.fromBufferAttribute(position, ia);
    b.fromBufferAttribute(position, ib);
    c.fromBufferAttribute(position, ic);
    const area = edge.subVectors(b, a).cross(pole.subVectors(c, a)).length() * 0.5;
    const count = Math.min(12, Math.floor(area * 87_000 + random()));
    for (let n = 0; n < count; n++) {
      const root = Math.sqrt(random());
      const u = root * random(), v = root - u, w = 1 - root;
      point.copy(a).multiplyScalar(w).addScaledVector(b, u).addScaledVector(c, v);
      if (point.y < 1.724 && Math.abs(point.x) < 0.077 && point.z > 0.024) continue;
      const px = Math.min(511, Math.max(0, Math.floor((uv.getX(ia) * w + uv.getX(ib) * u + uv.getX(ic) * v) * 512)));
      const py = Math.min(511, Math.max(0, Math.floor((uv.getY(ia) * w + uv.getY(ib) * u + uv.getY(ic) * v) * 512)));
      const pixel = (py * 512 + px) * 4;
      if (image[pixel]! * 0.28 + image[pixel + 1]! * 0.60 + image[pixel + 2]! * 0.12 > 111 && point.y < 1.754) continue;

      up.fromBufferAttribute(normal, ia).multiplyScalar(w);
      up.addScaledVector(edge.fromBufferAttribute(normal, ib), u);
      up.addScaledVector(edge.fromBufferAttribute(normal, ic), v).normalize();
      const crown = Math.min(1, Math.max(0, (point.y - 1.71) / 0.057));
      flow.set(0.28 + 0.52 * crown, 0.42 - 0.72 * crown, -0.84);
      flow.addScaledVector(up, -flow.dot(up)).normalize();
      side.crossVectors(flow, up).normalize();
      const length = (0.006 + random() * 0.009) * (0.6 + crown * 0.8);
      const width = 0.00012 + random() * 0.00032;
      const bend = (random() - 0.5) * 0.003;
      light.copy(dark).lerp(chestnut, random() ** 2 * 0.83);
      const base = out.length / 3;
      for (let step = 0; step <= 3; step++) {
        const t = step / 3;
        const lift = 0.0006 + 0.0014 * Math.sin(t * Math.PI * 0.9);
        const taper = width * (1 - t * 0.91);
        strand.copy(point).addScaledVector(flow, t * length).addScaledVector(up, lift).addScaledVector(side, bend * t * t);
        out.push(strand.x - side.x * taper, strand.y - side.y * taper, strand.z - side.z * taper);
        out.push(strand.x + side.x * taper, strand.y + side.y * taper, strand.z + side.z * taper);
        for (let k = 0; k < 2; k++) {
          normals.push(up.x, up.y, up.z);
          colors.push(light.r, light.g, light.b);
        }
        if (step > 0) {
          const j = base + (step - 1) * 2;
          indices.push(j, j + 1, j + 2, j + 1, j + 3, j + 2);
        }
      }
    }
  }
  if (!out.length) return null;
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(out, 3));
  geometry.setAttribute("normal", new Float32BufferAttribute(normals, 3));
  geometry.setAttribute("color", new Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  const material = new MeshStandardMaterial({ vertexColors: true, side: DoubleSide, roughness: 0.62 });
  const hair = new Mesh(geometry, material);
  hair.position.set(0, -0.0005, -0.023);
  return hair;
}

export function attachTrainerHair(root: Group, hair: Mesh): void {
  const head = root.getObjectByName("Head");
  if (!head) return;
  root.add(hair);
  head.attach(hair);
}
