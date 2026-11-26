import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";

// Die lokale Three-Typeninstallation bringt den Meshopt-Encoder mit.
const requireApp = createRequire(new URL("../apps/mobile-web/package.json", import.meta.url));
const requireTypes = createRequire(requireApp.resolve("@types/three/package.json"));
const { MeshoptEncoder, MeshoptSimplifier } = requireTypes("meshoptimizer");
await Promise.all([MeshoptEncoder.ready, MeshoptSimplifier.ready]);

const input = readFileSync(new URL("../assets-src/cc0/man-base-character-rigged.glb", import.meta.url));
const jsonEnd = 20 + input.readUInt32LE(12);
const model = JSON.parse(input.subarray(20, jsonEnd).toString("utf8"));
const binary = input.subarray(jsonEnd + 8);
const EXTENSION = "EXT_meshopt_compression";

const primitive = model.meshes[0].primitives[0];
const vertices = model.accessors[primitive.attributes.POSITION];
const indices = model.accessors[primitive.indices];
const vertexView = model.bufferViews[vertices.bufferView];
const indexView = model.bufferViews[indices.bufferView];
const readView = (view) => binary.subarray(view.byteOffset ?? 0, (view.byteOffset ?? 0) + view.byteLength);
const sourceVertices = readView(vertexView);
const strideInFloats = vertexView.byteStride / 4;
const skinJoints = model.skins[0].joints.length;
const attributeStride = 5 + skinJoints;
const attributeData = new Float32Array(vertices.count * attributeStride);
for (let i = 0; i < vertices.count; i++) {
  const src = i * vertexView.byteStride;
  const dst = i * attributeStride;
  for (let j = 0; j < 5; j++) attributeData[dst + j] = sourceVertices.readFloatLE(src + 12 + j * 4);
  for (let j = 0; j < 4; j++) {
    // Hautgewichte pro Gelenk vergleichen, unabhängig von der Reihenfolge der vier Einflüsse.
    attributeData[dst + 5 + sourceVertices[src + 32 + j]] += sourceVertices.readFloatLE(src + 36 + 4 * j);
  }
}
const [indexData] = MeshoptSimplifier.simplifyWithAttributes(
  new Uint32Array(Uint8Array.from(readView(indexView)).buffer),
  new Float32Array(Uint8Array.from(sourceVertices).buffer),
  strideInFloats, attributeData, attributeStride, [0.35, 0.35, 0.35, 0.55, 0.55, ...Array(skinJoints).fill(1.2)],
  null, 270_000, 0.009, ["Regularize"],
);
const [remap, vertexCount] = MeshoptEncoder.reorderMesh(indexData, true, true);
const packedIndices = vertexCount < 65_536 ? Uint16Array.from(indexData) : indexData;
indices.count = indexData.length;
indices.componentType = packedIndices.BYTES_PER_ELEMENT === 2 ? 5123 : 5125;
const vertexData = Buffer.alloc(vertexCount * vertexView.byteStride);
for (let i = 0; i < vertices.count; i++) {
  if (remap[i] >= vertexCount) continue;
  const from = i * vertexView.byteStride;
  sourceVertices.copy(vertexData, remap[i] * vertexView.byteStride, from, from + vertexView.byteStride);
}

// Animationen für Gehen und Laufen sind entbehrlich. Das Rig und die Texturen bleiben erhalten.
delete model.animations;
model.accessors = model.accessors.slice(0, model.skins[0].inverseBindMatrices + 1);
model.bufferViews = model.bufferViews.slice(0, model.accessors.at(-1).bufferView + 1);
for (const i of Object.values(primitive.attributes)) model.accessors[i].count = vertexCount;

let total = 0;
let uncompressed = 0;
const chunks = [];
function append(data) {
  const offset = total;
  const padding = (4 - data.byteLength % 4) % 4;
  chunks.push(Buffer.from(data), Buffer.alloc(padding));
  total += data.byteLength + padding;
  return offset;
}
for (const view of model.bufferViews) {
  if (view === vertexView || view === indexView) {
    const vertex = view === vertexView;
    const data = vertex ? vertexData : new Uint8Array(packedIndices.buffer);
    const count = vertex ? vertexCount : indices.count;
    const stride = vertex ? vertexView.byteStride : packedIndices.BYTES_PER_ELEMENT;
    const mode = vertex ? "ATTRIBUTES" : "TRIANGLES";
    const compressed = MeshoptEncoder.encodeGltfBuffer(data, count, stride, mode);
    view.extensions = { [EXTENSION]: { buffer: 0, byteOffset: append(compressed), byteLength: compressed.byteLength, count, byteStride: stride, mode } };
    view.buffer = 1;
    view.byteOffset = uncompressed;
    view.byteLength = data.byteLength;
    uncompressed += Math.ceil(data.byteLength / 4) * 4;
  } else view.byteOffset = append(readView(view));
}

model.extensionsUsed = [EXTENSION];
model.extensionsRequired = [EXTENSION];
model.buffers = [
  { byteLength: total },
  { byteLength: uncompressed, extensions: { [EXTENSION]: { fallback: true } } },
];
const json = Buffer.from(JSON.stringify(model));
const padding = Buffer.alloc((4 - json.byteLength % 4) % 4, " ");
function header(type, length) {
  const h = Buffer.alloc(8);
  h.writeUInt32LE(length);
  h.write(type, 4);
  return h;
}
const glb = Buffer.alloc(12);
glb.write("glTF");
glb.writeUInt32LE(2, 4);
glb.writeUInt32LE(28 + json.length + padding.length + total, 8);
writeFileSync(new URL("../apps/mobile-web/public/arena/trainer.glb", import.meta.url), Buffer.concat([
  glb, header("JSON", json.length + padding.length), json, padding, header("BIN\0", total), ...chunks,
]));
