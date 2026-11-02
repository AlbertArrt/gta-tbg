// GTA TBG (Tarnobrzeg) – open-world browser game on OpenStreetMap data (© OpenStreetMap contributors, ODbL)
import * as THREE from 'three';

const $ = (id) => document.getElementById(id);
const isTouch = (window.matchMedia && matchMedia('(pointer: coarse)').matches) || ('ontouchstart' in window && navigator.maxTouchPoints > 0);
const DEFAULTS = { quality: isTouch ? 'low' : 'med', time: 'day', sens: 1, fps: false, style: isTouch ? 'lite' : 'full', station: 0, radioAuto: true, radioVol: 0.8, steerSens: 1, btnScale: 1, leftHanded: false, vibrate: true };
let settings = { ...DEFAULTS };
try { Object.assign(settings, JSON.parse(localStorage.getItem('tb3d-settings') || '{}')); } catch (e) { /* storage unavailable */ }
const saveSettings = () => { try { localStorage.setItem('tb3d-settings', JSON.stringify(settings)); } catch (e) { /* ignore */ } };
const QUALITY = {
  low: { pr: 1.0, edge: 200, dist: 420, shadows: false, trees: 0.3, aa: false },
  med: { pr: 1.5, edge: 320, dist: 800, shadows: false, trees: 0.65, aa: true },
  high: { pr: 2.0, edge: 500, dist: 1400, shadows: true, trees: 1.0, aa: true },
};
// Styl graficzny: 'full' = komiks + post-process (kontury ekranowe, nasycenie), 'lite' = komiks bez post-processu, 'classic' = stary wygląd
if (!['full', 'lite', 'classic'].includes(settings.style)) settings.style = DEFAULTS.style;
const STYLE = settings.style;
const TOON = STYLE !== 'classic';

// ======================= RADIO – lista stacji (jedna tablica konfiguracyjna) =======================
// Darmowe, publicznie udostępniane strumienie internetowe. np = źródło "teraz gra" (tylko tam, gdzie jest publiczne API z CORS).
const RADIO_STATIONS = [
  { genre: 'Rock', name: 'Radio Paradise – Rock Mix', url: 'https://stream.radioparadise.com/rock-128', np: null, src: 'radioparadise.com' },
  { genre: 'Rock', name: 'SomaFM Left Coast 70s', url: 'https://ice2.somafm.com/seventies-128-mp3', np: { type: 'soma', id: 'seventies' }, src: 'somafm.com' },
  { genre: 'Metal', name: 'SomaFM Metal Detector', url: 'https://ice2.somafm.com/metal-128-mp3', np: { type: 'soma', id: 'metal' }, src: 'somafm.com' },
  { genre: 'Jazz', name: 'SomaFM Sonic Universe', url: 'https://ice2.somafm.com/sonicuniverse-128-mp3', np: { type: 'soma', id: 'sonicuniverse' }, src: 'somafm.com' },
  { genre: 'Jazz', name: 'SmoothJazz.com', url: 'https://smoothjazz.cdnstream1.com/2585_128.mp3', np: null, src: 'smoothjazz.com' },
  { genre: 'Chillout', name: 'SomaFM Groove Salad', url: 'https://ice2.somafm.com/groovesalad-128-mp3', np: { type: 'soma', id: 'groovesalad' }, src: 'somafm.com' },
  { genre: 'Chillout', name: 'Radio Paradise – Mellow Mix', url: 'https://stream.radioparadise.com/mellow-128', np: null, src: 'radioparadise.com' },
  { genre: 'Pop', name: 'SomaFM PopTron', url: 'https://ice2.somafm.com/poptron-128-mp3', np: { type: 'soma', id: 'poptron' }, src: 'somafm.com' },
  { genre: 'Pop', name: 'SomaFM Indie Pop Rocks!', url: 'https://ice2.somafm.com/indiepop-128-mp3', np: { type: 'soma', id: 'indiepop' }, src: 'somafm.com' },
  { genre: 'House', name: 'SomaFM Beat Blender', url: 'https://ice2.somafm.com/beatblender-128-mp3', np: { type: 'soma', id: 'beatblender' }, src: 'somafm.com' },
  { genre: 'House', name: 'Technolovers Deep House', url: 'https://stream.technolovers.fm/deep-house', np: null, src: 'technolovers.fm' },
  { genre: 'Lokalne', name: 'Radio Leliwa (Tarnobrzeg)', url: 'https://streaming.g-news.pl/radio/8050/leliwa', np: { type: 'leliwa', url: 'https://streaming.g-news.pl/api/nowplaying/leliwa' }, src: 'g-news.pl / radioleliwa.pl' },
];

function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const pick = (rnd, arr) => arr[Math.floor(rnd() * arr.length) % arr.length];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));

function setLoad(p, txt) { $('loadbar').style.width = (p * 100).toFixed(0) + '%'; if (txt) $('loadtxt').textContent = txt; }

async function loadData() {
  const el = document.getElementById('mapdata');
  if (el) return JSON.parse(el.textContent);
  const r = await fetch('data/tarnobrzeg.json');
  if (!r.ok) throw new Error('Nie można wczytać danych mapy');
  return r.json();
}

class GeoBuf {
  constructor() { this.p = []; this.n = []; this.c = []; this.uv = []; this.xa = null; this.xt = null; this.cA = null; this.cT = -1; }
  // optional per-vertex extras for the toon facade shader: accent colour + facade tile
  setX(acc, tile) { if (!this.xa) { this.xa = []; this.xt = []; } this.cA = acc; this.cT = tile; }
  get count() { return this.p.length / 3; }
  tri(ax, ay, az, bx, by, bz, cx, cy, cz, col, uvs, nx, ny, nz) {
    // fix winding so the face normal agrees with the desired normal
    const ux = bx - ax, uy = by - ay, uz = bz - az, vx = cx - ax, vy = cy - ay, vz = cz - az;
    const fx = uy * vz - uz * vy, fy = uz * vx - ux * vz, fz = ux * vy - uy * vx;
    const swap = fx * nx + fy * ny + fz * nz < 0;
    if (swap) this.p.push(ax, ay, az, cx, cy, cz, bx, by, bz); else this.p.push(ax, ay, az, bx, by, bz, cx, cy, cz);
    this.n.push(nx, ny, nz, nx, ny, nz, nx, ny, nz);
    this.c.push(col.r, col.g, col.b, col.r, col.g, col.b, col.r, col.g, col.b);
    if (uvs) { if (swap) this.uv.push(uvs[0], uvs[1], uvs[4], uvs[5], uvs[2], uvs[3]); else this.uv.push(uvs[0], uvs[1], uvs[2], uvs[3], uvs[4], uvs[5]); }
    else this.uv.push(0, 0, 0, 0, 0, 0);
    if (this.xa) { const a = this.cA || { r: 1, g: 1, b: 1 }; for (let k = 0; k < 3; k++) { this.xa.push(a.r, a.g, a.b); this.xt.push(this.cT); } }
  }
  quadFlat(x1, z1, x2, z2, x3, z3, x4, z4, y, col) {
    this.tri(x1, y, z1, x2, y, z2, x3, y, z3, col, null, 0, 1, 0);
    this.tri(x1, y, z1, x3, y, z3, x4, y, z4, col, null, 0, 1, 0);
  }
  toGeometry(other) {
    const g = new THREE.BufferGeometry();
    const cat = (a, b) => { if (!b) return a; const r = new Float32Array(a.length + b.length); r.set(a); r.set(b, a.length); return r; };
    g.setAttribute('position', new THREE.BufferAttribute(cat(new Float32Array(this.p), other && new Float32Array(other.p)), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(cat(new Float32Array(this.n), other && new Float32Array(other.n)), 3));
    g.setAttribute('color', new THREE.BufferAttribute(cat(new Float32Array(this.c), other && new Float32Array(other.c)), 3));
    g.setAttribute('uv', new THREE.BufferAttribute(cat(new Float32Array(this.uv), other && new Float32Array(other.uv)), 2));
    if (this.xa) {
      const n2 = other ? other.count : 0; const A = new Float32Array((this.count + n2) * 3), T = new Float32Array(this.count + n2).fill(-1);
      A.set(this.xa); T.set(this.xt);
      g.setAttribute('acc', new THREE.BufferAttribute(A, 3)); g.setAttribute('aTile', new THREE.BufferAttribute(T, 1));
    }
    if (other) { g.addGroup(0, this.count, 0); g.addGroup(this.count, other.count, 1); }
    g.computeBoundingSphere();
    this.p = this.n = this.c = this.uv = this.xa = this.xt = null;
    return g;
  }
}

function ringArea(r) { let s = 0; for (let i = 0, n = r.length / 2; i < n; i++) { const j = (i + n - 1) % n; s += r[j * 2] * r[i * 2 + 1] - r[i * 2] * r[j * 2 + 1]; } return s / 2; }
function pointInRing(x, z, r) {
  let inside = false;
  for (let i = 0, n = r.length / 2, j = n - 1; i < n; j = i++) {
    const xi = r[i * 2], zi = r[i * 2 + 1], xj = r[j * 2], zj = r[j * 2 + 1];
    if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}
function triangulate(ring, holes) {
  const toV = (r) => { const a = []; for (let i = 0; i < r.length; i += 2) a.push(new THREE.Vector2(r[i], r[i + 1])); return a; };
  const c = toV(ring), hs = (holes || []).map(toV);
  let faces;
  try { faces = THREE.ShapeUtils.triangulateShape(c, hs); } catch (e) { return { pts: [], faces: [] }; }
  return { pts: c.concat(...hs), faces };
}
function isConvex(r) {
  const n = r.length / 2; let sign = 0;
  for (let i = 0; i < n; i++) {
    const a = i, b = (i + 1) % n, c = (i + 2) % n;
    const cr = (r[b * 2] - r[a * 2]) * (r[c * 2 + 1] - r[b * 2 + 1]) - (r[b * 2 + 1] - r[a * 2 + 1]) * (r[c * 2] - r[b * 2]);
    if (Math.abs(cr) < 1e-6) continue;
    const s = Math.sign(cr); if (!sign) sign = s; else if (s !== sign) return false;
  }
  return true;
}

class SegGrid {
  constructor(cell) { this.cell = cell; this.cells = new Map(); this.s = []; this.meta = []; this.stamp = null; this.st = 1; }
  key(ix, iz) { return (ix + 4096) * 8192 + (iz + 4096); }
  add(x1, z1, x2, z2, meta) {
    const i = this.s.length / 4; this.s.push(x1, z1, x2, z2); this.meta.push(meta);
    const c = this.cell;
    const ix0 = Math.floor(Math.min(x1, x2) / c), ix1 = Math.floor(Math.max(x1, x2) / c);
    const iz0 = Math.floor(Math.min(z1, z2) / c), iz1 = Math.floor(Math.max(z1, z2) / c);
    for (let ix = ix0; ix <= ix1; ix++) for (let iz = iz0; iz <= iz1; iz++) {
      const k = this.key(ix, iz); let a = this.cells.get(k); if (!a) { a = []; this.cells.set(k, a); } a.push(i);
    }
  }
  finish() { this.s = new Float32Array(this.s); this.stamp = new Uint32Array(this.meta.length); }
  query(x, z, r, fn) {
    const c = this.cell; this.st++;
    const ix0 = Math.floor((x - r) / c), ix1 = Math.floor((x + r) / c), iz0 = Math.floor((z - r) / c), iz1 = Math.floor((z + r) / c);
    for (let ix = ix0; ix <= ix1; ix++) for (let iz = iz0; iz <= iz1; iz++) {
      const a = this.cells.get(this.key(ix, iz)); if (!a) continue;
      for (let k = 0; k < a.length; k++) { const i = a[k]; if (this.stamp[i] === this.st) continue; this.stamp[i] = this.st; fn(i); }
    }
  }
}
function closestOnSeg(px, pz, x1, z1, x2, z2, out) {
  const dx = x2 - x1, dz = z2 - z1; const L = dx * dx + dz * dz;
  let t = L > 0 ? ((px - x1) * dx + (pz - z1) * dz) / L : 0; t = clamp(t, 0, 1);
  out.x = x1 + dx * t; out.z = z1 + dz * t; out.t = t; return out;
}

// ======================= STYLE (komiks / cel-shading) =======================
const OUTLINE_COL = new THREE.Color('#2a211c');
let toonGradTex = null;
function toonGrad() {
  if (!toonGradTex) {
    toonGradTex = new THREE.DataTexture(new Uint8Array([118, 190, 255]), 3, 1, THREE.RedFormat);
    toonGradTex.minFilter = toonGradTex.magFilter = THREE.NearestFilter; toonGradTex.generateMipmaps = false; toonGradTex.needsUpdate = true;
  }
  return toonGradTex;
}
// material factory: toon (3-step gradient) in comic styles, Lambert in classic
function mkMat(p) {
  const q = { ...p };
  if (!TOON) return new THREE.MeshLambertMaterial(q);
  delete q.flatShading; delete q.shininess; delete q.specular;
  q.gradientMap = toonGrad();
  return new THREE.MeshToonMaterial(q);
}
// ---- inverted-hull outlines (thickness grows with distance ≈ constant on screen, capped)
const HULL_U = { uHullW: { value: 0.0026 }, uHullB: { value: 0.012 }, uHullMax: { value: 0.35 } };
const HULL = {};
function makeHullMat(box, maxW) {
  const m = new THREE.MeshBasicMaterial({ color: OUTLINE_COL, side: THREE.BackSide });
  const umax = { value: maxW };
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uHullW = HULL_U.uHullW; sh.uniforms.uHullB = HULL_U.uHullB; sh.uniforms.uHullMax = umax;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uHullW; uniform float uHullB; uniform float uHullMax;\n' + (box ? 'attribute vec3 hdir;\n' : ''))
      .replace('#include <begin_vertex>', `vec3 transformed = vec3( position );
      {
      #ifdef USE_INSTANCING
        mat4 hM = modelMatrix * instanceMatrix;
      #else
        mat4 hM = modelMatrix;
      #endif
        vec3 hs = vec3(length(hM[0].xyz), length(hM[1].xyz), length(hM[2].xyz));
        vec3 hw = (hM * vec4(position, 1.0)).xyz;
        float tw = min(uHullW * distance(cameraPosition, hw) + uHullB, uHullMax);
        transformed += ${box ? 'hdir' : 'normal'} * tw / hs;
      }`);
  };
  m.customProgramCacheKey = () => 'hull' + (box ? 'B' : 'N');
  return m;
}
function hullMats() {
  if (!HULL.box) { HULL.box = makeHullMat(true, 0.09); HULL.norm = makeHullMat(false, 0.28); HULL.small = makeHullMat(true, 0.05); }
  return HULL;
}
// adds the hull push-direction attribute (per-axis sign from the box centre) to a box-like geometry
function addHdir(geo) {
  geo.computeBoundingBox(); const c = new THREE.Vector3(); geo.boundingBox.getCenter(c);
  const p = geo.attributes.position, a = new Float32Array(p.count * 3);
  const sz = new THREE.Vector3(); geo.boundingBox.getSize(sz);
  for (let i = 0; i < p.count; i++) {
    const dx = p.getX(i) - c.x, dy = p.getY(i) - c.y, dz = p.getZ(i) - c.z;
    a[i * 3] = Math.abs(dx) > sz.x * 0.01 ? Math.sign(dx) : 0; a[i * 3 + 1] = Math.abs(dy) > sz.y * 0.01 ? Math.sign(dy) : 0; a[i * 3 + 2] = Math.abs(dz) > sz.z * 0.01 ? Math.sign(dz) : 0;
  }
  geo.setAttribute('hdir', new THREE.BufferAttribute(a, 3)); return geo;
}
// merge a list of box specs into one non-indexed geometry with vertex colours + hdir: [w,h,d,x,y,z,color, tag]
function mergeBoxes(specs) {
  const P = [], N = [], C = [], H = [], tags = [];
  const col = new THREE.Color();
  for (const s of specs) {
    const g = (s[8] || new THREE.BoxGeometry(s[0], s[1], s[2])).toNonIndexed(); if (!s[8]) addHdir(g); else if (!g.attributes.hdir) addHdir(g);
    g.translate(s[3], s[4], s[5]);
    const p = g.attributes.position, n = g.attributes.normal, h = g.attributes.hdir; col.set(s[6]);
    for (let i = 0; i < p.count; i++) { P.push(p.getX(i), p.getY(i), p.getZ(i)); N.push(n.getX(i), n.getY(i), n.getZ(i)); C.push(col.r, col.g, col.b); H.push(h.getX(i), h.getY(i), h.getZ(i)); tags.push(s[7] || 0); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3)); g.setAttribute('hdir', new THREE.Float32BufferAttribute(H, 3));
  g.userData.tags = tags; g.computeBoundingSphere(); return g;
}
function recolorTag(geo, tag, color) {
  const c = new THREE.Color(color), a = geo.attributes.color, t = geo.userData.tags;
  for (let i = 0; i < t.length; i++) if (t[i] === tag) a.setXYZ(i, c.r, c.g, c.b);
  a.needsUpdate = true;
}

// ---- screen-space line outlines for building edges (one instanced draw per chunk)
let edgeMat = null;
function getEdgeMat() {
  if (edgeMat) return edgeMat;
  edgeMat = new THREE.ShaderMaterial({
    fog: true,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uRes: { value: new THREE.Vector2(640, 360) }, uW: { value: 1.0 }, uNear: { value: 0.3 }, uFade: { value: 500 }, uCol: { value: OUTLINE_COL.clone() } }]),
    vertexShader: `attribute vec3 iA; attribute vec3 iB; uniform vec2 uRes; uniform float uW; uniform float uNear; uniform float uFade;
      #include <fog_pars_vertex>
      void main(){
        vec4 a = modelViewMatrix * vec4(iA, 1.0); vec4 b = modelViewMatrix * vec4(iB, 1.0);
        float nz = -uNear * 1.05;
        if (a.z > nz && b.z > nz) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
        if (a.z > nz) a = mix(b, a, (b.z - nz) / (b.z - a.z)); else if (b.z > nz) b = mix(a, b, (a.z - nz) / (a.z - b.z));
        a.xyz *= 0.9965; b.xyz *= 0.9965;
        vec4 pa = projectionMatrix * a, pb = projectionMatrix * b;
        vec2 sa = pa.xy / pa.w * uRes, sb = pb.xy / pb.w * uRes;
        vec2 d = sb - sa; float L = length(d); d = L > 1e-4 ? d / L : vec2(1.0, 0.0);
        vec2 n = vec2(-d.y, d.x);
        float e = position.x; vec4 p = e < 0.5 ? pa : pb; vec4 mvPosition = e < 0.5 ? a : b;
        float w = uW * clamp(1.5 - (-mvPosition.z) / uFade, 0.5, 1.0);
        vec2 off = (n * position.y + d * (e * 2.0 - 1.0) * 0.5) * w;
        p.xy += off / uRes * p.w;
        gl_Position = p;
        #include <fog_vertex>
      }`,
    fragmentShader: `uniform vec3 uCol;
      #include <fog_pars_fragment>
      void main(){ gl_FragColor = vec4(uCol, 1.0);
        #include <fog_fragment>
        #include <colorspace_fragment>
      }`,
  });
  return edgeMat;
}
let edgeBase = null;
function makeEdgeMesh(arr) {
  if (!edgeBase) edgeBase = new Float32Array([0, -1, 0, 1, -1, 0, 1, 1, 0, 0, -1, 0, 1, 1, 0, 0, 1, 0]);
  const n = arr.length / 6; const A = new Float32Array(n * 3), B = new Float32Array(n * 3);
  let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9, y1 = 0;
  for (let i = 0; i < n; i++) {
    A[i * 3] = arr[i * 6]; A[i * 3 + 1] = arr[i * 6 + 1]; A[i * 3 + 2] = arr[i * 6 + 2]; B[i * 3] = arr[i * 6 + 3]; B[i * 3 + 1] = arr[i * 6 + 4]; B[i * 3 + 2] = arr[i * 6 + 5];
    x0 = Math.min(x0, arr[i * 6], arr[i * 6 + 3]); x1 = Math.max(x1, arr[i * 6], arr[i * 6 + 3]); z0 = Math.min(z0, arr[i * 6 + 2], arr[i * 6 + 5]); z1 = Math.max(z1, arr[i * 6 + 2], arr[i * 6 + 5]); y1 = Math.max(y1, arr[i * 6 + 1], arr[i * 6 + 4]);
  }
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(edgeBase, 3));
  g.setAttribute('iA', new THREE.InstancedBufferAttribute(A, 3)); g.setAttribute('iB', new THREE.InstancedBufferAttribute(B, 3));
  g.instanceCount = n;
  const c = new THREE.Vector3((x0 + x1) / 2, y1 / 2, (z0 + z1) / 2);
  g.boundingSphere = new THREE.Sphere(c, Math.hypot(x1 - x0, z1 - z0, y1) / 2 + 1);
  const m = new THREE.Mesh(g, getEdgeMat()); m.matrixAutoUpdate = false; m.renderOrder = 1;
  return m;
}

// ---- facade atlas: 4 columns (bloki, bloki z balkonami, domy, przemysł) × 2 rows (piętra, parter/sklepy)
// colour texture + mask (R = wall paint, G = accent colour, B = window glass that can light up at night)
function makeFacadeAtlas(aniso) {
  const CW = 128, W2 = CW * 4, H2 = CW * 2;
  const mk = () => { const c = document.createElement('canvas'); c.width = W2; c.height = H2; return [c, c.getContext('2d')]; };
  const [cc, g] = mk(), [mc, m] = mk();
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, W2, H2); m.fillStyle = 'rgb(255,0,0)'; m.fillRect(0, 0, W2, H2);
  const OUT = '#2a211c', GLASS = '#8ec5ea', GLASS2 = '#5f9fd0';
  // rect in cell-local coords (x left→right, y bottom→top, 0..1)
  const R = (col, row, x0, y0, x1, y1) => { const px = (col + x0) * CW, py = (row === 0 ? H2 : CW) - y1 * CW; return [px, py, (x1 - x0) * CW, (y1 - y0) * CW]; };
  const rect = (col, row, x0, y0, x1, y1, color, mask) => { const r = R(col, row, x0, y0, x1, y1); g.fillStyle = color; g.fillRect(...r); m.fillStyle = mask; m.fillRect(...r); };
  const win = (col, row, x0, y0, x1, y1, cross) => {
    rect(col, row, x0 - 0.035, y0 - 0.035, x1 + 0.035, y1 + 0.035, OUT, 'rgb(0,0,0)');
    rect(col, row, x0, y0, x1, y1, GLASS, 'rgb(0,0,255)');
    const r = R(col, row, x0, y0, x1, y1); const grd = g.createLinearGradient(r[0], r[1], r[0] + r[2], r[1] + r[3]); grd.addColorStop(0, '#b9e0fa'); grd.addColorStop(0.55, GLASS); grd.addColorStop(1, GLASS2); g.fillStyle = grd; g.fillRect(...r);
    g.fillStyle = 'rgba(255,255,255,.55)'; g.beginPath(); g.moveTo(r[0] + r[2] * 0.12, r[1] + r[3] * 0.55); g.lineTo(r[0] + r[2] * 0.45, r[1] + r[3] * 0.12); g.lineTo(r[0] + r[2] * 0.58, r[1] + r[3] * 0.12); g.lineTo(r[0] + r[2] * 0.12, r[1] + r[3] * 0.72); g.fill();
    if (cross) { rect(col, row, (x0 + x1) / 2 - 0.018, y0, (x0 + x1) / 2 + 0.018, y1, OUT, 'rgb(0,0,0)'); rect(col, row, x0, y0 + (y1 - y0) * 0.62, x1, y0 + (y1 - y0) * 0.62 + 0.03, OUT, 'rgb(0,0,0)'); }
  };
  const band = (col, row, y0, y1) => { rect(col, row, 0, y0, 1, y1, '#ffffff', 'rgb(0,255,0)'); rect(col, row, 0, y1, 1, y1 + 0.02, OUT, 'rgb(0,0,0)'); };
  for (const row of [0, 1]) {
    // 0: bloki
    band(0, row, 0, 0.07);
    if (row === 0) { win(0, 0, 0.27, 0.3, 0.73, 0.8, true); rect(0, 0, 0.22, 0.22, 0.78, 0.27, '#ffffff', 'rgb(0,255,0)'); rect(0, 0, 0.22, 0.2, 0.78, 0.22, OUT, 'rgb(0,0,0)'); }
    else { // sklep: duża witryna + markiza w paski
      win(0, 1, 0.07, 0.1, 0.93, 0.68, false);
      for (let k = 0; k < 6; k++) rect(0, 1, k / 6, 0.74, (k + 1) / 6, 0.9, k % 2 ? '#ffffff' : '#ffffff', k % 2 ? 'rgb(0,0,0)' : 'rgb(0,255,0)');
      rect(0, 1, 0, 0.72, 1, 0.74, OUT, 'rgb(0,0,0)'); rect(0, 1, 0, 0.9, 1, 0.92, OUT, 'rgb(0,0,0)');
    }
    // 1: bloki z balkonami
    band(1, row, 0, 0.06);
    if (row === 0) {
      win(1, 0, 0.32, 0.3, 0.68, 0.86, true);
      rect(1, 0, 0.12, 0.06, 0.88, 0.36, OUT, 'rgb(0,0,0)'); rect(1, 0, 0.145, 0.085, 0.855, 0.335, '#ffffff', 'rgb(0,255,0)');
      for (let k = 1; k < 7; k++) rect(1, 0, 0.145 + k * 0.1, 0.085, 0.145 + k * 0.1 + 0.015, 0.335, OUT, 'rgb(0,0,0)');
    } else {
      win(1, 1, 0.1, 0.12, 0.9, 0.66, true);
      rect(1, 1, 0, 0.72, 1, 0.86, '#ffffff', 'rgb(0,255,0)'); rect(1, 1, 0, 0.7, 1, 0.72, OUT, 'rgb(0,0,0)');
    }
    // 2: domy – okno z okiennicami
    band(2, row, 0, 0.05);
    win(2, row, 0.34, 0.32, 0.66, 0.76, true);
    rect(2, row, 0.2, 0.3, 0.3, 0.78, OUT, 'rgb(0,0,0)'); rect(2, row, 0.215, 0.315, 0.285, 0.765, '#ffffff', 'rgb(0,255,0)');
    rect(2, row, 0.7, 0.3, 0.8, 0.78, OUT, 'rgb(0,0,0)'); rect(2, row, 0.715, 0.315, 0.785, 0.765, '#ffffff', 'rgb(0,255,0)');
    rect(2, row, 0.3, 0.27, 0.7, 0.31, '#ffffff', 'rgb(0,255,0)');
    // 3: przemysł – pas okien / brama
    for (let k = 0; k < 8; k++) rect(3, row, k / 8, 0, k / 8 + 0.012, 1, 'rgba(0,0,0,0.12)', 'rgb(200,0,0)');
    if (row === 0) win(3, 0, 0.0, 0.55, 1.0, 0.75, false);
    else { rect(3, 1, 0.12, 0, 0.88, 0.72, OUT, 'rgb(0,0,0)'); rect(3, 1, 0.15, 0, 0.85, 0.69, '#ffffff', 'rgb(0,255,0)'); for (let k = 1; k < 8; k++) rect(3, 1, 0.15, k * 0.085, 0.85, k * 0.085 + 0.012, OUT, 'rgb(0,0,0)'); }
  }
  const tex = new THREE.CanvasTexture(cc); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = aniso;
  const mask = new THREE.CanvasTexture(mc); mask.anisotropy = aniso;
  return { tex, mask };
}
function makeFacadeMat(aniso) {
  const { tex, mask } = makeFacadeAtlas(aniso);
  const mat = new THREE.MeshToonMaterial({ vertexColors: true, map: tex, gradientMap: toonGrad(), emissive: 0xffd28a, emissiveIntensity: 0 });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.facMask = { value: mask };
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec3 acc; attribute float aTile; varying vec3 vAcc; varying float vTile;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvAcc = acc; vTile = aTile;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform sampler2D facMask; varying vec3 vAcc; varying float vTile;')
      .replace('#include <map_fragment>', `float facLit = 0.0;
        if (vTile < -0.5) { diffuseColor.rgb *= vColor; }
        else {
          vec2 fu = vMapUv; vec2 cu = fract(fu); float fl = floor(fu.y);
          float tc = mod(vTile, 4.0); float shop = step(3.5, vTile);
          float row = (fl < 0.5 && (shop > 0.5 || tc > 2.5)) ? 1.0 : 0.0;
          vec2 auv = vec2((tc + cu.x) * 0.25, (row + cu.y) * 0.5);
          vec2 gx = dFdx(fu) * vec2(0.25, 0.5), gy = dFdy(fu) * vec2(0.25, 0.5);
          vec4 fc = textureGrad(map, auv, gx, gy); vec4 fm = textureGrad(facMask, auv, gx, gy);
          vec3 pc = mix(fc.rgb, vColor, fm.r); pc = mix(pc, vAcc, fm.g);
          diffuseColor.rgb *= pc;
          facLit = fm.b * step(0.42, fract(sin(dot(floor(fu) + vec2(vTile * 3.7, vTile), vec2(12.9898, 78.233))) * 43758.5453));
        }`)
      .replace('#include <color_fragment>', '')
      .replace('#include <emissivemap_fragment>', 'totalEmissiveRadiance *= facLit;');
  };
  mat.customProgramCacheKey = () => 'facade';
  return mat;
}

// ---- optional post-process (Komiks pełny): depth-edge outlines + slight saturation boost
const POST = { on: false };
function initPost() {
  const want = STYLE === 'full' && settings.quality !== 'low';
  if (!want) { POST.on = false; return; }
  POST.on = true; if (POST.rt) { resizePost(); return; }
  const sz = renderer.getDrawingBufferSize(new THREE.Vector2());
  const dt = new THREE.DepthTexture(sz.x, sz.y); dt.type = THREE.UnsignedIntType;
  POST.rt = new THREE.WebGLRenderTarget(sz.x, sz.y, { depthTexture: dt, samples: QUALITY[settings.quality].aa ? 4 : 0 });
  POST.mat = new THREE.ShaderMaterial({
    uniforms: { tCol: { value: POST.rt.texture }, tDep: { value: dt }, uPx: { value: new THREE.Vector2(1 / sz.x, 1 / sz.y) }, uNear: { value: camera.near }, uFar: { value: camera.far }, uCol: { value: OUTLINE_COL.clone() }, uSat: { value: 1.1 }, uK: { value: 1 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: `uniform sampler2D tCol; uniform sampler2D tDep; uniform vec2 uPx; uniform float uNear; uniform float uFar; uniform vec3 uCol; uniform float uSat; uniform float uK; varying vec2 vUv;
      float lin(float d){ return uNear * uFar / (uFar - d * (uFar - uNear)); }
      void main(){
        vec4 c = texture2D(tCol, vUv);
        float zc = lin(texture2D(tDep, vUv).x);
        vec2 o = uPx * uK;
        float z1 = lin(texture2D(tDep, vUv + vec2(o.x, 0.0)).x), z2 = lin(texture2D(tDep, vUv - vec2(o.x, 0.0)).x);
        float z3 = lin(texture2D(tDep, vUv + vec2(0.0, o.y)).x), z4 = lin(texture2D(tDep, vUv - vec2(0.0, o.y)).x);
        float dz = max(max(z1, z2), max(z3, z4)) - zc;
        float e = smoothstep(0.05, 0.12, dz / zc) * (1.0 - smoothstep(180.0, 420.0, zc));
        float l = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722)); c.rgb = max(mix(vec3(l), c.rgb, uSat), 0.0);
        c.rgb = mix(c.rgb, uCol, e * 0.9);
        gl_FragColor = vec4(c.rgb, 1.0);
        #include <colorspace_fragment>
      }`,
    depthTest: false, depthWrite: false,
  });
  POST.scene = new THREE.Scene(); POST.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const q = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), POST.mat); q.frustumCulled = false; POST.scene.add(q);
}
function resizePost() {
  if (!POST.on) return; const sz = renderer.getDrawingBufferSize(new THREE.Vector2());
  POST.rt.setSize(sz.x, sz.y); POST.mat.uniforms.uPx.value.set(1 / sz.x, 1 / sz.y); POST.mat.uniforms.uK.value = Math.max(1, renderer.getPixelRatio());
}
function renderFrame() {
  if (TOON) {
    const sz = renderer.getDrawingBufferSize(tmpSz); const em = getEdgeMat();
    em.uniforms.uRes.value.set(sz.x / 2, sz.y / 2); em.uniforms.uW.value = 1.05 * renderer.getPixelRatio(); em.uniforms.uNear.value = camera.near;
  }
  if (POST.on) {
    POST.mat.uniforms.uNear.value = camera.near; POST.mat.uniforms.uFar.value = camera.far;
    renderer.setRenderTarget(POST.rt); renderer.render(scene, camera); renderer.setRenderTarget(null); renderer.render(POST.scene, POST.cam);
  } else renderer.render(scene, camera);
}
const tmpSz = new THREE.Vector2();

// ======================= WORLD =======================
const W = {};
const tmpC = { x: 0, z: 0, t: 0 };

