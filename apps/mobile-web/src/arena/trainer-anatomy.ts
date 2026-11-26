import { BufferAttribute, MathUtils, type SkinnedMesh } from "three";

interface MuscleContour {
  center: readonly [x: number, y: number, z: number];
  radius: readonly [x: number, y: number, z: number];
  amplitude: number;
}

// Bilateral surface landmarks on the trainer's bind pose, in metres.
const groups = [
  { name: "shoulders", start: 5, end: 63, rest: 0.27, contours: [
    { center: [0.243, 1.329, 0.019], radius: [0.057, 0.062, 0.062], amplitude: 0.009 },
    { center: [0.232, 1.327, -0.063], radius: [0.058, 0.056, 0.046], amplitude: 0.006 },
  ] },
  { name: "upperArms", start: 7, end: 60, rest: 0.29, contours: [
    { center: [0.325, 1.210, 0.023], radius: [0.060, 0.077, 0.047], amplitude: 0.012 },
    { center: [0.301, 1.216, -0.055], radius: [0.066, 0.080, 0.047], amplitude: 0.005 },
  ] },
  { name: "forearms", start: 12, end: 70, rest: 0.24, contours: [
    { center: [0.396, 1.086, 0.020], radius: [0.069, 0.074, 0.046], amplitude: 0.007 },
  ] },
  { name: "torso", start: 11, end: 78, rest: 0.35, contours: [
    { center: [0.123, 1.280, 0.099], radius: [0.074, 0.057, 0.045], amplitude: 0.006 },
    { center: [0.145, 1.072, 0.011], radius: [0.040, 0.088, 0.065], amplitude: 0.008 },
    { center: [0.096, 1.154, -0.098], radius: [0.059, 0.096, 0.049], amplitude: 0.007 },
  ] },
  { name: "quadriceps", start: 9, end: 94, rest: 0.25, contours: [
    { center: [0.131, 0.718, 0.103], radius: [0.057, 0.153, 0.052], amplitude: 0.011 },
    { center: [0.181, 0.724, 0.045], radius: [0.049, 0.112, 0.060], amplitude: 0.008 },
    { center: [0.098, 0.600, 0.061], radius: [0.046, 0.077, 0.050], amplitude: 0.007 },
  ] },
  { name: "posteriorChain", start: 18, end: 98, rest: 0.28, contours: [
    { center: [0.116, 0.911, -0.121], radius: [0.076, 0.084, 0.065], amplitude: 0.013 },
    { center: [0.144, 0.750, -0.078], radius: [0.061, 0.117, 0.064], amplitude: 0.008 },
  ] },
  { name: "calves", start: 20, end: 89, rest: 0.31, contours: [
    { center: [0.142, 0.369, -0.081], radius: [0.049, 0.102, 0.062], amplitude: 0.009 },
    { center: [0.186, 0.354, -0.069], radius: [0.039, 0.092, 0.056], amplitude: 0.007 },
  ] },
] as const satisfies ReadonlyArray<{
  name: string; start: number; end: number; rest: number; contours: readonly MuscleContour[];
}>;

/** The contours follow skinning and carry their normal changes into the room lighting. */
export function addTrainerContours(mesh: SkinnedMesh): void {
  const geometry = mesh.geometry;
  const position = geometry.getAttribute("position");
  const normal = geometry.getAttribute("normal");
  geometry.morphTargetsRelative = true;

  const positions: BufferAttribute[] = [];
  const normals: BufferAttribute[] = [];
  const cutoff = Math.exp(-8);

  for (const { name, contours } of groups) {
    const offsets = new Float32Array(position.count * 3);
    const normalOffsets = new Float32Array(offsets.length);
    for (let i = 0; i < position.count; i++) {
      const px = position.getX(i), py = position.getY(i), pz = position.getZ(i);
      const nx = normal.getX(i), ny = normal.getY(i), nz = normal.getZ(i);
      let distance = 0, dx = 0, dy = 0, dz = 0;
      for (const { center: [x, y, z], radius: [rx, ry, rz], amplitude } of contours) {
        const a = (Math.abs(px) - x) / rx;
        const b = (py - y) / ry;
        const c = (pz - z) / rz;
        const radiusSquared = a * a + b * b + c * c;
        if (radiusSquared >= 8) continue;
        const falloff = Math.exp(-radiusSquared);
        const strength = amplitude * (falloff - cutoff);
        const derivative = -2 * amplitude * falloff;
        distance += strength;
        dx += derivative * a * Math.sign(px) / rx;
        dy += derivative * b / ry;
        dz += derivative * c / rz;
      }
      const n = i * 3;
      offsets[n] = nx * distance;
      offsets[n + 1] = ny * distance;
      offsets[n + 2] = nz * distance;
      const normalPart = nx * dx + ny * dy + nz * dz;
      normalOffsets[n] = nx * normalPart - dx;
      normalOffsets[n + 1] = ny * normalPart - dy;
      normalOffsets[n + 2] = nz * normalPart - dz;
    }

    const offsetAttribute = new BufferAttribute(offsets, 3);
    offsetAttribute.name = name;
    positions.push(offsetAttribute);
    normals.push(new BufferAttribute(normalOffsets, 3));
  }

  geometry.morphAttributes.position = positions;
  geometry.morphAttributes.normal = normals;
  mesh.updateMorphTargets();
}

/** Visual deformation for the squat animation, driven by the knee bend. */
export function poseTrainerContours(mesh: SkinnedMesh | null, flex: number, visible: boolean): void {
  const weights = mesh?.morphTargetInfluences;
  if (!weights) return;
  for (const [i, { start, end, rest }] of groups.entries()) {
    weights[i] = visible ? MathUtils.lerp(rest, 1, MathUtils.smoothstep(flex, start, end)) : 0;
  }
}
