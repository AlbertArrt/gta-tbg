// BUILD-TIME: glTF-Transform + meshoptimizer.
// Reads the baked Kenney / KayKit payloads (and a procedural bus), writes one
// meshopt GLB the game decodes with MeshoptDecoder. Run from the repo root:
//   NODE_PATH=/tmp/npm-tbg/node_modules node tools/compress_meshopt.mjs
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { Document, NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, meshopt } from '@gltf-transform/functions';
import { MeshoptEncoder } from 'meshoptimizer';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

function stubTHREE() {
  class BufferAttribute {
    constructor(array, itemSize) { this.array = array; this.itemSize = itemSize; }
  }
  class BufferGeometry {
    constructor() { this.attributes = {}; this.index = null; this.userData = {}; }
    setAttribute(name, attr) { this.attributes[name] = attr; return this; }
    setIndex(attr) { this.index = attr; return this; }
    computeBoundingSphere() {}
  }
  return { BufferAttribute, BufferGeometry };
}

function evalFile(file, extra) {
  const code = fs.readFileSync(file.startsWith('/') ? file : path.join(ROOT, file), 'utf8');
  const sandbox = { THREE: stubTHREE(), atob, console, ...extra };
  vm.createContext(sandbox);
  vm.runInContext(code + '\nthis.__out = { KIT: typeof KIT !== "undefined" ? KIT : null, KAY: typeof KAY !== "undefined" ? KAY : null };', sandbox);
  return sandbox.__out;
}

function boxMesh(w, h, d, x, y, z, rgb) {
  const hx = w / 2, hy = h / 2, hz = d / 2;
  const faces = [
    [[-1, 0, 0], [[-hx, -hy, -hz], [-hx, hy, -hz], [-hx, hy, hz], [-hx, -hy, hz]]],
    [[1, 0, 0], [[hx, -hy, hz], [hx, hy, hz], [hx, hy, -hz], [hx, -hy, -hz]]],
    [[0, -1, 0], [[-hx, -hy, hz], [hx, -hy, hz], [hx, -hy, -hz], [-hx, -hy, -hz]]],
    [[0, 1, 0], [[-hx, hy, -hz], [hx, hy, -hz], [hx, hy, hz], [-hx, hy, hz]]],
    [[0, 0, 1], [[-hx, -hy, hz], [-hx, hy, hz], [hx, hy, hz], [hx, -hy, hz]]],
    [[0, 0, -1], [[hx, -hy, -hz], [hx, hy, -hz], [-hx, hy, -hz], [-hx, -hy, -hz]]],
  ];
  const pos = [], nrm = [], col = [], idx = [];
  for (const [n, q] of faces) {
    const b = pos.length / 3;
    for (const p of q) { pos.push(p[0] + x, p[1] + y, p[2] + z); nrm.push(n[0], n[1], n[2]); col.push(rgb[0], rgb[1], rgb[2]); }
    idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }
  return { pos, nrm, col, idx };
}

function busMesh() {
  const parts = [
    [boxMesh(2.35, 1.05, 8.2, 0, 1.02, 0, [0.91, 0.55, 0.22]), 1],
    [boxMesh(2.22, 0.85, 7.15, 0, 1.88, -0.2, [0.25, 0.40, 0.55]), 0],
    [boxMesh(2.4, 0.26, 8.28, 0, 2.42, -0.05, [0.91, 0.55, 0.22]), 1],
    [boxMesh(1.7, 0.2, 0.08, 0, 2.54, 3.9, [0.96, 0.77, 0.19]), 2],
    [boxMesh(2.42, 0.2, 0.16, 0, 0.42, 4.14, [0.16, 0.13, 0.11]), 0],
    [boxMesh(2.42, 0.2, 0.16, 0, 0.42, -4.14, [0.16, 0.13, 0.11]), 0],
    [boxMesh(2.38, 0.12, 8.22, 0, 0.82, 0, [0.96, 0.95, 0.92]), 2],
  ];
  const pos = [], nrm = [], col = [], idx = [], tag = [];
  for (const [p, paint] of parts) {
    const b = pos.length / 3;
    pos.push(...p.pos); nrm.push(...p.nrm); col.push(...p.col);
    for (let i = 0; i < p.pos.length / 3; i++) tag.push(paint);
    for (const i of p.idx) idx.push(b + i);
  }
  return { pos: Float32Array.from(pos), nrm: Float32Array.from(nrm), col: Float32Array.from(col), idx, uv: null, tag: Float32Array.from(tag) };
}