async function buildWorld(data, scene, renderer) {
  const Q = data.q;
  const dec = (a) => { const f = new Float32Array(a.length); for (let i = 0; i < a.length; i++) f[i] = a[i] / Q; return f; };
  W.data = data; W.rect = data.rect; W.names = data.names;
  const CH = 250;
  const chunks = new Map();
  const getChunk = (x, z) => { const k = Math.floor(x / CH) + ',' + Math.floor(z / CH); let c = chunks.get(k); if (!c) { c = { walls: new GeoBuf(), roofs: new GeoBuf(), area: new GeoBuf(), road: new GeoBuf(), mark: new GeoBuf(), water: new GeoBuf(), walk: new GeoBuf(), edges: [] }; if (TOON) c.walls.setX(null, -1); chunks.set(k, c); } return c; };
  W.visObjects = [];

  const maxAniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const { tex: winTex, emi: winEmi } = makeWindowTextures(maxAniso);
  W.mats = {
    wall: new THREE.MeshLambertMaterial({ vertexColors: true, map: winTex, emissive: 0xffd9a0, emissiveMap: winEmi, emissiveIntensity: 0 }),
    roof: new THREE.MeshLambertMaterial({ vertexColors: true }),
    area: new THREE.MeshLambertMaterial({ vertexColors: true, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 }),
    water: new THREE.MeshPhongMaterial({ color: 0x3f7398, specular: 0x9fc4e6, shininess: 90, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 }),
    road: new THREE.MeshLambertMaterial({ vertexColors: true, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -6 }),
    mark: new THREE.MeshLambertMaterial({ vertexColors: true, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -8 }),
    ground: new THREE.MeshLambertMaterial({ color: 0x93ad6e }),
  };
  if (TOON) {
    W.mats = {
      wall: makeFacadeMat(maxAniso),
      roof: mkMat({ vertexColors: true }),
      area: mkMat({ vertexColors: true, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 }),
      water: mkMat({ color: 0x47a6e0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 }),
      walk: mkMat({ vertexColors: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 }),
      road: mkMat({ vertexColors: true, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -6 }),
      mark: mkMat({ vertexColors: true, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -8 }),
      ground: mkMat({ color: 0xa3d65c }),
    };
  }

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(60000, 60000), W.mats.ground);
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);

  // ---- areas (landuse / parks / forests)
  const AREA_COL = TOON ? { grass: '#a6da5c', park: '#98d454', forest: '#7cbd4a', farmland: '#dcd27e', residential: '#b0dc66', industrial: '#cdc8bf', cemetery: '#94c560', pitch: '#7fc94b', sand: '#efdc9c', plaza: '#e3ddd0', parking: '#a2a3a6', wetland: '#8fc47a', scrub: '#8cc452', commercial: '#d8d1c6', garden: '#a2d85e', allotments: '#b2d968', orchard: '#9fd05a', railway: '#c4bcae' } : { grass: '#8dbb68', park: '#79b257', forest: '#4b8139', farmland: '#c8bd78', residential: '#aab394', industrial: '#b1aaa4', cemetery: '#779a64', pitch: '#4d9846', sand: '#d6c695', plaza: '#cbc2b1', parking: '#8c8c8a', wetland: '#7c9a70', scrub: '#789953', commercial: '#bcb3ab', garden: '#84b765', allotments: '#9cbc69', orchard: '#8fb45d', railway: '#a49c92' };
  const AREA_Y = { residential: 0.03, industrial: 0.03, commercial: 0.03, railway: 0.03, farmland: 0.035, grass: 0.045, scrub: 0.045, wetland: 0.045, forest: 0.042, orchard: 0.045, allotments: 0.045, sand: 0.05, park: 0.055, garden: 0.055, cemetery: 0.055, pitch: 0.06, parking: 0.065, plaza: 0.07 };
  const col = new THREE.Color();
  W.forests = []; W.parks = [];
  data.areas.forEach((a, idx) => {
    const kind = data.areaKinds[a[0]]; const ring = dec(a[1]); const holes = a.slice(2).map(dec);
    const rnd = mulberry32(idx * 7919 + 3);
    col.set(AREA_COL[kind] || '#a0a080');
    if (kind === 'farmland') col.offsetHSL((rnd() - 0.5) * 0.06, (rnd() - 0.5) * 0.2, (rnd() - 0.5) * 0.08);
    else col.offsetHSL(0, 0, (rnd() - 0.5) * 0.04);
    const y = AREA_Y[kind] || 0.04;
    const { pts, faces } = triangulate(ring, holes);
    for (const f of faces) {
      const A = pts[f[0]], B = pts[f[1]], C = pts[f[2]];
      getChunk((A.x + B.x + C.x) / 3, (A.y + B.y + C.y) / 3).area.tri(A.x, y, A.y, B.x, y, B.y, C.x, y, C.y, col, null, 0, 1, 0);
    }
    const rec = { ring, holes, kind, area: Math.abs(ringArea(ring)) };
    if (kind === 'residential') (W.resid = W.resid || []).push(rec);
    if (kind === 'forest' || kind === 'scrub' || kind === 'orchard') W.forests.push(rec);
    if (kind === 'park' || kind === 'cemetery' || kind === 'garden' || kind === 'allotments' || kind === 'pitch' || kind === 'grass') W.parks.push(rec);
  });
  setLoad(0.3, 'Woda i rzeki…'); await nextFrame();

  // ---- water
  W.water = [];
  const waterCol = new THREE.Color(1, 1, 1);
  data.water.forEach((w) => {
    const ring = dec(w[1]); const holes = w.slice(2).map(dec);
    const { pts, faces } = triangulate(ring, holes);
    W.water.push({ ring, holes, name: w[0] >= 0 ? data.names[w[0]] : null });
    for (const f of faces) {
      const A = pts[f[0]], B = pts[f[1]], C = pts[f[2]];
      getChunk((A.x + B.x + C.x) / 3, (A.y + B.y + C.y) / 3).water.tri(A.x, 0.1, A.y, B.x, 0.1, B.y, C.x, 0.1, C.y, waterCol, null, 0, 1, 0);
    }
  });
  W.waterways = [];
  data.waterways.forEach((w) => {
    const width = w[0] / 10; const pts = dec(w[2]);
    W.waterways.push({ width, pts });
    ribbon(pts, width, 0.095, waterCol, (x, z) => getChunk(x, z).water, false);
  });

  // ---- roads
  setLoad(0.4, 'Drogi i ulice…'); await nextFrame();
  const RT = data.roadTypes;
  const ROAD_COL = TOON ? { motorway: '#3b3d42', trunk: '#3b3d42', primary: '#3d3f44', secondary: '#3d3f44', tertiary: '#404247', residential: '#43454a', unclassified: '#43454a', living_street: '#4a4c51', service: '#55575c', pedestrian: '#e2dccf', track: '#c2a271', footway: '#e6e0d2', path: '#dccb9f', cycleway: '#d0806a', steps: '#d6d6d6' } : { motorway: '#45474b', trunk: '#45474b', primary: '#47494d', secondary: '#4a4c50', tertiary: '#535559', residential: '#5e6064', unclassified: '#5e6064', living_street: '#6a6a6c', service: '#6d6d6e', pedestrian: '#b9ae9c', track: '#9c8767', footway: '#c4baa5', path: '#b8a682', cycleway: '#a3675a', steps: '#a8a8a8' };
  const ROAD_RANK = { footway: 0, path: 0, steps: 0, cycleway: 1, track: 1, pedestrian: 2, service: 3, living_street: 4, unclassified: 5, residential: 5, tertiary: 6, secondary: 7, primary: 8, trunk: 9, motorway: 10 };
  const DRIVABLE = new Set(['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'residential', 'unclassified', 'living_street', 'service']);
  W.roadGrid = new SegGrid(40); W.roads = [];
  const white = new THREE.Color(TOON ? '#ffffff' : '#f2f2f2'), edge = new THREE.Color(TOON ? '#ffffff' : '#e9e3c8'), railCol = new THREE.Color('#4a4642');
  const SIDEWALK = new Set(['residential', 'unclassified', 'tertiary', 'secondary', 'primary', 'trunk', 'living_street']);
  const walkCol = new THREE.Color('#cfcbc5'), curbCol = new THREE.Color('#f6f4ef');
  data.roads.forEach((r) => {
    const type = RT[r[0]]; const name = r[1] >= 0 ? data.names[r[1]] : null; const width = r[2] / 10; const flags = r[4];
    const pts = dec(r[5]); if (pts.length < 4) return;
    const rec = { type, name, width, pts, drivable: DRIVABLE.has(type), bridge: !!(flags & 2), oneway: !!(flags & 1) };
    W.roads.push(rec);
    const y = 0.13 + ROAD_RANK[type] * 0.006;
    const c2 = new THREE.Color(ROAD_COL[type] || '#666');
    if (!trailInZone(type, pts)) ribbon(pts, width, y, c2, (x, z) => getChunk(x, z).road, true); // off-road trails are draped over the terrain later
    for (let i = 0; i < pts.length - 2; i += 2) W.roadGrid.add(pts[i], pts[i + 1], pts[i + 2], pts[i + 3], W.roads.length - 1);
    if (type === 'secondary' || type === 'tertiary' || type === 'primary' || type === 'trunk') {
      if (!rec.oneway) dashes(pts, 0.14, 3, 6, y + 0.02, white, (x, z) => getChunk(x, z).mark, 0);
      if (type !== 'tertiary') { dashes(pts, 0.12, 1e9, 0, y + 0.02, edge, (x, z) => getChunk(x, z).mark, width / 2 - 0.45); dashes(pts, 0.12, 1e9, 0, y + 0.02, edge, (x, z) => getChunk(x, z).mark, -(width / 2 - 0.45)); }
    }
    if (TOON && SIDEWALK.has(type) && !rec.bridge && !trailInZone(type, pts)) {
      const wf = (x, z) => getChunk(x, z).walk; const yw = 0.1;
      for (const sg of [1, -1]) { dashes(pts, 2.4, 1e9, 0, yw, walkCol, wf, sg * (width / 2 + 1.45)); dashes(pts, 0.4, 1e9, 0, yw + 0.002, curbCol, wf, sg * (width / 2 + 0.15)); }
    }
    if (rec.bridge && rec.drivable) railings(pts, width, (x, z) => getChunk(x, z).walls);
  });
  W.roadGrid.finish();
  buildRoadGraph();
  if (TOON) addZebras((x, z) => getChunk(x, z).mark, white);
  const ballast = new THREE.Color('#8b8378');
  data.rail.forEach((r) => {
    const pts = dec(r);
    ribbon(pts, 3.2, 0.12, ballast, (x, z) => getChunk(x, z).road, false);
    dashes(pts, 0.09, 1e9, 0, 0.2, railCol, (x, z) => getChunk(x, z).mark, 0.72);
    dashes(pts, 0.09, 1e9, 0, 0.2, railCol, (x, z) => getChunk(x, z).mark, -0.72);
  });

  // ---- buildings
  setLoad(0.55, 'Budynki…'); await nextFrame();
  W.bGrid = new SegGrid(16); W.buildings = []; W.bCells = new Map();
  const BK = data.bKinds;
  const PAL = TOON ? {
    house: ['#f3e6c8', '#f3e6c8', '#f0a24a', '#e8b83a', '#d2553f', '#b8a3d6', '#7fa8d8', '#f6d3a1', '#f3e6c8', '#f2c57c'],
    block: ['#f3e6c8', '#f3e6c8', '#f0a24a', '#e8b83a', '#d2553f', '#b8a3d6', '#7fa8d8', '#f6d3a1', '#eedfbf', '#9ccfc2'],
    ind: ['#c9cbcf', '#b4c0c9', '#d9d0bc', '#a9b4bd'],
    shed: ['#d9c6a4', '#c9b99c', '#e0d2b4'],
    com: ['#f3e6c8', '#7fa8d8', '#f0a24a', '#eae4da', '#b8a3d6'],
  } : {
    house: ['#ece0c6', '#f3e8d2', '#dccaa9', '#efe9de', '#e6d4b2', '#d2c9bb', '#f2dbb7', '#e1d8c7', '#cdb99c', '#e9d7c3', '#d8d3c4', '#f0e3c0'],
    block: ['#e7e3d9', '#d6dce0', '#ebdfc8', '#c7d2d8', '#eae2bc', '#d4c5b3', '#bccbd2', '#f1e6cf', '#dcd0c0', '#cfd8c6', '#e8d2c6'],
    ind: ['#a8acaf', '#99a2a7', '#b6b1a5', '#8f979d', '#b9b4ad'],
    shed: ['#9b9388', '#a8a199', '#8a857f', '#b0a48f'],
    com: ['#dadada', '#c7d4de', '#e0d0bf', '#d7e0d0', '#efe7dc'],
  };
  const ROOF_P = TOON ? ['#c8442f', '#d0602f', '#b5452e', '#c4502f', '#a93d2b'] : ['#8a3a2a', '#7b3025', '#5e5853', '#6d3c2a', '#4c5157', '#9c4b32', '#80462f', '#55463f'];
  const ROOF_F = TOON ? ['#c9c6c0', '#d8cdb8', '#c2beb6', '#dcd6ca'] : ['#6e6e6e', '#7a7672', '#5f6164', '#86827d', '#6a6560'];
  const BLOCKY = new Set(['apartments', 'residential', 'hotel', 'office', 'school', 'public', 'hospital', 'university', 'kindergarten']);
  const SHEDS = new Set(['garage', 'garages', 'shed', 'roof', 'farm_auxiliary']);
  const PITCH = new Set(['house', 'detached', 'semidetached_house', 'terrace', 'farm_auxiliary', 'church', 'chapel']);
  let bi = 0;
  for (const b of data.buildings) {
    const h = b[0] / 10, kind = BK[b[1]] || 'yes', est = b[2];
    const ring = dec(b[3]); const holes = b.slice(4).map(dec);
    const rnd = mulberry32(bi * 2654435761 + 17);
    let cx0 = 0, cz0 = 0; for (let i = 0; i < ring.length; i += 2) { cx0 += ring[i]; cz0 += ring[i + 1]; } cx0 /= ring.length / 2; cz0 /= ring.length / 2;
    const area = Math.abs(ringArea(ring));
    let palette = PAL.house;
    if (BLOCKY.has(kind) || (kind === 'yes' && area > 400)) palette = PAL.block;
    if (kind === 'industrial' || kind === 'warehouse') palette = PAL.ind;
    if (SHEDS.has(kind) || (kind === 'yes' && area < 40)) palette = PAL.shed;
    if (kind === 'commercial' || kind === 'retail') palette = PAL.com;
    const wcol = new THREE.Color(pick(rnd, palette));
    if (kind === 'church' || kind === 'chapel') wcol.set('#f1ece1');
    if (kind === 'castle') wcol.set('#efe5cf');
    wcol.offsetHSL(0, 0, (rnd() - 0.5) * (TOON ? 0.03 : 0.05));
    let tile = -1, acc = null;
    if (TOON) {
      const big = palette === PAL.block || palette === PAL.com;
      tile = palette === PAL.ind || palette === PAL.shed ? 3 : (big ? (rnd() < 0.5 ? 1 : 0) : 2);
      if (big && (kind === 'commercial' || kind === 'retail' || (Math.hypot(cx0 - W.data.travel[0][1], cz0 - W.data.travel[0][2]) < 900 && rnd() < 0.55))) tile += 4;
      if (kind === 'church' || kind === 'chapel' || kind === 'castle') tile = 2;
      acc = new THREE.Color(pick(rnd, wcol.getHSL({}).l > 0.75 ? ['#7a4a32', '#3f6e9a', '#c8442f', '#5f8f4a', '#8a5a9a'] : ['#fbf6ea', '#fbf6ea', '#f3e6c8', '#3f3a36']));
    }
    const pitched = (PITCH.has(kind) || (kind === 'yes' && area < 380 && area > 35)) && ring.length <= 24 && isConvex(ring) && !holes.length;
    let roofH = 0;
    if (pitched) roofH = (kind === 'church') ? Math.min(12, 3 + Math.sqrt(area) * 0.35) : Math.min(5, 1.6 + Math.sqrt(area) * 0.13);
    const wallH = Math.max(2.4, h - roofH * (est ? 0.6 : 0.7));
    const rcol = new THREE.Color(pitched ? pick(rnd, ROOF_P) : pick(rnd, ROOF_F));
    let cx = 0, cz = 0; const n = ring.length / 2; for (let i = 0; i < ring.length; i += 2) { cx += ring[i]; cz += ring[i + 1]; } cx /= n; cz /= n;
    const ch = getChunk(cx, cz);
    if (TOON) ch.walls.setX(acc, tile);
    const floors = Math.max(1, Math.round(wallH / 3)), fh = wallH / floors;
    const addWalls = (r, outer) => {
      const m = r.length / 2; let u0 = Math.floor(rnd() * 4) * 3 / 12; const pos = ringArea(r) > 0;
      for (let i = 0; i < m; i++) {
        const j = (i + 1) % m; const x1 = r[i * 2], z1 = r[i * 2 + 1], x2 = r[j * 2], z2 = r[j * 2 + 1];
        const len = Math.hypot(x2 - x1, z2 - z1); if (len < 0.05) continue;
        // in (x,z) with positive signed area, outward normal of edge = (dz, -dx)
        let nx = (z2 - z1) / len, nz = -(x2 - x1) / len; if (pos !== outer) { nx = -nx; nz = -nz; }
        let u1 = u0 + len / 12, v1 = wallH / 12;
        if (TOON) { u0 = 0; u1 = len < 1.6 ? len / 3 : Math.max(1, Math.round(len / 3)); v1 = floors; }
        ch.walls.tri(x1, 0, z1, x2, 0, z2, x2, wallH, z2, wcol, [u0, 0, u1, 0, u1, v1], nx, 0, nz);
        ch.walls.tri(x1, 0, z1, x2, wallH, z2, x1, wallH, z1, wcol, [u0, 0, u1, v1, u0, v1], nx, 0, nz);
        u0 = u1;
        W.bGrid.add(x1, z1, x2, z2, bi);
      }
    };
    addWalls(ring, true); holes.forEach((hr) => addWalls(hr, false));
    if (TOON) {
      ch.walls.setX(null, -1);
      const E = ch.edges;
      for (let i = 0; i < n; i++) {
        const ip = (i + n - 1) % n, j = (i + 1) % n;
        const x = ring[i * 2], z = ring[i * 2 + 1], ax = x - ring[ip * 2], az = z - ring[ip * 2 + 1], bx = ring[j * 2] - x, bz = ring[j * 2 + 1] - z;
        const la = Math.hypot(ax, az), lb = Math.hypot(bx, bz); if (lb < 0.05) continue;
        const turn = la > 0.05 ? Math.abs(ax * bz - az * bx) / (la * lb) : 1;
        if (turn > 0.34 || (ax * bx + az * bz) < 0) E.push(x, 0, z, x, wallH, z);
        E.push(x, wallH, z, ring[j * 2], wallH, ring[j * 2 + 1]);
      }
    }
    if (pitched) {
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n; const x1 = ring[i * 2], z1 = ring[i * 2 + 1], x2 = ring[j * 2], z2 = ring[j * 2 + 1];
        const ax = x2 - x1, az = z2 - z1, bx = cx - x1, by = roofH, bz = cz - z1;
        let nx = -az * by, ny = az * bx - ax * bz, nz = ax * by;
        if (ny < 0) { nx = -nx; ny = -ny; nz = -nz; }
        const L = Math.hypot(nx, ny, nz) || 1;
        ch.roofs.tri(x1, wallH, z1, x2, wallH, z2, cx, wallH + roofH, cz, rcol, null, nx / L, ny / L, nz / L);
        if (TOON) ch.edges.push(x1, wallH, z1, cx, wallH + roofH, cz);
      }
    } else {
      const { pts, faces } = triangulate(ring, holes);
      for (const f of faces) { const A = pts[f[0]], B = pts[f[1]], C = pts[f[2]]; ch.roofs.tri(A.x, wallH, A.y, B.x, wallH, B.y, C.x, wallH, C.y, rcol, null, 0, 1, 0); }
      if (TOON && area > 150 && wallH > 4.5) roofBoxes(ch, ring, holes, wallH, area, rnd);
    }
    W.buildings.push({ ring, cx, cz, h: wallH + roofH, kind });
    let x0 = 1e9, x1b = -1e9, z0 = 1e9, z1b = -1e9;
    for (let i = 0; i < ring.length; i += 2) { x0 = Math.min(x0, ring[i]); x1b = Math.max(x1b, ring[i]); z0 = Math.min(z0, ring[i + 1]); z1b = Math.max(z1b, ring[i + 1]); }
    for (let ix = Math.floor(x0 / 32); ix <= Math.floor(x1b / 32); ix++) for (let iz = Math.floor(z0 / 32); iz <= Math.floor(z1b / 32); iz++) {
      const k = ix * 100000 + iz; let a = W.bCells.get(k); if (!a) { a = []; W.bCells.set(k, a); } a.push(bi);
    }
    bi++;
    if (bi % 2000 === 0) { setLoad(0.55 + 0.2 * bi / data.buildings.length); await nextFrame(); }
  }
  W.bGrid.finish();

  setLoad(0.78, 'Składanie miasta…'); await nextFrame();
  W.chunkGroup = new THREE.Group(); scene.add(W.chunkGroup);
  for (const [, c] of chunks) {
    const addMesh = (geo, mat, opts = {}) => {
      const m = new THREE.Mesh(geo, mat);
      m.matrixAutoUpdate = false; m.updateMatrix();
      if (opts.cast) m.castShadow = true; m.receiveShadow = true;
      W.chunkGroup.add(m);
      const bs = geo.boundingSphere; W.visObjects.push({ obj: m, x: bs.center.x, z: bs.center.z, r: bs.radius, bias: opts.bias || 0 });
    };
    if (c.area.count) addMesh(c.area.toGeometry(), W.mats.area, { bias: 200 });
    if (c.water.count) addMesh(c.water.toGeometry(), W.mats.water, { bias: 400 });
    if (c.road.count) addMesh(c.road.toGeometry(), W.mats.road, { bias: 100 });
    if (c.walk.count) addMesh(c.walk.toGeometry(), W.mats.walk, { bias: -50 });
    if (c.mark.count) addMesh(c.mark.toGeometry(), W.mats.mark, { bias: -150 });
    if (c.walls.count || c.roofs.count) addMesh(c.walls.toGeometry(c.roofs), [W.mats.wall, W.mats.roof], { cast: true });
    if (c.edges.length) { const m = makeEdgeMesh(c.edges); W.chunkGroup.add(m); const bs = m.geometry.boundingSphere; W.visObjects.push({ obj: m, x: bs.center.x, z: bs.center.z, r: bs.radius, bias: -150, edge: true }); W.edgeCount = (W.edgeCount || 0) + c.edges.length / 6; c.edges = null; }
  }
  W.chunkCount = chunks.size;

  setLoad(0.83, 'Trasy off-road…'); await nextFrame();
  buildOffroad(scene);
  setLoad(0.86, 'Drzewa…'); await nextFrame();
  W.treeGroup = new THREE.Group(); scene.add(W.treeGroup);
  buildTrees(QUALITY[settings.quality].trees);
  W.travel = data.travel.slice();
  W.landmarks = data.landmarks;
  setLoad(0.95, 'Prawie gotowe…'); await nextFrame();
}

function ribbon(pts, width, y, color, bufFor, caps) {
  const n = pts.length / 2; if (n < 2) return;
  const hw = width / 2; const L = [], R = [];
  for (let i = 0; i < n; i++) {
    const x = pts[i * 2], z = pts[i * 2 + 1];
    let dx0 = 0, dz0 = 0, dx1 = 0, dz1 = 0;
    if (i > 0) { dx0 = x - pts[i * 2 - 2]; dz0 = z - pts[i * 2 - 1]; const l = Math.hypot(dx0, dz0) || 1; dx0 /= l; dz0 /= l; }
    if (i < n - 1) { dx1 = pts[i * 2 + 2] - x; dz1 = pts[i * 2 + 3] - z; const l = Math.hypot(dx1, dz1) || 1; dx1 /= l; dz1 /= l; }
    if (i === 0) { dx0 = dx1; dz0 = dz1; } if (i === n - 1) { dx1 = dx0; dz1 = dz0; }
    let tx = dx0 + dx1, tz = dz0 + dz1; const tl = Math.hypot(tx, tz);
    if (tl < 1e-6) { tx = dx1; tz = dz1; } else { tx /= tl; tz /= tl; }
    const nx = -tz, nz = tx;
    const cosHalf = Math.max(0.5, Math.abs(nx * -dz1 + nz * dx1));
    const m = hw / cosHalf;
    L.push(x + nx * m, z + nz * m); R.push(x - nx * m, z - nz * m);
  }
  for (let i = 0; i < n - 1; i++) {
    const mx = (pts[i * 2] + pts[i * 2 + 2]) / 2, mz = (pts[i * 2 + 1] + pts[i * 2 + 3]) / 2;
    bufFor(mx, mz).quadFlat(L[i * 2], L[i * 2 + 1], L[i * 2 + 2], L[i * 2 + 3], R[i * 2 + 2], R[i * 2 + 3], R[i * 2], R[i * 2 + 1], y, color);
  }
  if (caps && width >= 3) {
    for (const i of [0, n - 1]) {
      const x = pts[i * 2], z = pts[i * 2 + 1]; const b = bufFor(x, z); const seg = 8;
      for (let k = 0; k < seg; k++) {
        const a0 = k / seg * Math.PI * 2, a1 = (k + 1) / seg * Math.PI * 2;
        b.tri(x, y - 0.001, z, x + Math.cos(a0) * hw, y - 0.001, z + Math.sin(a0) * hw, x + Math.cos(a1) * hw, y - 0.001, z + Math.sin(a1) * hw, color, null, 0, 1, 0);
      }
    }
  }
}
function dashes(pts, w, dashLen, gap, y, color, bufFor, offset) {
  const n = pts.length / 2; let phase = 0; const period = dashLen + gap;
  for (let i = 0; i < n - 1; i++) {
    const x1 = pts[i * 2], z1 = pts[i * 2 + 1], x2 = pts[i * 2 + 2], z2 = pts[i * 2 + 3];
    const len = Math.hypot(x2 - x1, z2 - z1); if (len < 0.01) continue;
    const dx = (x2 - x1) / len, dz = (z2 - z1) / len; const nx = -dz, nz = dx;
    const ox = nx * offset, oz = nz * offset; const hw = w / 2;
    let s = 0;
    while (s < len - 1e-6) {
      const inP = phase % period;
      if (inP < dashLen) {
        const e = Math.min(len, s + (dashLen - inP));
        const ax = x1 + dx * s + ox, az = z1 + dz * s + oz, bx = x1 + dx * e + ox, bz = z1 + dz * e + oz;
        bufFor((ax + bx) / 2, (az + bz) / 2).quadFlat(ax + nx * hw, az + nz * hw, bx + nx * hw, bz + nz * hw, bx - nx * hw, bz - nz * hw, ax - nx * hw, az - nz * hw, y, color);
        phase += e - s; s = e;
      } else { const e = Math.min(len, s + (period - inP)); phase += e - s; s = e; }
    }
  }
}
function railings(pts, width, bufFor) {
  const c = new THREE.Color('#b8b8b4'); const n = pts.length / 2; const h = 1.0, t = 0.25;
  for (const side of [1, -1]) {
    for (let i = 0; i < n - 1; i++) {
      const x1 = pts[i * 2], z1 = pts[i * 2 + 1], x2 = pts[i * 2 + 2], z2 = pts[i * 2 + 3];
      const len = Math.hypot(x2 - x1, z2 - z1); if (len < 0.1) continue;
      const nx = -(z2 - z1) / len * side, nz = (x2 - x1) / len * side; const o = width / 2 + t / 2;
      const ax = x1 + nx * o, az = z1 + nz * o, bx = x2 + nx * o, bz = z2 + nz * o;
      const b = bufFor((ax + bx) / 2, (az + bz) / 2);
      b.tri(ax, 0.1, az, bx, 0.1, bz, bx, h, bz, c, null, nx, 0, nz); b.tri(ax, 0.1, az, bx, h, bz, ax, h, az, c, null, nx, 0, nz);
      b.tri(ax, 0.1, az, bx, 0.1, bz, bx, h, bz, c, null, -nx, 0, -nz); b.tri(ax, 0.1, az, bx, h, bz, ax, h, az, c, null, -nx, 0, -nz);
    }
  }
}
function makeWindowTextures(aniso) {
  const S = 512, cells = 4, cs = S / cells;
  const c = document.createElement('canvas'); c.width = c.height = S; const g = c.getContext('2d');
  const e = document.createElement('canvas'); e.width = e.height = S; const ge = e.getContext('2d');
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, S, S);
  const rnd = mulberry32(1234);
  for (let i = 0; i < 4000; i++) { g.fillStyle = `rgba(0,0,0,${(rnd() * 0.035).toFixed(3)})`; g.fillRect(rnd() * S, rnd() * S, 2, 2); }
  ge.fillStyle = '#000'; ge.fillRect(0, 0, S, S);
  for (let i = 0; i < cells; i++) for (let j = 0; j < cells; j++) {
    const x = i * cs, y = j * cs;
    const wx = x + cs * 0.27, wy = y + cs * 0.2, ww = cs * 0.46, wh = cs * 0.48;
    g.fillStyle = '#d9d6cf'; g.fillRect(wx - 5, wy - 5, ww + 10, wh + 12);
    const grd = g.createLinearGradient(wx, wy, wx + ww * 0.6, wy + wh);
    grd.addColorStop(0, '#41546a'); grd.addColorStop(1, '#7590a8');
    g.fillStyle = grd; g.fillRect(wx, wy, ww, wh);
    g.fillStyle = '#ebe8e2'; g.fillRect(wx + ww / 2 - 2, wy, 4, wh); g.fillRect(wx, wy + wh * 0.3, ww, 3);
    g.fillStyle = 'rgba(0,0,0,0.07)'; g.fillRect(x, y + cs - 5, cs, 5);
    if (rnd() < 0.5) { ge.fillStyle = pick(rnd, ['#ffd27a', '#ffe4a8', '#ffc864', '#fff0c8', '#cfe4ff']); ge.fillRect(wx, wy, ww, wh); }
  }
  const tex = new THREE.CanvasTexture(c); tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = aniso;
  const emi = new THREE.CanvasTexture(e); emi.wrapS = emi.wrapT = THREE.RepeatWrapping; emi.colorSpace = THREE.SRGBColorSpace; emi.anisotropy = aniso;
  return { tex, emi };
}

function insideBuilding(x, z, margin = 0) {
  const a = W.bCells.get(Math.floor(x / 32) * 100000 + Math.floor(z / 32));
  if (a) for (const i of a) if (pointInRing(x, z, W.buildings[i].ring)) return true;
  if (margin > 0) {
    let hit = false; const s = W.bGrid.s;
    W.bGrid.query(x, z, margin, (i) => { if (hit) return; closestOnSeg(x, z, s[i * 4], s[i * 4 + 1], s[i * 4 + 2], s[i * 4 + 3], tmpC); if ((tmpC.x - x) ** 2 + (tmpC.z - z) ** 2 < margin * margin) hit = true; });
    return hit;
  }
  return false;
}
function inWater(x, z) {
  for (const w of W.water) if (pointInRing(x, z, w.ring) && !w.holes.some((h) => pointInRing(x, z, h))) return true;
  return false;
}
function nearRoad(x, z, extra) {
  let hit = false; const s = W.roadGrid.s;
  W.roadGrid.query(x, z, 12, (i) => {
    if (hit) return; const r = W.roads[W.roadGrid.meta[i]];
    closestOnSeg(x, z, s[i * 4], s[i * 4 + 1], s[i * 4 + 2], s[i * 4 + 3], tmpC);
    if (Math.hypot(tmpC.x - x, tmpC.z - z) < r.width / 2 + extra) hit = true;
  });
  return hit;
}

function buildTrees(density) {
  for (const c of [...W.treeGroup.children]) { W.treeGroup.remove(c); c.dispose && c.dispose(); }
  W.visObjects = W.visObjects.filter((v) => !v.tree);
  W.treeGrid = new SegGrid(16);
  const rnd = mulberry32(99);
  const list = [];
  const [MINX, MINZ, MAXX, MAXZ] = W.rect;
  const MAX = Math.round(70000 * density);
  const t = W.data.trees;
  for (let i = 0; i < t.length; i += 2) list.push([t[i], t[i + 1], 0, 0.8 + rnd() * 0.5]);
  const scatter = (poly, per, conRatio) => {
    let count = Math.min(5000, Math.round(poly.area / per * density));
    let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9; const r = poly.ring;
    for (let i = 0; i < r.length; i += 2) { x0 = Math.min(x0, r[i]); x1 = Math.max(x1, r[i]); z0 = Math.min(z0, r[i + 1]); z1 = Math.max(z1, r[i + 1]); }
    let tries = count * 3;
    while (count > 0 && tries-- > 0) {
      const x = x0 + rnd() * (x1 - x0), z = z0 + rnd() * (z1 - z0);
      if (x < MINX || x > MAXX || z < MINZ || z > MAXZ) continue;
      if (!pointInRing(x, z, r) || poly.holes.some((h) => pointInRing(x, z, h))) continue;
      if (nearRoad(x, z, 1.5) || insideBuilding(x, z, 1.5)) continue;
      list.push([x, z, rnd() < conRatio ? 1 : 0, 0.75 + rnd() * 0.6]); count--;
    }
  };
  for (const f of W.forests) scatter(f, f.kind === 'forest' ? 110 : 300, f.kind === 'forest' ? 0.7 : 0.1);
  for (const p of W.parks) scatter(p, p.kind === 'park' ? 260 : (p.kind === 'grass' ? 2500 : (p.kind === 'pitch' ? 1e9 : 600)), 0.15);
  if (TOON && W.resid) for (const r of W.resid) scatter(r, 900, 0.08);
  if (list.length > MAX) { for (let i = list.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); const tmp = list[i]; list[i] = list[j]; list[j] = tmp; } list.length = MAX; }
  const cells = new Map(); const CS = TOON ? 250 : 400;
  for (const tr of list) {
    if (tr[0] < MINX || tr[0] > MAXX || tr[1] < MINZ || tr[1] > MAXZ) continue;
    const k = Math.floor(tr[0] / CS) + ',' + Math.floor(tr[1] / CS); let a = cells.get(k); if (!a) { a = []; cells.set(k, a); } a.push(tr);
    W.treeGrid.add(tr[0] - 0.01, tr[1], tr[0] + 0.01, tr[1], 0);
  }
  W.treeGrid.finish();
  if (TOON) { W.treeDensityNow = density; W.treeCount = buildTreesToon(list, rnd, cells); return; }
  if (!W.treeGeo) {
    const trunkGeo = new THREE.CylinderGeometry(0.16, 0.24, 2.4, 5); trunkGeo.translate(0, 1.2, 0);
    const decGeo = new THREE.IcosahedronGeometry(1.9, 0); decGeo.scale(1, 1.15, 1); decGeo.translate(0, 3.6, 0);
    const conGeo = new THREE.ConeGeometry(1.7, 5.5, 6); conGeo.translate(0, 4.4, 0);
    W.treeGeo = { trunkGeo, decGeo, conGeo };
    W.mats.trunk = new THREE.MeshLambertMaterial({ color: 0x6b4a32 });
    W.mats.leaf = new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true });
  }
  const { trunkGeo, decGeo, conGeo } = W.treeGeo;
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  const cDec = [new THREE.Color('#4f8a35'), new THREE.Color('#5d9a3c'), new THREE.Color('#467d32'), new THREE.Color('#6ea445')];
  const cCon = [new THREE.Color('#2f5e30'), new THREE.Color('#37683a'), new THREE.Color('#2b5530')];
  let total = 0;
  for (const [, arr] of cells) {
    const trunks = new THREE.InstancedMesh(trunkGeo, W.mats.trunk, arr.length);
    const nd = arr.filter((a) => a[2] === 0).length, nc = arr.length - nd;
    const dm = nd ? new THREE.InstancedMesh(decGeo, W.mats.leaf, nd) : null;
    const cm = nc ? new THREE.InstancedMesh(conGeo, W.mats.leaf, nc) : null;
    let di = 0, ci = 0;
    arr.forEach((tr, i) => {
      p.set(tr[0], terrainH(tr[0], tr[1]) - 0.05, tr[1]); q.setFromAxisAngle(up, rnd() * 6.28); s.setScalar(tr[3]); m4.compose(p, q, s); trunks.setMatrixAt(i, m4);
      s.set(tr[3] * (0.9 + rnd() * 0.25), tr[3] * (0.9 + rnd() * 0.3), tr[3] * (0.9 + rnd() * 0.25)); m4.compose(p, q, s);
      if (tr[2] === 0) { dm.setMatrixAt(di, m4); dm.setColorAt(di, pick(rnd, cDec)); di++; } else { cm.setMatrixAt(ci, m4); cm.setColorAt(ci, pick(rnd, cCon)); ci++; }
    });
    for (const m of [trunks, dm, cm]) {
      if (!m) continue; m.castShadow = true; m.computeBoundingSphere(); W.treeGroup.add(m);
      const bs = m.boundingSphere; W.visObjects.push({ obj: m, x: bs.center.x, z: bs.center.z, r: bs.radius, bias: -250, tree: true });
    }
    total += arr.length;
  }
  W.treeCount = total;
}

// small rooftop boxes (wentylatory, klatki schodowe) on flat roofs – comic style only
const RB_COL = [new THREE.Color('#e9e5dc'), new THREE.Color('#b9b5ad'), new THREE.Color('#d6d0c4')];
function roofBoxes(ch, ring, holes, y0, area, rnd) {
  const n = ring.length / 2; let best = 0, ang = 0;
  for (let i = 0; i < n; i++) { const j = (i + 1) % n; const dx = ring[j * 2] - ring[i * 2], dz = ring[j * 2 + 1] - ring[i * 2 + 1]; const l = dx * dx + dz * dz; if (l > best) { best = l; ang = Math.atan2(dz, dx); } }
  const ux = Math.cos(ang), uz = Math.sin(ang), vx = -uz, vz = ux;
  let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9; for (let i = 0; i < ring.length; i += 2) { x0 = Math.min(x0, ring[i]); x1 = Math.max(x1, ring[i]); z0 = Math.min(z0, ring[i + 1]); z1 = Math.max(z1, ring[i + 1]); }
  const nb = area > 1200 ? 3 : (area > 400 ? 2 : 1);
  const inside = (x, z) => pointInRing(x, z, ring) && !holes.some((h) => pointInRing(x, z, h));
  for (let k = 0; k < nb; k++) {
    for (let t = 0; t < 6; t++) {
      const cx = x0 + (0.2 + 0.6 * rnd()) * (x1 - x0), cz = z0 + (0.2 + 0.6 * rnd()) * (z1 - z0);
      const a = 0.8 + rnd() * 1.4, b = 0.8 + rnd() * 1.4, hh = 0.8 + rnd() * 1.3;
      const P = [[-a, -b], [a, -b], [a, b], [-a, b]].map(([p, q]) => [cx + ux * p + vx * q, cz + uz * p + vz * q]);
      if (!P.every(([x, z]) => inside(x, z)) || !inside(cx, cz)) continue;
      const c = pick(rnd, RB_COL), yt = y0 + hh;
      ch.roofs.tri(P[0][0], yt, P[0][1], P[1][0], yt, P[1][1], P[2][0], yt, P[2][1], c, null, 0, 1, 0);
      ch.roofs.tri(P[0][0], yt, P[0][1], P[2][0], yt, P[2][1], P[3][0], yt, P[3][1], c, null, 0, 1, 0);
      for (let i = 0; i < 4; i++) {
        const A = P[i], B = P[(i + 1) % 4]; const ex = B[0] - A[0], ez = B[1] - A[1], L = Math.hypot(ex, ez) || 1; const nx = ez / L, nz = -ex / L;
        const mx = (A[0] + B[0]) / 2 - cx, mz = (A[1] + B[1]) / 2 - cz; const sg = (nx * mx + nz * mz) > 0 ? 1 : -1;
        ch.roofs.tri(A[0], y0, A[1], B[0], y0, B[1], B[0], yt, B[1], c, null, nx * sg, 0, nz * sg);
        ch.roofs.tri(A[0], y0, A[1], B[0], yt, B[1], A[0], yt, A[1], c, null, nx * sg, 0, nz * sg);
        ch.edges.push(A[0], y0, A[1], A[0], yt, A[1], A[0], yt, A[1], B[0], yt, B[1]);
      }
      break;
    }
  }
}

