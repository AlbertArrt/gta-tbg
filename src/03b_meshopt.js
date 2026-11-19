// MESHOPT runtime. glTF-Transform packed the Kenney bodies, KayKit shops and the bus.
// MeshoptDecoder (meshoptimizer, MIT) expands them before the city is built.
const MESH = { kit: {}, kay: {}, bus: null };
function meshoptBin(buf) {
  const dv = new DataView(buf);
  const jsonLen = dv.getUint32(12, true);
  const json = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 20, jsonLen)));
  const off = 20 + jsonLen;
  const binLen = dv.getUint32(off, true);
  const bin = new Uint8Array(buf, off + 8, binLen);
  return { json, bin };
}
function meshoptView(json, bin, viewIndex, cache) {
  if (cache.has(viewIndex)) return cache.get(viewIndex);
  const bv = json.bufferViews[viewIndex];
  const ext = bv.extensions && bv.extensions.EXT_meshopt_compression;
  let bytes;
  if (ext) {
    const count = ext.count, size = ext.byteStride;
    const source = bin.subarray(ext.byteOffset, ext.byteOffset + ext.byteLength);
    const target = new Uint8Array(count * size);
    MeshoptDecoder.decodeGltfBuffer(target, count, size, source, ext.mode, ext.filter || 'NONE');
    bytes = target;
  } else {
    bytes = bin.subarray(bv.byteOffset || 0, (bv.byteOffset || 0) + bv.byteLength);
  }
  cache.set(viewIndex, bytes);
  return bytes;
}
function meshoptRead(json, bin, accIndex, cache) {
  const acc = json.accessors[accIndex];
  const raw = meshoptView(json, bin, acc.bufferView, cache);
  const stride = json.bufferViews[acc.bufferView].byteStride || 0;
  const nComp = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[acc.type];
  const ctype = acc.componentType;
  const bytes = ctype === 5126 ? 4 : ctype === 5123 || ctype === 5122 ? 2 : 1;
  const step = stride || nComp * bytes;
  const out = new Float32Array(acc.count * nComp);
  const view = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
  for (let i = 0; i < acc.count; i++) {
    const base = (acc.byteOffset || 0) + i * step;
    for (let c = 0; c < nComp; c++) {
      const o = base + c * bytes;
      let v;
      if (ctype === 5126) v = view.getFloat32(o, true);
      else if (ctype === 5123) v = view.getUint16(o, true);
      else if (ctype === 5122) v = view.getInt16(o, true);
      else if (ctype === 5121) v = view.getUint8(o);
      else v = view.getInt8(o);
      if (acc.normalized) {
        if (ctype === 5122) v = Math.max(v / 32767, -1);
        else if (ctype === 5121) v = v / 255;
        else if (ctype === 5123) v = v / 65535;
        else v = Math.max(v / 127, -1);
      }
      out[i * nComp + c] = v;
    }
  }
  return out;
}
function meshoptIndices(json, bin, accIndex, cache) {
  const acc = json.accessors[accIndex];
  const raw = meshoptView(json, bin, acc.bufferView, cache);
  const view = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
  const idx = new Uint32Array(acc.count);
  const bytes = acc.componentType === 5125 ? 4 : 2;
  const base0 = acc.byteOffset || 0;
  for (let i = 0; i < acc.count; i++) {
    const o = base0 + i * bytes;
    idx[i] = bytes === 4 ? view.getUint32(o, true) : view.getUint16(o, true);
  }
  return idx;
}
function meshoptGeometry(json, bin, prim, cache) {
  const g = new THREE.BufferGeometry();
  const pos = meshoptRead(json, bin, prim.attributes.POSITION, cache);
  const nrm = meshoptRead(json, bin, prim.attributes.NORMAL, cache);
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  if (prim.attributes.COLOR_0) g.setAttribute('color', new THREE.BufferAttribute(meshoptRead(json, bin, prim.attributes.COLOR_0, cache), 3));
  if (prim.attributes.TEXCOORD_0) g.setAttribute('uv', new THREE.BufferAttribute(meshoptRead(json, bin, prim.attributes.TEXCOORD_0, cache), 2));
  if (prim.indices !== undefined) g.setIndex(new THREE.BufferAttribute(meshoptIndices(json, bin, prim.indices, cache), 1));
  if (prim.attributes._TAG) {
    const tag = meshoptRead(json, bin, prim.attributes._TAG, cache);
    const tags = new Uint8Array(tag.length);
    for (let i = 0; i < tag.length; i++) tags[i] = Math.round(tag[i]);
    g.userData.tags = tags;
  }
  g.computeBoundingSphere();
  return g;
}
async function decodeMeshoptAssets() {
  await MeshoptDecoder.ready;
  const raw = Uint8Array.from(atob(MESHOPT_GLB), (c) => c.charCodeAt(0));
  const { json, bin } = meshoptBin(raw.buffer);
  const cache = new Map();
  for (const mesh of json.meshes) {
    const geo = meshoptGeometry(json, bin, mesh.primitives[0], cache);
    if (mesh.name === 'kbus') MESH.bus = geo;
    else if (mesh.name.startsWith('kay')) {
      const id = mesh.name.slice(3);
      const m = MESHOPT_META.kay[id];
      KAY[id] = { geo, spanX: m.spanX, spanZ: m.spanZ };
      MESH.kay[id] = geo;
    } else {
      const m = MESHOPT_META.kit[mesh.name];
      KIT[mesh.name] = { geo, wr: m.wr, wp: m.wp, offs: m.offs, rad: m.rad, len: m.len, wid: m.wid, h: m.h };
      MESH.kit[mesh.name] = geo;
    }
  }
}