function hostF32(arr) { return Float32Array.from(arr); }
function fromAttr(geo, withTag) {
  const pos = hostF32(geo.attributes.position.array);
  const nrm = hostF32(geo.attributes.normal.array);
  const col = geo.attributes.color ? hostF32(geo.attributes.color.array) : null;
  const uv = geo.attributes.uv ? hostF32(geo.attributes.uv.array) : null;
  const idx = geo.index ? Array.from(geo.index.array) : null;
  let tag = null;
  if (withTag && geo.userData.tags) tag = hostF32(geo.userData.tags);
  return { pos, nrm, col, uv, idx, tag };
}

function addPrim(doc, buffer, mesh, name, src) {
  const prim = doc.createPrimitive().setMode(4);
  const pAcc = doc.createAccessor(name + '_p').setType('VEC3').setArray(src.pos).setBuffer(buffer);
  const nAcc = doc.createAccessor(name + '_n').setType('VEC3').setArray(src.nrm).setBuffer(buffer);
  prim.setAttribute('POSITION', pAcc).setAttribute('NORMAL', nAcc);
  if (src.col) prim.setAttribute('COLOR_0', doc.createAccessor(name + '_c').setType('VEC3').setArray(src.col).setBuffer(buffer));
  if (src.uv) prim.setAttribute('TEXCOORD_0', doc.createAccessor(name + '_u').setType('VEC2').setArray(src.uv).setBuffer(buffer));
  if (src.tag) prim.setAttribute('_TAG', doc.createAccessor(name + '_t').setType('SCALAR').setArray(src.tag).setBuffer(buffer));
  if (src.idx) prim.setIndices(doc.createAccessor(name + '_i').setType('SCALAR').setArray(new Uint16Array(src.idx)).setBuffer(buffer));
  mesh.addPrimitive(prim);
  const node = doc.createNode(name).setMesh(mesh);
  doc.getRoot().getDefaultScene() || doc.createScene().addChild(node);
  const scene = doc.getRoot().listScenes()[0] || doc.createScene();
  if (!scene.listChildren().includes(node)) scene.addChild(node);
}

const beforeKit = fs.statSync(process.env.KIT_SRC || path.join(ROOT, 'src/03c_kit.js')).size;
const beforeKay = fs.statSync(process.env.KAY_SRC || path.join(ROOT, 'src/02b_shops.js')).size;
const kit = evalFile(process.env.KIT_SRC || 'src/03c_kit.js').KIT;
const kay = evalFile(process.env.KAY_SRC || 'src/02b_shops.js').KAY;

const doc = new Document();
doc.createBuffer('pack');
const buffer = doc.getRoot().listBuffers()[0];
doc.createScene('city');
const meta = { kit: {}, kay: {}, bus: true };

for (const [name, rec] of Object.entries(kit)) {
  const mesh = doc.createMesh(name);
  addPrim(doc, buffer, mesh, name, fromAttr(rec.geo, true));
  meta.kit[name] = { wr: rec.wr, wp: rec.wp, offs: rec.offs, rad: rec.rad, len: rec.len, wid: rec.wid, h: rec.h };
}
for (const [name, rec] of Object.entries(kay)) {
  const mesh = doc.createMesh('kay' + name);
  addPrim(doc, buffer, mesh, 'kay' + name, fromAttr(rec.geo, false));
  meta.kay[name] = { spanX: rec.spanX, spanZ: rec.spanZ };
}
{
  const mesh = doc.createMesh('kbus');
  addPrim(doc, buffer, mesh, 'kbus', busMesh());
}

const raw = await new NodeIO().writeBinary(doc);
await MeshoptEncoder.ready;
await doc.transform(dedup(), prune(), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
const packed = await io.writeBinary(doc);

const b64 = Buffer.from(packed).toString('base64');
const report = {
  before: { kitJs: beforeKit, kayJs: beforeKay, sum: beforeKit + beforeKay, glbUncompressed: raw.byteLength },
  after: { meshoptGlb: packed.byteLength, base64: b64.length },
};
fs.writeFileSync(path.join(ROOT, 'tools/meshopt-report.json'), JSON.stringify(report, null, 2));
const out = `// MESHOPT assets. Built by tools/compress_meshopt.mjs (glTF-Transform + meshoptimizer, MIT).
// before kit+kay js ${beforeKit + beforeKay} bytes, uncompressed glb ${raw.byteLength}, meshopt glb ${packed.byteLength}.
const MESHOPT_GLB = ${JSON.stringify(b64)};
const MESHOPT_META = ${JSON.stringify(meta)};
`;
fs.writeFileSync(path.join(ROOT, 'src/03b_meshopt_data.js'), out);
console.log(JSON.stringify(report, null, 2));