// ---- comic-style trees: puffy two-tone clustered spheres with an outline hull, LOD by cell distance; hedges
function smoothIco(r, detail) { const g = new THREE.IcosahedronGeometry(r, detail); const p = g.attributes.position, n = g.attributes.normal; for (let i = 0; i < p.count; i++) { const l = Math.hypot(p.getX(i), p.getY(i), p.getZ(i)) || 1; n.setXYZ(i, p.getX(i) / l, p.getY(i) / l, p.getZ(i) / l); } return g; }
function mergeTree(parts) {
  // parts: [geo, tx, ty, tz, sx, sy, sz, color|null(two-tone leaf)]
  const P = [], N = [], C = [];
  for (const [g0, tx, ty, tz, sx, sy, sz, colr] of parts) {
    const g = g0.index ? g0.toNonIndexed() : g0; const p = g.attributes.position, n = g.attributes.normal; const c = colr ? new THREE.Color(colr) : null;
    for (let i = 0; i < p.count; i++) {
      P.push(p.getX(i) * sx + tx, p.getY(i) * sy + ty, p.getZ(i) * sz + tz); N.push(n.getX(i), n.getY(i), n.getZ(i));
      if (c) C.push(c.r, c.g, c.b); else { const k = n.getY(i) > 0.15 ? 1.0 : 0.74; C.push(k, k, k); }
    }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3)); g.computeBoundingSphere(); return g;
}
function treeToonMat() {
  const m = mkMat({ vertexColors: true });
  // trunk vertices (brown: r > g) keep their colour, leaves get the per-instance green
  m.onBeforeCompile = (sh) => { sh.vertexShader = sh.vertexShader.replace('#include <color_vertex>', `#include <color_vertex>
    #if defined( USE_INSTANCING_COLOR ) && defined( USE_COLOR )
      vColor.xyz = color.xyz * mix(instanceColor.xyz, vec3(1.0), step(color.g + 0.05, color.r));
    #endif`); };
  m.customProgramCacheKey = () => 'treeToon'; return m;
}
const TREE_NEAR = 170;
function buildTreesToon(list, rnd, cells) {
  hullMats();
  if (!W.treeGeoT) {
    const T = '#7a5236';
    const trunk = new THREE.CylinderGeometry(0.17, 0.26, 2.6, 6); trunk.translate(0, 1.3, 0);
    const decN = mergeTree([[trunk, 0, 0, 0, 1, 1, 1, T], [smoothIco(1.75, 1), 0, 3.5, 0, 1, 0.95, 1, null], [smoothIco(1.2, 1), 1.0, 4.25, 0.35, 1, 1, 1, null], [smoothIco(1.15, 1), -0.85, 4.05, -0.55, 1, 1, 1, null], [smoothIco(1.0, 0), 0.15, 4.9, 0.1, 1, 1, 1, null]]);
    const decF = mergeTree([[trunk, 0, 0, 0, 1, 1, 1, T], [smoothIco(2.1, 0), 0, 3.9, 0, 1, 0.95, 1, null]]);
    const cone = (r, h, y) => { const g = new THREE.ConeGeometry(r, h, 8); g.translate(0, y, 0); return g; };
    const conN = mergeTree([[trunk, 0, 0, 0, 1, 1, 1, T], [cone(1.9, 3.2, 3.2), 0, 0, 0, 1, 1, 1, null], [cone(1.45, 2.8, 4.9), 0, 0, 0, 1, 1, 1, null], [cone(0.95, 2.2, 6.4), 0, 0, 0, 1, 1, 1, null]]);
    const conF = mergeTree([[trunk, 0, 0, 0, 1, 1, 1, T], [cone(1.8, 5.6, 4.4), 0, 0, 0, 1, 1, 1, null]]);
    const hedge = addHdir(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0));
    W.treeGeoT = { decN, decF, conN, conF, hedge };
    W.mats.treeT = treeToonMat(); W.mats.hedge = mkMat({ color: 0x5aa83a });
  }
  const { decN, decF, conN, conF } = W.treeGeoT;
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  const cDec = ['#5fb53a', '#6cc23f', '#4fa336', '#7fcf45', '#58ad3c'].map((c) => new THREE.Color(c));
  const cCon = ['#3f8f3a', '#46a043', '#37833a'].map((c) => new THREE.Color(c));
  let total = 0;
  for (const [, arr] of cells) {
    const dec = arr.filter((a) => a[2] === 0), con = arr.filter((a) => a[2] === 1);
    for (const [grp, gN, gF, pal] of [[dec, decN, decF, cDec], [con, conN, conF, cCon]]) {
      if (!grp.length) continue;
      const mN = new THREE.InstancedMesh(gN, W.mats.treeT, grp.length), mF = new THREE.InstancedMesh(gF, W.mats.treeT, grp.length);
      grp.forEach((tr, i) => {
        p.set(tr[0], terrainH(tr[0], tr[1]) - 0.05, tr[1]); q.setFromAxisAngle(up, rnd() * 6.28);
        s.set(tr[3] * (0.9 + rnd() * 0.25), tr[3] * (0.9 + rnd() * 0.3), tr[3] * (0.9 + rnd() * 0.25)); m4.compose(p, q, s);
        mN.setMatrixAt(i, m4); mF.setMatrixAt(i, m4); const c = pick(rnd, pal); mN.setColorAt(i, c); mF.setColorAt(i, c);
      });
      const hull = new THREE.InstancedMesh(gN, HULL.norm, grp.length); hull.instanceMatrix = mN.instanceMatrix;
      for (const [m, near] of [[mN, true], [hull, true], [mF, false]]) {
        m.castShadow = m !== hull; m.computeBoundingSphere(); if (m === hull) m.boundingSphere = mN.boundingSphere; W.treeGroup.add(m);
        const bs = m.boundingSphere; W.visObjects.push({ obj: m, x: bs.center.x, z: bs.center.z, r: bs.radius, bias: -250, tree: true, near, far: !near });
      }
    }
    total += arr.length;
  }
  // hedges along residential streets
  const H = []; const hr = mulberry32(7); const MAXH = Math.round(2600 * W.treeDensityNow);
  for (const r of W.roads) {
    if (H.length >= MAXH) break; if (r.type !== 'residential' && r.type !== 'living_street') continue; if (trailInZone(r.type, r.pts)) continue;
    const pts = r.pts;
    for (let i = 0; i < pts.length - 2 && H.length < MAXH; i += 2) {
      const x1 = pts[i], z1 = pts[i + 1], x2 = pts[i + 2], z2 = pts[i + 3]; const len = Math.hypot(x2 - x1, z2 - z1); if (len < 8) continue;
      const dx = (x2 - x1) / len, dz = (z2 - z1) / len; const nx = -dz, nz = dx;
      for (let t = 2; t < len - 6; t += 14) {
        if (hr() > 0.4) continue; const L = 3 + hr() * 6; const sg = hr() < 0.5 ? 1 : -1; const o = sg * (r.width / 2 + 3.1);
        const ax = x1 + dx * t + nx * o, az = z1 + dz * t + nz * o, bx = ax + dx * L, bz = az + dz * L, mx = (ax + bx) / 2, mz = (az + bz) / 2;
        if (insideBuilding(ax, az, 0.8) || insideBuilding(bx, bz, 0.8) || insideBuilding(mx, mz, 0.8) || nearRoad(mx, mz, 0.6) || inWater(mx, mz)) continue;
        H.push([mx, mz, Math.atan2(dx, dz), L, 0.8 + hr() * 0.5]);
      }
    }
  }
  const hc = new Map();
  for (const h of H) { const k = Math.floor(h[0] / 500) + ',' + Math.floor(h[1] / 500); let a = hc.get(k); if (!a) { a = []; hc.set(k, a); } a.push(h); }
  for (const [, arr] of hc) {
    const m = new THREE.InstancedMesh(W.treeGeoT.hedge, W.mats.hedge, arr.length);
    arr.forEach((h, i) => { p.set(h[0], 0.02, h[1]); q.setFromAxisAngle(up, h[2]); s.set(0.95, h[4], h[3]); m4.compose(p, q, s); m.setMatrixAt(i, m4); });
    const hull = new THREE.InstancedMesh(W.treeGeoT.hedge, HULL.box, arr.length); hull.instanceMatrix = m.instanceMatrix;
    m.castShadow = true; m.computeBoundingSphere(); hull.boundingSphere = m.boundingSphere; W.treeGroup.add(m); W.treeGroup.add(hull);
    for (const o of [m, hull]) W.visObjects.push({ obj: o, x: m.boundingSphere.center.x, z: m.boundingSphere.center.z, r: m.boundingSphere.radius, bias: -400, tree: true });
  }
  W.hedgeCount = H.length;
  return total;
}

// ======================= ENTITIES =======================
function box(w, h, d, color, x, y, z, mat) {
  const geo = new THREE.BoxGeometry(w, h, d);
  const m = new THREE.Mesh(geo, mat || mkMat({ color }));
  m.position.set(x, y, z); m.castShadow = true;
  if (TOON && !box.noHull) { addHdir(geo); const hl = new THREE.Mesh(geo, hullMats().small); m.add(hl); }
  return m;
}
function makeWalker(opt = {}) {
  const g = new THREE.Group();
  const skin = mkMat({ color: opt.skin || 0xe2b08c });
  const shirt = mkMat({ color: opt.shirt || 0xf2c218 });
  const pants = mkMat({ color: opt.pants || 0x2c3e66 });
  const shoes = mkMat({ color: 0x222222 });
  const hair = mkMat({ color: opt.hair || 0x3a2a1c });
  const body = new THREE.Group(); g.add(body);
  body.add(box(0.5, 0.62, 0.28, 0, 0, 1.22, 0, shirt));
  body.add(box(0.51, 0.1, 0.29, 0, 0, 1.2, 0, mkMat({ color: opt.belt || 0x1f5fbf })));
  const head = new THREE.Group(); head.position.set(0, 1.68, 0); body.add(head);
  head.add(box(0.3, 0.32, 0.3, 0, 0, 0, 0, skin)); head.add(box(0.32, 0.1, 0.32, 0, 0, 0.15, 0.0, opt.cap ? mkMat({ color: opt.cap }) : hair));
  box.noHull = true; head.add(box(0.06, 0.05, 0.02, 0, -0.07, 0.03, 0.155, shoes)); head.add(box(0.06, 0.05, 0.02, 0, 0.07, 0.03, 0.155, shoes)); box.noHull = false;
  const limb = (w, h, mat, x, y) => { const p = new THREE.Group(); p.position.set(x, y, 0); const m = box(w, h, w, 0, 0, -h / 2, 0, mat); p.add(m); body.add(p); return p; };
  const armL = limb(0.14, 0.6, shirt, -0.33, 1.5), armR = limb(0.14, 0.6, shirt, 0.33, 1.5);
  armL.children[0].add(box(0.13, 0.14, 0.13, 0, 0, -0.33, 0, skin)); armR.children[0].add(box(0.13, 0.14, 0.13, 0, 0, -0.33, 0, skin));
  const legL = limb(0.19, 0.88, pants, -0.13, 0.9), legR = limb(0.19, 0.88, pants, 0.13, 0.9);
  legL.children[0].add(box(0.2, 0.1, 0.3, 0, 0, -0.44, 0.05, shoes)); legR.children[0].add(box(0.2, 0.1, 0.3, 0, 0, -0.44, 0.05, shoes));
  g.userData = { body, armL, armR, legL, legR, phase: 0 };
  return g;
}
function animateWalker(w, speed, dt, air) {
  const u = w.userData;
  if (air) { u.armL.rotation.x = -2.6; u.armR.rotation.x = -2.6; u.legL.rotation.x = 0.5; u.legR.rotation.x = -0.3; return; }
  if (speed > 0.2) u.phase += dt * speed * 1.9; else u.phase *= 0.85;
  const a = Math.sin(u.phase) * Math.min(1, speed / 4) * 0.9;
  u.legL.rotation.x = a; u.legR.rotation.x = -a; u.armL.rotation.x = -a * 0.8; u.armR.rotation.x = a * 0.8;
  u.body.position.y = Math.abs(Math.sin(u.phase)) * 0.05 * Math.min(1, speed / 4);
}

const CAR_COLORS = [0xc0392b, 0x2e86c1, 0xf1c40f, 0x27ae60, 0xecf0f1, 0x34495e, 0xe67e22, 0x8e44ad];
const TOON_CAR_COLORS = [0xe8503a, 0x3d8fe0, 0xf6c431, 0x45b65a, 0xf4f1ea, 0x5a6b8c, 0xf08a2c, 0xa66bd0, 0x4fc3c8, 0xe86fa0];
let carMatV = null;
function carMat() {
  if (!carMatV) carMatV = TOON ? mkMat({ vertexColors: true }) : new THREE.MeshPhongMaterial({ vertexColors: true, shininess: 60, specular: 0x555555 });
  return carMatV;
}
class Car {
  constructor(scene, color, x, z, heading, opts = {}) {
    this.g = new THREE.Group(); this.g.rotation.order = 'YXZ'; scene.add(this.g);
    this.offroad = !!opts.offroad; const OR = this.offroad; this.police = !!opts.police; this.scooter = !!opts.scooter; this.kind = opts.kind || '';
    if (this.police) color = 0xf4f6fa;
    this.color = color; this.hp = 100; this.offs = this.scooter ? [-0.5, 0.5] : [-1.3, 0, 1.3]; this.rad = this.scooter ? 0.5 : 0.95;
    this.body = new THREE.Group(); this.g.add(this.body); const B = this.body;
    const lift = OR ? 0.32 : 0, DK = '#262626', GL = TOON ? '#41678c' : '#223344';
    let specs, heads, tails;
    if (this.scooter) {
      specs = [[0.5, 0.14, 1.3, 0, 0.36, 0, color, 1], [0.42, 0.2, 0.7, 0, 0.62, -0.25, color, 1], [0.36, 0.08, 0.6, 0, 0.76, -0.25, DK], [0.14, 0.85, 0.14, 0, 0.78, 0.55, DK], [0.72, 0.07, 0.07, 0, 1.2, 0.55, DK], [0.5, 0.55, 0.22, 0, 0.62, 0.6, color, 1], [0.6, 0.34, 0.6, 0, 1.05, -0.62, '#f2c46a'], [0.62, 0.05, 0.62, 0, 1.23, -0.62, '#d2452f']];
      heads = [[0.22, 0.14, 0.05, 0, 0.98, 0.72]]; tails = [[0.2, 0.08, 0.05, 0, 0.62, -0.66]];
    } else if (!OR) {
      specs = [[1.8, 0.55, 4.2, 0, 0.62, 0, color, 1], [1.82, 0.18, 4.22, 0, 0.36, 0, DK], [1.6, 0.55, 2.1, 0, 1.17, -0.25, GL], [1.5, 0.06, 1.9, 0, 1.47, -0.25, color, 1], [1.62, 0.08, 0.06, 0, 0.88, 2.1, '#d9d9d9']];
      if (this.police) { specs.push([1.84, 0.16, 4.24, 0, 0.66, 0, '#1f55c8', 2], [0.9, 0.1, 0.5, 0, 1.53, -0.25, DK]); }
      if (this.kind === 'taxi') specs.push([0.7, 0.22, 0.32, 0, 1.6, -0.25, '#ffd21f']);
      heads = [[0.4, 0.16, 0.05, -0.6, 0.68, 2.11], [0.4, 0.16, 0.05, 0.6, 0.68, 2.11]]; tails = [[0.4, 0.14, 0.05, -0.6, 0.7, -2.11], [0.4, 0.14, 0.05, 0.6, 0.7, -2.11]];
    } else {
      const sp = new THREE.CylinderGeometry(0.42, 0.42, 0.26, 14).rotateX(Math.PI / 2);
      specs = [[1.9, 0.7, 4.1, 0, 0.75 + lift, 0, color, 1], [1.94, 0.2, 4.14, 0, 0.42 + lift, 0, DK], [1.8, 0.72, 2.3, 0, 1.46 + lift, -0.45, GL], [1.84, 0.08, 2.36, 0, 1.86 + lift, -0.45, color, 1], [1.7, 0.08, 2.0, 0, 2.02 + lift, -0.45, DK],
        [0.06, 0.16, 2.0, -0.82, 1.95 + lift, -0.45, DK], [0.06, 0.16, 2.0, 0.82, 1.95 + lift, -0.45, DK], [0, 0, 0, 0, 1.0 + lift, -2.2, DK, 0, sp], [1.7, 0.1, 0.1, 0, 0.55 + lift, 2.22, DK], [0.1, 0.6, 0.1, -0.55, 0.8 + lift, 2.2, DK], [0.1, 0.6, 0.1, 0.55, 0.8 + lift, 2.2, DK]];
      heads = [[0.34, 0.2, 0.05, -0.62, 0.92 + lift, 2.06], [0.34, 0.2, 0.05, 0.62, 0.92 + lift, 2.06], [1.5, 0.12, 0.05, 0, 1.92 + lift, 0.66]]; tails = [[0.3, 0.16, 0.05, -0.62, 0.9 + lift, -2.06], [0.3, 0.16, 0.05, 0.62, 0.9 + lift, -2.06]];
    }
    this.geo = mergeBoxes(specs);
    const bm = new THREE.Mesh(this.geo, carMat()); bm.castShadow = true; B.add(bm); this.bodyMesh = bm;
    if (TOON) { this.hull = new THREE.Mesh(this.geo, hullMats().box); B.add(this.hull); }
    this.headMat = mkMat({ color: 0xfff6d8, emissive: 0xfff2c0, emissiveIntensity: 0.2 });
    this.tailMat = mkMat({ color: 0x990000, emissive: 0xff1010, emissiveIntensity: 0.3 });
    B.add(new THREE.Mesh(mergeBoxes(heads.map((h) => [...h, '#ffffff'])), this.headMat)); B.add(new THREE.Mesh(mergeBoxes(tails.map((h) => [...h, '#ffffff'])), this.tailMat));
    if (this.police) {
      this.lbR = new THREE.MeshBasicMaterial({ color: 0x661111 }); this.lbB = new THREE.MeshBasicMaterial({ color: 0x112266 });
      const r = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.16, 0.36), this.lbR); r.position.set(-0.23, 1.62, -0.25); B.add(r);
      const b2 = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.16, 0.36), this.lbB); b2.position.set(0.23, 1.62, -0.25); B.add(b2);
    }
    this.wheels = [];
    const WR = this.scooter ? 0.27 : (OR ? 0.5 : 0.36), WW = this.scooter ? 0.14 : (OR ? 0.36 : 0.26); this.wr = WR;
    const key = WR + '_' + WW + '_' + TOON;
    Car.wheelGeo = Car.wheelGeo || {};
    if (!Car.wheelGeo[key]) {
      const wg = new THREE.CylinderGeometry(WR, WR, WW, TOON ? 12 : 14).rotateZ(Math.PI / 2), hg = new THREE.CylinderGeometry(WR * 0.55, WR * 0.55, WW + 0.02, 8).rotateZ(Math.PI / 2);
      Car.wheelGeo[key] = mergeBoxes([[0, 0, 0, 0, 0, 0, '#1d1d1d', 0, wg], [0, 0, 0, 0, 0, 0, OR ? '#7a7a7a' : '#c4c4c4', 0, hg]]);
    }
    const TX = OR ? 0.98 : 0.86, TZ = OR ? 1.38 : 1.35;
    const WP = this.scooter ? [[0, 0.62], [0, -0.55]] : [[-TX, TZ], [TX, TZ], [-TX, -TZ], [TX, -TZ]];
    for (const [wx, wz] of WP) {
      const pv = new THREE.Group(); pv.position.set(wx, WR, wz); this.g.add(pv);
      const w = new THREE.Mesh(Car.wheelGeo[key], carMat()); w.castShadow = true; pv.add(w);
      this.wheels.push({ pv, w, front: wz > 0 });
    }
    if (this.scooter) {
      this.rider = makeWalker({ shirt: 0xd2452f, cap: 0xd2452f }); const u = this.rider.userData;
      u.legL.rotation.x = u.legR.rotation.x = -1.35; u.armL.rotation.x = u.armR.rotation.x = -1.2;
      this.rider.position.set(0, -0.15, -0.2); this.rider.visible = false; this.g.add(this.rider);
    }
    this.x = x; this.z = z; this.h = heading; this.vx = 0; this.vz = 0; this.steer = 0; this.spin = 0; this.yawRate = 0;
    this.y = groundH(x, z); this.vy = 0; this.pgh = this.y; this.air = false; this.sus = 0; this.susV = 0; this.pitch = 0; this.roll = 0;
    this.sync();
  }
  setPaint(color) { if (this.police) return; this.color = color; recolorTag(this.geo, 1, color); }
  circles() { const fx = Math.sin(this.h), fz = Math.cos(this.h); return this.offs.map((o) => [this.x + fx * o, this.z + fz * o]); }
  sync() { this.g.position.set(this.x, this.y || 0, this.z); this.g.rotation.y = this.h; }
  get speed() { return Math.hypot(this.vx, this.vz); }
  get forwardSpeed() { return this.vx * Math.sin(this.h) + this.vz * Math.cos(this.h); }
}

// circle-vs-segment collision push for buildings; returns impact normal speed info
function collideCircle(x, z, r, out, withTrees) {
  let px = x, pz = z, hit = false, nxs = 0, nzs = 0;
  for (let it = 0; it < 3; it++) {
    let moved = false; const s = W.bGrid.s;
    W.bGrid.query(px, pz, r + 0.5, (i) => {
      closestOnSeg(px, pz, s[i * 4], s[i * 4 + 1], s[i * 4 + 2], s[i * 4 + 3], tmpC);
      const dx = px - tmpC.x, dz = pz - tmpC.z; const d2 = dx * dx + dz * dz;
      if (d2 < r * r) {
        const d = Math.sqrt(d2) || 1e-4; let nx = dx / d, nz = dz / d;
        if (d2 < 1e-8) { const ex = s[i * 4 + 2] - s[i * 4], ez = s[i * 4 + 3] - s[i * 4 + 1]; const L = Math.hypot(ex, ez) || 1; nx = -ez / L; nz = ex / L; }
        const push = r - d; px += nx * push; pz += nz * push; nxs += nx; nzs += nz; hit = true; moved = true;
      }
    });
    if (withTrees && W.treeGrid) {
      const ts = W.treeGrid.s; const tr = 0.3;
      W.treeGrid.query(px, pz, r + tr + 0.5, (i) => {
        const tx = ts[i * 4] + 0.01, tz = ts[i * 4 + 1]; const dx = px - tx, dz = pz - tz; const d = Math.hypot(dx, dz); const R = r + tr;
        if (d < R && d > 1e-4) { const nx = dx / d, nz = dz / d; px += nx * (R - d); pz += nz * (R - d); nxs += nx; nzs += nz; hit = true; moved = true; }
      });
    }
    if (W.props) for (const p of W.props) {
      const dx = px - p.x, dz = pz - p.z; const d = Math.hypot(dx, dz), R = r + p.r;
      if (d < R && d > 1e-4) { const nx = dx / d, nz = dz / d; px += nx * (R - d); pz += nz * (R - d); nxs += nx; nzs += nz; hit = true; moved = true; }
    }
    if (!moved) break;
  }
  out.x = px; out.z = pz; out.hit = hit; const L = Math.hypot(nxs, nzs) || 1; out.nx = nxs / L; out.nz = nzs / L;
  return out;
}

function findFree(x, z, r = 1.2) {
  if (!insideBuilding(x, z, r) && !inWater(x, z)) return [x, z];
  for (let rad = 2; rad < 200; rad += 2) {
    for (let a = 0; a < 16; a++) { const ang = a / 16 * Math.PI * 2; const px = x + Math.cos(ang) * rad, pz = z + Math.sin(ang) * rad; if (!insideBuilding(px, pz, r) && !inWater(px, pz)) return [px, pz]; }
  }
  return [x, z];
}
function nearestRoadPoint(x, z, drivableOnly, maxR = 300) {
  let best = null, bd = 1e18; const s = W.roadGrid.s;
  for (let R = 30; R <= maxR && !best; R *= 2) {
    W.roadGrid.query(x, z, R, (i) => {
      const road = W.roads[W.roadGrid.meta[i]]; if (drivableOnly && !road.drivable) return;
      closestOnSeg(x, z, s[i * 4], s[i * 4 + 1], s[i * 4 + 2], s[i * 4 + 3], tmpC);
      const d = (tmpC.x - x) ** 2 + (tmpC.z - z) ** 2;
      if (d < bd) { bd = d; best = { x: tmpC.x, z: tmpC.z, road, h: Math.atan2(s[i * 4 + 2] - s[i * 4], s[i * 4 + 3] - s[i * 4 + 1]), dist: Math.sqrt(d) }; }
    });
  }
  return best;
}

// ======================= SKY =======================
function makeSky(scene) {
  const geo = new THREE.SphereGeometry(4500, 32, 16);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: new THREE.Color() }, bottom: { value: new THREE.Color() }, sunDir: { value: new THREE.Vector3(0, 1, 0) }, sunCol: { value: new THREE.Color() }, night: { value: 0 } },
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); vec4 p = modelViewMatrix*vec4(position,1.0); gl_Position = projectionMatrix*p; gl_Position.z = gl_Position.w*0.9999; }',
    fragmentShader: `uniform vec3 top; uniform vec3 bottom; uniform vec3 sunDir; uniform vec3 sunCol; uniform float night; varying vec3 vP;
      float h(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,45.164)))*43758.5453); }
      void main(){ float t = clamp(vP.y*1.4+0.15,0.0,1.0); vec3 c = mix(bottom, top, pow(t,0.7));
        float s = max(dot(normalize(vP), normalize(sunDir)),0.0); c += sunCol*(pow(s,800.0)*4.0 + pow(s,12.0)*0.25);
        if(night>0.5 && vP.y>0.05){ vec3 q = floor(vP*300.0); float st = step(0.9975, h(q)); c += vec3(st)*0.9; }
        gl_FragColor = vec4(c,1.0);
        ${TOON ? '#include <colorspace_fragment>' : ''} }`,
  });
  const m = new THREE.Mesh(geo, mat); m.frustumCulled = false; m.renderOrder = -1; scene.add(m);
  return m;
}

// ======================= GAME =======================
const G = {
  mode: 'foot', started: false, paused: true, night: settings.time === 'night', camZoom: 0, collisions: 0, fps: 0, street: '',
  yaw: 0, pitch: -0.22, keys: new Set(), touch: { jx: 0, jy: 0, gas: false, brake: false, hand: false, run: false, jump: false },
};
window.__tb = G;
let renderer, scene, camera, sky, hemi, sun, headlight, player, cars = [], activeCar = null;
const clock = new THREE.Clock();
const FOG_DAY = new THREE.Color(TOON ? '#cfe6f7' : '#bcd3e6'), FOG_NIGHT = new THREE.Color('#0b1424');

function toast(msg, ms = 1400) { const t = $('toast'); t.textContent = msg; t.style.opacity = 1; clearTimeout(toast._t); toast._t = setTimeout(() => { t.style.opacity = 0; }, ms); }
function hint(msg) { const h = $('hint'); if (msg) { h.textContent = msg; h.style.display = 'block'; } else h.style.display = 'none'; }

function applyQuality() {
  const q = QUALITY[settings.quality];
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, q.pr));
  renderer.shadowMap.enabled = q.shadows; sun.castShadow = q.shadows;
  scene.traverse((o) => { if (o.material) { const ms = Array.isArray(o.material) ? o.material : [o.material]; ms.forEach((m) => { m.needsUpdate = true; }); } });
  camera.far = q.dist + 600; camera.updateProjectionMatrix();
  applyFog(); if (renderer && camera) initPost();
  if (W.treeGroup && W.treeDensity !== q.trees) { W.treeDensity = q.trees; buildTrees(q.trees); }
  onResize();
}
function applyFog() { const q = QUALITY[settings.quality]; scene.fog = new THREE.Fog(G.night ? FOG_NIGHT : FOG_DAY, q.dist * (TOON ? 0.72 : 0.45), q.dist); }
function applyTime() {
  const n = G.night;
  sky.material.uniforms.top.value.set(n ? '#050b18' : (TOON ? '#6fb7ff' : '#3f7fc4'));
  sky.material.uniforms.bottom.value.set(n ? '#14223a' : (TOON ? '#d8f0ff' : '#cfe0ee'));
  sky.material.uniforms.sunCol.value.set(n ? '#9fb3d9' : '#fff1c8');
  sky.material.uniforms.night.value = n ? 1 : 0;
  const sd = n ? new THREE.Vector3(-0.4, 0.55, 0.5) : new THREE.Vector3(0.45, 0.75, 0.35); sd.normalize();
  sky.material.uniforms.sunDir.value.copy(sd); G.sunDir = sd;
  hemi.intensity = n ? 0.35 : (TOON ? 1.25 : 1.6); hemi.color.set(n ? '#5a6f99' : (TOON ? '#eaf4ff' : '#dfefff')); hemi.groundColor.set(n ? '#1a1f2a' : (TOON ? '#8fae6a' : '#6f7a5a'));
  sun.intensity = n ? 0.35 : (TOON ? 2.2 : 2.4); sun.color.set(n ? '#9fb6ff' : '#fff3dd');
  W.mats.wall.emissiveIntensity = n ? 1.1 : 0;
  W.mats.water.color.set(n ? '#1b3550' : (TOON ? '#47a6e0' : '#3f7398'));
  W.mats.ground.color.set(n ? (TOON ? '#5f7f3c' : '#5d7048') : (TOON ? '#a3d65c' : '#93ad6e'));
  headlight.intensity = n ? 60 : 0;
  for (const c of cars.concat(TR.pool, POL.cars)) { c.headMat.emissiveIntensity = n ? 2.5 : 0.2; c.tailMat.emissiveIntensity = n ? 1.5 : 0.3; }
  renderer.toneMappingExposure = n ? 1.15 : 1.0;
  $('btnNight').textContent = n ? '☀️' : '🌙';
  applyFog();
}

async function init() {
  const canvas = $('c');
  renderer = new THREE.WebGLRenderer({ canvas, antialias: QUALITY[settings.quality].aa, powerPreference: 'high-performance' });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(65, innerWidth / innerHeight, 0.3, 2000);
  setLoad(0.05, 'Wczytywanie danych OpenStreetMap…');
  const data = await loadData();
  setLoad(0.15, 'Teren i zieleń…'); await nextFrame();
  await buildWorld(data, scene, renderer);
  W.treeDensity = QUALITY[settings.quality].trees;
  sky = makeSky(scene);
  hemi = new THREE.HemisphereLight(0xdfefff, 0x6f7a5a, 1.6); scene.add(hemi);
  sun = new THREE.DirectionalLight(0xfff3dd, 2.4); scene.add(sun); scene.add(sun.target);
  sun.shadow.mapSize.set(2048, 2048); const sc = sun.shadow.camera; sc.left = -130; sc.right = 130; sc.top = 130; sc.bottom = -130; sc.near = 10; sc.far = 600; sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.05;
  headlight = new THREE.SpotLight(0xfff2d0, 0, 90, 0.55, 0.5, 1.2); scene.add(headlight); scene.add(headlight.target);

  player = { x: 0, z: 0, y: 0, vy: 0, h: 0, mesh: makeWalker(), speed: 0, onGround: true };
  scene.add(player.mesh);
  spawnAtRynek();
  spawnCars(); spawnEgg(); initTraffic(); initPolice(); initMissions();
  applyTime(); applyQuality();
  initMinimap(); initBigMap(); initInput(); initRadio(); initMenu();
  window.addEventListener('resize', onResize); onResize();
  setLoad(1, 'Gotowe!');
  $('loading').classList.add('hidden'); $('menu').classList.remove('hidden');
  G.ready = true;
  renderer.setAnimationLoop(loop);
}

function spawnAtRynek() {
  const r = W.travel[0];
  const [x, z] = findFree(r[1], r[2], 0.8);
  player.x = x; player.z = z; player.h = Math.PI * 0.5; G.yaw = player.h;
}
function spawnCars() {
  const rnd = mulberry32(42);
  const spots = [];
  const r0 = W.travel[0];
  // first car right next to the spawn
  const pre = [[r0[1], r0[2]], [r0[1] + 120, r0[2] + 40], [r0[1] - 150, r0[2] - 80]];
  for (const t of W.travel) pre.push([t[1], t[2]]);
  for (const [x, z] of pre) {
    const rp = nearestRoadPoint(x, z, true, 480); if (!rp) continue;
    const off = rp.road.width / 2 - 1.2; const nx = Math.cos(rp.h), nz = -Math.sin(rp.h);
    let cx = rp.x + nx * off, cz = rp.z + nz * off;
    if (insideBuilding(cx, cz, 2.2) || spots.some((s) => Math.hypot(s[0] - cx, s[1] - cz) < 8)) { cx = rp.x; cz = rp.z; }
    if (insideBuilding(cx, cz, 2.2) || spots.some((s) => Math.hypot(s[0] - cx, s[1] - cz) < 8)) continue;
    spots.push([cx, cz, rp.h]);
  }
  spots.slice(0, 14).forEach((s, i) => { cars.push(new Car(scene, CAR_COLORS[i % CAR_COLORS.length], s[0], s[1], s[2] + (rnd() < 0.5 ? 0 : Math.PI))); });
}

// ---------------- teleport / enter-exit
function teleport(x, z) {
  if (G.mode === 'car' && activeCar) {
    const rp = nearestRoadPoint(x, z, true, 600);
    if (rp) { x = rp.x; z = rp.z; activeCar.h = rp.h; }
    const [fx, fz] = findFree(x, z, 2.2); activeCar.x = fx; activeCar.z = fz; activeCar.vx = activeCar.vz = 0; activeCar.y = groundH(fx, fz); activeCar.vy = 0; activeCar.sync(); G.yaw = activeCar.h;
  } else {
    if (insideBuilding(x, z, 0)) { const rp = nearestRoadPoint(x, z, false, 240); if (rp) { x = rp.x; z = rp.z; } }
    const [fx, fz] = findFree(x, z, 0.8); player.x = fx; player.z = fz; player.y = groundH(fx, fz); player.vy = 0; player.onGround = true;
  }
  updateVisibility(true);
}
function enterExit() {
  if (G.mode === 'foot') {
    let best = null, bd = 3.8;
    for (const c of cars) { if (!c.g.visible) continue; const d = Math.hypot(c.x - player.x, c.z - player.z); if (d < bd) { bd = d; best = c; } }
    if (!best) { toast('Podejdź bliżej do samochodu'); return false; }
    if (best.wrecked) { toast('Ten wrak już nie pojedzie'); return false; }
    if (best.ai) carjack(best); else if (best.police) { if (best.pai) policeLeave(best); crime('carjack'); toast('Kradniesz radiowóz!', 1600); }
    if (best.rider) best.rider.visible = true;
    activeCar = best; G.mode = 'car'; player.mesh.visible = false; G.yaw = best.h;
    $('speedo').classList.remove('hidden'); $('touch').classList.add('incar'); $('tEnter').textContent = 'WYSIĄDŹ';
    return true;
  }
  const c = activeCar; if (c.speed > 4) { toast('Zwolnij, aby wysiąść'); return false; }
  const fx = Math.sin(c.h), fz = Math.cos(c.h); const rx = Math.cos(c.h), rz = -Math.sin(c.h);
  let px = c.x - rx * 2.0, pz = c.z - rz * 2.0;
  if (insideBuilding(px, pz, 0.5)) { px = c.x + rx * 2.0; pz = c.z + rz * 2.0; }
  if (insideBuilding(px, pz, 0.5)) { [px, pz] = findFree(c.x - fx * 3.5, c.z - fz * 3.5, 0.6); }
  player.x = px; player.z = pz; player.y = groundH(px, pz); player.h = c.h; player.mesh.visible = true;
  c.vx = c.vz = 0; activeCar = null; G.mode = 'foot'; if (c.rider) c.rider.visible = false;
  $('speedo').classList.add('hidden'); $('touch').classList.remove('incar'); $('tEnter').textContent = 'WSIĄDŹ';
  return true;
}

// ---------------- update
const col = { x: 0, z: 0, hit: false, nx: 0, nz: 0 };
function inputAxes() {
  const k = G.keys;
  let f = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
  let s = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
  if (G.touch.jx || G.touch.jy) { f = -G.touch.jy; s = G.touch.jx; }
  return { f, s };
}
function updateFoot(dt) {
  const { f, s } = inputAxes();
  const run = G.keys.has('ShiftLeft') || G.keys.has('ShiftRight') || G.touch.run;
  const spd = run ? 8.5 : 4.2;
  const fx = Math.sin(G.yaw), fz = Math.cos(G.yaw); const rx = -Math.cos(G.yaw), rz = Math.sin(G.yaw);
  let mx = fx * f + rx * s, mz = fz * f + rz * s; const ml = Math.hypot(mx, mz);
  let speed = 0;
  if (ml > 0.05) {
    const k = Math.min(1, ml); mx /= ml; mz /= ml; speed = spd * k;
    const nx = player.x + mx * speed * dt, nz = player.z + mz * speed * dt;
    collideCircle(nx, nz, 0.35, col, true);
    let px = col.x, pz = col.z;
    if (insideBuilding(px, pz, 0) && !insideBuilding(player.x, player.z, 0)) { px = player.x; pz = player.z; }
    for (const c of cars) for (const [cx, cz] of c.circles()) { const dx = px - cx, dz = pz - cz, d = Math.hypot(dx, dz); if (d < 1.3 && d > 1e-4) { px = cx + dx / d * 1.3; pz = cz + dz / d * 1.3; } }
    player.x = px; player.z = pz;
    const th = Math.atan2(mx, mz); let dh = th - player.h; dh = Math.atan2(Math.sin(dh), Math.cos(dh)); player.h += dh * Math.min(1, dt * 12);
  }
  if ((G.keys.has('Space') || G.touch.jump || G.jumpReq) && player.onGround) { player.vy = 6.2; player.onGround = false; }
  G.touch.jump = false; G.jumpReq = false;
  const gh = groundH(player.x, player.z);
  if (player.onGround) { if (player.y > gh + 0.45) { player.onGround = false; player.vy = 0; } else player.y = gh; }
  if (!player.onGround) { player.vy -= 18 * dt; player.y += player.vy * dt; if (player.y <= gh) { player.y = gh; player.vy = 0; player.onGround = true; } }
  player.speed = speed;
  player.mesh.position.set(player.x, player.y, player.z); player.mesh.rotation.y = player.h;
  animateWalker(player.mesh, speed, dt, !player.onGround);
}
function updateCar(c, dt, drive) {
  let thr = 0, brk = 0, steerIn = 0, hand = false;
  if (drive && typeof drive === 'object') { thr = drive.thr; steerIn = drive.steer; hand = !!drive.hand; drive = false; }
  else if (drive) {
    const { f, s } = inputAxes(); thr = f; steerIn = -s;
    if (G.touch.jon) { // analogowy joystick: krzywa + czułość, mniej skrętu przy dużej prędkości
      steerIn = -steerCurve(G.touch.jx) / (1 + Math.max(0, Math.abs(c.speed || 0) - 8) * 0.012);
      thr = G.touch.jy < -0.12 ? Math.min(1, (-G.touch.jy - 0.12) * 1.5) : G.touch.jy > 0.55 ? -1 : 0;
    }
    if (G.touch.gas) thr = 1; if (G.touch.brake) thr = -1;
    hand = G.keys.has('Space') || G.touch.hand;
  }
  const fx = Math.sin(c.h), fz = Math.cos(c.h); const rx = Math.cos(c.h), rz = -Math.sin(c.h);
  let vF = c.vx * fx + c.vz * fz, vR = c.vx * rx + c.vz * rz;
  const OR = c.offroad; let MAXV = OR ? 41 : 48; const ACC = OR ? 14 : 13, BRK = 28;
  // surface (only in the off-road zone): dirt trails and grass slow normal cars much more than the 4x4
  let surfGrip = 1; c.surf = 'road';
  if (W.off && inOffRect(c.x, c.z)) {
    const onWay = nearRoad(c.x, c.z, 0.8); const f = onWay ? (OR ? 0.72 : 0.5) : (OR ? 0.55 : 0.28);
    c.surf = onWay ? 'dirt' : 'grass'; MAXV *= f; surfGrip = onWay ? (OR ? 0.85 : 0.6) : (OR ? 0.7 : 0.35);
    if (vF > MAXV) vF -= (vF - MAXV) * Math.min(1, dt * 1.6);
  }
  if (c.wrecked) { thr = 0; hand = true; } if (c.scooter) MAXV = 22;
  if (c.air) { thr *= 0.15; hand = false; }
  if (thr > 0) { if (vF < -0.5) vF += BRK * dt; else vF += ACC * thr * dt * (1 - Math.max(0, vF) / MAXV); }
  else if (thr < 0) { if (vF > 0.5) vF -= BRK * dt; else vF = Math.max(-12, vF - 7 * dt); }
  else { vF -= Math.sign(vF) * Math.min(Math.abs(vF), (2.2 + Math.abs(vF) * 0.04) * dt); }
  if (hand) { vF -= Math.sign(vF) * Math.min(Math.abs(vF), 9 * dt); }
  const maxSteer = 0.55 / (1 + Math.abs(vF) * 0.035);
  c.steer = lerp(c.steer, steerIn * maxSteer, Math.min(1, dt * (drive && G.touch.jon ? 7 : 6)));
  const grip = c.air ? 0.2 : (hand ? 1.3 : 9 * surfGrip);
  vR -= vR * Math.min(1, grip * dt);
  const yawRate = vF / 2.6 * Math.tan(c.steer) * (hand ? 1.35 : 1) * (c.air ? 0.15 : 1);
  c.h += yawRate * dt; c.yawRate = yawRate;
  const nfx = Math.sin(c.h), nfz = Math.cos(c.h), nrx = Math.cos(c.h), nrz = -Math.sin(c.h);
  c.vx = nfx * vF + nrx * vR; c.vz = nfz * vF + nrz * vR;
  // move with substeps and collide with buildings
  const dist = Math.hypot(c.vx, c.vz) * dt; const steps = Math.max(1, Math.ceil(dist / 0.3));
  let impact = 0;
  for (let i = 0; i < steps; i++) {
    const ox = c.x, oz = c.z;
    c.x += c.vx * dt / steps; c.z += c.vz * dt / steps;
    for (const off of c.offs) {
      const cx = c.x + Math.sin(c.h) * off, cz = c.z + Math.cos(c.h) * off;
      collideCircle(cx, cz, c.rad, col, false);
      if (col.hit) {
        c.x += col.x - cx; c.z += col.z - cz;
        const vn = c.vx * col.nx + c.vz * col.nz;
        if (vn < 0) { impact = Math.max(impact, -vn); c.vx -= vn * col.nx * 1.35; c.vz -= vn * col.nz * 1.35; c.vx *= 0.8; c.vz *= 0.8; }
      }
    }
    // safety: never let any part of the car end up inside a building footprint
    let bad = false; for (const off of c.offs) if (insideBuilding(c.x + Math.sin(c.h) * off, c.z + Math.cos(c.h) * off, 0)) { bad = true; break; }
    if (bad) { impact = Math.max(impact, Math.hypot(c.vx, c.vz)); c.x = ox; c.z = oz; c.vx *= -0.25; c.vz *= -0.25; break; }
  }
  for (const o of cars) {
    if (o === c || !o.g.visible) continue; const d = Math.hypot(o.x - c.x, o.z - c.z); if (d > 6) continue;
    const RR = c.rad + o.rad;
    for (const [ax, az] of c.circles()) for (const [bx, bz] of o.circles()) {
      const dx = ax - bx, dz = az - bz, dd = Math.hypot(dx, dz);
      if (dd < RR && dd > 1e-4) {
        const nx = dx / dd, nz = dz / dd, p = (RR - dd) / 2; c.x += nx * p; c.z += nz * p; o.x -= nx * p; o.z -= nz * p;
        const vn = (c.vx - o.vx) * nx + (c.vz - o.vz) * nz;
        if (vn < 0) {
          impact = Math.max(impact, -vn); c.vx -= vn * nx * 0.6; c.vz -= vn * nz * 0.6; o.vx += vn * nx * 0.6; o.vz += vn * nz * 0.6;
          if (-vn > 2.5) { trafficHit(o, c, -vn); if (o === activeCar || c === activeCar) carHitEvent(c === activeCar ? o : c, -vn); if (-vn > 4) damageCar(o, (-vn - 3) * 3); }
        }
        o.sync();
      }
    }
  }
  const now = performance.now();
  if (impact > 3) { damageCar(c, (impact - 3) * 4); if (c === activeCar && now - (G.lastHit || 0) > 700) { G.lastHit = now; G.collisions++; if (typeof missionImpact === 'function') missionImpact(impact); toast('Bum! Kolizja'); } }
  updateCarVertical(c, dt);
  c.sync();
  c.spin += vF * dt / (c.wr || 0.36);
  for (const w of c.wheels) { w.w.rotation.x = c.spin; if (w.front) w.pv.rotation.y = c.steer; }
  c.g.rotation.x = c.pitch; c.g.rotation.z = c.roll + clamp(-c.yawRate * vF * 0.004, -0.06, 0.06);
}
// vertical physics: gravity, terrain following, natural jumps over crests/ramps, spring suspension
function updateCarVertical(c, dt) {
  const zone = W.off && inOffRect(c.x, c.z);
  if (!zone && !c.y && !c.vy && !c.air && !c.sus && !c.susV && !c.pitch && !c.roll) { c.pgh = 0; return; }
  const gh = groundH(c.x, c.z, true);
  const gv = (gh - (c.pgh === undefined ? gh : c.pgh)) / Math.max(dt, 1e-3);
  c.vy -= 24 * dt; c.y += c.vy * dt;
  if (c.y <= gh) {
    if (c.air && c.vy < -3) { c.susV -= Math.min(6, -c.vy * 0.45); if (c === activeCar && -c.vy > 9) toast('Twarde lądowanie!', 900); }
    else c.susV -= clamp(gv - (c.pgv || 0), -40, 40) * 0.03;
    c.y = gh; c.vy = clamp(gv, -12, 14); c.air = false;
  } else c.air = c.y > gh + 0.3;
  c.pgh = gh; c.pgv = gv;
  // body spring (visual suspension bounce)
  const k = c.offroad ? 90 : 160, d = c.offroad ? 7 : 12;
  c.susV += (-k * c.sus - d * c.susV) * dt; c.sus = clamp(c.sus + c.susV * dt, -0.28, 0.22);
  if (c.body) c.body.position.y = c.sus;
  // pitch / roll from terrain samples (kept while airborne, slowly levelling)
  let tp = 0, tr = 0;
  if (zone && !c.air) {
    const fx = Math.sin(c.h), fz = Math.cos(c.h), rx = Math.cos(c.h), rz = -Math.sin(c.h);
    const hf = groundH(c.x + fx * 1.4, c.z + fz * 1.4), hb = groundH(c.x - fx * 1.4, c.z - fz * 1.4);
    const hr = groundH(c.x + rx * 0.9, c.z + rz * 0.9), hl = groundH(c.x - rx * 0.9, c.z - rz * 0.9);
    tp = Math.atan2(hb - hf, 2.8); tr = Math.atan2(hr - hl, 1.8);
  } else if (c.air) { tp = c.pitch * 0.98 + 0.002; tr = c.roll * 0.98; }
  c.pitch = lerp(c.pitch, tp, Math.min(1, dt * (c.air ? 2 : 12))); c.roll = lerp(c.roll, tr, Math.min(1, dt * 12));
}
function updateParked(dt) {
  for (const c of cars) {
    if (c === activeCar || (c.ai && c.ai.mode === 'drive') || c.pai || (c.ai && c.ai.mode !== 'drive')) continue;
    if (c.speed > 0.05 || c.wrecked) updateCar(c, dt, false);
  }
}

const camPos = new THREE.Vector3(), camLook = new THREE.Vector3(), tmpV = new THREE.Vector3();
function updateCamera(dt) {
  if (G.camOverride) { const o = G.camOverride; if (scene.fog.far < 2500) { scene.fog.near = 1200; scene.fog.far = 3200; } camera.position.set(o[0], o[1], o[2]); camera.lookAt(o[3], o[4], o[5]); return; }
  if (!G.started) {
    const t = performance.now() * 0.00005; const r0 = W.travel[0];
    camera.position.set(r0[1] + Math.cos(t) * 420, 230, r0[2] + Math.sin(t) * 420); camera.lookAt(r0[1], 0, r0[2]); return;
  }
  let tx, tz, ty, dist, height;
  if (G.mode === 'car') {
    const c = activeCar; tx = c.x; tz = c.z; ty = (c.y || 0) + 1.3;
    dist = G.camZoom ? 6 : 9.5 + c.speed * 0.06; height = G.camZoom ? 2.4 : 3.4;
    if (!G.mouseLooking) { let d = c.h - G.yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); G.yaw += d * Math.min(1, dt * 3.2); }
  } else {
    tx = player.x; tz = player.z; ty = player.y + 1.6; dist = G.camZoom ? 2.8 : 5.2; height = 0;
  }
  const cp = Math.cos(G.pitch), sp = Math.sin(G.pitch);
  let px = tx - Math.sin(G.yaw) * dist * cp, pz = tz - Math.cos(G.yaw) * dist * cp, py = ty + height - sp * dist;
  if (G.mode === 'car') py = ty + height - sp * dist * 0.5;
  // pull camera in when a building is in the way
  const steps = 8; let lastOk = 1;
  for (let i = 1; i <= steps; i++) { const t = i / steps; const sx = lerp(tx, px, t), sz = lerp(tz, pz, t); const sy = lerp(ty, py, t); const b = insideBuildingH(sx, sz, sy); if (b) { lastOk = Math.max(0.15, (i - 1) / steps); break; } }
  px = lerp(tx, px, lastOk); pz = lerp(tz, pz, lastOk); py = Math.max(groundH(px, pz) + 0.4, lerp(ty, py, lastOk));
  camPos.set(px, py, pz);
  if (G.mode === 'car') camera.position.lerp(camPos, Math.min(1, dt * 10)); else camera.position.copy(camPos);
  camLook.set(tx, ty + (G.mode === 'car' ? 0.4 : 0.1), tz);
  camera.lookAt(camLook);
}
function insideBuildingH(x, z, y) {
  const a = W.bCells.get(Math.floor(x / 32) * 100000 + Math.floor(z / 32)); if (!a) return false;
  for (const i of a) { const b = W.buildings[i]; if (y < b.h && pointInRing(x, z, b.ring)) return true; }
  return false;
}

let visT = 0;
function updateVisibility(force) {
  const q = QUALITY[settings.quality]; const cx = camera.position.x, cz = camera.position.z;
  // kontury budynków (linie ekranowe) tylko w pobliżu – daleko i tak giną we mgle, a kosztują dużo wierzchołków
  const EDGE_D = (q.edge || 400) * (STYLE === 'lite' ? 0.75 : 1);
  const D = G.camOverride ? 2600 : (G.started ? q.dist : Math.max(q.dist, 900));
  for (const v of W.visObjects) {
    const d = Math.hypot(v.x - cx, v.z - cz) - v.r;
    if (v.near) v.obj.visible = d < TREE_NEAR && d < D + v.bias;
    else if (v.far) v.obj.visible = d >= TREE_NEAR - 10 && d < D + v.bias;
    else if (v.edge) v.obj.visible = d < Math.min(D + v.bias, EDGE_D);
    else v.obj.visible = d < D + v.bias;
  }
}

let fpsAcc = 0, fpsN = 0, hudT = 0;
function loop() {
  const rawDt = clock.getDelta(); let dt = Math.min(0.05, rawDt); const tU = performance.now();
  if (G.started && !G.paused) {
    if (G.cut) { G.cut.t -= dt; if (G.mode === 'car') updateCar(activeCar, dt, { thr: 0, steer: 0, hand: true }); if (G.cut.t <= 0) { const f = G.cut.fn; G.cut = null; f(); } }
    else if (G.mode === 'foot') updateFoot(dt); else updateCar(activeCar, dt, true);
    updateParked(dt);
    updateTraffic(dt); updatePolice(dt); updateDamage(dt); updateShops(dt);
    updateEgg(dt); updateMissions(dt);
    const eh = eggHint() || missionHint() || shopHint();
    const near = G.mode === 'foot' && cars.some((c) => Math.hypot(c.x - player.x, c.z - player.z) < 3.8);
    hint(eh || (near ? (isTouch ? 'Naciśnij WSIĄDŹ' : 'Naciśnij E, aby wsiąść') : ''));
    if (G.mode === 'foot') { const lbl = eh ? (nearEggButton() ? 'TELEPORT' : 'AKCJA') : 'WSIĄDŹ'; if (G.tLbl !== lbl) { G.tLbl = lbl; $('tEnter').textContent = lbl; } } else G.tLbl = '';
  }
  G.updMs = (G.updMs || 0) * 0.95 + (performance.now() - tU) * 0.05;
  updateCamera(dt);
  const fx = G.started ? (G.mode === 'car' ? activeCar.x : player.x) : camera.position.x;
  const fz = G.started ? (G.mode === 'car' ? activeCar.z : player.z) : camera.position.z;
  sky.position.copy(camera.position);
  sun.position.set(fx + G.sunDir.x * 250, G.sunDir.y * 250, fz + G.sunDir.z * 250); sun.target.position.set(fx, 0, fz); sun.target.updateMatrixWorld();
  if (activeCar) {
    const c = activeCar; headlight.position.set(c.x + Math.sin(c.h) * 2.2, (c.y || 0) + 1.0, c.z + Math.cos(c.h) * 2.2);
    headlight.target.position.set(c.x + Math.sin(c.h) * 25, c.y || 0, c.z + Math.cos(c.h) * 25); headlight.target.updateMatrixWorld(); headlight.visible = G.night;
  } else headlight.visible = false;
  visT -= dt; if (visT <= 0) { visT = 0.25; updateVisibility(); }
  updateRadio(dt);
  renderFrame();
  fpsAcc += Math.min(rawDt, 1); fpsN++; if (fpsAcc > 0.5) { G.fps = Math.round(fpsN / fpsAcc); fpsAcc = 0; fpsN = 0; if (settings.fps) $('fps').textContent = G.fps + ' FPS · ' + renderer.info.render.calls + ' dc'; }
  if (G.started) { hudT -= dt; if (hudT <= 0) { hudT = 0.25; updateStreet(); } drawMinimap(); if (G.mode === 'car') drawSpeedo(); }
}
function onResize() {
  if (!renderer) return;
  renderer.setSize(innerWidth, innerHeight, false); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); resizePost();
}

// ======================= EASTER EGG: TRASY OFF-ROAD (Jezioro Tarnobrzeskie) =======================
// Strefa off-road po wschodniej i południowej stronie Jeziora Tarnobrzeskiego (metry lokalne, z = południe).
const OFFZ = { x0: -1750, x1: -150, z0: 2350, z1: 5050, fade: 220, cell: 4 };
const OFF_TRAIL = new Set(['track', 'path']);
const TH_GUESS = [-1000, 2650];
const CP_GUESS = [[-900, 2900], [-760, 3450], [-560, 3950], [-720, 4380], [-1150, 4250], [-1280, 4650], [-1550, 4800]];
function inOffRect(x, z) { return x > OFFZ.x0 && x < OFFZ.x1 && z > OFFZ.z0 && z < OFFZ.z1; }
function trailInZone(type, pts) { if (!OFF_TRAIL.has(type)) return false; for (let i = 0; i < pts.length; i += 2) if (inOffRect(pts[i], pts[i + 1])) return true; return false; }
function hash2(i, j) { let h = (Math.imul(i, 374761393) + Math.imul(j, 668265263)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967295; }
function vnoise(x, z) {
  const i = Math.floor(x), j = Math.floor(z); const fx = x - i, fz = z - j; const u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
  const a = hash2(i, j), b = hash2(i + 1, j), c = hash2(i, j + 1), d = hash2(i + 1, j + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function hillRaw(x, z) { const n1 = vnoise(x / 140, z / 140), n2 = vnoise(x / 38 + 17.3, z / 38 - 5.1); return 6.5 * n1 * n1 + 2.4 * n2 * n2; }
function offMask(x, z) {
  const o = W.off; if (!o) return 0; const gx = (x - OFFZ.x0) / OFFZ.cell, gz = (z - OFFZ.z0) / OFFZ.cell; const i = Math.floor(gx), j = Math.floor(gz);
  if (i < 0 || j < 0 || i >= o.nx - 1 || j >= o.nz - 1) return 0;
  const fx = gx - i, fz = gz - j, m = o.mask, n = o.nx; const a = m[j * n + i], b = m[j * n + i + 1], c = m[(j + 1) * n + i], d = m[(j + 1) * n + i + 1];
  return a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz;
}
function terrainH(x, z) { if (!W.off || !inOffRect(x, z)) return 0; const m = offMask(x, z); return m > 0.002 ? m * hillRaw(x, z) : 0; }
// physical ground height (terrain + ramps [+ small bumps for vehicles])
function groundH(x, z, bumps) {
  if (!W.off || !inOffRect(x, z)) return 0;
  const m = offMask(x, z); let h = m > 0.002 ? m * hillRaw(x, z) : 0;
  if (bumps && m > 0.15) h += m * 0.09 * (Math.sin(x * 2.3) * Math.sin(z * 1.9) + 0.6 * Math.sin(x * 0.9 + z * 1.3));
  for (const r of W.off.ramps) {
    const dx = x - r.x, dz = z - r.z; const u = dx * r.fx + dz * r.fz, v = dx * r.fz - dz * r.fx;
    if (u > 0 && u < r.L && Math.abs(v) < r.w / 2) { const y = r.base + u / r.L * r.H; if (y > h) h = y; }
  }
  return h;
}
function boxBlur(src, nx, nz, r) {
  const tmp = new Float32Array(src.length), out = new Float32Array(src.length), k = 2 * r + 1;
  for (let j = 0; j < nz; j++) { const row = j * nx; let acc = 0; for (let i = -r; i <= r; i++) acc += src[row + Math.min(nx - 1, Math.max(0, i))]; for (let i = 0; i < nx; i++) { tmp[row + i] = acc / k; acc += src[row + Math.min(nx - 1, i + r + 1)] - src[row + Math.max(0, i - r)]; } }
  for (let i = 0; i < nx; i++) { let acc = 0; for (let j = -r; j <= r; j++) acc += tmp[Math.min(nz - 1, Math.max(0, j)) * nx + i]; for (let j = 0; j < nz; j++) { out[j * nx + i] = acc / k; acc += tmp[Math.min(nz - 1, j + r + 1) * nx + i] - tmp[Math.max(0, j - r) * nx + i]; } }
  return out;
}
function nearestTrailPoint(x, z, maxR) {
  let best = null, bd = maxR * maxR;
  for (const t of W.off.trails) { const p = t.pts; for (let i = 0; i < p.length - 2; i += 2) { closestOnSeg(x, z, p[i], p[i + 1], p[i + 2], p[i + 3], tmpC); const d = (tmpC.x - x) ** 2 + (tmpC.z - z) ** 2; if (d < bd) { bd = d; best = { x: tmpC.x, z: tmpC.z, h: Math.atan2(p[i + 2] - p[i], p[i + 3] - p[i + 1]) }; } } }
  return best;
}

// Called from buildWorld after roads/buildings/water exist and before trees are planted.
function buildOffroad(scene) {
  const c = OFFZ.cell; const nx = Math.ceil((OFFZ.x1 - OFFZ.x0) / c) + 1, nz = Math.ceil((OFFZ.z1 - OFFZ.z0) / c) + 1;
  const o = W.off = { nx, nz, mask: new Float32Array(nx * nz), ramps: [], trails: [], cps: [] };
  for (const r of W.roads) if (trailInZone(r.type, r.pts)) o.trails.push(r);
  // trailhead + checkpoints snapped to real OSM tracks/paths
  const th = nearestTrailPoint(TH_GUESS[0], TH_GUESS[1], 250) || { x: TH_GUESS[0], z: TH_GUESS[1], h: 0 };
  o.th = th;
  for (const [gx, gz] of CP_GUESS) { const p = nearestTrailPoint(gx, gz, 160); o.cps.push(p ? [p.x, p.z] : [gx, gz]); }
  // rasterise "flat" features (water, buildings, paved roads) into a mask, 1 = hills allowed
  const cv = document.createElement('canvas'); cv.width = nx; cv.height = nz; const g = cv.getContext('2d', { willReadFrequently: true });
  g.fillStyle = '#fff'; g.fillRect(0, 0, nx, nz);
  g.setTransform(1 / c, 0, 0, 1 / c, -OFFZ.x0 / c + 0.5, -OFFZ.z0 / c + 0.5);
  g.fillStyle = '#000'; g.strokeStyle = '#000'; g.lineJoin = 'round'; g.lineCap = 'round';
  const poly = (p) => { g.beginPath(); g.moveTo(p[0], p[1]); for (let i = 2; i < p.length; i += 2) g.lineTo(p[i], p[i + 1]); };
  const over = (p) => { let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9; for (let i = 0; i < p.length; i += 2) { if (p[i] < x0) x0 = p[i]; if (p[i] > x1) x1 = p[i]; if (p[i + 1] < z0) z0 = p[i + 1]; if (p[i + 1] > z1) z1 = p[i + 1]; } return x1 > OFFZ.x0 - 60 && x0 < OFFZ.x1 + 60 && z1 > OFFZ.z0 - 60 && z0 < OFFZ.z1 + 60; };
  for (const w of W.water) if (over(w.ring)) { poly(w.ring); g.closePath(); g.fill(); g.lineWidth = 44; g.stroke(); }
  for (const w of W.waterways) if (over(w.pts)) { g.lineWidth = w.width + 24; poly(w.pts); g.stroke(); }
  for (const b of W.buildings) if (over(b.ring)) { poly(b.ring); g.closePath(); g.fill(); g.lineWidth = 16; g.stroke(); }
  for (const r of W.roads) if (!OFF_TRAIL.has(r.type) && over(r.pts)) { g.lineWidth = r.width + 14; poly(r.pts); g.stroke(); }
  g.beginPath(); g.arc(th.x, th.z, 34, 0, 7); g.fill();
  let img = g.getImageData(0, 0, nx, nz).data; let m = new Float32Array(nx * nz);
  for (let i = 0; i < nx * nz; i++) m[i] = img[i * 4] / 255;
  m = boxBlur(boxBlur(m, nx, nz, 4), nx, nz, 3);
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const x = OFFZ.x0 + i * c, z = OFFZ.z0 + j * c; let e = Math.min(x - OFFZ.x0, OFFZ.x1 - x, z - OFFZ.z0, OFFZ.z1 - z) / OFFZ.fade; e = clamp(e, 0, 1); e = e * e * (3 - 2 * e);
    const k = j * nx + i; m[k] = clamp((m[k] - 0.08) / 0.92, 0, 1) * e;
  }
  o.mask = m;
  // dirt mask (real OSM trails) for terrain colouring
  g.setTransform(1, 0, 0, 1, 0, 0); g.fillStyle = '#fff'; g.fillRect(0, 0, nx, nz);
  g.setTransform(1 / c, 0, 0, 1 / c, -OFFZ.x0 / c + 0.5, -OFFZ.z0 / c + 0.5); g.strokeStyle = '#000';
  for (const r of o.trails) { g.lineWidth = r.width + 5; poly(r.pts); g.stroke(); }
  img = g.getImageData(0, 0, nx, nz).data; let dm = new Float32Array(nx * nz); for (let i = 0; i < nx * nz; i++) dm[i] = 1 - img[i * 4] / 255; o.dirt = boxBlur(dm, nx, nz, 1);
  // ramps ~30 m before checkpoints 2, 4 and 6
  for (const ci of [1, 3, 5, 6, 4, 2]) {
    if (o.ramps.length >= 4) break;
    const [cx, cz] = o.cps[ci], [px, pz] = o.cps[ci - 1]; let dx = cx - px, dz = cz - pz; const L = Math.hypot(dx, dz) || 1; dx /= L; dz /= L;
    const p = nearestTrailPoint(cx - dx * 34, cz - dz * 34, 25); const rx = p ? p.x : cx - dx * 34, rz = p ? p.z : cz - dz * 34;
    let fx = dx, fz = dz; if (p) { fx = Math.sin(p.h); fz = Math.cos(p.h); if (fx * dx + fz * dz < 0) { fx = -fx; fz = -fz; } }
    if (inWater(rx, rz) || insideBuilding(rx, rz, 4)) continue;
    const r = { x: rx - fx * 4.5, z: rz - fz * 4.5, fx, fz, L: 9, w: 4.6, H: 1.9, base: 0 };
    r.base = Math.min(terrainH(r.x, r.z), terrainH(r.x + fx * 9, r.z + fz * 9));
    o.ramps.push(r);
  }
  buildOffroadMeshes(scene);
}

function dirtAt(x, z) { const o = W.off; const i = Math.round((x - OFFZ.x0) / OFFZ.cell), j = Math.round((z - OFFZ.z0) / OFFZ.cell); if (i < 0 || j < 0 || i >= o.nx || j >= o.nz) return 0; return o.dirt[j * o.nx + i]; }
function buildOffroadMeshes(scene) {
  const o = W.off; const step = settings.quality === 'high' ? 6 : (settings.quality === 'low' ? 10 : 8); const CHK = 400;
  const mat = W.mats.terrain = new THREE.MeshLambertMaterial({ vertexColors: true });
  const grassA = new THREE.Color('#7da552'), grassB = new THREE.Color('#5f8c3e'), dirtC = new THREE.Color('#8b6b45'), tmp = new THREE.Color();
  o.meshes = []; o.terrainTris = 0;
  for (let cx0 = OFFZ.x0; cx0 < OFFZ.x1; cx0 += CHK) for (let cz0 = OFFZ.z0; cz0 < OFFZ.z1; cz0 += CHK) {
    const cx1 = Math.min(OFFZ.x1, cx0 + CHK), cz1 = Math.min(OFFZ.z1, cz0 + CHK);
    const gx = Math.ceil((cx1 - cx0) / step) + 1, gz = Math.ceil((cz1 - cz0) / step) + 1;
    const pos = new Float32Array(gx * gz * 3), colr = new Float32Array(gx * gz * 3), hh = new Float32Array(gx * gz);
    for (let j = 0; j < gz; j++) for (let i = 0; i < gx; i++) {
      const x = Math.min(cx1, cx0 + i * step), z = Math.min(cz1, cz0 + j * step); const h = terrainH(x, z); const k = j * gx + i; hh[k] = h;
      const t = clamp((h - 0.05) / 0.55, 0, 1); const y = h - 0.4 * (1 - t * t * (3 - 2 * t));
      pos[k * 3] = x; pos[k * 3 + 1] = y; pos[k * 3 + 2] = z;
      tmp.copy(grassA).lerp(grassB, vnoise(x / 23, z / 23) * 0.8 + clamp(h / 9, 0, 0.3)).lerp(dirtC, clamp(dirtAt(x, z) * 1.2, 0, 1));
      colr[k * 3] = tmp.r; colr[k * 3 + 1] = tmp.g; colr[k * 3 + 2] = tmp.b;
    }
    const idx = [];
    for (let j = 0; j < gz - 1; j++) for (let i = 0; i < gx - 1; i++) {
      const a = j * gx + i, b = a + 1, c2 = a + gx, d = c2 + 1;
      if (Math.max(hh[a], hh[b], hh[c2], hh[d]) < 0.04) continue;
      idx.push(a, c2, b, b, c2, d);
    }
    if (!idx.length) continue;
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.BufferAttribute(colr, 3));
    geo.setIndex(idx); geo.computeVertexNormals(); geo.computeBoundingSphere();
    const mesh = new THREE.Mesh(geo, mat); mesh.receiveShadow = true; mesh.matrixAutoUpdate = false; scene.add(mesh);
    const bs = geo.boundingSphere; W.visObjects.push({ obj: mesh, x: bs.center.x, z: bs.center.z, r: bs.radius, bias: 150 }); o.meshes.push(mesh); o.terrainTris += idx.length / 3;
  }
  // draped dirt trails (real OSM highway=track / path)
  const tp = [], tc = []; const trailCol = new THREE.Color('#9a7a52'), trailCol2 = new THREE.Color('#86683f');
  for (const r of o.trails) {
    const p = r.pts; const rs = [];
    for (let i = 0; i < p.length - 2; i += 2) { const L = Math.hypot(p[i + 2] - p[i], p[i + 3] - p[i + 1]); const n = Math.max(1, Math.ceil(L / 3)); for (let k = 0; k < n; k++) rs.push(lerp(p[i], p[i + 2], k / n), lerp(p[i + 1], p[i + 3], k / n)); }
    rs.push(p[p.length - 2], p[p.length - 1]);
    const hw = Math.max(1.6, r.width / 2 + 0.4); const col2 = r.type === 'track' ? trailCol : trailCol2;
    let pl = null, pr = null;
    for (let i = 0; i < rs.length / 2; i++) {
      const x = rs[i * 2], z = rs[i * 2 + 1]; const i0 = Math.max(0, i - 1), i1 = Math.min(rs.length / 2 - 1, i + 1);
      let dx = rs[i1 * 2] - rs[i0 * 2], dz = rs[i1 * 2 + 1] - rs[i0 * 2 + 1]; const L = Math.hypot(dx, dz) || 1; dx /= L; dz /= L;
      const lx = x - dz * hw, lz = z + dx * hw, rx = x + dz * hw, rz = z - dx * hw;
      const l = [lx, terrainH(lx, lz) + 0.16, lz], rr = [rx, terrainH(rx, rz) + 0.16, rz];
      if (pl) { tp.push(...pl, ...l, ...pr, ...pr, ...l, ...rr); for (let k = 0; k < 6; k++) tc.push(col2.r, col2.g, col2.b); }
      pl = l; pr = rr;
    }
  }
  if (tp.length) {
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(tp, 3)); geo.setAttribute('color', new THREE.Float32BufferAttribute(tc, 3)); geo.computeVertexNormals();
    // make sure normals point up
    const nrm = geo.attributes.normal; for (let i = 0; i < nrm.count; i++) if (nrm.getY(i) < 0) nrm.setXYZ(i, -nrm.getX(i), -nrm.getY(i), -nrm.getZ(i));
    const m = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 }));
    m.receiveShadow = true; scene.add(m); o.trailMesh = m;
  }
  // ramps
  const rampMat = new THREE.MeshLambertMaterial({ color: 0x9a6b3a, flatShading: true, side: THREE.DoubleSide }); const stripeMat = new THREE.MeshBasicMaterial({ color: 0xffc400 });
  for (const r of o.ramps) {
    const g = new THREE.Group(); const hw = r.w / 2, b = r.base - 0.6, top = r.base + r.H;
    const v = [[-hw, b, 0], [hw, b, 0], [-hw, b, r.L], [hw, b, r.L], [-hw, r.base, 0], [hw, r.base, 0], [-hw, top, r.L], [hw, top, r.L]];
    const f = [[4, 6, 5], [5, 6, 7], [2, 3, 6], [3, 7, 6], [0, 2, 4], [2, 6, 4], [1, 5, 3], [3, 5, 7], [0, 4, 1], [1, 4, 5]];
    const arr = []; for (const t of f) for (const k of t) arr.push(...v[k]);
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3)); geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, rampMat); mesh.castShadow = true; mesh.receiveShadow = true; g.add(mesh);
    const st = new THREE.Mesh(new THREE.BoxGeometry(r.w + 0.05, 0.12, 0.35), stripeMat); st.position.set(0, top + 0.02, r.L - 0.2); g.add(st);
    g.position.set(r.x, 0, r.z); g.rotation.y = Math.atan2(r.fx, r.fz); scene.add(g);
  }
  // checkpoints (glowing rings + beam), only the next one is shown
  const ringGeo = new THREE.TorusGeometry(4.2, 0.38, 8, 28); const beamGeo = new THREE.CylinderGeometry(0.7, 0.7, 70, 10, 1, true); beamGeo.translate(0, 35, 0);
  o.cpObjs = o.cps.map(([x, z], i) => {
    const nx2 = o.cps[Math.min(o.cps.length - 1, i + 1)], pv = o.cps[Math.max(0, i - 1)]; const h = Math.atan2(nx2[0] - pv[0], nx2[1] - pv[1]);
    const g = new THREE.Group(); const y = groundH(x, z);
    const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: i === o.cps.length - 1 ? 0x44ff66 : 0xffa020 })); ring.position.y = y + 4.6; ring.rotation.y = h; g.add(ring);
    const beam = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({ color: 0xffb030, transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending, fog: false })); beam.position.y = y; g.add(beam);
    g.position.set(x, 0, z); g.visible = false; scene.add(g); return { g, ring, x, z };
  });
}

// ---------------- monument of Bartosz Głowacki + teleport buttons
function labelSprite(text, color, w = 6) {
  const cv = document.createElement('canvas'); cv.width = 512; cv.height = 96; const g = cv.getContext('2d');
  g.fillStyle = 'rgba(8,16,30,0.78)'; g.beginPath(); g.roundRect ? g.roundRect(4, 4, 504, 88, 26) : g.rect(4, 4, 504, 88); g.fill();
  g.strokeStyle = color; g.lineWidth = 5; g.stroke();
  g.fillStyle = '#fff'; g.font = 'bold 40px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, 256, 50);
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false, fog: false })); s.scale.set(w, w * 96 / 512, 1); return s;
}
function makeMonument(x, z, face) {
  const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = face;
  const granite = new THREE.MeshLambertMaterial({ color: 0x8d8a84 }), stone = new THREE.MeshLambertMaterial({ color: 0xc9c2b2 });
  const bronze = new THREE.MeshPhongMaterial({ color: 0x5b4a2c, specular: 0x4a3a20, shininess: 40 }), dark = new THREE.MeshLambertMaterial({ color: 0x2a2a2a });
  g.add(box(5.2, 0.35, 5.2, 0, 0, 0.175, 0, granite)); g.add(box(4.0, 0.35, 4.0, 0, 0, 0.525, 0, granite));
  g.add(box(2.5, 3.3, 2.5, 0, 0, 2.35, 0, stone)); g.add(box(2.9, 0.3, 2.9, 0, 0, 4.15, 0, stone)); g.add(box(2.7, 0.25, 2.7, 0, 0, 0.82, 0, stone));
  // plaque
  const cv = document.createElement('canvas'); cv.width = 512; cv.height = 256; const pg = cv.getContext('2d');
  pg.fillStyle = '#2b2b2b'; pg.fillRect(0, 0, 512, 256); pg.fillStyle = '#d8b34a'; pg.textAlign = 'center'; pg.font = 'bold 54px Georgia, serif';
  pg.fillText('BARTOSZ', 256, 100); pg.fillText('GŁOWACKI', 256, 170); pg.font = '28px Georgia, serif'; pg.fillText('1758 – 1794', 256, 222);
  const ptex = new THREE.CanvasTexture(cv); ptex.colorSpace = THREE.SRGBColorSpace;
  const plaque = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 0.9), new THREE.MeshLambertMaterial({ map: ptex })); plaque.position.set(0, 2.6, 1.26); g.add(plaque);
  // statue: kosynier with a scythe
  const st = new THREE.Group(); st.position.y = 4.3; g.add(st);
  st.add(box(0.36, 1.2, 0.36, 0, -0.22, 0.6, 0.05, bronze)); st.add(box(0.36, 1.2, 0.36, 0, 0.22, 0.6, -0.1, bronze));
  const coat = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.62, 1.3, 10), bronze); coat.position.y = 1.55; coat.castShadow = true; st.add(coat);
  st.add(box(0.9, 0.7, 0.5, 0, 0, 2.3, 0, bronze));
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.27, 12, 10), bronze); head.position.y = 2.9; st.add(head);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.26, 0.28, 4), bronze); cap.position.y = 3.2; cap.rotation.y = Math.PI / 4; st.add(cap);
  const armR = box(0.22, 0.95, 0.22, 0, 0.55, 2.2, 0.2, bronze); armR.rotation.x = -0.9; st.add(armR);
  const armL = box(0.22, 0.95, 0.22, 0, -0.55, 2.35, 0.15, bronze); armL.rotation.x = -0.4; armL.rotation.z = 0.5; st.add(armL);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 3.6, 6), bronze); pole.position.set(0.75, 2.2, 0.45); pole.rotation.z = -0.12; pole.castShadow = true; st.add(pole);
  const blade = box(0.06, 0.16, 1.2, 0, 0.98, 3.95, 0.95, bronze); blade.rotation.x = 0.3; st.add(blade);
  g.traverse((m) => { if (m.isMesh) m.castShadow = true; });
  return g;
}
function makeTeleportButton(x, z, color, label) {
  const g = new THREE.Group(); g.position.set(x, groundH(x, z), z);
  const metal = new THREE.MeshPhongMaterial({ color: 0x30343a, shininess: 60 });
  const glow = new THREE.MeshBasicMaterial({ color });
  const ped = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.6, 1.0, 16), metal); ped.position.y = 0.5; ped.castShadow = true; g.add(ped);
  const top = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.36, 0.16, 20), glow); top.position.y = 1.08; g.add(top);
  const halo = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.5, 32), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
  halo.rotation.x = -Math.PI / 2; halo.position.y = 0.09; g.add(halo);
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 14, 12, 1, true), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.2, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
  beam.position.y = 8; g.add(beam);
  const lab = labelSprite(label, '#' + new THREE.Color(color).getHexString(), 3.6); lab.position.y = 3.3; g.add(lab);
  scene.add(g); return { g, top, halo, beam, x, z };
}
const EGG = { disc: {} };
function spawnEgg() {
  const o = W.off; const mon = (W.data.egg && W.data.egg.monument) || [W.travel[0][1], W.travel[0][2]];
  const face = Math.atan2(W.travel[0][1] - mon[0], W.travel[0][2] - mon[1]) || 0;
  EGG.mon = { x: mon[0], z: mon[1] }; EGG.monObj = makeMonument(mon[0], mon[1], face); scene.add(EGG.monObj);
  W.props = [{ x: mon[0], z: mon[1], r: 2.4 }];
  // the glowing button stands ~4.5 m beside the monument
  let bx = mon[0] + Math.cos(face) * 4.6, bz = mon[1] - Math.sin(face) * 4.6;
  if (insideBuilding(bx, bz, 1.2)) { bx = mon[0] - Math.cos(face) * 4.6; bz = mon[1] + Math.sin(face) * 4.6; }
  EGG.go = makeTeleportButton(bx, bz, 0x22e6ff, 'TELEPORT: OFF-ROAD');
  W.props.push({ x: bx, z: bz, r: 0.55 });
  // trailhead: 4x4 + return button
  const th = o.th; const fx = Math.sin(th.h), fz = Math.cos(th.h); let h = th.h;
  const c1 = o.cps[0]; if ((c1[0] - th.x) * fx + (c1[1] - th.z) * fz < 0) h += Math.PI;
  const [jx, jz] = findFree(th.x, th.z, 2.2); EGG.jeepSpot = { x: jx, z: jz, h };
  EGG.jeep = new Car(scene, 0x556b2f, jx, jz, h, { offroad: true }); cars.push(EGG.jeep);
  let rx = jx + Math.cos(h) * 4.5, rz = jz - Math.sin(h) * 4.5; [rx, rz] = findFree(rx, rz, 1.0);
  EGG.back = makeTeleportButton(rx, rz, 0xff8a1e, 'POWRÓT DO MIASTA'); W.props.push({ x: rx, z: rz, r: 0.55 });
  try { EGG.disc = JSON.parse(localStorage.getItem('gtatbg_egg') || '{}') || {}; } catch (e) { EGG.disc = {}; }
  if (EGG.disc.monument) discover('monument', true); if (EGG.disc.trails) discover('trails', true);
  EGG.race = { i: 0, t0: 0, running: false, done: false, best: EGG.disc.best || 0 };
  window.__egg = EGG; EGG.action = actionE; EGG.groundH = groundH;
  const hud = document.createElement('div'); hud.id = 'race'; hud.className = 'hidden'; $('hud').appendChild(hud); EGG.hud = hud;
}
function discover(what, silent) {
  if (EGG.disc[what] && !silent) return;
  if (what === 'monument' && !EGG.travMon) { EGG.travMon = ['★ Pomnik B. Głowackiego – tajny teleport', EGG.go.x + 2.2, EGG.go.z + 1.5]; W.travel.push(EGG.travMon); }
  if (what === 'trails' && !EGG.travTr) { EGG.travTr = ['★ Trasy off-road – Jezioro Tarnobrzeskie', EGG.back.x + 2.2, EGG.back.z + 1.5]; W.travel.push(EGG.travTr); }
  EGG.disc[what] = true; saveEgg();
  if (typeof buildTravelList === 'function' && BM.c) buildTravelList();
  if (!silent) toast(what === 'monument' ? 'Odkryto sekret: świecący przycisk przy pomniku!' : 'Odkryto: Trasy off-road (dodano do mapy M)', 2600);
}
function saveEgg() { try { localStorage.setItem('gtatbg_egg', JSON.stringify(EGG.disc)); } catch (e) { /* file:// or private mode */ } }
function nearEggButton() {
  if (!EGG.go || G.mode !== 'foot') return null;
  if (Math.hypot(player.x - EGG.go.x, player.z - EGG.go.z) < 2.6) return 'go';
  if (Math.hypot(player.x - EGG.back.x, player.z - EGG.back.z) < 2.6) return 'back';
  return null;
}
function actionE() { if (G.cut) return false; if (typeof dialogAction === 'function' && dialogAction()) return true; const b = nearEggButton(); if (b === 'go') return eggGo(); if (b === 'back') return eggBack(); if (missionAction()) return true; if (shopAction()) return true; return enterExit(); }
function eggGo() {
  discover('trails'); const j = EGG.jeep, s = EGG.jeepSpot;
  j.x = s.x; j.z = s.z; j.h = s.h; j.vx = j.vz = 0; j.y = groundH(j.x, j.z); j.vy = 0; j.sync();
  player.x = j.x + Math.cos(j.h) * 1.5; player.z = j.z - Math.sin(j.h) * 1.5; player.y = groundH(player.x, player.z);
  enterExit(); raceReset(); updateVisibility(true); flash();
  toast('Trasy off-road nad Jeziorem Tarnobrzeskim! Przejedź przez ' + W.off.cps.length + ' checkpointów', 3500);
  return true;
}
function eggBack() {
  teleport(EGG.go.x + 2.2, EGG.go.z + 1.5); player.h = G.yaw; flash(); EGG.race.running = false; raceHud();
  toast('Powrót pod pomnik Bartosza Głowackiego', 2200); return true;
}
function flash() { const f = document.createElement('div'); f.className = 'tpflash'; document.body.appendChild(f); setTimeout(() => f.remove(), 700); }
function raceReset() { const r = EGG.race; r.i = 0; r.t0 = 0; r.running = true; r.done = false; showCp(); raceHud(); }
function showCp() { W.off.cpObjs.forEach((c, i) => { c.g.visible = EGG.race.running && i === EGG.race.i; }); }
function fmtT(t) { const m = Math.floor(t / 60), s = t - m * 60; return String(m).padStart(2, '0') + ':' + s.toFixed(1).padStart(4, '0'); }
function raceHud() {
  const r = EGG.race, el = EGG.hud; if (!el) return;
  if (!r.running) { el.classList.add('hidden'); return; }
  const t = r.t0 ? (performance.now() - r.t0) / 1000 : 0;
  el.classList.remove('hidden'); el.textContent = '🏁 Checkpoint ' + (r.i + 1) + '/' + W.off.cps.length + ' · ' + fmtT(t) + (r.best ? ' · rekord ' + fmtT(r.best) : '');
}
function updateEgg(dt) {
  if (!EGG.go) return;
  const tt = performance.now() * 0.004; const pulse = 0.5 + 0.5 * Math.sin(tt);
  for (const b of [EGG.go, EGG.back]) { b.halo.material.opacity = 0.25 + 0.45 * pulse; b.halo.scale.setScalar(0.9 + pulse * 0.25); b.top.position.y = 1.08 + pulse * 0.03; }
  const px = G.mode === 'car' ? activeCar.x : player.x, pz = G.mode === 'car' ? activeCar.z : player.z;
  if (!EGG.disc.monument && Math.hypot(px - EGG.mon.x, pz - EGG.mon.z) < 30) discover('monument');
  const r = EGG.race; if (!r.running) {
    if (r.done && G.mode === 'car' && activeCar === EGG.jeep && Math.hypot(px - EGG.jeepSpot.x, pz - EGG.jeepSpot.z) < 10) { raceReset(); toast('Nowy przejazd – start!', 1800); }
    return;
  }
  const cps = W.off.cpObjs; const c = cps[r.i]; c.ring.rotation.z += dt * 0.6;
  if (G.mode === 'car' && !r.t0 && activeCar.speed > 1) r.t0 = performance.now();
  if (G.mode === 'car' && Math.hypot(px - c.x, pz - c.z) < 7) {
    r.i++;
    if (r.i >= cps.length) {
      const t = (performance.now() - (r.t0 || performance.now())) / 1000; r.running = false; r.done = true; r.last = t; r.lastAt = performance.now();
      const rec = !r.best || t < r.best; if (rec) { r.best = t; EGG.disc.best = t; saveEgg(); }
      toast('META! Czas ' + fmtT(t) + (rec ? ' – nowy rekord!' : '') + ' Wróć na start, by jechać ponownie', 5000);
    } else toast('Checkpoint ' + r.i + '/' + cps.length, 1200);
    showCp();
  }
  raceHud();
}
function eggHint() {
  const b = nearEggButton();
  if (b === 'go') return isTouch ? 'Dotknij TELEPORT: Teleport na trasy off-road' : 'Naciśnij E / dotknij: Teleport na trasy off-road';
  if (b === 'back') return isTouch ? 'Dotknij TELEPORT: powrót pod pomnik' : 'Naciśnij E: Teleport pod pomnik B. Głowackiego';
  return null;
}
function drawEggMinimap(g, sc) {
  if (!EGG.go) return;
  g.fillStyle = '#22e6ff'; g.strokeStyle = '#003'; g.lineWidth = 2 / sc;
  for (const b of [EGG.go, EGG.back]) { g.beginPath(); g.arc(b.x, b.z, 7 / sc, 0, 7); g.fill(); g.stroke(); }
  if (EGG.race.running) { const c = W.off.cpObjs[EGG.race.i]; g.fillStyle = '#ffb020'; g.beginPath(); g.arc(c.x, c.z, 9 / sc, 0, 7); g.fill(); g.stroke(); }
}

// ======================= ROAD GRAPH + TRAFFIC + PEDESTRIANS =======================
const TR = { nodes: [], edges: [], adj: [], egrid: new Map(), agents: [], pool: [], peds: [], spawnT: 0, pedT: 0, stats: { spawned: 0, despawned: 0, moved: 0 } };
const TR_TYPES = new Set(['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'residential', 'unclassified', 'living_street']);
const TR_VMAX = { motorway: 22, trunk: 17, primary: 15, secondary: 14, tertiary: 12, residential: 9.5, unclassified: 10, living_street: 6 };
const PED_TYPES = new Set(['residential', 'tertiary', 'secondary', 'primary', 'living_street', 'unclassified']);
function inOffZone(x, z) { return x > -1750 && x < -150 && z > 2350 && z < 5050; }
function buildRoadGraph() {
  const key = (x, z) => Math.round(x * 2) + ',' + Math.round(z * 2);
  const cnt = new Map(); const roads = W.roads.filter((r) => TR_TYPES.has(r.type) && !inOffZone(r.pts[0], r.pts[1]));
  for (const r of roads) for (let i = 0; i < r.pts.length; i += 2) { const k = key(r.pts[i], r.pts[i + 1]); cnt.set(k, (cnt.get(k) || 0) + 1); }
  const nid = new Map();
  const node = (x, z) => { const k = key(x, z); let id = nid.get(k); if (id === undefined) { id = TR.nodes.length; nid.set(k, id); TR.nodes.push({ x, z, deg: 0, maxW: 0, rank: 0 }); TR.adj.push([]); } return id; };
  for (const r of roads) {
    const p = r.pts, n = p.length / 2; let start = 0;
    for (let i = 1; i < n; i++) {
      if (i === n - 1 || cnt.get(key(p[i * 2], p[i * 2 + 1])) > 1) {
        const pts = Array.from(p.slice(start * 2, i * 2 + 2)); const cum = [0];
        for (let j = 1; j < pts.length / 2; j++) cum.push(cum[j - 1] + Math.hypot(pts[j * 2] - pts[j * 2 - 2], pts[j * 2 + 1] - pts[j * 2 - 1]));
        const len = cum[cum.length - 1];
        if (len > 0.5) {
          const a = node(pts[0], pts[1]), b = node(pts[pts.length - 2], pts[pts.length - 1]);
          const e = { id: TR.edges.length, a, b, pts, cum, len, ow: r.oneway, w: r.width, type: r.type, vmax: TR_VMAX[r.type] || 10, name: r.name, bridge: r.bridge, ped: PED_TYPES.has(r.type) };
          TR.edges.push(e); TR.adj[a].push({ e: e.id, dir: 1 }); if (!r.oneway) TR.adj[b].push({ e: e.id, dir: -1 }); else TR.adj[b].push({ e: e.id, dir: -1, back: true });
          for (const q of [a, b]) { const nd = TR.nodes[q]; nd.deg++; nd.maxW = Math.max(nd.maxW, r.width); }
          const mx = pts[Math.floor(pts.length / 4) * 2], mz = pts[Math.floor(pts.length / 4) * 2 + 1];
          for (let j = 0; j < pts.length; j += 2) { const ck = Math.floor(pts[j] / 100) + ',' + Math.floor(pts[j + 1] / 100); let arr = TR.egrid.get(ck); if (!arr) { arr = []; TR.egrid.set(ck, arr); } if (arr[arr.length - 1] !== e.id) arr.push(e.id); }
          void mx; void mz;
        }
        start = i;
      }
    }
  }
  W.graph = TR;
}
// position on edge at arc length u (from a), returns heading too
function edgeSample(e, u, out) {
  u = clamp(u, 0, e.len); const c = e.cum; let lo = 0, hi = c.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (c[m] <= u) lo = m; else hi = m; }
  const t = (u - c[lo]) / Math.max(1e-6, c[hi] - c[lo]); const p = e.pts;
  out.x = p[lo * 2] + (p[hi * 2] - p[lo * 2]) * t; out.z = p[lo * 2 + 1] + (p[hi * 2 + 1] - p[lo * 2 + 1]) * t;
  out.h = Math.atan2(p[hi * 2] - p[lo * 2], p[hi * 2 + 1] - p[lo * 2 + 1]); return out;
}
function nearestNode(x, z, maxR = 400) {
  let best = -1, bd = 1e18;
  for (let R = 1; R <= Math.ceil(maxR / 100); R++) {
    const cx = Math.floor(x / 100), cz = Math.floor(z / 100);
    for (let i = -R; i <= R; i++) for (let j = -R; j <= R; j++) {
      const arr = TR.egrid.get((cx + i) + ',' + (cz + j)); if (!arr) continue;
      for (const id of arr) { const e = TR.edges[id]; for (const n of [e.a, e.b]) { const nd = TR.nodes[n]; const d = (nd.x - x) ** 2 + (nd.z - z) ** 2; if (d < bd) { bd = d; best = n; } } }
    }
    if (best >= 0) break;
  }
  return best;
}
// A* over the road graph with a binary heap (one-way ignored: police / race planning)
function astar(from, to, maxIter = 20000) {
  if (from < 0 || to < 0) return null; if (from === to) return [from];
  const N = TR.nodes, goal = N[to]; const gS = new Map([[from, 0]]), prev = new Map(), closed = new Set();
  const hk = [], hv = [];
  const push = (k, v) => { hk.push(k); hv.push(v); let i = hk.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (hk[p] <= hk[i]) break; [hk[p], hk[i]] = [hk[i], hk[p]]; [hv[p], hv[i]] = [hv[i], hv[p]]; i = p; } };
  const pop = () => { const v = hv[0]; const lk = hk.pop(), lv = hv.pop(); if (hk.length) { hk[0] = lk; hv[0] = lv; let i = 0; for (;;) { const l = i * 2 + 1, r = l + 1; let m = i; if (l < hk.length && hk[l] < hk[m]) m = l; if (r < hk.length && hk[r] < hk[m]) m = r; if (m === i) break; [hk[m], hk[i]] = [hk[i], hk[m]]; [hv[m], hv[i]] = [hv[i], hv[m]]; i = m; } } return v; };
  push(0, from); let it = 0;
  while (hk.length && it++ < maxIter) {
    const cur = pop();
    if (cur === to) { const path = [cur]; let c = cur; while (prev.has(c)) { c = prev.get(c); path.push(c); } return path.reverse(); }
    if (closed.has(cur)) continue; closed.add(cur);
    for (const a of TR.adj[cur]) {
      const e = TR.edges[a.e]; const nx = a.dir > 0 ? e.b : e.a; if (closed.has(nx)) continue;
      const g = gS.get(cur) + e.len; if (g < (gS.has(nx) ? gS.get(nx) : 1e18)) { gS.set(nx, g); prev.set(nx, cur); push(g + Math.hypot(N[nx].x - goal.x, N[nx].z - goal.z), nx); }
    }
  }
  return null;
}
// polyline (x,z pairs) following the road geometry of a node path
function pathPoints(path) {
  const out = [];
  for (let i = 0; i + 1 < path.length; i++) {
    const a = path[i], b = path[i + 1]; let best = null;
    for (const o of TR.adj[a]) { const e = TR.edges[o.e]; if ((o.dir > 0 ? e.b : e.a) === b && (!best || e.len < best.e.len)) best = { e, dir: o.dir }; }
    if (!best) { out.push(TR.nodes[b].x, TR.nodes[b].z); continue; }
    const p = best.e.pts, n = p.length / 2;
    if (best.dir > 0) for (let k = 1; k < n; k++) out.push(p[k * 2], p[k * 2 + 1]); else for (let k = n - 2; k >= 0; k--) out.push(p[k * 2], p[k * 2 + 1]);
  }
  return out;
}
// zebra crossings near larger intersections
function addZebras(bufOf, white) {
  let n = 0;
  for (let i = 0; i < TR.nodes.length && n < 900; i++) {
    const nd = TR.nodes[i]; if (nd.deg < 3 || nd.maxW < 6.5) continue;
    if (Math.hypot(nd.x + 7, nd.z - 10) > 3200) continue;
    for (const a of TR.adj[i]) {
      const e = TR.edges[a.e]; if (e.len < 18 || e.w < 5.5 || e.bridge) continue;
      const u = a.dir > 0 ? Math.min(e.len * 0.5, nd.maxW / 2 + 3.2) : Math.max(e.len * 0.5, e.len - nd.maxW / 2 - 3.2);
      const s = edgeSample(e, u, {}); const fx = Math.sin(s.h), fz = Math.cos(s.h), rx = -fz, rz = fx;
      const half = e.w / 2 - 0.35; const b = bufOf(s.x, s.z); const y = 0.215;
      for (let o = -half; o <= half - 0.4; o += 0.9) {
        const cx = s.x + rx * (o + 0.25), cz = s.z + rz * (o + 0.25); const L = 1.4, Wd = 0.25;
        const p = [[cx - fx * L - rx * Wd, cz - fz * L - rz * Wd], [cx + fx * L - rx * Wd, cz + fz * L - rz * Wd], [cx + fx * L + rx * Wd, cz + fz * L + rz * Wd], [cx - fx * L + rx * Wd, cz - fz * L + rz * Wd]];
        b.tri(p[0][0], y, p[0][1], p[2][0], y, p[2][1], p[1][0], y, p[1][1], white, null, 0, 1, 0);
        b.tri(p[0][0], y, p[0][1], p[3][0], y, p[3][1], p[2][0], y, p[2][1], white, null, 0, 1, 0);
      }
      n++;
    }
  }
  W.zebras = n;
}

// ---------------- traffic agents
const tmpS = { x: 0, z: 0, h: 0 }, tmpS2 = { x: 0, z: 0, h: 0 };
function trafficMax() { return { low: 15, med: 22, high: 30 }[settings.quality] || 22; }
function initTraffic() {
  const rnd = mulberry32(5);
  const pal = TOON ? TOON_CAR_COLORS : CAR_COLORS;
  for (let i = 0; i < 30; i++) {
    const c = new Car(scene, pal[Math.floor(rnd() * pal.length)], 0, -99999, 0); c.g.visible = false; c.pooled = true; TR.pool.push(c);
  }
  initPeds();
}
function laneOffset(e) { return e.ow ? 0 : Math.min(e.w / 4, 1.8); }
function agentPose(c) {
  const a = c.ai, e = TR.edges[a.e]; const u = a.dir > 0 ? a.s : e.len - a.s;
  edgeSample(e, u, tmpS); const u2 = a.dir > 0 ? Math.min(e.len, a.s + 2.5) : Math.max(0, e.len - a.s - 2.5), u1 = a.dir > 0 ? Math.max(0, a.s - 2.5) : Math.min(e.len, e.len - a.s + 2.5);
  const p1 = edgeSample(e, u1, { x: 0, z: 0 }), p2 = edgeSample(e, u2, tmpS2);
  let h = Math.atan2(p2.x - p1.x, p2.z - p1.z); if (!isFinite(h)) h = a.dir > 0 ? tmpS.h : tmpS.h + Math.PI;
  const off = laneOffset(e); return { x: tmpS.x - Math.cos(h) * off, z: tmpS.z + Math.sin(h) * off, h };
}
function chooseNext(c) {
  const a = c.ai, e = TR.edges[a.e]; const node = a.dir > 0 ? e.b : e.a;
  const opts = TR.adj[node].filter((o) => !o.back && o.e !== a.e);
  if (!opts.length) { const o = TR.adj[node].find((q) => q.e === a.e && !q.back); return o ? { e: o.e, dir: o.dir, turn: 3 } : null; }
  const endH = agentEndHeading(e, a.dir);
  const scored = opts.map((o) => { const e2 = TR.edges[o.e]; const h2 = edgeSample(e2, o.dir > 0 ? Math.min(3, e2.len) : Math.max(0, e2.len - 3), tmpS2).h + (o.dir > 0 ? 0 : Math.PI); let d = h2 - endH; d = Math.atan2(Math.sin(d), Math.cos(d)); return { ...o, turn: Math.abs(d), w: 1 / (0.4 + Math.abs(d)) * (TR_VMAX[e2.type] || 8) }; });
  let tot = 0; for (const s of scored) tot += s.w; let r = Math.random() * tot; for (const s of scored) { r -= s.w; if (r <= 0) return s; } return scored[0];
}
function agentEndHeading(e, dir) { const p = e.pts, n = p.length / 2; if (dir > 0) return Math.atan2(p[n * 2 - 2] - p[n * 2 - 4], p[n * 2 - 1] - p[n * 2 - 3]); return Math.atan2(p[0] - p[2], p[1] - p[3]); }
function focusPos() { return G.mode === 'car' && activeCar ? activeCar : player; }
function spawnAgent(f) {
  let c; const wantPatrol = !TR.agents.some((a) => a.patrol) && POL.pool.length && WANT.stars === 0 && Math.random() < 0.15;
  if (wantPatrol) { c = POL.pool.pop(); c.patrol = true; } else c = TR.pool.pop(); if (!c) return false;
  for (let t = 0; t < 12; t++) {
    const ang = Math.random() * 6.283, R = 110 + Math.random() * 190; const x = f.x + Math.cos(ang) * R, z = f.z + Math.sin(ang) * R;
    const arr = TR.egrid.get(Math.floor(x / 100) + ',' + Math.floor(z / 100)); if (!arr || !arr.length) continue;
    const e = TR.edges[arr[Math.floor(Math.random() * arr.length)]]; if (e.len < 12) continue;
    const dir = e.ow ? 1 : (Math.random() < 0.5 ? 1 : -1); const s = Math.random() * e.len;
    c.ai = { e: e.id, dir, s, v: e.vmax * 0.6, next: null, mode: 'drive', stuck: 0 };
    const p = agentPose(c); const d = Math.hypot(p.x - f.x, p.z - f.z); if (d < 80) continue;
    if (cars.some((o) => Math.hypot(o.x - p.x, o.z - p.z) < 15)) continue;
    if (insideBuilding(p.x, p.z, 1.0)) continue;
    c.x = p.x; c.z = p.z; c.h = p.h; c.vx = c.vz = 0; c.y = 0; c.vy = 0; c.hp = 100; c.wrecked = false; c.burn = 0; c.pooled = false; c.g.visible = true; c.sync();
    if (c.smokeT) c.smokeT = 0; TR.agents.push(c); cars.push(c); TR.stats.spawned++; return true;
  }
  c.ai = null; if (c.police) { c.patrol = false; POL.pool.push(c); } else TR.pool.push(c); return false;
}
function despawnCar(c) {
  const i = cars.indexOf(c); if (i >= 0) cars.splice(i, 1);
  const j = TR.agents.indexOf(c); if (j >= 0) TR.agents.splice(j, 1);
  c.ai = null; c.g.visible = false; c.x = 0; c.z = -99999; c.sync(); c.pooled = true; c.wrecked = false; c.hp = 100; c.burn = 0;
  if (c.origColor !== undefined) { c.setPaint(c.origColor); c.origColor = undefined; }
  if (c.wreckPaint) unwreck(c);
  c.pai = null; c.patrol = false; c.block = false;
  if (c.police) POL.pool.push(c); else TR.pool.push(c); TR.stats.despawned++;
}
function updateTraffic(dt) {
  const f = focusPos(); const max = trafficMax();
  TR.spawnT -= dt; if (TR.spawnT <= 0) { TR.spawnT = 0.35; if (!inOffZone(f.x, f.z)) { const k = TR.agents.length < max * 0.5 ? 3 : 1; for (let q = 0; q < k && TR.agents.length < max; q++) spawnAgent(f); } }
  // former traffic cars left behind (stolen / wrecked) also return to the pool when far away
  for (let i = cars.length - 1; i >= 0; i--) { const c = cars[i]; if (c.fromPool && !c.ai && c !== activeCar && !c.mission && Math.hypot(c.x - f.x, c.z - f.z) > 450) { c.fromPool = false; despawnCar(c); } }
  for (let i = TR.agents.length - 1; i >= 0; i--) {
    const c = TR.agents[i]; const a = c.ai; c.fromPool = true;
    const dP = Math.hypot(c.x - f.x, c.z - f.z);
    if (dP > 400 || TR.agents.length > max + 2) { despawnCar(c); continue; }
    lodCar(c, dP);
    if (a.mode !== 'drive') { // knocked out of its lane: plain physics, then resume when stopped
      updateCar(c, dt, false); a.stuck += dt;
      if (c.speed < 0.3 && a.stuck > 3 && !c.wrecked) { a.mode = 'drive'; a.stuck = 0; resnapAgent(c); }
      continue;
    }
    const e = TR.edges[a.e];
    // look ahead for obstacles
    const fx = Math.sin(c.h), fz = Math.cos(c.h); let target = e.vmax;
    const rem = e.len - a.s;
    if (!a.next) a.next = chooseNext(c);
    if (a.next && rem < 22 && a.next.turn > 0.5) target = Math.min(target, 5.5 + rem * 0.35);
    if (a.next && a.next.turn > 2.5 && rem < 10) target = Math.min(target, 3);
    const look = 7 + a.v * 1.4; let block = 1e9;
    const chk = (ox, oz, rr) => { const dx = ox - c.x, dz = oz - c.z; const fw = dx * fx + dz * fz; if (fw <= 0 || fw > look) return; const lat = Math.abs(dx * fz - dz * fx); if (lat < 2.1 + rr) block = Math.min(block, fw); };
    for (const o of cars) if (o !== c && o.g.visible && Math.abs(o.x - c.x) < look && Math.abs(o.z - c.z) < look) chk(o.x, o.z, 0);
    if (G.mode === 'foot') chk(player.x, player.z, 0.4);
    for (const p of TR.peds) if (p.on && Math.abs(p.x - c.x) < look && Math.abs(p.z - c.z) < look) chk(p.x, p.z, 0.2);
    if (block < 1e9) target = Math.min(target, Math.max(0, (block - 6.5) * 0.9));
    a.v += clamp(target - a.v, -9 * dt, 3.5 * dt); if (a.v < 0.05 && target <= 0) a.v = 0;
    a.s += a.v * dt; TR.stats.moved += a.v * dt;
    if (a.v < 0.2 && block < 1e9) { a.wait = (a.wait || 0) + dt; if (a.wait > 14 && dP > 60) { despawnCar(c); continue; } } else a.wait = 0;
    while (a.s > e.len) {
      const ov = a.s - TR.edges[a.e].len; const nx = a.next || chooseNext(c); if (!nx) { a.dir = -a.dir; a.s = 0; break; }
      a.e = nx.e; a.dir = nx.dir; a.s = ov; a.next = null; if (a.s <= TR.edges[a.e].len) break;
    }
    const p = agentPose(c); let dh = p.h - c.h; dh = Math.atan2(Math.sin(dh), Math.cos(dh));
    c.vx = (p.x - c.x) / Math.max(dt, 1e-3); c.vz = (p.z - c.z) / Math.max(dt, 1e-3);
    const sp = Math.hypot(c.vx, c.vz); if (sp > a.v * 1.6 + 6) { c.vx *= (a.v + 1) / sp; c.vz *= (a.v + 1) / sp; }
    c.x = p.x; c.z = p.z; c.h += dh * Math.min(1, dt * 8); c.steer = clamp(dh * 3, -0.5, 0.5);
    c.y = 0; c.sync(); c.spin += a.v * dt / c.wr; for (const w of c.wheels) { w.w.rotation.x = c.spin; if (w.front) w.pv.rotation.y = c.steer; }
    c.g.rotation.x = 0; c.g.rotation.z = 0;
  }
  updatePeds(dt);
}
function resnapAgent(c) {
  const rp = nearestRoadPoint(c.x, c.z, true, 40); if (!rp || rp.dist > 8) { c.ai.mode = 'phys'; return; }
  let best = null, bd = 1e9;
  const arr = TR.egrid.get(Math.floor(c.x / 100) + ',' + Math.floor(c.z / 100)) || [];
  for (const id of arr) { const e = TR.edges[id]; for (let k = 0; k < e.pts.length; k += 2) { const d = Math.hypot(e.pts[k] - c.x, e.pts[k + 1] - c.z); if (d < bd) { bd = d; best = { e, u: e.cum[k / 2] }; } } }
  if (!best) { c.ai.mode = 'phys'; return; }
  const fwd = edgeSample(best.e, best.u, {}); let d = fwd.h - c.h; d = Math.atan2(Math.sin(d), Math.cos(d));
  const dir = best.e.ow || Math.abs(d) < Math.PI / 2 ? 1 : -1;
  c.ai.e = best.e.id; c.ai.dir = dir; c.ai.s = dir > 0 ? best.u : best.e.len - best.u; c.ai.v = 0; c.ai.next = null;
}
function trafficHit(o, by, vn) {
  if (!o.ai || o.ai.mode !== 'drive') return; o.ai.mode = 'phys'; o.ai.stuck = 0;
}
// distant cars: drop wheels / outline hull to save draw calls
function lodCar(c, d) {
  const near = d < 90; if (c.lodNear === near) return; c.lodNear = near;
  for (const w of c.wheels) w.w.visible = near; if (c.hull) c.hull.visible = d < 140;
}
// player steals a traffic car: the driver jumps out and runs away
function carjack(c) {
  if (!c.ai) return false;
  const j = TR.agents.indexOf(c); if (j >= 0) TR.agents.splice(j, 1);
  c.ai = null; c.patrol = false; c.fromPool = true; c.vx *= 0.2; c.vz *= 0.2;
  const rx = -Math.cos(c.h), rz = Math.sin(c.h);
  const p = spawnPedAt(c.x - rx * 2.2, c.z - rz * 2.2); if (p) { p.state = 'flee'; p.t = 7; p.fx = player.x; p.fz = player.z; }
  toast('Kierowca ucieka! „Ratunku, złodziej!”', 1800);
  if (typeof crime === 'function') crime('carjack');
  return true;
}

// ---------------- pedestrians (one instanced mesh for all body parts + outline hull)
const PED_PARTS = [ // [w,h,d, x,y,z, colorSlot, pivot] slots: 0 shirt 1 pants 2 skin 3 hair 4 shoes
  [0.5, 0.62, 0.28, 0, 1.22, 0, 0, 0], [0.3, 0.32, 0.3, 0, 1.68, 0, 2, 0], [0.32, 0.1, 0.32, 0, 1.83, 0, 3, 0],
  [0.14, 0.6, 0.14, -0.33, 1.2, 0, 0, 1], [0.14, 0.6, 0.14, 0.33, 1.2, 0, 0, 2], [0.19, 0.88, 0.19, -0.13, 0.46, 0, 1, 3], [0.19, 0.88, 0.19, 0.13, 0.46, 0, 1, 4],
];
const PED_SHIRTS = ['#e8503a', '#3d8fe0', '#f6c431', '#45b65a', '#a66bd0', '#f08a2c', '#4fc3c8', '#f4f1ea', '#e86fa0'].map((c) => new THREE.Color(c));
const PED_PANTS = ['#2c3e66', '#3a3a3a', '#6b4a32', '#24508a', '#5a5a64'].map((c) => new THREE.Color(c));
const PED_SKIN = ['#e2b08c', '#c98f6a', '#f1c9a5', '#8d5a3c'].map((c) => new THREE.Color(c));
const PED_HAIR = ['#3a2a1c', '#1d1d1d', '#c79a4a', '#8a3b1e', '#d8d2c8'].map((c) => new THREE.Color(c));
function pedMax() { return { low: 12, med: 20, high: 30 }[settings.quality] || 20; }
function initPeds() {
  const MAXP = 30, NP = PED_PARTS.length;
  const geo = addHdir(new THREE.BoxGeometry(1, 1, 1));
  TR.pedMesh = new THREE.InstancedMesh(geo, mkMat({ color: 0xffffff }), MAXP * NP); TR.pedMesh.castShadow = true;
  TR.pedMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); TR.pedMesh.frustumCulled = false;
  const z = new THREE.Matrix4().makeScale(0, 0, 0);
  for (let i = 0; i < MAXP * NP; i++) { TR.pedMesh.setMatrixAt(i, z); TR.pedMesh.setColorAt(i, PED_SHIRTS[0]); }
  scene.add(TR.pedMesh);
  if (TOON) { TR.pedHull = new THREE.InstancedMesh(geo, hullMats().small, MAXP * NP); TR.pedHull.instanceMatrix = TR.pedMesh.instanceMatrix; TR.pedHull.frustumCulled = false; scene.add(TR.pedHull); }
  for (let i = 0; i < MAXP; i++) TR.peds.push({ on: false, i, x: 0, z: 0, h: 0, v: 0, phase: Math.random() * 6, state: 'walk', t: 0 });
}
function pedColors(p) {
  const r = Math.random; const cs = [PED_SHIRTS[Math.floor(r() * PED_SHIRTS.length)], PED_PANTS[Math.floor(r() * PED_PANTS.length)], PED_SKIN[Math.floor(r() * PED_SKIN.length)], PED_HAIR[Math.floor(r() * PED_HAIR.length)]];
  PED_PARTS.forEach((pp, k) => TR.pedMesh.setColorAt(p.i * PED_PARTS.length + k, cs[pp[6]]));
  TR.pedMesh.instanceColor.needsUpdate = true;
}
function spawnPedAt(x, z) {
  const p = TR.peds.find((q) => !q.on); if (!p) return null;
  Object.assign(p, { on: true, x, z, h: Math.random() * 6.28, v: 1.4, state: 'walk', t: 0, e: -1, fall: 0 }); pedColors(p); return p;
}
function spawnPedWalker(f) {
  for (let t = 0; t < 8; t++) {
    const ang = Math.random() * 6.283, R = 35 + Math.random() * 150; const x = f.x + Math.cos(ang) * R, z = f.z + Math.sin(ang) * R;
    const arr = TR.egrid.get(Math.floor(x / 100) + ',' + Math.floor(z / 100)); if (!arr) continue;
    const e = TR.edges[arr[Math.floor(Math.random() * arr.length)]]; if (!e.ped || e.len < 10) continue;
    const side = Math.random() < 0.5 ? 1 : -1; const s = Math.random() * e.len; const smp = edgeSample(e, s, {});
    const off = side * (e.w / 2 + 1.45); const px = smp.x - Math.cos(smp.h) * off, pz = smp.z + Math.sin(smp.h) * off;
    if (insideBuilding(px, pz, 0.4)) continue;
    const p = spawnPedAt(px, pz); if (!p) return; p.e = e.id; p.s = s; p.dir = Math.random() < 0.5 ? 1 : -1; p.side = side; p.v = 1.2 + Math.random() * 0.6; return;
  }
}
const pm4 = new THREE.Matrix4(), pm4b = new THREE.Matrix4(), pq = new THREE.Quaternion(), pe = new THREE.Euler(), pv3 = new THREE.Vector3(), ps3 = new THREE.Vector3();
function updatePeds(dt) {
  const f = focusPos(); const max = pedMax(); let active = 0;
  for (const p of TR.peds) if (p.on) active++;
  TR.pedT -= dt; if (TR.pedT <= 0) { TR.pedT = 0.5; if (active < max && !inOffZone(f.x, f.z)) spawnPedWalker(f); }
  const NP = PED_PARTS.length; const zero = new THREE.Matrix4().makeScale(0, 0, 0); const camP = camera.position;
  for (const p of TR.peds) {
    if (!p.on) continue;
    const d = Math.hypot(p.x - f.x, p.z - f.z);
    if (d > 260 || (active > max + 3 && d > 80)) { p.on = false; active--; for (let k = 0; k < NP; k++) TR.pedMesh.setMatrixAt(p.i * NP + k, zero); continue; }
    // hit by any moving car
    if (p.state !== 'fall') for (const c of cars) {
      if (!c.g.visible || Math.abs(c.x - p.x) > 4 || Math.abs(c.z - p.z) > 4) continue;
      for (const [cx, cz] of c.circles()) {
        const dx = p.x - cx, dz = p.z - cz, dd = Math.hypot(dx, dz);
        if (dd < 1.25) {
          const sp = c.speed;
          if (sp > 4) { p.state = 'fall'; p.t = 0; p.fvx = c.vx * 0.6 + dx / (dd || 1) * 2; p.fvz = c.vz * 0.6 + dz / (dd || 1) * 2; p.fh = Math.atan2(c.vx, c.vz); if (c === activeCar && typeof crime === 'function') crime('ped'); if (c === activeCar) toast(pick(Math.random, ['Ała!', 'Uważaj jak jeździsz!', 'Moje zakupy!']), 900); }
          else { p.x = cx + dx / (dd || 1) * 1.25; p.z = cz + dz / (dd || 1) * 1.25; }
          break;
        }
      }
    }
    let pitch = 0, swing = 0, run = false;
    if (p.state === 'fall') {
      p.t += dt; const k = Math.max(0, 1 - p.t * 2.2); p.x += p.fvx * dt * k; p.z += p.fvz * dt * k; p.h = p.fh;
      pitch = p.t < 2.4 ? -Math.min(1, p.t * 4) * 1.45 : -1.45 * Math.max(0, 1 - (p.t - 2.4) * 2.5);
      if (p.t > 2.8) { p.state = 'flee'; p.t = 6; p.fx = f.x; p.fz = f.z; }
    } else if (p.state === 'flee') {
      p.t -= dt; const ax = p.x - p.fx, az = p.z - p.fz, L = Math.hypot(ax, az) || 1; p.h = Math.atan2(ax / L, az / L);
      const nx = p.x + ax / L * 6.5 * dt, nz = p.z + az / L * 6.5 * dt; collideCircle(nx, nz, 0.35, col, true); p.x = col.x; p.z = col.z; run = true;
      if (p.t <= 0) { p.state = 'walk'; p.e = -1; }
    } else if (p.e >= 0) {
      const e = TR.edges[p.e]; p.s += p.dir * p.v * dt;
      if (p.s < 0 || p.s > e.len) { p.dir = -p.dir; p.s = clamp(p.s, 0, e.len); }
      const smp = edgeSample(e, p.s, {}); const off = p.side * (e.w / 2 + 1.45);
      const tx = smp.x - Math.cos(smp.h) * off, tz = smp.z + Math.sin(smp.h) * off; p.h = Math.atan2(tx - p.x, tz - p.z) || p.h;
      if (Math.hypot(tx - p.x, tz - p.z) > 6) { p.x = tx; p.z = tz; } else { p.x = tx; p.z = tz; }
    } else { p.v = 0.8; const nx = p.x + Math.sin(p.h) * p.v * dt, nz = p.z + Math.cos(p.h) * p.v * dt; collideCircle(nx, nz, 0.35, col, true); if (col.hit) p.h += 1.5; p.x = col.x; p.z = col.z; }
    if (p.state !== 'fall') { p.phase += dt * (run ? 6.5 : p.v) * 2.6; swing = Math.sin(p.phase) * (run ? 0.9 : 0.55); }
    // matrices
    const far = Math.hypot(p.x - camP.x, p.z - camP.z) > 160;
    pe.set(pitch, p.h, 0, 'YXZ'); pq.setFromEuler(pe); pv3.set(p.x, groundH(p.x, p.z), p.z); ps3.set(1, 1, 1); pm4.compose(pv3, pq, ps3);
    PED_PARTS.forEach((pp, k) => {
      if (far && k > 1) { TR.pedMesh.setMatrixAt(p.i * NP + k, zero); return; }
      const piv = pp[7]; let rot = 0; if (piv === 1 || piv === 4) rot = swing; else if (piv === 2 || piv === 3) rot = -swing;
      if (piv) { // limb rotates about its top
        const top = pp[4] + pp[1] / 2; pm4b.makeTranslation(pp[3], top, pp[5]); const r = new THREE.Matrix4().makeRotationX(rot); pm4b.multiply(r); pm4b.multiply(new THREE.Matrix4().makeTranslation(0, -pp[1] / 2, 0));
      } else pm4b.makeTranslation(pp[3], pp[4], pp[5]);
      pm4b.multiply(new THREE.Matrix4().makeScale(pp[0], pp[1], pp[2])); pm4b.premultiply(pm4);
      TR.pedMesh.setMatrixAt(p.i * NP + k, pm4b);
    });
  }
  TR.pedMesh.instanceMatrix.needsUpdate = true;
}

// ======================= WANTED LEVEL, POLICE, DAMAGE, LAKIERNIA, MONEY =======================
const SAVE = { money: 100, done: {}, best: {} };
(function loadSave() { try { const s = JSON.parse(localStorage.getItem('gtatbg_save') || 'null'); if (s && typeof s.money === 'number') Object.assign(SAVE, s); } catch (e) { /* ignore */ } })();
function saveGame() { try { localStorage.setItem('gtatbg_save', JSON.stringify(SAVE)); } catch (e) { /* ignore */ } }
function addMoney(n, why) {
  SAVE.money = Math.max(0, Math.round(SAVE.money + n)); saveGame(); moneyHud(n);
  if (why) toast((n >= 0 ? '+' : '') + n + ' zł · ' + why, 1800);
}
const WANT = { stars: 0, evade: 0, seen: false, seenT: 0, cool: {}, crimes: 0, maxSeen: 0 };
const POL = { cars: [], pool: [], foot: [], blocks: [], spawnT: 0, blockT: 0, losT: 0, bustT: 0, siren: null, events: [] };
const PLACES = {
  komenda: [-497, 303], szpital: [-68, 776], rynek: [-7, 10],
  shops: [{ n: 'Lakiernia „Warsztat”', x: 1081, z: 471 }, { n: 'Lakiernia DULUX', x: -442, z: 377 }, { n: 'Lakiernia przy myjni', x: 1381, z: -1262 }],
};
function ensureHud() {
  const hud = $('hud'); if ($('wanted')) return;
  const mk = (tag, id, cls, html) => { const e = document.createElement(tag); e.id = id; if (cls) e.className = cls; if (html) e.innerHTML = html; hud.appendChild(e); return e; };
  mk('div', 'wanted', '', '<span>★</span><span>★</span><span>★</span><span>★</span><span>★</span>');
  mk('div', 'money', '', '100 zł');
  mk('div', 'hpbar', 'hidden', '<i></i>');
  const b = document.createElement('div'); b.id = 'banner'; b.className = 'hidden'; document.body.appendChild(b);
  const sm = document.createElement('div'); sm.id = 'shopMenu'; sm.className = 'cdialog hidden';
  sm.innerHTML = '<h3>🎨 Lakiernia</h3><p id="shopTxt"></p><div class="btns"><button id="shopPaint">1 · Przemaluj – 100 zł</button><button id="shopFix">2 · Napraw – 50 zł</button><button id="shopExit" class="sec">Esc · Wyjdź</button></div>';
  document.body.appendChild(sm);
  $('shopPaint').onclick = () => shopBuy('paint'); $('shopFix').onclick = () => shopBuy('fix'); $('shopExit').onclick = () => shopClose();
  moneyHud(0); starsHud();
}
function moneyHud(delta) {
  const m = $('money'); if (!m) return; m.textContent = SAVE.money + ' zł';
  if (delta) { m.classList.remove('bump'); void m.offsetWidth; m.classList.add('bump'); }
}
function starsHud() {
  const w = $('wanted'); if (!w) return; const sp = w.children;
  for (let i = 0; i < 5; i++) sp[i].className = i < WANT.stars ? 'on' : '';
  w.classList.toggle('flash', WANT.stars > 0 && !WANT.seen);
  w.classList.toggle('active', WANT.stars > 0);
}
function banner(txt, cls, ms = 2600) {
  const b = $('banner'); b.textContent = txt; b.className = cls || ''; clearTimeout(banner._t);
  banner._t = setTimeout(() => b.classList.add('hidden'), ms);
}
function setStars(n, why) {
  n = clamp(Math.round(n), 0, 5); const old = WANT.stars; if (n === old) return;
  WANT.stars = n; WANT.evade = 0; WANT.maxSeen = Math.max(WANT.maxSeen, n);
  if (n > old) { WANT.seen = true; WANT.seenT = 0; WANT.knowT = 10; const ff = focusXZ(); WANT.lx = ff.x; WANT.lz = ff.z; toast('★'.repeat(n) + ' Poszukiwany!' + (why ? ' · ' + why : ''), 1800); }
  if (n === 0 && old > 0) { policeStandDown(); }
  POL.events.push({ t: performance.now(), stars: n, why: why || '' });
  starsHud();
}
const CRIMES = { ped: [1, 1.2, 'potrącenie pieszego'], ramPolice: [1, 2, 'taranowanie policji'], carjack: [1, 0.5, 'kradzież auta'], speed: [1, 6, 'przekroczenie prędkości'], shootout: [1, 1, ''] };
function crime(kind) {
  const c = CRIMES[kind]; if (!c) return; const now = performance.now() / 1000;
  if (WANT.cool[kind] && now - WANT.cool[kind] < c[1]) return; WANT.cool[kind] = now; WANT.crimes++;
  const add = kind === 'ped' && WANT.stars >= 2 ? 0 : c[0];
  if (kind === 'ped') WANT.peds = (WANT.peds || 0) + 1;
  if (WANT.stars === 0 || add) setStars(Math.min(5, WANT.stars + Math.max(add, WANT.stars ? 0 : 1)), c[2]);
  else if (kind === 'ped' && WANT.peds % 3 === 0) setStars(WANT.stars + 1, c[2]);
}
function carHitEvent(other, v) {
  if (!other.police) return;
  if (activeCar && activeCar.speed > 4 && activeCar.speed + 0.5 >= other.speed) crime('ramPolice');
}

// ---------- police cars
function initPolice() {
  ensureHud();
  for (let i = 0; i < 7; i++) { const c = new Car(scene, 0xffffff, 0, -99999, 0, { police: true }); c.g.visible = false; c.pooled = true; POL.pool.push(c); POL.cars.push(c); }
  for (let i = 0; i < 4; i++) { const w = makeWalker({ shirt: 0x24489c, pants: 0x1a2340, cap: 0x1a2340, belt: 0x111111 }); w.visible = false; scene.add(w); POL.foot.push({ w, on: false, x: 0, z: 0, h: 0, y: 0 }); }
  // paint-shop markers
  for (const s of PLACES.shops) {
    const [x, z] = findFree(s.x, s.z, 3.5); s.x = x; s.z = z;
    const g = new THREE.Group(); g.position.set(x, 0.05, z);
    const ring = new THREE.Mesh(new THREE.RingGeometry(4.2, 5.2, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xff3fa4, transparent: true, opacity: 0.8, depthWrite: false })); ring.position.y = 0.2; g.add(ring);
    const can = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 1.8, 14), mkMat({ color: 0xff3fa4 })); can.position.y = 4.5; g.add(can);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.4, 0.5, 10), mkMat({ color: 0xffffff })); cap.position.y = 5.6; g.add(cap);
    const lab = labelSprite('🎨 LAKIERNIA', '#ff3fa4', 5); lab.position.y = 7.4; g.add(lab);
    scene.add(g); s.g = g; s.ring = ring; s.can = can;
  }
  POL.fx = makeFx();
}
function freePolice() { return POL.pool.pop() || null; }
function placeOnRoadNear(cx, cz, rMin, rMax, faceX, faceZ) {
  for (let t = 0; t < 16; t++) {
    const ang = Math.random() * 6.283, R = rMin + Math.random() * (rMax - rMin);
    const rp = nearestRoadPoint(cx + Math.cos(ang) * R, cz + Math.sin(ang) * R, true, 120); if (!rp || rp.road.type === 'service' && t < 10) continue;
    if (inOffZone(rp.x, rp.z) !== inOffZone(cx, cz)) continue;
    const d = Math.hypot(rp.x - cx, rp.z - cz); if (d < rMin * 0.7 || d > rMax * 1.3) continue;
    if (cars.some((o) => o.g.visible && Math.hypot(o.x - rp.x, o.z - rp.z) < 8)) continue;
    if (insideBuilding(rp.x, rp.z, 1.2)) continue;
    let h = rp.h; if (faceX !== undefined && Math.sin(h) * (faceX - rp.x) + Math.cos(h) * (faceZ - rp.z) < 0) h += Math.PI;
    return { x: rp.x, z: rp.z, h };
  }
  return null;
}
function activatePolice(c, p) {
  c.x = p.x; c.z = p.z; c.h = p.h; c.vx = c.vz = 0; c.y = groundH(p.x, p.z); c.vy = 0; c.hp = 100; c.wrecked = false; c.burn = 0; c.g.visible = true; c.pooled = false; c.sync();
  c.pai = { path: null, pi: 0, repath: 0, stuck: 0, rev: 0, leave: 0 }; if (!cars.includes(c)) cars.push(c);
  c.headMat.emissiveIntensity = G.night ? 2.5 : 0.2; c.tailMat.emissiveIntensity = G.night ? 1.5 : 0.3;
}
function chasers() { return POL.cars.filter((c) => c.pai && !c.block && !c.wrecked && c.g.visible); }
function policeLeave(c) { c.pai = null; c.patrol = false; const j = TR.agents.indexOf(c); if (j >= 0) TR.agents.splice(j, 1); c.ai = null; }
function policeStandDown() {
  for (const c of POL.cars) if (c.pai) c.pai.leave = 1;
  for (const f of POL.foot) if (f.on) f.leave = true;
  for (const b of POL.blocks) b.leave = true;
}
function focusXZ() { return G.mode === 'car' && activeCar ? activeCar : player; }
function hasLOS(ax, az, bx, bz) {
  const d = Math.hypot(bx - ax, bz - az); const n = Math.ceil(d / 7);
  for (let i = 1; i < n; i++) { const t = i / n; if (insideBuildingH(ax + (bx - ax) * t, az + (bz - az) * t, 1.6)) return false; }
  return true;
}
function updatePolice(dt) {
  const f = focusXZ(); const S = WANT.stars;
  // light bars + siren
  const blink = Math.floor(performance.now() / 160) % 2;
  let nearest = 1e9;
  for (const c of POL.cars) {
    if (!c.g.visible) continue; const on = (c.pai && !c.pai.leave) || c.block;
    c.lbR.color.setHex(on ? (blink ? 0xff2020 : 0x441010) : 0x661111); c.lbB.color.setHex(on ? (blink ? 0x10204a : 0x2a5cff) : 0x112266);
    if (on && c !== activeCar) nearest = Math.min(nearest, Math.hypot(c.x - f.x, c.z - f.z));
  }
  sirenUpdate(nearest, dt);
  // speeding next to a patrol / police car
  if (G.mode === 'car' && activeCar && !activeCar.police && activeCar.speed > 19.5) {
    for (const c of POL.cars) if (c.g.visible && c !== activeCar && Math.hypot(c.x - f.x, c.z - f.z) < 38) { crime('speed'); break; }
  }
  // patrol car converts to a chaser once there are stars
  if (S > 0) for (const c of TR.agents.slice()) if (c.patrol && Math.hypot(c.x - f.x, c.z - f.z) < 260) { policeLeave(c); c.patrol = false; c.pai = { path: null, pi: 0, repath: 0, stuck: 0, rev: 0, leave: 0 }; }
  // spawn chasers
  const want = S === 0 ? 0 : Math.min(5, S + (S >= 3 ? 1 : 0));
  POL.spawnT -= dt;
  if (S > 0 && POL.spawnT <= 0 && (WANT.seen || chasers().length === 0) && chasers().filter((c) => !c.pai.leave).length < want && !G.cut) {
    POL.spawnT = 2.2; const c = freePolice();
    if (c) { const p = placeOnRoadNear(f.x, f.z, 110, 190, f.x, f.z); if (p) { activatePolice(c, p); } else POL.pool.push(c); }
  }
  // roadblocks at 4-5 stars, ahead of the player
  POL.blockT -= dt;
  if (S >= 4 && POL.blockT <= 0 && G.mode === 'car' && activeCar && activeCar.speed > 6) {
    POL.blockT = 22; const fx = activeCar.vx / activeCar.speed, fz = activeCar.vz / activeCar.speed;
    const rp = nearestRoadPoint(f.x + fx * 130, f.z + fz * 130, true, 60);
    if (rp && POL.pool.length >= 2 && Math.hypot(rp.x - f.x, rp.z - f.z) > 70) {
      const nx = -Math.cos(rp.h), nz = Math.sin(rp.h); const half = Math.max(2.2, rp.road.width / 4);
      for (const s of [-1, 1]) { const c = freePolice(); const p = { x: rp.x + nx * half * s, z: rp.z + nz * half * s, h: rp.h + Math.PI / 2 + (s > 0 ? 0.25 : -0.25) }; activatePolice(c, p); c.block = true; c.pai = null; POL.blocks.push(c); }
      toast('🚧 Blokada policji przed tobą!', 1800);
    }
  }
  // drive chasers
  for (const c of POL.cars) {
    if (!c.g.visible || c === activeCar) continue;
    const d = Math.hypot(c.x - f.x, c.z - f.z);
    if (c.block) { if ((S < 4 || c.leave) && d > 120) { const i = POL.blocks.indexOf(c); if (i >= 0) POL.blocks.splice(i, 1); c.block = false; c.leave = false; despawnCar(c); } else if (c.speed > 0.05) updateCar(c, dt, false); continue; }
    if (!c.pai) continue;
    if (c.wrecked) { updateCar(c, dt, false); if (d > 300) despawnCar(c); continue; }
    if (c.pai.leave) { c.pai.leave += dt; updateCar(c, dt, { thr: 0, steer: 0, hand: true }); if (d > 140 || c.pai.leave > 25) despawnCar(c); continue; }
    if (d > 520) { despawnCar(c); continue; }
    chaseDrive(c, f, d, dt);
  }
  // line of sight + escape timer
  POL.losT -= dt; if (WANT.knowT > 0) WANT.knowT -= dt;
  if (S > 0 && POL.losT <= 0) {
    POL.losT = 0.25; let seen = false; const R = S >= 4 ? 170 : 125;
    for (const c of POL.cars) if (c.g.visible && (c.pai || c.block) && c !== activeCar && !c.wrecked && !(c.pai && c.pai.leave)) { const d = Math.hypot(c.x - f.x, c.z - f.z); if (d < R && (d < 25 || hasLOS(c.x, c.z, f.x, f.z))) { seen = true; break; } }
    if (!seen && (WANT.knowT || 0) > 0) seen = true; // fresh crime: dispatch knows where you are for a few seconds
    if (!seen) for (const p of POL.foot) if (p.on && !p.leave && Math.hypot(p.x - f.x, p.z - f.z) < 70 && hasLOS(p.x, p.z, f.x, f.z)) { seen = true; break; }
    if (seen !== WANT.seen) { WANT.seen = seen; starsHud(); }
    if (seen) { WANT.lx = f.x; WANT.lz = f.z; }
  }
  if (S > 0 && !G.cut) {
    if (WANT.seen) { WANT.evade = 0; WANT.seenT += dt; if (WANT.seenT > 50 && S < 3) { WANT.seenT = 0; setStars(S + 1, 'pościg trwa'); } }
    else { WANT.evade += dt; if (WANT.evade > 8 + 3 * S) { setStars(0); toast('Zgubiłeś policję! 😎', 2200); if (typeof missionEvent === 'function') missionEvent('lost'); } }
  }
  updateFootCops(dt, f);
  // BUSTED
  if (S > 0 && !G.cut) {
    let close = false;
    if (G.mode === 'car') { for (const c of POL.cars) if (c.g.visible && !c.wrecked && c !== activeCar && (c.pai || c.block) && Math.hypot(c.x - f.x, c.z - f.z) < 8) { close = true; break; } }
    POL.bustT = close && G.mode === 'car' && activeCar.speed < 2 ? POL.bustT + dt : Math.max(0, POL.bustT - dt * 2);
    if (POL.bustT > 3) busted();
  }
}
function chaseDrive(c, f, d, dt) {
  const a = c.pai; a.repath -= dt;
  if (!WANT.seen && WANT.lx !== undefined) { // search mode: head for the last place the player was seen, then sweep around it
    if (Math.hypot(c.x - WANT.lx, c.z - WANT.lz) < 20) { const r = nearestRoadPoint(WANT.lx + (Math.random() - 0.5) * 160, WANT.lz + (Math.random() - 0.5) * 160, true, 80); if (r) { WANT.lx = r.x; WANT.lz = r.z; } a.repath = 0; }
    if (!a.search) { a.search = true; a.repath = 0; }
    f = { x: WANT.lx, z: WANT.lz }; d = Math.hypot(c.x - f.x, c.z - f.z);
  } else if (a.search) { a.search = false; a.repath = 0; }
  const direct = d < 45 && hasLOS(c.x, c.z, f.x, f.z);
  if (!direct && a.repath <= 0) {
    a.repath = 2 + Math.random() * 0.5;
    const n0 = nearestNode(c.x, c.z), n1 = nearestNode(f.x, f.z); const path = astar(n0, n1);
    if (path) { a.path = pathPoints(path); a.path.unshift(TR.nodes[n0].x, TR.nodes[n0].z); const er = nearestRoadPoint(f.x, f.z, true, 60); if (er) a.path.push(er.x, er.z); a.pi = 0; } else a.path = null;
  }
  let tx = f.x, tz = f.z;
  if (!direct && a.path) {
    while (a.pi < a.path.length / 2 - 1 && Math.hypot(a.path[a.pi * 2] - c.x, a.path[a.pi * 2 + 1] - c.z) < 9) a.pi++;
    tx = a.path[a.pi * 2]; tz = a.path[a.pi * 2 + 1];
  } else if (direct && activeCar && G.mode === 'car') { tx = f.x + activeCar.vx * 0.5; tz = f.z + activeCar.vz * 0.5; } // lead the target a bit (ram)
  let ang = Math.atan2(tx - c.x, tz - c.z) - c.h; ang = Math.atan2(Math.sin(ang), Math.cos(ang));
  let steer = clamp(ang * 2.5, -1, 1), thr = 1, hand = false;
  if (Math.abs(ang) > 1.1 && c.speed > 11) { thr = 0; hand = Math.abs(ang) > 1.6; }
  if (Math.abs(ang) > 2.2 && c.speed < 4) { thr = -1; steer = -steer; }
  if (direct && G.mode === 'foot' && d < 14) { thr = c.speed > 3 ? -1 : 0; if (c.speed < 1.5) spawnFootCopFrom(c); }
  if (a.rev > 0) { a.rev -= dt; thr = a.revT; steer = a.revS; }
  else { a.stuck = Math.abs(c.speed) < 1.2 && thr !== 0 ? a.stuck + dt : 0; if (a.stuck > 1.4) { a.revT = thr > 0 ? -1 : 1; a.rev = 1.3; a.revS = (thr > 0 ? -1 : 1) * Math.sign(ang || 1); a.stuck = 0; a.repath = 0; } } // unstick: back off (or pull forward) away from the obstacle
  updateCar(c, dt, { thr, steer, hand });
}
// ---------- foot police
function spawnFootCopFrom(c) {
  const p = POL.foot.find((q) => !q.on); if (!p || c.footOut) return; c.footOut = true;
  p.on = true; p.leave = false; p.x = c.x - Math.cos(c.h) * 1.8; p.z = c.z + Math.sin(c.h) * 1.8; p.h = c.h; p.y = groundH(p.x, p.z); p.w.visible = true; p.car = c;
}
function updateFootCops(dt, f) {
  if (WANT.stars > 0 && G.mode === 'foot') { // at 2+ stars a cop on foot may also come around a corner
    POL.footT = (POL.footT || 0) - dt;
    if (POL.footT <= 0 && WANT.stars >= 2) { POL.footT = 9; const p = POL.foot.find((q) => !q.on); if (p) { let s = null; for (let k = 0; k < 6 && !s; k++) { const q = placeOnRoadNear(f.x, f.z, 35, 70); if (q && (k > 3 || hasLOS(q.x, q.z, f.x, f.z))) s = q; } if (s) { p.stuckT = 0; p.side = 0; p.on = true; p.leave = false; p.x = s.x; p.z = s.z; p.y = groundH(s.x, s.z); p.w.visible = true; p.car = null; } } }
  }
  for (const p of POL.foot) {
    if (!p.on) continue; const dx = f.x - p.x, dz = f.z - p.z, d = Math.hypot(dx, dz);
    if (p.leave || WANT.stars === 0 || d > 160) { if (d > 60 || p.leave === 'now') { p.on = false; p.w.visible = false; if (p.car) p.car.footOut = false; continue; } }
    let spd = 0;
    if (!p.leave && WANT.stars > 0 && G.mode === 'foot') {
      spd = 7.3; let ux = dx / (d || 1), uz = dz / (d || 1);
      if (p.side) { p.sideT -= dt; const sx = -uz * p.side, sz = ux * p.side; ux = ux * 0.25 + sx; uz = uz * 0.25 + sz; const L = Math.hypot(ux, uz); ux /= L; uz /= L; if (p.sideT <= 0) p.side = 0; }
      const ox = p.x, oz = p.z; collideCircle(p.x + ux * spd * dt, p.z + uz * spd * dt, 0.35, col, true); p.x = col.x; p.z = col.z; p.h = Math.atan2(ux, uz);
      const moved = Math.hypot(p.x - ox, p.z - oz); p.stuckT = moved < spd * dt * 0.35 ? (p.stuckT || 0) + dt : Math.max(0, (p.stuckT || 0) - dt);
      if (p.stuckT > 0.6 && !p.side) { p.side = Math.random() < 0.5 ? -1 : 1; p.sideT = 1.6; p.stuckT = 0; } // wall-follow around buildings
      if (d < 1.3 && !G.cut) busted();
    } else if (p.car && Math.hypot(p.car.x - p.x, p.car.z - p.z) > 2) { const ex = p.car.x - p.x, ez = p.car.z - p.z, L = Math.hypot(ex, ez); spd = 4; p.x += ex / L * spd * dt; p.z += ez / L * spd * dt; p.h = Math.atan2(ex, ez); }
    else if (p.car) { p.on = false; p.w.visible = false; p.car.footOut = false; continue; }
    p.y = groundH(p.x, p.z); p.w.position.set(p.x, p.y, p.z); p.w.rotation.y = p.h; animateWalker(p.w, spd, dt, false);
  }
}
// ---------- busted / wasted
function clearPolice() {
  for (const c of POL.cars.slice()) if (c.g.visible && c !== activeCar) { c.block = false; despawnCar(c); }
  POL.blocks.length = 0; for (const p of POL.foot) { p.on = false; p.w.visible = false; }
  for (const c of POL.cars) c.footOut = false;
}
function busted() {
  if (G.cut) return; POL.bustT = 0; G.bustedN = (G.bustedN || 0) + 1;
  banner('ZATRZYMANY!', 'busted', 3200); sfxHit(0.5);
  const fine = Math.round(SAVE.money * 0.1);
  if (typeof missionFail === 'function') missionFail('Zatrzymała cię policja');
  G.cut = { t: 2.2, fn: () => {
    if (G.mode === 'car') { activeCar.vx = activeCar.vz = 0; enterExit(); }
    setStars(0); clearPolice(); addMoney(-fine, 'mandat'); respawnAt(PLACES.komenda, 'Komenda Policji – wychodzisz za kaucją');
  } };
}
function wasted() {
  if (G.cut) return; G.wastedN = (G.wastedN || 0) + 1;
  banner('ROZBITY!', 'wasted', 3400);
  const fee = Math.min(SAVE.money, 50 + Math.round(SAVE.money * 0.05));
  if (typeof missionFail === 'function') missionFail('Auto wybuchło');
  G.cut = { t: 2.4, fn: () => {
    const c = activeCar; if (c) { activeCar = null; G.mode = 'foot'; player.mesh.visible = true; if (c.rider) c.rider.visible = false; $('speedo').classList.add('hidden'); $('touch').classList.remove('incar'); $('tEnter').textContent = 'WSIĄDŹ'; }
    setStars(0); clearPolice(); addMoney(-fee, 'rachunek ze szpitala'); respawnAt(PLACES.szpital, 'Szpital – poskładali cię jak nowego');
  } };
}
function respawnAt(pl, msg) {
  if (G.mode === 'car') enterExit();
  teleport(pl[0], pl[1]); player.h = G.yaw; updateVisibility(true); flash(); setTimeout(() => toast(msg, 2400), 400);
}
// ---------- damage, smoke, fire, explosion
function damageCar(c, n) {
  if (!c || c.wrecked || c.pooled || n <= 0) return;
  if (c === activeCar && G.cut) return;
  if (c.pai && c !== activeCar) n *= 0.35; // police cruisers are reinforced (they ram a lot)
  c.hp = Math.max(0, c.hp - n); if (c.hp <= 0 && !c.burn) c.burn = 3.2;
  if (c === activeCar) hpHud();
}
function hpHud() {
  const b = $('hpbar'); if (!b) return; const c = activeCar;
  if (!c || G.mode !== 'car') { b.classList.add('hidden'); return; }
  b.classList.remove('hidden'); const i = b.firstChild; i.style.width = c.hp + '%'; i.style.background = c.hp > 60 ? '#5bd35b' : c.hp > 30 ? '#ffc21a' : '#ff4b3a';
}
function makeFx() {
  const cv = document.createElement('canvas'); cv.width = cv.height = 64; const g = cv.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 4, 32, 32, 30); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.6, 'rgba(255,255,255,0.75)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.beginPath(); g.arc(32, 32, 30, 0, 7); g.fill(); g.strokeStyle = 'rgba(42,33,28,0.9)'; g.lineWidth = 3; g.beginPath(); g.arc(32, 32, 27, 0, 7); g.stroke();
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; const fx = { list: [], tex };
  for (let i = 0; i < 48; i++) { const m = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: true }); const s = new THREE.Sprite(m); s.visible = false; scene.add(s); fx.list.push({ s, t: 0, life: 0 }); }
  return fx;
}
function emitFx(x, y, z, color, size, life, vy) {
  const p = POL.fx.list.find((q) => q.t >= q.life); if (!p) return;
  p.t = 0; p.life = life; p.vy = vy; p.size = size; p.s.material.color.set(color); p.s.position.set(x + (Math.random() - 0.5) * 0.8, y, z + (Math.random() - 0.5) * 0.8); p.s.visible = true;
}
function updateDamage(dt) {
  const f = focusXZ(); POL.fxT = (POL.fxT || 0) - dt; const emit = POL.fxT <= 0; if (emit) POL.fxT = 0.11;
  for (const c of cars) {
    if (!c.g.visible) continue;
    if (c.burn > 0) {
      c.burn -= dt; if (emit) { emitFx(c.x, (c.y || 0) + 1.3, c.z, Math.random() < 0.5 ? '#ff8a1e' : '#ffd23a', 1.4, 0.6, 3); emitFx(c.x, (c.y || 0) + 1.8, c.z, '#4a4442', 1.8, 1.6, 2.5); }
      if (c.burn <= 0) explode(c);
    } else if (emit && (c.hp < 40 || c.wrecked) && Math.hypot(c.x - f.x, c.z - f.z) < 150) emitFx(c.x + Math.sin(c.h) * 1.6, (c.y || 0) + 1.1, c.z + Math.cos(c.h) * 1.6, c.wrecked ? '#3a3634' : c.hp < 20 ? '#5a5552' : '#a8a4a0', 1.0, 1.4, 2);
    if (c.wrecked && !c.pooled && c !== activeCar && !c.fromPool && !c.police && Math.hypot(c.x - f.x, c.z - f.z) > 420) unwreck(c);
  }
  for (const p of POL.fx.list) {
    if (p.t >= p.life) { if (p.s.visible) p.s.visible = false; continue; }
    p.t += dt; const k = p.t / p.life; p.s.position.y += p.vy * dt; const sc = p.size * (0.6 + k * 1.6); p.s.scale.set(sc, sc, 1); p.s.material.opacity = (1 - k) * 0.9;
  }
  if (activeCar && G.mode === 'car') { POL.hpT = (POL.hpT || 0) - dt; if (POL.hpT <= 0) { POL.hpT = 0.3; hpHud(); } } else if ($('hpbar') && !$('hpbar').classList.contains('hidden')) hpHud();
}
function explode(c) {
  c.wrecked = true; c.burn = 0; c.hp = 0; c.wreckPaint = c.color; recolorTag(c.geo, 1, 0x2b2726); recolorTag(c.geo, 2, 0x2b2726);
  c.vy = 6; c.vx *= 0.3; c.vz *= 0.3;
  for (let i = 0; i < 14; i++) emitFx(c.x, (c.y || 0) + 0.8 + Math.random() * 1.5, c.z, i % 3 ? '#ff7a1a' : '#ffe14a', 3.2, 0.9, 1 + Math.random() * 3);
  const f = focusXZ(); const d = Math.hypot(c.x - f.x, c.z - f.z);
  if (d < 120) { toast('BUM! 💥', 1200); sfxHit(1); }
  for (const o of cars) if (o !== c && o.g.visible && Math.hypot(o.x - c.x, o.z - c.z) < 6) { damageCar(o, 25); const nx = o.x - c.x, nz = o.z - c.z, L = Math.hypot(nx, nz) || 1; o.vx += nx / L * 6; o.vz += nz / L * 6; }
  for (const p of TR.peds) if (p.on && Math.hypot(p.x - c.x, p.z - c.z) < 7 && p.state !== 'fall') { p.state = 'fall'; p.t = 0; p.fvx = (p.x - c.x) * 2; p.fvz = (p.z - c.z) * 2; p.fh = p.h; }
  if (c === activeCar && G.mode === 'car') wasted();
  else if (c.pai) { /* wrecked police car stays until far away */ }
}
function unwreck(c) { c.wrecked = false; c.hp = 100; c.burn = 0; if (c.wreckPaint !== undefined) { recolorTag(c.geo, 1, c.police ? 0xf4f6fa : c.wreckPaint); if (c.police) recolorTag(c.geo, 2, 0x1f55c8); c.wreckPaint = undefined; } }
// ---------- Lakiernia (paint & repair shop)
function nearShop(r = 7) { const f = focusXZ(); return PLACES.shops.find((s) => Math.hypot(s.x - f.x, s.z - f.z) < r) || null; }
function shopHint() {
  const s = nearShop(9); if (!s) return null;
  if (G.mode === 'foot') return s.n + ' – wjedź tu autem: przemalowanie gubi pościg';
  return WANT.stars ? s.n + ': zatrzymaj się, by przemalować (50 zł)' : s.n + ': zatrzymaj się (E)';
}
function shopAction() { const s = nearShop(9); if (!s || G.mode !== 'car') return false; shopOpen(s); return true; }
function shopOpen(s) {
  POL.shop = s; const m = $('shopMenu'); m.classList.remove('hidden');
  $('shopTxt').textContent = s.n + ' · stan auta ' + Math.round(activeCar.hp) + '% · masz ' + SAVE.money + ' zł';
}
function shopClose() { $('shopMenu').classList.add('hidden'); if (POL.shop) POL.shop.cool = true; POL.shop = null; }
function shopBuy(what) {
  const c = activeCar; if (!c || !POL.shop) return shopClose();
  const price = what === 'paint' ? 100 : 50; if (SAVE.money < price) { toast('Za mało kasy! Potrzeba ' + price + ' zł', 1800); return; }
  if (what === 'paint') repaint(c); else { c.hp = 100; hpHud(); }
  addMoney(-price, what === 'paint' ? 'nowy lakier' : 'naprawa'); flash(); shopClose();
}
function repaint(c) {
  const pal = TOON_CAR_COLORS.filter((x) => x !== c.color); const col = pal[Math.floor(Math.random() * pal.length)];
  if (c.origColor === undefined) c.origColor = c.color; if (c.police) recolorTag(c.geo, 1, col); else c.setPaint(col); c.hp = 100; hpHud();
}
function updateShops(dt) {
  const t = performance.now() * 0.003;
  for (const s of PLACES.shops) { s.ring.material.opacity = 0.5 + 0.35 * Math.sin(t); s.can.rotation.y += dt; }
  const s = nearShop(7);
  if (!s) { for (const q of PLACES.shops) q.cool = false; if (POL.shop) shopClose(); return; }
  if (G.mode !== 'car' || activeCar.speed > 3 || s.cool || G.cut || (MIS.active && MIS.active.id === 'steal')) return;
  if (WANT.stars > 0) {
    if (SAVE.money >= 50) { repaint(activeCar); addMoney(-50, 'szybkie malowanie'); setStars(0); flash(); toast('Nowy lakier – policja cię nie poznaje! 🎨', 2400); s.cool = true; if (typeof missionEvent === 'function') missionEvent('lost'); }
    else { toast('Za mało kasy na lakier (50 zł)!', 1800); s.cool = true; }
  } else if (!POL.shop) shopOpen(s);
}
// ---------- Web Audio siren + hit sound
function audioCtx() {
  if (POL.ac === undefined) { try { POL.ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { POL.ac = null; } }
  if (POL.ac && POL.ac.state === 'suspended' && G.started) POL.ac.resume().catch(() => {});
  return POL.ac;
}
function sirenUpdate(dist, dt) {
  const want = dist < 260 && G.started && !G.paused; const ac = want || POL.siren ? audioCtx() : null; if (!ac) return;
  if (!POL.siren && want) {
    const o = ac.createOscillator(), o2 = ac.createOscillator(), g = ac.createGain(), lp = ac.createBiquadFilter();
    o.type = 'sawtooth'; o2.type = 'square'; lp.type = 'lowpass'; lp.frequency.value = 2200; g.gain.value = 0;
    o.connect(lp); o2.connect(lp); lp.connect(g); g.connect(ac.destination); o.start(); o2.start(); POL.siren = { o, o2, g, ph: 0 };
  }
  if (!POL.siren) return; const s = POL.siren; s.ph += dt;
  const fq = 720 + 520 * (0.5 + 0.5 * Math.sin(s.ph * 2 * Math.PI / 3.2)) * (WANT.stars >= 3 ? 1 : 1);
  const yelp = WANT.stars >= 3 ? (Math.floor(s.ph * 4) % 2 ? 1.25 : 1) : 1;
  s.o.frequency.setTargetAtTime(fq * yelp, ac.currentTime, 0.02); s.o2.frequency.setTargetAtTime(fq * yelp * 0.5, ac.currentTime, 0.02);
  const vol = want ? 0.07 * clamp(1 - dist / 260, 0, 1) ** 1.5 : 0; s.g.gain.setTargetAtTime(vol, ac.currentTime, 0.1);
  G.sirenVol = vol;
}
function sfxHit(k) {
  const ac = audioCtx(); if (!ac) return;
  const n = ac.createBufferSource(), b = ac.createBuffer(1, ac.sampleRate * 0.5, ac.sampleRate), d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 3);
  const g = ac.createGain(); g.gain.value = 0.25 * k; n.buffer = b; n.connect(g); g.connect(ac.destination); n.start();
}

// ======================= MISSIONS =======================
const MIS = { list: [], active: null, dlg: null, tgt: null, events: [], started: 0 };
function misPlace(x, z, r = 1.2) { const [fx, fz] = findFree(x, z, r); return { x: fx, z: fz }; }
function roadSpot(x, z, maxR = 200) { const rp = nearestRoadPoint(x, z, true, maxR); if (!rp) return { x, z, h: 0 }; const nx = -Math.cos(rp.h), nz = Math.sin(rp.h), off = Math.max(0, rp.road.width / 2 - 1.3); return { x: rp.x + nx * off, z: rp.z + nz * off, h: rp.h }; }
function misCar(color, spot, opts) {
  const [x, z] = findFree(spot.x, spot.z, 2.2); const c = new Car(scene, color, x, z, spot.h || 0, opts || {}); c.mission = true; cars.push(c);
  c.headMat.emissiveIntensity = G.night ? 2.5 : 0.2; c.tailMat.emissiveIntensity = G.night ? 1.5 : 0.3; return c;
}
function misDropCar(c) { if (!c || c === activeCar) { if (c) c.mission = false; return; } const i = cars.indexOf(c); if (i >= 0) cars.splice(i, 1); scene.remove(c.g); }
function inCar(c) { return G.mode === 'car' && activeCar === c; }
function at(t, r, maxV = 99) { const f = focusXZ(); return Math.hypot(f.x - t.x, f.z - t.z) < r && (G.mode === 'foot' || activeCar.speed < maxV); }
function randomAddress(cx, cz, rMin, rMax) {
  for (let k = 0; k < 40; k++) { const b = W.buildings[Math.floor(Math.random() * W.buildings.length)]; const x = b.cx, z = b.cz; const d = Math.hypot(x - cx, z - cz); if (d < rMin || d > rMax) continue; const s = roadSpot(x, z, 60); if (Math.hypot(s.x - x, s.z - z) > 45) continue; return { x: s.x, z: s.z }; }
  return roadSpot(cx + rMin, cz);
}
const MDEF = [
  { id: 'taxi', name: 'Taryfa do Dzikowa', giver: [-7, 10], who: 'Pan Zdzisiek, taksówkarz', reward: 150, col: '#ffd21f',
    text: 'Siemano! Mój kumpel spóźni się na wesele na zamku w Dzikowie. Weź moją taryfę i zawieź go tam w 2,5 minuty. Tylko nie porysuj lakieru!',
    start(m) { m.car = misCar(0xffd21f, roadSpot(m.gx + 8, m.gz + 4), { kind: 'taxi' }); m.stage = 0; m.dest = roadSpot(300, -575); },
    update(m) {
      if (m.car.wrecked) return 'Taksówka rozbita';
      if (m.stage === 0) { m.target = m.car; m.obj = 'Wsiądź do taksówki'; if (inCar(m.car)) { m.stage = 1; m.t = 150; toast('Pasażer: „Na zamek, szefie, i to migiem!”', 2600); } return; }
      m.target = m.dest; m.obj = 'Zawieź pasażera do Zamku w Dzikowie'; if (m.t <= 0) return 'Za wolno – pasażer spóźnił się na wesele';
      if (!inCar(m.car)) m.obj = 'Wróć do taksówki!';
      else if (at(m.dest, 12, 4)) return 'win';
    }, bonus: (m) => Math.round(Math.max(0, m.t)) },
  { id: 'pizza', name: 'Pizza z Harendy', giver: [-57, 72], who: 'Szef Pizzerii Harenda', reward: 120, col: '#ff7a2a',
    text: 'Mamma mia, cały Tarnobrzeg głodny! Trzy pizze, cztery minuty. Skuter stoi przed lokalem – możesz też biec, ale pizza wystygnie!',
    start(m) { m.car = misCar(0xd2452f, roadSpot(m.gx + 5, m.gz + 3), { scooter: true }); m.t = 240; m.left = 3; m.dest = randomAddress(m.gx, m.gz, 180, 520); },
    update(m) {
      if (m.t <= 0) return 'Pizza wystygła…'; m.target = m.dest; m.obj = 'Dostarcz pizzę (' + (4 - m.left) + '/3)' + (inCar(m.car) ? '' : ' · skuter czeka przy pizzerii');
      if (at(m.dest, 7, 5)) { m.left--; addMoney(10, 'napiwek'); if (!m.left) return 'win'; toast('„Dzięki! Pachnie obłędnie!” Następny adres na mapie', 2200); m.dest = randomAddress(m.dest.x, m.dest.z, 160, 450); }
    }, bonus: (m) => Math.round(m.t / 4) },
  { id: 'race', name: 'Wyścig uliczny', giver: [-87, 370], who: 'Kuba „Turbo”', reward: 250, col: '#ff3b3b',
    text: 'Ej, ty! Wyścig uliczny: spod Urzędu, przez dworzec kolejowy, aż na Serbinów. Kto przyjedzie ostatni, ten stawia kebaba!',
    start(m) {
      const s = roadSpot(m.gx, m.gz); m.car = misCar(0xe8503a, s);
      const n0 = nearestNode(s.x, s.z), n1 = nearestNode(478, 162), n2 = nearestNode(1216, -49);
      const p1 = astar(n0, n1) || [n0, n1], p2 = astar(n1, n2) || [n1, n2]; const pts = pathPoints(p1.concat(p2.slice(1)));
      m.cps = []; let acc = 0; let lx = s.x, lz = s.z;
      for (let i = 0; i < pts.length; i += 2) { acc += Math.hypot(pts[i] - lx, pts[i + 1] - lz); lx = pts[i]; lz = pts[i + 1]; if (acc > 140 || i >= pts.length - 2) { m.cps.push({ x: pts[i], z: pts[i + 1] }); acc = 0; } }
      m.path = pts; m.i = 0; m.stage = 0; m.rivals = [];
      const fwd = Math.atan2(pts[2] - s.x, pts[3] - s.z) || s.h;
      for (const [k, c] of [[1, 0x3d8fe0], [2, 0x45b65a]]) { const r = misCar(c, { x: s.x - Math.sin(fwd) * 7 * k, z: s.z - Math.cos(fwd) * 7 * k, h: fwd }); r.rv = { pi: 0, cp: 0, stuck: 0, rev: 0, skill: 0.86 + k * 0.03 }; m.rivals.push(r); }
      m.car.h = fwd; m.car.sync();
    },
    update(m, dt) {
      if (m.stage === 0) { m.target = m.car; m.obj = 'Wsiądź do czerwonego auta na starcie'; if (inCar(m.car)) { m.stage = 1; m.count = 3.5; } return; }
      if (m.stage === 1) { m.count -= dt; m.obj = 'Start za ' + Math.max(1, Math.ceil(m.count - 0.5)); m.target = m.cps[0]; if (m.count <= 0.5) { m.stage = 2; banner('START!', 'go', 900); m.t0 = performance.now(); } return; }
      for (const r of m.rivals) rivalDrive(r, m, dt);
      const c = m.cps[m.i]; m.target = c; let pos = 1; for (const r of m.rivals) if (r.rv.cp > m.i || (r.rv.cp === m.i && Math.hypot(r.x - c.x, r.z - c.z) < Math.hypot(focusXZ().x - c.x, focusXZ().z - c.z))) pos++;
      m.obj = 'Checkpoint ' + (m.i + 1) + '/' + m.cps.length + ' · miejsce ' + pos + '/3';
      if (at(c, 11)) { m.i++; if (m.i >= m.cps.length) { const first = m.rivals.every((r) => r.rv.cp < m.cps.length); return first ? 'win' : 'Kuba: „Kebab na ciebie!” – przegrałeś wyścig'; } }
      if (m.rivals.some((r) => r.rv.cp >= m.cps.length) && m.i < m.cps.length - 1 && !m.warned) { m.warned = true; toast('Rywal już na mecie!', 1500); }
      if ((performance.now() - m.t0) / 1000 > 300) return 'Za długo!';
    }, cleanup(m) { for (const r of m.rivals || []) misDropCar(r); } },
  { id: 'escape', name: 'Ucieczka spod PKS', giver: [-365, 933], who: 'Tajemniczy Gość', reward: 300, col: '#a66bd0',
    text: 'Psst… Gliny szukają kogoś w twojej kurtce. Wsiadaj w co chcesz i zgub ich w trzy minuty, a odpalę ci 300 zł. Lakiernia też się liczy!',
    start(m) { m.t = 180; setStars(3, 'misja'); },
    update(m) { m.target = null; m.obj = 'Zgub pościg (★★★)'; if (WANT.stars === 0 && m.t < 179) return 'win'; if (m.t <= 0) return 'Nie zdążyłeś zgubić policji'; } },
  { id: 'steal', name: 'Zgarnij auto prezesa', giver: [1216, -49], who: 'Mietek z Serbinowa', reward: 350, col: '#e6b422',
    text: 'Na osiedlu stoi złote auto prezesa. Zgarnij je i dowieź do Warsztatu. Policja się kapnie – a każda rysa to mniej kasy!',
    start(m) { const a = randomAddress(m.gx, m.gz, 160, 320); m.car = misCar(0xe6b422, roadSpot(a.x, a.z)); m.stage = 0; m.dest = roadSpot(1081 + 28, 471 - 10, 80); },
    update(m) {
      if (m.car.wrecked) return 'Złote auto spłonęło';
      if (m.stage === 0) { m.target = m.car; m.obj = 'Ukradnij złote auto'; if (inCar(m.car)) { m.stage = 1; setStars(Math.max(2, WANT.stars), 'kradzież auta prezesa'); } return; }
      m.target = m.dest; m.obj = inCar(m.car) ? 'Dowieź auto do Warsztatu (stan ' + Math.round(m.car.hp) + '%)' : 'Wróć do złotego auta!';
      if (inCar(m.car) && at(m.dest, 9, 4)) return 'win';
    }, pay: (m) => Math.round(350 * Math.max(0.2, m.car.hp / 100)) },
  { id: 'offroad', name: 'Rajd Głowackiego', giver: null, who: 'Duch Bartosza Głowackiego', reward: 400, col: '#22e6ff',
    text: 'Hej, śmiałku! Kosynierzy biegali szybciej niż ty jeździsz! Przejedź trasę off-road nad Jeziorem Tarnobrzeskim w mniej niż 4 minuty!',
    start(m) { m.t0 = performance.now(); m.t = 300; eggGo(); },
    update(m) { m.target = null; const r = EGG.race; m.obj = 'Rajd nad jeziorem – limit 4:00';
      if (r.done && r.lastAt > m.t0) return r.last < 240 ? 'win' : 'Czas ' + fmtT(r.last) + ' – za wolno!';
      if (!r.running && !r.done) return 'Zjechałeś z trasy'; if (m.t <= 0) return 'Koniec czasu'; } },
  { id: 'courier', name: 'Kurier z leków', giver: [478, 162], who: 'Pani Halinka ze stacji', reward: 200, col: '#45b65a',
    text: 'Paczka z lekami dla apteki przy szpitalu! Ostrożnie, to szkło – trzy stłuczki i po lekach. Masz 2,5 minuty, kochaneczku.',
    start(m) { m.car = misCar(0xf4f1ea, roadSpot(m.gx + 6, m.gz + 3)); m.stage = 0; m.hits = 0; m.dest = roadSpot(-165, 788); },
    update(m) {
      if (m.car.wrecked) return 'Paczka spłonęła';
      if (m.stage === 0) { m.target = m.car; m.obj = 'Wsiądź do białego dostawczaka'; if (inCar(m.car)) { m.stage = 1; m.t = 150; } return; }
      if (m.hits >= 3) return 'Leki potłuczone!'; if (m.t <= 0) return 'Apteka już zamknięta';
      m.target = m.dest; m.obj = 'Dowieź leki do apteki · stłuczki ' + m.hits + '/3'; if (inCar(m.car) && at(m.dest, 10, 4)) return 'win';
    }, impact(m) { if (m.stage === 1 && inCar(m.car)) { m.hits++; toast('Brzdęk! Uważaj na paczkę (' + m.hits + '/3)', 1300); } } },
  { id: 'final', name: 'Legenda Tarnobrzega', giver: [789, -1258], who: 'Wielki Szef z Muzeum Siarki', reward: 1000, col: '#ffffff', needs: 5,
    text: 'Ostatnia robota, młody. Cała policja w mieście będzie cię szukać. Dojedź do Zamku w Dzikowie i zgub ogon. Wtedy zostaniesz legendą Tarnobrzega!',
    start(m) { m.stage = 0; m.dest = roadSpot(300, -575); setStars(4, 'wielki skok'); m.t = 360; },
    update(m) {
      if (m.t <= 0) return 'Koniec czasu';
      if (m.stage === 0) { m.target = m.dest; m.obj = 'Dojedź do Dzikowa (★★★★)'; if (at(m.dest, 14)) { m.stage = 1; toast('Teraz zgub policję!', 2000); } if (WANT.stars === 0) setStars(3, 'pościg wraca'); return; }
      m.target = null; m.obj = 'Zgub pościg!'; if (WANT.stars === 0) return 'win';
    } },
];
function rivalDrive(r, m, dt) {
  const v = r.rv; if (v.cp >= m.cps.length || r.wrecked) { updateCar(r, dt, { thr: 0, steer: 0, hand: true }); return; }
  const P = m.path; while (v.pi < P.length / 2 - 1 && Math.hypot(P[v.pi * 2] - r.x, P[v.pi * 2 + 1] - r.z) < 10) v.pi++;
  const c = m.cps[v.cp]; if (Math.hypot(c.x - r.x, c.z - r.z) < 13) v.cp++;
  const k = Math.min(P.length / 2 - 1, v.pi + 1); const tx = P[v.pi * 2] * 0.6 + P[k * 2] * 0.4, tz = P[v.pi * 2 + 1] * 0.6 + P[k * 2 + 1] * 0.4;
  let ang = Math.atan2(tx - r.x, tz - r.z) - r.h; ang = Math.atan2(Math.sin(ang), Math.cos(ang));
  let thr = v.skill, steer = clamp(ang * 2.5, -1, 1), hand = false; if (Math.abs(ang) > 0.9 && r.speed > 10) thr = 0; if (Math.abs(ang) > 1.5 && r.speed > 14) hand = true;
  if (v.rev > 0) { v.rev -= dt; thr = -1; steer = -Math.sign(ang); } else { v.stuck = r.speed < 1 ? v.stuck + dt : 0; if (v.stuck > 1.5) { v.rev = 1; v.stuck = 0; } }
  if (Math.hypot(r.x - focusXZ().x, r.z - focusXZ().z) > 350) { // far away: just glide along the path so they stay competitive
    const tx2 = P[v.pi * 2], tz2 = P[v.pi * 2 + 1]; const d = Math.hypot(tx2 - r.x, tz2 - r.z) || 1; const s = 17 * dt; r.x += (tx2 - r.x) / d * Math.min(s, d); r.z += (tz2 - r.z) / d * Math.min(s, d); r.h = Math.atan2(tx2 - r.x, tz2 - r.z) || r.h; r.sync(); return;
  }
  updateCar(r, dt, { thr, steer, hand });
}
function initMissions() {
  MIS.list = MDEF.map((d) => ({ ...d, done: !!SAVE.done[d.id] }));
  for (const m of MIS.list) {
    let gx, gz; if (m.id === 'offroad') { gx = EGG.mon.x + 5; gz = EGG.mon.z + 5; } else { gx = m.giver[0]; gz = m.giver[1]; }
    const p = misPlace(gx + (m.id === 'taxi' ? 12 : 0), gz + (m.id === 'taxi' ? 9 : 0), 1.2); m.gx = p.x; m.gz = p.z; m.cool = Math.hypot(player.x - p.x, player.z - p.z) < 12; m.obj3 = makeGiver(p.x, p.z, m.col, m.who);
  }
  MIS.tgt = makeTarget();
  const hud = $('hud'); const mh = document.createElement('div'); mh.id = 'mhud'; mh.className = 'hidden'; hud.appendChild(mh);
  const dl = document.createElement('div'); dl.id = 'dialog'; dl.className = 'cdialog hidden';
  dl.innerHTML = '<div class="who" id="dlgWho"></div><h3 id="dlgTitle"></h3><p id="dlgText"></p><div class="reward" id="dlgReward"></div><div class="btns"><button id="dlgYes">Przyjmij (E)</button><button id="dlgNo" class="sec">Nie teraz (Esc)</button></div>';
  document.body.appendChild(dl);
  $('dlgYes').onclick = () => dialogAction(); $('dlgNo').onclick = () => dialogClose();
  for (const id of ['dialog', 'shopMenu']) { $(id).addEventListener('touchstart', (e) => e.stopPropagation(), { passive: true }); $(id).addEventListener('mousedown', (e) => e.stopPropagation()); }
}
function makeGiver(x, z, col, who) {
  const g = new THREE.Group(); g.position.set(x, groundH(x, z), z);
  const c = new THREE.Color(col);
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 26, 16, 1, true), new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending })); beam.position.y = 13; g.add(beam);
  const ring = new THREE.Mesh(new THREE.RingGeometry(1.4, 1.9, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.9, depthWrite: false })); ring.position.y = 0.22; g.add(ring);
  const w = makeWalker({ shirt: c.getHex(), cap: 0x2a211c }); g.add(w);
  const ex = labelSprite('!', col, 1.6); ex.position.y = 3.2; g.add(ex);
  const lab = labelSprite(who, col, 6); lab.position.y = 4.4; lab.visible = false; g.add(lab);
  scene.add(g); return { g, beam, ring, w, ex, lab };
}
function makeTarget() {
  const g = new THREE.Group(); const col = new THREE.Color('#ffd21f');
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, 60, 20, 1, true), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.25, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending })); beam.position.y = 30; g.add(beam);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(5, 0.45, 8, 40).rotateX(Math.PI / 2), mkMat({ color: col, emissive: col, emissiveIntensity: 0.6 })); ring.position.y = 0.5; g.add(ring);
  const arrow = new THREE.Mesh(new THREE.ConeGeometry(1.2, 2.2, 4).rotateX(Math.PI), mkMat({ color: col, emissive: col, emissiveIntensity: 0.6 })); arrow.position.y = 6; g.add(arrow);
  g.visible = false; scene.add(g); return { g, beam, ring, arrow };
}
function giverOpen(m) { return !MIS.active && !m.busy && (!m.needs || MIS.list.filter((q) => q.done).length >= m.needs); }
function nearGiver() {
  const f = focusXZ(); for (const m of MIS.list) if (giverOpen(m) && Math.hypot(f.x - m.gx, f.z - m.gz) < (G.mode === 'car' ? 7 : 3.6)) return m; return null;
}
function missionHint() {
  if (MIS.active) return null; const m = nearGiver(); if (!m) return null;
  return (isTouch ? 'Dotknij AKCJA' : 'E') + ': porozmawiaj – ' + m.who + ' (' + m.name + ')';
}
function missionAction() { const m = nearGiver(); if (!m) return false; dialogOpen(m); return true; }
function dialogOpen(m) {
  MIS.dlg = m; G.paused = true; G.dialogOpen = true; if (document.pointerLockElement) document.exitPointerLock();
  $('dlgWho').textContent = m.who; $('dlgTitle').textContent = (m.done ? '✔ ' : '') + m.name; $('dlgText').textContent = '„' + m.text + '”';
  $('dlgReward').textContent = 'Nagroda: ' + m.reward + ' zł' + (m.done ? ' · już zaliczona – możesz powtórzyć' : '');
  $('dialog').classList.remove('hidden');
}
function dialogClose() { if (!MIS.dlg) return; const m = MIS.dlg; m.cool = true; MIS.dlg = null; G.dialogOpen = false; G.paused = false; clock.getDelta(); $('dialog').classList.add('hidden'); }
function dialogAction() { if (!MIS.dlg) return false; const m = MIS.dlg; dialogClose(); missionStart(m); return true; }
function missionStart(m) {
  if (MIS.active) return; MIS.active = m; m.t = undefined; m.target = null; m.obj = ''; m.stage = 0; m.car = null; m.startAt = performance.now();
  m.start(m); MIS.events.push({ id: m.id, ev: 'start', t: performance.now() });
  banner(m.name, 'mstart', 2000); $('mhud').classList.remove('hidden');
}
function missionEnd(ok, why) {
  const m = MIS.active; if (!m) return; MIS.active = null; MIS.tgt.g.visible = false; $('mhud').classList.add('hidden');
  if (m.cleanup) m.cleanup(m); if (m.car) { misDropCarLater(m.car); m.car = null; }
  MIS.events.push({ id: m.id, ev: ok ? 'pass' : 'fail', why, t: performance.now() });
  if (ok) {
    const pay = m.pay ? m.pay(m) : m.reward + (m.bonus ? m.bonus(m) : 0);
    m.done = true; SAVE.done[m.id] = true; addMoney(pay); saveGame();
    banner('MISJA ZALICZONA!\n+' + pay + ' zł', 'pass', 3600); MIS.lastPay = pay;
    if (m.id !== 'final' && MIS.list.filter((q) => q.done).length === 5 && !SAVE.finalHint) { SAVE.finalHint = true; saveGame(); setTimeout(() => toast('Odblokowano finał! Wielki Szef czeka przy Muzeum Siarki', 4000), 3800); }
    if (m.id === 'final') setTimeout(() => banner('LEGENDA TARNOBRZEGA! 🏆', 'pass', 5000), 3800);
  } else { banner('MISJA NIEUDANA\n' + (why || ''), 'fail', 3200); }
  m.cool = true;
}
function misDropCarLater(c) { if (c === activeCar) { c.mission = false; return; } c.dropAt = performance.now(); MIS.drop = MIS.drop || []; MIS.drop.push(c); }
function missionFail(why) { if (MIS.active) missionEnd(false, why); }
function missionImpact(v) { const m = MIS.active; if (m && m.impact) m.impact(m, v); }
function missionEvent(ev) { /* hook: 'lost' when police chase ends */ MIS.lastEvent = ev; }
function updateMissions(dt) {
  const f = focusXZ(); const tt = performance.now() * 0.003;
  for (const m of MIS.list) {
    const o = m.obj3; const show = giverOpen(m); o.g.visible = show; if (!show) continue;
    const d = Math.hypot(f.x - m.gx, f.z - m.gz); o.beam.material.opacity = 0.16 + 0.1 * Math.sin(tt + m.gx); o.ex.position.y = 3.2 + Math.sin(tt * 1.5) * 0.25; o.lab.visible = d < 40;
    o.w.rotation.y = Math.atan2(f.x - m.gx, f.z - m.gz);
    if (m.cool && d > 9) m.cool = false;
    if (!m.cool && !MIS.dlg && d < (G.mode === 'car' ? 6 : 3) && (G.mode === 'foot' || activeCar.speed < 3) && !G.cut) dialogOpen(m);
  }
  if (MIS.drop) for (const c of MIS.drop.slice()) if (c !== activeCar && Math.hypot(c.x - f.x, c.z - f.z) > 200) { misDropCar(c); MIS.drop.splice(MIS.drop.indexOf(c), 1); }
  const m = MIS.active; if (!m) return;
  if (m.t !== undefined) m.t -= dt;
  const r = m.update(m, dt);
  if (r === 'win') return missionEnd(true); if (r) return missionEnd(false, r);
  const T = m.target; MIS.tgt.g.visible = !!T && !(T === activeCar);
  if (T) { MIS.tgt.g.position.set(T.x, groundH(T.x, T.z), T.z); MIS.tgt.arrow.position.y = (T instanceof Car ? 4.5 : 6) + Math.sin(tt * 2) * 0.5; MIS.tgt.ring.visible = !(T instanceof Car); MIS.tgt.arrow.rotation.y += dt * 2; }
  const tm = m.t !== undefined && m.t >= 0 ? ' · ⏱ ' + fmtT(Math.max(0, m.t)).slice(0, 5) : '';
  const txt = '<b>' + m.name + '</b><span>' + m.obj + tm + '</span>'; if (MIS.hudTxt !== txt) { MIS.hudTxt = txt; $('mhud').innerHTML = txt; }
}
function drawMissionMinimap(g, sc) {
  g.lineWidth = 2 / sc; g.strokeStyle = '#2a211c';
  for (const m of MIS.list) { if (!giverOpen(m)) continue; g.fillStyle = m.col; g.beginPath(); g.arc(m.gx, m.gz, 8 / sc, 0, 7); g.fill(); g.stroke(); g.fillStyle = '#2a211c'; g.font = 'bold ' + (11 / sc) + 'px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('!', m.gx, m.gz + 0.5 / sc); }
  const T = MIS.active && MIS.active.target; if (T && T !== activeCar) { g.fillStyle = '#ffd21f'; g.beginPath(); g.moveTo(T.x, T.z - 11 / sc); g.lineTo(T.x + 8 / sc, T.z); g.lineTo(T.x, T.z + 11 / sc); g.lineTo(T.x - 8 / sc, T.z); g.closePath(); g.fill(); g.stroke(); }
  if (MIS.active && MIS.active.cps) { g.fillStyle = '#ff3b3b'; for (const r of MIS.active.rivals || []) { g.beginPath(); g.arc(r.x, r.z, 5 / sc, 0, 7); g.fill(); } }
  for (const c of POL.cars) if (c.g.visible && c !== activeCar && (c.pai || c.block || c.patrol)) { const b = Math.floor(performance.now() / 250) % 2; g.fillStyle = c.patrol ? '#3d6fe0' : (b ? '#ff2a2a' : '#2a5cff'); g.beginPath(); g.arc(c.x, c.z, 6 / sc, 0, 7); g.fill(); g.stroke(); }
  for (const p of POL.foot) if (p.on) { g.fillStyle = '#2a5cff'; g.beginPath(); g.arc(p.x, p.z, 4 / sc, 0, 7); g.fill(); }
  g.fillStyle = '#ff3fa4'; for (const s of PLACES.shops) { g.beginPath(); g.arc(s.x, s.z, 6 / sc, 0, 7); g.fill(); g.stroke(); }
}

// ======================= RADIO (stacje w stylu GTA) =======================
const RADIO = { i: 0, audio: null, playing: false, auto: false, fails: 0, npTimer: 0, wd: 0, popT: 0, hideT: 0, now: '', msg: '', lastMode: 'foot', userOff: false };
function initRadio() {
  RADIO.i = clamp(settings.station | 0, 0, RADIO_STATIONS.length - 1);
  $('radioPlay').onclick = () => radioPower(); $('radioPrev').onclick = () => radioStep(-1); $('radioNext').onclick = () => radioStep(1);
  $('radioVol').value = settings.radioVol; $('radioVol').oninput = (e) => { settings.radioVol = parseFloat(e.target.value); saveSettings(); if (RADIO.audio) RADIO.audio.volume = settings.radioVol; };
  addEventListener('offline', () => { if (RADIO.playing) { radioStop(); radioMsg('Brak internetu – radio offline. Gra działa dalej.'); } });
  radioUI();
}
function radioMsg(t) { RADIO.msg = t || ''; $('radioMsg').textContent = RADIO.msg; radioUI(); }
function radioUI() {
  const s = RADIO_STATIONS[RADIO.i];
  $('radioName').textContent = s.name; $('radioGenre').textContent = s.genre + ' · ' + (RADIO.i + 1) + '/' + RADIO_STATIONS.length;
  $('radioNow').textContent = RADIO.playing ? (RADIO.now ? '♪ ' + RADIO.now : 'Na żywo') : 'Wyłączone';
  $('radioPlay').textContent = RADIO.playing ? '⏻ Wyłącz' : '⏻ Włącz'; $('btnRadio').classList.toggle('on', RADIO.playing);
  G.radio = { index: RADIO.i, name: s.name, genre: s.genre, url: s.url, playing: RADIO.playing, readyState: RADIO.audio ? RADIO.audio.readyState : 0, currentTime: RADIO.audio ? RADIO.audio.currentTime : 0, now: RADIO.now, msg: RADIO.msg, fails: RADIO.fails, count: RADIO_STATIONS.length };
}
function radioShowPanel(ms = 3500) { const p = $('radioPanel'); p.classList.remove('hidden'); clearTimeout(RADIO.hideT); RADIO.hideT = setTimeout(() => p.classList.add('hidden'), ms); }
function radioPopup() {
  const s = RADIO_STATIONS[RADIO.i]; const p = $('radioPop'); p.innerHTML = '<b>' + s.name + '</b><span>' + s.genre + '</span>';
  p.classList.remove('show'); void p.offsetWidth; p.classList.add('show'); clearTimeout(RADIO.popT); RADIO.popT = setTimeout(() => p.classList.remove('show'), 2600);
}
function toggleRadio() { radioShowPanel(6000); }   // HUD 📻 button: show the station switcher
function radioPower() { if (RADIO.playing) { RADIO.userOff = true; radioStop(); } else { RADIO.userOff = false; RADIO.fails = 0; radioPlay(); } radioShowPanel(); }
function radioStep(d) {
  RADIO.i = (RADIO.i + d + RADIO_STATIONS.length) % RADIO_STATIONS.length; settings.station = RADIO.i; saveSettings();
  RADIO.fails = 0; RADIO.userOff = false; radioPopup(); radioShowPanel(); radioPlay();
}
function radioPlay() {
  const s = RADIO_STATIONS[RADIO.i]; RADIO.now = '';
  if (navigator.onLine === false) { RADIO.playing = false; radioMsg('Brak internetu – radio offline. Gra działa normalnie.'); return; }
  if (!RADIO.audio) {
    const a = new Audio(); a.preload = 'none'; a.crossOrigin = null;
    a.addEventListener('playing', () => { RADIO.fails = 0; clearTimeout(RADIO.wd); radioMsg(''); radioNP(); });
    a.addEventListener('waiting', () => { if (RADIO.playing) radioMsg('Buforowanie…'); });
    a.addEventListener('error', () => { if (RADIO.playing && a.getAttribute('src')) radioFail('błąd strumienia'); });
    RADIO.audio = a;
  }
  const a = RADIO.audio; a.volume = settings.radioVol; a.src = s.url + (s.url.includes('?') ? '&' : '?') + 't=' + Date.now();
  RADIO.playing = true; radioMsg('Łączenie: ' + s.name + '…');
  const p = a.play(); const myI = RADIO.i;
  if (p && p.catch) p.catch((err) => { if (RADIO.i !== myI || !RADIO.playing) return; if (err && err.name === 'NotAllowedError') { RADIO.playing = false; radioMsg('Przeglądarka zablokowała dźwięk – dotknij ⏻ Włącz.'); } else radioFail('brak odpowiedzi'); });
  clearTimeout(RADIO.wd); RADIO.wd = setTimeout(() => { if (RADIO.playing && RADIO.i === myI && a.readyState < 3) radioFail('przekroczony czas'); }, 8000);
  clearInterval(RADIO.npTimer); RADIO.npTimer = setInterval(radioNP, 20000);
}
function radioFail(why) {
  RADIO.fails++; const s = RADIO_STATIONS[RADIO.i];
  if (RADIO.fails >= RADIO_STATIONS.length) { radioStop(); radioMsg('Radio offline – żadna stacja nie odpowiada. Gra działa normalnie.'); return; }
  RADIO.i = (RADIO.i + 1) % RADIO_STATIONS.length; radioMsg(s.name + ': ' + why + ' – przełączam dalej…'); radioPopup(); radioPlay();
}
function radioStop() {
  RADIO.playing = false; RADIO.now = ''; clearTimeout(RADIO.wd); clearInterval(RADIO.npTimer); RADIO.npTimer = 0;
  if (RADIO.audio) { RADIO.audio.pause(); RADIO.audio.removeAttribute('src'); RADIO.audio.load(); }
  radioMsg('');
}
const stopRadio = radioStop;
async function radioNP() {
  const s = RADIO_STATIONS[RADIO.i]; const myI = RADIO.i; if (!RADIO.playing) return;
  if (!s.np) { RADIO.now = ''; radioUI(); return; }
  try {
    if (s.np.type === 'soma') {
      const r = await fetch('https://somafm.com/songs/' + s.np.id + '.json', { cache: 'no-store' }); const j = await r.json(); const t = j.songs && j.songs[0];
      if (RADIO.i === myI) RADIO.now = t ? [t.artist, t.title].filter(Boolean).join(' – ') : '';
    } else if (s.np.type === 'leliwa') {
      const r = await fetch(s.np.url, { cache: 'no-store' }); const j = await r.json(); const t = j && j.now_playing && j.now_playing.song;
      if (RADIO.i === myI) RADIO.now = t ? (t.text || [t.artist, t.title].filter(Boolean).join(' – ')) : '';
    }
  } catch (e) { RADIO.now = ''; }
  radioUI();
}
function updateRadio() {
  // GTA-style: radio turns on when you get into a car (with station popup) and off when you get out
  if (!G.started) return;
  if (G.mode !== RADIO.lastMode) {
    RADIO.lastMode = G.mode;
    if (G.mode === 'car') { if (settings.radioAuto && !RADIO.userOff && !RADIO.playing) { RADIO.fails = 0; RADIO.auto = true; radioPlay(); } if (RADIO.playing || settings.radioAuto) radioPopup(); }
    else if (RADIO.auto) { RADIO.auto = false; if (RADIO.playing) radioStop(); }
  }
}

// ======================= DOTYK – wielodotyk na Pointer Events =======================
// Każdy palec (pointerId) śledzony osobno: pływający joystick + przyciski (przytrzymanie z przesuwaniem palca
// między GAZ/HAM.) + kamera jednocześnie. Brak opóźnień (pointerdown), brak przewijania/zoomu (touch-action:none).
const TP = { ptrs: new Map(), joy: null, look: null, btns: [], held: {}, pads: 14, stats: { down: 0, up: 0, cancel: 0, reset: 0 } };
function initTouch() {
  const root = $('touch');
  TP.btns = [...root.querySelectorAll('.tb')].map((el) => ({ el, kind: el.dataset.kind || 'tap', key: el.dataset.key || el.id }));
  root.addEventListener('pointerdown', tDown, { passive: false });
  addEventListener('pointermove', tMove, { passive: false });
  addEventListener('pointerup', tUp, { passive: false }); addEventListener('pointercancel', (e) => { TP.stats.cancel++; tUp(e); });
  root.addEventListener('lostpointercapture', (e) => { if (TP.ptrs.has(e.pointerId)) tUp(e); });
  // klasyczne zdarzenia touch: tylko blokujemy domyślne zachowania (przewijanie, zoom, menu przytrzymania)
  for (const ev of ['touchstart', 'touchmove', 'touchend']) root.addEventListener(ev, (e) => { if (e.cancelable) e.preventDefault(); }, { passive: false });
  root.addEventListener('contextmenu', (e) => e.preventDefault());
  root.addEventListener('selectstart', (e) => e.preventDefault());
  addEventListener('blur', touchReset); addEventListener('pagehide', touchReset);
  document.addEventListener('visibilitychange', () => { if (document.hidden) touchReset(); });
  applyTouchLayout();
}
function applyTouchLayout() {
  const r = document.documentElement.style; r.setProperty('--bs', settings.btnScale || 1);
  $('touch').classList.toggle('lefty', !!settings.leftHanded);
  TP.pads = Math.round(16 * (settings.btnScale || 1));
}
function buzz(ms = 10) { if (settings.vibrate && navigator.vibrate) { try { navigator.vibrate(ms); } catch (e) { /* ignore */ } } }
function btnAt(x, y, holdOnly) {
  let best = null, bd = 1e9;
  for (const b of TP.btns) {
    if (holdOnly && b.kind !== 'hold') continue;
    const r = b.el.getBoundingClientRect(); if (!r.width || !r.height) continue; // ukryty (display:none)
    const p = TP.pads; if (x < r.left - p || x > r.right + p || y < r.top - p || y > r.bottom + p) continue;
    const d = Math.hypot(x - (r.left + r.right) / 2, y - (r.top + r.bottom) / 2); if (d < bd) { bd = d; best = b; }
  }
  return best;
}
function bPress(b) {
  b.el.classList.add('active'); buzz(b.kind === 'hold' ? 8 : 12);
  if (b.kind === 'hold') { TP.held[b.key] = (TP.held[b.key] || 0) + 1; G.touch[b.key] = true; return; }
  if (b.key === 'jump') G.touch.jump = true; else if (b.key === 'enter') actionE(); else if (b.key === 'radio') radioStep(1);
}
function bRelease(b) {
  if (!b) return; if (b.kind === 'hold') { TP.held[b.key] = Math.max(0, (TP.held[b.key] || 0) - 1); if (!TP.held[b.key]) { G.touch[b.key] = false; b.el.classList.remove('active'); } }
  else b.el.classList.remove('active');
}
function joyLeftSide(x) { return settings.leftHanded ? x > innerWidth * 0.5 : x < innerWidth * 0.5; }
function joyR() { return Math.max(48, Math.min(innerWidth, innerHeight) * 0.13) * (settings.btnScale || 1); }
function tDown(e) {
  if (e.cancelable) e.preventDefault(); TP.stats.down++;
  const x = e.clientX, y = e.clientY, id = e.pointerId;
  try { $('touch').setPointerCapture(id); } catch (err) { /* ignore */ }
  const b = btnAt(x, y);
  if (b) { TP.ptrs.set(id, { t: 'btn', b }); bPress(b); return; }
  if (!TP.joy && joyLeftSide(x) && y > innerHeight * 0.25) {
    TP.joy = { id, ox: x, oy: y }; TP.ptrs.set(id, { t: 'joy' });
    const base = $('joy'); base.classList.add('on'); base.style.left = x + 'px'; base.style.top = y + 'px'; base.style.right = 'auto'; base.style.bottom = 'auto';
    joySet(x, y); return;
  }
  if (!TP.look) { TP.look = { id, x, y }; TP.ptrs.set(id, { t: 'look' }); G.mouseLooking = true; return; }
  TP.ptrs.set(id, { t: 'none' });
}
function joySet(x, y) {
  const j = TP.joy, R = joyR(); let dx = x - j.ox, dy = y - j.oy; const l = Math.hypot(dx, dy);
  if (l > R) { // pływający środek: podąża za palcem, gdy wyjedzie poza zasięg
    const k = (l - R) / l; j.ox += dx * k; j.oy += dy * k; dx = x - j.ox; dy = y - j.oy;
    const base = $('joy'); base.style.left = j.ox + 'px'; base.style.top = j.oy + 'px';
  }
  $('joyKnob').style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
  let nx = dx / R, ny = dy / R; const m = Math.hypot(nx, ny), DZ = 0.07;
  if (m < DZ) { nx = ny = 0; } else { const s = Math.min(1, (m - DZ) / (1 - DZ)) / m; nx *= s; ny *= s; }
  G.touch.jx = nx; G.touch.jy = ny; G.touch.jon = true;
}
function tMove(e) {
  const p = TP.ptrs.get(e.pointerId); if (!p) return; if (e.cancelable) e.preventDefault();
  const x = e.clientX, y = e.clientY;
  if (p.t === 'joy') joySet(x, y);
  else if (p.t === 'look') {
    const L = TP.look; const dx = x - L.x, dy = y - L.y; L.x = x; L.y = y;
    const acc = 1 + Math.min(1, Math.hypot(dx, dy) / 30) * 0.6; // delikatne przyspieszenie przy szybkich ruchach
    look(dx * 1.35 * acc, dy * 1.1 * acc);
  } else if (p.t === 'btn' && p.b.kind === 'hold') { // przesuwanie palca między GAZ / HAM. / RĘCZNY
    const nb = btnAt(x, y, true);
    if (nb && nb !== p.b) { bRelease(p.b); p.b = nb; bPress(nb); }
  }
}
function tUp(e) {
  const p = TP.ptrs.get(e.pointerId); if (!p) return; TP.ptrs.delete(e.pointerId); TP.stats.up++;
  if (p.t === 'btn') bRelease(p.b);
  else if (p.t === 'joy') joyEnd();
  else if (p.t === 'look') { TP.look = null; G.mouseLooking = false; }
}
function joyEnd() { TP.joy = null; G.touch.jx = G.touch.jy = 0; G.touch.jon = false; const base = $('joy'); base.classList.remove('on'); base.style.left = base.style.top = base.style.right = base.style.bottom = ''; $('joyKnob').style.transform = ''; }
function touchReset() {
  TP.stats.reset++; TP.ptrs.clear(); TP.look = null; TP.held = {}; joyEnd(); G.mouseLooking = false;
  for (const k of ['gas', 'brake', 'hand', 'run', 'jump']) G.touch[k] = false;
  for (const b of TP.btns) b.el.classList.remove('active');
  if (G.keys) G.keys.clear();
}
// krzywa skrętu: precyzyjnie przy środku, pełny skręt na krawędzi; czułość z ustawień
function steerCurve(v) { const a = Math.abs(v); const c = 0.4 * a + 0.6 * a * a * a; return Math.sign(v) * Math.min(1, c * (settings.steerSens || 1)); }

// ======================= HUD =======================
function updateStreet() {
  const x = G.mode === 'car' ? activeCar.x : player.x, z = G.mode === 'car' ? activeCar.z : player.z;
  let best = null, bd = 40; const s = W.roadGrid.s;
  W.roadGrid.query(x, z, 40, (i) => {
    const r = W.roads[W.roadGrid.meta[i]]; if (!r.name) return;
    closestOnSeg(x, z, s[i * 4], s[i * 4 + 1], s[i * 4 + 2], s[i * 4 + 3], tmpC);
    const d = Math.hypot(tmpC.x - x, tmpC.z - z) - r.width / 2; if (d < bd) { bd = d; best = r.name; }
  });
  if (W.off && inOffRect(x, z) && offMask(x, z) > 0.25 && (!best || bd > 3)) best = 'Trasy off-road · Jezioro Tarnobrzeskie';
  if (!best || bd > 6) { for (const t of W.travel) if (Math.hypot(t[1] - x, t[2] - z) < 55) { best = t[0]; break; } }
  if (!best) {
    let ln = null, ld = 1e18;
    for (const l of W.landmarks) { if (l[3] !== 'suburb' && l[3] !== 'quarter' && l[3] !== 'neighbourhood' && l[3] !== 'village' && l[3] !== 'hamlet') continue; const d = (l[1] - x) ** 2 + (l[2] - z) ** 2; if (d < ld) { ld = d; ln = l[0]; } }
    best = ln ? 'okolice: ' + ln : 'Tarnobrzeg';
  }
  if (best !== G.street) { G.street = best; $('street').textContent = best; }
}

const MM = {};
function initMinimap() {
  MM.c = $('minimap'); MM.g = MM.c.getContext('2d');
  // spatial grid of features for fast minimap drawing
  MM.cell = 120; MM.grid = new Map();
  const add = (x0, z0, x1, z1, item) => {
    for (let ix = Math.floor(x0 / MM.cell); ix <= Math.floor(x1 / MM.cell); ix++) for (let iz = Math.floor(z0 / MM.cell); iz <= Math.floor(z1 / MM.cell); iz++) {
      const k = ix * 100000 + iz; let a = MM.grid.get(k); if (!a) { a = []; MM.grid.set(k, a); } a.push(item);
    }
  };
  const bb = (p) => { let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9; for (let i = 0; i < p.length; i += 2) { x0 = Math.min(x0, p[i]); x1 = Math.max(x1, p[i]); z0 = Math.min(z0, p[i + 1]); z1 = Math.max(z1, p[i + 1]); } return [x0, z0, x1, z1]; };
  for (const w of W.water) { const b = bb(w.ring); add(...b, { t: 0, p: w.ring }); }
  for (const w of W.waterways) { const b = bb(w.pts); add(...b, { t: 1, p: w.pts, w: w.width }); }
  for (const f of W.forests) { const b = bb(f.ring); add(...b, { t: 5, p: f.ring }); }
  for (const r of W.roads) { if (r.type === 'footway' || r.type === 'path' || r.type === 'steps' || r.type === 'track') continue; const b = bb(r.pts); add(...b, { t: 2, p: r.pts, w: r.width, major: r.type === 'secondary' || r.type === 'tertiary' || r.type === 'primary' }); }
  for (const b of W.buildings) { const x = bb(b.ring); add(...x, { t: 3, p: b.ring }); }
}
function drawMinimap() {
  const g = MM.g, S = MM.c.width; const x = G.mode === 'car' ? activeCar.x : player.x, z = G.mode === 'car' ? activeCar.z : player.z;
  const R = G.mode === 'car' ? 320 : 170; const sc = S / 2 / R;
  g.setTransform(1, 0, 0, 1, 0, 0); g.fillStyle = '#a9bf8d'; g.fillRect(0, 0, S, S);
  const rot = G.yaw + Math.PI; // heading-up
  g.setTransform(1, 0, 0, 1, S / 2, S / 2); g.rotate(rot); g.scale(sc, sc); g.translate(-x, -z);
  // three.js z = south; canvas y = down = south. heading-up: rotate so forward points up.
  const seen = new Set(); const items = [[], [], [], [], [], []];
  for (let ix = Math.floor((x - R * 1.42) / MM.cell); ix <= Math.floor((x + R * 1.42) / MM.cell); ix++) for (let iz = Math.floor((z - R * 1.42) / MM.cell); iz <= Math.floor((z + R * 1.42) / MM.cell); iz++) {
    const a = MM.grid.get(ix * 100000 + iz); if (!a) continue; for (const it of a) { if (seen.has(it)) continue; seen.add(it); items[it.t].push(it); }
  }
  const poly = (p) => { g.beginPath(); g.moveTo(p[0], p[1]); for (let i = 2; i < p.length; i += 2) g.lineTo(p[i], p[i + 1]); };
  g.fillStyle = '#6d9a55'; for (const it of items[5]) { poly(it.p); g.closePath(); g.fill(); }
  g.fillStyle = '#5d8fc0'; for (const it of items[0]) { poly(it.p); g.closePath(); g.fill(); }
  g.strokeStyle = '#5d8fc0'; g.lineCap = 'round'; g.lineJoin = 'round'; for (const it of items[1]) { g.lineWidth = Math.max(it.w, 2 / sc); poly(it.p); g.stroke(); }
  g.fillStyle = '#c6b8a6'; for (const it of items[3]) { poly(it.p); g.closePath(); g.fill(); }
  for (const it of items[2]) { g.strokeStyle = it.major ? '#ffd76a' : '#ffffff'; g.lineWidth = Math.max(it.w * 1.2, 3 / sc); poly(it.p); g.stroke(); }
  drawEggMinimap(g, sc);
  // cars
  for (const c of cars) { if (c === activeCar || !c.g.visible || c.police) continue; g.fillStyle = c.mission ? '#ffd21f' : c.ai ? '#6c6c74' : '#d33'; g.save(); g.translate(c.x, c.z); g.rotate(-c.h); g.fillRect(-1.2, -2.3, 2.4, 4.6); g.restore(); }
  drawMissionMinimap(g, sc);
  g.setTransform(1, 0, 0, 1, 0, 0);
  // player arrow (always up), heading relative to camera yaw
  const ph = G.mode === 'car' ? activeCar.h : player.h; const rel = -(ph - G.yaw);
  g.save(); g.translate(S / 2, S / 2); g.rotate(rel); g.fillStyle = '#ff3b30'; g.strokeStyle = '#fff'; g.lineWidth = 2;
  g.beginPath(); g.moveTo(0, -10); g.lineTo(7, 8); g.lineTo(0, 4); g.lineTo(-7, 8); g.closePath(); g.fill(); g.stroke(); g.restore();
  $('compass').style.transform = `rotate(${rot}rad) translateY(-88px) rotate(${-rot}rad)`;
}

const SP = {};
function drawSpeedo() {
  if (!SP.g) SP.g = $('speedGauge').getContext('2d');
  const v = Math.round(Math.abs(activeCar.forwardSpeed) * 3.6);
  if (v === SP.last) return; SP.last = v; $('speedVal').textContent = v;
  const g = SP.g; g.clearRect(0, 0, 140, 140);
  const a0 = Math.PI * 0.75, a1 = Math.PI * 2.25;
  g.lineWidth = 9; g.lineCap = 'round'; g.strokeStyle = 'rgba(255,255,255,.18)'; g.beginPath(); g.arc(70, 70, 58, a0, a1); g.stroke();
  const t = Math.min(1, v / 180); g.strokeStyle = v > 120 ? '#ff5a3c' : (v > 60 ? '#ffc23c' : '#59d36a');
  g.beginPath(); g.arc(70, 70, 58, a0, a0 + (a1 - a0) * t); g.stroke();
}

// ---------- big map
const BM = {};
function initBigMap() {
  const [MINX, MINZ, MAXX, MAXZ] = W.rect; const w = MAXX - MINX, h = MAXZ - MINZ;
  const S = 1400 / Math.max(w, h); BM.s = S; BM.W = Math.round(w * S); BM.H = Math.round(h * S);
  const base = document.createElement('canvas'); base.width = BM.W; base.height = BM.H; const g = base.getContext('2d');
  g.fillStyle = '#b9cc9c'; g.fillRect(0, 0, BM.W, BM.H);
  g.setTransform(S, 0, 0, S, -MINX * S, -MINZ * S);
  const poly = (p) => { g.beginPath(); g.moveTo(p[0], p[1]); for (let i = 2; i < p.length; i += 2) g.lineTo(p[i], p[i + 1]); };
  g.fillStyle = '#7aa762'; for (const f of W.forests) { poly(f.ring); g.closePath(); g.fill(); }
  g.fillStyle = '#5d8fc0'; for (const w2 of W.water) { poly(w2.ring); g.closePath(); g.fill(); }
  g.strokeStyle = '#5d8fc0'; g.lineCap = 'round'; g.lineJoin = 'round'; for (const w2 of W.waterways) { g.lineWidth = Math.max(w2.width, 1.5 / S); poly(w2.pts); g.stroke(); }
  g.fillStyle = '#b5a693'; for (const b of W.buildings) { poly(b.ring); g.closePath(); g.fill(); }
  const order = ['service', 'living_street', 'unclassified', 'residential', 'tertiary', 'secondary', 'primary', 'trunk'];
  for (const t of order) for (const r of W.roads) { if (r.type !== t) continue; g.strokeStyle = (t === 'secondary' || t === 'primary' || t === 'trunk') ? '#f7c04a' : (t === 'tertiary' ? '#fde08a' : '#ffffff'); g.lineWidth = Math.max(r.width, (t === 'secondary' ? 3.2 : 1.6) / S); poly(r.pts); g.stroke(); }
  BM.base = base;
  const c = $('bigmap'); c.width = BM.W; c.height = BM.H; BM.c = c; BM.g = c.getContext('2d');
  buildTravelList();
  c.addEventListener('click', (e) => {
    const r = c.getBoundingClientRect(); const mx = (e.clientX - r.left) / r.width * BM.W, my = (e.clientY - r.top) / r.height * BM.H;
    teleport(mx / BM.s + MINX, my / BM.s + MINZ); closeMap(); toast('Teleport', 1200);
  });
}
function buildTravelList() {
  const list = $('travelList'); list.innerHTML = '';
  W.travel.forEach((t, i) => { const b = document.createElement('button'); b.textContent = (i + 1) + '. ' + t[0]; if (t[0][0] === '★') b.className = 'egg'; b.onclick = () => { if (WANT.stars > 0) { toast('🚨 Szybka podróż niedostępna – najpierw zgub policję!', 2000); return; } teleport(t[1], t[2]); closeMap(); toast('Teleport: ' + t[0], 1800); }; list.appendChild(b); });
}
function drawBigMap() {
  const g = BM.g; const [MINX, MINZ] = W.rect; const S = BM.s;
  g.setTransform(1, 0, 0, 1, 0, 0); g.drawImage(BM.base, 0, 0);
  g.font = 'bold 15px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  W.travel.forEach((t, i) => { const x = (t[1] - MINX) * S, y = (t[2] - MINZ) * S; g.fillStyle = t[0][0] === '★' ? '#0a8fa8' : '#123'; g.beginPath(); g.arc(x, y, 11, 0, 7); g.fill(); g.fillStyle = '#fff'; g.fillText(String(i + 1), x, y + 1); });
  g.fillStyle = '#2b4a6b'; g.font = 'bold 22px system-ui, sans-serif';
  for (const w of W.water) if (w.name && Math.abs(ringArea(w.ring)) > 200000) { let cx = 0, cz = 0; const n = w.ring.length / 2; for (let i = 0; i < w.ring.length; i += 2) { cx += w.ring[i]; cz += w.ring[i + 1]; } g.fillText(w.name, (cx / n - MINX) * S, (cz / n - MINZ) * S); }
  g.save(); g.setTransform(S, 0, 0, S, -MINX * S, -MINZ * S); drawMissionMinimap(g, S * 1.6); g.restore();
  const px = G.mode === 'car' ? activeCar.x : player.x, pz = G.mode === 'car' ? activeCar.z : player.z; const ph = G.mode === 'car' ? activeCar.h : player.h;
  g.save(); g.translate((px - MINX) * S, (pz - MINZ) * S); g.rotate(Math.PI - ph); g.fillStyle = '#ff3b30'; g.strokeStyle = '#fff'; g.lineWidth = 3;
  g.beginPath(); g.moveTo(0, -16); g.lineTo(11, 12); g.lineTo(0, 6); g.lineTo(-11, 12); g.closePath(); g.fill(); g.stroke(); g.restore();
}
function openMap() { if (!G.started) return; drawBigMap(); $('mapScreen').classList.remove('hidden'); G.paused = true; G.mapOpen = true; if (document.pointerLockElement) document.exitPointerLock(); }
function closeMap() { $('mapScreen').classList.add('hidden'); G.mapOpen = false; G.paused = false; clock.getDelta(); }

// ======================= INPUT =======================
function initInput() {
  addEventListener('keydown', (e) => {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT')) return;
    G.keys.add(e.code);
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
    if (e.repeat) return;
    if (!G.started) return;
    if (G.dialogOpen) { if (e.code === 'KeyE' || e.code === 'Enter') dialogAction(); else if (e.code === 'Escape') dialogClose(); return; }
    if (POL.shop) { if (e.code === 'Digit1') { shopBuy('paint'); return; } if (e.code === 'Digit2') { shopBuy('fix'); return; } if (e.code === 'Escape' || e.code === 'Digit3') { shopClose(); return; } }
    if (e.code === 'Space' && G.mode === 'foot') G.jumpReq = true;
    if (e.code === 'KeyE' || e.code === 'KeyF') actionE();
    else if (e.code === 'KeyM') { G.mapOpen ? closeMap() : openMap(); }
    else if (e.code === 'KeyR' || e.code === 'Period') radioStep(1);
    else if (e.code === 'KeyQ' || e.code === 'Comma') radioStep(-1);
    else if (e.code === 'KeyT') radioPower();
    else if (e.code === 'KeyN') toggleNight();
    else if (e.code === 'KeyC') G.camZoom = G.camZoom ? 0 : 1;
    else if (e.code === 'Escape') { if (G.mapOpen) closeMap(); else pauseGame(); }
  });
  addEventListener('keyup', (e) => G.keys.delete(e.code));
  addEventListener('blur', () => G.keys.clear());
  const canvas = $('c');
  canvas.addEventListener('click', () => { if (G.started && !G.paused && !isTouch && canvas.requestPointerLock) { try { const p = canvas.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch (e) { /* unsupported */ } } });
  let drag = null;
  canvas.addEventListener('mousedown', (e) => { drag = { x: e.clientX, y: e.clientY }; });
  addEventListener('mouseup', () => { drag = null; G.mouseLooking = false; });
  addEventListener('mousemove', (e) => {
    if (!G.started || G.paused) return;
    let dx = 0, dy = 0;
    if (document.pointerLockElement === canvas) { dx = e.movementX; dy = e.movementY; }
    else if (drag) { dx = e.clientX - drag.x; dy = e.clientY - drag.y; drag = { x: e.clientX, y: e.clientY }; }
    if (dx || dy) look(dx, dy);
  });
  initTouch();
  $('btnMap').onclick = () => openMap(); $('mapClose').onclick = () => closeMap();
  $('btnNight').onclick = () => toggleNight(); $('btnPause').onclick = () => pauseGame();
  $('btnRadio').onclick = () => toggleRadio();
  const stop = (e) => e.stopPropagation();
  for (const id of ['topbtns', 'radioPanel']) { $(id).addEventListener('touchstart', stop, { passive: true }); $(id).addEventListener('mousedown', stop); }
}
function look(dx, dy) {
  const s = 0.0026 * settings.sens;
  G.yaw -= dx * s; G.pitch = clamp(G.pitch - dy * s, -1.25, 0.45);
  if (G.mode === 'car') { G.mouseLooking = true; clearTimeout(look._t); look._t = setTimeout(() => { G.mouseLooking = false; }, 900); }
}
function toggleNight() { G.night = !G.night; settings.time = G.night ? 'night' : 'day'; $('selTime').value = settings.time; saveSettings(); applyTime(); }
function pauseGame() {
  G.paused = true; if (document.pointerLockElement) document.exitPointerLock();
  $('menu').classList.remove('hidden'); $('hud').classList.add('hidden'); $('touch').classList.add('hidden'); $('btnStart').textContent = 'WZNÓW';
}
function startGame() {
  G.started = true; G.paused = false; clock.getDelta();
  $('menu').classList.add('hidden'); $('hud').classList.remove('hidden');
  if (isTouch) $('touch').classList.remove('hidden');
  updateVisibility(true); updateStreet();
  if (!startGame._once) { startGame._once = true; toast(isTouch ? 'Joystick – ruch, prawa strona – kamera. Szukaj świecących „!” – to misje!' : 'WASD – ruch, E – auto/akcja, M – mapa, Q/R – radio. Świecące „!” to misje!', 5000); }
}
function initMenu() {
  $('btnStart').onclick = () => startGame();
  $('btnHelp').onclick = () => { $('helpBox').classList.toggle('hidden'); $('settingsBox').classList.add('hidden'); };
  $('btnSettings').onclick = () => { $('settingsBox').classList.toggle('hidden'); $('helpBox').classList.add('hidden'); };
  $('selQuality').value = settings.quality; $('selTime').value = settings.time; $('rngSens').value = settings.sens; $('chkFps').checked = !!settings.fps;
  $('fps').classList.toggle('hidden', !settings.fps);
  $('selQuality').onchange = (e) => { settings.quality = e.target.value; saveSettings(); applyQuality(); updateVisibility(true); };
  $('selTime').onchange = (e) => { G.night = e.target.value === 'night'; settings.time = e.target.value; saveSettings(); applyTime(); };
  $('rngSens').oninput = (e) => { settings.sens = parseFloat(e.target.value); saveSettings(); };
  $('rngSteer').value = settings.steerSens; $('rngBtn').value = settings.btnScale; $('chkLeft').checked = !!settings.leftHanded; $('chkVibe').checked = !!settings.vibrate;
  $('rngSteer').oninput = (e) => { settings.steerSens = parseFloat(e.target.value); saveSettings(); };
  $('rngBtn').oninput = (e) => { settings.btnScale = parseFloat(e.target.value); saveSettings(); applyTouchLayout(); };
  $('chkLeft').onchange = (e) => { settings.leftHanded = e.target.checked; saveSettings(); applyTouchLayout(); };
  $('chkVibe').onchange = (e) => { settings.vibrate = e.target.checked; saveSettings(); if (e.target.checked) buzz(20); };
  $('selStyle').value = settings.style; $('chkRadioAuto').checked = !!settings.radioAuto;
  $('selStyle').onchange = (e) => { settings.style = e.target.value; saveSettings(); $('styleNote').textContent = 'Przeładowuję grę z nowym stylem…'; setTimeout(() => location.reload(), 300); };
  $('chkRadioAuto').onchange = (e) => { settings.radioAuto = e.target.checked; saveSettings(); };
  $('chkFps').onchange = (e) => { settings.fps = e.target.checked; saveSettings(); $('fps').classList.toggle('hidden', !settings.fps); };
}

Object.assign(G, {
  teleport, enterExit, openMap, closeMap, toggleRadio, toggleNight, startGame, pauseGame, actionE,
  radioStep, radioPower, radioPlay, radioStop, setStars, crime, busted, wasted, damageCar, missionStart: (id) => missionStart(MIS.list.find((m) => m.id === id)), missionEnd, addMoney,
  traffic: () => ({ agents: TR.agents.length, pool: TR.pool.length, peds: TR.peds.filter((p) => p.on).length, nodes: TR.nodes.length, edges: TR.edges.length, zebras: W.zebras || 0, moved: TR.stats.moved, spawned: TR.stats.spawned, cars: cars.length,
    list: TR.agents.map((c) => ({ x: c.x, z: c.z, h: c.h, v: c.ai ? c.ai.v : 0, e: c.ai ? c.ai.e : -1, mode: c.ai ? c.ai.mode : '' })) }),
  police: () => ({ stars: WANT.stars, seen: WANT.seen, evade: WANT.evade, chasers: chasers().length, blocks: POL.blocks.length, foot: POL.foot.filter((p) => p.on).length, bustT: POL.bustT, busted: G.bustedN || 0, footList: POL.foot.filter((p) => p.on).map((p) => Math.round(Math.hypot(p.x - focusXZ().x, p.z - focusXZ().z))), wasted: G.wastedN || 0, cut: !!G.cut, events: POL.events.slice(-10), siren: G.sirenVol || 0,
    list: POL.cars.filter((c) => c.g.visible).map((c) => ({ x: c.x, z: c.z, sp: c.speed, chase: !!c.pai, block: !!c.block, patrol: !!c.patrol, wrecked: !!c.wrecked, hp: Math.round(c.hp || 0), h: c.h, pi: c.pai ? c.pai.pi : -1, pl: c.pai && c.pai.path ? c.pai.path.length / 2 : 0, rev: c.pai ? +(c.pai.rev || 0).toFixed(1) : 0, srch: !!(c.pai && c.pai.search) })) }),
  mission: () => ({ active: MIS.active ? MIS.active.id : null, stage: MIS.active ? MIS.active.stage : null, obj: MIS.active ? MIS.active.obj : '', t: MIS.active ? MIS.active.t : null, target: MIS.active && MIS.active.target ? { x: MIS.active.target.x, z: MIS.active.target.z } : null, events: MIS.events.slice(-10), done: { ...SAVE.done }, money: SAVE.money, dialog: MIS.dlg ? MIS.dlg.id : null,
    givers: MIS.list.map((m) => ({ id: m.id, x: m.gx, z: m.gz, open: giverOpen(m) })), car: MIS.active && MIS.active.car ? { x: MIS.active.car.x, z: MIS.active.car.z } : null, cps: MIS.active && MIS.active.cps ? MIS.active.cps.length : 0, i: MIS.active ? MIS.active.i : 0 }),
  path: (ax, az, bx, bz) => { const p = astar(nearestNode(ax, az), nearestNode(bx, bz)); return p ? pathPoints(p) : null; },
  touchStats: () => ({ ...TP.stats, ptrs: TP.ptrs.size, joy: !!TP.joy, look: !!TP.look, jx: G.touch.jx, jy: G.touch.jy, gas: !!G.touch.gas, brake: !!G.touch.brake, hand: !!G.touch.hand, steer: activeCar ? activeCar.steer : 0 }), touchReset,
  dialogAction, dialogClose, shopBuy, shopClose, places: PLACES, money: () => SAVE.money,
  stats: () => ({ buildings: W.buildings.length, roads: W.roads.length, trees: W.treeCount, chunks: W.chunkCount, calls: renderer.info.render.calls, tris: renderer.info.render.triangles }),
  setYaw: (y) => { G.yaw = y; }, setQuality: (q) => { settings.quality = q; applyQuality(); updateVisibility(true); },
});

Object.defineProperties(G, { renderer: { get: () => renderer }, cars: { get: () => cars }, mis: { get: () => MIS }, car: { get: () => activeCar }, player: { get: () => player }, camera: { get: () => camera }, world: { get: () => W }, scene: { get: () => scene }, THREE: { get: () => THREE } });

init().catch((e) => { console.error(e); $('loadtxt').textContent = 'Błąd: ' + e.message; });
