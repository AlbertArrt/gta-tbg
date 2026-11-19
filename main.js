// GTA TBG (Tarnobrzeg) – open-world browser game on OpenStreetMap data (© OpenStreetMap contributors, ODbL)
import * as THREE from 'three';
import { Vehicle, Vector3, Path, FollowPathBehavior, SeparationBehavior, FleeBehavior, ObstacleAvoidanceBehavior, GameEntity, MeshBVH, acceleratedRaycast, nipplejs, MeshoptDecoder } from './vendor/game-libs.js';
THREE.Mesh.prototype.raycast = acceleratedRaycast;

const $ = (id) => document.getElementById(id);
const isTouch = (window.matchMedia && matchMedia('(pointer: coarse)').matches) || ('ontouchstart' in window && navigator.maxTouchPoints > 0);
const DEFAULTS = { quality: isTouch ? 'low' : 'med', time: 'day', sens: 1, fps: false, style: isTouch ? 'lite' : 'full', station: 0, radioAuto: true, radioVol: 0.8, steerSens: 1, btnScale: 1, leftHanded: false, vibrate: true, sfxVol: 0.7 };
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
// Darmowe, publicznie udostępniane strumienie HTTPS (MP3/AAC). Kolejność to gatunki.
// np = źródło "teraz gra" (tylko tam, gdzie jest publiczne API z CORS).
const RADIO_STATIONS = [
  { genre: 'Rock', name: 'Antyradio', url: 'https://r.dcs.redcdn.pl/sc/o2/Eurozet/live/antyradio.livx?audio=5', np: null, src: 'antyradio.pl' },
  { genre: 'Rock', name: 'Antyradio Classic Rock', url: 'https://an.cdn.eurozet.pl/ANTCLA.mp3', np: null, src: 'antyradio.pl' },
  { genre: 'Rock', name: 'Antyradio Hard', url: 'https://an.cdn.eurozet.pl/ANTHAR.mp3', np: null, src: 'antyradio.pl' },
  { genre: 'Rock', name: 'Radio Paradise – Rock Mix', url: 'https://stream.radioparadise.com/rock-128', np: null, src: 'radioparadise.com' },
  { genre: 'Rock', name: 'SomaFM Left Coast 70s', url: 'https://ice2.somafm.com/seventies-128-mp3', np: { type: 'soma', id: 'seventies' }, src: 'somafm.com' },
  { genre: 'Metal', name: 'SomaFM Metal Detector', url: 'https://ice2.somafm.com/metal-128-mp3', np: { type: 'soma', id: 'metal' }, src: 'somafm.com' },
  { genre: 'Jazz', name: 'Jazz Kultura', url: 'https://stream.radio.co/s1136b59f3/listen', np: { type: 'radioco', id: 's1136b59f3' }, src: 'jazzkultura.pl' },
  { genre: 'Jazz', name: 'SomaFM Sonic Universe', url: 'https://ice2.somafm.com/sonicuniverse-128-mp3', np: { type: 'soma', id: 'sonicuniverse' }, src: 'somafm.com' },
  { genre: 'Jazz', name: 'SmoothJazz.com', url: 'https://smoothjazz.cdnstream1.com/2585_128.mp3', np: null, src: 'smoothjazz.com' },
  { genre: 'Chillout', name: 'SomaFM Groove Salad', url: 'https://ice2.somafm.com/groovesalad-128-mp3', np: { type: 'soma', id: 'groovesalad' }, src: 'somafm.com' },
  { genre: 'Chillout', name: 'Radio Paradise – Mellow Mix', url: 'https://stream.radioparadise.com/mellow-128', np: null, src: 'radioparadise.com' },
  { genre: 'Pop', name: 'SomaFM PopTron', url: 'https://ice2.somafm.com/poptron-128-mp3', np: { type: 'soma', id: 'poptron' }, src: 'somafm.com' },
  { genre: 'Pop', name: 'SomaFM Indie Pop Rocks!', url: 'https://ice2.somafm.com/indiepop-128-mp3', np: { type: 'soma', id: 'indiepop' }, src: 'somafm.com' },
  { genre: 'House', name: 'SomaFM Beat Blender', url: 'https://ice2.somafm.com/beatblender-128-mp3', np: { type: 'soma', id: 'beatblender' }, src: 'somafm.com' },
  { genre: 'House', name: 'Technolovers Deep House', url: 'https://stream.technolovers.fm/deep-house', np: null, src: 'technolovers.fm' },
  { genre: 'Opera', name: 'Opera', url: 'https://stream.klassikradio.de/opera/mp3-128/radiobrowser', np: null, src: 'klassikradio.de' },
  { genre: 'Lokalne', name: 'Radio Leliwa (Tarnobrzeg)', url: 'https://streaming.g-news.pl/radio/8050/leliwa', np: { type: 'leliwa', url: 'https://streaming.g-news.pl/api/nowplaying/leliwa' }, src: 'leliwa.pl' },
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
    toonGradTex = new THREE.DataTexture(new Uint8Array([64, 122, 186, 255]), 4, 1, THREE.RedFormat);
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
  const m = new THREE.MeshToonMaterial(q);
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying float vAo;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
      {
#ifdef USE_INSTANCING
        vec3 aoW = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
        vec3 aoN = mat3(modelMatrix * instanceMatrix) * normal;
#else
        vec3 aoW = (modelMatrix * vec4(transformed, 1.0)).xyz;
        vec3 aoN = mat3(modelMatrix) * normal;
#endif
        float aoShade = mix(0.58, 1.0, smoothstep(0.02, 1.2, aoW.y));
        vAo = mix(1.0, aoShade, clamp(1.0 - abs(normalize(aoN).y), 0.0, 1.0));
      }`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vAo;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        diffuseColor.rgb *= vAo;`);
  };
  m.customProgramCacheKey = () => 'toonAo4';
  return m;
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
        if (pa.w < 0.08 || pb.w < 0.08) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
        vec2 sa = pa.xy / pa.w * uRes, sb = pb.xy / pb.w * uRes;
        vec2 d = sb - sa; float L = length(d);
        if (L > max(uRes.x, uRes.y) * 1.75) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
        d = L > 1e-4 ? d / L : vec2(1.0, 0.0);
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

// FASADA-ATLAS: 4 columns × 3 rows. Okna na każdym piętrze, gzyms (krawędź dachu i pas między kondygnacjami),
// boniowanie narożników (quoin) i witryna z pasem nad sklepem. Jedna tekstura, bez dodatkowych plików.
// mask: R = kolor ściany, G = akcent, B = szyba, która może świecić w nocy
function makeFacadeAtlas(aniso) {
  const CW = 128, COLS = 4, ROWS = 3, W2 = CW * COLS, H2 = CW * ROWS;
  const mk = () => { const c = document.createElement('canvas'); c.width = W2; c.height = H2; return [c, c.getContext('2d')]; };
  const [cc, g] = mk(), [mc, m] = mk();
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, W2, H2); m.fillStyle = 'rgb(255,0,0)'; m.fillRect(0, 0, W2, H2);
  const OUT = '#2a211c', GLASS = '#8ec5ea', GLASS2 = '#5f9fd0';
  // cell coords: x left→right, y bottom→top, 0..1. Row 0 is the bottom band of the texture.
  const R = (col, row, x0, y0, x1, y1) => { const px = (col + x0) * CW, py = H2 - (row + y1) * CW; return [px, py, (x1 - x0) * CW, (y1 - y0) * CW]; };
  const rect = (col, row, x0, y0, x1, y1, color, mask) => { const r = R(col, row, x0, y0, x1, y1); g.fillStyle = color; g.fillRect(...r); m.fillStyle = mask; m.fillRect(...r); };
  const win = (col, row, x0, y0, x1, y1, cross) => {
    rect(col, row, x0 - 0.035, y0 - 0.035, x1 + 0.035, y1 + 0.035, OUT, 'rgb(0,0,0)');
    rect(col, row, x0, y0, x1, y1, GLASS, 'rgb(0,0,255)');
    const r = R(col, row, x0, y0, x1, y1); const grd = g.createLinearGradient(r[0], r[1], r[0] + r[2], r[1] + r[3]); grd.addColorStop(0, '#b9e0fa'); grd.addColorStop(0.55, GLASS); grd.addColorStop(1, GLASS2); g.fillStyle = grd; g.fillRect(...r);
    g.fillStyle = 'rgba(255,255,255,.55)'; g.beginPath(); g.moveTo(r[0] + r[2] * 0.12, r[1] + r[3] * 0.55); g.lineTo(r[0] + r[2] * 0.45, r[1] + r[3] * 0.12); g.lineTo(r[0] + r[2] * 0.58, r[1] + r[3] * 0.12); g.lineTo(r[0] + r[2] * 0.12, r[1] + r[3] * 0.72); g.fill();
    if (cross) { rect(col, row, (x0 + x1) / 2 - 0.018, y0, (x0 + x1) / 2 + 0.018, y1, OUT, 'rgb(0,0,0)'); rect(col, row, x0, y0 + (y1 - y0) * 0.62, x1, y0 + (y1 - y0) * 0.62 + 0.03, OUT, 'rgb(0,0,0)'); }
  };
  const sill = (col, row, x0, x1, y) => { rect(col, row, x0, y, x1, y + 0.035, '#ffffff', 'rgb(0,255,0)'); rect(col, row, x0, y - 0.012, x1, y, OUT, 'rgb(0,0,0)'); };
  const cornice = (col, row) => {
    rect(col, row, 0, 0.78, 1, 0.86, '#f4efe4', 'rgb(0,0,0)');
    rect(col, row, 0, 0.86, 1, 0.94, '#fffaf2', 'rgb(0,0,0)');
    rect(col, row, 0, 0.94, 1, 1, OUT, 'rgb(0,0,0)');
    rect(col, row, 0, 0, 1, 0.055, '#fffaf2', 'rgb(0,0,0)');
    rect(col, row, 0, 0.055, 1, 0.078, OUT, 'rgb(0,0,0)');
  };
  const quoins = (col, row) => {
    for (let i = 0; i < 7; i++) {
      const y0 = 0.09 + i * 0.1, y1 = y0 + 0.072;
      const stone = i % 2 ? '#f7f1e4' : '#d7c6a8';
      rect(col, row, 0, y0, 0.075, y1, stone, 'rgb(0,0,0)');
      rect(col, row, 0.925, y0, 1, y1, stone, 'rgb(0,0,0)');
    }
    rect(col, row, 0.07, 0.08, 0.084, 0.94, OUT, 'rgb(0,0,0)');
    rect(col, row, 0.916, 0.08, 0.93, 0.94, OUT, 'rgb(0,0,0)');
  };
  cornice(0, 0); win(0, 0, 0.22, 0.22, 0.46, 0.72, true); win(0, 0, 0.54, 0.22, 0.78, 0.72, true); sill(0, 0, 0.18, 0.82, 0.16);
  cornice(1, 0); win(1, 0, 0.3, 0.28, 0.7, 0.78, true); sill(1, 0, 0.22, 0.78, 0.2);
  cornice(2, 0); win(2, 0, 0.36, 0.28, 0.64, 0.74, true); sill(2, 0, 0.32, 0.68, 0.22);
  rect(2, 0, 0.22, 0.26, 0.32, 0.76, OUT, 'rgb(0,0,0)'); rect(2, 0, 0.232, 0.28, 0.308, 0.74, '#ffffff', 'rgb(0,255,0)');
  rect(2, 0, 0.68, 0.26, 0.78, 0.76, OUT, 'rgb(0,0,0)'); rect(2, 0, 0.692, 0.28, 0.768, 0.74, '#ffffff', 'rgb(0,255,0)');
  for (let k = 0; k < 8; k++) rect(3, 0, k / 8, 0, k / 8 + 0.012, 1, 'rgba(0,0,0,.15)', 'rgb(180,0,0)');
  win(3, 0, 0.04, 0.42, 0.96, 0.7, false); rect(3, 0, 0, 0.7, 1, 0.74, OUT, 'rgb(0,0,0)');
  const plinth = (col) => { rect(col, 1, 0, 0, 1, 0.16, '#ffffff', 'rgb(0,255,0)'); rect(col, 1, 0, 0.16, 1, 0.185, OUT, 'rgb(0,0,0)'); };
  plinth(0); win(0, 1, 0.22, 0.32, 0.46, 0.78, true); win(0, 1, 0.54, 0.32, 0.78, 0.78, true); sill(0, 1, 0.18, 0.82, 0.26);
  plinth(1); win(1, 1, 0.3, 0.34, 0.7, 0.8, true); sill(1, 1, 0.24, 0.76, 0.28);
  plinth(2); win(2, 1, 0.36, 0.36, 0.64, 0.78, true); sill(2, 1, 0.3, 0.7, 0.3);
  plinth(3); win(3, 1, 0.08, 0.4, 0.92, 0.72, false);
  const door = (col, x0, x1, y1, color) => {
    rect(col, 2, x0 - 0.03, 0, x1 + 0.03, y1 + 0.04, OUT, 'rgb(0,0,0)');
    rect(col, 2, x0, 0, x1, y1, color, 'rgb(0,0,0)');
    rect(col, 2, (x0 + x1) / 2 - 0.01, 0.05, (x0 + x1) / 2 + 0.01, y1 - 0.04, OUT, 'rgb(0,0,0)');
    rect(col, 2, x1 - 0.07, y1 * 0.48, x1 - 0.035, y1 * 0.48 + 0.04, '#f6c431', 'rgb(0,0,0)');
  };
  rect(0, 2, 0, 0, 1, 0.08, '#ffffff', 'rgb(0,0,0)');
  win(0, 2, 0.1, 0.12, 0.46, 0.58, false); win(0, 2, 0.54, 0.12, 0.9, 0.58, false);
  rect(0, 2, 0.08, 0.6, 0.92, 0.86, '#e8503a', 'rgb(0,0,0)');
  rect(0, 2, 0.08, 0.58, 0.92, 0.61, OUT, 'rgb(0,0,0)');
  rect(0, 2, 0.08, 0.86, 0.92, 0.9, OUT, 'rgb(0,0,0)');
  rect(0, 2, 0.22, 0.66, 0.78, 0.8, '#fffaf2', 'rgb(0,0,0)');
  rect(1, 2, 0, 0, 1, 0.1, '#ffffff', 'rgb(0,255,0)');
  door(1, 0.34, 0.66, 0.62, '#6b3e2a');
  win(1, 2, 0.08, 0.28, 0.26, 0.62, true); win(1, 2, 0.74, 0.28, 0.92, 0.62, true);
  rect(1, 2, 0.28, 0.66, 0.72, 0.74, '#ffffff', 'rgb(0,255,0)'); rect(1, 2, 0.28, 0.64, 0.72, 0.66, OUT, 'rgb(0,0,0)');
  rect(2, 2, 0, 0, 1, 0.1, '#ffffff', 'rgb(0,255,0)');
  door(2, 0.36, 0.64, 0.58, '#7a4632');
  rect(2, 2, 0.3, 0.62, 0.7, 0.7, '#ffffff', 'rgb(0,255,0)');
  win(2, 2, 0.72, 0.38, 0.9, 0.7, true);
  rect(3, 2, 0.08, 0, 0.92, 0.78, OUT, 'rgb(0,0,0)');
  rect(3, 2, 0.12, 0, 0.88, 0.74, '#d7d2c8', 'rgb(0,0,0)');
  for (let k = 1; k < 6; k++) rect(3, 2, 0.12, k * 0.12, 0.88, k * 0.12 + 0.018, OUT, 'rgb(0,0,0)');
  for (let col = 0; col < 4; col++) for (let row = 0; row < 3; row++) quoins(col, row);
  const tex = new THREE.CanvasTexture(cc); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = aniso;
  const mask = new THREE.CanvasTexture(mc); mask.anisotropy = aniso;
  return { tex, mask };
}
function makeFacadeMat(aniso) {
  const { tex, mask } = makeFacadeAtlas(aniso);
  const mat = new THREE.MeshToonMaterial({ vertexColors: true, map: tex, gradientMap: toonGrad(), emissive: 0xffd28a, emissiveIntensity: 0 });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.facMask = { value: mask };
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec3 acc; attribute float aTile; varying vec3 vAcc; varying float vTile; varying float vAo;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
      vAcc = acc; vTile = aTile;
      {
        vec3 aoW = (modelMatrix * vec4(transformed, 1.0)).xyz;
        vec3 aoN = mat3(modelMatrix) * normal;
        float aoShade = mix(0.58, 1.0, smoothstep(0.02, 1.2, aoW.y));
        vAo = mix(1.0, aoShade, clamp(1.0 - abs(normalize(aoN).y), 0.0, 1.0));
      }`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform sampler2D facMask; varying vec3 vAcc; varying float vTile; varying float vAo;')
      .replace('#include <map_fragment>', `float facLit = 0.0;
        if (vTile < -0.5) { diffuseColor.rgb *= vColor; }
        else {
          vec2 fu = vMapUv; vec2 cu = fract(fu); float fl = floor(fu.y);
          float door = step(15.5, vTile);
          float base = vTile - door * 16.0;
          float tc = mod(base, 4.0);
          float shop = step(3.5, base);
          if (fl >= 0.5) tc = mod(tc + fl, 4.0);
          float row = 0.0;
          if (fl < 0.5) {
            if (door > 0.5) {
              row = 2.0;
              if (shop > 0.5) tc = 0.0;
              else if (tc < 1.5) tc = 1.0;
            } else row = 1.0;
          }
          vec2 auv = vec2((tc + cu.x) * 0.25, (row + cu.y) / 3.0);
          vec2 gx = dFdx(fu) * vec2(0.25, 0.333333), gy = dFdy(fu) * vec2(0.25, 0.333333);
          vec4 fc = textureGrad(map, auv, gx, gy); vec4 fm = textureGrad(facMask, auv, gx, gy);
          vec3 pc = mix(fc.rgb, vColor, fm.r); pc = mix(pc, vAcc, fm.g);
          diffuseColor.rgb *= pc;
          facLit = fm.b * step(0.42, fract(sin(dot(floor(fu) + vec2(vTile * 3.7, vTile), vec2(12.9898, 78.233))) * 43758.5453));
          diffuseColor.rgb *= vAo;
        }`)
      .replace('#include <color_fragment>', '')
      .replace('#include <emissivemap_fragment>', 'totalEmissiveRadiance *= facLit;');
  };
  mat.customProgramCacheKey = () => 'facade5';
  return mat;
}

// ---- post: cheap warm grade on every comic mode (including Low/lite). Depth edges stay a Full extra above Low.
const POST = { on: false, edge: false, grade: false, mode: '' };
function initPost() {
  const edge = TOON && STYLE === 'full' && settings.quality !== 'low';
  const grade = TOON;
  if (!edge && !grade) { POST.on = false; POST.edge = false; POST.grade = false; POST.mode = ''; return; }
  const mode = (edge ? 'e' : '') + (grade ? 'g' : '');
  POST.on = true; POST.edge = edge; POST.grade = grade;
  if (POST.mode === mode && POST.rt) { resizePost(); return; }
  if (POST.rt) { POST.rt.dispose(); POST.rt = null; }
  POST.mode = mode;
  const sz = renderer.getDrawingBufferSize(new THREE.Vector2());
  const opt = { samples: 0 };
  let dt = null;
  if (edge) { dt = new THREE.DepthTexture(sz.x, sz.y); dt.type = THREE.UnsignedIntType; opt.depthTexture = dt; opt.samples = QUALITY[settings.quality].aa ? 4 : 0; }
  POST.rt = new THREE.WebGLRenderTarget(sz.x, sz.y, opt);
  const uPx = { value: new THREE.Vector2(1 / sz.x, 1 / sz.y) };
  POST.exp = { value: 1 };
  const uniforms = { tCol: { value: POST.rt.texture }, uExp: POST.exp, uPx, uNear: { value: camera.near }, uFar: { value: camera.far }, uCol: { value: OUTLINE_COL.clone() }, uK: { value: 1 } };
  if (dt) uniforms.tDep = { value: dt };
  const edgeBody = edge ? `
        float zc = lin(texture2D(tDep, vUv).x);
        vec2 o = uPx * uK;
        float z1 = lin(texture2D(tDep, vUv + vec2(o.x, 0.0)).x), z2 = lin(texture2D(tDep, vUv - vec2(o.x, 0.0)).x);
        float z3 = lin(texture2D(tDep, vUv + vec2(0.0, o.y)).x), z4 = lin(texture2D(tDep, vUv - vec2(0.0, o.y)).x);
        float dz = max(max(z1, z2), max(z3, z4)) - zc;
        float e = smoothstep(0.05, 0.12, dz / zc) * (1.0 - smoothstep(180.0, 420.0, zc));
        c = mix(c, uCol, e * 0.9);` : '';
  POST.mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: `uniform sampler2D tCol; ${edge ? 'uniform sampler2D tDep; uniform vec2 uPx; uniform float uNear; uniform float uFar; uniform vec3 uCol; uniform float uK;' : ''} uniform float uExp; varying vec2 vUv;
      ${edge ? 'float lin(float d){ return uNear * uFar / (uFar - d * (uFar - uNear)); }' : ''}
      void main(){
        vec3 c = texture2D(tCol, vUv).rgb;
        float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
        c = max(mix(vec3(l), c, 1.15), 0.0);
        c *= vec3(1.07, 1.02, 0.93) * uExp;
        float vig = smoothstep(0.42, 1.05, length((vUv - 0.5) * vec2(1.2, 1.0)));
        c *= mix(1.0, 0.8, vig);
        ${edgeBody}
        gl_FragColor = vec4(c, 1.0);
        #include <colorspace_fragment>
      }`,
    depthTest: false, depthWrite: false,
  });
  if (!POST.scene) {
    POST.scene = new THREE.Scene(); POST.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  }
  if (POST.quad) POST.scene.remove(POST.quad);
  POST.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), POST.mat); POST.quad.frustumCulled = false; POST.scene.add(POST.quad);
}
function resizePost() {
  if (!POST.on || !POST.rt) return; const sz = renderer.getDrawingBufferSize(new THREE.Vector2());
  POST.rt.setSize(sz.x, sz.y);
  if (POST.mat.uniforms.uPx) POST.mat.uniforms.uPx.value.set(1 / sz.x, 1 / sz.y);
  if (POST.mat.uniforms.uK) POST.mat.uniforms.uK.value = Math.max(1, renderer.getPixelRatio());
}
function renderFrame() {
  if (TOON) {
    const sz = renderer.getDrawingBufferSize(tmpSz); const em = getEdgeMat();
    em.uniforms.uRes.value.set(sz.x / 2, sz.y / 2); em.uniforms.uW.value = 1.05 * renderer.getPixelRatio(); em.uniforms.uNear.value = camera.near;
  }
  if (POST.on) {
    if (POST.edge) { POST.mat.uniforms.uNear.value = camera.near; POST.mat.uniforms.uFar.value = camera.far; }
    if (POST.exp) POST.exp.value = G.night ? 1.08 : 1.0;
    renderer.setRenderTarget(POST.rt); renderer.render(scene, camera);
    G.sceneCalls = renderer.info.render.calls; G.sceneTris = renderer.info.render.triangles;
    renderer.setRenderTarget(null); renderer.render(POST.scene, POST.cam);
  } else {
    renderer.render(scene, camera);
    G.sceneCalls = renderer.info.render.calls; G.sceneTris = renderer.info.render.triangles;
  }
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
  const getChunk = (x, z) => { const k = Math.floor(x / CH) + ',' + Math.floor(z / CH); let c = chunks.get(k); if (!c) { c = { walls: new GeoBuf(), roofs: new GeoBuf(), detail: new GeoBuf(), area: new GeoBuf(), road: new GeoBuf(), mark: new GeoBuf(), water: new GeoBuf(), walk: new GeoBuf(), edges: [] }; if (TOON) c.walls.setX(null, -1); chunks.set(k, c); } return c; };
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
      balcony: mkMat({ vertexColors: true }),
      area: mkMat({ vertexColors: true, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 }),
      water: mkMat({ color: 0x47a6e0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 }),
      walk: mkMat({ vertexColors: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 }),
      road: mkMat({ vertexColors: true, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -6 }),
      mark: mkMat({ vertexColors: true, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -8 }),
      ground: mkMat({ color: 0xa3d65c }),
    };
  }

  // v3: ground is a subdivided plane that follows the camera (a single 60 km quad lost depth precision vs. roads near the camera)
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(12000, 12000, 96, 96), W.mats.ground);
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground); W.ground = ground;

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
    if (kind === 'commercial') (W.shops = W.shops || []).push(rec);
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
  const fronts = [];
  const copeCol = new THREE.Color('#f6f1e6');
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
      if (kind === 'church' || kind === 'chapel' || kind === 'castle') tile = 2;
      acc = new THREE.Color(pick(rnd, wcol.getHSL({}).l > 0.75 ? ['#7a4a32', '#3f6e9a', '#c8442f', '#5f8f4a', '#8a5a9a'] : ['#fbf6ea', '#fbf6ea', '#f3e6c8', '#3f3a36']));
    }
    const pitched = (PITCH.has(kind) || (kind === 'yes' && area < 380 && area > 35)) && ring.length <= 24 && isConvex(ring) && !holes.length;
    let roofH = 0;
    if (pitched) roofH = (kind === 'church') ? Math.min(12, 3 + Math.sqrt(area) * 0.35) : Math.min(5, 1.6 + Math.sqrt(area) * 0.13);
    const wallH = Math.max(2.4, h - roofH * (est ? 0.6 : 0.7));
    if (TOON && tile >= 0 && tile < 4 && !SHEDS.has(kind) && kind !== 'church' && kind !== 'chapel' && kind !== 'castle' && wallH > 3.1 && area > 55 && area < 2800) {
      let shopStreet = kind === 'commercial' || kind === 'retail';
      if (!shopStreet) {
        W.roadGrid.query(cx0, cz0, 22, (ri) => {
          if (shopStreet) return;
          const road = W.roads[W.roadGrid.meta[ri]];
          if (road && (road.type === 'primary' || road.type === 'secondary' || road.type === 'tertiary' || road.type === 'trunk')) shopStreet = true;
        });
      }
      if (shopStreet) tile += 4;
    }
    const rcol = new THREE.Color(pitched ? pick(rnd, ROOF_P) : pick(rnd, ROOF_F));
    let cx = 0, cz = 0; const n = ring.length / 2; for (let i = 0; i < ring.length; i += 2) { cx += ring[i]; cz += ring[i + 1]; } cx /= n; cz /= n;
    const ch = getChunk(cx, cz);
    const dominican = kind === 'church' && Math.hypot(cx + 87, cz + 69) < 45;
    if (dominican) {
      const mm = ring.length / 2;
      for (let i = 0; i < mm; i++) {
        const j = (i + 1) % mm;
        W.bGrid.add(ring[i * 2], ring[i * 2 + 1], ring[j * 2], ring[j * 2 + 1], bi);
      }
      W.buildings.push({ ring, cx, cz, h: 34, kind, kay: '', landmark: 'kosciol-wniebowziecia' });
      let bx0 = 1e9, bx1 = -1e9, bz0 = 1e9, bz1 = -1e9;
      for (let i = 0; i < ring.length; i += 2) { bx0 = Math.min(bx0, ring[i]); bx1 = Math.max(bx1, ring[i]); bz0 = Math.min(bz0, ring[i + 1]); bz1 = Math.max(bz1, ring[i + 1]); }
      for (let ix = Math.floor(bx0 / 32); ix <= Math.floor(bx1 / 32); ix++) for (let iz = Math.floor(bz0 / 32); iz <= Math.floor(bz1 / 32); iz++) {
        const k = ix * 100000 + iz; let a = W.bCells.get(k); if (!a) { a = []; W.bCells.set(k, a); } a.push(bi);
      }
      buildDominicanChurch(scene, ring, cx, cz);
      bi++;
      continue;
    }
    if (TOON) ch.walls.setX(acc, tile);
    const floors = Math.max(1, Math.round(wallH / 3)), fh = wallH / floors;
    let doorI = -1, doorL = 0;
    if (TOON) {
      const mm = ring.length / 2;
      for (let i = 0; i < mm; i++) {
        const j = (i + 1) % mm;
        const L = Math.hypot(ring[j * 2] - ring[i * 2], ring[j * 2 + 1] - ring[i * 2 + 1]);
        if (L > doorL) { doorL = L; doorI = i; }
      }
    }
    const kay = (typeof KAY_SHOP !== 'undefined' && KAY_SHOP[bi]) || '';
    const wantDoor = TOON && !kay && doorL > 4.2 && !SHEDS.has(kind) && wallH > 2.5;
    const blockish = palette === PAL.block && floors >= 3 && area > 140 && area < 4500;
    const addQuad = (x1, z1, x2, z2, nx, nz, u0, u1, tcode) => {
      if (kay) return;
      if (TOON) ch.walls.setX(acc, tcode);
      const v1 = TOON ? floors : wallH / 12;
      ch.walls.tri(x1, 0, z1, x2, 0, z2, x2, wallH, z2, wcol, [u0, 0, u1, 0, u1, v1], nx, 0, nz);
      ch.walls.tri(x1, 0, z1, x2, wallH, z2, x1, wallH, z1, wcol, [u0, 0, u1, v1, u0, v1], nx, 0, nz);
    };
    const addWalls = (r, outer) => {
      const m = r.length / 2; let uRun = Math.floor(rnd() * 4) * 3 / 12; const pos = ringArea(r) > 0;
      for (let i = 0; i < m; i++) {
        const j = (i + 1) % m; const x1 = r[i * 2], z1 = r[i * 2 + 1], x2 = r[j * 2], z2 = r[j * 2 + 1];
        const len = Math.hypot(x2 - x1, z2 - z1); if (len < 0.05) continue;
        let nx = (z2 - z1) / len, nz = -(x2 - x1) / len; if (pos !== outer) { nx = -nx; nz = -nz; }
        const fx = (x2 - x1) / len, fz = (z2 - z1) / len;
        if (wantDoor && outer && i === doorI) {
          const doorW = Math.min(2.3, Math.max(1.45, len * 0.2));
          const gap = (len - doorW) / 2;
          const parts = [[0, gap, tile, false], [gap, gap + doorW, tile + 16, true], [gap + doorW, len, tile, false]];
          for (const [a, b, tcode, isDoor] of parts) {
            if (b - a < 0.15) continue;
            const xa = x1 + fx * a, za = z1 + fz * a, xb = x1 + fx * b, zb = z1 + fz * b;
            const seglen = b - a;
            const uu1 = isDoor ? 1 : (seglen < 1.6 ? seglen / 3 : Math.max(1, Math.round(seglen / 3)));
            addQuad(xa, za, xb, zb, nx, nz, 0, uu1, tcode);
          }
        } else {
          let u0 = uRun, u1 = u0 + len / 12;
          if (TOON) { u0 = 0; u1 = len < 1.6 ? len / 3 : Math.max(1, Math.round(len / 3)); }
          addQuad(x1, z1, x2, z2, nx, nz, u0, u1, tile);
          uRun = u1;
        }
        if (TOON && outer && !kay && !SHEDS.has(kind) && len > 2.4 && wallH > 3 && Math.hypot(cx - W.data.travel[0][1], cz - W.data.travel[0][2]) < 520) {
          const lip = 0.16, rise = 0.38, ox = nx * lip, oz = nz * lip, y0 = wallH, y1 = wallH + rise;
          ch.walls.setX(null, -1);
          ch.walls.tri(x1, y0, z1, x2, y0, z2, x2 + ox, y1, z2 + oz, copeCol, null, nx, 0.4, nz);
          ch.walls.tri(x1, y0, z1, x2 + ox, y1, z2 + oz, x1 + ox, y1, z1 + oz, copeCol, null, nx, 0.4, nz);
          ch.edges.push(x1 + ox, y1, z1 + oz, x2 + ox, y1, z2 + oz);
        }
        if (TOON && blockish && outer && len > 7) addBalconies(ch.detail, x1, z1, fx, fz, nx, nz, len, floors, fh, rnd);
        W.bGrid.add(x1, z1, x2, z2, bi);
        if (outer && len > 3 && len < 46 && !SHEDS.has(kind)) {
          const mx = (x1 + x2) * 0.5, mz = (z1 + z2) * 0.5;
          let bestD = 17, best = null;
          W.roadGrid.query(mx, mz, 17, (ri) => {
            const road = W.roads[W.roadGrid.meta[ri]];
            if (!road.drivable || road.type === 'service' || road.bridge) return;
            const s = W.roadGrid.s;
            closestOnSeg(mx, mz, s[ri * 4], s[ri * 4 + 1], s[ri * 4 + 2], s[ri * 4 + 3], tmpC);
            const dx = tmpC.x - mx, dz = tmpC.z - mz, d = Math.hypot(dx, dz);
            if (d >= bestD || d < road.width * 0.42) return;
            const rdx = s[ri * 4 + 2] - s[ri * 4], rdz = s[ri * 4 + 3] - s[ri * 4 + 1];
            const rl = Math.hypot(rdx, rdz) || 1;
            if (Math.abs(fx * rdx + fz * rdz) / rl < 0.72) return;
            if (dx * nx + dz * nz < 0.45 * d) return;
            bestD = d; best = { d, hx: rdx / rl, hz: rdz / rl, rw: road.width };
          });
          if (best) fronts.push({ x1, z1, x2, z2, nx, nz, h: wallH, d: best.d, hx: best.hx, hz: best.hz, rw: best.rw, mx, mz, tile, col: wcol.getHex(), acc: acc ? acc.getHex() : -1 });
        }
      }
    };
    addWalls(ring, true); holes.forEach((hr) => addWalls(hr, false));
    if (TOON && !kay) {
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
    if (kay) { /* OSM walls and roof are replaced by a KayKit shop; the ring stays in bGrid */ }
    else if (pitched) {
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n; const x1 = ring[i * 2], z1 = ring[i * 2 + 1], x2 = ring[j * 2], z2 = ring[j * 2 + 1];
        const ax = x2 - x1, az = z2 - z1, bx = cx - x1, by = roofH, bz = cz - z1;
        let nx = -az * by, ny = az * bx - ax * bz, nz = ax * by;
        if (ny < 0) { nx = -nx; ny = -ny; nz = -nz; }
        const L = Math.hypot(nx, ny, nz) || 1;
        ch.roofs.tri(x1, wallH, z1, x2, wallH, z2, cx, wallH + roofH, cz, rcol, null, nx / L, ny / L, nz / L);
        if (TOON) ch.edges.push(x1, wallH, z1, cx, wallH + roofH, cz);
      }
      if (TOON && area > 45 && (area < 700 || kind === 'church' || kind === 'chapel')) addChimney(ch, cx, cz, wallH + roofH, kind);
    } else {
      const { pts, faces } = triangulate(ring, holes);
      for (const f of faces) { const A = pts[f[0]], B = pts[f[1]], C = pts[f[2]]; ch.roofs.tri(A.x, wallH, A.y, B.x, wallH, B.y, C.x, wallH, C.y, rcol, null, 0, 1, 0); }
      if (TOON && area > 150 && wallH > 4.5) roofBoxes(ch, ring, holes, wallH, area, rnd);
    }
    W.buildings.push({ ring, cx, cz, h: wallH + roofH, kind, kay });
    let x0 = 1e9, x1b = -1e9, z0 = 1e9, z1b = -1e9;
    for (let i = 0; i < ring.length; i += 2) { x0 = Math.min(x0, ring[i]); x1b = Math.max(x1b, ring[i]); z0 = Math.min(z0, ring[i + 1]); z1b = Math.max(z1b, ring[i + 1]); }
    for (let ix = Math.floor(x0 / 32); ix <= Math.floor(x1b / 32); ix++) for (let iz = Math.floor(z0 / 32); iz <= Math.floor(z1b / 32); iz++) {
      const k = ix * 100000 + iz; let a = W.bCells.get(k); if (!a) { a = []; W.bCells.set(k, a); } a.push(bi);
    }
    bi++;
    if (bi % 2000 === 0) { setLoad(0.55 + 0.2 * bi / data.buildings.length); await nextFrame(); }
  }
  setLoad(0.76, 'Pierzeje ulic…'); await nextFrame();
  sealStreetWalls(fronts, getChunk);
  W.bGrid.finish();
  if (typeof placeKayShops === 'function') placeKayShops(scene);

  setLoad(0.78, 'Składanie miasta…'); await nextFrame();
  W.chunkGroup = new THREE.Group(); scene.add(W.chunkGroup);
  for (const [, c] of chunks) {
    const addMesh = (geo, mat, opts = {}) => {
      const m = new THREE.Mesh(geo, mat);
      m.matrixAutoUpdate = false; m.updateMatrix();
      if (opts.cast) { m.castShadow = true; if (typeof bvhRegister === 'function') bvhRegister(m); }
      m.receiveShadow = true;
      W.chunkGroup.add(m);
      const bs = geo.boundingSphere; W.visObjects.push({ obj: m, x: bs.center.x, z: bs.center.z, r: bs.radius, bias: opts.bias || 0 });
    };
    if (c.area.count) addMesh(c.area.toGeometry(), W.mats.area, { bias: 200 });
    if (c.water.count) addMesh(c.water.toGeometry(), W.mats.water, { bias: 400 });
    if (c.road.count) addMesh(c.road.toGeometry(), W.mats.road, { bias: 100 });
    if (c.walk.count) addMesh(c.walk.toGeometry(), W.mats.walk, { bias: -50 });
    if (c.mark.count) addMesh(c.mark.toGeometry(), W.mats.mark, { bias: -150 });
    if (c.walls.count || c.roofs.count) addMesh(c.walls.toGeometry(c.roofs), [W.mats.wall, W.mats.roof], { cast: true });
    if (TOON && c.detail && c.detail.count) {
      const geo = c.detail.toGeometry();
      const m = new THREE.Mesh(geo, W.mats.balcony);
      m.matrixAutoUpdate = false; m.updateMatrix(); m.castShadow = true; m.receiveShadow = true;
      W.chunkGroup.add(m);
      const bs = geo.boundingSphere; W.visObjects.push({ obj: m, x: bs.center.x, z: bs.center.z, r: bs.radius, bias: 0, detail: true });
      W.detailTris = (W.detailTris || 0) + Math.floor(geo.getAttribute('position').count / 3);
    }
    if (c.edges.length) { const m = makeEdgeMesh(c.edges); W.chunkGroup.add(m); const bs = m.geometry.boundingSphere; W.visObjects.push({ obj: m, x: bs.center.x, z: bs.center.z, r: bs.radius, bias: -150, edge: true }); W.edgeCount = (W.edgeCount || 0) + c.edges.length / 6; c.edges = null; }
  }
  W.chunkCount = chunks.size;

  setLoad(0.83, 'Trasy off-road…'); await nextFrame();
  buildOffroad(scene);
  setLoad(0.86, 'Drzewa…'); await nextFrame();
  W.treeGroup = new THREE.Group(); scene.add(W.treeGroup);
  buildTrees(QUALITY[settings.quality].trees);
  W.travel = data.travel.slice();
  if (W.landmarkChurch && !W.travel.some((t) => t[0] === W.landmarkChurch.name)) W.travel.splice(1, 0, [W.landmarkChurch.name, W.landmarkChurch.x, W.landmarkChurch.z]);
  W.landmarks = data.landmarks;
  G.landmarkChurch = W.landmarkChurch || null;
  setLoad(0.92, 'Chmury i ulica…'); await nextFrame();
  buildLook(scene);
  setLoad(0.95, 'Prawie gotowe…'); await nextFrame();
}

function sealStreetWalls(fronts, getChunk) {
  const q = (typeof settings !== 'undefined' && settings.quality) || 'med';
  const crackMax = q === 'low' ? 2 : 3;
  const crackCap = q === 'low' ? 600 : (q === 'high' ? 2200 : 1400);
  const doPull = q !== 'low';
  const pullCap = q === 'high' ? 600 : 350;
  const backMax = q === 'high' ? 24 : (q === 'med' ? 18 : 0);
  const backCap = q === 'high' ? 280 : 180;
  const plotCap = q === 'high' ? 48 : 0;
  const shopCap = q === 'high' ? 18 : 0;
  let cracks = 0, pulls = 0, backs = 0, plots = 0, tris = 0;
  const backJobs = [];
  const used = new Set();
  const dense = (x, z) => Math.hypot(x + 7, z - 10) < 780 || Math.hypot(x - 1216, z + 49) < 680;
  const nearPoi = (x, z) => {
    const t = W.data.travel;
    for (let i = 0; i < t.length; i++) if ((t[i][1] - x) ** 2 + (t[i][2] - z) ** 2 < 576) return true;
    return (x - 2375) ** 2 + (z + 1694) ** 2 < 1296;
  };
  const blocked = (x, z) => insideBuilding(x, z) || inWater(x, z) || nearRoad(x, z, 0.85) || nearPoi(x, z);
  const face = (x1, z1, x2, z2, nx, nz, h, colHex, tile, accHex) => {
    const len = Math.hypot(x2 - x1, z2 - z1);
    if (len < 0.25 || h < 2) return 0;
    const ch = getChunk((x1 + x2) * 0.5, (z1 + z2) * 0.5);
    const col = new THREE.Color(colHex);
    if (TOON) ch.walls.setX(accHex < 0 ? null : new THREE.Color(accHex), tile < 0 ? 2 : tile);
    const u1 = TOON ? (len < 1.6 ? len / 3 : Math.max(1, Math.round(len / 3))) : len / 12;
    const v1 = TOON ? Math.max(1, Math.round(h / 3)) : h / 12;
    ch.walls.tri(x1, 0, z1, x2, 0, z2, x2, h, z2, col, [0, 0, u1, 0, u1, v1], nx, 0, nz);
    ch.walls.tri(x1, 0, z1, x2, h, z2, x1, h, z1, col, [0, 0, u1, v1, 0, v1], nx, 0, nz);
    ch.walls.tri(x1, 0, z1, x2, h, z2, x2, 0, z2, col, [0, 0, u1, v1, u1, 0], -nx, 0, -nz);
    ch.walls.tri(x1, 0, z1, x1, h, z1, x2, h, z2, col, [0, 0, 0, v1, u1, v1], -nx, 0, -nz);
    if (TOON) {
      ch.edges.push(x1, 0, z1, x1, h, z1, x2, 0, z2, x2, h, z2, x1, h, z1, x2, h, z2);
      ch.walls.setX(null, -1);
    }
    W.bGrid.add(x1, z1, x2, z2, -1);
    return 4;
  };
  const roof = (x1, z1, x2, z2, x3, z3, x4, z4, y, hex) => {
    const ch = getChunk((x1 + x3) * 0.5, (z1 + z3) * 0.5);
    const c = new THREE.Color(hex);
    const abx = x2 - x1, abz = z2 - z1, bcx = x3 - x2, bcz = z3 - z2;
    const up = abz * bcx - abx * bcz >= 0;
    if (up) {
      ch.roofs.tri(x1, y, z1, x2, y, z2, x3, y, z3, c, null, 0, 1, 0);
      ch.roofs.tri(x1, y, z1, x3, y, z3, x4, y, z4, c, null, 0, 1, 0);
    } else {
      ch.roofs.tri(x1, y, z1, x3, y, z3, x2, y, z2, c, null, 0, 1, 0);
      ch.roofs.tri(x1, y, z1, x4, y, z4, x3, y, z3, c, null, 0, 1, 0);
    }
    if (TOON) ch.edges.push(x1, y, z1, x2, y, z2, x2, y, z2, x3, y, z3, x3, y, z3, x4, y, z4, x4, y, z4, x1, y, z1);
    return 2;
  };
  const occupy = (ring, h) => {
    let cx = 0, cz = 0; const n = ring.length / 2;
    for (let i = 0; i < ring.length; i += 2) { cx += ring[i]; cz += ring[i + 1]; }
    cx /= n; cz /= n;
    const id = W.buildings.length;
    W.buildings.push({ ring, cx, cz, h, kind: 'seal' });
    let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
    for (let i = 0; i < ring.length; i += 2) { x0 = Math.min(x0, ring[i]); x1 = Math.max(x1, ring[i]); z0 = Math.min(z0, ring[i + 1]); z1 = Math.max(z1, ring[i + 1]); }
    for (let ix = Math.floor(x0 / 32); ix <= Math.floor(x1 / 32); ix++) for (let iz = Math.floor(z0 / 32); iz <= Math.floor(z1 / 32); iz++) {
      const k = ix * 100000 + iz; let a = W.bCells.get(k); if (!a) { a = []; W.bCells.set(k, a); } a.push(id);
    }
  };
  const CELL = 16;
  const buckets = new Map();
  const addBucket = (x, z, i) => {
    const k = (Math.floor(x / CELL) + 4000) * 8000 + Math.floor(z / CELL) + 4000;
    let a = buckets.get(k); if (!a) { a = []; buckets.set(k, a); } a.push(i);
  };
  for (let i = 0; i < fronts.length; i++) { addBucket(fronts[i].x1, fronts[i].z1, i); addBucket(fronts[i].x2, fronts[i].z2, i); }
  const keyOf = (x, z) => (Math.round(x * 2) + ',' + Math.round(z * 2));
  const seenPair = new Set();
  for (let i = 0; i < fronts.length; i++) {
    const A = fronts[i];
    const seeds = [[A.x1, A.z1], [A.x2, A.z2]];
    for (const seed of seeds) {
    const ix = Math.floor(seed[0] / CELL), iz = Math.floor(seed[1] / CELL);
    for (let ox = -2; ox <= 2; ox++) for (let oz = -2; oz <= 2; oz++) {
      const list = buckets.get((ix + ox + 4000) * 8000 + (iz + oz + 4000));
      if (!list) continue;
      for (let k = 0; k < list.length; k++) {
        const j = list[k]; if (j <= i) continue;
        const pid = i + '|' + j; if (seenPair.has(pid)) continue; seenPair.add(pid);
        const B = fronts[j];
        if (A.nx * B.nx + A.nz * B.nz < 0.82) continue;
        if (Math.abs(A.d - B.d) > 14) continue;
        if (Math.abs(A.hx * B.hx + A.hz * B.hz) < 0.75) continue;
        let best = 1e9, ax = 0, az = 0, bx = 0, bz = 0;
        const AE = [[A.x1, A.z1], [A.x2, A.z2]], BE = [[B.x1, B.z1], [B.x2, B.z2]];
        for (let p = 0; p < 2; p++) for (let q = 0; q < 2; q++) {
          const ddx = AE[p][0] - BE[q][0], ddz = AE[p][1] - BE[q][1], d2 = ddx * ddx + ddz * ddz;
          if (d2 < best) { best = d2; ax = AE[p][0]; az = AE[p][1]; bx = BE[q][0]; bz = BE[q][1]; }
        }
        const gap = Math.sqrt(best);
        if (gap < 0.4 || gap > Math.max(crackMax, backMax)) continue;
        let gx = bx - ax, gz = bz - az, gl = gap || 1;
        const nx = A.nx, nz = A.nz;
        const along = Math.abs(gx * nx + gz * nz) / gl;
        if (along > (gap <= crackMax ? 0.5 : 0.7)) continue;
        if (gz * nx - gx * nz < 0) { const tx = ax, tz = az; ax = bx; az = bz; bx = tx; bz = tz; gx = -gx; gz = -gz; }
        const mx = (ax + bx) * 0.5, mz = (az + bz) * 0.5;
        const pk = keyOf(ax, az) + '|' + keyOf(bx, bz);
        if (used.has(pk)) continue;
        if (gap <= crackMax && Math.abs(A.d - B.d) > 2.8) continue;
        if (gap <= crackMax && cracks < crackCap) {
          if (blocked(mx, mz)) continue;
          const h = Math.min(A.h, B.h, 12);
          if (h < 2.6) continue;
          used.add(pk);
          tris += face(ax, az, bx, bz, nx, nz, h, A.col, A.tile, A.acc);
          cracks++;
        } else if (backMax && gap > crackMax && gap <= (dense(mx, mz) ? backMax : Math.min(backMax, 10))) {
          backJobs.push({ ax, az, bx, bz, gx, gz, gl, nx, nz, gap, h: Math.min(A.h, B.h), col: A.col, tile: A.tile, acc: A.acc, dense: dense(mx, mz) ? 1 : 0, pk });
        }
      }
    }
    }
  }
  backJobs.sort((a, b) => b.dense - a.dense || b.gap - a.gap);
  for (const J of backJobs) {
    if (backs >= backCap) break;
    if (used.has(J.pk)) continue;
    const inset = 0.55, back = 0.4, depth = 6.4;
    const fx = J.gx / J.gl, fz = J.gz / J.gl;
    const span = J.gap - inset * 2;
    if (span < 2.3) continue;
    const f1x = J.ax + fx * inset - J.nx * back, f1z = J.az + fz * inset - J.nz * back;
    const f2x = J.bx - fx * inset - J.nx * back, f2z = J.bz - fz * inset - J.nz * back;
    const b1x = f1x - J.nx * depth, b1z = f1z - J.nz * depth;
    const b2x = f2x - J.nx * depth, b2z = f2z - J.nz * depth;
    const pts = [[f1x, f1z], [f2x, f2z], [b2x, b2z], [b1x, b1z], [(f1x + f2x) * 0.5, (f1z + f2z) * 0.5], [(b1x + b2x) * 0.5, (b1z + b2z) * 0.5]];
    const spanLen = Math.hypot(f2x - f1x, f2z - f1z);
    for (let s = 4; s < spanLen; s += 4) {
      const t = s / spanLen;
      pts.push([f1x + (f2x - f1x) * t, f1z + (f2z - f1z) * t]);
      pts.push([b1x + (b2x - b1x) * t, b1z + (b2z - b1z) * t]);
    }
    let ok = true;
    for (const p of pts) if (blocked(p[0], p[1])) ok = false;
    if (!ok || blocked((f1x + b2x) * 0.5, (f1z + b2z) * 0.5)) continue;
    used.add(J.pk);
    const h = Math.min(12, Math.max(8, J.h * 0.9));
    tris += face(f1x, f1z, f2x, f2z, J.nx, J.nz, h, J.col, J.tile, J.acc);
    tris += face(f2x, f2z, b2x, b2z, fx, fz, h, J.col, J.tile, J.acc);
    tris += face(b2x, b2z, b1x, b1z, -J.nx, -J.nz, h, J.col, J.tile, J.acc);
    tris += face(b1x, b1z, f1x, f1z, -fx, -fz, h, J.col, J.tile, J.acc);
    tris += roof(f1x, f1z, f2x, f2z, b2x, b2z, b1x, b1z, h, 0xc45a3a);
    occupy([f1x, f1z, f2x, f2z, b2x, b2z, b1x, b1z], h);
    backs++;
  }
  if (doPull) {
    for (let i = 0; i < fronts.length && pulls < pullCap; i++) {
      const f = fronts[i];
      if (!dense(f.mx, f.mz) || f.h < 4.2) continue;
      const len = Math.hypot(f.x2 - f.x1, f.z2 - f.z1);
      if (len < 5.5) continue;
      const target = f.rw * 0.5 + 3.15;
      const pull = f.d - target;
      if (pull < 2.8 || pull > 11) continue;
      const x1 = f.x1 + f.nx * pull, z1 = f.z1 + f.nz * pull;
      const x2 = f.x2 + f.nx * pull, z2 = f.z2 + f.nz * pull;
      const sx = (f.x2 - f.x1) / len, sz = (f.z2 - f.z1) / len;
      const samples = [[x1, z1], [x2, z2], [(x1 + x2) * 0.5, (z1 + z2) * 0.5], [(f.x1 + x1) * 0.5, (f.z1 + z1) * 0.5], [(f.x2 + x2) * 0.5, (f.z2 + z2) * 0.5]];
      let ok = true;
      for (const p of samples) if (blocked(p[0], p[1])) ok = false;
      if (!ok) continue;
      const h = Math.min(f.h, 12);
      tris += face(x1, z1, x2, z2, f.nx, f.nz, h, f.col, f.tile, f.acc);
      tris += face(f.x1, f.z1, x1, z1, -sx, -sz, h, f.col, f.tile, f.acc);
      tris += face(x2, z2, f.x2, f.z2, sx, sz, h, f.col, f.tile, f.acc);
      tris += roof(x1, z1, x2, z2, f.x2, f.z2, f.x1, f.z1, h, 0xc9c6c0);
      occupy([f.x1, f.z1, f.x2, f.z2, x2, z2, x1, z1], h);
      pulls++;
    }
  }
  const fillPlots = (list, cap, shop) => {
    if (!list || cap <= 0) return;
    const rnd = mulberry32(shop ? 9091 : 4242);
    const cols = shop ? [0xf3e6c8, 0x7fa8d8, 0xf0a24a, 0xeae4da] : [0xf3e6c8, 0xf0a24a, 0xf6d3a1, 0xe8b83a];
    let made = 0;
    for (const rec of list) {
      if (made >= cap) break;
      if (rec.area < (shop ? 500 : 800) || rec.area > (shop ? 2800 : 3800)) continue;
      let cx = 0, cz = 0; const n = rec.ring.length / 2;
      for (let i = 0; i < rec.ring.length; i += 2) { cx += rec.ring[i]; cz += rec.ring[i + 1]; }
      cx /= n; cz /= n;
      if (!pointInRing(cx, cz, rec.ring) || rec.holes.some((h) => pointInRing(cx, cz, h))) continue;
      if (!dense(cx, cz) || nearPoi(cx, cz) || inWater(cx, cz) || insideBuilding(cx, cz)) continue;
      let hits = 0;
      for (let s = 0; s < 8; s++) {
        const x = cx + (rnd() - 0.5) * 16, z = cz + (rnd() - 0.5) * 16;
        if (pointInRing(x, z, rec.ring) && insideBuilding(x, z)) hits++;
      }
      if (hits > 1) continue;
      let best = null, bd = 24;
      W.roadGrid.query(cx, cz, 24, (ri) => {
        const road = W.roads[W.roadGrid.meta[ri]];
        if (!road.drivable || road.type === 'service' || road.bridge) return;
        const sg = W.roadGrid.s;
        closestOnSeg(cx, cz, sg[ri * 4], sg[ri * 4 + 1], sg[ri * 4 + 2], sg[ri * 4 + 3], tmpC);
        const d = Math.hypot(tmpC.x - cx, tmpC.z - cz);
        if (d < bd) { bd = d; best = { x: tmpC.x, z: tmpC.z, w: road.width }; }
      });
      if (!best || bd < 10 || bd > 22) continue;
      const nx = (best.x - cx) / bd, nz = (best.z - cz) / bd;
      const halfD = shop ? 4.2 : 3.6, halfW = shop ? 5.2 : 4.1;
      const shift = bd - (best.w * 0.5 + 3.2 + halfD);
      if (shift < 1.2) continue;
      const hx = cx + nx * shift, hz = cz + nz * shift;
      const sx = -nz, sz = nx;
      const flx = hx - sx * halfW + nx * halfD, flz = hz - sz * halfW + nz * halfD;
      const frx = hx + sx * halfW + nx * halfD, frz = hz + sz * halfW + nz * halfD;
      const brx = hx + sx * halfW - nx * halfD, brz = hz + sz * halfW - nz * halfD;
      const blx = hx - sx * halfW - nx * halfD, blz = hz - sz * halfW - nz * halfD;
      const ring = [flx, flz, frx, frz, brx, brz, blx, blz];
      let ok = pointInRing(hx, hz, rec.ring);
      for (let i = 0; i < 8 && ok; i += 2) if (!pointInRing(ring[i], ring[i + 1], rec.ring) || blocked(ring[i], ring[i + 1])) ok = false;
      if (!ok || blocked(hx, hz)) continue;
      const h = shop ? 7.2 : 6.2;
      const col = cols[Math.floor(rnd() * cols.length)];
      const tile = shop ? 4 : 2;
      const acc = 0x7a4a32;
      tris += face(flx, flz, frx, frz, nx, nz, h, col, tile, acc);
      tris += face(frx, frz, brx, brz, sx, sz, h, col, tile, acc);
      tris += face(brx, brz, blx, blz, -nx, -nz, h, col, tile, acc);
      tris += face(blx, blz, flx, flz, -sx, -sz, h, col, tile, acc);
      tris += roof(flx, flz, frx, frz, brx, brz, blx, blz, h, shop ? 0xc9c6c0 : 0xc45a3a);
      occupy(ring, h);
      made++; plots++;
    }
  };
  fillPlots(W.resid, plotCap, false);
  fillPlots(W.shops, shopCap, true);
  W.sealStats = { quality: q, fronts: fronts.length, cracks, pulls, backs, plots, tris };
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

// Stylized, not surveyed entrances: one balcony slab above head height, only on block-like OSM kinds.
const BAL_COL = new THREE.Color('#f4efe6');
const BAL_RAIL = new THREE.Color('#2a211c');
function addBalconies(buf, x1, z1, fx, fz, nx, nz, len, floors, fh, rnd) {
  if (!buf) return;
  const spots = len > 16 ? [0.32, 0.68] : [0.5];
  let made = 0;
  for (let f = 1; f < floors && f <= 5 && made < 4; f += 2) {
    const y = f * fh + 0.08; if (y < 2.7) continue;
    for (const s of spots) {
      if (made >= 4 || rnd() < 0.25) continue;
      const px = x1 + fx * len * s, pz = z1 + fz * len * s;
      const hw = 0.85, depth = 0.5;
      const p = (a, b) => [px + fx * a + nx * b, pz + fz * a + nz * b];
      const A = p(-hw, 0.06), B = p(hw, 0.06), C = p(hw, depth), D = p(-hw, depth);
      const y1 = y + 0.1, yr = y1 + 0.5;
      buf.tri(A[0], y1, A[1], B[0], y1, B[1], C[0], y1, C[1], BAL_COL, null, nx * 0.15, 0.98, nz * 0.15);
      buf.tri(A[0], y1, A[1], C[0], y1, C[1], D[0], y1, D[1], BAL_COL, null, nx * 0.15, 0.98, nz * 0.15);
      buf.tri(D[0], y, D[1], C[0], y, C[1], C[0], y1, C[1], BAL_COL, null, nx, 0, nz);
      buf.tri(D[0], y, D[1], C[0], y1, C[1], D[0], y1, D[1], BAL_COL, null, nx, 0, nz);
      buf.tri(D[0], y1, D[1], C[0], y1, C[1], C[0], yr, C[1], BAL_RAIL, null, nx, 0, nz);
      buf.tri(D[0], y1, D[1], C[0], yr, C[1], D[0], yr, D[1], BAL_RAIL, null, nx, 0, nz);
      made++;
    }
  }
}
const CHIM = new THREE.Color('#6b3a2e');
function addChimney(ch, cx, cz, peakY, kind) {
  const church = kind === 'church' || kind === 'chapel';
  const s = church ? 0.55 : 0.32, hh = church ? 4.2 : 1.05;
  const y0 = peakY - 0.05, y1 = y0 + hh;
  const c = church ? new THREE.Color('#f7f3ea') : CHIM;
  const P = [[cx - s, cz - s], [cx + s, cz - s], [cx + s, cz + s], [cx - s, cz + s]];
  ch.roofs.tri(P[0][0], y1, P[0][1], P[1][0], y1, P[1][1], P[2][0], y1, P[2][1], c, null, 0, 1, 0);
  ch.roofs.tri(P[0][0], y1, P[0][1], P[2][0], y1, P[2][1], P[3][0], y1, P[3][1], c, null, 0, 1, 0);
  for (let i = 0; i < 4; i++) {
    const A = P[i], B = P[(i + 1) % 4];
    const ex = B[0] - A[0], ez = B[1] - A[1], L = Math.hypot(ex, ez) || 1, nnx = ez / L, nnz = -ex / L;
    ch.roofs.tri(A[0], y0, A[1], B[0], y0, B[1], B[0], y1, B[1], c, null, nnx, 0, nnz);
    ch.roofs.tri(A[0], y0, A[1], B[0], y1, B[1], A[0], y1, A[1], c, null, nnx, 0, nnz);
    ch.edges.push(A[0], y0, A[1], A[0], y1, A[1]);
  }
  if (church) {
    const tip = y1 + 1.6;
    ch.roofs.tri(P[0][0], y1, P[0][1], P[1][0], y1, P[1][1], cx, tip, cz, c, null, 0, 1, 0);
    ch.roofs.tri(P[1][0], y1, P[1][1], P[2][0], y1, P[2][1], cx, tip, cz, c, null, 0, 1, 0);
    ch.roofs.tri(P[2][0], y1, P[2][1], P[3][0], y1, P[3][1], cx, tip, cz, c, null, 0, 1, 0);
    ch.roofs.tri(P[3][0], y1, P[3][1], P[0][0], y1, P[0][1], cx, tip, cz, c, null, 0, 1, 0);
  }
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

// ======================= LOOK: clouds, street props, contact blobs =======================
const LOOK = { blobs: null, dyn: 64, blobM: null, blobP: null, blobQ: null, blobS: null };
function buildLook(scene) {
  if (!TOON) return;
  buildClouds(scene);
  buildFurniture(scene);
  buildBlobs(scene);
}
function buildClouds(scene) {
  const n = settings.quality === 'low' ? 12 : (settings.quality === 'high' ? 40 : 24);
  const puff = mergeTree([
    [smoothIco(1.6, 0), 0, 0, 0, 1, 0.72, 1, '#f4fbff'],
    [smoothIco(1.15, 0), 1.15, 0.15, 0.2, 1, 0.8, 1, '#e7f4ff'],
    [smoothIco(1.05, 0), -1.05, 0.05, -0.25, 1, 0.78, 1, '#ffffff'],
  ]);
  const mesh = new THREE.InstancedMesh(puff, new THREE.MeshBasicMaterial({ vertexColors: true }), n);
  const hull = new THREE.InstancedMesh(puff, hullMats().norm, n);
  hull.instanceMatrix = mesh.instanceMatrix;
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  const rnd = mulberry32(77);
  const centers = [[-7, 10], [1216, -49], [80, -40], [420, 180], [-280, 160], [700, -300]];
  for (let i = 0; i < n; i++) {
    const c = centers[i % centers.length];
    const x = c[0] + (rnd() - 0.5) * 280, z = c[1] + (rnd() - 0.5) * 280, y = 78 + rnd() * 55;
    const sc = 7 + rnd() * 6;
    p.set(x, y, z); q.setFromAxisAngle(up, rnd() * 6.28); s.set(sc, sc * (0.55 + rnd() * 0.25), sc);
    m4.compose(p, q, s); mesh.setMatrixAt(i, m4);
  }
  mesh.instanceMatrix.needsUpdate = true;
  mesh.frustumCulled = false; hull.frustumCulled = false;
  mesh.castShadow = false; hull.castShadow = false;
  scene.add(mesh); scene.add(hull);
  W.cloudCount = n;
}
function furnSpec(kind) {
  const iron = '#3a342c', wood = '#e0a15a', cream = '#f3e6c8', leaf = '#5fb53a', red = '#e8503a', sand = '#f6e7b0', blue = '#3d8fe0';
  if (kind === 'lamp') return [[0.18, 0.08, 0.18, 0, 0.04, 0, iron], [0.1, 3.0, 0.1, 0, 1.54, 0, iron], [0.58, 0.1, 0.26, 0, 3.08, 0.04, sand], [0.66, 0.05, 0.32, 0, 3.14, 0.04, iron]];
  if (kind === 'bench') return [[1.25, 0.08, 0.4, 0, 0.46, 0, wood], [1.25, 0.4, 0.08, 0, 0.68, -0.16, wood], [0.08, 0.46, 0.36, -0.55, 0.23, 0, iron], [0.08, 0.46, 0.36, 0.55, 0.23, 0, iron]];
  if (kind === 'bin') return [[0.4, 0.68, 0.4, 0, 0.36, 0, blue], [0.46, 0.06, 0.46, 0, 0.72, 0, iron]];
  if (kind === 'hydrant') return [[0.2, 0.52, 0.2, 0, 0.28, 0, red], [0.32, 0.08, 0.1, 0, 0.46, 0, red], [0.14, 0.1, 0.14, 0, 0.58, 0, iron]];
  if (kind === 'sign') return [[0.08, 2.15, 0.08, 0, 1.08, 0, iron], [0.72, 0.4, 0.06, 0, 2.0, 0, cream], [0.48, 0.08, 0.02, 0, 2.0, 0.04, blue]];
  return [[0.68, 0.36, 0.68, 0, 0.18, 0, cream], [0.46, 0.32, 0.46, 0, 0.48, 0, leaf]];
}
function nearKayShop(x, z) {
  if (!W.buildings) return false;
  for (const b of W.buildings) if (b.kay && (b.cx - x) ** 2 + (b.cz - z) ** 2 < 64) return true;
  return false;
}
function nearMark(x, z) {
  const t = W.data && W.data.travel;
  if (t) for (let i = 0; i < t.length; i++) if ((t[i][1] - x) ** 2 + (t[i][2] - z) ** 2 < 324) return true;
  return (x - 2375) ** 2 + (z + 1694) ** 2 < 1600;
}
function buildFurniture(scene) {
  const q = settings.quality;
  const step = q === 'low' ? 120 : (q === 'high' ? 42 : 70);
  const cap = q === 'low' ? 120 : (q === 'high' ? 520 : 280);
  const kinds = q === 'low' ? ['lamp', 'bin'] : ['lamp', 'bench', 'bin', 'hydrant', 'sign', 'planter'];
  const buckets = {}; kinds.forEach((k) => { buckets[k] = []; });
  const keep = new Set(['residential', 'tertiary', 'secondary', 'primary', 'living_street', 'unclassified']);
  const rad = { lamp: 0.28, bench: 0.7, bin: 0.32, hydrant: 0.26, sign: 0.22, planter: 0.4 };
  if (!W.props) W.props = [];
  let n = 0;
  for (const r of W.roads) {
    if (n >= cap) break;
    if (!keep.has(r.type) || r.bridge) continue;
    const pts = r.pts;
    for (let i = 0; i < pts.length - 2 && n < cap; i += 2) {
      const x1 = pts[i], z1 = pts[i + 1], x2 = pts[i + 2], z2 = pts[i + 3];
      const len = Math.hypot(x2 - x1, z2 - z1); if (len < 12) continue;
      const dx = (x2 - x1) / len, dz = (z2 - z1) / len, nx = -dz, nz = dx;
      for (let t = 6; t < len - 6 && n < cap; t += step) {
        const sg = ((Math.floor(x1 + t) + Math.floor(z1)) & 1) ? 1 : -1;
        const o = sg * (r.width / 2 + 2.55);
        const x = x1 + dx * t + nx * o, z = z1 + dz * t + nz * o;
        if (insideBuilding(x, z, 0.7) || inWater(x, z) || nearRoad(x, z, 0.35) || nearMark(x, z) || nearKayShop(x, z)) continue;
        const kind = kinds[(n + Math.floor(Math.abs(x * 3 + z) ) ) % kinds.length];
        buckets[kind].push([x, z, Math.atan2(dx, dz)]);
        W.props.push({ x, z, r: rad[kind] });
        n++;
      }
    }
  }
  const up = new THREE.Vector3(0, 1, 0), m4 = new THREE.Matrix4(), qq = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(1, 1, 1);
  W.furnCount = n;
  for (const kind of kinds) {
    const arr = buckets[kind]; if (!arr.length) continue;
    const geo = mergeBoxes(furnSpec(kind));
    const mesh = new THREE.InstancedMesh(geo, mkMat({ vertexColors: true }), arr.length);
    const hull = new THREE.InstancedMesh(geo, hullMats().box, arr.length);
    hull.instanceMatrix = mesh.instanceMatrix;
    arr.forEach((it, i) => {
      p.set(it[0], 0, it[2]); qq.setFromAxisAngle(up, it[1]); m4.compose(p, qq, s); mesh.setMatrixAt(i, m4);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.castShadow = false; hull.castShadow = false;
    mesh.frustumCulled = false; hull.frustumCulled = false;
    scene.add(mesh); scene.add(hull);
  }
}
function buildBlobs(scene) {
  const geo = new THREE.CircleGeometry(1, 8); geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshBasicMaterial({ color: 0x2a211c, transparent: true, opacity: 0.3, depthWrite: false });
  const max = 64 + (W.props ? W.props.length : 0);
  const mesh = new THREE.InstancedMesh(geo, mat, Math.max(8, max));
  mesh.frustumCulled = false; mesh.renderOrder = 2; mesh.castShadow = false;
  const z = new THREE.Matrix4().makeScale(0, 0, 0);
  for (let i = 0; i < mesh.count; i++) mesh.setMatrixAt(i, z);
  LOOK.blobs = mesh; LOOK.dyn = 64; LOOK.blobM = new THREE.Matrix4(); LOOK.blobP = new THREE.Vector3(); LOOK.blobQ = new THREE.Quaternion(); LOOK.blobS = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  let i = LOOK.dyn;
  if (W.props) for (const p of W.props) {
    if (i >= mesh.count) break;
    LOOK.blobP.set(p.x, 0.07, p.z); LOOK.blobQ.setFromAxisAngle(up, 0); LOOK.blobS.set(p.r * 1.15, 1, p.r * 1.15);
    LOOK.blobM.compose(LOOK.blobP, LOOK.blobQ, LOOK.blobS); mesh.setMatrixAt(i++, LOOK.blobM);
  }
  LOOK.staticN = i;
  mesh.instanceMatrix.needsUpdate = true;
  scene.add(mesh);
}
function updateBlobs() {
  const mesh = LOOK.blobs; if (!mesh || !player) return;
  const q = settings.quality;
  const cap = q === 'low' ? 12 : (q === 'high' ? 48 : 26);
  const reach = q === 'low' ? 42 : (q === 'high' ? 100 : 70);
  const cx = G.mode === 'car' && activeCar ? activeCar.x : player.x;
  const cz = G.mode === 'car' && activeCar ? activeCar.z : player.z;
  const up = new THREE.Vector3(0, 1, 0);
  const put = (x, y, z, rx, rz, h) => {
    if (LOOK._i >= cap) return;
    LOOK.blobP.set(x, (y || 0) + 0.07, z);
    LOOK.blobQ.setFromAxisAngle(up, h || 0);
    LOOK.blobS.set(rx, 1, rz);
    LOOK.blobM.compose(LOOK.blobP, LOOK.blobQ, LOOK.blobS);
    mesh.setMatrixAt(LOOK._i++, LOOK.blobM);
  };
  LOOK._i = 0;
  const blobOf = (c) => {
    const halfL = c.offs && c.offs.length ? Math.max.apply(null, c.offs.map((o) => Math.abs(o))) : (c.scooter ? 0.55 : 1.7);
    const halfW = c.rad || (c.scooter ? 0.4 : 0.95);
    return [Math.max(0.4, halfW * 1.05), Math.max(0.6, halfL * 0.95)];
  };
  if (G.mode === 'car' && activeCar) { const s = blobOf(activeCar); put(activeCar.x, activeCar.y, activeCar.z, s[0], s[1], activeCar.h); }
  else put(player.x, player.y, player.z, 0.42, 0.42, player.h || 0);
  if (cars) for (let k = 0; k < cars.length && LOOK._i < cap; k++) {
    const c = cars[k]; if (!c || c === activeCar || !c.g || !c.g.visible) continue;
    if (Math.hypot(c.x - cx, c.z - cz) > reach) continue;
    const s = blobOf(c); put(c.x, c.y, c.z, s[0], s[1], c.h);
  }
  if (typeof TR !== 'undefined' && TR.peds) for (let k = 0; k < TR.peds.length && LOOK._i < cap; k++) {
    const p = TR.peds[k]; if (!p.on) continue;
    if (Math.hypot(p.x - cx, p.z - cz) > reach * 0.8) continue;
    put(p.x, 0, p.z, 0.32, 0.32, p.h);
  }
  const zero = LOOK._zero || (LOOK._zero = new THREE.Matrix4().makeScale(0, 0, 0));
  for (let i = LOOK._i; i < LOOK.dyn; i++) mesh.setMatrixAt(i, zero);
  mesh.instanceMatrix.needsUpdate = true;
}

// KayKit City Builder Bits (CC0, Kay Lousberg) — withoutBase shops, baked by tools/bake_kaykit.py.
// OSM ids: 1069 Ti Sento -> A, 1209 west Rynek -> E, 1117 Istambul kebab -> G.
const KAY_SHOP = { 1069: 'A', 1209: 'E', 1117: 'G' };
const KAY = {};
// Shop meshes are decoded from the meshopt GLB (MESHOPT) before the city is built.
let kayMat = null;
function kayMaterial() {
  if (kayMat) return kayMat;
  const img = new Image();
  const tex = new THREE.Texture(img);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.flipY = false;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.anisotropy = 4;
  img.onload = () => { tex.needsUpdate = true; };
  img.src = 'data:image/png;base64,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';
  kayMat = mkMat({ map: tex, color: 0xfff1e4 });
  return kayMat;
}
function kayFit(b, spec) {
  const ring = b.ring, n = ring.length / 2, area = ringArea(ring);
  let best = null, bestScore = -1;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const x1 = ring[i * 2], z1 = ring[i * 2 + 1], x2 = ring[j * 2], z2 = ring[j * 2 + 1];
    const len = Math.hypot(x2 - x1, z2 - z1); if (len < 0.4) continue;
    let nx = (z2 - z1) / len, nz = -(x2 - x1) / len; if (area <= 0) { nx = -nx; nz = -nz; }
    const mx = (x1 + x2) * 0.5, mz = (z1 + z2) * 0.5;
    let road = 0;
    W.roadGrid.query(mx, mz, 22, (ri) => {
      const roadR = W.roads[W.roadGrid.meta[ri]];
      if (!roadR.drivable || roadR.bridge) return;
      const s = W.roadGrid.s;
      closestOnSeg(mx, mz, s[ri * 4], s[ri * 4 + 1], s[ri * 4 + 2], s[ri * 4 + 3], tmpC);
      const dx = tmpC.x - mx, dz = tmpC.z - mz, d = Math.hypot(dx, dz) || 1;
      if (dx * nx + dz * nz < 0.35 * d) return;
      road = Math.max(road, len / (2 + d));
    });
    const score = road > 0 ? road + len * 0.02 : len * 0.001;
    if (score > bestScore) { bestScore = score; best = { nx, nz, len }; }
  }
  const nx = best.nx, nz = best.nz, tx = -nz, tz = nx;
  let minT = 1e9, maxT = -1e9, minN = 1e9, maxN = -1e9;
  for (let i = 0; i < n; i++) {
    const x = ring[i * 2], z = ring[i * 2 + 1], t = x * tx + z * tz, nn = x * nx + z * nz;
    if (t < minT) minT = t; if (t > maxT) maxT = t; if (nn < minN) minN = nn; if (nn > maxN) maxN = nn;
  }
  const plotW = (maxT - minT) * 0.96, plotD = (maxN - minN) * 0.96;
  const base = 4.8, mw = spec.spanX, md = spec.spanZ;
  let fit = Math.min(plotW / (mw * base), plotD / (md * base));
  if (fit < 0.95) fit = 0.95; if (fit > 1.2) fit = 1.2;
  let sx = base * fit, sz = base * fit;
  if (mw * sx > plotW || md * sz > plotD) {
    sx = Math.min(sx, plotW / mw); sz = Math.min(sz, plotD / md);
    if (sx / sz > 1.25) sx = sz * 1.25; else if (sz / sx > 1.25) sz = sx * 1.25;
  }
  return { sx, sz, sy: base * fit, yaw: Math.atan2(nx, nz) };
}
function placeKayShops(scene) {
  const mat = kayMaterial();
  const hull = TOON ? hullMats().norm : null;
  for (const b of W.buildings) {
    if (!b.kay) continue;
    const spec = KAY[b.kay]; if (!spec) continue;
    const pose = kayFit(b, spec);
    const mesh = new THREE.Mesh(spec.geo, mat);
    mesh.castShadow = true; mesh.receiveShadow = true;
    mesh.position.set(b.cx, 0.02, b.cz);
    mesh.rotation.y = pose.yaw;
    mesh.scale.set(pose.sx, pose.sy, pose.sz);
    if (hull) mesh.add(new THREE.Mesh(spec.geo, hull));
    scene.add(mesh);
    b.kayPose = pose;
  }
}

// Kościół Wniebowzięcia NMP (dominikanie) przy Placu Bartosza Głowackiego.
// Pozycja z OSM: budynek kind=church przy landmarkzie „Kościół pw. Wniebowzięcia Najświętszej Maryi Panny”.
// Własny model komiksowy – nie korzysta z cudzych siatek.
function clockFaceTexture() {
  const c = document.createElement('canvas'); c.width = 128; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#f7f1e4'; g.beginPath(); g.arc(64, 64, 58, 0, Math.PI * 2); g.fill();
  g.lineWidth = 8; g.strokeStyle = '#2a211c'; g.stroke();
  g.lineWidth = 5; g.lineCap = 'round';
  for (let i = 0; i < 12; i++) {
    const a = i / 12 * Math.PI * 2;
    g.beginPath(); g.moveTo(64 + Math.sin(a) * 42, 64 - Math.cos(a) * 42); g.lineTo(64 + Math.sin(a) * 52, 64 - Math.cos(a) * 52); g.stroke();
  }
  g.lineWidth = 7; g.beginPath(); g.moveTo(64, 68); g.lineTo(64 + Math.sin(0.55) * 24, 64 - Math.cos(0.55) * 24); g.stroke();
  g.lineWidth = 4; g.beginPath(); g.moveTo(64, 68); g.lineTo(64 + Math.sin(-0.9) * 36, 64 - Math.cos(-0.9) * 36); g.stroke();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}
function churchSolid(geo, color) {
  const mesh = new THREE.Mesh(geo, mkMat({ color }));
  mesh.castShadow = true; mesh.receiveShadow = true;
  if (TOON) {
    if (!geo.attributes.hdir) addHdir(geo);
    mesh.add(new THREE.Mesh(geo, hullMats().small));
  }
  return mesh;
}
function churchCone(radius, height, color) {
  const geo = new THREE.ConeGeometry(radius, height, 8);
  geo.translate(0, height / 2, 0);
  const mesh = new THREE.Mesh(geo, mkMat({ color }));
  mesh.castShadow = true; mesh.receiveShadow = true;
  if (TOON) mesh.add(new THREE.Mesh(geo, hullMats().norm));
  return mesh;
}
function putBox(parent, w, h, d, color, x, y, z) {
  const mesh = churchSolid(new THREE.BoxGeometry(w, h, d), color);
  mesh.position.set(x, y, z); parent.add(mesh); return mesh;
}
function buildDominicanChurch(scene, ring, cx, cz) {
  let best = 0, hx = 0, hz = 1;
  const n = ring.length / 2;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const dx = ring[j * 2] - ring[i * 2], dz = ring[j * 2 + 1] - ring[i * 2 + 1];
    const L = Math.hypot(dx, dz);
    if (L > best) { best = L; hx = dx / L; hz = dz / L; }
  }
  const g = new THREE.Group();
  g.position.set(cx, 0, cz);
  g.rotation.y = Math.atan2(hx, hz);
  const wall = 0xf4efe4, roof = 0xc8442f, dark = 0x2a211c, stone = 0xd7c6a8;
  putBox(g, 11.5, 8.2, 22, wall, 0, 4.1, 2);
  const naveRoof = churchCone(6.4, 4.2, roof); naveRoof.scale.set(1, 1, 2.15); naveRoof.position.set(0, 8.2, 2); g.add(naveRoof);
  putBox(g, 6.6, 18.5, 6.6, wall, 0, 9.25, -11.2);
  putBox(g, 7.1, 0.7, 7.1, stone, 0, 18.6, -11.2);
  for (const face of [[0, 0, 1], [0, 0, -1], [1, 0, 0], [-1, 0, 0]]) {
    putBox(g, face[0] ? 0.35 : 1.7, 2.4, face[2] ? 0.35 : 1.7, dark, face[0] * 3.15, 15.6, -11.2 + face[2] * 3.15);
  }
  const faceTex = clockFaceTexture();
  const faceMat = new THREE.MeshBasicMaterial({ map: faceTex });
  for (const face of [[0, 0, 1], [0, 0, -1], [1, 0, 0], [-1, 0, 0]]) {
    const clock = new THREE.Mesh(new THREE.PlaneGeometry(2.15, 2.15), faceMat);
    clock.position.set(face[0] * 3.32, 12.4, -11.2 + face[2] * 3.32);
    if (face[0]) clock.rotation.y = face[0] > 0 ? Math.PI / 2 : -Math.PI / 2;
    if (face[2] < 0) clock.rotation.y = Math.PI;
    g.add(clock);
  }
  const spire = churchCone(2.5, 8.4, roof); spire.position.set(0, 19.1, -11.2); g.add(spire);
  putBox(g, 0.28, 2.4, 0.28, dark, 0, 28.2, -11.2);
  putBox(g, 1.5, 0.22, 0.22, dark, 0, 29.1, -11.2);
  putBox(g, 2.2, 3.4, 0.28, dark, 0, 1.7, -7.8);
  putBox(g, 1.15, 1.5, 0.2, 0x8ec5ea, -3.2, 4.6, -8.9);
  putBox(g, 1.15, 1.5, 0.2, 0x8ec5ea, 3.2, 4.6, -8.9);
  scene.add(g);
  W.visObjects.push({ obj: g, x: cx, z: cz, r: 28, bias: 120 });
  W.landmarkChurch = { name: 'Kościół Wniebowzięcia NMP', x: cx, z: cz, h: 34, landmark: 'kosciol-wniebowziecia' };
}


// ======================= ENTITIES =======================
function box(w, h, d, color, x, y, z, mat) {
  const geo = new THREE.BoxGeometry(w, h, d);
  const m = new THREE.Mesh(geo, mat || mkMat({ color }));
  m.position.set(x, y, z); m.castShadow = true;
  if (TOON && !box.noHull) { addHdir(geo); const hl = new THREE.Mesh(geo, hullMats().small); m.add(hl); }
  return m;
}
let walkerMatV = null;
function walkerMat() {
  if (!walkerMatV) walkerMatV = TOON ? mkMat({ vertexColors: true }) : new THREE.MeshLambertMaterial({ vertexColors: true });
  return walkerMatV;
}
function walkerMesh(specs) {
  const geo = mergeBoxes(specs);
  const m = new THREE.Mesh(geo, walkerMat()); m.castShadow = true;
  if (TOON) m.add(new THREE.Mesh(geo, hullMats().small));
  return m;
}
function makeWalker(opt = {}) {
  const g = new THREE.Group();
  const shirt = opt.shirt || 0xf2c218, pants = opt.pants || 0x2c3e66, skin = opt.skin || 0xe2b08c;
  const hair = opt.hair || 0x3a2a1c, belt = opt.belt || 0x1f5fbf, shoe = 0x2a211c;
  const style = opt.hairStyle || (opt.cap ? 'cap' : 'short');
  const accent = opt.cap || opt.accent || 0xe8503a;
  const body = new THREE.Group(); g.add(body);
  const specs = [
    [0.5, 0.62, 0.28, 0, 1.22, 0, shirt],
    [0.52, 0.08, 0.3, 0, 1.16, 0, belt],
    [0.3, 0.32, 0.3, 0, 1.68, 0, skin],
    [0.06, 0.045, 0.02, -0.07, 1.71, 0.155, shoe],
    [0.06, 0.045, 0.02, 0.07, 1.71, 0.155, shoe],
  ];
  if (style === 'long') specs.push([0.36, 0.38, 0.36, 0, 1.72, -0.03, hair], [0.22, 0.42, 0.14, 0, 1.4, -0.18, hair]);
  else if (style === 'bun') specs.push([0.32, 0.1, 0.32, 0, 1.86, 0, hair], [0.16, 0.14, 0.16, 0, 2.02, -0.04, hair]);
  else if (style === 'pony') specs.push([0.32, 0.12, 0.32, 0, 1.88, 0, hair], [0.12, 0.34, 0.12, 0, 1.5, -0.18, hair]);
  else if (style === 'cap') specs.push([0.28, 0.06, 0.28, 0, 1.84, 0, hair], [0.42, 0.1, 0.46, 0, 1.96, 0.06, accent]);
  else specs.push([0.34, 0.16, 0.34, 0, 1.9, 0, hair]);
  const comicWalker = !!opt.comic;
  if (comicWalker) specs.push([0.56, 0.1, 0.32, 0, 1.5, 0.04, 0xf7f1e4]);
  if (opt.jacket) specs.push([0.58, 0.48, 0.34, 0, 1.26, 0.02, opt.jacket]);
  if (opt.skirt) specs.push([0.56, 0.36, 0.4, 0, 0.9, 0, pants]);
  if (opt.bag) specs.push([0.24, 0.3, 0.14, 0, 1.28, -0.22, opt.bag === true ? accent : opt.bag]);
  body.add(walkerMesh(specs));
  const limb = (x, y, parts) => { const p = new THREE.Group(); p.position.set(x, y, 0); p.add(walkerMesh(parts)); body.add(p); return p; };
  const arm = [[0.14, 0.5, 0.14, 0, -0.25, 0, shirt], [0.13, 0.13, 0.13, 0, -0.56, 0, skin]];
  const leg = [[0.18, 0.74, 0.18, 0, -0.37, 0, pants], [0.2, 0.1, 0.3, 0, -0.78, 0.05, shoe]];
  const armL = limb(-0.33, 1.5, arm), armR = limb(0.33, 1.5, arm);
  const legL = limb(-0.13, 0.9, leg), legR = limb(0.13, 0.9, leg);
  g.userData = { body, armL, armR, legL, legR, phase: Math.random() * 6 };
  return g;
}
function animateWalker(w, speed, dt, air) {
  const u = w.userData;
  if (air) { u.armL.rotation.x = -2.6; u.armR.rotation.x = -2.6; u.legL.rotation.x = 0.5; u.legR.rotation.x = -0.3; u.body.position.y = 0; return; }
  if (speed > 0.2) {
    u.phase += dt * Math.max(speed, 1.2) * 2.05;
    const a = Math.sin(u.phase) * Math.min(1, speed / 3.2) * 0.95;
    u.legL.rotation.x = a; u.legR.rotation.x = -a; u.armL.rotation.x = -a * 0.82; u.armR.rotation.x = a * 0.82;
    u.body.position.y = Math.abs(Math.sin(u.phase)) * 0.055 * Math.min(1, speed / 3);
  } else {
    u.phase += dt * 1.7;
    const a = Math.sin(u.phase) * 0.07;
    u.armL.rotation.x = a; u.armR.rotation.x = -a * 0.65; u.legL.rotation.x = 0; u.legR.rotation.x = 0;
    u.body.position.y = Math.abs(Math.sin(u.phase * 0.5)) * 0.012;
  }
}

function wheelGeometry(WR, WW, offroad) {
  const wg = new THREE.CylinderGeometry(WR, WR, WW, TOON ? 12 : 14).rotateZ(Math.PI / 2);
  const parts = [[0, 0, 0, 0, 0, 0, '#1a1a1a', 0, wg]];
  if (TOON) {
    const rimCol = offroad ? '#e4efe0' : '#f4f1ea';
    const cap = new THREE.CylinderGeometry(WR * 0.2, WR * 0.2, WW + 0.16, 8).rotateZ(Math.PI / 2);
    parts.push([0, 0, 0, 0, 0, 0, '#2a211c', 0, cap]);
    for (const sign of [1, -1]) {
      const ring = new THREE.RingGeometry(WR * 0.22, WR * 0.66, 10);
      ring.rotateY(sign > 0 ? Math.PI / 2 : -Math.PI / 2);
      ring.translate(sign * (WW * 0.5 + 0.02), 0, 0);
      parts.push([0, 0, 0, 0, 0, 0, rimCol, 0, ring]);
      for (let i = 0; i < 5; i++) {
        const spoke = new THREE.BoxGeometry(0.05, WR * 0.42, WR * 0.12);
        spoke.translate(0, WR * 0.4, 0);
        spoke.rotateX(i / 5 * Math.PI * 2);
        spoke.translate(sign * (WW * 0.5 + 0.05), 0, 0);
        parts.push([0, 0, 0, 0, 0, 0, '#2a211c', 0, spoke]);
      }
    }
  } else {
    const hg = new THREE.CylinderGeometry(WR * 0.55, WR * 0.55, WW + 0.02, 8).rotateZ(Math.PI / 2);
    parts.push([0, 0, 0, 0, 0, 0, '#c4c4c4', 0, hg]);
  }
  return mergeBoxes(parts);
}
function finishCar(c, x, z, heading) {
  c.x = x; c.z = z; c.h = heading; c.vx = 0; c.vz = 0; c.steer = 0; c.spin = 0; c.yawRate = 0;
  c.y = groundH(x, z); c.vy = 0; c.pgh = c.y; c.air = false; c.sus = 0; c.susV = 0; c.pitch = 0; c.roll = 0;
  c.sync();
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
    const MD = opts.model || ''; if (MD === 'jeep') opts.offroad = true;
    this.offroad = !!opts.offroad; const OR = this.offroad; this.police = !!opts.police; this.scooter = !!opts.scooter; this.kind = opts.kind || '';
    this.model = MD || (this.scooter ? 'scooter' : OR ? 'jeep' : 'sedan');
    if (this.police) color = 0xf4f6fa;
    this.color = color; this.hp = 100; this.offs = this.scooter ? [-0.5, 0.5] : MD === 'hatch' ? [-1.05, 0, 1.05] : (MD === 'sport' || MD === 'muscle') ? [-1.4, 0, 1.4] : [-1.3, 0, 1.3]; this.rad = this.scooter ? 0.5 : 0.95;
    this.body = new THREE.Group(); this.g.add(this.body); const B = this.body;
    const lift = OR ? 0.32 : 0, DK = '#262626', GL = TOON ? '#41678c' : '#223344';
    let specs, heads, tails;
    if (typeof KIT !== 'undefined' && KIT[this.model]) { buildKitBody(this, color); finishCar(this, x, z, heading); return; }
    if (this.model === 'bus') { buildBusBody(this, color); finishCar(this, x, z, heading); return; }
    if (this.scooter) {
      specs = [[0.5, 0.14, 1.3, 0, 0.36, 0, color, 1], [0.42, 0.2, 0.7, 0, 0.62, -0.25, color, 1], [0.36, 0.08, 0.6, 0, 0.76, -0.25, DK], [0.14, 0.85, 0.14, 0, 0.78, 0.55, DK], [0.72, 0.07, 0.07, 0, 1.2, 0.55, DK], [0.5, 0.55, 0.22, 0, 0.62, 0.6, color, 1], [0.6, 0.34, 0.6, 0, 1.05, -0.62, '#f2c46a'], [0.62, 0.05, 0.62, 0, 1.23, -0.62, '#d2452f']];
      heads = [[0.22, 0.14, 0.05, 0, 0.98, 0.72]]; tails = [[0.2, 0.08, 0.05, 0, 0.62, -0.66]];
    } else if (MD === 'hatch') {
      specs = [[1.72, 0.6, 3.6, 0, 0.64, 0, color, 1], [1.74, 0.18, 3.62, 0, 0.36, 0, DK], [1.56, 0.6, 2.05, 0, 1.22, -0.4, GL], [1.48, 0.07, 1.85, 0, 1.55, -0.4, color, 1], [1.5, 0.08, 0.06, 0, 0.88, 1.8, '#d9d9d9'],
        [0.9, 0.2, 0.1, 0, 0.7, 1.86, DK], [0.34, 0.12, 0.22, -1.08, 1.12, 0.4, DK], [0.34, 0.12, 0.22, 1.08, 1.12, 0.4, DK], [1.35, 0.16, 0.32, 0, 1.64, -1.48, DK],
        [0.48, 0.28, 0.05, -0.55, 0.72, 1.74, DK], [0.48, 0.28, 0.05, 0.55, 0.72, 1.74, DK], [0.38, 0.42, 0.05, -0.62, 0.86, -1.74, DK], [0.38, 0.42, 0.05, 0.62, 0.86, -1.74, DK]];
      heads = [[0.36, 0.18, 0.05, -0.55, 0.72, 1.81], [0.36, 0.18, 0.05, 0.55, 0.72, 1.81]]; tails = [[0.26, 0.3, 0.05, -0.62, 0.86, -1.81], [0.26, 0.3, 0.05, 0.62, 0.86, -1.81], [0.55, 0.08, 0.06, 0, 1.74, -1.66]];
    } else if (MD === 'sport') {
      this.stripe = 0xf4f1ea;
      specs = [[1.92, 0.44, 4.4, 0, 0.54, 0, color, 1], [1.94, 0.16, 4.42, 0, 0.32, 0, DK], [1.6, 0.42, 1.8, 0, 0.97, -0.35, GL], [1.5, 0.06, 1.5, 0, 1.2, -0.4, color, 1], [0.5, 0.02, 4.42, 0, 0.77, 0, '#f4f1ea', 2],
        [1.84, 0.07, 0.42, 0, 1.1, -2.0, DK], [0.08, 0.32, 0.1, -0.6, 0.9, -2.0, DK], [0.08, 0.32, 0.1, 0.6, 0.9, -2.0, DK], [1.7, 0.1, 0.14, 0, 0.4, 2.24, DK],
        [1.1, 0.18, 0.1, 0, 0.58, 2.34, DK], [0.32, 0.14, 0.24, -1.16, 0.98, 0.2, DK], [0.32, 0.14, 0.24, 1.16, 0.98, 0.2, DK],
        [0.18, 0.14, 0.32, -0.5, 0.4, -2.38, DK], [0.18, 0.14, 0.32, 0.5, 0.4, -2.38, DK],
        [0.08, 0.12, 2.0, -1.02, 0.3, 0, DK], [0.08, 0.12, 2.0, 1.02, 0.3, 0, DK],
        [0.56, 0.2, 0.05, -0.62, 0.62, 2.14, DK], [0.56, 0.2, 0.05, 0.62, 0.62, 2.14, DK]];
      heads = [[0.44, 0.1, 0.05, -0.62, 0.62, 2.21], [0.44, 0.1, 0.05, 0.62, 0.62, 2.21]]; tails = [[0.5, 0.1, 0.05, -0.55, 0.66, -2.21], [0.5, 0.1, 0.05, 0.55, 0.66, -2.21], [0.7, 0.08, 0.06, 0, 0.84, -2.26]];
    } else if (MD === 'muscle') {
      this.stripe = 0xf4f1ea;
      specs = [[1.96, 0.6, 4.5, 0, 0.64, 0, color, 1], [1.98, 0.18, 4.52, 0, 0.36, 0, DK], [1.66, 0.48, 1.95, 0, 1.18, -0.5, GL], [1.56, 0.06, 1.75, 0, 1.45, -0.5, color, 1], [0.7, 0.18, 1.0, 0, 1.02, 1.2, DK],
        [0.3, 0.02, 4.52, -0.3, 0.945, 0, '#f4f1ea', 2], [0.3, 0.02, 4.52, 0.3, 0.945, 0, '#f4f1ea', 2], [2.0, 0.14, 0.12, 0, 0.5, 2.27, '#d9d9d9'], [2.0, 0.14, 0.12, 0, 0.5, -2.27, '#d9d9d9'],
        [1.2, 0.24, 0.1, 0, 0.78, 2.36, DK], [0.32, 0.12, 0.24, -1.18, 1.15, 0.15, DK], [0.32, 0.12, 0.24, 1.18, 1.15, 0.15, DK],
        [0.2, 0.16, 0.34, -0.62, 0.4, -2.46, DK], [0.2, 0.16, 0.34, 0.62, 0.4, -2.46, DK],
        [0.42, 0.3, 0.05, -0.68, 0.72, 2.2, DK], [0.42, 0.3, 0.05, 0.68, 0.72, 2.2, DK]];
      heads = [[0.3, 0.2, 0.05, -0.68, 0.72, 2.26], [0.3, 0.2, 0.05, 0.68, 0.72, 2.26]]; tails = [[0.6, 0.12, 0.05, -0.5, 0.74, -2.26], [0.6, 0.12, 0.05, 0.5, 0.74, -2.26]];
    } else if (!OR) {
      specs = [[1.8, 0.55, 4.2, 0, 0.62, 0, color, 1], [1.82, 0.18, 4.22, 0, 0.36, 0, DK], [1.6, 0.55, 2.1, 0, 1.17, -0.25, GL], [1.5, 0.06, 1.9, 0, 1.47, -0.25, color, 1], [1.62, 0.08, 0.06, 0, 0.88, 2.1, '#d9d9d9'],
        [0.95, 0.22, 0.1, 0, 0.72, 2.18, DK], [0.3, 0.12, 0.24, -1.08, 1.18, 0.3, DK], [0.3, 0.12, 0.24, 1.08, 1.18, 0.3, DK], [1.4, 0.1, 0.22, 0, 0.96, -2.02, color, 1],
        [0.52, 0.26, 0.05, -0.6, 0.68, 2.04, DK], [0.52, 0.26, 0.05, 0.6, 0.68, 2.04, DK]];
      if (this.police) { specs.push([1.84, 0.16, 4.24, 0, 0.66, 0, '#1f55c8', 2], [0.9, 0.1, 0.5, 0, 1.53, -0.25, DK]); }
      if (this.kind === 'taxi') specs.push([0.7, 0.22, 0.32, 0, 1.6, -0.25, '#ffd21f']);
      heads = [[0.4, 0.16, 0.05, -0.6, 0.68, 2.11], [0.4, 0.16, 0.05, 0.6, 0.68, 2.11]]; tails = [[0.4, 0.14, 0.05, -0.6, 0.7, -2.11], [0.4, 0.14, 0.05, 0.6, 0.7, -2.11], [0.4, 0.05, 0.04, 0, 1.42, -2.02]];
    } else {
      const sp = new THREE.CylinderGeometry(0.42, 0.42, 0.26, 14).rotateX(Math.PI / 2);
      specs = [[1.9, 0.7, 4.1, 0, 0.75 + lift, 0, color, 1], [1.94, 0.2, 4.14, 0, 0.42 + lift, 0, DK], [1.8, 0.72, 2.3, 0, 1.46 + lift, -0.45, GL], [1.84, 0.08, 2.36, 0, 1.86 + lift, -0.45, color, 1], [1.7, 0.08, 2.0, 0, 2.02 + lift, -0.45, DK],
        [0.06, 0.16, 2.0, -0.82, 1.95 + lift, -0.45, DK], [0.06, 0.16, 2.0, 0.82, 1.95 + lift, -0.45, DK], [0, 0, 0, 0, 1.0 + lift, -2.2, DK, 0, sp], [1.7, 0.1, 0.1, 0, 0.55 + lift, 2.22, DK], [0.1, 0.6, 0.1, -0.55, 0.8 + lift, 2.2, DK], [0.1, 0.6, 0.1, 0.55, 0.8 + lift, 2.2, DK],
        [0.34, 0.14, 0.28, -1.22, 1.55 + lift, 0.1, DK], [0.34, 0.14, 0.28, 1.22, 1.55 + lift, 0.1, DK]];
      heads = [[0.34, 0.2, 0.05, -0.62, 0.92 + lift, 2.06], [0.34, 0.2, 0.05, 0.62, 0.92 + lift, 2.06], [1.5, 0.12, 0.05, 0, 1.92 + lift, 0.66]]; tails = [[0.3, 0.16, 0.05, -0.62, 0.9 + lift, -2.06], [0.3, 0.16, 0.05, 0.62, 0.9 + lift, -2.06]];
    }
    this.geo = mergeBoxes(specs);
    const bm = new THREE.Mesh(this.geo, carMat()); bm.castShadow = true; B.add(bm); this.bodyMesh = bm;
    if (TOON) { this.hull = new THREE.Mesh(this.geo, hullMats().box); B.add(this.hull); }
    this.headMat = mkMat({ color: 0xfff6d8, emissive: 0xfff2c0, emissiveIntensity: 0.2 });
    this.tailMat = mkMat({ color: 0x990000, emissive: 0xff1010, emissiveIntensity: 0.3 });
    const headM = new THREE.Mesh(mergeBoxes(heads.map((h) => [...h, '#ffffff'])), this.headMat);
    const tailM = new THREE.Mesh(mergeBoxes(tails.map((h) => [...h, '#ffffff'])), this.tailMat);
    B.add(headM); B.add(tailM); this.lamps = [headM, tailM];
    if (this.police) {
      this.lbR = new THREE.MeshBasicMaterial({ color: 0x661111 }); this.lbB = new THREE.MeshBasicMaterial({ color: 0x112266 });
      const r = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.16, 0.36), this.lbR); r.position.set(-0.23, 1.62, -0.25); B.add(r);
      const b2 = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.16, 0.36), this.lbB); b2.position.set(0.23, 1.62, -0.25); B.add(b2);
    }
    this.wheels = [];
    const WR = this.scooter ? 0.27 : (OR ? 0.5 : 0.36), WW = this.scooter ? 0.14 : (OR ? 0.36 : 0.26); this.wr = WR;
    const key = WR + '_' + WW + '_' + TOON + '_' + (OR ? 1 : 0);
    Car.wheelGeo = Car.wheelGeo || {};
    if (!Car.wheelGeo[key]) Car.wheelGeo[key] = wheelGeometry(WR, WW, OR);
    const TX = OR ? 0.98 : (MD === 'sport' || MD === 'muscle') ? 0.9 : 0.86, TZ = OR ? 1.38 : MD === 'hatch' ? 1.12 : (MD === 'sport' || MD === 'muscle') ? 1.45 : 1.35;
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
    finishCar(this, x, z, heading);
  }
  setPaint(color) { if (this.police) return; this.color = color; recolorTag(this.geo, 1, color); }
  circles() { const fx = Math.sin(this.h), fz = Math.cos(this.h); return this.offs.map((o) => [this.x + fx * o, this.z + fz * o]); }
  sync() { this.g.position.set(this.x, this.y || 0, this.z); this.g.rotation.y = this.h; }
  get speed() { return Math.hypot(this.vx, this.vz); }
  get forwardSpeed() { return this.vx * Math.sin(this.h) + this.vz * Math.cos(this.h); }
}
// Emissive lamps only — no extra realtime light per traffic car. Intensity changes when the state changes.
function carLights(c, braking) {
  if (!c || !c.headMat) return;
  const n = !!G.night;
  const head = n ? (c === activeCar ? 3.4 : 2.3) : 0.12;
  const tail = braking ? (n ? 4.6 : 2.1) : (n ? 1.25 : 0.22);
  if (c._hl !== head) { c._hl = head; c.headMat.emissiveIntensity = head; }
  if (c._tl !== tail) { c._tl = tail; c.tailMat.emissiveIntensity = tail; }
}

// circle-vs-segment collision push for buildings; returns impact normal speed info
function collideCircle(x, z, r, out, withTrees, buildings = true) {
  let px = x, pz = z, hit = false, nxs = 0, nzs = 0;
  for (let it = 0; it < 3; it++) {
    let moved = false; const s = W.bGrid.s;
    if (buildings) W.bGrid.query(px, pz, r + 0.5, (i) => {
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
  const geo = new THREE.SphereGeometry(4500, 48, 24);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: new THREE.Color() }, bottom: { value: new THREE.Color() }, sunDir: { value: new THREE.Vector3(0, 1, 0) }, sunCol: { value: new THREE.Color() }, night: { value: 0 } },
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); vec4 p = modelViewMatrix*vec4(position,1.0); gl_Position = projectionMatrix*p; gl_Position.z = gl_Position.w*0.9999; }',
    fragmentShader: `uniform vec3 top; uniform vec3 bottom; uniform vec3 sunDir; uniform vec3 sunCol; uniform float night; varying vec3 vP;
      float h(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,45.164)))*43758.5453); }
      void main(){ vec3 p = normalize(vP); float t = clamp(p.y*1.15+0.08,0.0,1.0); vec3 c = mix(bottom, top, pow(t,0.85));
        float hz = smoothstep(0.42, -0.02, p.y);
        c = mix(c, mix(vec3(0.90, 0.94, 0.86), bottom, night), hz * 0.62);
        float s = max(dot(p, normalize(sunDir)),0.0);
        float ang = acos(clamp(s, 0.0, 1.0));
        c += sunCol * smoothstep(0.07, 0.012, ang) * 0.7;
        if(night>0.5 && p.y>0.05){ vec3 q = floor(p*300.0); float st = step(0.9975, h(q)); c += vec3(st)*0.9; }
        gl_FragColor = vec4(c,1.0);
        ${TOON ? '#include <colorspace_fragment>' : ''} }`,
  });
  const m = new THREE.Mesh(geo, mat); m.frustumCulled = false; m.renderOrder = -1; scene.add(m);
  return m;
}

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

// MESHOPT assets. Built by tools/compress_meshopt.mjs (glTF-Transform + meshoptimizer, MIT).
// before kit+kay js 331736 bytes, uncompressed glb 613512, meshopt glb 152880.
const MESHOPT_GLB = "Z2xURgIAAAAwVQIA8FMAAEpTT057ImFzc2V0Ijp7ImdlbmVyYXRvciI6ImdsVEYtVHJhbnNmb3JtIHY0LjEuMSIsInZlcnNpb24iOiIyLjAifSwiYWNjZXNzb3JzIjpbeyJuYW1lIjoia2hhdGNoX2kiLCJ0eXBlIjoiU0NBTEFSIiwiY29tcG9uZW50VHlwZSI6NTEyMywiY291bnQiOjIyODAsIm5vcm1hbGl6ZWQiOmZhbHNlLCJieXRlT2Zmc2V0IjowLCJidWZmZXJWaWV3IjowfSx7Im5hbWUiOiJraGF0Y2hfdCIsInR5cGUiOiJTQ0FMQVIiLCJjb21wb25lbnRUeXBlIjo1MTI2LCJjb3VudCI6MTE3NCwibm9ybWFsaXplZCI6ZmFsc2UsImJ5dGVPZmZzZXQiOjAsImJ1ZmZlclZpZXciOjF9LHsibmFtZSI6ImtzZWRhbl9pIiwidHlwZSI6IlNDQUxBUiIsImNvbXBvbmVudFR5cGUiOjUxMjMsImNvdW50IjoyMTEyLCJub3JtYWxpemVkIjpmYWxzZSwiYnl0ZU9mZnNldCI6NDU2MCwiYnVmZmVyVmlldyI6MH0seyJuYW1lIjoia3NlZGFuX3QiLCJ0eXBlIjoiU0NBTEFSIiwiY29tcG9uZW50VHlwZSI6NTEyNiwiY291bnQiOjEwNzIsIm5vcm1hbGl6ZWQiOmZhbHNlLCJieXRlT2Zmc2V0IjowLCJidWZmZXJWaWV3IjoyfSx7Im5hbWUiOiJrdmFuX2kiLCJ0eXBlIjoiU0NBTEFSIiwiY29tcG9uZW50VHlwZSI6NTEyMywiY291bnQiOjIyNjIsIm5vcm1hbGl6ZWQiOmZhbHNlLCJieXRlT2Zmc2V0Ijo4Nzg0LCJidWZmZXJWaWV3IjowfSx7Im5hbWUiOiJrdmFuX3QiLCJ0eXBlIjoiU0NBTEFSIiwiY29tcG9uZW50VHlwZSI6NTEyNiwiY291bnQiOjExMzgsIm5vcm1hbGl6ZWQiOmZhbHNlLCJieXRlT2Zmc2V0IjowLCJidWZmZXJWaWV3IjozfSx7Im5hbWUiOiJrcGlja3VwX2kiLCJ0eXBlIjoiU0NBTEFSIiwiY29tcG9uZW50VHlwZSI6NTEyMywiY291bnQiOjIzMjgsIm5vcm1hbGl6ZWQiOmZhbHNlLCJieXRlT2Zmc2V0IjoxMzMwOCwiYnVmZmVyVmlldyI6MH0seyJuYW1lIjoia3BpY2t1cF90IiwidHlwZSI6IlNDQUxBUiIsImNvbXBvbmVudFR5cGUiOjUxMjYsImNvdW50IjoxMTgwLCJub3JtYWxpemVkIjpmYWxzZSwiYnl0ZU9mZnNldCI6MCwiYnVmZmVyVmlldyI6NH0seyJuYW1lIjoia3RydWNrX2kiLCJ0eXBlIjoiU0NBTEFSIiwiY29tcG9uZW50VHlwZSI6NTEyMywiY291bnQiOjIyNjIsIm5vcm1hbGl6ZWQiOmZhbHNlLCJieXRlT2Zmc2V0IjoxNzk2NCwiYnVmZmVyVmlldyI6MH0seyJuYW1lIjoia3RydWNrX3QiLCJ0eXBlIjoiU0NBTEFSIiwiY29tcG9uZW50VHlwZSI6NTEyNiwiY291bnQiOjExNTIsIm5vcm1hbGl6ZWQiOmZhbHNlLCJieXRlT2Zmc2V0IjowLCJidWZmZXJWaWV3Ijo1fSx7Im5hbWUiOiJrdGF4aV9pIiwidHlwZSI6IlNDQUxBUiIsImNvbXBvbmVudFR5cGUiOjUxMjMsImNvdW50IjoyMjMyLCJub3JtYWxpemVkIjpmYWxzZSwiYnl0ZU9mZnNldCI6MjI0ODgsImJ1ZmZlclZpZXciOjB9LHsibmFtZSI6Imt0YXhpX3QiLCJ0eXBlIjoiU0NBTEFSIiwiY29tcG9uZW50VHlwZSI6NTEyNiwiY291bnQiOjExMzgsIm5vcm1hbGl6ZWQiOmZhbHNlLCJieXRlT2Zmc2V0IjowLCJidWZmZXJWaWV3Ijo2fSx7Im5hbWUiOiJrcG9saWNlX2kiLCJ0eXBlIjoiU0NBTEFSIiwiY29tcG9uZW50VHlwZSI6NTEyMywiY291bnQiOjIyMDgsIm5vcm1hbGl6ZWQiOmZhbHNlLCJieXRlT2Zmc2V0IjoyNjk1MiwiYnVmZmVyVmlldyI6MH0seyJuYW1lIjoia3BvbGljZV90IiwidHlwZSI6IlNDQUxBUiIsImNvbXBvbmVudFR5cGUiOjUxMjYsImNvdW50IjoxMTIwLCJub3JtYWxpemVkIjpmYWxzZSwiYnl0ZU9mZnNldCI6MCwiYnVmZmVyVmlldyI6N30seyJuYW1lIjoia2FtYnVsYW5jZV9pIiwidHlwZSI6IlNDQUxBUiIsImNvbXBvbmVudFR5cGUiOjUxMjMsImNvdW50IjozMTMyLCJub3JtYWxpemVkIjpmYWxzZSwiYnl0ZU9mZnNldCI6MzEzNjgsImJ1ZmZlclZpZXciOjB9LHsibmFtZSI6ImthbWJ1bGFuY2VfdCIsInR5cGUiOiJTQ0FMQVIiLCJjb21wb25lbnRUeXBlIjo1MTI2LCJjb3VudCI6MTU2NCwibm9ybWFsaXplZCI6ZmFsc2UsImJ5dGVPZmZzZXQiOjAsImJ1ZmZlclZpZXciOjh9LHsibmFtZSI6ImtheUFfaSIsInR5cGUiOiJTQ0FMQVIiLCJjb21wb25lbnRUeXBlIjo1MTIzLCJjb3VudCI6MTMwNSwibm9ybWFsaXplZCI6ZmFsc2UsImJ5dGVPZmZzZXQiOjM3NjMyLCJidWZmZXJWaWV3IjowfSx7Im5hbWUiOiJrYXlFX2kiLCJ0eXBlIjoiU0NBTEFSIiwiY29tcG9uZW50VHlwZSI6NTEyMywiY291bnQiOjI4NTAsIm5vcm1hbGl6ZWQiOmZhbHNlLCJieXRlT2Zmc2V0Ijo0MDI0MiwiYnVmZmVyVmlldyI6MH0seyJuYW1lIjoia2F5R19pIiwidHlwZSI6IlNDQUxBUiIsImNvbXBvbmVudFR5cGUiOjUxMjMsImNvdW50IjozMTU5LCJub3JtYWxpemVkIjpmYWxzZSwiYnl0ZU9mZnNldCI6NDU5NDIsImJ1ZmZlclZpZXciOjB9LHsibmFtZSI6ImtidXNfaSIsInR5cGUiOiJTQ0FMQVIiLCJjb21wb25lbnRUeXBlIjo1MTIzLCJjb3VudCI6MjUyLCJub3JtYWxpemVkIjpmYWxzZSwiYnl0ZU9mZnNldCI6NTIyNjAsImJ1ZmZlclZpZXciOjB9LHsibmFtZSI6ImtidXNfdCIsInR5cGUiOiJTQ0FMQVIiLCJjb21wb25lbnRUeXBlIjo1MTI2LCJjb3VudCI6MTY4LCJub3JtYWxpemVkIjpmYWxzZSwiYnl0ZU9mZnNldCI6MCwiYnVmZmVyVmlldyI6OX0seyJuYW1lIjoia2hhdGNoX3AiLCJ0eXBlIjoiVkVDMyIsImNvbXBvbmVudFR5cGUiOjUxMjIsImNvdW50IjoxMTc0LCJtYXgiOlsxNDk0NSwxMDkyMSwzMjc2N10sIm1pbiI6Wy0xNDk0NSwtMTA5MjEsLTMyNzY3XSwibm9ybWFsaXplZCI6dHJ1ZSwiYnl0ZU9mZnNldCI6MCwiYnVmZmVyVmlldyI6MTB9LHsibmFtZSI6ImtoYXRjaF9uIiwidHlwZSI6IlZFQzMiLCJjb21wb25lbnRUeXBlIjo1MTIyLCJjb3VudCI6MTE3NCwibm9ybWFsaXplZCI6dHJ1ZSwiYnl0ZU9mZnNldCI6MCwiYnVmZmVyVmlldyI6MTF9LHsibmFtZSI6ImtoYXRjaF9jIiwidHlwZSI6IlZFQzMiLCJjb21wb25lbnRUeXBlIjo1MTIxLCJjb3VudCI6MTE3NCwibm9ybWFsaXplZCI6dHJ1ZSwiYnl0ZU9mZnNldCI6MCwiYnVmZmVyVmlldyI6MTJ9LHsibmFtZSI6ImtzZWRhbl9wIiwidHlwZSI6IlZFQzMiLCJjb21wb25lbnRUeXBlIjo1MTIyLCJjb3VudCI6MTA3MiwibWF4IjpbMTkyNzQsMTQ3NzcsMzI3NjddLCJtaW4iOlstMTkyNzQsLTE0Nzc3LC0zMjc2N10sIm5vcm1hbGl6ZWQiOnRydWUsImJ5dGVPZmZzZXQiOjAsImJ1ZmZlclZpZXciOjEzfSx7Im5hbWUiOiJrc2VkYW5fbiIsInR5cGUiOiJWRUMzIiwiY29tcG9uZW50VHlwZSI6NTEyMiwiY291bnQiOjEwNzIsIm5vcm1hbGl6ZWQiOnRydWUsImJ5dGVPZmZzZXQiOjAsImJ1ZmZlclZpZXciOjE0fSx7Im5hbWUiOiJrc2VkYW5fYyIsInR5cGUiOiJWRUMzIiwiY29tcG9uZW50VHlwZSI6NTEyMSwiY291bnQiOjEwNzIsIm5vcm1hbGl6ZWQiOnRydWUsImJ5dGVPZmZzZXQiOjAsImJ1ZmZlclZpZXciOjE1fSx7Im5hbWUiOiJrdmFuX3AiLCJ0eXBlIjoiVkVDMyIsImNvbXBvbmVudFR5cGUiOjUxMjIsImNvdW50IjoxMTM4LCJtYXgiOlsxNzg3NCwxNDI5NywzMjc2N10sIm1pbiI6Wy0xNzg3NCwtMTQyOTcsLTMyNzY3XSwibm9ybWFsaXplZCI6dHJ1ZSwiYnl0ZU9mZnNldCI6MCwiYnVmZmVyVmlldyI6MTZ9LHsibmFtZSI6Imt2YW5fbiIsInR5cGUiOiJWRUMzIiwiY29tcG9uZW50VHlwZSI6NTEyMiwiY291bnQiOjExMzgsIm5vcm1hbGl6ZWQiOnRydWUsImJ5dGVPZmZzZXQiOjAsImJ1ZmZlclZpZXciOjE3fSx7Im5hbWUiOiJrdmFuX2MiLCJ0eXBlIjoiVkVDMyIsImNvbXBvbmVudFR5cGUiOjUxMjEsImNvdW50IjoxMTM4LCJub3JtYWxpemVkIjp0cnVlLCJieXRlT2Zmc2V0IjowLCJidWZmZXJWaWV3IjoxOH0seyJuYW1lIjoia3BpY2t1cF9wIiwidHlwZSI6IlZFQzMiLCJjb21wb25lbnRUeXBlIjo1MTIyLCJjb3VudCI6MTE4MCwibWF4IjpbMTc5MDYsMTM3MjUsMzI3NjddLCJtaW4iOlstMTc5MDYsLTEzNzI1LC0zMjc2N10sIm5vcm1hbGl6ZWQiOnRydWUsImJ5dGVPZmZzZXQiOjAsImJ1ZmZlclZpZXciOjE5fSx7Im5hbWUiOiJrcGlja3VwX24iLCJ0eXBlIjoiVkVDMyIsImNvbXBvbmVudFR5cGUiOjUxMjIsImNvdW50IjoxMTgwLCJub3JtYWxpemVkIjp0cnVlLCJieXRlT2Zmc2V0IjowLCJidWZmZXJWaWV3IjoyMH0seyJuYW1lIjoia3BpY2t1cF9jIiwidHlwZSI6IlZFQzMiLCJjb21wb25lbnRUeXBlIjo1MTIxLCJjb3VudCI6MTE4MCwibm9ybWFsaXplZCI6dHJ1ZSwiYnl0ZU9mZnNldCI6MCwiYnVmZmVyVmlldyI6MjF9LHsibmFtZSI6Imt0cnVja19wIiwidHlwZSI6IlZFQzMiLCJjb21wb25lbnRUeXBlIjo1MTIyLCJjb3VudCI6MTE1MiwibWF4IjpbMTY2NjIsMTI3NzMsMzI3NjddLCJtaW4iOlstMTY2NjIsLTEyNzczLC0zMjc2N10sIm5vcm1hbGl6ZWQiOnRydWUsImJ5dGVPZmZzZXQiOjAsImJ1ZmZlclZpZXciOjIyfSx7Im5hbWUiOiJrdHJ1Y2tfbiIsInR5cGUiOiJWRUMzIiwiY29tcG9uZW50VHlwZSI6NTEyMiwiY291bnQiOjExNTIsIm5vcm1hbGl6ZWQiOnRydWUsImJ5dGVPZmZzZXQiOjAsImJ1ZmZlclZpZXciOjIzfSx7Im5hbWUiOiJrdHJ1Y2tfYyIsInR5cGUiOiJWRUMzIiwiY29tcG9uZW50VHlwZSI6NTEyMSwiY291bnQiOjExNTIsIm5vcm1hbGl6ZWQiOnRydWUsImJ5dGVPZmZzZXQiOjAsImJ1ZmZlclZpZXciOjI0fSx7Im5hbWUiOiJrdGF4aV9wIiwidHlwZSI6IlZFQzMiLCJjb21wb25lbnRUeXBlIjo1MTIyLCJjb3VudCI6MTEzOCwibWF4IjpbMTc4NzQsMTYwODUsMzI3NjddLCJtaW4iOlstMTc4NzQsLTE2MDg1LC0zMjc2N10sIm5vcm1hbGl6ZWQiOnRydWUsImJ5dGVPZmZzZXQiOjAsImJ1ZmZlclZpZXciOjI1fSx7Im5hbWUiOiJrdGF4aV9uIiwidHlwZSI6IlZFQzMiLCJjb21wb25lbnRUeXBlIjo1MTIyLCJjb3VudCI6MTEzOCwibm9ybWFsaXplZCI6dHJ1ZSwiYnl0ZU9mZnNldCI6MCwiYnVmZmVyVmlldyI6MjZ9LHsibmFtZSI6Imt0YXhpX2MiLCJ0eXBlIjoiVkVDMyIsImNvbXBvbmVudFR5cGUiOjUxMjEsImNvdW50IjoxMTM4LCJub3JtYWxpemVkIjp0cnVlLCJieXRlT2Zmc2V0IjowLCJidWZmZXJWaWV3IjoyN30seyJuYW1lIjoia3BvbGljZV9wIiwidHlwZSI6IlZFQzMiLCJjb21wb25lbnRUeXBlIjo1MTIyLCJjb3VudCI6MTEyMCwibWF4IjpbMTY5NTAsMTI0MjksMzI3NjddLCJtaW4iOlstMTY5NTAsLTEyNDI5LC0zMjc2N10sIm5vcm1hbGl6ZWQiOnRydWUsImJ5dGVPZmZzZXQiOjAsImJ1ZmZlclZpZXciOjI4fSx7Im5hbWUiOiJrcG9saWNlX24iLCJ0eXBlIjoiVkVDMyIsImNvbXBvbmVudFR5cGUiOjUxMjIsImNvdW50IjoxMTIwLCJub3JtYWxpemVkIjp0cnVlLCJieXRlT2Zmc2V0IjowLCJidWZmZXJWaWV3IjoyOX0seyJuYW1lIjoia3BvbGljZV9jIiwidHlwZSI6IlZFQzMiLCJjb21wb25lbnRUeXBlIjo1MTIxLCJjb3VudCI6MTEyMCwibm9ybWFsaXplZCI6dHJ1ZSwiYnl0ZU9mZnNldCI6MCwiYnVmZmVyVmlldyI6MzB9LHsibmFtZSI6ImthbWJ1bGFuY2VfcCIsInR5cGUiOiJWRUMzIiwiY29tcG9uZW50VHlwZSI6NTEyMiwiY291bnQiOjE1NjQsIm1heCI6WzE1MTIxLDE2MTMzLDMyNzY3XSwibWluIjpbLTE1MTIxLC0xNjEzMywtMzI3NjddLCJub3JtYWxpemVkIjp0cnVlLCJieXRlT2Zmc2V0IjowLCJidWZmZXJWaWV3IjozMX0seyJuYW1lIjoia2FtYnVsYW5jZV9uIiwidHlwZSI6IlZFQzMiLCJjb21wb25lbnRUeXBlIjo1MTIyLCJjb3VudCI6MTU2NCwibm9ybWFsaXplZCI6dHJ1ZSwiYnl0ZU9mZnNldCI6MCwiYnVmZmVyVmlldyI6MzJ9LHsibmFtZSI6ImthbWJ1bGFuY2VfYyIsInR5cGUiOiJWRUMzIiwiY29tcG9uZW50VHlwZSI6NTEyMSwiY291bnQiOjE1NjQsIm5vcm1hbGl6ZWQiOnRydWUsImJ5dGVPZmZzZXQiOjAsImJ1ZmZlclZpZXciOjMzfSx7Im5hbWUiOiJrYXlBX3AiLCJ0eXBlIjoiVkVDMyIsImNvbXBvbmVudFR5cGUiOjUxMjIsImNvdW50Ijo4MTksIm1heCI6WzI1NTExLDMyNzY3LDMwNjUxXSwibWluIjpbLTI1NTExLC0zMjc2NywtMzA2NTFdLCJub3JtYWxpemVkIjp0cnVlLCJieXRlT2Zmc2V0IjowLCJidWZmZXJWaWV3IjozNH0seyJuYW1lIjoia2F5QV9uIiwidHlwZSI6IlZFQzMiLCJjb21wb25lbnRUeXBlIjo1MTIyLCJjb3VudCI6ODE5LCJub3JtYWxpemVkIjp0cnVlLCJieXRlT2Zmc2V0IjowLCJidWZmZXJWaWV3IjozNX0seyJuYW1lIjoia2F5QV91IiwidHlwZSI6IlZFQzIiLCJjb21wb25lbnRUeXBlIjo1MTIzLCJjb3VudCI6ODE5LCJub3JtYWxpemVkIjp0cnVlLCJieXRlT2Zmc2V0IjowLCJidWZmZXJWaWV3IjozNn0seyJuYW1lIjoia2F5RV9wIiwidHlwZSI6IlZFQzMiLCJjb21wb25lbnRUeXBlIjo1MTIyLCJjb3VudCI6MTc2MiwibWF4IjpbMjkyMjMsMzI3NjcsMjExMThdLCJtaW4iOlstMjkyMjMsLTMyNzY3LC0yMTExOF0sIm5vcm1hbGl6ZWQiOnRydWUsImJ5dGVPZmZzZXQiOjAsImJ1ZmZlclZpZXciOjM3fSx7Im5hbWUiOiJrYXlFX24iLCJ0eXBlIjoiVkVDMyIsImNvbXBvbmVudFR5cGUiOjUxMjIsImNvdW50IjoxNzYyLCJub3JtYWxpemVkIjp0cnVlLCJieXRlT2Zmc2V0IjowLCJidWZmZXJWaWV3IjozOH0seyJuYW1lIjoia2F5RV91IiwidHlwZSI6IlZFQzIiLCJjb21wb25lbnRUeXBlIjo1MTIzLCJjb3VudCI6MTc2Miwibm9ybWFsaXplZCI6dHJ1ZSwiYnl0ZU9mZnNldCI6MCwiYnVmZmVyVmlldyI6Mzl9LHsibmFtZSI6ImtheUdfcCIsInR5cGUiOiJWRUMzIiwiY29tcG9uZW50VHlwZSI6NTEyMiwiY291bnQiOjE5NTUsIm1heCI6WzI5MjIzLDMyNzY3LDIxMTE4XSwibWluIjpbLTI5MjIzLC0zMjc2NywtMjExMThdLCJub3JtYWxpemVkIjp0cnVlLCJieXRlT2Zmc2V0IjowLCJidWZmZXJWaWV3Ijo0MH0seyJuYW1lIjoia2F5R19uIiwidHlwZSI6IlZFQzMiLCJjb21wb25lbnRUeXBlIjo1MTIyLCJjb3VudCI6MTk1NSwibm9ybWFsaXplZCI6dHJ1ZSwiYnl0ZU9mZnNldCI6MCwiYnVmZmVyVmlldyI6NDF9LHsibmFtZSI6ImtheUdfdSIsInR5cGUiOiJWRUMyIiwiY29tcG9uZW50VHlwZSI6NTEyMywiY291bnQiOjE5NTUsIm5vcm1hbGl6ZWQiOnRydWUsImJ5dGVPZmZzZXQiOjAsImJ1ZmZlclZpZXciOjQyfSx7Im5hbWUiOiJrYnVzX3AiLCJ0eXBlIjoiVkVDMyIsImNvbXBvbmVudFR5cGUiOjUxMjIsImNvdW50IjoxNjgsIm1heCI6WzkzOTcsOTAwOSwzMjc2N10sIm1pbiI6Wy05Mzk3LC05MDA5LC0zMjc2N10sIm5vcm1hbGl6ZWQiOnRydWUsImJ5dGVPZmZzZXQiOjAsImJ1ZmZlclZpZXciOjQzfSx7Im5hbWUiOiJrYnVzX24iLCJ0eXBlIjoiVkVDMyIsImNvbXBvbmVudFR5cGUiOjUxMjIsImNvdW50IjoxNjgsIm5vcm1hbGl6ZWQiOnRydWUsImJ5dGVPZmZzZXQiOjAsImJ1ZmZlclZpZXciOjQ0fSx7Im5hbWUiOiJrYnVzX2MiLCJ0eXBlIjoiVkVDMyIsImNvbXBvbmVudFR5cGUiOjUxMjEsImNvdW50IjoxNjgsIm5vcm1hbGl6ZWQiOnRydWUsImJ5dGVPZmZzZXQiOjAsImJ1ZmZlclZpZXciOjQ1fV0sImJ1ZmZlclZpZXdzIjpbeyJidWZmZXIiOjEsImJ5dGVPZmZzZXQiOjAsImJ5dGVMZW5ndGgiOjUyNzY0LCJ0YXJnZXQiOjM0OTYzLCJleHRlbnNpb25zIjp7IkVYVF9tZXNob3B0X2NvbXByZXNzaW9uIjp7ImJ1ZmZlciI6MCwiYnl0ZU9mZnNldCI6MCwiYnl0ZUxlbmd0aCI6ODg3MCwibW9kZSI6IlRSSUFOR0xFUyIsImJ5dGVTdHJpZGUiOjIsImNvdW50IjoyNjM4Mn19fSx7ImJ1ZmZlciI6MSwiYnl0ZU9mZnNldCI6NTI3NjQsImJ5dGVMZW5ndGgiOjQ2OTYsInRhcmdldCI6MzQ5NjIsImJ5dGVTdHJpZGUiOjQsImV4dGVuc2lvbnMiOnsiRVhUX21lc2hvcHRfY29tcHJlc3Npb24iOnsiYnVmZmVyIjowLCJieXRlT2Zmc2V0Ijo4ODcyLCJieXRlTGVuZ3RoIjoyMTcsIm1vZGUiOiJBVFRSSUJVVEVTIiwiYnl0ZVN0cmlkZSI6NCwiY291bnQiOjExNzR9fX0seyJidWZmZXIiOjEsImJ5dGVPZmZzZXQiOjU3NDYwLCJieXRlTGVuZ3RoIjo0Mjg4LCJ0YXJnZXQiOjM0OTYyLCJieXRlU3RyaWRlIjo0LCJleHRlbnNpb25zIjp7IkVYVF9tZXNob3B0X2NvbXByZXNzaW9uIjp7ImJ1ZmZlciI6MCwiYnl0ZU9mZnNldCI6OTA5MiwiYnl0ZUxlbmd0aCI6MTIxLCJtb2RlIjoiQVRUUklCVVRFUyIsImJ5dGVTdHJpZGUiOjQsImNvdW50IjoxMDcyfX19LHsiYnVmZmVyIjoxLCJieXRlT2Zmc2V0Ijo2MTc0OCwiYnl0ZUxlbmd0aCI6NDU1MiwidGFyZ2V0IjozNDk2MiwiYnl0ZVN0cmlkZSI6NCwiZXh0ZW5zaW9ucyI6eyJFWFRfbWVzaG9wdF9jb21wcmVzc2lvbiI6eyJidWZmZXIiOjAsImJ5dGVPZmZzZXQiOjkyMTYsImJ5dGVMZW5ndGgiOjEyNSwibW9kZSI6IkFUVFJJQlVURVMiLCJieXRlU3RyaWRlIjo0LCJjb3VudCI6MTEzOH19fSx7ImJ1ZmZlciI6MSwiYnl0ZU9mZnNldCI6NjYzMDAsImJ5dGVMZW5ndGgiOjQ3MjAsInRhcmdldCI6MzQ5NjIsImJ5dGVTdHJpZGUiOjQsImV4dGVuc2lvbnMiOnsiRVhUX21lc2hvcHRfY29tcHJlc3Npb24iOnsiYnVmZmVyIjowLCJieXRlT2Zmc2V0Ijo5MzQ0LCJieXRlTGVuZ3RoIjoxMjksIm1vZGUiOiJBVFRSSUJVVEVTIiwiYnl0ZVN0cmlkZSI6NCwiY291bnQiOjExODB9fX0seyJidWZmZXIiOjEsImJ5dGVPZmZzZXQiOjcxMDIwLCJieXRlTGVuZ3RoIjo0NjA4LCJ0YXJnZXQiOjM0OTYyLCJieXRlU3RyaWRlIjo0LCJleHRlbnNpb25zIjp7IkVYVF9tZXNob3B0X2NvbXByZXNzaW9uIjp7ImJ1ZmZlciI6MCwiYnl0ZU9mZnNldCI6OTQ3NiwiYnl0ZUxlbmd0aCI6MTI1LCJtb2RlIjoiQVRUUklCVVRFUyIsImJ5dGVTdHJpZGUiOjQsImNvdW50IjoxMTUyfX19LHsiYnVmZmVyIjoxLCJieXRlT2Zmc2V0Ijo3NTYyOCwiYnl0ZUxlbmd0aCI6NDU1MiwidGFyZ2V0IjozNDk2MiwiYnl0ZVN0cmlkZSI6NCwiZXh0ZW5zaW9ucyI6eyJFWFRfbWVzaG9wdF9jb21wcmVzc2lvbiI6eyJidWZmZXIiOjAsImJ5dGVPZmZzZXQiOjk2MDQsImJ5dGVMZW5ndGgiOjEzMSwibW9kZSI6IkFUVFJJQlVURVMiLCJieXRlU3RyaWRlIjo0LCJjb3VudCI6MTEzOH19fSx7ImJ1ZmZlciI6MSwiYnl0ZU9mZnNldCI6ODAxODAsImJ5dGVMZW5ndGgiOjQ0ODAsInRhcmdldCI6MzQ5NjIsImJ5dGVTdHJpZGUiOjQsImV4dGVuc2lvbnMiOnsiRVhUX21lc2hvcHRfY29tcHJlc3Npb24iOnsiYnVmZmVyIjowLCJieXRlT2Zmc2V0Ijo5NzM2LCJieXRlTGVuZ3RoIjoxNDQsIm1vZGUiOiJBVFRSSUJVVEVTIiwiYnl0ZVN0cmlkZSI6NCwiY291bnQiOjExMjB9fX0seyJidWZmZXIiOjEsImJ5dGVPZmZzZXQiOjg0NjYwLCJieXRlTGVuZ3RoIjo2MjU2LCJ0YXJnZXQiOjM0OTYyLCJieXRlU3RyaWRlIjo0LCJleHRlbnNpb25zIjp7IkVYVF9tZXNob3B0X2NvbXByZXNzaW9uIjp7ImJ1ZmZlciI6MCwiYnl0ZU9mZnNldCI6OTg4MCwiYnl0ZUxlbmd0aCI6MTY4LCJtb2RlIjoiQVRUUklCVVRFUyIsImJ5dGVTdHJpZGUiOjQsImNvdW50IjoxNTY0fX19LHsiYnVmZmVyIjoxLCJieXRlT2Zmc2V0Ijo5MDkxNiwiYnl0ZUxlbmd0aCI6NjcyLCJ0YXJnZXQiOjM0OTYyLCJieXRlU3RyaWRlIjo0LCJleHRlbnNpb25zIjp7IkVYVF9tZXNob3B0X2NvbXByZXNzaW9uIjp7ImJ1ZmZlciI6MCwiYnl0ZU9mZnNldCI6MTAwNDgsImJ5dGVMZW5ndGgiOjg0LCJtb2RlIjoiQVRUUklCVVRFUyIsImJ5dGVTdHJpZGUiOjQsImNvdW50IjoxNjh9fX0seyJidWZmZXIiOjEsImJ5dGVPZmZzZXQiOjkxNTg4LCJieXRlTGVuZ3RoIjo5MzkyLCJ0YXJnZXQiOjM0OTYyLCJieXRlU3RyaWRlIjo4LCJleHRlbnNpb25zIjp7IkVYVF9tZXNob3B0X2NvbXByZXNzaW9uIjp7ImJ1ZmZlciI6MCwiYnl0ZU9mZnNldCI6MTAxMzIsImJ5dGVMZW5ndGgiOjU5OTAsIm1vZGUiOiJBVFRSSUJVVEVTIiwiYnl0ZVN0cmlkZSI6OCwiY291bnQiOjExNzR9fX0seyJidWZmZXIiOjEsImJ5dGVPZmZzZXQiOjEwMDk4MCwiYnl0ZUxlbmd0aCI6OTM5MiwidGFyZ2V0IjozNDk2MiwiYnl0ZVN0cmlkZSI6OCwiZXh0ZW5zaW9ucyI6eyJFWFRfbWVzaG9wdF9jb21wcmVzc2lvbiI6eyJidWZmZXIiOjAsImJ5dGVPZmZzZXQiOjE2MTI0LCJieXRlTGVuZ3RoIjozNTA0LCJtb2RlIjoiQVRUUklCVVRFUyIsImJ5dGVTdHJpZGUiOjgsImNvdW50IjoxMTc0fX19LHsiYnVmZmVyIjoxLCJieXRlT2Zmc2V0IjoxMTAzNzIsImJ5dGVMZW5ndGgiOjQ2OTYsInRhcmdldCI6MzQ5NjIsImJ5dGVTdHJpZGUiOjQsImV4dGVuc2lvbnMiOnsiRVhUX21lc2hvcHRfY29tcHJlc3Npb24iOnsiYnVmZmVyIjowLCJieXRlT2Zmc2V0IjoxOTYyOCwiYnl0ZUxlbmd0aCI6MzYwLCJtb2RlIjoiQVRUUklCVVRFUyIsImJ5dGVTdHJpZGUiOjQsImNvdW50IjoxMTc0fX19LHsiYnVmZmVyIjoxLCJieXRlT2Zmc2V0IjoxMTUwNjgsImJ5dGVMZW5ndGgiOjg1NzYsInRhcmdldCI6MzQ5NjIsImJ5dGVTdHJpZGUiOjgsImV4dGVuc2lvbnMiOnsiRVhUX21lc2hvcHRfY29tcHJlc3Npb24iOnsiYnVmZmVyIjowLCJieXRlT2Zmc2V0IjoxOTk4OCwiYnl0ZUxlbmd0aCI6NTUzMiwibW9kZSI6IkFUVFJJQlVURVMiLCJieXRlU3RyaWRlIjo4LCJjb3VudCI6MTA3Mn19fSx7ImJ1ZmZlciI6MSwiYnl0ZU9mZnNldCI6MTIzNjQ0LCJieXRlTGVuZ3RoIjo4NTc2LCJ0YXJnZXQiOjM0OTYyLCJieXRlU3RyaWRlIjo4LCJleHRlbnNpb25zIjp7IkVYVF9tZXNob3B0X2NvbXByZXNzaW9uIjp7ImJ1ZmZlciI6MCwiYnl0ZU9mZnNldCI6MjU1MjAsImJ5dGVMZW5ndGgiOjMzMDksIm1vZGUiOiJBVFRSSUJVVEVTIiwiYnl0ZVN0cmlkZSI6OCwiY291bnQiOjEwNzJ9fX0seyJidWZmZXIiOjEsImJ5dGVPZmZzZXQiOjEzMjIyMCwiYnl0ZUxlbmd0aCI6NDI4OCwidGFyZ2V0IjozNDk2MiwiYnl0ZVN0cmlkZSI6NCwiZXh0ZW5zaW9ucyI6eyJFWFRfbWVzaG9wdF9jb21wcmVzc2lvbiI6eyJidWZmZXIiOjAsImJ5dGVPZmZzZXQiOjI4ODMyLCJieXRlTGVuZ3RoIjozMDIsIm1vZGUiOiJBVFRSSUJVVEVTIiwiYnl0ZVN0cmlkZSI6NCwiY291bnQiOjEwNzJ9fX0seyJidWZmZXIiOjEsImJ5dGVPZmZzZXQiOjEzNjUwOCwiYnl0ZUxlbmd0aCI6OTEwNCwidGFyZ2V0IjozNDk2MiwiYnl0ZVN0cmlkZSI6OCwiZXh0ZW5zaW9ucyI6eyJFWFRfbWVzaG9wdF9jb21wcmVzc2lvbiI6eyJidWZmZXIiOjAsImJ5dGVPZmZzZXQiOjI5MTM2LCJieXRlTGVuZ3RoIjo1ODEyLCJtb2RlIjoiQVRUUklCVVRFUyIsImJ5dGVTdHJpZGUiOjgsImNvdW50IjoxMTM4fX19LHsiYnVmZmVyIjoxLCJieXRlT2Zmc2V0IjoxNDU2MTIsImJ5dGVMZW5ndGgiOjkxMDQsInRhcmdldCI6MzQ5NjIsImJ5dGVTdHJpZGUiOjgsImV4dGVuc2lvbnMiOnsiRVhUX21lc2hvcHRfY29tcHJlc3Npb24iOnsiYnVmZmVyIjowLCJieXRlT2Zmc2V0IjozNDk0OCwiYnl0ZUxlbmd0aCI6MzQxOCwibW9kZSI6IkFUVFJJQlVURVMiLCJieXRlU3RyaWRlIjo4LCJjb3VudCI6MTEzOH19fSx7ImJ1ZmZlciI6MSwiYnl0ZU9mZnNldCI6MTU0NzE2LCJieXRlTGVuZ3RoIjo0NTUyLCJ0YXJnZXQiOjM0OTYyLCJieXRlU3RyaWRlIjo0LCJleHRlbnNpb25zIjp7IkVYVF9tZXNob3B0X2NvbXByZXNzaW9uIjp7ImJ1ZmZlciI6MCwiYnl0ZU9mZnNldCI6MzgzNjgsImJ5dGVMZW5ndGgiOjI0NSwibW9kZSI6IkFUVFJJQlVURVMiLCJieXRlU3RyaWRlIjo0LCJjb3VudCI6MTEzOH19fSx7ImJ1ZmZlciI6MSwiYnl0ZU9mZnNldCI6MTU5MjY4LCJieXRlTGVuZ3RoIjo5NDQwLCJ0YXJnZXQiOjM0OTYyLCJieXRlU3RyaWRlIjo4LCJleHRlbnNpb25zIjp7IkVYVF9tZXNob3B0X2NvbXByZXNzaW9uIjp7ImJ1ZmZlciI6MCwiYnl0ZU9mZnNldCI6Mzg2MTYsImJ5dGVMZW5ndGgiOjU5NjMsIm1vZGUiOiJBVFRSSUJVVEVTIiwiYnl0ZVN0cmlkZSI6OCwiY291bnQiOjExODB9fX0seyJidWZmZXIiOjEsImJ5dGVPZmZzZXQiOjE2ODcwOCwiYnl0ZUxlbmd0aCI6OTQ0MCwidGFyZ2V0IjozNDk2MiwiYnl0ZVN0cmlkZSI6OCwiZXh0ZW5zaW9ucyI6eyJFWFRfbWVzaG9wdF9jb21wcmVzc2lvbiI6eyJidWZmZXIiOjAsImJ5dGVPZmZzZXQiOjQ0NTgwLCJieXRlTGVuZ3RoIjozNDgwLCJtb2RlIjoiQVRUUklCVVRFUyIsImJ5dGVTdHJpZGUiOjgsImNvdW50IjoxMTgwfX19LHsiYnVmZmVyIjoxLCJieXRlT2Zmc2V0IjoxNzgxNDgsImJ5dGVMZW5ndGgiOjQ3MjAsInRhcmdldCI6MzQ5NjIsImJ5dGVTdHJpZGUiOjQsImV4dGVuc2lvbnMiOnsiRVhUX21lc2hvcHRfY29tcHJlc3Npb24iOnsiYnVmZmVyIjowLCJieXRlT2Zmc2V0Ijo0ODA2MCwiYnl0ZUxlbmd0aCI6MjI4LCJtb2RlIjoiQVRUUklCVVRFUyIsImJ5dGVTdHJpZGUiOjQsImNvdW50IjoxMTgwfX19LHsiYnVmZmVyIjoxLCJieXRlT2Zmc2V0IjoxODI4NjgsImJ5dGVMZW5ndGgiOjkyMTYsInRhcmdldCI6MzQ5NjIsImJ5dGVTdHJpZGUiOjgsImV4dGVuc2lvbnMiOnsiRVhUX21lc2hvcHRfY29tcHJlc3Npb24iOnsiYnVmZmVyIjowLCJieXRlT2Zmc2V0Ijo0ODI4OCwiYnl0ZUxlbmd0aCI6NTg2OSwibW9kZSI6IkFUVFJJQlVURVMiLCJieXRlU3RyaWRlIjo4LCJjb3VudCI6MTE1Mn19fSx7ImJ1ZmZlciI6MSwiYnl0ZU9mZnNldCI6MTkyMDg0LCJieXRlTGVuZ3RoIjo5MjE2LCJ0YXJnZXQiOjM0OTYyLCJieXRlU3RyaWRlIjo4LCJleHRlbnNpb25zIjp7IkVYVF9tZXNob3B0X2NvbXByZXNzaW9uIjp7ImJ1ZmZlciI6MCwiYnl0ZU9mZnNldCI6NTQxNjAsImJ5dGVMZW5ndGgiOjM1OTYsIm1vZGUiOiJBVFRSSUJVVEVTIiwiYnl0ZVN0cmlkZSI6OCwiY291bnQiOjExNTJ9fX0seyJidWZmZXIiOjEsImJ5dGVPZmZzZXQiOjIwMTMwMCwiYnl0ZUxlbmd0aCI6NDYwOCwidGFyZ2V0IjozNDk2MiwiYnl0ZVN0cmlkZSI6NCwiZXh0ZW5zaW9ucyI6eyJFWFRfbWVzaG9wdF9jb21wcmVzc2lvbiI6eyJidWZmZXIiOjAsImJ5dGVPZmZzZXQiOjU3NzU2LCJieXRlTGVuZ3RoIjoyODIsIm1vZGUiOiJBVFRSSUJVVEVTIiwiYnl0ZVN0cmlkZSI6NCwiY291bnQiOjExNTJ9fX0seyJidWZmZXIiOjEsImJ5dGVPZmZzZXQiOjIwNTkwOCwiYnl0ZUxlbmd0aCI6OTEwNCwidGFyZ2V0IjozNDk2MiwiYnl0ZVN0cmlkZSI6OCwiZXh0ZW5zaW9ucyI6eyJFWFRfbWVzaG9wdF9jb21wcmVzc2lvbiI6eyJidWZmZXIiOjAsImJ5dGVPZmZzZXQiOjU4MDQwLCJieXRlTGVuZ3RoIjo1ODM5LCJtb2RlIjoiQVRUUklCVVRFUyIsImJ5dGVTdHJpZGUiOjgsImNvdW50IjoxMTM4fX19LHsiYnVmZmVyIjoxLCJieXRlT2Zmc2V0IjoyMTUwMTIsImJ5dGVMZW5ndGgiOjkxMDQsInRhcmdldCI6MzQ5NjIsImJ5dGVTdHJpZGUiOjgsImV4dGVuc2lvbnMiOnsiRVhUX21lc2hvcHRfY29tcHJlc3Npb24iOnsiYnVmZmVyIjowLCJieXRlT2Zmc2V0Ijo2Mzg4MCwiYnl0ZUxlbmd0aCI6MzQzOCwibW9kZSI6IkFUVFJJQlVURVMiLCJieXRlU3RyaWRlIjo4LCJjb3VudCI6MTEzOH19fSx7ImJ1ZmZlciI6MSwiYnl0ZU9mZnNldCI6MjI0MTE2LCJieXRlTGVuZ3RoIjo0NTUyLCJ0YXJnZXQiOjM0OTYyLCJieXRlU3RyaWRlIjo0LCJleHRlbnNpb25zIjp7IkVYVF9tZXNob3B0X2NvbXByZXNzaW9uIjp7ImJ1ZmZlciI6MCwiYnl0ZU9mZnNldCI6NjczMjAsImJ5dGVMZW5ndGgiOjM3NCwibW9kZSI6IkFUVFJJQlVURVMiLCJieXRlU3RyaWRlIjo0LCJjb3VudCI6MTEzOH19fSx7ImJ1ZmZlciI6MSwiYnl0ZU9mZnNldCI6MjI4NjY4LCJieXRlTGVuZ3RoIjo4OTYwLCJ0YXJnZXQiOjM0OTYyLCJieXRlU3RyaWRlIjo4LCJleHRlbnNpb25zIjp7IkVYVF9tZXNob3B0X2NvbXByZXNzaW9uIjp7ImJ1ZmZlciI6MCwiYnl0ZU9mZnNldCI6Njc2OTYsImJ5dGVMZW5ndGgiOjU3NzQsIm1vZGUiOiJBVFRSSUJVVEVTIiwiYnl0ZVN0cmlkZSI6OCwiY291bnQiOjExMjB9fX0seyJidWZmZXIiOjEsImJ5dGVPZmZzZXQiOjIzNzYyOCwiYnl0ZUxlbmd0aCI6ODk2MCwidGFyZ2V0IjozNDk2MiwiYnl0ZVN0cmlkZSI6OCwiZXh0ZW5zaW9ucyI6eyJFWFRfbWVzaG9wdF9jb21wcmVzc2lvbiI6eyJidWZmZXIiOjAsImJ5dGVPZmZzZXQiOjczNDcyLCJieXRlTGVuZ3RoIjozMzQyLCJtb2RlIjoiQVRUUklCVVRFUyIsImJ5dGVTdHJpZGUiOjgsImNvdW50IjoxMTIwfX19LHsiYnVmZmVyIjoxLCJieXRlT2Zmc2V0IjoyNDY1ODgsImJ5dGVMZW5ndGgiOjQ0ODAsInRhcmdldCI6MzQ5NjIsImJ5dGVTdHJpZGUiOjQsImV4dGVuc2lvbnMiOnsiRVhUX21lc2hvcHRfY29tcHJlc3Npb24iOnsiYnVmZmVyIjowLCJieXRlT2Zmc2V0Ijo3NjgxNiwiYnl0ZUxlbmd0aCI6MzA1LCJtb2RlIjoiQVRUUklCVVRFUyIsImJ5dGVTdHJpZGUiOjQsImNvdW50IjoxMTIwfX19LHsiYnVmZmVyIjoxLCJieXRlT2Zmc2V0IjoyNTEwNjgsImJ5dGVMZW5ndGgiOjEyNTEyLCJ0YXJnZXQiOjM0OTYyLCJieXRlU3RyaWRlIjo4LCJleHRlbnNpb25zIjp7IkVYVF9tZXNob3B0X2NvbXByZXNzaW9uIjp7ImJ1ZmZlciI6MCwiYnl0ZU9mZnNldCI6NzcxMjQsImJ5dGVMZW5ndGgiOjc3NjksIm1vZGUiOiJBVFRSSUJVVEVTIiwiYnl0ZVN0cmlkZSI6OCwiY291bnQiOjE1NjR9fX0seyJidWZmZXIiOjEsImJ5dGVPZmZzZXQiOjI2MzU4MCwiYnl0ZUxlbmd0aCI6MTI1MTIsInRhcmdldCI6MzQ5NjIsImJ5dGVTdHJpZGUiOjgsImV4dGVuc2lvbnMiOnsiRVhUX21lc2hvcHRfY29tcHJlc3Npb24iOnsiYnVmZmVyIjowLCJieXRlT2Zmc2V0Ijo4NDg5NiwiYnl0ZUxlbmd0aCI6NDU0NSwibW9kZSI6IkFUVFJJQlVURVMiLCJieXRlU3RyaWRlIjo4LCJjb3VudCI6MTU2NH19fSx7ImJ1ZmZlciI6MSwiYnl0ZU9mZnNldCI6Mjc2MDkyLCJieXRlTGVuZ3RoIjo2MjU2LCJ0YXJnZXQiOjM0OTYyLCJieXRlU3RyaWRlIjo0LCJleHRlbnNpb25zIjp7IkVYVF9tZXNob3B0X2NvbXByZXNzaW9uIjp7ImJ1ZmZlciI6MCwiYnl0ZU9mZnNldCI6ODk0NDQsImJ5dGVMZW5ndGgiOjU2MCwibW9kZSI6IkFUVFJJQlVURVMiLCJieXRlU3RyaWRlIjo0LCJjb3VudCI6MTU2NH19fSx7ImJ1ZmZlciI6MSwiYnl0ZU9mZnNldCI6MjgyMzQ4LCJieXRlTGVuZ3RoIjo2NTUyLCJ0YXJnZXQiOjM0OTYyLCJieXRlU3RyaWRlIjo4LCJleHRlbnNpb25zIjp7IkVYVF9tZXNob3B0X2NvbXByZXNzaW9uIjp7ImJ1ZmZlciI6MCwiYnl0ZU9mZnNldCI6OTAwMDQsImJ5dGVMZW5ndGgiOjM1MzcsIm1vZGUiOiJBVFRSSUJVVEVTIiwiYnl0ZVN0cmlkZSI6OCwiY291bnQiOjgxOX19fSx7ImJ1ZmZlciI6MSwiYnl0ZU9mZnNldCI6Mjg4OTAwLCJieXRlTGVuZ3RoIjo2NTUyLCJ0YXJnZXQiOjM0OTYyLCJieXRlU3RyaWRlIjo4LCJleHRlbnNpb25zIjp7IkVYVF9tZXNob3B0X2NvbXByZXNzaW9uIjp7ImJ1ZmZlciI6MCwiYnl0ZU9mZnNldCI6OTM1NDQsImJ5dGVMZW5ndGgiOjE1OTIsIm1vZGUiOiJBVFRSSUJVVEVTIiwiYnl0ZVN0cmlkZSI6OCwiY291bnQiOjgxOX19fSx7ImJ1ZmZlciI6MSwiYnl0ZU9mZnNldCI6Mjk1NDUyLCJieXRlTGVuZ3RoIjozMjc2LCJ0YXJnZXQiOjM0OTYyLCJieXRlU3RyaWRlIjo0LCJleHRlbnNpb25zIjp7IkVYVF9tZXNob3B0X2NvbXByZXNzaW9uIjp7ImJ1ZmZlciI6MCwiYnl0ZU9mZnNldCI6OTUxMzYsImJ5dGVMZW5ndGgiOjIyOTQsIm1vZGUiOiJBVFRSSUJVVEVTIiwiYnl0ZVN0cmlkZSI6NCwiY291bnQiOjgxOX19fSx7ImJ1ZmZlciI6MSwiYnl0ZU9mZnNldCI6Mjk4NzI4LCJieXRlTGVuZ3RoIjoxNDA5NiwidGFyZ2V0IjozNDk2MiwiYnl0ZVN0cmlkZSI6OCwiZXh0ZW5zaW9ucyI6eyJFWFRfbWVzaG9wdF9jb21wcmVzc2lvbiI6eyJidWZmZXIiOjAsImJ5dGVPZmZzZXQiOjk3NDMyLCJieXRlTGVuZ3RoIjo3NDUyLCJtb2RlIjoiQVRUUklCVVRFUyIsImJ5dGVTdHJpZGUiOjgsImNvdW50IjoxNzYyfX19LHsiYnVmZmVyIjoxLCJieXRlT2Zmc2V0IjozMTI4MjQsImJ5dGVMZW5ndGgiOjE0MDk2LCJ0YXJnZXQiOjM0OTYyLCJieXRlU3RyaWRlIjo4LCJleHRlbnNpb25zIjp7IkVYVF9tZXNob3B0X2NvbXByZXNzaW9uIjp7ImJ1ZmZlciI6MCwiYnl0ZU9mZnNldCI6MTA0ODg0LCJieXRlTGVuZ3RoIjozMzM0LCJtb2RlIjoiQVRUUklCVVRFUyIsImJ5dGVTdHJpZGUiOjgsImNvdW50IjoxNzYyfX19LHsiYnVmZmVyIjoxLCJieXRlT2Zmc2V0IjozMjY5MjAsImJ5dGVMZW5ndGgiOjcwNDgsInRhcmdldCI6MzQ5NjIsImJ5dGVTdHJpZGUiOjQsImV4dGVuc2lvbnMiOnsiRVhUX21lc2hvcHRfY29tcHJlc3Npb24iOnsiYnVmZmVyIjowLCJieXRlT2Zmc2V0IjoxMDgyMjAsImJ5dGVMZW5ndGgiOjQ3NzIsIm1vZGUiOiJBVFRSSUJVVEVTIiwiYnl0ZVN0cmlkZSI6NCwiY291bnQiOjE3NjJ9fX0seyJidWZmZXIiOjEsImJ5dGVPZmZzZXQiOjMzMzk2OCwiYnl0ZUxlbmd0aCI6MTU2NDAsInRhcmdldCI6MzQ5NjIsImJ5dGVTdHJpZGUiOjgsImV4dGVuc2lvbnMiOnsiRVhUX21lc2hvcHRfY29tcHJlc3Npb24iOnsiYnVmZmVyIjowLCJieXRlT2Zmc2V0IjoxMTI5OTIsImJ5dGVMZW5ndGgiOjgyNjksIm1vZGUiOiJBVFRSSUJVVEVTIiwiYnl0ZVN0cmlkZSI6OCwiY291bnQiOjE5NTV9fX0seyJidWZmZXIiOjEsImJ5dGVPZmZzZXQiOjM0OTYwOCwiYnl0ZUxlbmd0aCI6MTU2NDAsInRhcmdldCI6MzQ5NjIsImJ5dGVTdHJpZGUiOjgsImV4dGVuc2lvbnMiOnsiRVhUX21lc2hvcHRfY29tcHJlc3Npb24iOnsiYnVmZmVyIjowLCJieXRlT2Zmc2V0IjoxMjEyNjQsImJ5dGVMZW5ndGgiOjM3MzMsIm1vZGUiOiJBVFRSSUJVVEVTIiwiYnl0ZVN0cmlkZSI6OCwiY291bnQiOjE5NTV9fX0seyJidWZmZXIiOjEsImJ5dGVPZmZzZXQiOjM2NTI0OCwiYnl0ZUxlbmd0aCI6NzgyMCwidGFyZ2V0IjozNDk2MiwiYnl0ZVN0cmlkZSI6NCwiZXh0ZW5zaW9ucyI6eyJFWFRfbWVzaG9wdF9jb21wcmVzc2lvbiI6eyJidWZmZXIiOjAsImJ5dGVPZmZzZXQiOjEyNTAwMCwiYnl0ZUxlbmd0aCI6NTIwMiwibW9kZSI6IkFUVFJJQlVURVMiLCJieXRlU3RyaWRlIjo0LCJjb3VudCI6MTk1NX19fSx7ImJ1ZmZlciI6MSwiYnl0ZU9mZnNldCI6MzczMDY4LCJieXRlTGVuZ3RoIjoxMzQ0LCJ0YXJnZXQiOjM0OTYyLCJieXRlU3RyaWRlIjo4LCJleHRlbnNpb25zIjp7IkVYVF9tZXNob3B0X2NvbXByZXNzaW9uIjp7ImJ1ZmZlciI6MCwiYnl0ZU9mZnNldCI6MTMwMjA0LCJieXRlTGVuZ3RoIjo2NjksIm1vZGUiOiJBVFRSSUJVVEVTIiwiYnl0ZVN0cmlkZSI6OCwiY291bnQiOjE2OH19fSx7ImJ1ZmZlciI6MSwiYnl0ZU9mZnNldCI6Mzc0NDEyLCJieXRlTGVuZ3RoIjoxMzQ0LCJ0YXJnZXQiOjM0OTYyLCJieXRlU3RyaWRlIjo4LCJleHRlbnNpb25zIjp7IkVYVF9tZXNob3B0X2NvbXByZXNzaW9uIjp7ImJ1ZmZlciI6MCwiYnl0ZU9mZnNldCI6MTMwODc2LCJieXRlTGVuZ3RoIjozNjYsIm1vZGUiOiJBVFRSSUJVVEVTIiwiYnl0ZVN0cmlkZSI6OCwiY291bnQiOjE2OH19fSx7ImJ1ZmZlciI6MSwiYnl0ZU9mZnNldCI6Mzc1NzU2LCJieXRlTGVuZ3RoIjo2NzIsInRhcmdldCI6MzQ5NjIsImJ5dGVTdHJpZGUiOjQsImV4dGVuc2lvbnMiOnsiRVhUX21lc2hvcHRfY29tcHJlc3Npb24iOnsiYnVmZmVyIjowLCJieXRlT2Zmc2V0IjoxMzEyNDQsImJ5dGVMZW5ndGgiOjEyMCwibW9kZSI6IkFUVFJJQlVURVMiLCJieXRlU3RyaWRlIjo0LCJjb3VudCI6MTY4fX19XSwiYnVmZmVycyI6W3sibmFtZSI6InBhY2siLCJieXRlTGVuZ3RoIjoxMzEzNjR9LHsiYnl0ZUxlbmd0aCI6Mzc2NDI4LCJleHRlbnNpb25zIjp7IkVYVF9tZXNob3B0X2NvbXByZXNzaW9uIjp7ImZhbGxiYWNrIjp0cnVlfX19XSwibWVzaGVzIjpbeyJuYW1lIjoia2hhdGNoIiwicHJpbWl0aXZlcyI6W3siYXR0cmlidXRlcyI6eyJfVEFHIjoxLCJQT1NJVElPTiI6MjEsIk5PUk1BTCI6MjIsIkNPTE9SXzAiOjIzfSwibW9kZSI6NCwiaW5kaWNlcyI6MH1dfSx7Im5hbWUiOiJrc2VkYW4iLCJwcmltaXRpdmVzIjpbeyJhdHRyaWJ1dGVzIjp7Il9UQUciOjMsIlBPU0lUSU9OIjoyNCwiTk9STUFMIjoyNSwiQ09MT1JfMCI6MjZ9LCJtb2RlIjo0LCJpbmRpY2VzIjoyfV19LHsibmFtZSI6Imt2YW4iLCJwcmltaXRpdmVzIjpbeyJhdHRyaWJ1dGVzIjp7Il9UQUciOjUsIlBPU0lUSU9OIjoyNywiTk9STUFMIjoyOCwiQ09MT1JfMCI6Mjl9LCJtb2RlIjo0LCJpbmRpY2VzIjo0fV19LHsibmFtZSI6ImtwaWNrdXAiLCJwcmltaXRpdmVzIjpbeyJhdHRyaWJ1dGVzIjp7Il9UQUciOjcsIlBPU0lUSU9OIjozMCwiTk9STUFMIjozMSwiQ09MT1JfMCI6MzJ9LCJtb2RlIjo0LCJpbmRpY2VzIjo2fV19LHsibmFtZSI6Imt0cnVjayIsInByaW1pdGl2ZXMiOlt7ImF0dHJpYnV0ZXMiOnsiX1RBRyI6OSwiUE9TSVRJT04iOjMzLCJOT1JNQUwiOjM0LCJDT0xPUl8wIjozNX0sIm1vZGUiOjQsImluZGljZXMiOjh9XX0seyJuYW1lIjoia3RheGkiLCJwcmltaXRpdmVzIjpbeyJhdHRyaWJ1dGVzIjp7Il9UQUciOjExLCJQT1NJVElPTiI6MzYsIk5PUk1BTCI6MzcsIkNPTE9SXzAiOjM4fSwibW9kZSI6NCwiaW5kaWNlcyI6MTB9XX0seyJuYW1lIjoia3BvbGljZSIsInByaW1pdGl2ZXMiOlt7ImF0dHJpYnV0ZXMiOnsiX1RBRyI6MTMsIlBPU0lUSU9OIjozOSwiTk9STUFMIjo0MCwiQ09MT1JfMCI6NDF9LCJtb2RlIjo0LCJpbmRpY2VzIjoxMn1dfSx7Im5hbWUiOiJrYW1idWxhbmNlIiwicHJpbWl0aXZlcyI6W3siYXR0cmlidXRlcyI6eyJfVEFHIjoxNSwiUE9TSVRJT04iOjQyLCJOT1JNQUwiOjQzLCJDT0xPUl8wIjo0NH0sIm1vZGUiOjQsImluZGljZXMiOjE0fV19LHsibmFtZSI6ImtheUEiLCJwcmltaXRpdmVzIjpbeyJhdHRyaWJ1dGVzIjp7IlBPU0lUSU9OIjo0NSwiTk9STUFMIjo0NiwiVEVYQ09PUkRfMCI6NDd9LCJtb2RlIjo0LCJpbmRpY2VzIjoxNn1dfSx7Im5hbWUiOiJrYXlFIiwicHJpbWl0aXZlcyI6W3siYXR0cmlidXRlcyI6eyJQT1NJVElPTiI6NDgsIk5PUk1BTCI6NDksIlRFWENPT1JEXzAiOjUwfSwibW9kZSI6NCwiaW5kaWNlcyI6MTd9XX0seyJuYW1lIjoia2F5RyIsInByaW1pdGl2ZXMiOlt7ImF0dHJpYnV0ZXMiOnsiUE9TSVRJT04iOjUxLCJOT1JNQUwiOjUyLCJURVhDT09SRF8wIjo1M30sIm1vZGUiOjQsImluZGljZXMiOjE4fV19LHsibmFtZSI6ImtidXMiLCJwcmltaXRpdmVzIjpbeyJhdHRyaWJ1dGVzIjp7Il9UQUciOjIwLCJQT1NJVElPTiI6NTQsIk5PUk1BTCI6NTUsIkNPTE9SXzAiOjU2fSwibW9kZSI6NCwiaW5kaWNlcyI6MTl9XX1dLCJub2RlcyI6W3sibmFtZSI6ImtoYXRjaCIsInRyYW5zbGF0aW9uIjpbMC4wMDUwMDM5ODg3NDI4MjgzNjksMC44MDM2NjAwMjAyMzIyMDA2LC0wLjAyMTA0Nzk0OTc5MDk1NDU5XSwic2NhbGUiOlsxLjgzNDk1MTk5NjgwMzI4MzcsMS44MzQ5NTE5OTY4MDMyODM3LDEuODM0OTUxOTk2ODAzMjgzN10sIm1lc2giOjB9LHsibmFtZSI6ImtzZWRhbiIsInRyYW5zbGF0aW9uIjpbMC4wMDM3MjUwMjIwNzc1NjA0MjUsMC45MzA4NzQ5ODg0MzY2OTg5LC0wLjAyNTY1MDAyNDQxNDA2MjVdLCJzY2FsZSI6WzEuNjM4MzUwMDA5OTE4MjEzLDEuNjM4MzUwMDA5OTE4MjEzLDEuNjM4MzUwMDA5OTE4MjEzXSwibWVzaCI6MX0seyJuYW1lIjoia3ZhbiIsInRyYW5zbGF0aW9uIjpbMC4wMDUxNDIwMDMyOTc4MDU3ODYsMC45NjQxMTkwMDIyMjMwMTQ4LC0wLjAyMjU4MjA1NDEzODE4MzU5NF0sInNjYWxlIjpbMS43Njk0MTgwMDExNzQ5MjY4LDEuNzY5NDE4MDAxMTc0OTI2OCwxLjc2OTQxODAwMTE3NDkyNjhdLCJtZXNoIjoyfSx7Im5hbWUiOiJrcGlja3VwIiwidHJhbnNsYXRpb24iOlswLjAwNjg0MzAwMDY1MDQwNTg4NCwwLjkzMzI1Nzk4MjEzNDgxOSwwLjAxMjUxODA0ODI4NjQzNzk4OF0sInNjYWxlIjpbMS43Njk0MTgwMDExNzQ5MjY4LDEuNzY5NDE4MDAxMTc0OTI2OCwxLjc2OTQxODAwMTE3NDkyNjhdLCJtZXNoIjozfSx7Im5hbWUiOiJrdHJ1Y2siLCJ0cmFuc2xhdGlvbiI6WzAuMDA2MzM4MDAwMjk3NTQ2Mzg3LDAuOTMyODYyOTgyMTUzODkyNSwtMC4wMTk1MTM5NjQ2NTMwMTUxMzddLCJzY2FsZSI6WzEuOTAwNDg1OTkyNDMxNjQwNiwxLjkwMDQ4NTk5MjQzMTY0MDYsMS45MDA0ODU5OTI0MzE2NDA2XSwibWVzaCI6NH0seyJuYW1lIjoia3RheGkiLCJ0cmFuc2xhdGlvbiI6WzAuMDA1MTQyMDAzMjk3ODA1Nzg2LDEuMDYwNjE3MDE0NzY1NzM5NCwtMC4wMjI1ODIwNTQxMzgxODM1OTRdLCJzY2FsZSI6WzEuNzY5NDE4MDAxMTc0OTI2OCwxLjc2OTQxODAwMTE3NDkyNjgsMS43Njk0MTgwMDExNzQ5MjY4XSwibWVzaCI6NX0seyJuYW1lIjoia3BvbGljZSIsInRyYW5zbGF0aW9uIjpbMC4wMDYwNjQ1MDQzODQ5OTQ1MDcsMC45NjQ0NTMwMjY2NTIzMzYxLC0wLjExNjI4MDk3Mjk1NzYxMTA4XSwic2NhbGUiOlsxLjg2NzcxODk5NDYxNzQ2MjIsMS44Njc3MTg5OTQ2MTc0NjIyLDEuODY3NzE4OTk0NjE3NDYyMl0sIm1lc2giOjZ9LHsibmFtZSI6ImthbWJ1bGFuY2UiLCJ0cmFuc2xhdGlvbiI6Wy0wLjAwNzI1MDk5NDQ0Mzg5MzQzMywxLjI3MjI4NDQ5Mjg1MDMwMzYsLTAuMDQ3Njc4OTQ3NDQ4NzMwNDddLCJzY2FsZSI6WzIuMDY0MzIxMDQxMTA3MTc3NywyLjA2NDMyMTA0MTEwNzE3NzcsMi4wNjQzMjEwNDExMDcxNzc3XSwibWVzaCI6N30seyJuYW1lIjoia2F5QSIsInRyYW5zbGF0aW9uIjpbMC4wMDEyMDUxNDYzMTI3MTM2MjMsMC43NzY1Nzc4ODk5MTkyODEsMC4wMDE0NDA1MjUwNTQ5MzE2NDA2XSwic2NhbGUiOlswLjc3NjU3Nzg4OTkxOTI4MSwwLjc3NjU3Nzg4OTkxOTI4MSwwLjc3NjU3Nzg4OTkxOTI4MV0sIm1lc2giOjh9LHsibmFtZSI6ImtheUUiLCJ0cmFuc2xhdGlvbiI6Wy0wLjAwMTAwMzk4MDYzNjU5NjY3OTcsMS4xMjM5MDgwNDI5MDc3MTQ4LC0wLjAwMDcyMTIxNjIwMTc4MjIyNjZdLCJzY2FsZSI6WzEuMTIzOTA4MDQyOTA3NzE0OCwxLjEyMzkwODA0MjkwNzcxNDgsMS4xMjM5MDgwNDI5MDc3MTQ4XSwibWVzaCI6OX0seyJuYW1lIjoia2F5RyIsInRyYW5zbGF0aW9uIjpbLTAuMDAxMDAzOTgwNjM2NTk2Njc5NywxLjEyMzkwODA0MjkwNzcxNDgsLTAuMDAwNzIxMjE2MjAxNzgyMjI2Nl0sInNjYWxlIjpbMS4xMjM5MDgwNDI5MDc3MTQ4LDEuMTIzOTA4MDQyOTA3NzE0OCwxLjEyMzkwODA0MjkwNzcxNDhdLCJtZXNoIjoxMH0seyJuYW1lIjoia2J1cyIsInRyYW5zbGF0aW9uIjpbMCwxLjQ4MDAwMDA0ODg3NTgwODcsMF0sInNjYWxlIjpbNC4yMTk5OTk3OTAxOTE2NSw0LjIxOTk5OTc5MDE5MTY1LDQuMjE5OTk5NzkwMTkxNjVdLCJtZXNoIjoxMX1dLCJzY2VuZXMiOlt7Im5hbWUiOiJjaXR5Iiwibm9kZXMiOlswLDEsMiwzLDQsNSw2LDcsOCw5LDEwLDExXX0seyJub2RlcyI6WzBdfSx7Im5vZGVzIjpbMV19LHsibm9kZXMiOlsyXX0seyJub2RlcyI6WzNdfSx7Im5vZGVzIjpbNF19LHsibm9kZXMiOls1XX0seyJub2RlcyI6WzZdfSx7Im5vZGVzIjpbN119LHsibm9kZXMiOls4XX0seyJub2RlcyI6WzldfSx7Im5vZGVzIjpbMTBdfSx7Im5vZGVzIjpbMTFdfV0sImV4dGVuc2lvbnNVc2VkIjpbIkVYVF9tZXNob3B0X2NvbXByZXNzaW9uIiwiS0hSX21lc2hfcXVhbnRpemF0aW9uIl0sImV4dGVuc2lvbnNSZXF1aXJlZCI6WyJFWFRfbWVzaG9wdF9jb21wcmVzc2lvbiIsIktIUl9tZXNoX3F1YW50aXphdGlvbiJdfSQBAgBCSU4A4fAg8CAQEAAQAAAQAAAQABAAABAAEAAQAAAQAAAAECDwIBAAAAAQEAAQEAAQABAAEBAAEAAQEAAQEBAA8CAQEBDwIBAQ8CDwIPAg8CDwIPAg8CAA8CDwIPAg8CDwIPAg8CDwIPAg8CDwIAAA8CDwIPAg8CDwIPAg8CDwIPAgEPAg8CDwIADwIBDwIPAg8CAQ8CAQ8CDwIPAg8CDwIPAg8CAA8CDwIADwIPAgEADwIBAQQBAAEAAA8CDwIPAgAAAA8CDwIPAgECAAAAAQAAAQABAAABAAEAAQAAAQAAAQABAA8CDwIPAgEBBAEAAQEAAQABAAEBAAEAAQEAAQEAAAAADwIPAg8CAQEAAQEBDwIAAAABAAAPAg8CDwIPAg8CDwIAAAABAQEABgECAAAAAAAFAQEP4gEEAQAPAg8CDwIPAg8CAQAAAAEAAQAPAgABAQAAAQ8CDwIPAg8CDwIPAg8CDwIPAg8CAQABAA8CDwIPAg8CDwIPAg8CDwIPAgEAAQAPAg8CDwIPAg8PDwIPAg8CDwIPAg8CDwIPAg8CDwIPAg8CDwIPAg8CDwIPAg8CDwIPAg8CDwIPAg8CDwIPAg8CDwIPAg8CAQEBAQEBAQEBAQEPAgEAAAAAAAAAAAAADwIPAg8CDwIPAg8CDwIPAg8CDwIPAg8CDwIPAg8CDwIPAg8CDwIPAgEBAQEBAQEBAQEBDwIPAg8CDwIPAg8CDwIBAAAAAAAAAAAAAA8CDwIPAg8CDwIPAg8CAAMAAQEBDwIPAgEBAAEAAAAPAg8CDwIPAg8CAAAAAQABAQ8CAQABAQ8CAQABAAEBAQEBAQEAAAABAAEBAQEAAQABAAEBDwIPAg8CDwIPAg8CDwIAAQIADwIBAQABAAEBAQABAQABAAAAAQEBAQEBAQABAQEPAgABDwIBAA8CAAEPAgEBDwEBAQAAAQEAkY8CDwIPAg8CDwIBAA8CAQEPAg8CDwIBAAEADwIBAAEADwIPAg8CDwIPAg8CDwIPAg8CD+IPAgEBAQABAAABAAABAAEAAAEAAQABAAABAAAAAwABAQEAAQAAAQAAAQABAAABAAEAAQAAAQAAAAECDwIBAgAAAAEAAAEAAQAAAQABAAEAAAEAAAEAAQEBAAADAAABAAABAAEAAAEAAQABAAABAAABAAEBAA8CAQEPAgEBAQ8CDwIPAg8CDwIPAg8CAA8CDwIPAg8CDwIPAg8CDwIPAg8CDwIAAAAPAg8CAAABAQ8CDwIBAQAADwIPAg8CDwIPAg8CDwIBDwIPAg8CAA8CAQ8CDwIPAgEPAgEPAg8CDwIPAg8CDwIPAg8CAA8CDwIADwIPAg8CDwIBAQQBAAEAAA8CDwIPAgAADwIPAg8CDwIPAg8CDwIPAg8CDwIPAgEAAAABAAEADwIAAQAAAAEJAAABBwEBAgABBgEADQABAQEPAg8CDwIPAg8CDwIPAg8CAQABAA8CDwIPAg8CDwIPAg8CDwIPAgEAAQAPAg8CDwIPAg8CDwIPAg8CDwIPAg8CDwIPAg8CDwIPAg8CDwIPAg8CDwIPAg8CDwIPAg8CDwIPAg8CDwIPAg8CDwIPAg8CDwIPAg8CDwIPAg8CDwIPAg8CDwIBAQEBAQEBAQEBAQ8CAQAAAAAAAAAAAAAPAg8CAQAAAAAAAAAAAAAPAgEBAQEBAQEBAQEBDwIPAg8CDwIPAg8CDwIPAg8CDwIPAg8CDwIPAg8CDwIPAgEAAQEBAQABAQAAAQEAAQIBAQEBAQABAQEAAwAADwIPAgEADwIBAQAADwIPAgEBAAEBAA8CDwIBAAEADwIPAg8CDwIAAwEBAAEBAQEAAQ/iAQADAAAAAAABAAAAAQIAAA8CDwIPAgAAAQABDwIBAAEAAA8CAQABAA8CAwABADEAbwIPAg8CAQABAA8CAQABAA8CDwIPAg8CDwIPAg8CAQ8CAQ8CDwIP4g8CAQEBAAEAAAEAAAEAAQAAAQABAAEAAAEAAAADAAEBAQABAAABAAABAAEAAAEAAQABAAABAAAAAQIPAg8CAQIAAAABAAABAAEAAAEAAQABAAABAAABAAEBAQAAAwAAAQAAAQABAAABAAEAAQAAAQAAAQABAQAPAgEBDwIBAQEPAg8CDwIPAg8CDwIPAgAPAg8CDwIPAg8CDwIPAg8CDwIPAg8CAAAADwIPAgAAAQEPAg8CAQEAAA8CDwIPAg8CDwIPAg8CAQ8CDwIPAgAPAgEPAg8CDwIBDwIBDwIPAg8CDwIPAg8CDwIPAgAPAg8CAA8CDwIPAg8CAAAAAQEBAAYAAQUBAQABAAgBAAEGAAABDwIPAg8CAAAPAg8CAQAAAAEAAQAPAg8CDwIPAg8CDwIPAg8CDwIPAg8CDwIBAQQAAwARAQEBggEAAA8CDwIPAg8CDwIPAgEAAQAPAg8CDwIPAg8CDwIPAg8CDwIBAAEADwIPAg8CDw8PAgEADwIPAg8CDwIPAg8CDwIPAg8CDwIPAg8CDwIPAg8CDwIPAg8CDwIPAg8CDwIPAg8CDwIPAg8CDwIPAg8CDwIPAg8CDwIPAg8CDwIPAg8CDwIPAg8CAQEBAQEBAQEBAQEPAgEAAAAAAAAAAAAADwIPAgEAAAAAAAAAAAAADwIBAQEBAQEBAQEBAQ8CDwIPAg8CDwIPAg8CDwIPAg8CDwIPAg8CDwIPAgEBAAAPAg8CAAEAAA8CAQ8CDwIPAgEPAg8CDwIPAgAAAQAPAgEBBAABAAEADwIBAAEBAQABAAEAAAEAAQABAAEBAQEBAAEBAQAABgEPAgEBAAMAAQEADwIAAAEAAQABAAAAAAAAAwABAQABAA/gAAEAAQEBAAEPAgEBAAEBAA8CDwIDAAEAMQBvAgMAAQAxAG8CDwIPAg8CDwIPAgEPAgEPAgEAAQAPAgEAAQAPAgABAAEPAg8CDwIAAwEADwIBDwIPAg8CAQ8CDwIPAg8CD+IPAgEBAQABAAABAAABAAEAAAEAAQABAAABAAAAAwABAQEAAQAAAQAAAQABAAABAAEAAQAAAQAAAAECDwIBAgAAAAEAAAEAAQAAAQABAAEAAAEAAAEAAQEBAAADAAABAAABAAEAAAEAAQABAAABAAABAAEBAA8CAQEBDwIBAQEPAg8CDwIPAg8CDwIPAgAPAg8CDwIPAg8CDwIPAg8CDwIPAg8CAAAADwIPAgAAAQEPAg8CAQEAAA8CDwIPAg8CDwIPAg8CAQ8CDwIPAgAPAgEPAg8CDwIBDwIBDwIPAg8CDwIPAg8CDwIPAgAPAg8CAA8CDwIPAgEAAAAPAg8CDwIAAAAPAg8CDwIPAg8CDwIPAg8CDwIPAgEAAAABAAEADwIAAQAAAAABCQABD+ABAgABBgEADQABAQEPAg8CDwIPAgEBBAEAAQAADwIBAQ8CDwIPAg8CDwIPAg8CDwIBAAEADwIPAg8CDwIPAg8CDwIPAg8CAQABAA8CDwIPAg8CDwIPAg8CDwIPAg8CDwIBDwIPAg8CDwIPAg8CDwIPAg8CDwIPAg8CDwIPAg8CDwIPAg8CDwIBDwIPAg8CDwIPAg8CDwIPAg8CDwIPAg8CDwIPAg8CDwIBAQEBAQEBAQEBAQ8CAQAAAAAAAAAAAAAPAg8CDwIPAg8CAQ8CDwIPAg8CDwIPAg8CAQ8CDwIPAg8CAQEBAQEBAQEBAQEPAgEAAAAAAAAAAAAADwIBAQAADwIPAg8CAQABAA8CDwIPAgEBAgEBAQAAAwAPAgEBAAEBAQEADwIPAg8CDwIPAg8CDwIPAg8CDwIBAQADAAEBAQABDwIBDwIBAQEAAAEPAgEPAg8CAQAAAQEBDwIBAQ8CAQEBAQQAAAEAAAAAAAEBAAABAAAAAwABAAEBAAAPAgEBAQABAQECAQABAQIBAQ/iAAAAAAEAAQABAAQADwIPAg8CDwIPAg8CDwIPAgEAAwEBAAEBAAAAAA8CAQABAA8CAQABAA8CDwIPAg8CDwIPAg8CDwIPAg8CDwIP7w8CDwIBAQEAAQAAAQAAAQABAAABAAEAAQAAAQAAAAMAAQEBAAEAAAEAAAEAAQAAAQABAAEAAAEAAAABAg8CDwIBAgAAAAEAAAEAAQAAAQABAAEAAAEAAAEAAQEBAAADAAABAAABAAEAAAEAAQABAAABAAABAAEBAA8CAQEBDwIPAg8CDwIPAg8CDwIADwIPAg8CDwIPAg8CDwIPAg8CDwIPAg8CAAABAQ8CDwIBAQAADwIPAg8CDwIPAg8CDwIBDwIPAg8CAA8CAQ8CDwIPAgEPAgEPAg8CDwIPAg8CDwIPAg8CAA8CDwIADwIPAg8CDwIPAg8CAAAADwIPAgEAAAABAAEADwIPAgEBDwIPAg8CAQEEAQABAAAPAg8CDwIBAA8CDwIPAg8CDwIAAAABAQEABgABBQEBAAEACAEAAQYAAAEPAgEBAQ8CDwIAAAAPAg8CDwIPAg8CDwIPAgEAAQAPAg8CDwIPAg8CDwIPAg8CDwIBAAEADwIPAg8CDwIPAg8CDwIPAg8CDwIBDwIPAg8CDwIPAg8CDwIPAg8CDwIPAg8CDwIPAg8CDwIPAg8CDwIBDwIPAg8CDwIPAg8CDwIPAg8CDwIPAg8CDwIPAg8CDwIBAQEBAQEBAQEBAQ8CAQAAAAAAAAAAAAAPAg8CDwIPAg8CAQ8CDwIPAg8CDwIPAg8CAQ8CDwIPAg8CAQEBAQEBAQEBAQEPAgEAAAAAAAAAAAAADwIPAg8CDwIPAgABAQABAIEAbwIBAQAADwIPAgEBAAEBAA8CDwIAAAEADwIPAg8CDwIAAQAADwIBDwIPAgEPAgEBAAAPAgEBAQEEAAEAAAAAAAAOAAUAAwEAAAEBAAABAAAAAA8CDwIPAgAAAAEAAA8CAAAAAQADAQAAAAAAAAECAAAGAQAEAA/gAQABAQEBDwIBAQQAAQABAA8CDwIPAg8CDwIBAAEADwIBAAEADwIBDwIPAgEPAg8CDwIPAg8CDwIPAg8CDwIPAg8CD+IPAgEBAQABAAABAAABAAEAAAEAAQABAAABAAAAAwABAQEAAQAAAQAAAQABAAABAAEAAQAAAQAAAAECDwIBAgAAAAEAAAEAAQAAAQABAAEAAAEAAAEAAQEBAAADAAABAAABAAEAAAEAAQABAAABAAABAAEBAA8CAQEPAgEBAQ8CDwIPAg8CDwIPAg8CAA8CDwIPAg8CDwIPAg8CDwIPAg8CDwIAAAAPAg8CAAAAAQAADwIPAgEBAQABAQ8CDwIPAg8CDwIPAg8CAQ8CDwIPAgAPAgEPAg8CDwIBDwIBDwIPAg8CDwIPAg8CDwIPAgAPAg8CAA8CDwIPAg8CDwIAAA8CDwIBAAAAAQABAA8CDwIPAg8CDwIPAg8CDwIPAgABAQEAAQAAD+APAg8CDwIPAg8CDwIAAQAAAAAJAAABBwEBAgABBgEADQABAQEPAg8CDwIPAg8CDwIBAAEADwIPAg8CDwIPAg8CDwIPAg8CAQABAA8CDwIPAg8CDwIPAg8CDwIPAg8CDwIPAg8CDwIPAg8CDwIPAg8CDwIPAg8CDwIPAg8CDwIPAg8CDwIPAg8CDwIPAg8CDwIPAg8CDwIPAg8CDwIPAg8CDwIPAgEBAQEBAQEBAQEBDwIBAAAAAAAAAAAAAA8CDwIBAAAAAAAAAAAAAA8CAQEBAQEBAQEBAQEPAg8CDwIPAg8CDwIPAg8CDwIPAg8CDwIPAg8CDw8PAg8CDwIPAgEADwIPAgEPAg8CAQABAA8CDwIPAgAAAAEAAQABAAEBBAAAAAEAAAABAgAAD+AAAQEBAQEBDwIPAgADAQAAAQEAAQAAAAAAAA/iAQAABQEBAQABAQEAAwAADwIBDwIPAg8CAQEAAA8CDwIPAg8CAQABAAEADwIAAQABAAEPAQQBAQABQG8BBAEBAAFAbwIPAg8CDwIPAg8CDwIPAg8CDwIBAAEADwIBAAEADwIPAg8CDwIPAg8CDwIBDwIBAQ8CDwIBD+IPAgEBAQEAAAEAAAEAAQAAAQABAAEAAAEAAAADAAEBAQABAAABAAABAAEAAAEAAQABAAABAAAAAQIPAg8CAQIAAAABAAABAAEAAAEAAQABAAABAAABAAEBAQAAAwAAAQAAAQABAAABAAEAAQAAAQAAAQEBAA8CDwIPAg8CDwIPAg8CAQ8CDwIPAg8CDwIADwIPAg8CDwIBDwIPAg8CAQ8CDwIPAg8CDwIPAg8CDwIPAg8CDwIPAg8CDwIPAg8CDwIPAg8CAAABAQ8CDwIPAg8CDwIPAg8CDwIPAg8CDwIBDwIPAg8CAA8CAQ8CDwIPAgEPAgEPAg8CDwIPAg8CDwIPAg8CDwIADwIBDwIPAgAPAg8CDwIPAg8CAQEEAQABAAAPAg8CDwIPAg8CDwIPAg8CDwIPAg8CDwIPAg8CDwIPAg8CDwIPAg8CDwIPAg8CDwIPAg8CDwIPAg8CDwIPAg8CDwIBAQAADwIPAg8CDwIPAg8CDwIPAgEAAAABAAEADwIPAgEAAAEAAAMAAQ8CAQEBAAEBAgEADwIAAQ8CAQEBDwIBAQEPAgEBAAAPAg8CAQECAQAAAQ8CDwIAAAAPAgEPAgEADwIPAgAAAA8CDwIBAA8CAAAFAQEBAQIBDwIPAgAAAwABAQAPAgEAAQAPAgAABQEPAgEAAQAAAAADAA8CAAEBAAABDwIAAAABAQEABgEAAQYAAAABDwIBAA8CAQABAA8CAQEAAAMBAQEAAQEPAgEBAQECAAAAAQAADwIPAg8CDwIPAg8CDwIBDwICAAEAAAABAQCAvwAEAgEE8gFPAg8CDwIPAg8CDwIBAAEADwIPAg8CDwIBDwIBDwIBAAEADwIBAQEBAQEBAQEBAQ8CAQAAAAAAAAAAAAAPAgEAAAAAAAAAAAAADwIBAQEBAQEBAQEBAQ8CDwIPAg8CDwIPAg8CDwIPAg8CDwIPAg8CDwIPAg8CDwIPAg8CDwIPAg/iAQAAAQAAAAAPAg8CDwIBDwIBAAEBAQABAAEAAAEAAQABAQ8CDwIBDwIPAg8CDwIBAA8CDwIBAQ8CAAMAEQEAAQEBUAEAAQBQAV8CDwIAAQEAAQEAAwEAwQAAAM/iATBPAgEBDwIAAQBBAAEAAACTAQABAPABbwIPAg8CDwIPAgEBAAEAAQECAQABAAEBAQABDwIBDwIBAAEBAQ8CAAEFAQAADwIAAQEBAAEPAg8CDwIPAgEADwIBAQ8CAQEPAgAADwIBAQAADwIAAA8CAAAPAg8CDwIPAgABAQEBAAEBAZCvAg8CDwIPAg8CDwIPAg8CDwIPAg8CDwIPAgAPAgEBAQAAAQEAAQEBAQEBAQ8CDwIPAg8CAQ8CDwIAAAABAAAAAAAAAA/gAQEPAg8CDwEPAg8BDwIPAg8CDwEPAg8CDwIPAg8BDwIPAg8CDwIPAg8CDwIPAg8CDwIADwIADwIPAgEPAgEPAg8BDwEPAQ8BDwIBAAEADwIPAg8CDwIBAQEBAAABAAABAAEAAAEAAQABAAABAAAAAwAPAg8CDwIBAAABAAAAAAAAAAAPAQ8CAAEBAAEBAQEBAQEBDwEPAQ8BDwEPAQ8BDwEPAQ8BDwEPAQ8CAQEBAgABAgAPAgAAAAAAAAAPAgEBAQEBAQEPAgECAgEBAAgAAAECAQ8CDwIAAAEBAAEBAAEAAQABAQABAAEBAAEBAgEPAgEAAAABAQABAQABAAEAAQEAAQABAQABAQECAQ8CAQEAAAEAAAEAAQAAAQABAAEAAAEAAAMADwIPAg8CAQAAAQEPAg8CAAEBAAEPAg8CDwIBAQEAAAEPAg8CDwIPAg8CDwIPAg8CDwIPAgEBBAEAAQAADwIAAAABAQAPAg8CDwIPAg8CAQ8CDwIPAgEPAgEPAg8CDwIPAg8CAQ8CDwIPAg8CDwIPAg8CDwIBAAEADwIPAg8CDwIPAg8CDwIPAg8CAQABAA8CDwIPAg8CDwIBAA8CAQAPAgEPAgEADwIBAA8CDwIPAg8CDwIPAgEADwIPAgEBDwIPAgADAAAvAgABDwIPAg8CAA8CDwIPAg8CDwIPAgEADwIBAQEBAQEBAQEBAQ8CDwIPAgEBDwIBAA8CAAAPAgEADwIPAg8CDwIBAA8CDwIBAAAAAAAAAAAAAA8CAAAPAgEADwIBAA8CDwIPAg8CDwIPAgADAAAvAg8CAQAAAF8CDwIBAQEBDwIPAg8CAQAAAA8BAQEBAQEBAQ8BAAAAAAAAAA8CAgMCAB8CAQ8CAQ8CAQABAA8CAQABAA8CAQAPAgEBDwIAAQABAAAPAgEBAAMBAA8CDwIPAg8CDwIPAg8CDwIPAg8CDwIPAg8CDwIPAg8CDwIPAg8CDwIPAg8CDwIPAg8CDwIPAg/gDwIBAAEAQQBzAQIAAQABAVCPAA8ADwIBAAEAQQBzAQIAAAEBQHQBAQABAGABXwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPDw8PDw8PDw8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADw8ADw8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADw8ADw8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8AAQ8PAA8ADwAPAA8ADwAPAA8BAQABAAFwXwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAAMAAQABAQ8ADwAPAA8ADwAPAA8AAQ8BAQ8ADwAPAA8ADwAPAA/gDwABAAEAAAGBcQECAAABAUB0AQEAAQAAAYBvAA8CAQABAEEAcwAAAAEBAHFSAQEBAAMB8AEBAAFwX1Kx8QEBAAEAUAFVAADRAAABcVIAAAABAQDxYgADAQHwAUBfAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAAQADwAPAA8AD+ADAfAAAUF/UvEAAQDBAF8ADwAPAA8ABAAPAA8ADwAPAA8ADwAPAAEADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8PAA8PAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8PAA8PAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8AAQ8PAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAADwAPDwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAADwAPAAEPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8PAA8PAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8PAA8PAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAADwAPAAEPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAADwAPAAEPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8AAQ8PAA8ADwAPAA8ADwAPAA8ADwAPAA8BAQABAAFwXwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADw8PDw8PDw8PAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAAEPAA8ADwAPAA8ADwAPAA8ADwAPAA8BAQ8ADwAPAA8AD+IBAAABC/ABQAEBAAEAUAFfAA8CAQABAEoBEAAAAAEBAHFSAQEBAAMB8AEBAAFwX1Kx8QEBAAEAUAFVAAMBANbyAV8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAAEADwAPAAEADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwIBAAEAQQBxAQEBAAEAUfEAAwEABvMAcQDzAQEAAUBTAQEBAAEAUaEBAQAB8PABbwAPAAQAAQAPAA8ADwAPAA8ADwAPAAQAAQAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAAAPAA8PAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADw8ADw8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADw8ADw8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADw8ADw8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADw8ADw8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwABDw8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAAAPAA8PAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAAAPAA8PAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAAAPAA8PAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAAAPAA8PAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADw8ADw8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADw8ADw8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwEBAAEAAXBfAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwEBAAEAAXBfAA8ADwAPAA8ADwABAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADw8PDw8PDw8PAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwABDwEBDwAPAA8ADwAPAA8AD+APAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8AC6AOsA/5oPBQCb/5QBBAD/NQUAnP/nAQX/UgYAMQCtpwzPhgQAAMEFECQD8C0HLABZIBAAugIkGwQDAAB2h1ZneKmGZYlomAFpAAAAAKAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAREEBAD8zwP///////wAADz////////wAAAD///8AAAzz//////z8AAD///////8AREEBAD8zwH1+fX59fgAADz99fn1+ffwAAAB+fX4AAAzzfX59fvz8AAB9fn1+fX4AAAAAAAAAAAAEAAAAAAAM/wAEAAAAAAAMfQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAARAAAAAwAgAwAAAB/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgD8AAACgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAAAAAADAAA/xAAAAAADAAAfQAAAAAAAAAAAAAAAAAAABAAAAAMgAAAAAEADAAAfwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAIA/AAAAoAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAAAAAAAAMAP9AAAAAAAAMAH0AAAAAAAAAAAAAAAAABAAAAAwAAIAAAAAAAABAAAAAwAB/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgD8AAACgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAM/0AAAAAAAAAMfQAAAAAAAAAAAAAAAAAEAAAAAAAMgAAAAAAAAAAAAABAAMAAAAB/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgD8AAACgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAM/0AAAAAAAAAMfQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAQAAAAyAAAwAAH8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACAPwAAAKAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAAAAMAAAAD/QAAAAMAAAAB9AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQFDAAAAIAADAAMf4AADAAAfwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAIA/AKAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEAAwAAAD/AAAEAAQAAAAAAAAAAAAAAAAAQAAAAAAM/wAAQAQAAAAIwAAAAH8AAAAAAAAFAAAAAMCA/zPAAH+Af4B/gH8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQKAAAAAAAAAAAAAAAAAAAAAQDAAAAH8AAAAAAAAAAAAABAAADAAA/wAABAAADAAAfgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAAAAAAMAAAP9AAAAAAMAA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AAAECAgAMAOAAAAAAABAwARAAACAQECAAABAICAEAAAAAAAEDAQEAAAIFVVVVcDAwMD///79AADAwP79wAEMAP/9DAgMAP7/AAwMDP///gwAAAz9/gwMABD9/8AAAAD9AADAgP7AAADA///AwMAA//79AMAwMP79/wwAAAD/AAAMCP4MAAAM//9VVVVVAAAAgEBAgMCmwAAAAKUEDAQABAAABAwEBAAAAAgEBAgMDAAApqUAAEDABEAAAABAwEAABAAAgEBAgDAwpqUAAAQMBAQAAAAEDAQABFVVVVUAAADA/8DAwMD//v21wAAAALYMCAwA/v8AAAwI/gwAAAD/DAwMDP///v0MDAAAtbYAAMCA/sAAAAD/wIDAAP7/AADAwP//wMAwMP79tbYAAAwI/gwAAAD/DAgMAP7/VVVVVYBAgABAgADApcAABACmCAAEAAgAAAAECAQIAAQIAAwMAAClpkAAgABAAIAAAABAgECAAECAADAwpaYEAAgABAAIAAAABAhVVVVVwMDAAP3+/cDAAMD+/bTAAAwAs/4MAAwA/f4MAAAA/QwMDAz+/f79AAwMAP79DAwAALSzwADAAP79wADAAP79AADAwP79wMAAwP79/sAAMDD9tLMMAAwA/v0MAAwA/v0AAAwM/v0AAAAAAAAAAFVVVRUEBAgAAAQCAgBAAAAAAABAwEAAAASAQECAAABAgIAwgAADAACAQECAAMATwAAAABQAwMBAFBFAgAAAAABAwAQAQECAVVVVFQwMDAD//v0ADAMD/v3/AMAAAP8AAADA/oDAAAD/wMDAwP///v0AAMDA/v3AEMAA//0AAMDA///AwADA/v3awAAAANkAwMDA2yP/wMAAAP79AADAgP4AwMDA//79VVVVRQAACAQECAMDpqUAAABAwEAAAAQAQMBABAAAAIBAQIDApsAAAAClQMBAAAQAAIDAwcAAAMC+vQAAwADAAACAwAMAwEAABIDAAMADBFVVVUUAAAwM//8MDAMD/v21tgAAAMD+gMAAAP8AwIDA/v8AAADA/8DAwMD//v21wAAAALbAgMAA/v8AAMDA/3/AAADAfn0AAMAAfwAAwED/AIDAAP/AQACA/1VVVVEECAAECAADA6WmAEAAgABAAIAAAABAgECAAECAAMClwABAAKaAAACAQECAAAAAAMATwMAAgCgTQECA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";
const MESHOPT_META = {"kit":{"khatch":{"wr":0.384,"wp":[[-0.384,1.037],[0.384,1.037],[-0.384,-1.037],[0.384,-1.037]],"offs":[-1.131,0,1.131],"rad":0.9,"len":3.648,"wid":1.664,"h":1.408},"ksedan":{"wr":0.384,"wp":[[-0.384,0.845],[0.384,-0.845],[-0.384,-0.845],[0.384,0.845]],"offs":[-1.012,0,1.012],"rad":0.922,"len":3.264,"wid":1.92,"h":1.664},"kvan":{"wr":0.384,"wp":[[-0.384,0.973],[0.384,0.973],[-0.384,-0.973],[0.384,-0.973]],"offs":[-1.091,0,1.091],"rad":0.922,"len":3.52,"wid":1.92,"h":1.728},"kpickup":{"wr":0.384,"wp":[[0.384,1.002],[-0.384,1.002],[-0.384,-0.816],[0.384,-0.816]],"offs":[-1.089,0,1.089],"rad":0.922,"len":3.514,"wid":1.92,"h":1.664},"ktruck":{"wr":0.384,"wp":[[-0.384,1.101],[0.384,1.101],[-0.384,-0.973],[0.384,-0.973]],"offs":[-1.171,0,1.171],"rad":0.922,"len":3.776,"wid":1.92,"h":1.664},"ktaxi":{"wr":0.384,"wp":[[-0.384,0.973],[0.384,0.973],[0.384,-0.973],[-0.384,-0.973]],"offs":[-1.091,0,1.091],"rad":0.922,"len":3.52,"wid":1.92,"h":1.92},"kpolice":{"wr":0.384,"wp":[[0.384,-1.037],[0.384,1.037],[-0.384,-1.037],[-0.384,1.037]],"offs":[-1.151,0,1.151],"rad":0.922,"len":3.712,"wid":1.92,"h":1.664},"kambulance":{"wr":0.384,"wp":[[-0.384,1.293],[0.384,1.293],[-0.384,-1.165],[0.384,-1.165]],"offs":[-1.29,0,1.29],"rad":0.922,"len":4.16,"wid":1.92,"h":2.304}},"kay":{"A":{"spanX":1.2067,"spanZ":1.45},"E":{"spanX":2.0067,"spanZ":1.45},"G":{"spanX":2.0067,"spanZ":1.45}},"bus":true};

// Kenney Car Kit bodies (CC0, https://kenney.nl/assets/car-kit), baked by tools/bake_kit.py.
// Wheels are the game's own. Vertex tag 1 is paint, tag 2 is a warm accent. Do not edit by hand.
const KIT = {};
function kitMesh(name, color) {
  const src = KIT[name].geo;
  const g = src.clone();
  g.userData.tags = src.userData.tags;
  recolorTag(g, 1, color);
  return g;
}
// Geometry is decoded from the meshopt GLB in src/03b_meshopt.js (MESHOPT).
function kitRoster() {
  const q = settings.quality;
  const few = ['khatch', 'ksedan', 'kvan', 'ktaxi'];
  const mid = ['khatch', 'ksedan', 'kvan', 'kpickup', 'ktaxi', 'kpolice'];
  const all = ['khatch', 'ksedan', 'kvan', 'kpickup', 'ktruck', 'ktaxi', 'kpolice', 'kambulance'];
  if (q === 'low') return { models: few, n: 6, parked: 3, buses: 1 };
  if (q === 'high') return { models: all, n: 18, parked: 8, buses: 2 };
  return { models: mid, n: 14, parked: 6, buses: 2 };
}

// ======================= Kenney bodies + city bus =======================
function lampMats(c) {
  c.headMat = mkMat({ color: 0xfff6d8, emissive: 0xfff2c0, emissiveIntensity: 0.2 });
  c.tailMat = mkMat({ color: 0x990000, emissive: 0xff1010, emissiveIntensity: 0.3 });
}
function addLamps(c, heads, tails) {
  const B = c.body;
  B.add(new THREE.Mesh(mergeBoxes(heads.map((h) => [...h, '#ffffff'])), c.headMat));
  B.add(new THREE.Mesh(mergeBoxes(tails.map((h) => [...h, '#ffffff'])), c.tailMat));
}
function addWheels(c, wr, pairs) {
  c.wr = wr;
  const WW = Math.max(0.18, wr * 0.62);
  const key = wr + '_' + WW + '_' + TOON + '_0';
  Car.wheelGeo = Car.wheelGeo || {};
  if (!Car.wheelGeo[key]) Car.wheelGeo[key] = wheelGeometry(wr, WW, false);
  c.wheels = [];
  for (const [wx, wz] of pairs) {
    const pv = new THREE.Group(); pv.position.set(wx, wr, wz); c.g.add(pv);
    const w = new THREE.Mesh(Car.wheelGeo[key], carMat()); w.castShadow = true; pv.add(w);
    c.wheels.push({ pv, w, front: wz > 0 });
  }
}
function buildKitBody(c, color) {
  const K = KIT[c.model];
  const B = c.body;
  c.offs = K.offs.slice(); c.rad = K.rad; c.bus = false;
  if (c.model === 'ktaxi') color = 0xf6c431;
  else if (c.model === 'kpolice') color = 0xf4f6fa;
  else if (c.model === 'kambulance') color = 0xf4f1ea;
  c.color = color;
  c.geo = kitMesh(c.model, color);
  const bm = new THREE.Mesh(c.geo, carMat()); bm.castShadow = true; B.add(bm); c.bodyMesh = bm;
  if (TOON) { c.hull = new THREE.Mesh(c.geo, hullMats().norm); B.add(c.hull); }
  lampMats(c);
  const hy = Math.min(K.h * 0.45, 0.9), hz = K.len * 0.47, wx = K.wid * 0.28;
  addLamps(c,
    [[0.22, 0.12, 0.05, -wx, hy, hz], [0.22, 0.12, 0.05, wx, hy, hz]],
    [[0.24, 0.14, 0.05, -wx, hy, -hz], [0.24, 0.14, 0.05, wx, hy, -hz]]);
  if (c.model === 'kpolice') {
    c.lbR = new THREE.MeshBasicMaterial({ color: 0x661111 }); c.lbB = new THREE.MeshBasicMaterial({ color: 0x112266 });
    const y = K.h + 0.04;
    const r = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.12, 0.26), c.lbR); r.position.set(-0.18, y, 0); B.add(r);
    const b2 = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.12, 0.26), c.lbB); b2.position.set(0.18, y, 0); B.add(b2);
  } else if (c.model === 'ktaxi') {
    const sign = new THREE.Mesh(mergeBoxes([[0.42, 0.14, 0.16, 0, K.h + 0.06, 0, '#f6c431', 2]]), carMat());
    if (TOON) sign.add(new THREE.Mesh(sign.geometry, hullMats().small));
    B.add(sign);
  } else if (c.model === 'kambulance') {
    B.add(new THREE.Mesh(mergeBoxes([[0.46, 0.08, 0.14, 0, K.h + 0.02, 0, '#e8503a', 2], [0.14, 0.08, 0.46, 0, K.h + 0.02, 0, '#e8503a', 2]]), carMat()));
  }
  addWheels(c, K.wr, K.wp);
}
function buildBusBody(c, color) {
  c.bus = true; c.offs = [-3.3, -1.15, 1.15, 3.3]; c.rad = 1.22;
  const B = c.body;
  // MESHOPT bus body (same boxes, packed by glTF-Transform). Lamps and wheels stay live.
  c.geo = MESH.bus ? MESH.bus.clone() : new THREE.BoxGeometry(2.3, 2.2, 8);
  if (MESH.bus) { c.geo.userData.tags = MESH.bus.userData.tags; recolorTag(c.geo, 1, color); }
  const bm = new THREE.Mesh(c.geo, carMat()); bm.castShadow = true; B.add(bm); c.bodyMesh = bm;
  if (TOON) { c.hull = new THREE.Mesh(c.geo, hullMats().norm); B.add(c.hull); }
  lampMats(c);
  addLamps(c,
    [[0.28, 0.16, 0.06, -0.7, 0.7, 4.18], [0.28, 0.16, 0.06, 0.7, 0.7, 4.18]],
    [[0.32, 0.18, 0.06, -0.72, 0.82, -4.18], [0.32, 0.18, 0.06, 0.72, 0.82, -4.18]]);
  addWheels(c, 0.46, [[-1.02, 2.65], [1.02, 2.65], [-1.02, -2.5], [1.02, -2.5]]);
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
function applyFog() { const q = QUALITY[settings.quality]; scene.fog = new THREE.Fog(G.night ? FOG_NIGHT : FOG_DAY, q.dist * (TOON ? 0.36 : 0.45), q.dist); }
function applyTime() {
  const n = G.night;
  sky.material.uniforms.top.value.set(n ? '#050b18' : (TOON ? '#6fb7ff' : '#3f7fc4'));
  sky.material.uniforms.bottom.value.set(n ? '#14223a' : (TOON ? '#d8f0ff' : '#cfe0ee'));
  sky.material.uniforms.sunCol.value.set(n ? '#9fb3d9' : '#fff1c8');
  sky.material.uniforms.night.value = n ? 1 : 0;
  const sd = n ? new THREE.Vector3(-0.4, 0.55, 0.5) : new THREE.Vector3(0.45, 0.75, 0.35); sd.normalize();
  sky.material.uniforms.sunDir.value.copy(sd); G.sunDir = sd;
  hemi.intensity = n ? 0.22 : (TOON ? 0.55 : 1.6); hemi.color.set(n ? '#5a6f99' : (TOON ? '#d5e4f4' : '#dfefff')); hemi.groundColor.set(n ? '#141820' : (TOON ? '#6d8a48' : '#6f7a5a'));
  sun.intensity = n ? 0.28 : (TOON ? 1.65 : 2.4); sun.color.set(n ? '#9fb6ff' : '#fff3dd');
  W.mats.wall.emissiveIntensity = n ? 1.1 : 0;
  W.mats.water.color.set(n ? '#1b3550' : (TOON ? '#47a6e0' : '#3f7398'));
  W.mats.ground.color.set(n ? (TOON ? '#5f7f3c' : '#5d7048') : (TOON ? '#a3d65c' : '#93ad6e'));
  headlight.intensity = n ? 60 : 0;
  for (const c of cars.concat(TR.pool, POL.cars)) { if (!c.headMat) continue; c._hl = c._tl = undefined; c.headMat.emissiveIntensity = n ? 2.3 : 0.12; c.tailMat.emissiveIntensity = n ? 1.25 : 0.22; }
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.toneMappingExposure = 1;
  if (typeof POST !== 'undefined' && POST.exp) POST.exp.value = n ? 1.08 : 1;
  $('btnNight').textContent = n ? '☀️' : '🌙';
  applyFog();
}

async function init() {
  const canvas = $('c');
  renderer = new THREE.WebGLRenderer({ canvas, antialias: QUALITY[settings.quality].aa, powerPreference: 'high-performance' });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(65, innerWidth / innerHeight, 0.3, 2000);
  setLoad(0.05, 'Wczytywanie danych OpenStreetMap…');
  const data = await loadData();
  setLoad(0.12, 'Modele…'); await nextFrame();
  if (typeof decodeMeshoptAssets === 'function') await decodeMeshoptAssets();
  setLoad(0.15, 'Teren i zieleń…'); await nextFrame();
  await buildWorld(data, scene, renderer);
  W.treeDensity = QUALITY[settings.quality].trees;
  sky = makeSky(scene);
  hemi = new THREE.HemisphereLight(0xdfefff, 0x6f7a5a, 1.6); scene.add(hemi);
  sun = new THREE.DirectionalLight(0xfff3dd, 2.4); scene.add(sun); scene.add(sun.target);
  sun.shadow.mapSize.set(2048, 2048); const sc = sun.shadow.camera; sc.left = -130; sc.right = 130; sc.top = 130; sc.bottom = -130; sc.near = 10; sc.far = 600; sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.05;
  headlight = new THREE.SpotLight(0xfff2d0, 0, 90, 0.55, 0.5, 1.2); scene.add(headlight); scene.add(headlight.target);

  player = { x: 0, z: 0, y: 0, vy: 0, h: 0, mesh: makeWalker({ comic: true, hairStyle: 'cap', shirt: 0xf6d34a, jacket: 0xe8503a, pants: 0x243056, bag: 0xf7f1e4 }), speed: 0, onGround: true };
  scene.add(player.mesh);
  spawnAtRynek();
  spawnCars(); spawnEgg(); initTraffic(); initPolice(); initMissions(); initGarages(); initDriveFx();
  applyTime(); applyQuality();
  initMinimap(); initBigMap(); initInput(); initRadio(); if (typeof initAmbience === 'function') initAmbience(); initMenu(); initNav(); if (typeof initRange === 'function') initRange();
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
  const roster = kitRoster(); const pal = TOON ? TOON_CAR_COLORS : CAR_COLORS;
  spots.slice(0, 14).forEach((s, i) => {
    const model = i < roster.parked ? roster.models[i % roster.models.length] : '';
    cars.push(new Car(scene, pal[i % pal.length], s[0], s[1], s[2] + (rnd() < 0.5 ? 0 : Math.PI), model ? { model } : {}));
  });
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
    $('speedo').classList.remove('hidden'); $('touch').classList.add('incar'); $('tEnter').textContent = 'Wysiądź';
    return true;
  }
  const c = activeCar; if (c.speed > 4) { toast('Zwolnij, aby wysiąść'); return false; }
  const fx = Math.sin(c.h), fz = Math.cos(c.h); const rx = Math.cos(c.h), rz = -Math.sin(c.h);
  let px = c.x - rx * 2.0, pz = c.z - rz * 2.0;
  if (insideBuilding(px, pz, 0.5)) { px = c.x + rx * 2.0; pz = c.z + rz * 2.0; }
  if (insideBuilding(px, pz, 0.5)) { [px, pz] = findFree(c.x - fx * 3.5, c.z - fz * 3.5, 0.6); }
  player.x = px; player.z = pz; player.y = groundH(px, pz); player.h = c.h; player.mesh.visible = true;
  c.vx = c.vz = 0; activeCar = null; G.mode = 'foot'; if (c.rider) c.rider.visible = false;
  $('speedo').classList.add('hidden'); $('touch').classList.remove('incar'); $('tEnter').textContent = 'Wsiądź';
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
    const hop = typeof bvhMove === 'function' ? bvhMove(player.x, player.z, nx, nz, 0.35, 0.9) : null;
    collideCircle(hop ? hop.x : nx, hop ? hop.z : nz, 0.35, col, true, !(hop && hop.used));
    if (hop && hop.hit) { col.hit = true; col.nx = hop.nx; col.nz = hop.nz; }
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
  let thr = 0, brk = 0, steerIn = 0, hand = false; const isPlayer = drive === true;
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
  const OR = c.offroad, st = c.st; let MAXV = st ? st.maxv : (OR ? 41 : 48); let ACC = st ? st.acc : (OR ? 14 : 13); const BRK = st ? st.brk : 28;
  const GRIP = st ? st.grip : 9, STEER = st ? st.steer : 0.55;
  if (c.bus) { MAXV = Math.min(MAXV, 30); ACC = Math.min(ACC, 7); }
  if (c.pmul && c !== activeCar) { MAXV *= c.pmul; ACC *= c.pmul; } // police slowed down at low wanted levels
  if (c.hp < 25 && !c.wrecked && !c.police) MAXV *= 0.85; // badly damaged engine
  c.nitroOn = false;
  if (isPlayer && st && st.nitro && typeof nitroTick === 'function') { const want = G.keys.has('ShiftLeft') || G.keys.has('ShiftRight') || G.keys.has('KeyX') || G.touch.nitro; if (nitroTick(c, want && thr > 0 && !c.air, dt)) { c.nitroOn = true; MAXV *= st.nboost; ACC *= st.nboost * 1.5; } }
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
  if (hand) { vF -= Math.sign(vF) * Math.min(Math.abs(vF), (thr > 0 ? 5 : 9) * dt); }
  const maxSteer = (c.bus ? STEER * 0.62 : STEER) / (1 + Math.abs(vF) * 0.035);
  c.steer = lerp(c.steer, steerIn * maxSteer, Math.min(1, dt * (drive && G.touch.jon ? 7 : 6)));
  c.gripK = hand ? 0 : Math.min(1, (c.gripK === undefined ? 1 : c.gripK) + dt * (thr > 0 ? 1.5 : 3)); // grip comes back gradually after the handbrake → longer, controllable drifts
  const gFull = GRIP * surfGrip, gLo = Math.min(1.8, gFull);
  const grip = c.air ? 0.2 : (hand ? 1.3 : gLo + (gFull - gLo) * c.gripK * c.gripK);
  vR -= vR * Math.min(1, grip * dt);
  const yawRate = vF / 2.6 * Math.tan(c.steer) * (hand ? 1.35 : 1) * (c.air ? 0.15 : 1);
  c.h += yawRate * dt; c.yawRate = yawRate;
  // inertia: with the handbrake (and while grip recovers) the velocity lags behind the body → real slip angle / drift
  const lag = c.air ? 1 : hand ? 0.85 : (1 - c.gripK) * 0.75, vh = c.h - yawRate * dt * lag;
  const nfx = Math.sin(vh), nfz = Math.cos(vh), nrx = Math.cos(vh), nrz = -Math.sin(vh);
  c.vx = nfx * vF + nrx * vR; c.vz = nfz * vF + nrz * vR;
  // move with substeps and collide with buildings
  const dist = Math.hypot(c.vx, c.vz) * dt; const steps = Math.max(1, Math.ceil(dist / 0.3));
  let impact = 0;
  for (let i = 0; i < steps; i++) {
    const ox = c.x, oz = c.z;
    c.x += c.vx * dt / steps; c.z += c.vz * dt / steps;
    const hop = typeof bvhMove === 'function' ? bvhMove(ox, oz, c.x, c.z, c.rad, 0.7) : null;
    if (hop && hop.used) {
      c.x = hop.x; c.z = hop.z;
      if (hop.hit) {
        const vn = c.vx * hop.nx + c.vz * hop.nz;
        if (vn < 0) { impact = Math.max(impact, -vn); c.vx -= vn * hop.nx * 1.35; c.vz -= vn * hop.nz * 1.35; c.vx *= 0.8; c.vz *= 0.8; }
      }
    }
    for (const off of c.offs) {
      const cx = c.x + Math.sin(c.h) * off, cz = c.z + Math.cos(c.h) * off;
      collideCircle(cx, cz, c.rad, col, false, !(hop && hop.used));
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
          if (-vn > 2.5 && (o === activeCar || c === activeCar)) carHitEvent(c === activeCar ? o : c, -vn); // judged on pre-impact velocities
          impact = Math.max(impact, -vn); c.vx -= vn * nx * 0.6; c.vz -= vn * nz * 0.6; o.vx += vn * nx * 0.6; o.vz += vn * nz * 0.6;
          if (-vn > 2.5) { trafficHit(o, c, -vn); damageCar(o, impactDamage(-vn)); if (o === activeCar && -vn > 4) collisionFx(o, -vn, (c.x + o.x) / 2, (c.z + o.z) / 2); }
        }
        o.sync();
      }
    }
  }
  const now = performance.now();
  if (impact > 4) collisionFx(c, impact);
  if (impact > 3) { damageCar(c, impactDamage(impact)); if (c === activeCar && now - (G.lastHit || 0) > 700) { G.lastHit = now; G.collisions++; if (typeof missionImpact === 'function') missionImpact(impact); toast('Bum! Kolizja'); } }
  updateCarVertical(c, dt);
  c.sync();
  { const hs = Math.sin(c.h), hc = Math.cos(c.h); c.vFl = c.vx * hs + c.vz * hc; c.vRl = c.vx * hc - c.vz * hs; } c.thrl = thr; c.handl = hand; c.brkl = brk;
  c.spin += vF * dt / (c.wr || 0.36);
  for (const w of c.wheels) { w.w.rotation.x = c.spin; if (w.front) w.pv.rotation.y = c.steer; }
  carLights(c, thr < -0.12 || !!hand);
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
    tx = player.x; tz = player.z; ty = player.y + 1.6; dist = G.camZoom ? 3.6 : 5.6; height = 0.35;
  }
  const cp = Math.cos(G.pitch), sp = Math.sin(G.pitch);
  let px = tx - Math.sin(G.yaw) * dist * cp, pz = tz - Math.cos(G.yaw) * dist * cp, py = ty + height - sp * dist;
  if (G.mode === 'car') py = ty + height - sp * dist * 0.5;
  // camPull: chase camera only (no first person). Pull in when a building sits between the lens and the player.
  const steps = 16; let lastOk = 1;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps; const sx = lerp(tx, px, t), sz = lerp(tz, pz, t), sy = lerp(ty + 0.3, py, t);
    if (camBlocked(sx, sz, sy)) { lastOk = Math.max(0.08, (i - 1) / steps * 0.92); break; }
  }
  if (typeof bvhCamDist === 'function') {
    const tB = bvhCamDist(tx, ty + 0.3, tz, px - tx, py - (ty + 0.3), pz - tz);
    if (tB != null) lastOk = Math.min(lastOk, tB);
  }
  px = lerp(tx, px, lastOk); pz = lerp(tz, pz, lastOk); py = Math.max(groundH(px, pz) + 0.45, lerp(ty, py, lastOk));
  camPos.set(px, py, pz);
  if (G.mode === 'car') camera.position.lerp(camPos, Math.min(1, dt * 10)); else camera.position.copy(camPos);
  camLook.set(tx, ty + (G.mode === 'car' ? 0.4 : 0.1), tz);
  camera.lookAt(camLook);
  if (G.shake > 0.001) { const k = G.shake * G.shake * 0.35; camera.position.x += (Math.random() - 0.5) * k; camera.position.y += (Math.random() - 0.5) * k; camera.position.z += (Math.random() - 0.5) * k; camera.rotation.z += (Math.random() - 0.5) * k * 0.06; G.shake = Math.max(0, G.shake - dt * 2.2); }
  const fov = 65 + (G.mode === 'car' && activeCar && activeCar.nitroOn ? 7 : 0); if (Math.abs(camera.fov - fov) > 0.05) { camera.fov += (fov - camera.fov) * Math.min(1, dt * 5); camera.updateProjectionMatrix(); }
}
function camBlocked(x, z, y) {
  if (insideBuildingH(x, z, y)) return true;
  const o = 0.42;
  return insideBuildingH(x + o, z, y) || insideBuildingH(x - o, z, y) || insideBuildingH(x, z + o, y) || insideBuildingH(x, z - o, y);
}
function insideBuildingH(x, z, y) {
  const a = W.bCells.get(Math.floor(x / 32) * 100000 + Math.floor(z / 32)); if (!a) return false;
  for (const i of a) { const b = W.buildings[i]; if (y < b.h && pointInRing(x, z, b.ring)) return true; }
  return false;
}

let visT = 0;
function updateVisibility(force) {
  const q = QUALITY[settings.quality]; const cx = camera.position.x, cz = camera.position.z;
  if (W.ground) { W.ground.position.x = Math.round(cx / 125) * 125; W.ground.position.z = Math.round(cz / 125) * 125; }
  // kontury budynków (linie ekranowe) tylko w pobliżu – daleko i tak giną we mgle, a kosztują dużo wierzchołków
  const EDGE_D = (q.edge || 400) * (STYLE === 'lite' ? 0.75 : 1);
  const D = G.camOverride ? 2600 : (G.started ? q.dist : Math.max(q.dist, 900));
  for (const v of W.visObjects) {
    const d = Math.hypot(v.x - cx, v.z - cz) - v.r;
    if (v.near) v.obj.visible = d < TREE_NEAR && d < D + v.bias;
    else if (v.detail) { const lim = settings.quality === 'high' ? 170 : (settings.quality === 'med' ? 130 : 0); v.obj.visible = lim > 0 && d < lim; }
    else if (v.far) v.obj.visible = d >= TREE_NEAR - 10 && d < D + v.bias;
    else if (v.edge) v.obj.visible = d < Math.min(D + v.bias, EDGE_D);
    else v.obj.visible = d < D + v.bias;
  }
}

let fpsAcc = 0, fpsN = 0, hudT = 0;
function loop() {
  const rawDt = clock.getDelta(); let dt = Math.min(0.05, rawDt); const tU = performance.now();
  if (G.started && !G.paused) {
    G.gameT = (G.gameT || 0) + dt;
    if (G.inRange) { /* stanowisko trzyma kamerę; miasto dalej żyje */ }
    else if (G.cut) { G.cut.t -= dt; if (G.mode === 'car') updateCar(activeCar, dt, { thr: 0, steer: 0, hand: true }); if (G.cut.t <= 0) { const f = G.cut.fn; G.cut = null; f(); } }
    else if (G.mode === 'foot') updateFoot(dt); else updateCar(activeCar, dt, true);
    updateParked(dt);
    updateTraffic(dt); updatePolice(dt); updateDamage(dt); updateShops(dt);
    updateEgg(dt); updateMissions(dt); updateNav(dt); updateGarages(dt); updateDriveFx(dt); if (typeof updateRange === 'function') updateRange(dt);
    const eh = G.inRange ? null : (eggHint() || missionHint() || (typeof rangeHint === 'function' ? rangeHint() : null) || garageHint() || shopHint());
    const near = G.mode === 'foot' && cars.some((c) => Math.hypot(c.x - player.x, c.z - player.z) < 3.8);
    const ride = (!eh && !near && typeof rideHint === 'function') ? rideHint() : '';
    hint(eh || (near ? (isTouch ? 'Naciśnij Wsiądź' : 'Naciśnij E albo F, aby wsiąść') : '') || ride);
    const lbl = G.mode === 'foot' ? (eh ? (nearEggButton() ? 'TELEPORT' : 'AKCJA') : 'Wsiądź') : 'Wysiądź';
    if (G.tLbl !== lbl) { G.tLbl = lbl; $('tEnter').textContent = lbl; }
  }
  engineTick(rawDt);
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
  if (typeof updateBlobs === 'function') updateBlobs();
  updateRadio(dt);
  if (typeof updateAmbience === 'function') updateAmbience(dt);
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
  if (!W.props) W.props = [];
  W.props.push({ x: mon[0], z: mon[1], r: 2.4 });
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
function actionE() { if (G.cut) return false; if (G.inRange && typeof rangeAction === 'function') return rangeAction(); if (typeof dialogAction === 'function' && dialogAction()) return true; const b = nearEggButton(); if (b === 'go') return eggGo(); if (b === 'back') return eggBack(); if (missionAction()) return true; if (typeof rangeAction === 'function' && rangeAction()) return true; if (typeof garageAction === "function" && garageAction()) return true; if (shopAction()) return true; return enterExit(); }
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
  buildWalkGraph();
}
function distEdge(e, x, z) {
  const p = e.pts; let best = 1e9, sAt = 0, hx = x, hz = z;
  const n = p.length / 2;
  for (let i = 1; i < n; i++) {
    const ax = p[i * 2 - 2], az = p[i * 2 - 1], bx = p[i * 2], bz = p[i * 2 + 1];
    const vx = bx - ax, vz = bz - az, l2 = vx * vx + vz * vz || 1e-4;
    let t = ((x - ax) * vx + (z - az) * vz) / l2; if (t < 0) t = 0; else if (t > 1) t = 1;
    const px = ax + vx * t, pz = az + vz * t, d = Math.hypot(x - px, z - pz);
    if (d < best) { best = d; hx = px; hz = pz; sAt = e.cum[i - 1] + (e.cum[i] - e.cum[i - 1]) * t; }
  }
  return { d: best, s: sAt, x: hx, z: hz };
}
function carriageNear(x, z) {
  const cx = Math.floor(x / 100), cz = Math.floor(z / 100);
  for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
    const arr = TR.egrid.get((cx + i) + ',' + (cz + j)); if (!arr) continue;
    for (const id of arr) {
      const e = TR.edges[id];
      if (distEdge(e, x, z).d < e.w * 0.5 + 0.25) return e;
    }
  }
  return null;
}
function buildWalkGraph() {
  TR.walk = []; TR.wnodes = []; TR.wadj = []; TR.wgrid = new Map();
  const key = (x, z) => Math.round(x * 2) + ',' + Math.round(z * 2);
  const ways = W.roads.filter((r) => (r.type === 'footway' || r.type === 'pedestrian') && r.pts.length >= 4 && !inOffZone(r.pts[0], r.pts[1]));
  const cnt = new Map();
  for (const r of ways) for (let i = 0; i < r.pts.length; i += 2) { const k = key(r.pts[i], r.pts[i + 1]); cnt.set(k, (cnt.get(k) || 0) + 1); }
  const nid = new Map();
  const node = (x, z) => { const k = key(x, z); let id = nid.get(k); if (id === undefined) { id = TR.wnodes.length; nid.set(k, id); TR.wnodes.push({ x, z }); TR.wadj.push([]); } return id; };
  for (const r of ways) {
    const p = r.pts, n = p.length / 2; let start = 0;
    for (let i = 1; i < n; i++) {
      if (i !== n - 1 && cnt.get(key(p[i * 2], p[i * 2 + 1])) <= 1) continue;
      const pts = Array.from(p.slice(start * 2, i * 2 + 2)); const cum = [0];
      for (let j = 1; j < pts.length / 2; j++) cum.push(cum[j - 1] + Math.hypot(pts[j * 2] - pts[j * 2 - 2], pts[j * 2 + 1] - pts[j * 2 - 1]));
      const len = cum[cum.length - 1];
      if (len > 1.4) {
        const a = node(pts[0], pts[1]), b = node(pts[pts.length - 2], pts[pts.length - 1]);
        const e = { id: TR.walk.length, a, b, pts, cum, len, w: r.width || 2, cross: false, use: true };
        const mid = edgeSample(e, len * 0.5, { x: 0, z: 0, h: 0 });
        const cell = TR.egrid.get(Math.floor(mid.x / 100) + ',' + Math.floor(mid.z / 100));
        let onRoad = false;
        if (cell) for (const id of cell) { const road = TR.edges[id]; if (distEdge(road, mid.x, mid.z).d < road.w * 0.5 + 0.2) { onRoad = true; break; } }
        if (onRoad) { if (len > 18) e.use = false; else e.cross = true; }
        if (e.use) {
          TR.walk.push(e); TR.wadj[a].push({ e: e.id, dir: 1 }); TR.wadj[b].push({ e: e.id, dir: -1 });
          for (let j = 0; j < pts.length; j += 2) {
            const ck = Math.floor(pts[j] / 100) + ',' + Math.floor(pts[j + 1] / 100);
            let arr = TR.wgrid.get(ck); if (!arr) { arr = []; TR.wgrid.set(ck, arr); }
            if (arr[arr.length - 1] !== e.id) arr.push(e.id);
          }
        }
      }
      start = i;
    }
  }
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
const BUS_TYPES = { motorway: 1, trunk: 1, primary: 1, secondary: 1 };
function busRoad(e) {
  if (e.bridge || e.len < 28) return false;
  if (BUS_TYPES[e.type] && e.w >= 6.5) return true;
  // In this city the streets through the centre are wide tertiaries, not primary roads.
  return e.type === 'tertiary' && e.w >= 8;
}
function takeTraffic() {
  if (!TR.pool.length) return null;
  const i = Math.floor(Math.random() * TR.pool.length);
  return TR.pool.splice(i, 1)[0];
}
function initTraffic() {
  const rnd = mulberry32(5);
  const pal = TOON ? TOON_CAR_COLORS : CAR_COLORS;
  const roster = kitRoster(); TR.roster = roster; TR.busPool = []; TR.busT = 0.6;
  for (let i = 0; i < 30; i++) {
    const model = i < roster.n ? roster.models[i % roster.models.length] : '';
    const c = new Car(scene, pal[Math.floor(rnd() * pal.length)], 0, -99999, 0, model ? { model } : {});
    c.g.visible = false; c.pooled = true; TR.pool.push(c);
  }
  for (let i = 0; i < roster.buses; i++) {
    const c = new Car(scene, i ? 0xf6c431 : 0xe8503a, 0, -99999, 0, { model: 'bus' });
    c.g.visible = false; c.pooled = true; TR.busPool.push(c);
  }
  placeBusStop();
  for (let i = 0; i < roster.buses; i++) spawnBus({ x: -7, z: 10 });
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
  let opts = TR.adj[node].filter((o) => !o.back && o.e !== a.e);
  if (c.bus) { const main = opts.filter((o) => busRoad(TR.edges[o.e])); if (main.length) opts = main; }
  if (!opts.length) { const o = TR.adj[node].find((q) => q.e === a.e && !q.back); return o ? { e: o.e, dir: o.dir, turn: 3 } : null; }
  const endH = agentEndHeading(e, a.dir);
  const scored = opts.map((o) => { const e2 = TR.edges[o.e]; const h2 = edgeSample(e2, o.dir > 0 ? Math.min(3, e2.len) : Math.max(0, e2.len - 3), tmpS2).h + (o.dir > 0 ? 0 : Math.PI); let d = h2 - endH; d = Math.atan2(Math.sin(d), Math.cos(d)); return { ...o, turn: Math.abs(d), w: 1 / (0.4 + Math.abs(d)) * (TR_VMAX[e2.type] || 8) }; });
  let tot = 0; for (const s of scored) tot += s.w; let r = Math.random() * tot; for (const s of scored) { r -= s.w; if (r <= 0) return s; } return scored[0];
}
function agentEndHeading(e, dir) { const p = e.pts, n = p.length / 2; if (dir > 0) return Math.atan2(p[n * 2 - 2] - p[n * 2 - 4], p[n * 2 - 1] - p[n * 2 - 3]); return Math.atan2(p[0] - p[2], p[1] - p[3]); }
function focusPos() { return G.mode === 'car' && activeCar ? activeCar : player; }
function spawnAgent(f) {
  let c; const wantPatrol = !TR.agents.some((a) => a.patrol) && POL.pool.length && WANT.stars === 0 && Math.random() < 0.15;
  if (wantPatrol) { c = POL.pool.pop(); c.patrol = true; } else c = takeTraffic(); if (!c) return false;
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
function spawnBus(f) {
  if (!TR.busPool || !TR.busPool.length) return false;
  const c = TR.busPool.pop();
  for (let t = 0; t < 28; t++) {
    const ang = Math.random() * 6.283, R = 130 + Math.random() * 200;
    const x = f.x + Math.cos(ang) * R, z = f.z + Math.sin(ang) * R;
    const arr = TR.egrid.get(Math.floor(x / 100) + ',' + Math.floor(z / 100)); if (!arr || !arr.length) continue;
    const cand = []; for (const id of arr) { const e = TR.edges[id]; if (busRoad(e)) cand.push(e); }
    if (!cand.length) continue;
    const e = cand[Math.floor(Math.random() * cand.length)];
    const dir = e.ow ? 1 : (Math.random() < 0.5 ? 1 : -1); const s = Math.random() * e.len;
    c.ai = { e: e.id, dir, s, v: Math.min(e.vmax, 9) * 0.55, next: null, mode: 'drive', stuck: 0 };
    const p = agentPose(c); const d = Math.hypot(p.x - f.x, p.z - f.z); if (d < 55 || d > 380) continue;
    if (cars.some((o) => o !== c && Math.hypot(o.x - p.x, o.z - p.z) < 14)) continue;
    if (insideBuilding(p.x, p.z, 1.1)) continue;
    c.x = p.x; c.z = p.z; c.h = p.h; c.vx = c.vz = 0; c.y = 0; c.vy = 0; c.hp = 100; c.wrecked = false; c.burn = 0; c.pooled = false; c.g.visible = true; c.sync();
    if (c.smokeT) c.smokeT = 0; TR.agents.push(c); cars.push(c); TR.stats.spawned++; return true;
  }
  c.ai = null; TR.busPool.push(c); return false;
}
function placeBusStop() {
  let best = null, bd = 1e9;
  for (const e of TR.edges) {
    if (!busRoad(e)) continue;
    const n = e.pts.length;
    const mx = (e.pts[0] + e.pts[n - 2]) * 0.5, mz = (e.pts[1] + e.pts[n - 1]) * 0.5;
    const d = Math.hypot(mx + 7, mz - 10);
    if (d < bd) { bd = d; best = e; }
  }
  if (!best) return;
  const u = Math.min(best.len * 0.42, 48);
  edgeSample(best, u, tmpS);
  const h = tmpS.h, side = best.w * 0.5 - 1.35;
  const x = tmpS.x - Math.cos(h) * side, z = tmpS.z + Math.sin(h) * side;
  if (insideBuilding(x, z, 1.6)) return;
  const c = new Car(scene, 0x3d8fe0, x, z, h, { model: 'bus' });
  c.busStop = true; cars.push(c);
}
function despawnCar(c) {
  const i = cars.indexOf(c); if (i >= 0) cars.splice(i, 1);
  const j = TR.agents.indexOf(c); if (j >= 0) TR.agents.splice(j, 1);
  c.ai = null; c.g.visible = false; c.x = 0; c.z = -99999; c.sync(); c.pooled = true; c.wrecked = false; c.hp = 100; c.burn = 0;
  if (c.origColor !== undefined) { c.setPaint(c.origColor); c.origColor = undefined; }
  if (c.wreckPaint) unwreck(c);
  c.pai = null; c.patrol = false; c.block = false;
  if (c.bus) TR.busPool.push(c); else if (c.police) POL.pool.push(c); else TR.pool.push(c); TR.stats.despawned++;
}
function updateTraffic(dt) {
  const f = focusPos(); const max = trafficMax();
  const busCap = TR.roster ? TR.roster.buses : 1;
  TR.spawnT -= dt; if (TR.spawnT <= 0) { TR.spawnT = 0.35; if (!inOffZone(f.x, f.z)) { const carsN = TR.agents.reduce((n, a) => n + (a.bus ? 0 : 1), 0); const k = carsN < max * 0.5 ? 3 : 1; for (let q = 0; q < k && TR.agents.reduce((n, a) => n + (a.bus ? 0 : 1), 0) < max; q++) spawnAgent(f); } }
  TR.busT = (TR.busT || 0) - dt; if (TR.busT <= 0) { TR.busT = 1.5; if (!inOffZone(f.x, f.z) && TR.agents.filter((a) => a.bus).length < busCap) spawnBus(f); }
  // former traffic cars left behind (stolen / wrecked) also return to the pool when far away
  for (let i = cars.length - 1; i >= 0; i--) { const c = cars[i]; if (c.fromPool && !c.ai && c !== activeCar && !c.mission && Math.hypot(c.x - f.x, c.z - f.z) > 450) { c.fromPool = false; despawnCar(c); } }
  for (let i = TR.agents.length - 1; i >= 0; i--) {
    const c = TR.agents[i]; const a = c.ai; c.fromPool = true;
    const dP = Math.hypot(c.x - f.x, c.z - f.z);
    if (dP > 420 || (!c.bus && TR.agents.length > max + busCap + 2)) { despawnCar(c); continue; }
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
    if (c.bus) target = Math.min(target, 9.5);
    if (typeof yukaTrafficSpeed === 'function') target = Math.min(target, yukaTrafficSpeed(c, a, e, dt, target));
    const look = 7 + a.v * 1.4; let block = 1e9;
    const chk = (ox, oz, rr) => { const dx = ox - c.x, dz = oz - c.z; const fw = dx * fx + dz * fz; if (fw <= 0 || fw > look) return; const lat = Math.abs(dx * fz - dz * fx); if (lat < (c.rad || 0.95) + 1.15 + rr) block = Math.min(block, fw); };
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
    const lightD = settings.quality === 'low' ? 85 : (settings.quality === 'high' ? 145 : 115);
    if (dP < lightD) carLights(c, a.v < 0.7 || target + 0.6 < a.v);
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
  const wheelD = settings.quality === 'low' ? 60 : (settings.quality === 'high' ? 120 : 90);
  const near = d < wheelD; if (c.lodNear === near) return; c.lodNear = near;
  for (const w of c.wheels) w.w.visible = near; if (c.hull) c.hull.visible = d < (settings.quality === 'low' ? 100 : 140);
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

// ---------------- pedestrians (one instanced box for every body part + shared outline)
// slots: 0 torso 1 head 2 hair 3 armL 4 armR 5 legL 6 legR 7 shoeL 8 shoeR 9 hat 10 extra 11 cloth 12 shinL 13 shinR
const PED_N = 14;
const PED_LOOKS = [
  { hair: [0.34, 0.16, 0.34, 0, 1.9, 0] },
  { hair: [0.36, 0.36, 0.36, 0, 1.74, -0.02], extra: [0.22, 0.4, 0.14, 0, 1.42, -0.18] },
  { hair: [0.3, 0.08, 0.3, 0, 1.84, 0], hat: [0.42, 0.1, 0.48, 0, 1.98, 0.06] },
  { hair: [0.32, 0.1, 0.32, 0, 1.86, 0], extra: [0.18, 0.16, 0.18, 0, 2.04, -0.04] },
  { hair: [0.32, 0.12, 0.32, 0, 1.88, 0], extra: [0.14, 0.34, 0.14, 0, 1.52, -0.2] },
];
const PED_FITS = [
  {},
  { cloth: [0.58, 0.5, 0.34, 0, 1.26, 0.03], slot: 4 },
  { cloth: [0.56, 0.36, 0.4, 0, 0.9, 0], slot: 1 },
  { cloth: [0.24, 0.3, 0.14, 0, 1.28, -0.22], slot: 4 },
];
const PED_SHIRTS = ['#e8503a', '#3d8fe0', '#f6c431', '#45b65a', '#a66bd0', '#f08a2c', '#4fc3c8', '#f4f1ea', '#e86fa0'].map((c) => new THREE.Color(c));
const PED_PANTS = ['#2c3e66', '#3a3a3a', '#6b4a32', '#24508a', '#5a5a64'].map((c) => new THREE.Color(c));
const PED_SKIN = ['#e2b08c', '#c98f6a', '#f1c9a5', '#8d5a3c'].map((c) => new THREE.Color(c));
const PED_HAIR = ['#3a2a1c', '#1d1d1d', '#c79a4a', '#8a3b1e', '#d8d2c8'].map((c) => new THREE.Color(c));
const PED_ACCENT = ['#2a211c', '#f4f1ea', '#e8503a', '#3d8fe0', '#f6c431', '#1a1a1a'].map((c) => new THREE.Color(c));
const PED_SHOE = new THREE.Color('#2a211c');
const pedMT = new THREE.Matrix4(), pedMR = new THREE.Matrix4(), pedMS = new THREE.Matrix4(), pedMA = new THREE.Matrix4(), pedMB = new THREE.Matrix4();
const pedZ = new THREE.Matrix4().makeScale(0, 0, 0);
function pedMax() { return { low: 12, med: 20, high: 30 }[settings.quality] || 20; }
function pedRange() {
  const q = settings.quality;
  if (q === 'low') return { despawn: 150, far: 55, detail: 36 };
  if (q === 'high') return { despawn: 260, far: 150, detail: 110 };
  return { despawn: 210, far: 100, detail: 70 };
}
function initPeds() {
  const MAXP = 30;
  const geo = addHdir(new THREE.BoxGeometry(1, 1, 1));
  TR.pedMesh = new THREE.InstancedMesh(geo, mkMat({ color: 0xffffff }), MAXP * PED_N); TR.pedMesh.castShadow = true;
  TR.pedMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); TR.pedMesh.frustumCulled = false;
  for (let i = 0; i < MAXP * PED_N; i++) { TR.pedMesh.setMatrixAt(i, pedZ); TR.pedMesh.setColorAt(i, PED_SHIRTS[0]); }
  scene.add(TR.pedMesh);
  if (TOON) { TR.pedHull = new THREE.InstancedMesh(geo, hullMats().small, MAXP * PED_N); TR.pedHull.instanceMatrix = TR.pedMesh.instanceMatrix; TR.pedHull.frustumCulled = false; scene.add(TR.pedHull); }
  for (let i = 0; i < MAXP; i++) TR.peds.push({ on: false, i, x: 0, z: 0, h: 0, v: 0, phase: Math.random() * 6, state: 'walk', t: 0 });
}
function pedColors(p) {
  const r = Math.random;
  p.look = Math.floor(r() * PED_LOOKS.length); p.fit = Math.floor(r() * PED_FITS.length);
  p.cs = [PED_SHIRTS[Math.floor(r() * PED_SHIRTS.length)], PED_PANTS[Math.floor(r() * PED_PANTS.length)], PED_SKIN[Math.floor(r() * PED_SKIN.length)], PED_HAIR[Math.floor(r() * PED_HAIR.length)], PED_ACCENT[Math.floor(r() * PED_ACCENT.length)]];
  const base = p.i * PED_N; const fit = PED_FITS[p.fit];
  const col = (k) => (k === 11 ? p.cs[fit.slot || 4] : k === 9 ? p.cs[4] : (k === 7 || k === 8) ? PED_SHOE : p.cs[[0, 2, 3, 0, 0, 1, 1, 5, 5, 4, 3, 4, 1, 1][k]]);
  for (let k = 0; k < PED_N; k++) TR.pedMesh.setColorAt(base + k, col(k));
  TR.pedMesh.instanceColor.needsUpdate = true;
}
function pedPut(idx, root, x, y, z, w, h, d) {
  if (!(w > 0)) { TR.pedMesh.setMatrixAt(idx, pedZ); return; }
  pedMT.makeTranslation(x, y, z); pedMS.makeScale(w, h, d); pedMA.multiplyMatrices(pedMT, pedMS); pedMA.premultiply(root);
  TR.pedMesh.setMatrixAt(idx, pedMA);
}
function pedLimb(idx, root, jx, jy, jz, rot, x, y, z, w, h, d) {
  if (!(w > 0)) { TR.pedMesh.setMatrixAt(idx, pedZ); return; }
  pedMT.makeTranslation(jx, jy, jz); pedMR.makeRotationX(rot); pedMA.multiplyMatrices(pedMT, pedMR);
  pedMT.makeTranslation(x - jx, y - jy, z - jz); pedMS.makeScale(w, h, d); pedMB.multiplyMatrices(pedMT, pedMS); pedMA.multiply(pedMB); pedMA.premultiply(root);
  TR.pedMesh.setMatrixAt(idx, pedMA);
}
function pedShin(idx, root, jx, jy, jz, thigh, thighLen, shin, w, h, d, zf) {
  if (!(w > 0)) { TR.pedMesh.setMatrixAt(idx, pedZ); return; }
  pedMT.makeTranslation(jx, jy, jz); pedMR.makeRotationX(thigh); pedMA.multiplyMatrices(pedMT, pedMR);
  pedMT.makeTranslation(0, -thighLen, 0); pedMA.multiply(pedMT); pedMR.makeRotationX(shin); pedMA.multiply(pedMR);
  pedMT.makeTranslation(0, -h / 2, zf || 0); pedMS.makeScale(w, h, d); pedMB.multiplyMatrices(pedMT, pedMS); pedMA.multiply(pedMB); pedMA.premultiply(root);
  TR.pedMesh.setMatrixAt(idx, pedMA);
}
const PED_MARGIN = 1.7;
function pedSide(e, s, side, out) {
  edgeSample(e, clamp(s, 0, e.len), out);
  const off = side * (e.w * 0.5 + PED_MARGIN);
  out.x -= Math.cos(out.h) * off; out.z += Math.sin(out.h) * off; return out;
}
function pedBlocked(x, z) { return insideBuilding(x, z, 0.35); }
function spawnPedAt(x, z) {
  const p = TR.peds.find((q) => !q.on); if (!p) return null;
  Object.assign(p, { on: true, x, z, h: Math.random() * 6.28, v: 1.25, state: 'walk', t: 0, e: -1, kind: '', side: 1, dir: 1, fall: 0, next: null }); pedColors(p); return p;
}
function pedHide(p) { p.on = false; for (let k = 0; k < PED_N; k++) TR.pedMesh.setMatrixAt(p.i * PED_N + k, pedZ); }
function nearestSidewalk(x, z, maxR) {
  const cx = Math.floor(x / 100), cz = Math.floor(z / 100); let best = null, bd = maxR;
  for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
    const arr = TR.wgrid.get((cx + i) + ',' + (cz + j)); if (!arr) continue;
    for (const id of arr) {
      const e = TR.walk[id]; if (!e || !e.use || e.cross) continue;
      const hit = distEdge(e, x, z); if (hit.d < bd && !pedBlocked(hit.x, hit.z) && !carriageNear(hit.x, hit.z)) { bd = hit.d; best = { kind: 'walk', e: e.id, s: hit.s, x: hit.x, z: hit.z, dir: 1, side: 1 }; }
    }
  }
  if (best) return best;
  for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
    const arr = TR.egrid.get((cx + i) + ',' + (cz + j)); if (!arr) continue;
    for (const id of arr) {
      const e = TR.edges[id]; if (!e.ped || e.bridge || e.len < 8) continue;
      const along = distEdge(e, x, z);
      for (const side of [1, -1]) {
        const smp = pedSide(e, along.s, side, { x: 0, z: 0, h: 0 });
        const d = Math.hypot(smp.x - x, smp.z - z);
        if (d < bd && !pedBlocked(smp.x, smp.z) && !carriageNear(smp.x, smp.z)) { bd = d; best = { kind: 'side', e: e.id, s: along.s, x: smp.x, z: smp.z, dir: 1, side }; }
      }
    }
  }
  return best;
}
function pedAdopt(p, spot) {
  p.kind = spot.kind; p.e = spot.e; p.s = spot.s; p.dir = spot.dir; p.side = spot.side; p.x = spot.x; p.z = spot.z; p.state = 'walk'; p.next = null;
}
function pedRescue(p) {
  const spot = nearestSidewalk(p.x, p.z, 14);
  if (!spot) { pedHide(p); return; }
  pedAdopt(p, spot);
}
function pedReverse(p, len) { p.dir = -p.dir; p.s = p.s < 0 ? Math.min(len, 0.9) : Math.max(0, len - 0.9); }
function pedCrossTo(p, x, z, next) {
  const d = Math.hypot(x - p.x, z - p.z);
  if (d < 0.45 || d > 14) { if (d <= 14) pedAdopt(p, next); return; }
  p.kind = 'cross'; p.tx = x; p.tz = z; p.t = Math.min(2.8, d / 2.5); p.next = next;
}
function pedJunction(p, e, nodeId, walk) {
  if (walk) {
    const opts = (TR.wadj[nodeId] || []).filter((o) => o.e !== e.id && TR.walk[o.e] && TR.walk[o.e].use);
    const stroll = opts.filter((o) => !TR.walk[o.e].cross);
    const pool = stroll.length ? stroll : opts.filter((o) => TR.walk[o.e].cross);
    if (pool.length) {
      const o = pool[Math.floor(Math.random() * pool.length)]; const e2 = TR.walk[o.e];
      const s = o.dir > 0 ? Math.min(1.1, e2.len) : Math.max(0, e2.len - 1.1);
      const smp = edgeSample(e2, s, { x: 0, z: 0, h: 0 });
      if (!e2.cross && Math.hypot(smp.x - p.x, smp.z - p.z) > 14) { pedReverse(p, e.len); return; }
      pedCrossTo(p, smp.x, smp.z, { kind: 'walk', e: e2.id, s, dir: o.dir, side: 1, x: smp.x, z: smp.z }); return;
    }
    pedReverse(p, e.len); return;
  }
  const nd = TR.nodes[nodeId];
  const hop = nearestSidewalk(nd.x, nd.z, 7);
  if (hop && hop.kind === 'walk' && Math.hypot(hop.x - p.x, hop.z - p.z) < 14) { pedCrossTo(p, hop.x, hop.z, hop); return; }
  const opts = (TR.adj[nodeId] || []).filter((o) => !o.back && o.e !== e.id && TR.edges[o.e].ped && !TR.edges[o.e].bridge);
  if (opts.length) {
    const o = opts[Math.floor(Math.random() * opts.length)]; const e2 = TR.edges[o.e];
    const s = o.dir > 0 ? Math.min(3, e2.len * 0.45) : Math.max(e2.len * 0.55, e2.len - 3);
    let pick = null, bd = 1e9;
    for (const side of [p.side || 1, -(p.side || 1)]) {
      const smp = pedSide(e2, s, side, { x: 0, z: 0, h: 0 });
      const d = Math.hypot(smp.x - p.x, smp.z - p.z);
      if (d < bd && d < 14 && !pedBlocked(smp.x, smp.z) && !carriageNear(smp.x, smp.z)) { bd = d; pick = { smp, side }; }
    }
    if (pick) { pedCrossTo(p, pick.smp.x, pick.smp.z, { kind: 'side', e: e2.id, s, dir: o.dir, side: pick.side, x: pick.smp.x, z: pick.smp.z }); return; }
  }
  pedReverse(p, e.len);
}
function pedStep(p, dt) {
  if (p.kind === 'cross') {
    const dx = p.tx - p.x, dz = p.tz - p.z, L = Math.hypot(dx, dz) || 1; p.t -= dt;
    if (L < 0.4 || p.t <= 0) { if (p.next) pedAdopt(p, p.next); else pedRescue(p); return; }
    const step = Math.min(L, 2.5 * dt); p.x += dx / L * step; p.z += dz / L * step; p.h = Math.atan2(dx, dz); return;
  }
  if (p.kind === 'walk') {
    const e = TR.walk[p.e]; if (!e) { pedRescue(p); return; }
    if (!e.cross && typeof yukaPedNudge === 'function') {
      const smp0 = edgeSample(e, Math.min(e.len, Math.max(0, p.s)), { x: 0, z: 0, h: 0 });
      let tx = Math.sin(smp0.h), tz = Math.cos(smp0.h); if (p.dir < 0) { tx = -tx; tz = -tz; }
      if (yukaPedNudge(p, dt, tx, tz) < 0) p.dir = -p.dir;
    }
    const v = e.cross ? 2.5 : p.v; p.s += p.dir * v * dt;
    if (p.s < 0 || p.s > e.len) { pedJunction(p, e, p.s < 0 ? e.a : e.b, true); return; }
    const smp = edgeSample(e, p.s, { x: 0, z: 0, h: 0 });
    p.h = p.dir > 0 ? smp.h : smp.h + Math.PI; p.x = smp.x; p.z = smp.z;
    return;
  }
  if (p.kind === 'side') {
    const e = TR.edges[p.e]; if (!e) { pedRescue(p); return; }
    if (typeof yukaPedNudge === 'function') {
      const smp0 = pedSide(e, Math.min(e.len, Math.max(0, p.s)), p.side || 1, { x: 0, z: 0, h: 0 });
      let tx = Math.sin(smp0.h), tz = Math.cos(smp0.h); if (p.dir < 0) { tx = -tx; tz = -tz; }
      if (yukaPedNudge(p, dt, tx, tz) < 0) p.dir = -p.dir;
    }
    p.s += p.dir * p.v * dt;
    if (p.s < 0 || p.s > e.len) { pedJunction(p, e, p.s < 0 ? e.a : e.b, false); return; }
    const smp = pedSide(e, p.s, p.side || 1, { x: 0, z: 0, h: 0 });
    if (pedBlocked(smp.x, smp.z)) { p.side = -(p.side || 1); const alt = pedSide(e, p.s, p.side, { x: 0, z: 0, h: 0 }); if (pedBlocked(alt.x, alt.z)) { pedRescue(p); return; } p.x = alt.x; p.z = alt.z; p.h = p.dir > 0 ? alt.h : alt.h + Math.PI; return; }
    p.h = p.dir > 0 ? smp.h : smp.h + Math.PI; p.x = smp.x; p.z = smp.z; return;
  }
  pedRescue(p);
}
function spawnPedWalker(f) {
  for (let t = 0; t < 10; t++) {
    const ang = Math.random() * 6.283, R = 24 + Math.random() * 110, x = f.x + Math.cos(ang) * R, z = f.z + Math.sin(ang) * R;
    const wk = TR.wgrid.get(Math.floor(x / 100) + ',' + Math.floor(z / 100));
    if (wk && wk.length) {
      const e = TR.walk[wk[Math.floor(Math.random() * wk.length)]];
      if (e && e.use && !e.cross && e.len > 8) {
        const s = Math.random() * e.len; const smp = edgeSample(e, s, { x: 0, z: 0, h: 0 });
        if (!pedBlocked(smp.x, smp.z) && !carriageNear(smp.x, smp.z)) {
          const p = spawnPedAt(smp.x, smp.z); if (!p) return;
          p.kind = 'walk'; p.e = e.id; p.s = s; p.dir = Math.random() < 0.5 ? 1 : -1; p.v = 1.15 + Math.random() * 0.4; return;
        }
      }
    }
    const arr = TR.egrid.get(Math.floor(x / 100) + ',' + Math.floor(z / 100)); if (!arr) continue;
    const e = TR.edges[arr[Math.floor(Math.random() * arr.length)]]; if (!e.ped || e.len < 12 || e.bridge) continue;
    let side = Math.random() < 0.5 ? 1 : -1; const s = 1 + Math.random() * Math.max(0.2, e.len - 2);
    let smp = pedSide(e, s, side, { x: 0, z: 0, h: 0 });
    if (pedBlocked(smp.x, smp.z) || carriageNear(smp.x, smp.z)) { side = -side; smp = pedSide(e, s, side, { x: 0, z: 0, h: 0 }); if (pedBlocked(smp.x, smp.z) || carriageNear(smp.x, smp.z)) continue; }
    const p = spawnPedAt(smp.x, smp.z); if (!p) return;
    p.kind = 'side'; p.e = e.id; p.s = s; p.dir = Math.random() < 0.5 ? 1 : -1; p.side = side; p.v = 1.15 + Math.random() * 0.4; return;
  }
}
const pm4 = new THREE.Matrix4(), pm4b = new THREE.Matrix4(), pq = new THREE.Quaternion(), pe = new THREE.Euler(), pv3 = new THREE.Vector3(), ps3 = new THREE.Vector3();
function updatePeds(dt) {
  const f = focusPos(); const max = pedMax(); const rng = pedRange(); let active = 0;
  for (const p of TR.peds) if (p.on) active++;
  TR.pedT -= dt; if (TR.pedT <= 0) { TR.pedT = 0.5; if (active < max && !inOffZone(f.x, f.z)) spawnPedWalker(f); }
  const camP = camera.position;
  for (const p of TR.peds) {
    if (!p.on) continue;
    const d = Math.hypot(p.x - f.x, p.z - f.z);
    if (d > rng.despawn || (active > max + 3 && d > 80)) { p.on = false; active--; for (let k = 0; k < PED_N; k++) TR.pedMesh.setMatrixAt(p.i * PED_N + k, pedZ); continue; }
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
      if (p.t > 2.8) { p.state = 'flee'; p.t = 2.2; p.fx = f.x; p.fz = f.z; }
    } else if (p.state === 'flee') {
      p.t -= dt; const ax = p.x - p.fx, az = p.z - p.fz, L = Math.hypot(ax, az) || 1; p.h = Math.atan2(ax / L, az / L);
      const nx = p.x + ax / L * 3.2 * dt, nz = p.z + az / L * 3.2 * dt; collideCircle(nx, nz, 0.35, col, true); p.x = col.x; p.z = col.z; run = true;
      if (p.t <= 0) pedRescue(p);
    } else pedStep(p, dt);
    if (p.state !== 'fall') { p.phase += dt * (run ? 7.2 : Math.max(p.v, 0.8)) * 2.5; swing = Math.sin(p.phase) * (run ? 0.85 : 0.62); }
    const camD = Math.hypot(p.x - camP.x, p.z - camP.z);
    const far = camD > rng.far; const dress = !far && camD < rng.detail; const bones = dress && settings.quality !== 'low';
    const bob = p.state === 'fall' ? 0 : Math.abs(Math.sin(p.phase)) * (run ? 0.055 : 0.03);
    pe.set(pitch + (p.state === 'fall' ? 0 : run ? 0.12 : 0.04), p.h, 0, 'YXZ'); pq.setFromEuler(pe);
    pv3.set(p.x, groundH(p.x, p.z) + bob, p.z); ps3.set(1, 1, 1); pm4.compose(pv3, pq, ps3);
    const b = p.i * PED_N; const look = PED_LOOKS[p.look] || PED_LOOKS[0]; const fit = PED_FITS[p.fit] || PED_FITS[0];
    pedPut(b, pm4, 0, 1.22, 0, 0.5, 0.62, 0.28);
    pedPut(b + 1, pm4, 0, 1.68, 0, far ? 0.34 : 0.3, far ? 0.34 : 0.32, far ? 0.34 : 0.3);
    if (far) {
      for (let k = 2; k < PED_N; k++) TR.pedMesh.setMatrixAt(b + k, pedZ);
    } else {
      const hair = look.hair; pedPut(b + 2, pm4, hair[3], hair[4], hair[5], hair[0], hair[1], hair[2]);
      const arm = swing * 0.8, hipY = 0.9, shY = 1.5;
      pedLimb(b + 3, pm4, -0.4, shY, 0, -arm, -0.4, shY - 0.26, 0, 0.16, 0.52, 0.16);
      pedLimb(b + 4, pm4, 0.4, shY, 0, arm, 0.4, shY - 0.26, 0, 0.16, 0.52, 0.16);
      const thigh = 0.42, shin = 0.34;
      if (bones) {
        pedLimb(b + 5, pm4, -0.13, hipY, 0, swing, -0.13, hipY - thigh / 2, 0, 0.18, thigh, 0.18);
        pedLimb(b + 6, pm4, 0.13, hipY, 0, -swing, 0.13, hipY - thigh / 2, 0, 0.18, thigh, 0.18);
        const bL = Math.max(0, swing) * 1.15, bR = Math.max(0, -swing) * 1.15;
        pedShin(b + 12, pm4, -0.13, hipY, 0, swing, thigh, bL, 0.16, shin, 0.16, 0.02);
        pedShin(b + 13, pm4, 0.13, hipY, 0, -swing, thigh, bR, 0.16, shin, 0.16, 0.02);
        pedShin(b + 7, pm4, -0.13, hipY, 0, swing, thigh + shin, bL, 0.2, 0.1, 0.28, 0.08);
        pedShin(b + 8, pm4, 0.13, hipY, 0, -swing, thigh + shin, bR, 0.2, 0.1, 0.28, 0.08);
      } else {
        pedLimb(b + 5, pm4, -0.13, hipY, 0, swing, -0.13, hipY - 0.4, 0, 0.18, 0.8, 0.18);
        pedLimb(b + 6, pm4, 0.13, hipY, 0, -swing, 0.13, hipY - 0.4, 0, 0.18, 0.8, 0.18);
        pedLimb(b + 7, pm4, -0.13, hipY, 0, swing, -0.13, hipY - 0.84, 0.05, 0.2, 0.1, 0.3);
        pedLimb(b + 8, pm4, 0.13, hipY, 0, -swing, 0.13, hipY - 0.84, 0.05, 0.2, 0.1, 0.3);
        TR.pedMesh.setMatrixAt(b + 12, pedZ); TR.pedMesh.setMatrixAt(b + 13, pedZ);
      }
      if (dress && look.hat) pedPut(b + 9, pm4, look.hat[3], look.hat[4], look.hat[5], look.hat[0], look.hat[1], look.hat[2]); else TR.pedMesh.setMatrixAt(b + 9, pedZ);
      if (dress && look.extra) pedPut(b + 10, pm4, look.extra[3], look.extra[4], look.extra[5], look.extra[0], look.extra[1], look.extra[2]); else TR.pedMesh.setMatrixAt(b + 10, pedZ);
      if (dress && fit.cloth) pedPut(b + 11, pm4, fit.cloth[3], fit.cloth[4], fit.cloth[5], fit.cloth[0], fit.cloth[1], fit.cloth[2]); else TR.pedMesh.setMatrixAt(b + 11, pedZ);
    }
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
// ---- balance (v3): cars ~2-3x tougher, police slower to escalate / bust, easier to shake at 1-2 stars
const BAL = {
  dmgThr: 6, dmgK: 1.5, dmgV2: 20, dmgK2: 0.8, burnT: 5,           // damage = 1.5*(v-6) + 0.8*max(0,v-20)  [v = impact m/s]
  want: [0, 1, 1, 3, 4, 5],                                         // chasing cruisers per star level
  spawnInt: [0, 6, 5, 2.6, 2.4, 2.2], spawnR: [0, 150, 140, 120, 110, 110],
  pmul: [1, 0.8, 0.87, 0.95, 1, 1],                                 // cruiser top speed / accel multiplier
  losR: [0, 90, 100, 125, 165, 175], seeClose: 18, knowT: [0, 6, 7, 9, 10, 10],
  evadeBase: 5, evadeK: 2,                                          // seconds out of sight to lose the stars: 5 + 2*S
  escalateT: 90, escalateMax: 2,                                    // long chase in view adds a star (only up to 2)
  bustDist: 5, bustSpeed: 1.0, bustT: 5, bustDecay: 3,
  footBustD: 1.2, footBustT: 1.0, footSpd: [0, 6.0, 6.4, 7.0, 7.3, 7.3], footMinStars: 3, footInt: 12,
  speedV: 24, speedD: 28,
};
const BAL_OLD = { dmgThr: 3, dmgK: 4, carCarThr: 4, carCarK: 3, burnT: 3.2, want: [0, 1, 2, 4, 5, 5], spawnInt: 2.2, spawnR: 110, losR: [0, 125, 125, 125, 170, 170], seeClose: 25, knowT: 10, evade: '8 + 3*S', escalateT: 50, escalateMax: 3, bustDist: 8, bustSpeed: 2, bustT: 3, bustDecay: 2, footBustD: 1.3, footBustT: 0, footSpd: 7.3, footMinStars: 2, footInt: 9, speedV: 19.5, speedD: 38 };
function impactDamage(v) { return v <= BAL.dmgThr ? 0 : (v - BAL.dmgThr) * BAL.dmgK + Math.max(0, v - BAL.dmgV2) * BAL.dmgK2; }
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
  mk('div', 'bustbar', 'hidden', '<i></i><b>ZATRZYMANIE – ruszaj się!</b>');
  mk('div', 'nitrobar', 'hidden', '<i></i><b>NITRO</b>');
  mk('div', 'drift', 'hidden', '');
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
  if (n > old) { WANT.seen = true; WANT.seenT = 0; WANT.knowT = BAL.knowT[n]; const ff = focusXZ(); WANT.lx = ff.x; WANT.lz = ff.z; toast('★'.repeat(n) + ' Poszukiwany!' + (why ? ' · ' + why : ''), 1800); }
  if (n === 0 && old > 0) { policeStandDown(); }
  POL.events.push({ t: performance.now(), stars: n, why: why || '' });
  starsHud();
}
const CRIMES = { ped: [1, 2.5, 'potrącenie pieszego'], ramPolice: [1, 6, 'taranowanie policji'], carjack: [1, 8, 'kradzież auta'], speed: [1, 15, 'przekroczenie prędkości'], shootout: [1, 1, ''] };
function crime(kind) {
  const c = CRIMES[kind]; if (!c) return; const now = performance.now() / 1000;
  if (WANT.cool[kind] && now - WANT.cool[kind] < c[1]) return; WANT.cool[kind] = now; WANT.crimes++;
  if (kind === 'ped') WANT.peds = (WANT.peds || 0) + 1;
  if (kind === 'ramPolice') WANT.rams = (WANT.rams || 0) + 1;
  let add = c[0];
  if (kind === 'ped' && WANT.stars >= 2) add = 0;                              // every 3rd pedestrian (below)
  if ((kind === 'carjack' || kind === 'speed') && WANT.stars >= 1) add = 0;    // only gets you noticed, no escalation
  if (kind === 'ramPolice' && WANT.stars >= 2 && WANT.rams % 2) add = 0;       // every 2nd ram at 2+ stars
  if (WANT.stars === 0 || add) setStars(Math.min(5, WANT.stars + Math.max(add, WANT.stars ? 0 : 1)), c[2]);
  else if (kind === 'ped' && WANT.peds % 3 === 0) setStars(WANT.stars + 1, c[2]);
}
function carHitEvent(other, v) {
  if (!other.police) return;
  if (!activeCar || v <= 5) return;
  // only when YOU ram the cruiser (you move into it faster than it moves into you) – a cop ramming a parked player is not a crime
  const a = activeCar, dx = other.x - a.x, dz = other.z - a.z, L = Math.hypot(dx, dz) || 1, mine = ((a.vx || 0) * dx + (a.vz || 0) * dz) / L, his = -((other.vx || 0) * dx + (other.vz || 0) * dz) / L;
  if (a.speed > 6 && mine > 4 && mine + 0.5 >= his) crime('ramPolice');
}

// ---------- police cars
function initPolice() {
  ensureHud();
  for (let i = 0; i < 7; i++) { const c = new Car(scene, 0xffffff, 0, -99999, 0, { police: true }); c.g.visible = false; c.pooled = true; POL.pool.push(c); POL.cars.push(c); }
  for (let i = 0; i < 4; i++) { const w = makeWalker({ shirt: 0x24489c, pants: 0x1a2340, hairStyle: 'cap', cap: 0x1a2340, belt: 0x111111, jacket: 0x1c3f8a }); w.visible = false; scene.add(w); POL.foot.push({ w, on: false, x: 0, z: 0, h: 0, y: 0 }); }
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
  if (G.mode === 'car' && activeCar && !activeCar.police && activeCar.speed > BAL.speedV) {
    for (const c of POL.cars) if (c.g.visible && c !== activeCar && Math.hypot(c.x - f.x, c.z - f.z) < BAL.speedD && hasLOS(c.x, c.z, f.x, f.z)) { crime('speed'); break; }
  }
  // patrol car converts to a chaser once there are stars
  if (S > 0) for (const c of TR.agents.slice()) if (c.patrol && Math.hypot(c.x - f.x, c.z - f.z) < 260) { policeLeave(c); c.patrol = false; c.pai = { path: null, pi: 0, repath: 0, stuck: 0, rev: 0, leave: 0 }; }
  // spawn chasers
  const want = BAL.want[S] || 0;
  POL.spawnT -= dt;
  if (S > 0 && POL.spawnT <= 0 && (WANT.seen || chasers().length === 0) && chasers().filter((c) => !c.pai.leave).length < want && !G.cut) {
    POL.spawnT = BAL.spawnInt[S]; const c = freePolice();
    if (c) { const p = placeOnRoadNear(f.x, f.z, BAL.spawnR[S], BAL.spawnR[S] + 80, f.x, f.z); if (p) { activatePolice(c, p); } else POL.pool.push(c); }
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
    POL.losT = 0.25; let seen = false; const R = BAL.losR[S];
    for (const c of POL.cars) if (c.g.visible && (c.pai || c.block) && c !== activeCar && !c.wrecked && !(c.pai && c.pai.leave)) { const d = Math.hypot(c.x - f.x, c.z - f.z); if (d < R && (d < BAL.seeClose || hasLOS(c.x, c.z, f.x, f.z))) { seen = true; break; } }
    if (!seen && (WANT.knowT || 0) > 0) seen = true; // fresh crime: dispatch knows where you are for a few seconds
    if (!seen) for (const p of POL.foot) if (p.on && !p.leave && Math.hypot(p.x - f.x, p.z - f.z) < 70 && hasLOS(p.x, p.z, f.x, f.z)) { seen = true; break; }
    if (seen !== WANT.seen) { WANT.seen = seen; starsHud(); }
    if (seen) { WANT.lx = f.x; WANT.lz = f.z; }
  }
  if (S > 0 && !G.cut) {
    if (WANT.seen) { WANT.evade = 0; WANT.seenT += dt; if (WANT.seenT > BAL.escalateT && S < BAL.escalateMax) { WANT.seenT = 0; setStars(S + 1, 'pościg trwa'); } }
    else { WANT.evade += dt; if (WANT.evade > BAL.evadeBase + BAL.evadeK * S) { setStars(0); toast('Zgubiłeś policję! 😎', 2200); if (typeof missionEvent === 'function') missionEvent('lost'); } }
  }
  updateFootCops(dt, f);
  // BUSTED
  if (S > 0 && !G.cut) {
    let close = false;
    if (G.mode === 'car') { for (const c of POL.cars) if (c.g.visible && !c.wrecked && c !== activeCar && (c.pai || c.block) && Math.hypot(c.x - f.x, c.z - f.z) < BAL.bustDist) { close = true; break; } }
    if (G.mode === 'car') POL.bustT = close && activeCar.speed < BAL.bustSpeed ? POL.bustT + dt : Math.max(0, POL.bustT - dt * BAL.bustDecay);
    else { let g = 0; for (const p of POL.foot) if (p.on) g = Math.max(g, p.grab || 0); POL.bustT = g / BAL.footBustT * BAL.bustT; }
    if (POL.bustT > BAL.bustT && G.mode === 'car') busted();
  } else POL.bustT = 0;
  bustHud();
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
    if (path) { a.path = pathPoints(path); a.path.unshift(TR.nodes[n0].x, TR.nodes[n0].z); const er = nearestRoadPoint(f.x, f.z, true, 60); if (er) a.path.push(er.x, er.z); a.pi = 0; const P = a.path; if (P.length >= 4 && Math.hypot(P[2] - c.x, P[3] - c.z) < Math.hypot(P[2] - P[0], P[3] - P[1]) + 2) a.pi = 1; } else a.path = null; // v3: don't U-turn back to a node already passed
  }
  let tx = f.x, tz = f.z;
  if (!direct && a.path) {
    while (a.pi < a.path.length / 2 - 1 && Math.hypot(a.path[a.pi * 2] - c.x, a.path[a.pi * 2 + 1] - c.z) < 9) a.pi++;
    tx = a.path[a.pi * 2]; tz = a.path[a.pi * 2 + 1];
  } else if (direct && activeCar && G.mode === 'car' && WANT.stars >= 3) { tx = f.x + activeCar.vx * 0.5; tz = f.z + activeCar.vz * 0.5; } // lead the target a bit (ram) – only from 3 stars
  c.pmul = BAL.pmul[WANT.stars] || 1;
  let ang = Math.atan2(tx - c.x, tz - c.z) - c.h; ang = Math.atan2(Math.sin(ang), Math.cos(ang));
  let steer = clamp(ang * 2.5, -1, 1), thr = 1, hand = false;
  if (direct && WANT.stars <= 2 && d < 14 && G.mode === 'car' && activeCar) thr = c.speed > activeCar.speed + 2 ? 0 : 0.6; // low stars: tail you, don't smash into you
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
    if (POL.footT <= 0 && WANT.stars >= BAL.footMinStars) { POL.footT = BAL.footInt; const p = POL.foot.find((q) => !q.on); if (p) { let s = null; for (let k = 0; k < 6 && !s; k++) { const q = placeOnRoadNear(f.x, f.z, 35, 70); if (q && (k > 3 || hasLOS(q.x, q.z, f.x, f.z))) s = q; } if (s) { p.stuckT = 0; p.side = 0; p.on = true; p.leave = false; p.x = s.x; p.z = s.z; p.y = groundH(s.x, s.z); p.w.visible = true; p.car = null; } } }
  }
  for (const p of POL.foot) {
    if (!p.on) continue; const dx = f.x - p.x, dz = f.z - p.z, d = Math.hypot(dx, dz);
    if (p.leave || WANT.stars === 0 || d > 160) { if (d > 60 || p.leave === 'now') { p.on = false; p.w.visible = false; if (p.car) p.car.footOut = false; continue; } }
    let spd = 0;
    if (!p.leave && WANT.stars > 0 && G.mode === 'foot') {
      spd = BAL.footSpd[WANT.stars] || 7.3; let ux = dx / (d || 1), uz = dz / (d || 1);
      if (p.side) { p.sideT -= dt; const sx = -uz * p.side, sz = ux * p.side; ux = ux * 0.25 + sx; uz = uz * 0.25 + sz; const L = Math.hypot(ux, uz); ux /= L; uz /= L; if (p.sideT <= 0) p.side = 0; }
      const ox = p.x, oz = p.z; collideCircle(p.x + ux * spd * dt, p.z + uz * spd * dt, 0.35, col, true); p.x = col.x; p.z = col.z; p.h = Math.atan2(ux, uz);
      const moved = Math.hypot(p.x - ox, p.z - oz); p.stuckT = moved < spd * dt * 0.35 ? (p.stuckT || 0) + dt : Math.max(0, (p.stuckT || 0) - dt);
      if (p.stuckT > 0.6 && !p.side) { p.side = Math.random() < 0.5 ? -1 : 1; p.sideT = 1.6; p.stuckT = 0; } // wall-follow around buildings
      p.grab = d < BAL.footBustD ? (p.grab || 0) + dt : Math.max(0, (p.grab || 0) - dt * 2);
      if (p.grab > BAL.footBustT && !G.cut) { p.grab = 0; busted(); }
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
  const fine = Math.min(SAVE.money, 50 + Math.round(SAVE.money * 0.1));
  if (typeof missionFail === 'function') missionFail('Zatrzymała cię policja');
  G.cut = { t: 2.2, fn: () => {
    if (G.mode === 'car') { activeCar.vx = activeCar.vz = 0; enterExit(); }
    setStars(0); clearPolice(); if (fine) addMoney(-fine, 'mandat'); respawnAt(PLACES.komenda, 'Komenda Policji – wychodzisz za kaucją');
  } };
}
function wasted() {
  if (G.cut) return; G.wastedN = (G.wastedN || 0) + 1;
  banner('ROZBITY!', 'wasted', 3400);
  const fee = Math.min(SAVE.money, 75 + Math.round(SAVE.money * 0.05));
  if (typeof missionFail === 'function') missionFail('Auto wybuchło');
  G.cut = { t: 2.4, fn: () => {
    const c = activeCar; if (typeof ownWrecked === 'function') ownWrecked(c); if (c) { activeCar = null; G.mode = 'foot'; player.mesh.visible = true; if (c.rider) c.rider.visible = false; $('speedo').classList.add('hidden'); $('touch').classList.remove('incar'); $('tEnter').textContent = 'Wsiądź'; }
    setStars(0); clearPolice(); if (fee) addMoney(-fee, 'rachunek ze szpitala'); respawnAt(PLACES.szpital, 'Szpital – poskładali cię jak nowego');
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
  if (c.st) n *= c.st.armor; // model toughness + armour upgrade
  if (n <= 0) return;
  const was = c.hp; c.hp = Math.max(0, c.hp - n); if (c.hp <= 0 && !c.burn) { c.burn = BAL.burnT; if (c === activeCar) toast('🔥 Auto się pali! Wysiadaj (E)!', 2500); }
  if (c === activeCar && was >= 60 && c.hp < 60 && c.hp > 0) toast('Spod maski leci dym…', 1400);
  if (c === activeCar && was >= 15 && c.hp < 15 && c.hp > 0) toast('🔥 Silnik się zapala! Do warsztatu!', 2200);
  if (c === activeCar) hpHud();
}
function bustHud() {
  const b = $('bustbar'); if (!b) return; const k = POL.bustT / BAL.bustT;
  if (k < 0.06 || G.cut) { if (!b.classList.contains('hidden')) b.classList.add('hidden'); return; }
  b.classList.remove('hidden'); b.firstChild.style.width = Math.min(100, k * 100).toFixed(0) + '%';
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
  for (let i = 0; i < 64; i++) { const m = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: true }); const s = new THREE.Sprite(m); s.visible = false; scene.add(s); fx.list.push({ s, t: 0, life: 0 }); }
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
    } else if (emit && (c.hp < 60 || c.wrecked) && Math.hypot(c.x - f.x, c.z - f.z) < 150) {
      const hx = c.x + Math.sin(c.h) * 1.6, hz = c.z + Math.cos(c.h) * 1.6, hy = (c.y || 0) + 1.1;
      if (c.wrecked) emitFx(hx, hy, hz, '#3a3634', 1.0, 1.4, 2);
      else if (c.hp < 15) { emitFx(hx, hy - 0.1, hz, Math.random() < 0.5 ? '#ff8a1e' : '#ffd23a', 0.8, 0.45, 2.2); emitFx(hx, hy + 0.3, hz, '#4a4442', 1.3, 1.5, 2.4); } // stage 3: fire under the hood
      else if (c.hp < 35) emitFx(hx, hy, hz, '#5a5552', 1.1, 1.5, 2.2);                                                                                  // stage 2: dark smoke
      else if (Math.random() < 0.5) emitFx(hx, hy, hz, '#d8d4d0', 0.7, 1.1, 1.6);                                                                          // stage 1: light steam
    }
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
function unwreck(c) { c.wrecked = false; c.hp = 100; c.burn = 0; if (c.wreckPaint !== undefined) { recolorTag(c.geo, 1, c.police ? 0xf4f6fa : c.wreckPaint); if (c.police) recolorTag(c.geo, 2, 0x1f55c8); else if (c.stripe !== undefined) recolorTag(c.geo, 2, c.stripe); c.wreckPaint = undefined; } }
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
const TAXI_STOPS = [
  { name: 'Zamek w Dzikowie', x: 300, z: -575 }, { name: 'Szpital Wojewódzki', x: -68, z: 776 },
  { name: 'Dworzec PKS', x: -365, z: 933 }, { name: 'Stacja kolejowa', x: 478, z: 162 },
  { name: 'Osiedle Serbinów', x: 1216, z: -49 }, { name: 'Kościół św. Barbary', x: 973, z: 880 },
  { name: 'Plac Targowy', x: 1439, z: 240 }, { name: 'Stadion Miejski', x: -290, z: 700 },
  { name: 'Urząd Miasta', x: -87, z: 370 },
];
const DROP_STOPS = [
  { name: 'Muzeum Siarki', x: 789, z: -1258 }, { name: 'Serbinów', x: 1216, z: -49 },
  { name: 'Kościół św. Barbary', x: 973, z: 880 }, { name: 'Stacja kolejowa', x: 478, z: 162 },
  { name: 'Rynek', x: -7, z: 10 }, { name: 'Szpital Wojewódzki', x: -68, z: 776 },
  { name: 'Urząd Miasta', x: -87, z: 370 },
];
function pickNamed(list, n, ax, az) {
  const pool = list.filter((s) => Math.hypot(s.x - ax, s.z - az) > 160);
  for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); const t = pool[i]; pool[i] = pool[j]; pool[j] = t; }
  return pool.slice(0, n);
}
function legBudget(x1, z1, x2, z2) {
  let len = Math.hypot(x2 - x1, z2 - z1) * 1.5;
  const a = nearestNode(x1, z1, 280), b = nearestNode(x2, z2, 280);
  if (a >= 0 && b >= 0) {
    const path = astar(a, b, 12000);
    if (path) {
      const pts = pathPoints(path); let L = 0, lx = TR.nodes[a].x, lz = TR.nodes[a].z;
      for (let i = 0; i < pts.length; i += 2) { L += Math.hypot(pts[i] - lx, pts[i + 1] - lz); lx = pts[i]; lz = pts[i + 1]; }
      if (L > 30) len = L;
    }
  }
  return Math.round(Math.min(340, Math.max(120, len / 8 + 50)));
}
function haulBudget(x1, z1, x2, z2) {
  let len = Math.hypot(x2 - x1, z2 - z1) * 1.55;
  const a = nearestNode(x1, z1, 320), b = nearestNode(x2, z2, 320);
  if (a >= 0 && b >= 0) {
    const path = astar(a, b, 16000);
    if (path) {
      const pts = pathPoints(path); let L = 0, lx = TR.nodes[a].x, lz = TR.nodes[a].z;
      for (let i = 0; i < pts.length; i += 2) { L += Math.hypot(pts[i] - lx, pts[i + 1] - lz); lx = pts[i]; lz = pts[i + 1]; }
      if (L > 40) len = L;
    }
  }
  return Math.round(Math.min(720, Math.max(200, len / 11 + 90)));
}
function misSay(line) { toast(line, 2400); }
function chainCheckpoints(anchors, spacing) {
  const cps = []; let prev = null;
  for (const a of anchors) {
    const n = nearestNode(a[0], a[1], 380); if (n < 0) continue;
    if (prev == null) { prev = n; cps.push({ x: TR.nodes[n].x, z: TR.nodes[n].z, name: a[2] || '' }); continue; }
    const path = astar(prev, n, 12000);
    if (path) {
      const pts = pathPoints(path); let acc = 999, lx = TR.nodes[prev].x, lz = TR.nodes[prev].z;
      for (let i = 0; i < pts.length; i += 2) {
        acc += Math.hypot(pts[i] - lx, pts[i + 1] - lz); lx = pts[i]; lz = pts[i + 1];
        if (acc >= spacing) { cps.push({ x: lx, z: lz }); acc = 0; }
      }
    }
    cps.push({ x: TR.nodes[n].x, z: TR.nodes[n].z, name: a[2] || '' }); prev = n;
  }
  const out = [];
  for (const c of cps) { if (out.length && Math.hypot(out[out.length - 1].x - c.x, out[out.length - 1].z - c.z) < 28) { if (c.name) out[out.length - 1].name = c.name; continue; } out.push(c); }
  return out;
}
function beginNamedLeg(m) {
  const d = m.stops[m.leg]; m.dest = roadSpot(d.x, d.z, 120);
  const from = m.car || focusXZ(); m.t = legBudget(from.x, from.z, m.dest.x, m.dest.z);
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
    update(m) {
      const r = EGG.race; const cps = W.off && W.off.cpObjs;
      m.target = r.running && cps && cps[r.i] ? cps[r.i] : null;
      m.obj = 'Rajd nad jeziorem – limit 4:00' + (r.running ? ' · punkt ' + (r.i + 1) + '/' + (cps ? cps.length : 7) : '');
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
  { id: 'kursy', name: 'Kursy po mieście', giver: [186, 154], who: 'Pan Rysiek z postoju', where: 'postój przy Banku Pekao', reward: 180, recordPay: 40, side: true, bestKey: 'kursy', bestLow: true, col: '#f6c431',
    steps: ['Wsiądź do żółtej taksówki.', 'Zawieź trzech pasażerów pod prawdziwe adresy w Tarnobrzegu.', 'Każdy kurs ma własny, spokojny limit czasu.', 'Pełna nagroda tylko za pierwszym razem. Nowy rekord czasu daje małą premię.'],
    text: 'Trzy kursy, trzy adresy z miasta. Nie ścigaj się z czasem jak w Dzikowie – tu liczy się, że dowieziesz ludzi. Pierwszy raz płacę normalnie, potem tylko za pobicie rekordu.',
    start(m) { m.car = misCar(0xf6c431, roadSpot(m.gx + 6, m.gz + 3), { kind: 'taxi' }); m.stops = pickNamed(TAXI_STOPS, 3, m.gx, m.gz); m.leg = 0; m.stage = 0; m.bank = 0; m.t0 = performance.now(); },
    update(m) {
      if (!m.stops || m.stops.length < 3) return 'Nie ma wolnych kursów';
      if (m.car.wrecked) return 'Taksówka rozbita';
      if (m.stage === 0) { m.target = m.car; m.obj = 'Wsiądź do żółtej taksówki (kursy po mieście)'; if (inCar(m.car)) { m.stage = 1; beginNamedLeg(m); toast('Pasażer: „Poproszę ' + m.stops[0].name + '”', 2200); } return; }
      const d = m.stops[m.leg]; m.target = m.dest;
      m.obj = 'Kurs ' + (m.leg + 1) + '/3 → ' + d.name + (inCar(m.car) ? '' : ' · wróć do taksówki');
      if (m.t <= 0) return 'Pasażer wysiadł – za długo na kurs';
      if (inCar(m.car) && at(m.dest, 12, 5)) {
        m.bank += Math.max(0, m.t); m.leg++;
        if (m.leg >= 3) { m.bestNow = (performance.now() - m.t0) / 1000; return 'win'; }
        toast(d.name + ' ✓  Następny: ' + m.stops[m.leg].name, 2000); beginNamedLeg(m);
      }
    }, bonus: (m) => Math.round(Math.min(90, (m.bank || 0) / 3)) },
  { id: 'targ', name: 'Dostawa z targowiska', giver: [1439, 240], who: 'Halina z targowiska', where: 'Plac Targowy', reward: 150, recordPay: 40, side: true, bestKey: 'targ', bestLow: true, col: '#45b65a',
    steps: ['Wsiądź do białego auta przy targowisku.', 'Zawieź dwie skrzynki pod wylosowane, prawdziwe adresy.', 'Można delikatnie trącić – to nie jest dostawa szkła.', 'Nagroda za pierwszym razem, potem premia za szybszy rekord.'],
    text: 'Jabłka i ziemniaki same się nie zawiozą. Dwa adresy, spokojny czas na każdy. Pierwszy raz jest wypłata, kolejne jazdy – tylko gdy pobijesz swój czas.',
    start(m) {
      m.car = misCar(0xf4f1ea, roadSpot(m.gx + 8, m.gz + 4)); m.stops = pickNamed(DROP_STOPS, 2, m.gx, m.gz);
      m.goods = ['skrzynka jabłek', 'worek ziemniaków']; m.leg = 0; m.stage = 0; m.bank = 0; m.t0 = performance.now();
    },
    update(m) {
      if (!m.stops || m.stops.length < 2) return 'Targ już zamknięty';
      if (m.car.wrecked) return 'Dostawa się rozsypała';
      if (m.stage === 0) { m.target = m.car; m.obj = 'Wsiądź do auta z towarem'; if (inCar(m.car)) { m.stage = 1; beginNamedLeg(m); } return; }
      const d = m.stops[m.leg]; m.target = m.dest;
      m.obj = (m.goods[m.leg] || 'paczka') + ' → ' + d.name + ' (' + (m.leg + 1) + '/2)' + (inCar(m.car) ? '' : ' · wróć do auta');
      if (m.t <= 0) return 'Towar się zepsuł – za późno';
      if (inCar(m.car) && at(m.dest, 12, 5)) {
        m.bank += Math.max(0, m.t); m.leg++;
        if (m.leg >= 2) { m.bestNow = (performance.now() - m.t0) / 1000; return 'win'; }
        toast('Zostawione. Teraz: ' + m.stops[m.leg].name, 1800); beginNamedLeg(m);
      }
    }, bonus: (m) => Math.round(Math.min(70, (m.bank || 0) / 4)) },
  { id: 'uliczna', name: 'Próba uliczna', giver: [-733, 661], who: 'Kasia z klubu', where: 'Plac Tysiąclecia', reward: 230, recordPay: 40, side: true, bestKey: 'uliczna', bestLow: true, col: '#ff3b3b',
    steps: ['Wsiądź do sportowego auta na starcie.', 'Po odliczeniu jedź przez checkpointy: stadion, szpital, urząd, Rynek.', 'To jazda na czas, bez rywali. Limit jest liczony z długości trasy, z zapasem.', 'Pełna nagroda raz. Szybszy przejazd zapisuje rekord i małą premię.'],
    text: 'Pętla zachodnia: z Placu Tysiąclecia przez stadion i szpital, potem urząd i Rynek. Samochód dam. Bez rywali – liczy się twój czas. Pierwszy ukończony przejazd jest płatny.',
    start(m) {
      const s = roadSpot(m.gx, m.gz, 80); m.car = misCar(0xe8503a, s, { model: 'sport' });
      m.cps = chainCheckpoints([[-733, 661, 'start'], [-290, 700, 'Stadion'], [-68, 776, 'Szpital'], [-87, 370, 'Urząd'], [-7, 10, 'Rynek']], 170);
      m.cps = m.cps.filter((c) => Math.hypot(c.x - s.x, c.z - s.z) > 36);
      if (m.cps.length < 3) { m.failFast = 'Nie udało się ułożyć trasy po ulicach'; return; }
      let len = 0, lx = s.x, lz = s.z; for (const c of m.cps) { len += Math.hypot(c.x - lx, c.z - lz); lx = c.x; lz = c.z; }
      m.limit = Math.round(Math.min(420, Math.max(180, len / 8 + 55))); m.i = 0; m.stage = 0;
    },
    update(m, dt) {
      if (m.failFast) return m.failFast;
      if (m.car.wrecked) return 'Auto próby rozbite';
      if (m.stage === 0) { m.target = m.car; m.obj = 'Wsiądź do czerwonego auta na starcie próby'; if (inCar(m.car)) { m.stage = 1; m.count = 3.4; } return; }
      if (m.stage === 1) { m.count -= dt; m.obj = 'Start za ' + Math.max(1, Math.ceil(m.count - 0.4)); m.target = m.cps[0]; if (m.count <= 0.4) { m.stage = 2; m.t = m.limit; m.t0 = performance.now(); banner('START!', 'go', 900); } return; }
      const c = m.cps[m.i]; m.target = c; m.obj = 'Checkpoint ' + (m.i + 1) + '/' + m.cps.length + (c.name ? ' · ' + c.name : '');
      if (m.t <= 0) return 'Za wolno – limit ' + fmtT(m.limit).slice(0, 5);
      if (inCar(m.car) && at(c, 12, 30)) { m.i++; if (m.i >= m.cps.length) { m.bestNow = (performance.now() - m.t0) / 1000; return 'win'; } }
    } },
  { id: 'jezioro', name: 'Próba nad jeziorem', giver: [-1798, 2363], who: 'Marek, ratownik', where: 'plaża Jeziora Tarnobrzeskiego', reward: 260, recordPay: 40, side: true, bestKey: 'jezioro', bestLow: true, col: '#22e6ff',
    steps: ['Dostań się na ścieżki off-road nad jeziorem (wjazd albo teleport przy pomniku Głowackiego).', 'Musisz być autem na ścieżce – terenówka trzyma się lepiej.', 'Potem 4 checkpointy w odwrotnej kolejności niż tajny rajd.', 'Limit jest luźniejszy niż w misji fabularnej. Nagroda raz, rekord zostaje.'],
    text: 'Inna pętla niż rajd Głowackiego: cztery punkty pod prąd, bez obowiązku zejść poniżej 4 minut. Z miasta nie ma ulicy przez jezioro – albo dojedź na plażę i na ścieżkę, albo użyj teleportu przy pomniku. Teleport przy pomniku włącza też stary przejazd z checkpointami; ta próba liczy własne punkty.',
    start(m) {
      const cps = (W.off && W.off.cps) || []; const idx = [6, 4, 2, 0].filter((i) => cps[i]);
      m.cps = idx.map((i) => ({ x: cps[i][0], z: cps[i][1] }));
      if (m.cps.length < 3) { m.failFast = 'Brak ścieżek off-road'; return; }
      let len = 0; for (let i = 1; i < m.cps.length; i++) len += Math.hypot(m.cps[i].x - m.cps[i - 1].x, m.cps[i].z - m.cps[i - 1].z);
      m.limit = Math.round(Math.min(420, Math.max(240, len * 1.35 / 6 + 70))); m.stage = 0; m.i = 0; m.outT = 0;
    },
    update(m, dt) {
      if (m.failFast) return m.failFast;
      const f = focusXZ();
      if (m.stage === 0) {
        const th = W.off && W.off.th ? W.off.th : { x: -1000, z: 2650 };
        m.target = { x: th.x, z: th.z }; m.obj = 'Wjedź na ścieżkę off-road (plaża albo teleport przy pomniku Głowackiego)';
        const onTrail = typeof nearestTrailPoint === 'function' && nearestTrailPoint(f.x, f.z, 18);
        if (inOffRect(f.x, f.z) && onTrail && G.mode === 'car' && !activeCar.wrecked) { m.stage = 1; m.count = 3.2; m.target = m.cps[0]; toast('Ścieżka złapana. Szykuj się.', 1600); }
        return;
      }
      if (m.stage === 1) { m.count -= dt; m.target = m.cps[0]; m.obj = 'Start za ' + Math.max(1, Math.ceil(m.count)); if (m.count <= 0) { m.stage = 2; m.t = m.limit; m.t0 = performance.now(); banner('START!', 'go', 900); } return; }
      m.target = m.cps[m.i]; m.obj = 'Off-road ' + (m.i + 1) + '/' + m.cps.length;
      if (m.t <= 0) return 'Koniec czasu próby nad jeziorem';
      if (!inOffRect(f.x, f.z)) m.outT += dt; else m.outT = 0;
      if (m.outT > 12) return 'Wyjechałeś ze strefy off-road';
      if (G.mode === 'car' && at(m.target, 14, 40)) { m.i++; if (m.i >= m.cps.length) { m.bestNow = (performance.now() - m.t0) / 1000; return 'win'; } toast('Checkpoint ' + m.i + '/' + m.cps.length, 1000); }
    } },
  { id: 'drift', name: 'Drift pod Lidlem', giver: [514, 320], who: 'Darek od opon', where: 'parking przy Lidlu', reward: 210, recordPay: 40, side: true, bestKey: 'drift', bestLow: false, col: '#ffd21f',
    steps: ['Wjedź w żółte kółko (swoim autem albo czerwonym sportowym).', 'W 75 sekund uzbieraj 800 punktów driftu wewnątrz strefy.', 'Ręczny (spacja / RĘCZNY) i skręt. Poza kółkiem punkty stoją, nie kasują się.', 'Pierwsze zaliczenie płaci. Lepszy wynik daje premię za rekord.'],
    text: 'Pokaż, że umiesz bokiem. Osiemset punktów w półtorej minuty, w żółtym kółku przy Lidlu. Jak rozbijesz serię, punkty z tamtego ślizgu przepadają – jak zwykle – ale to, co już wpadło do licznika misji, zostaje.',
    start(m) {
      const s = roadSpot(514, 320, 80); m.zone = { x: s.x, z: s.z, r: 100 }; m.goal = 800; m.stage = 0; m.score = 0; m._lastSc = null;
      if (G.mode === 'car' && activeCar && !activeCar.wrecked && !activeCar.scooter) { m.keepCar = true; m.car = activeCar; }
      else m.car = misCar(0xe8503a, s, { model: 'sport' });
      if (typeof navZone === 'function') navZone(m.zone.x, m.zone.z, m.zone.r, true);
    },
    update(m) {
      if (typeof navZone === 'function') navZone(m.zone.x, m.zone.z, m.zone.r, true);
      const f = focusXZ(); const inside = Math.hypot(f.x - m.zone.x, f.z - m.zone.z) < m.zone.r && G.mode === 'car' && !activeCar.wrecked;
      if (m.stage === 0) { m.target = m.zone; m.obj = 'Wjedź do żółtej strefy driftu'; if (inside) { m.stage = 1; m.t = 75; m._lastSc = DRV.drift.score || 0; toast('Drift! Cel: 800 pkt', 1600); } return; }
      const sc = DRV.drift.score || 0; if (m._lastSc == null) m._lastSc = sc;
      const dlt = sc - m._lastSc; m._lastSc = sc; if (dlt > 0 && inside) m.score += dlt;
      m.target = m.zone; m.obj = 'Drift ' + Math.round(m.score) + ' / ' + m.goal + (inside ? '' : ' · wróć do kółka');
      if (m.score >= m.goal) { m.bestNow = Math.round(m.score); return 'win'; }
      if (m.t <= 0) {
        const scn = Math.round(m.score); if (scn > (SAVE.best.drift || 0)) { SAVE.best.drift = scn; saveGame(); }
        return 'Za mało punktów (' + scn + '/' + m.goal + ')';
      }
    }, cleanup() { if (typeof navZone === 'function') navZone(0, 0, 0, false); } },
  { id: 'tort', name: 'Tort do Dzikowa', giver: [-237, 770], who: 'Cukiernia Skalski', where: 'piekarnia Skalski', reward: 240, recordPay: 40, side: true, bestKey: 'tort', bestLow: true, col: '#e86fa0',
    steps: ['Wsiądź do auta pod piekarnią.', 'Zawieź tort do Zamku w Dzikowie.', 'Każde prawdziwe uszkodzenie (spadek HP) psuje tort. Lekkie otarcie poniżej progu gry się nie liczy.', 'Masz kilka sekund spokoju na wyjechanie ze stanowiska. Nagroda raz, rekord czasu zostaje.'],
    text: 'Wesele na zamku, tort w aucie. Jedno mocniejsze uderzenie i krem jest na szybie. Czas jest liczony z długości ulic, z zapasem – jedź spokojnie, nie na złamanie karku.',
    start(m) { m.car = misCar(0xfff1f6, roadSpot(m.gx + 6, m.gz + 3), { model: 'hatch' }); m.dest = roadSpot(300, -575, 140); m.stage = 0; m.grace = 0; },
    update(m, dt) {
      if (m.car.wrecked) return 'Tort spłonął razem z autem';
      if (m.stage === 0) { m.target = m.car; m.obj = 'Wsiądź do auta z tortem'; if (inCar(m.car)) { m.stage = 1; m.t = Math.max(220, legBudget(m.car.x, m.car.z, m.dest.x, m.dest.z)); m.grace = 4; m.t0 = performance.now(); toast('Tort na siedzeniu. Bez stłuczek.', 2000); } return; }
      if (m.grace > 0) { m.grace -= dt; if (m.grace <= 0) { m.car.hp = 100; m.car.burn = 0; } }
      else if (m.car.hp < 99.5) return 'Tort się rozmazał – auto uszkodzone';
      m.target = m.dest; m.obj = (inCar(m.car) ? 'Dowieź tort do Zamku w Dzikowie' : 'Wróć do auta z tortem!') + ' · karoseria ' + Math.round(m.car.hp) + '%';
      if (m.t <= 0) return 'Wesele zaczęło się bez tortu';
      if (inCar(m.car) && at(m.dest, 12, 4)) { m.bestNow = (performance.now() - m.t0) / 1000; return 'win'; }
    } },
  { id: 'placki', name: 'Dostawa placków ziemniaczanych', giver: [-120, 158], who: 'Szef The Italiana', where: 'ul. Kościuszki 7', reward: 280, recordPay: 40, side: true, bestKey: 'placki', bestLow: true, col: '#e2a122',
    steps: ['Podejdź pod restaurację The Italiana, ul. Kościuszki 7.', 'Odbierz placki ziemniaczane przy drzwiach.', 'Wsiądź na skuter.', 'Zawieź je do domu przy ul. Chłopskiej w Mokrzyszowie.', 'Nie walnij – placki się rozsypią. Stan widać na pasku.'],
    text: 'Placki ziemniaczane na stół w Mokrzyszowie! Odbierz je u mnie, na Kościuszki 7, i leć skuterem. Jedno mocne uderzenie i placki się rozsypią.',
    start(m) {
      m.pickup = roadSpot(-119.1, 158.1, 40);
      m.drop = roadSpot(3477.9, 692.2, 90);
      m.car = misCar(0xe2a122, roadSpot(m.pickup.x + 7, m.pickup.z + 5, 36), { scooter: true });
      m.limit = haulBudget(m.pickup.x, m.pickup.z, m.drop.x, m.drop.z);
      m.stage = 0; m.cargo = 100; m.t0 = performance.now();
    },
    update(m) {
      if (m.car.wrecked) return 'Skuter rozbity, placki na asfalcie';
      if (m.stage === 0) {
        m.target = m.pickup; m.obj = 'Odbierz placki · The Italiana, Kościuszki 7';
        if (at(m.pickup, 8, 4)) { m.stage = 1; misSay('Kucharz: „Ciepłe. Trzymaj równo!”'); }
        return;
      }
      if (m.stage === 1) {
        m.target = m.car; m.obj = 'Wsiądź na skuter z plackami';
        if (inCar(m.car)) { m.stage = 2; m.t = m.limit; misSay('Szef: „Mokrzyszów, i bez dziur w jezdni!”'); }
        return;
      }
      if (m.cargo <= 0) return 'Placki się rozsypały';
      if (m.t <= 0) return 'Placki wystygły';
      m.target = m.drop;
      m.obj = (inCar(m.car) ? 'Dowieź placki do Mokrzyszowa' : 'Wróć na skuter!') + ' · placki ' + Math.round(m.cargo) + '%';
      if (inCar(m.car) && at(m.drop, 12, 5)) { m.bestNow = (performance.now() - m.t0) / 1000; misSay('Gospodyni: „Pachną jak u mamy.”'); return 'win'; }
    },
    impact(m, v) {
      if (m.stage < 2 || !inCar(m.car)) return;
      m.cargo = Math.max(0, m.cargo - Math.min(30, 8 + v * 2));
      misSay('Placki się trzęsą! Zostało ' + Math.round(m.cargo) + '%');
    },
    bonus: (m) => Math.round(Math.min(70, Math.max(0, m.t) / 6)) },
  { id: 'list', name: 'List z Dzikowa', giver: [250, -450], who: 'Kustosz z Dzikowa', where: 'brama Zamku w Dzikowie', reward: 260, recordPay: 40, side: true, bestKey: 'list', bestLow: true, col: '#7fa8d8',
    steps: ['Wsiądź do auta przy bramie Dzikowa.', 'Odbierz list przy bramie zamku.', 'Zawieź go do Urzędu Miasta.', 'Odpowiedź odwieź na stację kolejową, zanim odjedzie pociąg.'],
    text: 'Do parku za zamkiem nie wchodzi ulica. List czeka przy bramie Dzikowa. Potem urząd, a odpowiedź ma złapać pociąg na stacji. Dwa kursy, dwa zegary.',
    start(m) {
      const s = roadSpot(225, -470, 80); m.car = misCar(0x7fa8d8, s, { model: 'hatch' });
      m.pickup = roadSpot(384, -514, 80); m.drop = roadSpot(-87, 370, 80); m.train = roadSpot(478, 162, 80);
      m.limitA = haulBudget(m.pickup.x, m.pickup.z, m.drop.x, m.drop.z);
      m.limitB = haulBudget(m.drop.x, m.drop.z, m.train.x, m.train.z);
      m.stage = 0; m.t0 = performance.now();
    },
    update(m) {
      if (m.car.wrecked) return 'Auto z listem rozbite';
      if (m.stage === 0) { m.target = m.car; m.obj = 'Wsiądź do niebieskiego auta przy bramie Dzikowa'; if (inCar(m.car)) { m.stage = 1; misSay('Kustosz: „List leży przy drugiej bramie.”'); } return; }
      if (m.stage === 1) {
        m.target = m.pickup; m.obj = 'Odbierz list przy bramie zamku' + (inCar(m.car) ? '' : ' · wróć do auta');
        if (inCar(m.car) && at(m.pickup, 12, 5)) { m.stage = 2; m.t = m.limitA; misSay('Kustosz: „Teraz urząd. Nie gub koperty.”'); }
        return;
      }
      if (m.stage === 2) {
        if (m.t <= 0) return 'Urząd już zamknięty';
        m.target = m.drop; m.obj = (inCar(m.car) ? 'Dowieź list do Urzędu Miasta' : 'Wróć do auta z listem!');
        if (inCar(m.car) && at(m.drop, 12, 5)) { m.stage = 3; m.t = m.limitB; misSay('Urzędniczka: „Odpowiedź na pociąg. Zdążysz.”'); }
        return;
      }
      if (m.t <= 0) return 'Pociąg odjechał bez odpowiedzi';
      m.target = m.train; m.obj = (inCar(m.car) ? 'Odwiedź odpowiedź na stację kolejową' : 'Wróć do auta!');
      if (inCar(m.car) && at(m.train, 12, 5)) { m.bestNow = (performance.now() - m.t0) / 1000; misSay('Konduktor: „Koperta jest. Jedziemy.”'); return 'win'; }
    },
    bonus: (m) => Math.round(Math.min(60, Math.max(0, m.t) / 6)) },
  { id: 'paczka', name: 'Paczka na Siarkowiec', giver: [-330, 900], who: 'Heniek z PKS', where: 'Dworzec PKS', reward: 290, recordPay: 40, side: true, bestKey: 'paczka', bestLow: true, col: '#a66bd0',
    steps: ['Wsiądź do furgonetki przy PKS.', 'Odbierz skrzynkę na stacji kolejowej.', 'Gliny wchodzą na ogon – jedź do kościoła św. Barbary na Siarkowcu.', 'Liczy się czas. Rozbity wóz kończy robotę.'],
    text: 'Skrzynka czeka na stacji. Jak ją weźmiesz, ktoś puści za tobą radiowozy. Dowieź ją pod kościół św. Barbary, zanim skończy się czas.',
    start(m) {
      m.car = misCar(0xc8b4e0, roadSpot(-330, 900, 70));
      m.pickup = roadSpot(478, 162, 80); m.drop = roadSpot(973, 880, 90);
      m.limit = haulBudget(m.pickup.x, m.pickup.z, m.drop.x, m.drop.z);
      m.stage = 0; m.t0 = performance.now();
    },
    update(m) {
      if (m.car.wrecked) return 'Furgonetka rozbita, paczka przepadła';
      if (m.stage === 0) { m.target = m.car; m.obj = 'Wsiądź do furgonetki Heńka'; if (inCar(m.car)) { m.stage = 1; misSay('Heniek: „Stacja. Skrzynka pod wiatą.”'); } return; }
      if (m.stage === 1) {
        m.target = m.pickup; m.obj = 'Odbierz paczkę na stacji kolejowej' + (inCar(m.car) ? '' : ' · wróć do furgonetki');
        if (inCar(m.car) && at(m.pickup, 12, 5)) { m.stage = 2; m.t = m.limit; setStars(Math.max(2, WANT.stars), 'paczka z dworca'); misSay('Heniek: „Gaz! Gliny na ogonie!”'); }
        return;
      }
      if (m.t <= 0) return 'Za późno – paczkę przejęli';
      m.target = m.drop; m.obj = (inCar(m.car) ? 'Dowieź paczkę do św. Barbary' : 'Wróć do furgonetki!') + ' · pościg';
      if (inCar(m.car) && at(m.drop, 14, 6)) { m.bestNow = (performance.now() - m.t0) / 1000; misSay('Ksiądz: „Zostaw pod furtką. I znikaj.”'); return 'win'; }
    },
    bonus: (m) => Math.round(Math.min(60, Math.max(0, m.t) / 6)) },
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
    const p = misPlace(gx + (m.id === 'taxi' ? 12 : 0), gz + (m.id === 'taxi' ? 9 : 0), 1.2); m.gx = p.x; m.gz = p.z; m.cool = Math.hypot(player.x - p.x, player.z - p.z) < 12; m.obj3 = makeGiver(p.x, p.z, m.col, m.who, m.id);
  }
  MIS.tgt = makeTarget();
  const hud = $('hud'); const mh = document.createElement('div'); mh.id = 'mhud'; mh.className = 'hidden';
  mh.innerHTML = '<button type="button" id="objTab" aria-expanded="true" title="Pokaż lub schowaj cel (H)"><b id="objTabKey">H</b><em id="objTabTime"></em><small id="objTabDir"></small></button><div id="objSlide"><div id="objCard"><b id="objTitle"></b><span id="objText"></span><i id="objCargo" class="hidden"><b></b></i><em id="objTime"></em><small id="objGps"></small><button type="button" id="gpsX" class="hidden">Anuluj GPS</button></div></div>';
  hud.appendChild(mh);
  const dl = document.createElement('div'); dl.id = 'dialog'; dl.className = 'cdialog hidden';
  dl.innerHTML = '<div class="who" id="dlgWho"></div><h3 id="dlgTitle"></h3><p id="dlgText"></p><div class="reward" id="dlgReward"></div><div class="btns"><button id="dlgYes">Przyjmij (E)</button><button id="dlgNo" class="sec">Nie teraz (Esc)</button></div>';
  document.body.appendChild(dl);
  $('dlgYes').onclick = () => dialogAction(); $('dlgNo').onclick = () => dialogClose();
  for (const id of ['dialog', 'shopMenu']) { $(id).addEventListener('touchstart', (e) => e.stopPropagation(), { passive: true }); $(id).addEventListener('mousedown', (e) => e.stopPropagation()); }
}
const GIVER_LOOK = {
  taxi: { hairStyle: 'cap', cap: 0x2a211c, jacket: 0xf6c431 },
  pizza: { hairStyle: 'short', jacket: 0xff7a2a },
  race: { hairStyle: 'pony', bag: 0x2a211c },
  escape: { hairStyle: 'bun', jacket: 0x5a3d80 },
  steal: { hairStyle: 'cap', cap: 0x6b4a32 },
  offroad: { hairStyle: 'long' },
  courier: { hairStyle: 'bun', skirt: true, bag: 0xf4f1ea },
  final: { hairStyle: 'short', jacket: 0x3a3a3a },
  kursy: { hairStyle: 'cap', cap: 0x2a211c, jacket: 0xf6c431 },
  targ: { hairStyle: 'long', skirt: true },
  uliczna: { hairStyle: 'pony', jacket: 0xff3b3b },
  jezioro: { hairStyle: 'short', bag: 0x1a6a8a },
  drift: { hairStyle: 'cap', cap: 0x222222, jacket: 0x2a211c },
  tort: { hairStyle: 'bun', skirt: true, jacket: 0xffd0e0 },
  placki: { hairStyle: 'short', jacket: 0xf4f1ea },
  list: { hairStyle: 'bun', jacket: 0x7fa8d8 },
  paczka: { hairStyle: 'cap', cap: 0x2a211c, jacket: 0xc8b4e0 },
};
function makeGiver(x, z, col, who, id) {
  const g = new THREE.Group(); g.position.set(x, groundH(x, z), z);
  const c = new THREE.Color(col);
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 26, 16, 1, true), new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending })); beam.position.y = 13; g.add(beam);
  const ring = new THREE.Mesh(new THREE.RingGeometry(1.4, 1.9, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.9, depthWrite: false })); ring.position.y = 0.22; g.add(ring);
  const look = GIVER_LOOK[id] || { hairStyle: 'short' };
  const w = makeWalker({ shirt: c.getHex(), ...look }); g.add(w);
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
function storyDoneCount() { return MIS.list.filter((q) => q.done && !q.side && q.id !== 'final').length; }
function giverOpen(m) { return !MIS.active && !m.busy && (!m.needs || storyDoneCount() >= m.needs); }
function nearGiver() {
  const f = focusXZ(); for (const m of MIS.list) if (!m.range && giverOpen(m) && Math.hypot(f.x - m.gx, f.z - m.gz) < (G.mode === 'car' ? 7 : 3.6)) return m; return null;
}
function missionHint() {
  if (MIS.active) return null; const m = nearGiver(); if (!m) return null;
  return (isTouch ? 'Dotknij AKCJA' : 'E') + ': porozmawiaj – ' + m.who + ' (' + m.name + ')';
}
function rideHint() {
  const m = MIS.active;
  if (!m || G.mode !== 'foot' || !m.car) return '';
  const o = m.obj || '';
  if (!/Wsiądź|Wróć/.test(o)) return '';
  return 'Wsiądź do pojazdu, żeby jechać dalej.';
}
function missionAction() { const m = nearGiver(); if (!m) return false; dialogOpen(m); return true; }
function dialogOpen(m) {
  MIS.dlg = m; G.paused = true; G.dialogOpen = true; if (document.pointerLockElement) document.exitPointerLock();
  $('dlgWho').textContent = m.who; $('dlgTitle').textContent = (m.done ? '✔ ' : '') + m.name; $('dlgText').textContent = '„' + m.text + '”';
  const rep = m.side ? (SAVE.claimed[m.id] ? ' · nagroda już odebrana – liczy się rekord' : ' · pełna nagroda tylko za pierwszym razem') : (m.done ? ' · już zaliczona – możesz powtórzyć' : '');
  $('dlgReward').textContent = 'Nagroda: ' + m.reward + ' zł' + rep;
  $('dialog').classList.remove('hidden');
}
function dialogClose() { if (!MIS.dlg) return; const m = MIS.dlg; m.cool = true; MIS.dlg = null; G.dialogOpen = false; G.paused = false; clock.getDelta(); $('dialog').classList.add('hidden'); }
function dialogAction() { if (!MIS.dlg) return false; const m = MIS.dlg; dialogClose(); missionStart(m); return true; }
function missionStart(m) {
  if (!m || MIS.active) return; MIS.active = m; m.t = undefined; m.target = null; m.obj = ''; m.stage = 0; m.car = null; m.keepCar = false; m.failFast = null; m.bestNow = null; m.startAt = performance.now();
  if (typeof NAV !== 'undefined') NAV.msig = '';
  m.start(m); MIS.events.push({ id: m.id, ev: 'start', t: performance.now() });
  banner(m.name, 'mstart', 2000); $('mhud').classList.remove('hidden');
}
function settleSide(m) {
  const first = !SAVE.claimed[m.id]; let improved = false;
  if (m.bestKey && typeof m.bestNow === 'number' && isFinite(m.bestNow)) {
    const prev = SAVE.best[m.bestKey]; const now = m.bestLow ? m.bestNow : Math.round(m.bestNow);
    improved = prev == null || (m.bestLow ? now < prev - 0.05 : now > prev + 0.5);
    if (improved) SAVE.best[m.bestKey] = m.bestLow ? +now.toFixed(2) : now;
  }
  let pay = 0;
  if (first) { pay = (m.pay ? m.pay(m) : m.reward) + (m.bonus ? (m.bonus(m) || 0) : 0); SAVE.claimed[m.id] = true; }
  else if (improved) pay = m.recordPay || 40;
  return { pay: Math.max(0, Math.round(pay) || 0), first, improved };
}
function missionEnd(ok, why) {
  const m = MIS.active; if (!m) return; MIS.active = null; MIS.tgt.g.visible = false;
  if (m.cleanup) m.cleanup(m);
  if (m.car && !m.keepCar) misDropCarLater(m.car); else if (m.car) m.car.mission = false;
  m.car = null;
  if (typeof navClear === 'function') { NAV.msig = ''; navClear(); }
  if (typeof navZone === 'function') navZone(0, 0, 0, false);
  MIS.events.push({ id: m.id, ev: ok ? 'pass' : 'fail', why, t: performance.now() });
  if (ok) {
    let pay, note = '';
    if (m.side) {
      const s = settleSide(m); pay = s.pay;
      if (!s.first && s.improved) note = 'NOWY REKORD!\n+' + pay + ' zł';
      else if (!s.first) note = 'UKOŃCZONE PONOWNIE\nbez premii – rekord bez zmian';
    } else pay = m.pay ? m.pay(m) : m.reward + (m.bonus ? (m.bonus(m) || 0) : 0);
    m.done = true; SAVE.done[m.id] = true;
    if (pay) addMoney(pay); else saveGame();
    banner(note || ('MISJA ZALICZONA!\n+' + pay + ' zł'), 'pass', 3600); MIS.lastPay = pay;
    if (!m.side && m.id !== 'final' && storyDoneCount() === 5 && !SAVE.finalHint) { SAVE.finalHint = true; saveGame(); setTimeout(() => toast('Odblokowano finał! Wielki Szef czeka przy Muzeum Siarki', 4000), 3800); }
    if (m.id === 'final') setTimeout(() => banner('LEGENDA TARNOBRZEGA! 🏆', 'pass', 5000), 3800);
  } else { banner('MISJA NIEUDANA\n' + (why || ''), 'fail', 3200); }
  m.cool = true;
  if ($('mhud') && !(typeof NAV !== 'undefined' && NAV.on)) $('mhud').classList.add('hidden');
}
function missionCancel() {
  const m = MIS.active; if (!m) return;
  MIS.active = null; if (MIS.tgt) MIS.tgt.g.visible = false;
  if (m.cleanup) m.cleanup(m);
  if (m.car && !m.keepCar) misDropCarLater(m.car); else if (m.car) m.car.mission = false;
  m.car = null; m.cool = true;
  if (typeof navClear === 'function') { NAV.msig = ''; navClear(); }
  if (typeof navZone === 'function') navZone(0, 0, 0, false);
  MIS.events.push({ id: m.id, ev: 'cancel', t: performance.now() });
  banner('MISJA ANULOWANA', 'fail', 1400);
  if ($('mhud') && !(typeof NAV !== 'undefined' && NAV.on)) $('mhud').classList.add('hidden');
}
function misDropCarLater(c) { if (c === activeCar) { c.mission = false; return; } c.dropAt = performance.now(); MIS.drop = MIS.drop || []; MIS.drop.push(c); }
function missionFail(why) { if (MIS.active) missionEnd(false, why); }
function missionImpact(v) { const m = MIS.active; if (m && m.impact) m.impact(m, v); }
function missionEvent(ev) { /* hook: 'lost' when police chase ends */ MIS.lastEvent = ev; }
function updateMissions(dt) {
  const f = focusXZ(); const tt = performance.now() * 0.003;
  for (const m of MIS.list) {
    const o = m.obj3; if (!o) continue; const show = giverOpen(m); o.g.visible = show; if (!show) continue;
    const d = Math.hypot(f.x - m.gx, f.z - m.gz); o.beam.material.opacity = 0.16 + 0.1 * Math.sin(tt + m.gx); o.ex.position.y = 3.2 + Math.sin(tt * 1.5) * 0.25; o.lab.visible = d < 40;
    o.w.rotation.y = Math.atan2(f.x - m.gx, f.z - m.gz);
    if (d < 80) animateWalker(o.w, 0, dt, false);
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
  if (typeof navOnMission === 'function') navOnMission(m);
}
function drawMissionMinimap(g, sc) {
  g.lineWidth = 2 / sc; g.strokeStyle = '#2a211c';
  for (const m of MIS.list) { if (m.range || !giverOpen(m)) continue; g.fillStyle = m.col; g.beginPath(); g.arc(m.gx, m.gz, 8 / sc, 0, 7); g.fill(); g.stroke(); g.fillStyle = '#2a211c'; g.font = 'bold ' + (11 / sc) + 'px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('!', m.gx, m.gz + 0.5 / sc); }
  if (typeof drawRangeMinimap === 'function') drawRangeMinimap(g, sc);
  const T = MIS.active && MIS.active.target; if (T && T !== activeCar) { g.fillStyle = '#ffd21f'; g.beginPath(); g.moveTo(T.x, T.z - 11 / sc); g.lineTo(T.x + 8 / sc, T.z); g.lineTo(T.x, T.z + 11 / sc); g.lineTo(T.x - 8 / sc, T.z); g.closePath(); g.fill(); g.stroke(); }
  if (MIS.active && MIS.active.cps) { g.fillStyle = '#ff3b3b'; for (const r of MIS.active.rivals || []) { g.beginPath(); g.arc(r.x, r.z, 5 / sc, 0, 7); g.fill(); } }
  for (const c of POL.cars) if (c.g.visible && c !== activeCar && (c.pai || c.block || c.patrol)) { const b = Math.floor(performance.now() / 250) % 2; g.fillStyle = c.patrol ? '#3d6fe0' : (b ? '#ff2a2a' : '#2a5cff'); g.beginPath(); g.arc(c.x, c.z, 6 / sc, 0, 7); g.fill(); g.stroke(); }
  for (const p of POL.foot) if (p.on) { g.fillStyle = '#2a5cff'; g.beginPath(); g.arc(p.x, p.z, 4 / sc, 0, 7); g.fill(); }
  g.fillStyle = '#ff3fa4'; for (const s of PLACES.shops) { g.beginPath(); g.arc(s.x, s.z, 6 / sc, 0, 7); g.fill(); g.stroke(); }
  if (typeof drawGarageMinimap === 'function') { drawGarageMinimap(g, sc); drawPickupMinimap(g, sc); }
}


// ======================= RADIO (stacje w stylu GTA) =======================
const RADIO = { i: 0, audio: null, playing: false, auto: false, fails: 0, npTimer: 0, wd: 0, popT: 0, hideT: 0, now: '', msg: '', lastMode: 'foot', userOff: false, live: 0, switching: false };
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
  if (navigator.onLine === false) { RADIO.playing = false; RADIO.switching = false; radioMsg('Brak internetu. Gra działa dalej.'); return; }
  const token = ++RADIO.live;
  RADIO.failTok = token;
  if (!RADIO.audio) {
    const a = new Audio(); a.preload = 'none'; a.crossOrigin = null;
    a.addEventListener('playing', () => {
      if (!RADIO.playing) return;
      RADIO.fails = 0; clearTimeout(RADIO.wd);
      if (settings.station !== RADIO.i) { settings.station = RADIO.i; saveSettings(); }
      radioMsg(''); radioNP();
    });
    a.addEventListener('waiting', () => { if (RADIO.playing) radioMsg('Buforowanie…'); });
    a.addEventListener('error', () => {
      if (!RADIO.playing || RADIO.switching) return;
      if (a.error && a.error.code === 1) return;
      radioFail();
    });
    RADIO.audio = a;
  }
  const a = RADIO.audio; a.volume = settings.radioVol;
  a.src = s.url + (s.url.includes('?') ? '&' : '?') + 't=' + Date.now();
  RADIO.playing = true; radioMsg('Łączenie: ' + s.name + '…');
  const p = a.play();
  if (p && p.catch) p.catch((err) => {
    if (RADIO.live !== token || !RADIO.playing) return;
    if (err && err.name === 'NotAllowedError') { RADIO.playing = false; radioMsg('Dotknij ⏻ Włącz, żeby puścić dźwięk.'); }
    else radioFail();
  });
  clearTimeout(RADIO.wd);
  RADIO.wd = setTimeout(() => { if (RADIO.playing && RADIO.live === token && a.readyState < 3) radioFail(); }, 8000);
  clearInterval(RADIO.npTimer); RADIO.npTimer = setInterval(radioNP, 20000);
  RADIO.switching = false;
}
function radioFail() {
  if (!RADIO.playing || RADIO.switching) return;
  if (RADIO.failTok !== RADIO.live) return;
  RADIO.failTok = 0;
  RADIO.switching = true;
  RADIO.fails++;
  clearTimeout(RADIO.wd);
  if (RADIO.fails >= RADIO_STATIONS.length) {
    RADIO.switching = false;
    radioStop();
    radioMsg('Żadna stacja nie odpowiada. Gra działa dalej.');
    return;
  }
  RADIO.i = (RADIO.i + 1) % RADIO_STATIONS.length;
  radioMsg('Stacja nie działa – następna.');
  radioPopup();
  radioPlay();
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
    } else if (s.np.type === 'radioco') {
      const r = await fetch('https://public.radio.co/stations/' + s.np.id + '/status', { cache: 'no-store' }); const j = await r.json();
      const t = j && j.current_track && j.current_track.title;
      if (RADIO.i === myI) RADIO.now = t || '';
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
// NIPPLEJS: dynamic joystick on the left (or the right when left-handed). The right side stays a look drag.
let NIPPLE = null;
function initNipple() {
  const zone = $('nippleZone');
  if (!zone || !isTouch || typeof nipplejs === 'undefined' || !nipplejs.create) return;
  if (NIPPLE && NIPPLE.destroy) NIPPLE.destroy();
  NIPPLE = nipplejs.create({
    zone,
    mode: 'dynamic',
    color: '#f6c431',
    size: Math.round(110 * (settings.btnScale || 1)),
    restOpacity: 0.45,
    fadeTime: 90,
    multitouch: false,
  });
  $('touch').classList.add('nipple');
  NIPPLE.on('move', (_evt, data) => {
    const f = data.force || 0;
    if (f < 0.12) { G.touch.jx = G.touch.jy = 0; G.touch.jon = false; return; }
    G.touch.jx = data.vector.x;
    G.touch.jy = -data.vector.y;
    G.touch.jon = true;
  });
  NIPPLE.on('end', () => { G.touch.jx = G.touch.jy = 0; G.touch.jon = false; });
}
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
  initNipple();
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
  if (NIPPLE && e.target.closest && e.target.closest('#nippleZone')) return;
  const x = e.clientX, y = e.clientY, id = e.pointerId;
  try { $('touch').setPointerCapture(id); } catch (err) { /* ignore */ }
  const b = btnAt(x, y);
  if (b) { TP.ptrs.set(id, { t: 'btn', b }); bPress(b); return; }
  if (G.inRange && typeof rangeAimEvent === 'function') { rangeAimEvent(e); TP.ptrs.set(id, { t: 'aim' }); return; }
  if (!NIPPLE && !TP.joy && joyLeftSide(x) && y > innerHeight * 0.25) {
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
  else if (p.t === 'aim' && typeof rangeAimEvent === 'function') rangeAimEvent(e);
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
  for (const k of ['gas', 'brake', 'hand', 'run', 'jump', 'nitro']) G.touch[k] = false;
  for (const b of TP.btns) b.el.classList.remove('active');
  if (G.keys) G.keys.clear();
}
// krzywa skrętu: precyzyjnie przy środku, pełny skręt na krawędzi; czułość z ustawień
function steerCurve(v) { const a = Math.abs(v); const c = 0.4 * a + 0.6 * a * a * a; return Math.sign(v) * Math.min(1, c * (settings.steerSens || 1)); }


// ======================= GARAŻE: WŁASNE AUTA, SALON, TUNING, LAKIER =======================
const MODELS = {
  hatch: { n: 'Kropka', d: 'Mały hatchback – tani, zwinny, ale delikatny', price: 800, maxv: 42, acc: 12, brk: 27, grip: 9.6, steer: 0.6, armor: 1.0, pitch: 1.25, gears: 5, col: 0xf6c431 },
  sedan: { n: 'Leliwa', d: 'Rodzinny sedan – solidny wszechstronniak', price: 2500, maxv: 48, acc: 13.5, brk: 28, grip: 9, steer: 0.55, armor: 0.85, pitch: 1.0, gears: 5, col: 0x3d8fe0 },
  jeep: { n: 'Kosynier 4×4', d: 'Terenówka – twarda i nie boi się błota', price: 4500, maxv: 43, acc: 14.5, brk: 26, grip: 8.6, steer: 0.52, armor: 0.7, pitch: 0.78, gears: 5, col: 0x45b65a },
  sport: { n: 'Siarka GT', d: 'Sportowe coupé – szybkie i przyczepne', price: 8000, maxv: 60, acc: 19, brk: 34, grip: 11, steer: 0.58, armor: 1.0, pitch: 1.4, gears: 6, col: 0xe8503a },
  muscle: { n: 'Interceptor', d: 'Muscle car à la radiowóz – ciężki taran z V8', price: 12000, maxv: 56, acc: 17.5, brk: 30, grip: 9.6, steer: 0.54, armor: 0.62, pitch: 0.68, gears: 5, col: 0x23262e },
};
const UPG = {
  engine: { n: 'Silnik', ic: '⚙️', max: 3, price: [600, 1400, 2800], d: '+6% prędkości maks., +12% przyspieszenia' },
  brakes: { n: 'Hamulce', ic: '🛑', max: 3, price: [300, 700, 1500], d: '+15% siły hamowania' },
  grip: { n: 'Opony i zawieszenie', ic: '🛞', max: 3, price: [400, 900, 1900], d: '+10% przyczepności, +4% skrętu' },
  armor: { n: 'Pancerz', ic: '🛡️', max: 3, price: [500, 1200, 2500], d: '−15% obrażeń za poziom' },
  nitro: { n: 'Nitro', ic: '🔥', max: 2, price: [1500, 3000], d: 'Shift / X / przycisk NITRO – zastrzyk mocy' },
};
const PAINTS = [0xe8503a, 0xf08a2c, 0xf6c431, 0x45b65a, 0x4fc3c8, 0x3d8fe0, 0x5a6b8c, 0xa66bd0, 0xe86fa0, 0xf4f1ea, 0x23262e, 0x8a5a3a];
const PAINT_PRICE = 100, REPAIR_PRICE = 50, GAR_CAP = 6;
const GAR = { places: [], open: null, tab: 'mine', own: null, ownLost: false, sel: 0 };
const hex = (c) => '#' + (c >>> 0).toString(16).padStart(6, '0');

function carStats(rec) {
  const M = MODELS[rec.model] || MODELS.sedan, u = rec.up || {};
  const L = (k) => u[k] || 0;
  return {
    maxv: M.maxv * (1 + 0.06 * L('engine')), acc: M.acc * (1 + 0.12 * L('engine')), brk: M.brk * (1 + 0.15 * L('brakes')),
    grip: M.grip * (1 + 0.1 * L('grip')), steer: M.steer * (1 + 0.04 * L('grip')), armor: M.armor * (1 - 0.15 * L('armor')),
    nitro: L('nitro'), nboost: L('nitro') >= 2 ? 1.35 : 1.25, ncap: L('nitro') >= 2 ? 5 : 3.2, pitch: M.pitch, gears: M.gears,
  };
}
// ---- save migration (v1 → v2: garage, stats). Old saves keep money + finished missions.
function migrateSave() {
  if (typeof SAVE.money !== 'number' || !isFinite(SAVE.money)) SAVE.money = 100;
  if (!SAVE.done || typeof SAVE.done !== 'object') SAVE.done = {};
  if (!SAVE.best || typeof SAVE.best !== 'object') SAVE.best = {};
  const old = !SAVE.v || SAVE.v < 2;
  if (!SAVE.garage || !Array.isArray(SAVE.garage.cars)) SAVE.garage = { cars: [], sel: 0, next: 1 };
  const g = SAVE.garage; g.next = Math.max(1, g.next | 0);
  g.cars = g.cars.filter((r) => r && MODELS[r.model]).slice(0, GAR_CAP);
  for (const r of g.cars) {
    const up = r.up && typeof r.up === 'object' ? r.up : {}; r.up = {};
    for (const k in UPG) r.up[k] = Math.max(0, Math.min(UPG[k].max, Math.round(+up[k] || 0)));
    if (typeof r.color !== 'number') r.color = MODELS[r.model].col;
    if (!r.uid) r.uid = g.next++; else g.next = Math.max(g.next, r.uid + 1);
  }
  if (!g.cars.length) g.cars.push({ uid: g.next++, model: 'hatch', color: MODELS.hatch.col, up: { engine: 0, brakes: 0, grip: 0, armor: 0, nitro: 0 }, starter: true });
  if (!g.cars.some((r) => r.uid === g.sel)) g.sel = g.cars[0].uid;
  SAVE.stats = Object.assign({ driftBest: 0, driftCash: 0, jumps: 0, jumpBest: 0, pickups: 0 }, SAVE.stats || {});
  if (!SAVE.claimed || typeof SAVE.claimed !== 'object' || Array.isArray(SAVE.claimed)) SAVE.claimed = {};
  if (typeof SAVE.tut !== 'number') SAVE.tut = 0;
  SAVE.v = 3; GAR.migrated = old; saveGame();
}
migrateSave();
const ownRec = (uid) => SAVE.garage.cars.find((r) => r.uid === uid) || null;

// ---- places, markers
function initGarages() {
  const defs = [{ n: 'Garaże', x: 934, z: 828 }, { n: 'Garaż przy Orlenie', x: -79, z: 1055 }];
  for (const d of defs) {
    const rp = nearestRoadPoint(d.x, d.z, true, 300); if (!rp) continue;
    const name = d.n + (rp.road.name ? ' – ' + rp.road.name : '');
    const rx = Math.cos(rp.h), rz = -Math.sin(rp.h), fx = Math.sin(rp.h), fz = Math.cos(rp.h);
    const p = { n: name, x: rp.x, z: rp.z, h: rp.h, px: rp.x + fx * 9, pz: rp.z + fz * 9, cool: false };
    const g = new THREE.Group(); g.position.set(p.x, groundH(p.x, p.z), p.z);
    const ring = new THREE.Mesh(new THREE.RingGeometry(4.2, 5.2, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x2fd0ff, transparent: true, opacity: 0.8, depthWrite: false })); ring.position.y = 0.22; g.add(ring);
    const ico = new THREE.Group(); ico.position.y = 4.4; g.add(ico);
    const wall = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.5, 1.8), mkMat({ color: 0xf4f1ea })); ico.add(wall);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(1.75, 0.8, 4).rotateY(Math.PI / 4), mkMat({ color: 0x2fd0ff })); roof.scale.z = 0.75; roof.position.y = 1.15; ico.add(roof);
    for (const s of [-1, 1]) { const door = new THREE.Mesh(new THREE.BoxGeometry(1.7, 1.1, 0.05), mkMat({ color: 0x5a6b8c })); door.position.set(0, -0.15, s * 0.92); ico.add(door); }
    const lab = labelSprite('🔧 GARAŻ', '#2fd0ff', 5); lab.position.y = 7.2; g.add(lab);
    scene.add(g); p.g = g; p.ring = ring; p.ico = ico; GAR.places.push(p);
    W.travel.push(['🔧 ' + name, p.x + rx * 3, p.z + rz * 3]);
  }
  PLACES.garages = GAR.places;
  buildGarageUi();
  if (GAR.migrated) setTimeout(() => toast('Nowość: 🔧 garaże! Kupuj auta i tuninguj je (niebieskie punkty na mapie)', 4200), 4000);
}
function nearGarage(r = 7) { const f = focusXZ(); return GAR.places.find((p) => Math.hypot(p.x - f.x, p.z - f.z) < r) || null; }
function garageHint() {
  const p = nearGarage(9); if (!p || GAR.open) return null;
  if (WANT.stars) return p.n + ': policja na ogonie – najpierw ją zgub!';
  return '🔧 ' + p.n + (G.mode === 'car' ? ': zatrzymaj się w kółku (E)' : ': naciśnij ' + (isTouch ? 'AKCJA' : 'E') + ' – twoje auta i tuning');
}
function garageAction() { const p = nearGarage(9); if (!p || G.cut) return false; if (WANT.stars) { toast('Garaż zamknięty, dopóki ściga cię policja!', 1800); return true; } garageOpen(p); return true; }
function updateGarages(dt) {
  const t = performance.now() * 0.003;
  for (const p of GAR.places) { p.ring.material.opacity = 0.5 + 0.35 * Math.sin(t); p.ico.rotation.y += dt * 0.8; p.ico.position.y = 4.4 + Math.sin(t * 0.7) * 0.25; }
  // own car lost (wrecked) → insurance brings it back to the garage
  const o = GAR.own;
  if (o && (o.wrecked || GAR.ownLost) && o !== activeCar && !G.cut) { removeOwn(); toast('Ubezpieczenie: twoje auto wróciło do garażu (naprawione) 🔧', 3000); }
  const p = nearGarage(6);
  if (!p) { for (const q of GAR.places) q.cool = false; return; }
  if (G.mode === 'car' && activeCar.speed < 2 && !p.cool && !G.cut && !WANT.stars && !(MIS.active && MIS.active.id === 'steal')) { p.cool = true; garageOpen(p); }
}
function drawGarageMinimap(g, sc) {
  for (const p of GAR.places) {
    g.fillStyle = '#2fd0ff'; g.fillRect(p.x - 7 / sc, p.z - 6 / sc, 14 / sc, 12 / sc); g.strokeRect(p.x - 7 / sc, p.z - 6 / sc, 14 / sc, 12 / sc);
    g.fillStyle = '#2a211c'; g.font = 'bold ' + (10 / sc) + 'px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('G', p.x, p.z + 0.5 / sc);
  }
  const o = GAR.own; if (o && o !== activeCar) { g.fillStyle = '#7dff7a'; g.beginPath(); g.arc(o.x, o.z, 6 / sc, 0, 7); g.fill(); g.stroke(); }
}

// ---- spawning / storing own cars
function applyOwn(c, rec) { c.own = rec; c.st = carStats(rec); c.nf = 1; c.hp = 100; }
function removeOwn() {
  const c = GAR.own; GAR.own = null; GAR.ownLost = false; if (!c) return;
  if (c === activeCar) leaveCarQuiet();
  const i = cars.indexOf(c); if (i >= 0) cars.splice(i, 1); scene.remove(c.g); c.g.visible = false; c.x = 0; c.z = -99999; if (c.geo && c.geo.dispose) c.geo.dispose();
}
function leaveCarQuiet() { const c = activeCar; if (!c) return; c.vx = c.vz = 0; enterExit(); }
function enterCarDirect(c) {
  if (G.mode === 'car') leaveCarQuiet();
  activeCar = c; G.mode = 'car'; player.mesh.visible = false; G.yaw = c.h; c.vx = c.vz = 0;
  $('speedo').classList.remove('hidden'); $('touch').classList.add('incar'); $('tEnter').textContent = 'Wysiądź';
}
function spawnOwn(rec, p) {
  if (GAR.own) removeOwn();
  // whatever car we came with is parked a bit further down the road
  if (G.mode === 'car' && activeCar) { const c = activeCar; leaveCarQuiet(); const [x, z] = findFree(p.px, p.pz, 2.4); c.x = x; c.z = z; c.h = p.h; c.vx = c.vz = 0; c.sync(); }
  const c = new Car(scene, rec.color, p.x, p.z, p.h, { model: rec.model }); applyOwn(c, rec); cars.push(c); GAR.own = c;
  SAVE.garage.sel = rec.uid; saveGame(); enterCarDirect(c); return c;
}
function storeCurrent() { // park the own car you arrived in
  if (!GAR.own || GAR.own !== activeCar) return false; removeOwn(); toast('Auto zaparkowane w garażu 🅿️', 1600); return true;
}
function keepStolen() {
  const c = activeCar;
  if (!c || G.mode !== 'car' || c.own || c.police || c.scooter || c.mission || c === EGG.jeep || c.wrecked) return toast('Tego auta nie da się wstawić do garażu', 1800), false;
  if (SAVE.garage.cars.length >= GAR_CAP) return toast('Garaż pełny (' + GAR_CAP + ' aut) – sprzedaj coś', 1800), false;
  const g = SAVE.garage; const rec = { uid: g.next++, model: c.offroad ? 'jeep' : 'sedan', color: c.color, up: { engine: 0, brakes: 0, grip: 0, armor: 0, nitro: 0 }, stolen: true };
  g.cars.push(rec); leaveCarQuiet();
  if (c.fromPool) despawnCar(c); else { const i = cars.indexOf(c); if (i >= 0) cars.splice(i, 1); scene.remove(c.g); c.g.visible = false; }
  GAR.sel = rec.uid; saveGame(); toast('Auto trafia do twojej kolekcji! 🚗', 2000); return true;
}
function sellCar(uid) {
  const g = SAVE.garage; const r = ownRec(uid); if (!r || g.cars.length <= 1) return false;
  const M = MODELS[r.model]; let val = r.stolen ? 300 : Math.round(M.price * 0.5);
  for (const k in UPG) for (let l = 0; l < (r.up[k] || 0); l++) val += Math.round(UPG[k].price[l] * 0.3);
  if (GAR.own && GAR.own.own === r) removeOwn();
  g.cars.splice(g.cars.indexOf(r), 1); if (g.sel === uid) g.sel = g.cars[0].uid; if (GAR.sel === uid) GAR.sel = g.cars[0].uid;
  addMoney(val, 'sprzedaż auta'); return val;
}
function buyModel(m) {
  const M = MODELS[m]; if (!M) return false; const g = SAVE.garage;
  if (g.cars.some((r) => r.model === m && !r.stolen)) { toast('Już masz to auto', 1400); return false; }
  if (g.cars.length >= GAR_CAP) { toast('Garaż pełny (' + GAR_CAP + ' aut)', 1600); return false; }
  if (SAVE.money < M.price) { toast('Za mało kasy – brakuje ' + (M.price - SAVE.money) + ' zł', 1800); return false; }
  const rec = { uid: g.next++, model: m, color: M.col, up: { engine: 0, brakes: 0, grip: 0, armor: 0, nitro: 0 } };
  g.cars.push(rec); GAR.sel = rec.uid; g.sel = rec.uid; addMoney(-M.price, 'nowe auto: ' + M.n); flash(); return rec;
}
function upgradeCar(uid, k) {
  const r = ownRec(uid), U = UPG[k]; if (!r || !U) return false; const l = r.up[k] || 0;
  if (l >= U.max) { toast('Maksymalny poziom', 1200); return false; }
  const price = U.price[l]; if (SAVE.money < price) { toast('Za mało kasy – brakuje ' + (price - SAVE.money) + ' zł', 1800); return false; }
  r.up[k] = l + 1; addMoney(-price, U.n + ' ' + (l + 1) + '/' + U.max);
  if (GAR.own && GAR.own.own === r) { const nf = GAR.own.nf; GAR.own.st = carStats(r); GAR.own.nf = nf === undefined ? 1 : nf; }
  return true;
}
function paintCar(uid, col) {
  const r = ownRec(uid); if (!r) return false; if (r.color === col) return false;
  if (SAVE.money < PAINT_PRICE) { toast('Za mało kasy na lakier', 1500); return false; }
  r.color = col; addMoney(-PAINT_PRICE, 'nowy lakier');
  if (GAR.own && GAR.own.own === r) { GAR.own.setPaint(col); GAR.own.color = col; }
  return true;
}
function repairActive() {
  const c = activeCar; if (!c || G.mode !== 'car' || c.hp >= 99.5) return false;
  if (SAVE.money < REPAIR_PRICE) { toast('Za mało kasy na naprawę', 1500); return false; }
  c.hp = 100; c.burn = 0; addMoney(-REPAIR_PRICE, 'naprawa'); hpHud(); return true;
}
function ownWrecked(c) { if (c && c === GAR.own) GAR.ownLost = true; }

// ---- UI
function buildGarageUi() {
  const d = document.createElement('div'); d.id = 'garage'; d.className = 'cdialog hidden';
  d.innerHTML = '<div class="gHead"><h3 id="gTitle">🔧 Garaż</h3><div id="gCash" class="gCash"></div><button id="gX" class="sec gX" aria-label="Wyjdź">✕</button></div>' +
    '<div class="gTabs"><button data-t="mine">🚗 Moje auta</button><button data-t="shop">🏷️ Salon</button><button data-t="tune">🔧 Tuning</button><button data-t="paint">🎨 Lakier</button></div>' +
    '<div id="gBody" class="gBody"></div><div class="gFoot">' + (isTouch ? 'Stuknij ✕, by wyjść' : '1–4 zakładki · ←/→ wybór auta · Esc wyjście') + '</div>';
  document.body.appendChild(d);
  d.addEventListener('touchstart', (e) => e.stopPropagation(), { passive: true }); d.addEventListener('mousedown', (e) => e.stopPropagation());
  $('gX').onclick = () => garageClose();
  d.querySelectorAll('.gTabs button').forEach((b) => { b.onclick = () => { GAR.tab = b.dataset.t; garageRender(); }; });
  $('gBody').addEventListener('click', (e) => {
    const b = e.target.closest('[data-a]'); if (!b || b.disabled) return; const a = b.dataset.a, v = b.dataset.v; buzz(12);
    if (a === 'out') { const r = ownRec(+v); if (r) { spawnOwn(r, GAR.open); garageClose(); toast('Wyjeżdżasz: ' + carName(r) + ' 🚗', 1600); } return; }
    if (a === 'sel') { GAR.sel = +v; GAR.tab = 'tune'; }
    else if (a === 'selp') { GAR.sel = +v; GAR.tab = 'paint'; }
    else if (a === 'buy') { const r = buyModel(v); if (r) GAR.tab = 'mine'; }
    else if (a === 'up') upgradeCar(GAR.sel, v);
    else if (a === 'paint') paintCar(GAR.sel, +v);
    else if (a === 'fix') repairActive();
    else if (a === 'store') storeCurrent();
    else if (a === 'keep') keepStolen();
    else if (a === 'sell') { if (b.dataset.sure) sellCar(+v); else { b.dataset.sure = 1; b.textContent = 'Na pewno?'; return; } }
    else if (a === 'cyc') cycleSel(+v);
    garageRender();
  });
}
const carName = (r) => (MODELS[r.model] || MODELS.sedan).n + (r.stolen ? ' (z ulicy)' : '');
function cycleSel(dir) { const L = SAVE.garage.cars; let i = L.findIndex((r) => r.uid === GAR.sel); i = (i + dir + L.length) % L.length; GAR.sel = L[i].uid; }
function statBars(st) {
  const row = (n, k, txt) => '<div class="gStat"><span>' + n + '</span><i><b style="width:' + Math.round(Math.min(1, k) * 100) + '%"></b></i><em>' + txt + '</em></div>';
  return '<div class="gStats">' + row('Prędkość', st.maxv / 75, Math.round(st.maxv * 3.6) + ' km/h') + row('Przyspieszenie', st.acc / 28, (st.acc / 13).toFixed(2) + '×') +
    row('Hamulce', st.brk / 55, (st.brk / 28).toFixed(2) + '×') + row('Prowadzenie', st.grip / 15, (st.grip / 9).toFixed(2) + '×') + row('Wytrzymałość', 1 / st.armor / 3, (1 / st.armor).toFixed(1) + '×') +
    (st.nitro ? row('Nitro', st.nitro / 2, 'poz. ' + st.nitro) : '') + '</div>';
}
const pips = (l, m) => '<span class="gPips">' + '●'.repeat(l) + '<s>' + '○'.repeat(m - l) + '</s></span>';
function garageRender() {
  const p = GAR.open; if (!p) return; const T = GAR.tab, g = SAVE.garage, m = SAVE.money;
  $('gTitle').textContent = '🔧 ' + p.n; $('gCash').textContent = m + ' zł';
  document.querySelectorAll('#garage .gTabs button').forEach((b) => b.classList.toggle('on', b.dataset.t === T));
  if (!ownRec(GAR.sel)) GAR.sel = g.sel;
  let h = '';
  if (T === 'mine') {
    const inOwn = G.mode === 'car' && GAR.own && activeCar === GAR.own;
    if (G.mode === 'car' && activeCar && !activeCar.own && !activeCar.police && !activeCar.scooter && !activeCar.mission) h += '<div class="gNote">Przyjechałeś cudzym autem. <button data-a="keep">🅿️ Zatrzymaj je w garażu</button></div>';
    for (const r of g.cars) {
      const st = carStats(r), out = GAR.own && GAR.own.own === r; const lv = Object.keys(UPG).reduce((s, k) => s + (r.up[k] || 0), 0);
      h += '<div class="gCard' + (r.uid === GAR.sel ? ' sel' : '') + '"><div class="gCarHead"><span class="gSw" style="background:' + hex(r.color) + '"></span><b>' + carName(r) + '</b><small>' + (out ? (activeCar === GAR.own ? 'jedziesz nim' : 'stoi w mieście') : 'w garażu') + ' · tuning ' + lv + '</small></div>' + statBars(st) +
        '<div class="gBtns">' + (out && inOwn ? '<button data-a="store">🅿️ Zaparkuj tutaj</button>' : '<button data-a="out" data-v="' + r.uid + '">🚗 Wyjedź</button>') +
        '<button class="sec" data-a="sel" data-v="' + r.uid + '">🔧 Tuning</button><button class="sec" data-a="selp" data-v="' + r.uid + '">🎨</button>' +
        (g.cars.length > 1 ? '<button class="sec small" data-a="sell" data-v="' + r.uid + '">Sprzedaj</button>' : '') + '</div></div>';
    }
  } else if (T === 'shop') {
    for (const k in MODELS) {
      const M = MODELS[k], st = carStats({ model: k, up: {} }), has = g.cars.some((r) => r.model === k && !r.stolen);
      h += '<div class="gCard"><div class="gCarHead"><span class="gSw" style="background:' + hex(M.col) + '"></span><b>' + M.n + '</b><small>' + M.d + '</small></div>' + statBars(st) +
        '<div class="gBtns">' + (has ? '<button disabled>✔ Masz już</button>' : '<button data-a="buy" data-v="' + k + '"' + (m < M.price ? ' class="poor"' : '') + '>Kup – ' + M.price + ' zł</button>') + '</div></div>';
    }
  } else {
    const r = ownRec(GAR.sel); const st = carStats(r);
    h += '<div class="gSelBar"><button class="sec" data-a="cyc" data-v="-1">◀</button><div><span class="gSw" style="background:' + hex(r.color) + '"></span><b>' + carName(r) + '</b></div><button class="sec" data-a="cyc" data-v="1">▶</button></div>';
    if (T === 'tune') {
      h += statBars(st);
      for (const k in UPG) {
        const U = UPG[k], l = r.up[k] || 0, mx = l >= U.max, pr = mx ? 0 : U.price[l];
        h += '<div class="gUp"><div class="gUpL"><b>' + U.ic + ' ' + U.n + '</b> ' + pips(l, U.max) + '<small>' + U.d + '</small></div>' +
          (mx ? '<button disabled>MAX</button>' : '<button data-a="up" data-v="' + k + '"' + (m < pr ? ' class="poor"' : '') + '>Ulepsz – ' + pr + ' zł</button>') + '</div>';
      }
    } else {
      h += '<p class="gTxt">Nowy lakier: ' + PAINT_PRICE + ' zł</p><div class="gPal">' + PAINTS.map((c) => '<button class="gPaint' + (c === r.color ? ' on' : '') + '" data-a="paint" data-v="' + c + '" style="background:' + hex(c) + '" aria-label="kolor"></button>').join('') + '</div>';
      if (G.mode === 'car' && activeCar) h += '<div class="gNote">Stan auta, którym jedziesz: <b>' + Math.round(activeCar.hp) + '%</b> ' + (activeCar.hp < 99.5 ? '<button data-a="fix">🔧 Napraw – ' + REPAIR_PRICE + ' zł</button>' : '✔') + '</div>';
    }
  }
  $('gBody').innerHTML = h;
}
function garageOpen(p) {
  if (!p) p = GAR.places[0]; GAR.open = p; GAR.tab = GAR.tab || 'mine'; if (!ownRec(GAR.sel)) GAR.sel = SAVE.garage.sel;
  if (G.mode === 'car' && activeCar) { activeCar.vx = activeCar.vz = 0; }
  if (POL.shop) shopClose();
  G.paused = true; G.inGarage = true; if (document.pointerLockElement) document.exitPointerLock();
  if (typeof touchReset === 'function') touchReset();
  $('garage').classList.remove('hidden'); garageRender(); return true;
}
function garageClose() {
  if (!GAR.open) return; GAR.open.cool = true; GAR.open = null; G.inGarage = false; G.paused = false; clock.getDelta(); $('garage').classList.add('hidden');
}
function garageKey(code) {
  if (code === 'Escape' || code === 'KeyE') return garageClose();
  const tabs = { Digit1: 'mine', Digit2: 'shop', Digit3: 'tune', Digit4: 'paint' };
  if (tabs[code]) { GAR.tab = tabs[code]; garageRender(); }
  else if (code === 'ArrowLeft' || code === 'ArrowRight') { cycleSel(code === 'ArrowLeft' ? -1 : 1); garageRender(); }
}


// ======================= JAZDA: DŹWIĘK SILNIKA, DRIFT, ŚLADY OPON, DYM, ISKRY, NITRO, SKOKI, ZNAJDŹKI =======================
const FXQ = { low: { skid: 200, smoke: 0.4, parts: 40, sparks: 0.5 }, med: { skid: 420, smoke: 0.75, parts: 72, sparks: 0.8 }, high: { skid: 800, smoke: 1, parts: 96, sparks: 1 } };
const DRV = { drift: { on: false, t: 0, score: 0, grace: 0, mult: 1 }, air: 0, skidN: 0, emitAcc: 0, stats: { skids: 0, smoke: 0, sparks: 0, crunch: 0, maxShake: 0 } };
const fxq = () => FXQ[settings.quality] || FXQ.med;

// ---- skid marks: one ring-buffer mesh of quads
const SKID_MAX = 800;
function initSkids() {
  const g = new THREE.BufferGeometry(); const P = new Float32Array(SKID_MAX * 12), C = new Float32Array(SKID_MAX * 16), I = new Uint32Array(SKID_MAX * 6);
  for (let i = 0; i < SKID_MAX; i++) { const v = i * 4; I.set([v, v + 1, v + 2, v + 2, v + 1, v + 3], i * 6); }
  g.setAttribute('position', new THREE.BufferAttribute(P, 3)); g.setAttribute('color', new THREE.BufferAttribute(C, 4)); g.setIndex(new THREE.BufferAttribute(I, 1));
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
  const m = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, side: THREE.DoubleSide, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -12 });
  const mesh = new THREE.Mesh(g, m); mesh.frustumCulled = false; mesh.renderOrder = 1; scene.add(mesh);
  DRV.skid = { g, P, C, mesh, i: 0, dirty: false, last: [null, null] };
}
function skidSeg(x0, z0, x1, z1, a) {
  const S = DRV.skid, cap = fxq().skid; const i = S.i % cap; S.i = (S.i + 1) % cap;
  const dx = x1 - x0, dz = z1 - z0, L = Math.hypot(dx, dz) || 1, w = 0.18, nx = -dz / L * w, nz = dx / L * w;
  const off = inOffZone(x1, z1) ? 0.07 : 0.2; const y0 = groundH(x0, z0) + off, y1 = groundH(x1, z1) + off;
  S.P.set([x0 + nx, y0, z0 + nz, x0 - nx, y0, z0 - nz, x1 + nx, y1, z1 + nz, x1 - nx, y1, z1 - nz], i * 12);
  const c = TOON ? 0.035 : 0.02; for (let k = 0; k < 4; k++) S.C.set([c, c * 0.95, c * 0.9, a], i * 16 + k * 4);
  S.dirty = true; DRV.stats.skids++;
}
// ---- billboard particles (smoke = 1 draw, sparks/flames = 1 additive draw)
function makeParts(N, additive) {
  const base = new THREE.PlaneGeometry(1, 1); const g = new THREE.InstancedBufferGeometry();
  g.index = base.index; g.setAttribute('position', base.attributes.position); g.setAttribute('uv', base.attributes.uv);
  const iP = new THREE.InstancedBufferAttribute(new Float32Array(N * 4), 4), iC = new THREE.InstancedBufferAttribute(new Float32Array(N * 4), 4);
  iP.setUsage(THREE.DynamicDrawUsage); iC.setUsage(THREE.DynamicDrawUsage); g.setAttribute('iPos', iP); g.setAttribute('iCol', iC); g.instanceCount = N;
  const m = new THREE.ShaderMaterial({
    uniforms: { uInk: { value: TOON && !additive ? 1 : 0 }, uInkCol: { value: new THREE.Color(0x2a211c) } },
    vertexShader: 'attribute vec4 iPos; attribute vec4 iCol; varying vec2 vUv; varying vec4 vCol; void main(){ vUv = uv; vCol = iCol; vec4 mv = modelViewMatrix * vec4(iPos.xyz, 1.0); mv.xy += position.xy * iPos.w; gl_Position = projectionMatrix * mv; }',
    fragmentShader: additive
      ? 'varying vec2 vUv; varying vec4 vCol; void main(){ float d = length(vUv - 0.5) * 2.0; if (d > 1.0) discard; float a = (1.0 - d) * (1.0 - d) * vCol.a; gl_FragColor = vec4(mix(vec3(1.0, 0.98, 0.85), vCol.rgb, d) * a, a); \n#include <colorspace_fragment>\n }'
      : 'uniform float uInk; uniform vec3 uInkCol; varying vec2 vUv; varying vec4 vCol; void main(){ float d = length(vUv - 0.5) * 2.0; if (d > 1.0) discard; vec3 c = vCol.rgb * (1.0 - 0.16 * smoothstep(0.1, 0.9, vUv.x * 0.5 + (1.0 - vUv.y) * 0.5)); float a = vCol.a * (1.0 - smoothstep(0.86, 1.0, d)); if (uInk > 0.5) c = mix(c, uInkCol, smoothstep(0.72, 0.8, d) * 0.85); else a *= 1.0 - smoothstep(0.4, 1.0, d) * 0.7; gl_FragColor = vec4(c, a); \n#include <colorspace_fragment>\n }',
    transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
  });
  const mesh = new THREE.Mesh(g, m); mesh.frustumCulled = false; mesh.renderOrder = 2; scene.add(mesh);
  const L = []; for (let i = 0; i < N; i++) L.push({ t: 1, life: 0, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, s0: 1, s1: 1, r: 1, g: 1, b: 1, a: 1, grav: 0, drag: 1 });
  return { N, g, iP, iC, mesh, L, i: 0, alive: 0 };
}
const tmpCol = new THREE.Color();
function emitPart(S, x, y, z, vx, vy, vz, life, s0, s1, col, a, grav, drag) {
  const cap = Math.min(S.N, fxq().parts); let p = null;
  for (let k = 0; k < cap; k++) { const q = S.L[(S.i + k) % cap]; if (q.t >= q.life) { p = q; S.i = (S.i + k + 1) % cap; break; } }
  if (!p) { p = S.L[S.i % cap]; S.i = (S.i + 1) % cap; }
  tmpCol.set(col); p.t = 0; p.life = life; p.x = x; p.y = y; p.z = z; p.vx = vx; p.vy = vy; p.vz = vz; p.s0 = s0; p.s1 = s1; p.r = tmpCol.r; p.g = tmpCol.g; p.b = tmpCol.b; p.a = a; p.grav = grav; p.drag = drag;
}
function stepParts(S, dt) {
  const P = S.iP.array, C = S.iC.array; let alive = 0;
  for (let i = 0; i < S.N; i++) {
    const p = S.L[i];
    if (p.t >= p.life) { if (P[i * 4 + 3] !== 0) { P[i * 4 + 3] = 0; alive++; } continue; }
    p.t += dt; const k = Math.min(1, p.t / p.life), dr = Math.max(0, 1 - p.drag * dt);
    p.vx *= dr; p.vz *= dr; p.vy = p.vy * dr - p.grav * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
    if (p.grav > 0) { const gy = groundH(p.x, p.z) + 0.15; if (p.y < gy) { p.y = gy; p.vy *= -0.35; p.vx *= 0.6; p.vz *= 0.6; } }
    P[i * 4] = p.x; P[i * 4 + 1] = p.y; P[i * 4 + 2] = p.z; P[i * 4 + 3] = p.s0 + (p.s1 - p.s0) * k;
    C[i * 4] = p.r; C[i * 4 + 1] = p.g; C[i * 4 + 2] = p.b; C[i * 4 + 3] = p.a * (k < 0.15 ? k / 0.15 : 1 - (k - 0.15) / 0.85);
    alive++;
  }
  if (alive) { S.iP.needsUpdate = true; S.iC.needsUpdate = true; }
  S.alive = alive; S.mesh.visible = alive > 0;
}
// ---- money pickups (instanced banknote bundles)
const PICK_N = 16;
function initPickups() {
  const rnd = mulberry32(777); const r0 = W.travel[0]; const L = [];
  for (let t = 0; t < 400 && L.length < PICK_N; t++) {
    const a = rnd() * 6.283, R = 120 + rnd() * 1300; const rp = nearestRoadPoint(r0[1] + Math.cos(a) * R, r0[2] + Math.sin(a) * R, true, 150);
    if (!rp || inOffZone(rp.x, rp.z) || insideBuilding(rp.x, rp.z, 1.5) || L.some((q) => Math.hypot(q.x - rp.x, q.z - rp.z) < 160)) continue;
    const off = (rnd() - 0.5) * Math.max(0, rp.road.width - 2.5); const x = rp.x + Math.cos(rp.h) * off, z = rp.z - Math.sin(rp.h) * off;
    L.push({ x, z, y: groundH(x, z), v: 20 + Math.round(rnd() * 6) * 5, on: true, t: 0 });
  }
  const geo = mergeBoxes([[0.9, 0.36, 0.5, 0, 0, 0, '#4fd06a', 0], [0.92, 0.38, 0.12, 0, 0, 0, '#f4f1ea', 0]]);
  const mesh = new THREE.InstancedMesh(geo, mkMat({ vertexColors: true, emissive: 0x1a5a24 }), L.length); mesh.frustumCulled = false; scene.add(mesh);
  DRV.pick = { L, mesh, m: new THREE.Matrix4(), q: new THREE.Quaternion(), e: new THREE.Euler(), s: new THREE.Vector3(1, 1, 1), p: new THREE.Vector3() };
}
function updatePickups(dt) {
  const K = DRV.pick; if (!K) return; const f = focusXZ(); const t = performance.now() * 0.002;
  K.L.forEach((p, i) => {
    if (!p.on) { p.t -= dt; if (p.t <= 0 && Math.hypot(p.x - f.x, p.z - f.z) > 60) p.on = true; }
    const d = Math.hypot(p.x - f.x, p.z - f.z);
    if (p.on && d < (G.mode === 'car' ? 2.8 : 1.6) && !G.cut) { p.on = false; p.t = 240; SAVE.stats.pickups++; addMoney(p.v, 'znaleziona kasa'); sfxCoin(); for (let k = 0; k < 8; k++) emitPart(DRV.sparks, p.x, p.y + 1, p.z, (Math.random() - 0.5) * 5, 3 + Math.random() * 3, (Math.random() - 0.5) * 5, 0.5, 0.35, 0.1, '#7dff7a', 1, 9, 1); }
    K.e.set(0, t + i, Math.sin(t * 1.3 + i) * 0.25); K.q.setFromEuler(K.e); K.p.set(p.x, p.y + 1 + Math.sin(t * 1.7 + i) * 0.2, p.z);
    K.s.setScalar(p.on && d < 400 ? 1.35 : 0); K.m.compose(K.p, K.q, K.s); K.mesh.setMatrixAt(i, K.m);
  });
  K.mesh.instanceMatrix.needsUpdate = true;
}
function drawPickupMinimap(g, sc) {
  const K = DRV.pick; if (!K) return; const f = focusXZ(); g.fillStyle = '#4fd06a';
  for (const p of K.L) if (p.on && Math.hypot(p.x - f.x, p.z - f.z) < 260) { g.beginPath(); g.arc(p.x, p.z, 3.5 / sc, 0, 7); g.fill(); g.stroke(); }
}
function initDriveFx() { initSkids(); DRV.smoke = makeParts(96, false); DRV.sparks = makeParts(64, true); initPickups(); }

// ---- collisions: sparks, crunch, camera shake
function collisionFx(c, impact, px, pz) {
  const f = focusXZ(); if (Math.hypot(c.x - f.x, c.z - f.z) > 90) return;
  const now = performance.now(); if (now - (c.fxHitT || 0) < 120) return; c.fxHitT = now;
  const x = px !== undefined ? px : c.x + Math.sin(c.h) * 1.9 * Math.sign(c.vFl || 1), z = pz !== undefined ? pz : c.z + Math.cos(c.h) * 1.9 * Math.sign(c.vFl || 1);
  const n = Math.round(Math.min(18, 4 + impact * 0.6) * fxq().sparks); const y = (c.y || 0) + 0.7;
  for (let k = 0; k < n; k++) { const a = Math.random() * 6.283, s = 3 + Math.random() * (4 + impact * 0.3); emitPart(DRV.sparks, x, y, z, Math.cos(a) * s, 1.5 + Math.random() * 5, Math.sin(a) * s, 0.4 + Math.random() * 0.3, 0.5, 0.12, Math.random() < 0.5 ? '#ffb02e' : '#ffe14a', 1, 14, 0.8); }
  DRV.stats.sparks += n;
  if (impact > 9) for (let k = 0; k < 3; k++) emitPart(DRV.smoke, x, y + 0.3, z, (Math.random() - 0.5) * 2, 1 + Math.random(), (Math.random() - 0.5) * 2, 0.9, 1.0, 2.4, '#d8d4d0', 0.85, 0, 1.5);
  if (c === activeCar) {
    G.shake = Math.min(1.6, (G.shake || 0) + impact / 18); DRV.stats.maxShake = Math.max(DRV.stats.maxShake, G.shake);
    sfxCrunch(Math.min(1, impact / 22)); if (impact > 12) buzz(Math.min(80, impact * 3));
    if (DRV.drift.on && impact > 6) { DRV.drift.on = false; DRV.drift.score = 0; driftHud('crash'); }
  } else sfxCrunch(Math.min(0.6, impact / 30));
}
// ---- nitro (fuel 0..1, refills slowly)
function nitroTick(c, want, dt) {
  const st = c.st; if (c.nf === undefined) c.nf = 1;
  if (want && c.nf > 0.01) { c.nf = Math.max(0, c.nf - dt / st.ncap); c.nOut = c.nf <= 0.01; return true; }
  c.nf = Math.min(1, c.nf + dt * 0.07); return false;
}
// ---- drift scoring → money
function driftHud(state) {
  const e = $('drift'); if (!e) return; const D = DRV.drift;
  if (state === 'crash') { e.className = 'crash'; e.innerHTML = 'DRIFT PRZERWANY!'; clearTimeout(D.hideT); D.hideT = setTimeout(() => e.classList.add('hidden'), 1100); return; }
  if (state === 'bank') { e.className = 'bank'; e.innerHTML = 'DRIFT ' + Math.round(D.score) + '<small>+' + D.cash + ' zł</small>'; clearTimeout(D.hideT); D.hideT = setTimeout(() => e.classList.add('hidden'), 1400); return; }
  if (state === 'off') { e.classList.add('hidden'); return; }
  clearTimeout(D.hideT); e.className = ''; e.innerHTML = 'DRIFT ' + Math.round(D.score) + '<small>×' + D.mult.toFixed(1) + '</small>';
}
function bankDrift() {
  const D = DRV.drift; D.on = false;
  if (D.score >= 50 && D.t > 0.6) {
    D.cash = Math.round(D.score / 7); SAVE.stats.driftBest = Math.max(SAVE.stats.driftBest, Math.round(D.score)); SAVE.stats.driftCash += D.cash;
    addMoney(D.cash, 'drift ' + Math.round(D.score) + ' pkt'); driftHud('bank'); DRV.drifts = (DRV.drifts || 0) + 1;
  } else driftHud('off');
  D.score = 0; D.t = 0;
}
function updateDriveFx(dt) {
  const S = DRV.skid; const c = G.mode === 'car' ? activeCar : null;
  if (c && !G.cut && !c.scooter) {
    const vF = c.vFl || 0, vR = c.vRl || 0, spd = Math.hypot(vF, vR), slip = Math.atan2(Math.abs(vR), Math.abs(vF) + 0.01);
    // drift
    const D = DRV.drift; const drifting = !c.air && !c.wrecked && spd > 8 && slip > 0.2 && vF > 3;
    if (drifting) {
      if (!D.on) { D.on = true; D.t = 0; D.score = 0; D.grace = 0; }
      D.t += dt; D.grace = 0; D.mult = 1 + Math.min(1, D.t / 4); D.score += spd * Math.min(slip, 1.2) * dt * 10 * D.mult; DRV.driftT = (DRV.driftT || 0) + dt;
      if (D.score > 20) driftHud('on');
    } else if (D.on) { D.grace += dt; if (D.grace > 0.7 || spd < 4) bankDrift(); }
    // stunt jumps (off-road zone)
    if (c.air) DRV.air += dt;
    else if (DRV.air > 0) { if (DRV.air > 0.7 && !c.wrecked) { const cash = Math.round(DRV.air * 40); SAVE.stats.jumps++; SAVE.stats.jumpBest = Math.max(SAVE.stats.jumpBest, +DRV.air.toFixed(2)); addMoney(cash, 'skok ' + DRV.air.toFixed(1) + ' s'); } DRV.air = 0; }
    // tyre marks + smoke
    const hardBrake = c.brkl > 0.5 && vF > 9, sliding = slip > 0.17 && spd > 6, burn = c.thrl > 0 && Math.abs(vF) < 5 && c.handl;
    const skid = !c.air && !c.wrecked && (sliding || hardBrake || (c.handl && spd > 4) || burn);
    const fx = Math.sin(c.h), fz = Math.cos(c.h), rx = Math.cos(c.h), rz = -Math.sin(c.h); const back = (c.offs && c.offs[0]) || -1.3;
    for (let w = 0; w < 2; w++) {
      const s = w ? 1 : -1, wx = c.x + fx * back + rx * 0.86 * s, wz = c.z + fz * back + rz * 0.86 * s;
      if (!skid) { S.last[w] = null; continue; }
      const L = S.last[w]; if (!L) { S.last[w] = [wx, wz]; continue; }
      const d = Math.hypot(wx - L[0], wz - L[1]); if (d > 6) { S.last[w] = [wx, wz]; continue; }
      if (d > 0.45) { skidSeg(L[0], L[1], wx, wz, Math.min(0.75, 0.35 + slip * 0.6)); S.last[w] = [wx, wz]; }
    }
    if (skid && (sliding || burn) && !inOffZone(c.x, c.z)) {
      DRV.emitAcc += dt * (12 + spd * 0.6) * fxq().smoke * Math.min(1.5, slip * 2 + (burn ? 1 : 0));
      while (DRV.emitAcc > 1) { DRV.emitAcc -= 1; const s = Math.random() < 0.5 ? 1 : -1; emitPart(DRV.smoke, c.x + fx * back + rx * 0.9 * s, (c.y || 0) + 0.35, c.z + fz * back + rz * 0.9 * s, c.vx * 0.25 + (Math.random() - 0.5) * 1.5, 0.6 + Math.random() * 0.8, c.vz * 0.25 + (Math.random() - 0.5) * 1.5, 1.1 + Math.random() * 0.6, 0.7, 2.6 + Math.random(), TOON ? '#f1eee8' : '#d9d6d2', TOON ? 0.95 : 0.6, -0.2, 1.4); DRV.stats.smoke++; }
    } else if (skid && inOffZone(c.x, c.z) && Math.random() < dt * 8 * fxq().smoke) emitPart(DRV.smoke, c.x + fx * back, (c.y || 0) + 0.3, c.z + fz * back, (Math.random() - 0.5), 0.5, (Math.random() - 0.5), 0.9, 0.6, 2, '#b08a5a', 0.8, 0, 1.5); // dust
    DRV.slip = skid ? Math.min(1, slip * 1.6 + (hardBrake ? 0.4 : 0)) : 0;
    // nitro flames + HUD
    if (c.nitroOn) for (let k = 0; k < 2; k++) emitPart(DRV.sparks, c.x + fx * (back - 0.9) + rx * 0.4 * (k ? 1 : -1), (c.y || 0) + 0.45, c.z + fz * (back - 0.9) + rz * 0.4 * (k ? 1 : -1), -fx * 6 + c.vx * 0.8, 0.3, -fz * 6 + c.vz * 0.8, 0.18, 0.55, 0.15, k ? '#4fc3ff' : '#ff8a1e', 1, 0, 2);
  } else { S.last[0] = S.last[1] = null; DRV.slip = 0; if (DRV.drift.on) bankDrift(); DRV.air = 0; }
  const nb = $('nitrobar'), hasN = !!(c && c.st && c.st.nitro);
  if (nb) { if (hasN) { nb.classList.remove('hidden'); nb.firstChild.style.width = Math.round(c.nf * 100) + '%'; nb.classList.toggle('on', !!c.nitroOn); } else if (!nb.classList.contains('hidden')) nb.classList.add('hidden'); }
  const tc = $('touch'); if (tc && tc.classList.contains('hasnitro') !== hasN) tc.classList.toggle('hasnitro', hasN);
  if (S.dirty) { S.g.attributes.position.needsUpdate = true; S.g.attributes.color.needsUpdate = true; S.dirty = false; }
  stepParts(DRV.smoke, dt); stepParts(DRV.sparks, dt); updatePickups(dt);
}

// ---- procedural audio: engine (rpm + gears), tyre squeal, crunch, coin
const ENG = { gear: 1, rpm: 0.2, shiftT: 0, on: false };
function sfxVol() { return settings.sfxVol === undefined ? 0.7 : settings.sfxVol; }
function noiseBuf(ac, sec) { const b = ac.createBuffer(1, Math.floor(ac.sampleRate * sec), ac.sampleRate), d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; return b; }
function engineBuild(ac) {
  const out = ac.createGain(); out.gain.value = 0; out.connect(ac.destination);
  const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 600; lp.Q.value = 2.5; lp.connect(out);
  const sh = ac.createWaveShaper(); const cv = new Float32Array(256); for (let i = 0; i < 256; i++) { const x = i / 128 - 1; cv[i] = Math.tanh(x * 2.2); } sh.curve = cv; sh.connect(lp);
  const o1 = ac.createOscillator(); o1.type = 'sawtooth'; const o2 = ac.createOscillator(); o2.type = 'square';
  const g1 = ac.createGain(); g1.gain.value = 0.55; const g2 = ac.createGain(); g2.gain.value = 0.45; o1.connect(g1); o2.connect(g2); g1.connect(sh); g2.connect(sh);
  const lfo = ac.createOscillator(); lfo.frequency.value = 22; const lg = ac.createGain(); lg.gain.value = 6; lfo.connect(lg); lg.connect(o1.frequency); // combustion rumble
  o1.start(); o2.start(); lfo.start();
  const sq = ac.createBufferSource(); sq.buffer = noiseBuf(ac, 1.5); sq.loop = true; const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1900; bp.Q.value = 7; const sg = ac.createGain(); sg.gain.value = 0; sq.connect(bp); bp.connect(sg); sg.connect(ac.destination); sq.start();
  Object.assign(ENG, { ac, out, lp, o1, o2, lfo, sg, bp, built: true });
}
function engineTick(dt) {
  const c = activeCar; const on = G.started && !G.paused && !G.cut && G.mode === 'car' && c && !c.wrecked && sfxVol() > 0;
  if (!ENG.built) { if (!on) return; const ac = audioCtx(); if (!ac) return; engineBuild(ac); }
  const ac = ENG.ac, t = ac.currentTime;
  if (!on) { if (ENG.on) { ENG.out.gain.setTargetAtTime(0, t, 0.08); ENG.sg.gain.setTargetAtTime(0, t, 0.05); ENG.on = false; } return; }
  ENG.on = true; dt = Math.min(dt, 0.05);
  const st = c.st, top = st ? st.maxv : (c.offroad ? 41 : 48), G_ = st ? st.gears : 5, pitch = c.scooter ? 1.9 : st ? st.pitch : c.police ? 0.85 : c.offroad ? 0.8 : 1;
  const v = Math.abs(c.vFl || 0), band = top / G_, thr = Math.max(0, c.thrl || 0);
  if (v > band * ENG.gear * 0.98 && ENG.gear < G_) { ENG.gear++; ENG.shiftT = 0.16; } else if (ENG.gear > 1 && v < band * (ENG.gear - 1) * 0.8) ENG.gear--;
  const lo = ENG.gear === 1 ? 0 : band * (ENG.gear - 1) * 0.8; let r = Math.max(0, Math.min(1.05, (v - lo) / (band * ENG.gear - lo)));
  r = ENG.gear === 1 ? r : 0.3 + r * 0.7;
  if (c.air || (c.handl && thr > 0 && v < 6)) r = Math.max(r, thr * 0.9); // revving in the air / burnout
  const tgt = 0.16 + r * 0.84; ENG.rpm += (tgt - ENG.rpm) * Math.min(1, dt * (ENG.shiftT > 0 ? 14 : 7)); ENG.shiftT = Math.max(0, ENG.shiftT - dt);
  const f = (34 + ENG.rpm * 128) * pitch * (c.nitroOn ? 1.06 : 1), vol = sfxVol();
  ENG.o1.frequency.setTargetAtTime(f, t, 0.03); ENG.o2.frequency.setTargetAtTime(f * 0.5, t, 0.03); ENG.lfo.frequency.setTargetAtTime(f * 0.25, t, 0.05);
  ENG.lp.frequency.setTargetAtTime(260 + ENG.rpm * 1500 + thr * 700 + (c.nitroOn ? 600 : 0), t, 0.05);
  const gain = (0.035 + 0.035 * thr + 0.025 * ENG.rpm) * vol * (ENG.shiftT > 0 ? 0.35 : 1) * (c.hp < 15 ? 0.8 + Math.random() * 0.3 : 1);
  ENG.out.gain.setTargetAtTime(gain, t, 0.04);
  ENG.sg.gain.setTargetAtTime((DRV.slip || 0) * 0.05 * vol, t, 0.06); ENG.bp.frequency.setTargetAtTime(1500 + Math.abs(c.vRl || 0) * 40, t, 0.1);
}
function sfxCrunch(k) {
  const ac = audioCtx(); if (!ac || k <= 0.02) return; const t = ac.currentTime, vol = sfxVol() * k; DRV.stats.crunch++;
  const n = ac.createBufferSource(); n.buffer = DRV.crunchBuf || (DRV.crunchBuf = noiseBuf(ac, 0.4));
  const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 650 + Math.random() * 500; bp.Q.value = 1.2;
  const g = ac.createGain(); g.gain.setValueAtTime(0.5 * vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.35); n.connect(bp); bp.connect(g); g.connect(ac.destination); n.start(t); n.stop(t + 0.4);
  const o = ac.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(95, t); o.frequency.exponentialRampToValueAtTime(38, t + 0.25);
  const og = ac.createGain(); og.gain.setValueAtTime(0.6 * vol, t); og.gain.exponentialRampToValueAtTime(0.001, t + 0.3); o.connect(og); og.connect(ac.destination); o.start(t); o.stop(t + 0.32);
}
function sfxCoin() {
  const ac = audioCtx(); if (!ac) return; const t = ac.currentTime, vol = sfxVol();
  for (const [f, d] of [[988, 0], [1319, 0.08]]) { const o = ac.createOscillator(); o.type = 'square'; o.frequency.value = f; const g = ac.createGain(); g.gain.setValueAtTime(0.06 * vol, t + d); g.gain.exponentialRampToValueAtTime(0.001, t + d + 0.18); o.connect(g); g.connect(ac.destination); o.start(t + d); o.stop(t + d + 0.2); }
}

// ======================= GPS, DZIENNIK, SAMOUCZEK =======================
// Trasa idzie po istniejącym grafie ulic (albo ścieżek off-road). Nie rysujemy skrótów przez budynki ani wodę.
const NAV = {
  on: false, src: '', follow: false, name: '', dx: 0, dz: 0,
  status: '', note: '', instr: '', dist: 0, pts: [], tail: null, tailClear: false,
  cls: '', offT: 0, acc: 0, plans: 0, plannedAt: 0, msig: '', stuckGate: false,
  anchorX: 0, anchorZ: 0, pr: null, sig: '',
};
let TRAIL = { nodes: [], adj: [], edges: [] };
let GPSG = null;
let GATE = null;
function corridorClear(x1, z1, x2, z2) {
  const L = Math.hypot(x2 - x1, z2 - z1); const n = Math.max(1, Math.ceil(L / 8));
  for (let i = 0; i <= n; i++) {
    const t = i / n, x = x1 + (x2 - x1) * t, z = z1 + (z2 - z1) * t;
    if (inWater(x, z) || insideBuilding(x, z, 0)) return false;
  }
  return true;
}
function alongRoad(x1, z1, x2, z2) {
  const L = Math.hypot(x2 - x1, z2 - z1); const n = Math.max(1, Math.ceil(L / 12));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    if (!nearRoad(x1 + (x2 - x1) * t, z1 + (z2 - z1) * t, 5)) return false;
  }
  return true;
}
// Graf ruchu zostawia dziury tam, gdzie odcinki OSM nie mają wspólnego wierzchołka.
// Mostek powstaje tylko, gdy odcinek już leży na narysowanej drodze i nie wchodzi w wodę ani budynek.
function buildGpsGraph() {
  const nodes = TR.nodes; const adj = TR.adj.map((a) => a.slice()); const edges = TR.edges.slice();
  const cell = 90; const grid = new Map();
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i]; const k = Math.floor(n.x / cell) + ',' + Math.floor(n.z / cell);
    let a = grid.get(k); if (!a) { a = []; grid.set(k, a); } a.push(i);
  }
  const cand = [];
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i]; const cx = Math.floor(n.x / cell), cz = Math.floor(n.z / cell);
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
      const arr = grid.get((cx + dx) + ',' + (cz + dz)); if (!arr) continue;
      for (const j of arr) {
        if (j <= i) continue;
        const m = nodes[j]; const d = Math.hypot(n.x - m.x, n.z - m.z);
        if (d < 6 || d > 75) continue;
        let linked = false;
        for (const a of TR.adj[i]) { const e = TR.edges[a.e]; if ((a.dir > 0 ? e.b : e.a) === j && e.len < d + 8) { linked = true; break; } }
        if (!linked) cand.push({ i, j, d });
      }
    }
  }
  cand.sort((a, b) => a.d - b.d);
  let bridges = 0;
  for (const c of cand) {
    if (bridges >= 240) break;
    const n = nodes[c.i], m = nodes[c.j];
    if (!alongRoad(n.x, n.z, m.x, m.z) || !corridorClear(n.x, n.z, m.x, m.z)) continue;
    const e = { id: edges.length, a: c.i, b: c.j, pts: [n.x, n.z, m.x, m.z], len: c.d, bridge: true };
    edges.push(e); adj[c.i].push({ e: e.id, dir: 1 }); adj[c.j].push({ e: e.id, dir: -1 }); bridges++;
  }
  GPSG = { nodes, adj, edges }; NAV.bridges = bridges;
  const comp = new Int32Array(nodes.length); comp.fill(-1); let cid = 0;
  for (let s = 0; s < nodes.length; s++) {
    if (comp[s] >= 0) continue;
    const q = [s]; comp[s] = cid;
    for (let i = 0; i < q.length; i++) {
      for (const a of adj[q[i]]) { const e = edges[a.e]; const nx = a.dir > 0 ? e.b : e.a; if (comp[nx] < 0) { comp[nx] = cid; q.push(nx); } }
    }
    cid++;
  }
  COMP = comp; NAV.comps = cid;
}
let COMP = null;
function closestOnNet(src, x, z, maxR) {
  if (src < 0 || !COMP || !GPSG) return nearestNode(x, z, Math.min(maxR, 400));
  const want = COMP[src]; const nodes = GPSG.nodes; let best = -1, bd = maxR;
  for (let i = 0; i < nodes.length; i++) {
    if (COMP[i] !== want) continue;
    const d = Math.hypot(nodes[i].x - x, nodes[i].z - z);
    if (d < bd) { bd = d; best = i; }
  }
  return best;
}

function fmtM(m) {
  if (!isFinite(m) || m < 0) m = 0;
  if (m >= 950) return (m / 1000).toFixed(1).replace('.', ',') + ' km';
  return Math.round(m) + ' m';
}
function angNorm(a) { return Math.atan2(Math.sin(a), Math.cos(a)); }

function buildTrailGraph() {
  const nodes = [], adj = [], edges = [];
  const nid = new Map();
  const key = (x, z) => Math.round(x * 2) + ',' + Math.round(z * 2);
  const node = (x, z) => {
    const k = key(x, z); let id = nid.get(k);
    if (id === undefined) { id = nodes.length; nid.set(k, id); nodes.push({ x, z }); adj.push([]); }
    return id;
  };
  const trails = (W.off && W.off.trails) || [];
  for (const r of trails) {
    const p = r.pts; if (!p || p.length < 4) continue;
    const a = node(p[0], p[1]), b = node(p[p.length - 2], p[p.length - 1]);
    let len = 0; for (let i = 2; i < p.length; i += 2) len += Math.hypot(p[i] - p[i - 2], p[i + 1] - p[i - 1]);
    if (len < 0.5 || a === b) continue;
    const e = { id: edges.length, a, b, pts: p, len };
    edges.push(e); adj[a].push({ e: e.id, dir: 1 }); adj[b].push({ e: e.id, dir: -1 });
  }
  TRAIL = { nodes, adj, edges };
}
function snapTrail(x, z, maxR) {
  let best = -1, bd = maxR * maxR; const N = TRAIL.nodes;
  for (let i = 0; i < N.length; i++) { const d = (N[i].x - x) ** 2 + (N[i].z - z) ** 2; if (d < bd) { bd = d; best = i; } }
  if (best < 0) return null;
  return { id: best, d: Math.sqrt(bd), x: N[best].x, z: N[best].z };
}
function astarGraph(gph, from, to, maxIter) {
  const N = gph.nodes, adj = gph.adj;
  if (from < 0 || to < 0 || !N[from] || !N[to]) return null;
  if (from === to) return [from];
  maxIter = maxIter || 8000;
  const goal = N[to], gS = new Map([[from, 0]]), prev = new Map(), closed = new Set();
  const hk = [], hv = [];
  const push = (k, v) => { hk.push(k); hv.push(v); let i = hk.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (hk[p] <= hk[i]) break; [hk[p], hk[i]] = [hk[i], hk[p]]; [hv[p], hv[i]] = [hv[i], hv[p]]; i = p; } };
  const pop = () => { const v = hv[0]; const lk = hk.pop(), lv = hv.pop(); if (hk.length) { hk[0] = lk; hv[0] = lv; let i = 0; for (;;) { const l = i * 2 + 1, r = l + 1; let m = i; if (l < hk.length && hk[l] < hk[m]) m = l; if (r < hk.length && hk[r] < hk[m]) m = r; if (m === i) break; [hk[m], hk[i]] = [hk[i], hk[m]]; [hv[m], hv[i]] = [hv[i], hv[m]]; i = m; } } return v; };
  push(0, from); let it = 0;
  while (hk.length && it++ < maxIter) {
    const cur = pop();
    if (cur === to) { const path = [cur]; let c = cur; while (prev.has(c)) { c = prev.get(c); path.push(c); } return path.reverse(); }
    if (closed.has(cur)) continue; closed.add(cur);
    for (const a of adj[cur]) {
      const e = gph.edges[a.e]; const nx = a.dir > 0 ? e.b : e.a; if (closed.has(nx)) continue;
      const g = gS.get(cur) + e.len; if (g < (gS.has(nx) ? gS.get(nx) : 1e18)) { gS.set(nx, g); prev.set(nx, cur); push(g + Math.hypot(N[nx].x - goal.x, N[nx].z - goal.z), nx); }
    }
  }
  return null;
}
function pathPointsGraph(gph, path) {
  const out = [];
  for (let i = 0; i + 1 < path.length; i++) {
    const a = path[i], b = path[i + 1]; let best = null;
    for (const o of gph.adj[a]) { const e = gph.edges[o.e]; if ((o.dir > 0 ? e.b : e.a) === b && (!best || e.len < best.e.len)) best = { e, dir: o.dir }; }
    if (!best) { out.push(gph.nodes[b].x, gph.nodes[b].z); continue; }
    const p = best.e.pts, n = p.length / 2;
    if (best.dir > 0) for (let k = (out.length ? 1 : 0); k < n; k++) out.push(p[k * 2], p[k * 2 + 1]);
    else for (let k = n - (out.length ? 2 : 1); k >= 0; k--) out.push(p[k * 2], p[k * 2 + 1]);
  }
  return out;
}
function simplifyPath(pts, step) {
  if (!pts || pts.length < 4) return pts ? pts.slice() : [];
  const out = [pts[0], pts[1]]; let acc = 0, lx = pts[0], lz = pts[1];
  for (let i = 2; i < pts.length; i += 2) {
    const x = pts[i], z = pts[i + 1]; acc += Math.hypot(x - lx, z - lz); lx = x; lz = z;
    if (acc >= step) { out.push(x, z); acc = 0; }
  }
  if (out[out.length - 2] !== lx || out[out.length - 1] !== lz) out.push(lx, lz);
  return out;
}
function segmentClear(x1, z1, x2, z2) {
  const L = Math.hypot(x2 - x1, z2 - z1); const n = Math.max(1, Math.ceil(L / 8));
  for (let i = 0; i <= n; i++) {
    const t = i / n, x = x1 + (x2 - x1) * t, z = z1 + (z2 - z1) * t;
    if (inWater(x, z) || insideBuilding(x, z, 1.1)) return false;
  }
  return true;
}
function projRoute(px, pz, pts) {
  let best = 1e18, bi = 0, bx = pts[0], bz = pts[1];
  for (let i = 0; i < pts.length - 2; i += 2) {
    closestOnSeg(px, pz, pts[i], pts[i + 1], pts[i + 2], pts[i + 3], tmpC);
    const d = (tmpC.x - px) ** 2 + (tmpC.z - pz) ** 2;
    if (d < best) { best = d; bi = i; bx = tmpC.x; bz = tmpC.z; }
  }
  return { d: Math.sqrt(best), i: bi, x: bx, z: bz };
}
function remainAlong(pts, pr) {
  if (!pts || pts.length < 4 || pr.i + 2 >= pts.length) return 0;
  let d = Math.hypot(pts[pr.i + 2] - pr.x, pts[pr.i + 3] - pr.z);
  for (let i = pr.i + 2; i < pts.length - 2; i += 2) d += Math.hypot(pts[i + 2] - pts[i], pts[i + 3] - pts[i + 1]);
  return d;
}
function nextTurn(pts, pr, hP) {
  if (!pts || pts.length < 4) return 'prosto';
  const i0 = pr.i;
  const h0 = Math.atan2(pts[i0 + 2] - pts[i0], pts[i0 + 3] - pts[i0 + 1]);
  const fx = Math.sin(hP), fz = Math.cos(hP);
  const dot = fx * Math.sin(h0) + fz * Math.cos(h0);
  let acc = Math.hypot(pts[i0 + 2] - pr.x, pts[i0 + 3] - pr.z);
  for (let i = i0 + 2; i < pts.length - 2; i += 2) {
    const h1 = Math.atan2(pts[i + 2] - pts[i], pts[i + 3] - pts[i + 1]);
    const ang = angNorm(h1 - h0);
    if (Math.abs(ang) > 0.55 && acc > 12) {
      const dir = ang < 0 ? 'w prawo' : 'w lewo';
      return (dot < -0.45 && acc < 40 ? 'zawróć, potem ' : 'za ' + fmtM(acc) + ' ') + dir;
    }
    acc += Math.hypot(pts[i + 2] - pts[i], pts[i + 3] - pts[i + 1]);
    if (acc > 220) break;
  }
  if (dot < -0.55) return 'zawróć';
  return 'prosto';
}
function routeClass(x, z) {
  const id = nearestNode(x, z, 220);
  const cd = id >= 0 ? Math.hypot(TR.nodes[id].x - x, TR.nodes[id].z - z) : 1e9;
  if (inOffRect(x, z) && cd > 70) return 'off';
  return 'city';
}
function cacheGate() {
  let best = null, bd = 200 * 200;
  const step = Math.max(1, Math.floor(TRAIL.nodes.length / 80));
  for (let i = 0; i < TRAIL.nodes.length; i += step) {
    const tn = TRAIL.nodes[i];
    const id = nearestNode(tn.x, tn.z, 160); if (id < 0) continue;
    const n = TR.nodes[id]; const d = (n.x - tn.x) ** 2 + (n.z - tn.z) ** 2;
    if (d < bd && d > 4) { bd = d; best = { id, x: n.x, z: n.z }; }
  }
  if (!best) {
    const id = nearestNode(-1798, 2363, 500);
    if (id >= 0) best = { id, x: TR.nodes[id].x, z: TR.nodes[id].z };
  }
  GATE = best;
}
function saneDest(x, z) {
  if (inWater(x, z)) return { x, z, water: true };
  if (insideBuilding(x, z, 0)) { const f = findFree(x, z, 1.2); return { x: f[0], z: f[1], water: inWater(f[0], f[1]) }; }
  return { x, z, water: false };
}
function planRoute(px, pz, dx, dz) {
  const dest = saneDest(dx, dz);
  if (dest.water || inWater(dx, dz)) return { status: 'water', pts: [], tail: null, note: 'Cel leży na wodzie. Trasy nie rysuję – wybierz brzeg.' };
  dx = dest.x; dz = dest.z;
  const pOff = routeClass(px, pz) === 'off';
  const dOff = routeClass(dx, dz) === 'off';
  const pTr = snapTrail(px, pz, pOff ? 140 : 40);
  const dTr = snapTrail(dx, dz, dOff ? 160 : 50);

  if (pOff && dOff) {
    if (pTr && dTr) {
      const path = astarGraph(TRAIL, pTr.id, dTr.id, 6000);
      if (path) {
        let pts = simplifyPath(pathPointsGraph(TRAIL, path), 16);
        if (pts.length >= 2 && segmentClear(px, pz, pts[0], pts[1])) pts = [px, pz].concat(pts);
        return { status: 'trail', pts, tail: null, note: 'Ścieżki off-road (OSM), bez skrótu przez jezioro.' };
      }
    }
    return { status: 'disconnected', pts: [], tail: null, note: 'Te punkty nie łączy żadna ścieżka. Nie prowadzę na skróty przez jezioro.' };
  }
  if (pOff && !dOff) {
    return { status: 'disconnected', pts: [], tail: null, note: 'Jesteś na trasach nad jeziorem. Ulicami stąd nie dojedziesz – wróć przyciskiem przy starcie trasy (pod pomnik).' };
  }

  const pCity = nearestNode(px, pz, 280);
  const dCity = closestOnNet(pCity, dx, dz, 1400);
  const pCd = pCity >= 0 ? Math.hypot(TR.nodes[pCity].x - px, TR.nodes[pCity].z - pz) : 1e9;
  const dCd = dCity >= 0 ? Math.hypot(TR.nodes[dCity].x - dx, TR.nodes[dCity].z - dz) : 1e9;

  if (!pOff && dOff) {
    if (pCity >= 0 && GATE && pCd < 120) {
      const path = astarGraph(GPSG || { nodes: TR.nodes, adj: TR.adj, edges: TR.edges }, pCity, GATE.id, 12000);
      if (path) {
        let pts = simplifyPath(pathPointsGraph(GPSG || { nodes: TR.nodes, adj: TR.adj, edges: TR.edges }, path), 18);
        if (pts.length >= 2 && segmentClear(px, pz, pts[0], pts[1])) pts = [px, pz].concat(pts);
        return { status: 'road-stop', pts, tail: null, note: 'Ulica urywa się przed off-roadem. Dalej tylko ścieżki albo teleport przy pomniku Głowackiego.' };
      }
    }
    return { status: 'disconnected', pts: [], tail: null, note: 'Cel jest na trasach nad jeziorem. Z tej ulicy nie ma przejazdu – pomnik Głowackiego (teleport) albo plaża.' };
  }

  if (pCity >= 0 && dCity >= 0 && pCd < 300 && dCd < 1400) {
    const gph = GPSG || { nodes: TR.nodes, adj: TR.adj, edges: TR.edges };
    const path = astarGraph(gph, pCity, dCity, 12000);
    if (!path) return { status: 'disconnected', pts: [], tail: null, note: 'Brak połączenia w grafie ulic. Nie rysuję skrótu przez zabudowę ani wodę.' };
    let pts = simplifyPath(pathPointsGraph(gph, path), 18);
    const end = TR.nodes[dCity];
    if (pts.length < 2) pts = [end.x, end.z, end.x, end.z];
    if (segmentClear(px, pz, pts[0], pts[1]) && Math.hypot(px - pts[0], pz - pts[1]) > 6) pts = [px, pz].concat(pts);
    const leg = Math.hypot(dx - end.x, dz - end.z);
    if (leg > 26) {
      if (segmentClear(end.x, end.z, dx, dz)) return { status: 'walk', pts, tail: [end.x, end.z, dx, dz], note: 'Koniec ulicy, dalej ' + fmtM(leg) + ' pieszo otwartym terenem.' };
      return { status: 'road-stop', pts, tail: null, note: 'Ulica kończy się ' + fmtM(leg) + ' przed celem (zabudowa albo woda). Dalej bez linii.' };
    }
    return { status: 'road', pts, tail: null, note: '' };
  }
  return { status: 'disconnected', pts: [], tail: null, note: 'Za daleko od sieci ulic. Została odległość w linii prostej, bez narysowanej trasy.' };
}
function refreshInstr(px, pz) {
  const straight = Math.hypot(NAV.dx - px, NAV.dz - pz);
  NAV.straight = straight;
  if (!NAV.on) { NAV.instr = ''; return; }
  if (NAV.status === 'water') { NAV.dist = straight; NAV.instr = 'Cel na wodzie · ' + fmtM(straight) + ' · bez trasy'; return; }
  if (NAV.status === 'disconnected' || !NAV.pts || NAV.pts.length < 4) {
    NAV.dist = straight; NAV.instr = fmtM(straight) + ' w linii prostej · ' + (NAV.note || 'brak trasy ulicami'); return;
  }
  const pr = projRoute(px, pz, NAV.pts); NAV.pr = pr;
  const along = remainAlong(NAV.pts, pr);
  const tailL = NAV.tail ? Math.hypot(NAV.tail[2] - NAV.tail[0], NAV.tail[3] - NAV.tail[1]) : 0;
  NAV.dist = along + tailL;
  const hP = G.mode === 'car' && activeCar ? activeCar.h : player.h;
  let dir = nextTurn(NAV.pts, pr, hP);
  if (NAV.status === 'walk' && along < 22) dir = 'dalej pieszo ' + fmtM(Math.max(0, tailL - Math.max(0, 22 - along)));
  if (NAV.status === 'road' || NAV.status === 'trail') NAV.instr = dir + ' · zostało ' + fmtM(NAV.dist);
  else if (NAV.status === 'walk') NAV.instr = dir + ' · ' + fmtM(NAV.dist) + ' · dalej pieszo, bez skrótu przez budynki';
  else NAV.instr = dir + ' · ' + fmtM(NAV.dist) + ' · ' + NAV.note;
  if (pr.d > 42) NAV.instr = 'do ulicy ' + fmtM(pr.d) + ' · ' + NAV.instr;
  if (straight < 14 && along < 18) NAV.instr = 'Jesteś przy celu';
}
function buildPlan(px, pz) {
  NAV.plannedAt = performance.now(); NAV.plans++; NAV.anchorX = px; NAV.anchorZ = pz; NAV.cls = routeClass(px, pz); NAV.dirty = false;
  try {
    const plan = planRoute(px, pz, NAV.dx, NAV.dz);
    NAV.status = plan.status; NAV.note = plan.note || ''; NAV.pts = plan.pts || []; NAV.tail = plan.tail;
    NAV.tailClear = !!(plan.tail && segmentClear(plan.tail[0], plan.tail[1], plan.tail[2], plan.tail[3]));
    if (plan.tail && !NAV.tailClear) { NAV.tail = null; NAV.status = 'road-stop'; if (!NAV.note) NAV.note = 'Ostatni odcinek przecina zabudowę albo wodę – linii nie rysuję.'; }
    const end = NAV.pts.length >= 2 ? Math.round(NAV.pts[NAV.pts.length - 2]) + ',' + Math.round(NAV.pts[NAV.pts.length - 1]) : '';
    const start = NAV.pts.length >= 2 ? Math.round(NAV.pts[0]) + ',' + Math.round(NAV.pts[1]) : '';
    NAV.sig = NAV.status + '|' + start + '>' + end + '|' + NAV.pts.length;
    if (NAV.status !== 'road-stop') NAV.stuckGate = false;
  } catch (e) {
    console.error(e); NAV.status = 'disconnected'; NAV.note = 'Nie udało się policzyć trasy.'; NAV.pts = []; NAV.tail = null;
  }
  refreshInstr(px, pz); placeMarkers();
}
function maintainRoute() {
  if (!NAV.on || !player) return;
  const f = focusXZ(); const cls = routeClass(f.x, f.z);
  if (NAV.dirty || cls !== NAV.cls) {
    NAV.dirty = false; NAV.stuckGate = false; NAV.holdUntil = 0; buildPlan(f.x, f.z); return;
  }
  if (!NAV.pts || NAV.pts.length < 4) {
    if (Math.hypot(f.x - NAV.anchorX, f.z - NAV.anchorZ) > 45 && performance.now() - NAV.plannedAt > 900) buildPlan(f.x, f.z);
    else refreshInstr(f.x, f.z);
    return;
  }
  const pr = projRoute(f.x, f.z, NAV.pts); NAV.pr = pr;
  const lim = G.mode === 'car' ? 36 : 22;
  const now = performance.now();
  const nearStart = Math.hypot(pr.x - NAV.pts[0], pr.z - NAV.pts[1]) < 18 && pr.d < 160;
  if (pr.d > lim && !nearStart) { if (!NAV.offSince) NAV.offSince = now; } else NAV.offSince = 0;
  const endx = NAV.pts[NAV.pts.length - 2], endz = NAV.pts[NAV.pts.length - 1];
  const nearEnd = Math.hypot(f.x - endx, f.z - endz) < 32;
  const farDest = Math.hypot(f.x - NAV.dx, f.z - NAV.dz) > 80;
  const gate = nearEnd && farDest && NAV.status === 'road-stop' && !NAV.stuckGate;
  if (gate) NAV.stuckGate = true;
  const offLong = NAV.offSince && now - NAV.offSince > 650;
  if ((offLong || gate) && now - NAV.plannedAt > 700) {
    const nearAnchor = Math.hypot(f.x - NAV.anchorX, f.z - NAV.anchorZ) < 55;
    if (NAV.holdUntil && performance.now() < NAV.holdUntil && nearAnchor) { refreshInstr(f.x, f.z); placeMarkers(); return; }
    const prev = NAV.sig; NAV.offT = 0; buildPlan(f.x, f.z);
    if (NAV.sig === prev) NAV.holdUntil = performance.now() + 2200;
    return;
  }
  refreshInstr(f.x, f.z); placeMarkers();
}
function navSet(x, z, name, opt) {
  opt = opt || {}; if (!player) return;
  const dest = saneDest(x, z);
  NAV.on = true; NAV.dx = dest.water ? x : dest.x; NAV.dz = dest.water ? z : dest.z;
  NAV.name = name || 'Cel'; NAV.src = opt.src || 'place'; NAV.follow = NAV.src === 'mission';
  NAV.dirty = true; NAV.offT = 0; NAV.offSince = 0; NAV.stuckGate = false; NAV.holdUntil = 0;
  const f = focusXZ(); buildPlan(f.x, f.z);
}
function navClear() {
  NAV.on = false; NAV.src = ''; NAV.follow = false; NAV.pts = []; NAV.tail = null; NAV.instr = ''; NAV.note = ''; NAV.status = '';
  hideMarkers();
  const b = $('gpsX'); if (b) b.classList.add('hidden');
}
function navOnMission(m) {
  if (!m) return;
  const T = m.target;
  const tx = T && T !== activeCar ? Math.round(T.x / 10) * 10 : null;
  const tz = T && T !== activeCar ? Math.round(T.z / 10) * 10 : null;
  const sig = m.id + '|' + (m.stage || 0) + '|' + (m.i || 0) + '|' + (m.leg || 0) + '|' + (m.left || '') + '|' + tx + ',' + tz;
  if (sig === NAV.msig) {
    if (NAV.follow && T && T !== activeCar && Math.hypot(NAV.dx - T.x, NAV.dz - T.z) > 28) navSet(T.x, T.z, m.name, { src: 'mission' });
    return;
  }
  NAV.msig = sig;
  if (T && T !== activeCar) navSet(T.x, T.z, m.name, { src: 'mission' });
  else if (NAV.src === 'mission') navClear();
}
function updateNav() {
  if (!G.started || G.paused) return;
  const now = performance.now();
  if (NAV.on && (NAV.dirty || now - (NAV.tickAt || 0) > 350)) { NAV.tickAt = now; maintainRoute(); }
  paintHud();
}

// ---- world markers (kilka strzałek, nie co klatkę nowa geometria)
function hideMarkers() {
  if (!NAV.arrows) return;
  for (const a of NAV.arrows) a.visible = false;
  if (NAV.pin) NAV.pin.visible = false;
}
function placeMarkers() {
  if (!NAV.arrows) return;
  const pts = NAV.pts; const show = NAV.on && pts && pts.length >= 4 && NAV.status !== 'water' && NAV.status !== 'disconnected';
  const nUse = settings.quality === 'low' ? 3 : NAV.arrows.length;
  if (!show || !NAV.pr) { for (const a of NAV.arrows) a.visible = false; }
  else {
    let acc = 0; let i = NAV.pr.i; let lx = NAV.pr.x, lz = NAV.pr.z; let ai = 0;
    const want = 18;
    while (ai < nUse && i < pts.length - 2) {
      const x2 = pts[i + 2], z2 = pts[i + 3]; const seg = Math.hypot(x2 - lx, z2 - lz) || 0.001;
      if (acc + seg >= want) {
        const t = (want - acc) / seg; const x = lx + (x2 - lx) * t, z = lz + (z2 - lz) * t;
        const a = NAV.arrows[ai]; a.visible = true; a.position.set(x, groundH(x, z) + 0.55, z);
        a.rotation.y = Math.atan2(x2 - lx, z2 - lz); ai++; acc = 0; lx = x; lz = z; continue;
      }
      acc += seg; lx = x2; lz = z2; i += 2;
    }
    for (; ai < NAV.arrows.length; ai++) NAV.arrows[ai].visible = false;
  }
  if (NAV.pin) {
    const missionPin = NAV.src === 'mission' && MIS.active && MIS.active.target && MIS.tgt && MIS.tgt.g.visible;
    const ok = NAV.on && NAV.status !== 'water' && !missionPin;
    NAV.pin.visible = ok;
    if (ok) NAV.pin.position.set(NAV.dx, groundH(NAV.dx, NAV.dz), NAV.dz);
  }
  if (NAV.zone && NAV.zone.visible) { const p = NAV.zone.position; p.y = groundH(p.x, p.z) + 0.4; }
}
function navZone(x, z, r, on) {
  if (!NAV.zone) return;
  NAV.zone.visible = !!on; if (!on) return;
  NAV.zone.position.set(x, groundH(x, z) + 0.4, z);
  const s = (r || 100) / 100; NAV.zone.scale.set(s, s, s);
}
const OBJ = { open: true, pref: null, introAt: 0, introDone: false };
function objShort() { return !!(window.matchMedia && matchMedia('(max-height: 520px)').matches); }
function objDirShort() {
  if (!NAV.on || !NAV.instr) return '';
  if (NAV.instr === 'Jesteś przy celu') return 'u celu';
  const parts = NAV.instr.split(' · ').map((s) => s.trim()).filter(Boolean);
  const dir = parts.find((p) => /^(za |w lewo|w prawo|zawróć|prosto|dalej |do ulicy)/i.test(p)) || parts[0] || '';
  return dir.length > 24 ? dir.slice(0, 23) + '…' : dir;
}
function objWantOpen() {
  if (OBJ.pref !== null) return !!OBJ.pref;
  if (!objShort()) return true;
  if (OBJ.introDone) return false;
  if (!OBJ.introAt) OBJ.introAt = performance.now();
  if (performance.now() - OBJ.introAt > 4200) { OBJ.introDone = true; return false; }
  return true;
}
function objApply(el) {
  const open = objWantOpen(); OBJ.open = open;
  el.classList.toggle('collapsed', !open);
  const tab = $('objTab'); if (tab) tab.setAttribute('aria-expanded', open ? 'true' : 'false');
}
function objToggle() {
  const el = $('mhud'); if (!el || el.classList.contains('hidden')) return;
  OBJ.pref = !OBJ.open; OBJ.open = OBJ.pref; OBJ.introDone = true;
  el.classList.toggle('collapsed', !OBJ.open);
  const tab = $('objTab'); if (tab) tab.setAttribute('aria-expanded', OBJ.open ? 'true' : 'false');
}
function bindObjPanel() {
  const tab = $('objTab'); if (!tab) return;
  tab.addEventListener('pointerdown', (e) => { e.stopPropagation(); e.preventDefault(); });
  tab.addEventListener('pointerup', (e) => e.stopPropagation());
  tab.addEventListener('click', (e) => { e.stopPropagation(); e.preventDefault(); objToggle(); });
  const card = $('objCard');
  if (card) {
    card.addEventListener('pointerdown', (e) => e.stopPropagation());
    card.addEventListener('wheel', (e) => e.stopPropagation(), { passive: true });
  }
}
function paintHud() {
  const el = $('mhud'); if (!el) return;
  const m = typeof MIS !== 'undefined' ? MIS.active : null;
  const show = !!(m || NAV.on);
  el.classList.toggle('hidden', !show); if (!show) return;
  objApply(el);
  const title = $('objTitle'), text = $('objText'), time = $('objTime'), gps = $('objGps'), btn = $('gpsX');
  if (title) title.textContent = m ? m.name : 'GPS';
  if (text) text.textContent = m && m.obj ? m.obj : (NAV.name || '');
  const cargo = $('objCargo');
  if (cargo) {
    const on = !!(m && typeof m.cargo === 'number');
    cargo.classList.toggle('hidden', !on);
    if (on) { const b = cargo.firstChild; if (b) { const p = Math.max(0, Math.min(100, m.cargo)); b.style.width = p + '%'; b.style.background = p > 60 ? '#e2a122' : p > 30 ? '#e07a2f' : '#c0392b'; } }
  }
  let t = '';
  if (m && typeof m.t === 'number' && m.t >= 0) t = '⏱ ' + fmtT(Math.max(0, m.t)).slice(0, 5);
  if (time) { time.textContent = t; time.classList.toggle('warn', !!(m && m.t < 20 && m.t >= 0 && t)); }
  const tabTime = $('objTabTime'); if (tabTime) { tabTime.textContent = t; tabTime.classList.toggle('warn', !!(time && time.classList.contains('warn'))); }
  const tabDir = $('objTabDir'); if (tabDir) tabDir.textContent = objDirShort();
  if (gps) gps.textContent = NAV.on && NAV.instr ? NAV.instr : '';
  if (btn) btn.classList.toggle('hidden', !(NAV.on && NAV.src !== 'mission'));
}
function drawNavOverlay(g, sc) {
  if (!NAV.on) return;
  const pts = NAV.pts;
  if (pts && pts.length >= 4 && NAV.status !== 'disconnected' && NAV.status !== 'water') {
    g.lineJoin = 'round'; g.lineCap = 'round'; g.setLineDash([]);
    g.strokeStyle = '#ffffff'; g.lineWidth = 6 / sc; g.beginPath(); g.moveTo(pts[0], pts[1]);
    for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]); g.stroke();
    g.strokeStyle = '#2f6bff'; g.lineWidth = 3.2 / sc; g.stroke();
  }
  if (NAV.tail && NAV.tailClear) {
    g.setLineDash([5 / sc, 4 / sc]); g.strokeStyle = '#2f6bff'; g.lineWidth = 2.4 / sc;
    g.beginPath(); g.moveTo(NAV.tail[0], NAV.tail[1]); g.lineTo(NAV.tail[2], NAV.tail[3]); g.stroke(); g.setLineDash([]);
  }
  if (NAV.status !== 'water') {
    g.fillStyle = '#2f6bff'; g.strokeStyle = '#fff'; g.lineWidth = 1.5 / sc;
    g.beginPath(); g.arc(NAV.dx, NAV.dz, 6.5 / sc, 0, 7); g.fill(); g.stroke();
  }
  g.setLineDash([]);
}
function navAudit() {
  const f = focusXZ(); const out = [];
  const list = (W.travel || []).slice(0, 14);
  list.push(['środek jeziora', -1981, 3292]);
  for (const t of list) {
    const plan = planRoute(f.x, f.z, t[1], t[2]);
    let bad = false;
    if (plan.tail) bad = !segmentClear(plan.tail[0], plan.tail[1], plan.tail[2], plan.tail[3]);
    out.push({ name: t[0], status: plan.status, n: (plan.pts || []).length / 2, tail: !!plan.tail, bad, note: plan.note || '' });
  }
  return { gate: GATE, trails: TRAIL.nodes.length, from: { x: f.x, z: f.z }, rows: out };
}

function initNav() {
  buildTrailGraph(); buildGpsGraph(); cacheGate();
  const sh = new THREE.Shape(); sh.moveTo(0, 1.15); sh.lineTo(0.62, -0.75); sh.lineTo(-0.62, -0.75); sh.closePath();
  const geo = new THREE.ShapeGeometry(sh);
  geo.rotateX(Math.PI / 2);
  const mat = new THREE.MeshBasicMaterial({ color: 0x2f6bff, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
  NAV.arrows = [];
  for (let i = 0; i < 5; i++) { const a = new THREE.Mesh(geo, mat); a.visible = false; a.renderOrder = 3; scene.add(a); NAV.arrows.push(a); }
  const pin = new THREE.Group();
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 18, 10, 1, true), new THREE.MeshBasicMaterial({ color: 0x2f6bff, transparent: true, opacity: 0.28, depthWrite: false, side: THREE.DoubleSide }));
  beam.position.y = 9; pin.add(beam);
  const ring = new THREE.Mesh(new THREE.RingGeometry(1.6, 2.3, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x2f6bff, transparent: true, opacity: 0.9, depthWrite: false }));
  ring.position.y = 0.35; pin.add(ring); pin.visible = false; scene.add(pin); NAV.pin = pin;
  const zg = new THREE.TorusGeometry(100, 0.5, 6, 48); zg.rotateX(Math.PI / 2);
  NAV.zone = new THREE.Mesh(zg, new THREE.MeshBasicMaterial({ color: 0xffd21f, transparent: true, opacity: 0.85 }));
  NAV.zone.visible = false; scene.add(NAV.zone);
  const x = $('gpsX'); if (x) { x.onclick = (e) => { e.stopPropagation(); navClear(); toast('GPS wyłączony', 1200); }; x.addEventListener('pointerdown', (e) => e.stopPropagation()); }
  bindObjPanel();
  bindJournal(); bindTutor(); bindMapGps();
  for (const id of ['journal', 'tutor']) { const n = $(id); if (!n) continue; n.addEventListener('pointerdown', (e) => e.stopPropagation()); n.addEventListener('mousedown', (e) => e.stopPropagation()); }
}

// ---- dziennik
let JRN = { tab: 'active' };
function misBucket(m) {
  if (m.needs && storyDoneCount() < m.needs) return 'locked';
  if (MIS.active && MIS.active.id === m.id) return 'active';
  if (m.done) return 'done';
  return 'open';
}
function bestLabel(m) {
  if (!m.bestKey || SAVE.best[m.bestKey] == null) return '';
  return m.bestLow ? ('rekord ' + fmtT(SAVE.best[m.bestKey])) : ('rekord ' + Math.round(SAVE.best[m.bestKey]) + ' pkt');
}
function openJournal() {
  if (!G.started || G.tutor || G.dialogOpen || G.inGarage || G.inRange || (typeof POL !== 'undefined' && POL.shop)) return;
  if (G.mapOpen) closeMap();
  G.journalOpen = true; G.paused = true; if (document.pointerLockElement) document.exitPointerLock();
  $('journal').classList.remove('hidden'); renderJournal();
}
function closeJournal() {
  if (!G.journalOpen) return; G.journalOpen = false; $('journal').classList.add('hidden');
  if (G.started && $('menu').classList.contains('hidden') && !G.mapOpen && !G.tutor && !G.dialogOpen && !G.inGarage && !(POL && POL.shop)) { G.paused = false; clock.getDelta(); }
}
function renderJournal() {
  const tabs = $('jTabs'); const body = $('jBody'); if (!tabs || !body) return;
  tabs.innerHTML = '';
  for (const [id, label] of [['active', 'Aktywna'], ['open', 'Dostępne'], ['done', 'Ukończone']]) {
    const b = document.createElement('button'); b.type = 'button'; b.textContent = label; b.className = JRN.tab === id ? 'on' : '';
    b.onclick = () => { JRN.tab = id; renderJournal(); }; tabs.appendChild(b);
  }
  body.innerHTML = '';
  const rows = MIS.list.filter((m) => (JRN.tab === 'active' ? misBucket(m) === 'active' : JRN.tab === 'done' ? (m.done && misBucket(m) !== 'active') : misBucket(m) === 'open' || misBucket(m) === 'locked'));
  if (JRN.tab === 'active' && MIS.active) {
    const info = document.createElement('div'); info.className = 'jNow';
    info.textContent = (MIS.active.obj || 'Jedź według dziennika') + (typeof MIS.active.t === 'number' ? ' · ⏱ ' + fmtT(Math.max(0, MIS.active.t)).slice(0, 5) : '');
    body.appendChild(info);
  }
  if (!rows.length) {
    const e = document.createElement('div'); e.className = 'jEmpty';
    e.textContent = JRN.tab === 'active' ? 'Brak aktywnej misji. Wejdź w Dostępne albo szukaj świecącego „!”.' : (JRN.tab === 'done' ? 'Jeszcze nic nie ukończone.' : 'Wszystko już zaliczone – powtórki są w zakładce Ukończone.');
    body.appendChild(e); return;
  }
  for (const m of rows) body.appendChild(journalCard(m));
}
function journalCard(m) {
  const card = document.createElement('div'); card.className = 'jCard';
  const h = document.createElement('b'); h.textContent = m.name; card.appendChild(h);
  const who = document.createElement('div'); who.className = 'jWho'; who.textContent = m.who + (m.where ? ' · ' + m.where : ''); card.appendChild(who);
  const rec = document.createElement('div'); rec.className = 'jPay';
  const paid = m.side && SAVE.claimed[m.id];
  rec.textContent = m.range ? ('Wypłata za przebieg, zwykle 150–250 zł' + (bestLabel(m) ? ' · ' + bestLabel(m) : '')) : ('Nagroda: ' + m.reward + ' zł' + (m.side ? (paid ? ' · już odebrana (zostaje premia za rekord)' : ' · pierwszy raz') : ' · można powtarzać') + (bestLabel(m) ? ' · ' + bestLabel(m) : ''));
  card.appendChild(rec);
  if (m.steps && m.steps.length) { const ol = document.createElement('ol'); for (const s of m.steps) { const li = document.createElement('li'); li.textContent = s; ol.appendChild(li); } card.appendChild(ol); }
  else { const p = document.createElement('p'); p.textContent = m.text; card.appendChild(p); }
  if (misBucket(m) === 'locked') { const l = document.createElement('div'); l.className = 'jLock'; l.textContent = 'Zablokowane: ukończ ' + m.needs + ' misji fabularnych (masz ' + storyDoneCount() + ').'; card.appendChild(l); return card; }
  const btns = document.createElement('div'); btns.className = 'jBtns';
  const gps = document.createElement('button'); gps.type = 'button'; gps.textContent = 'GPS';
  gps.onclick = () => {
    if (MIS.active && MIS.active.id === m.id && m.target && m.target !== activeCar) navSet(m.target.x, m.target.z, m.name, { src: 'mission' });
    else navSet(m.gx, m.gz, m.who, { src: 'place' });
    closeJournal(); toast('GPS: ' + m.name, 1400);
  };
  btns.appendChild(gps);
  if (MIS.active && MIS.active.id === m.id) {
    const c = document.createElement('button'); c.type = 'button'; c.className = 'sec'; c.textContent = 'Anuluj';
    c.onclick = () => { missionCancel(); renderJournal(); };
    const r = document.createElement('button'); r.type = 'button'; r.textContent = 'Od nowa';
    r.onclick = () => { missionCancel(); missionStart(m); closeJournal(); };
    btns.appendChild(r); btns.appendChild(c);
  } else if (!MIS.active && !m.range) {
    const go = document.createElement('button'); go.type = 'button'; go.textContent = m.done ? 'Jedź ponownie' : 'Przyjmij';
    go.onclick = () => { closeJournal(); missionStart(m); };
    btns.appendChild(go);
  }
  card.appendChild(btns); return card;
}
function bindJournal() {
  const c = $('jClose'); if (c) c.onclick = () => closeJournal();
  const b = $('btnJournal'); if (b) b.onclick = () => { G.journalOpen ? closeJournal() : openJournal(); };
}

// ---- samouczek
const TUTOR = [
  { h: 'Ruszaj', p: 'Komputer: WASD albo strzałki, mysz rozgląda się po kliknięciu w ekran. Telefon: lewy joystick to ruch, przeciąganie prawej strony obraca kamerę. Shift / BIEG to bieg, w aucie nitro (gdy je masz).' },
  { h: 'Auto, mapa, GPS', p: 'E, F albo Wsiądź – wsiądź i wysiądź. Pieszo: WASD i Shift (bieg), na telefonie joystick i BIEG. M albo minimapa otwiera dużą mapę: przeciągnij, uszczypnij albo kółko, żeby przybliżyć. Dotknięcie punktu ustawia GPS. Lista po prawej nadal teleportuje. G albo „Anuluj GPS” kasuje cel.' },
  { h: 'Misje i dziennik', p: 'Świecące „!” to zleceniodawcy. Dziennik (J albo 📒) ma zakładki Aktywna, Dostępne i Ukończone: kroki, nagroda, rekord. Można przyjąć, przerwać i jechać od nowa. Zegar misji stoi, gdy dziennik albo mapa jest otwarta.' },
  { h: 'Policja, garaż, radio', p: 'Gwiazdki za potrącenie, taran radiowozu, kradzież i pędzenie obok policji. Zgub pościg albo wpadnij do lakierni. Niebieskie G to garaż i tuning. Q / R zmienia stację (Antyradio, Jazz Kultura, Opera, Radio Leliwa). T wycisza. Gdy stacja milczy, radio samo bierze następną. Ten samouczek włączysz ponownie z menu.' },
];
let TUT = { i: 0 };
function openTutor() {
  G.tutor = true; TUT.i = 0; $('tutor').classList.remove('hidden'); tutorShow();
  if (G.started) G.paused = true;
  if (document.pointerLockElement) document.exitPointerLock();
}
function closeTutor() {
  if (!G.tutor) return; G.tutor = false; $('tutor').classList.add('hidden');
  SAVE.tut = 1; saveGame();
  if (G.started && $('menu').classList.contains('hidden') && !G.mapOpen && !G.journalOpen && !G.dialogOpen && !G.inGarage && !(POL && POL.shop)) { G.paused = false; clock.getDelta(); }
}
function tutorShow() {
  const t = TUTOR[TUT.i]; $('tutH').textContent = t.h; $('tutP').textContent = t.p;
  $('tutN').textContent = (TUT.i + 1) + ' / ' + TUTOR.length;
  $('tutNext').textContent = TUT.i === TUTOR.length - 1 ? 'Gram' : 'Dalej';
}
function tutorKey(code) {
  if (code === 'Escape') closeTutor();
  else if (code === 'Enter' || code === 'Space' || code === 'ArrowRight') { if (TUT.i >= TUTOR.length - 1) closeTutor(); else { TUT.i++; tutorShow(); } }
  else if (code === 'ArrowLeft') { TUT.i = Math.max(0, TUT.i - 1); tutorShow(); }
}
function bindTutor() {
  $('tutNext').onclick = () => { if (TUT.i >= TUTOR.length - 1) closeTutor(); else { TUT.i++; tutorShow(); } };
  $('tutSkip').onclick = () => closeTutor();
  const b = $('btnTutor'); if (b) b.onclick = () => openTutor();
}
function bindMapGps() {
  const mode = $('mapGpsMode'); const clr = $('mapGpsClear');
  if (mode) mode.onclick = () => { BM.gpsClick = !BM.gpsClick; mode.textContent = BM.gpsClick ? 'Klik: GPS' : 'Klik: teleport'; mode.classList.toggle('on', !!BM.gpsClick); };
  if (mode && BM.gpsClick) { mode.textContent = 'Klik: GPS'; mode.classList.add('on'); }
  if (clr) clr.onclick = () => { navClear(); toast('GPS wyłączony', 1200); if (BM.c) drawBigMap(); };
}

// ======================= STRZELNICA ZWIERZYNIEC =======================
// Osobna minigra przy Lesie Zwierzyniec (ul. Borów). W mieście nie ma broni.
const RANGE = {
  x: 2375, z: -1694, h: Math.PI,
  on: false, phase: 'idle', t: 0, score: 0, hits: 0, shots: 0, combo: 0, bestCombo: 0,
  mag: 5, reserve: 10, reload: 0, spawnT: 0, ax: 0, ay: 0, cool: 0, kick: 0, flash: 0, pop: 0, wave: null,
};
const RANGE_KINDS = {
  pumpkin: { pts: 12, r: 0.48, col: 0xe07a1f, rib: 0xc45e12 },
  melon: { pts: 22, r: 0.36, col: 0xc6e07a, rib: 0x6a9a32 },
  water: { pts: 36, r: 0.44, col: 0x2f9a48, rib: 0x145c28 },
  gold: { pts: 55, r: 0.36, col: 0xf6c431, rib: 0xfff1a8 },
};
const RANGE_WAVES = [
  { id: 1, t0: 0, t1: 15, name: 'Rozgrzewka', kinds: ['pumpkin'], modes: ['rail'], speed: 0.9 },
  { id: 2, t0: 17, t1: 34, name: 'Tory i wahadła', kinds: ['pumpkin', 'melon', 'melon'], modes: ['rail', 'swing'], speed: 1.35 },
  { id: 3, t0: 36, t1: 50, name: 'Wyskakujące', kinds: ['melon', 'water', 'water'], modes: ['pop', 'swing'], speed: 1.8 },
  { id: 4, t0: 50, t1: 60, name: 'Złote owoce', kinds: ['gold'], modes: ['rail', 'pop'], speed: 1.5 },
];
const rangeV = new THREE.Vector3(), rangeV2 = new THREE.Vector3();
const rangeRay = new THREE.Raycaster();
let rangeStand = null, rangeBack = null, rangeRifle = null, rangeMuzzle = null;
let rangeLive = [], rangeDebris = [], rangeHoles = [], rangeHoleN = 0;

function rangeSimple() { return settings.quality === 'low'; }
function rangeCap() { return settings.quality === 'low' ? 2 : (settings.quality === 'high' ? 4 : 3); }
function rangeWave(t) { for (const w of RANGE_WAVES) if (t >= w.t0 && t < w.t1) return w; return null; }
function rangeReloading(t) { return (t >= 15 && t < 17) || (t >= 34 && t < 36) || RANGE.reload > 0; }
function rangeBox(g, w, h, d, x, y, z, col) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mkMat({ color: col }));
  m.position.set(x, y, z); m.castShadow = true; g.add(m); return m;
}
function rangeBoard(text) {
  const cv = document.createElement('canvas'); cv.width = 1024; cv.height = 192; const c = cv.getContext('2d');
  c.fillStyle = '#2a211c'; c.fillRect(0, 0, 1024, 192); c.fillStyle = '#ffd21f';
  c.font = 'bold 58px Fredoka, system-ui, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillText(text, 512, 100);
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(5.6, 0.95), new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }));
  m.rotation.y = Math.PI; return m;
}
function rangeNum(n) {
  const cv = document.createElement('canvas'); cv.width = 128; cv.height = 128; const c = cv.getContext('2d');
  c.fillStyle = '#ffd21f'; c.fillRect(0, 0, 128, 128); c.strokeStyle = '#2a211c'; c.lineWidth = 10; c.strokeRect(6, 6, 116, 116);
  c.fillStyle = '#2a211c'; c.font = 'bold 78px Fredoka, system-ui, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillText(String(n), 64, 70);
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false, fog: false }));
  s.scale.set(0.62, 0.62, 1); return s;
}

function initRange() {
  const g = new THREE.Group(); g.position.set(RANGE.x, 0, RANGE.z); g.rotation.y = RANGE.h; rangeStand = g;
  const wood = 0xc4894a, dark = 0x6b3a22, roof = 0xc4553a, sand = 0xe7d3a4, hay = 0xe2c56a, ink = 0x2a211c;
  rangeBox(g, 8.4, 0.08, 14.2, 0, 0.04, 5.2, sand);
  rangeBox(g, 7.4, 0.16, 2.4, 0, 2.55, -1.55, roof);
  for (let i = 0; i < 6; i++) rangeBox(g, 1.05, 0.1, 0.18, -2.6 + i * 1.05, 2.28, -0.42, i % 2 ? 0xf4f1ea : roof);
  rangeBox(g, 0.28, 2.2, 2.6, -3.45, 1.1, -1.3, wood); rangeBox(g, 0.28, 2.2, 2.6, 3.45, 1.1, -1.3, wood);
  rangeBox(g, 0.16, 2.2, 0.16, -3.45, 1.1, -2.5, ink); rangeBox(g, 0.16, 2.2, 0.16, 3.45, 1.1, -2.5, ink);
  rangeBox(g, 3.4, 0.72, 0.42, 0, 0.78, -0.15, 0xf4f1ea);
  rangeBox(g, 3.5, 0.08, 0.5, 0, 1.16, -0.12, wood);
  rangeBox(g, 0.35, 0.7, 10.4, -3.7, 0.4, 6.2, dark); rangeBox(g, 0.35, 0.7, 10.4, 3.7, 0.4, 6.2, dark);
  for (const x of [-1.7, 0, 1.7]) {
    rangeBox(g, 0.08, 0.08, 10.4, x, 1.02, 6.5, 0x8d97a3);
    rangeBox(g, 0.08, 0.55, 0.08, x, 0.72, 2.2, ink);
    rangeBox(g, 0.08, 0.55, 0.08, x, 0.72, 11.2, ink);
    const tag = rangeNum(x > 0 ? 1 : x < 0 ? 3 : 2); tag.position.set(x, 1.72, 2.35); g.add(tag);
  }
  const board = new THREE.Group(); board.position.set(0, 1.7, 12.25); g.add(board);
  rangeBack = rangeBox(board, 7.4, 3.5, 0.26, 0, 0, 0, 0xd7b07a);
  rangeBox(board, 7.7, 0.16, 0.32, 0, 1.83, 0, ink); rangeBox(board, 7.7, 0.16, 0.32, 0, -1.83, 0, ink);
  rangeBox(board, 0.16, 3.7, 0.32, -3.78, 0, 0, ink); rangeBox(board, 0.16, 3.7, 0.32, 3.78, 0, 0, ink);
  for (const x of [-1.7, 0, 1.7]) rangeBox(board, 1.7, 2.15, 0.06, x, 0.05, -0.16, 0xf6ead2);
  for (const x of [-2.4, 0, 2.4]) rangeBox(g, 1.15, 0.42, 0.62, x, 0.28, 11.55, hay);
  rangeBox(g, 0.85, 0.5, 0.7, -2.55, 0.32, -2.55, wood);
  const sign = rangeBoard('STRZELNICA ZWIERZYNIEC'); sign.position.set(0, 1.62, -2.95); g.add(sign);
  const ring = new THREE.Mesh(new THREE.RingGeometry(2.3, 3.05, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xe8503a, transparent: true, opacity: 0.9, depthWrite: false }));
  ring.position.set(0, 0.1, -4.6); g.add(ring); RANGE.ring = ring;
  scene.add(g); g.updateMatrixWorld(true);
  rangeV.set(0, 0, -4.6).applyMatrix4(g.matrixWorld); RANGE.px = rangeV.x; RANGE.pz = rangeV.z;
  const seg = rangeSimple() ? 7 : 10;
  RANGE.geos = {};
  for (const k in RANGE_KINDS) RANGE.geos[k] = new THREE.SphereGeometry(RANGE_KINDS[k].r, seg, seg);
  for (const [kind, x, y, z] of [['pumpkin', -2.15, 0.85, -2.5], ['melon', -2.55, 0.78, -2.15], ['water', -1.75, 0.78, -2.15]]) {
    const f = rangeFruit(kind); f.position.set(x, y, z); f.scale.setScalar(0.72); g.add(f);
  }
  for (let i = 0; i < 20; i++) {
    const h = new THREE.Mesh(new THREE.CircleGeometry(0.11, 10), new THREE.MeshBasicMaterial({ color: 0x2a211c }));
    h.visible = false; rangeBack.add(h); rangeHoles.push(h);
  }
  for (let i = 0; i < (rangeSimple() ? 10 : 22); i++) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.08, 5, 4), mkMat({ color: 0xfff1ea }));
    m.visible = false; scene.add(m); rangeDebris.push({ m, v: new THREE.Vector3(), t: 0, life: 0 });
  }
  buildRangeHud();
  if (W.travel) W.travel.push(['🎯 Strzelnica Zwierzyniec', RANGE.px, RANGE.pz]);
  if (typeof MIS !== 'undefined') {
    MIS.list.push({
      id: 'strzelnica', name: 'Strzelnica Zwierzyniec', who: 'Strzelnica', where: 'Las Zwierzyniec, ul. Borów',
      reward: 200, side: true, range: true, bestKey: 'strzelnica', bestLow: false, col: '#e8503a',
      text: 'Wiatrówka sportowa, trzy tory i tylko owoce: dynie, melony, arbuzy. Minuta, 15 nabojów. Wynik z celności, serii i czasu. Przyzwoity przebieg to około 150–250 zł. W mieście nie ma strzelania.',
      gx: RANGE.px, gz: RANGE.pz, done: !!(SAVE.done && SAVE.done.strzelnica), obj3: null, cool: false,
    });
  }
  Object.assign(G, {
    rangeEnter, rangeExit, rangeFire, rangeAimWorld,
    rangeState: () => ({ on: RANGE.on, phase: RANGE.phase, t: +RANGE.t.toFixed(2), score: RANGE.score, hits: RANGE.hits, shots: RANGE.shots, mag: RANGE.mag, reserve: RANGE.reserve, combo: RANGE.combo, pay: rangePay(RANGE.score), best: SAVE.best.strzelnica || 0, n: rangeLive.filter((q) => q.on).length, x: RANGE.px, z: RANGE.pz, targets: rangeLive.filter((q) => q.on && q.up).map((q) => { const p = q.g.getWorldPosition(new THREE.Vector3()); return { x: p.x, y: p.y, z: p.z, kind: q.kind }; }) }),
  });
}
function buildRangeHud() {
  const el = document.createElement('div'); el.id = 'rangeHud'; el.className = 'hidden';
  el.innerHTML = '<div id="rangeTop"><b id="rangeWave">Strzelnica</b><span id="rangeTime">1:00</span><span id="rangeScore">0 pkt</span></div><div id="rangeCombo"></div><div id="rangeAmmo"><div id="rangePips"><i></i><i></i><i></i><i></i><i></i></div><span id="rangeLeft">zostało 15 / 15</span></div><div id="rangeCross"></div><div id="rangePop"></div><div id="rangeEnd" class="hidden"><b id="rangeEndTitle">Koniec przebiegu</b><ul><li><span>Trafienia</span><b id="rangeStatHits"></b></li><li><span>Najlepsza seria</span><b id="rangeStatCombo"></b></li><li><span>Punkty</span><b id="rangeStatScore"></b></li><li><span>Wypłata</span><b id="rangeStatPay"></b></li><li><span>Rekord</span><b id="rangeStatBest"></b></li></ul><p id="rangeEndNote"></p><div class="row"><button type="button" id="rangeAgain">Jeszcze raz</button><button type="button" id="rangeLeave">Wyjdź</button></div></div><button type="button" id="rangeFire">STRZAŁ</button><button type="button" id="rangeOut">Wyjdź</button>';
  document.body.appendChild(el);
  $('rangeFire').onclick = (e) => { e.stopPropagation(); rangeFire(); };
  $('rangeOut').onclick = (e) => { e.stopPropagation(); rangeExit(); };
  $('rangeLeave').onclick = (e) => { e.stopPropagation(); rangeExit(); };
  $('rangeAgain').onclick = (e) => { e.stopPropagation(); rangeBegin(); };
  for (const id of ['rangeFire', 'rangeOut', 'rangeLeave', 'rangeAgain', 'rangeEnd']) {
    const n = $(id); if (!n) continue;
    n.addEventListener('pointerdown', (e) => e.stopPropagation());
  }
}
function rangeNear() {
  if (!rangeStand) return false;
  const f = focusXZ(); return Math.hypot(f.x - RANGE.px, f.z - RANGE.pz) < (G.mode === 'car' ? 8 : 5.5);
}
function rangeHint() {
  if (!rangeStand || RANGE.on) return null;
  if (!rangeNear()) return null;
  if (WANT.stars) return 'Strzelnica zamknięta, dopóki ściga cię policja';
  if (G.mode === 'car') return 'Strzelnica Zwierzyniec: wysiądź, potem ' + (isTouch ? 'AKCJA' : 'E');
  return (isTouch ? 'AKCJA' : 'E') + ': Strzelnica Zwierzyniec – wiatrówka, tylko owoce';
}
function rangeAction() {
  if (RANGE.on) { rangeExit(); return true; }
  if (!rangeNear() || G.cut) return false;
  if (RANGE.cool > 0) return true;
  if (WANT.stars) { toast('Najpierw zgub policję. Na strzelnicy nie ma kryjówki.', 1800); return true; }
  if (G.mode !== 'foot') { toast('Wysiądź – na stanowisko wchodzisz pieszo.', 1600); return true; }
  rangeEnter(); return true;
}
function rangeEnter() {
  if (RANGE.on) return;
  RANGE.on = true; G.inRange = true; RANGE.backX = player.x; RANGE.backZ = player.z; RANGE.backH = player.h;
  player.mesh.visible = false; player.vx = 0; player.vz = 0;
  if (document.pointerLockElement) document.exitPointerLock();
  rangeStand.updateMatrixWorld(true);
  if (!rangeRifle) {
    rangeRifle = new THREE.Group();
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.08, 0.36), mkMat({ color: 0x8a5a32 }));
    const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.02, 0.52), mkMat({ color: 0x2a211c })); barrel.position.set(0, 0.05, -0.32);
    const fore = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.04, 0.22), mkMat({ color: 0xa56b3c })); fore.position.set(0, 0.035, -0.16);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.1, 0.05), mkMat({ color: 0x6b4228 })); grip.position.set(0, -0.04, 0.04);
    rangeMuzzle = new THREE.Mesh(new THREE.SphereGeometry(0.045, 6, 5), new THREE.MeshBasicMaterial({ color: 0xfff1c2 }));
    rangeMuzzle.position.set(0, 0.05, -0.6); rangeMuzzle.visible = false;
    rangeRifle.add(stock, barrel, fore, grip, rangeMuzzle); camera.add(rangeRifle);
  }
  rangeRifle.visible = true; rangeRifle.position.set(0.46, -0.22, -0.72); rangeRifle.scale.setScalar(1.45);
  $('hud').classList.add('rangeHide');
  $('rangeHud').classList.remove('hidden');
  $('touch').classList.add('range');
  rangeBegin();
}
function rangeBegin() {
  for (const t of rangeLive) { t.g.visible = false; rangeStand.remove(t.g); }
  rangeLive.length = 0;
  for (const h of rangeHoles) h.visible = false;
  for (const d of rangeDebris) d.m.visible = false;
  rangeHoleN = 0;
  Object.assign(RANGE, { phase: 'intro', t: 0, score: 0, hits: 0, shots: 0, combo: 0, bestCombo: 0, mag: 5, reserve: 10, reload: 0, spawnT: 0.2, ax: 0, ay: 0, did1: false, did2: false, kick: 0, flash: 0, pop: 0, wave: null });
  $('rangeEnd').classList.add('hidden'); $('rangeHud').classList.remove('done');
  rangeHud();
}
function rangeExit() {
  if (!RANGE.on) return;
  RANGE.on = false; G.inRange = false; RANGE.phase = 'idle';
  player.mesh.visible = true;
  player.x = RANGE.backX; player.z = RANGE.backZ; player.h = RANGE.backH; player.y = groundH(player.x, player.z);
  player.mesh.position.set(player.x, player.y, player.z); player.mesh.rotation.y = player.h;
  G.camOverride = null; if (typeof applyFog === 'function') applyFog();
  if (rangeRifle) rangeRifle.visible = false;
  $('hud').classList.remove('rangeHide');
  $('rangeHud').classList.add('hidden'); $('rangeHud').classList.remove('done');
  $('touch').classList.remove('range');
  G.keys.clear(); RANGE.cool = 1.2;
}
function rangePay(score) { return clamp(Math.round(score * 0.82), 0, 280); }
function rangeFinish() {
  if (RANGE.phase === 'done') return;
  RANGE.phase = 'done';
  const acc = RANGE.shots ? RANGE.hits / RANGE.shots : 0;
  RANGE.score += Math.round(acc * 60);
  const pay = rangePay(RANGE.score);
  const prev = SAVE.best.strzelnica;
  const improved = prev == null || RANGE.score > prev + 0.5;
  if (improved) SAVE.best.strzelnica = Math.round(RANGE.score);
  const m = MIS.list.find((q) => q.id === 'strzelnica');
  if (m) { m.done = true; SAVE.done.strzelnica = true; }
  if (SAVE.claimed) SAVE.claimed.strzelnica = true;
  if (pay) addMoney(pay, 'strzelnica');
  else saveGame();
  $('rangeEndTitle').textContent = improved ? 'Nowy rekord!' : 'Koniec przebiegu';
  $('rangeStatHits').textContent = RANGE.hits + ' / ' + Math.max(RANGE.shots, RANGE.hits);
  $('rangeStatCombo').textContent = '×' + RANGE.bestCombo;
  $('rangeStatScore').textContent = RANGE.score + ' pkt';
  $('rangeStatPay').textContent = pay + ' zł';
  $('rangeStatBest').textContent = Math.round(SAVE.best.strzelnica || RANGE.score) + ' pkt';
  $('rangeEndNote').textContent = improved ? 'Zapisane w dzienniku.' : ('Rekord bez zmian: ' + Math.round(prev) + ' pkt.');
  $('rangeEnd').classList.remove('hidden'); $('rangeHud').classList.add('done');
  rangeHud();
}
function rangeHud() {
  const left = RANGE.phase === 'play' ? Math.max(0, 60 - RANGE.t) : (RANGE.phase === 'intro' ? 60 : 0);
  const w = rangeWave(RANGE.t);
  const re = rangeReloading(RANGE.t) && RANGE.phase === 'play';
  $('rangeWave').textContent = RANGE.phase === 'intro' ? 'Gotowi…' : (RANGE.phase === 'done' ? 'Wynik' : (re ? 'Przeładowanie' : (w ? w.name : 'Strzelnica')));
  $('rangeTime').textContent = '0:' + String(Math.ceil(left)).padStart(2, '0');
  $('rangeScore').textContent = RANGE.score + ' pkt';
  const pips = $('rangePips'); if (pips) for (let i = 0; i < 5; i++) pips.children[i].className = i < RANGE.mag ? 'on' : '';
  const leftN = RANGE.mag + RANGE.reserve;
  $('rangeLeft').textContent = re ? 'przeładowanie' : ('zostało ' + leftN + ' / 15');
  $('rangeCombo').textContent = RANGE.combo > 1 ? ('seria ×' + RANGE.combo) : '';
  const c = $('c').getBoundingClientRect();
  const cross = $('rangeCross');
  cross.style.left = ((RANGE.ax * 0.5 + 0.5) * c.width) + 'px';
  cross.style.top = ((-RANGE.ay * 0.5 + 0.5) * c.height) + 'px';
  const pop = $('rangePop');
  pop.style.left = cross.style.left; pop.style.top = cross.style.top;
  pop.style.opacity = RANGE.pop > 0 ? String(Math.min(1, RANGE.pop * 2)) : '0';
  if (rangeRifle) rangeRifle.rotation.set(0.12 - RANGE.ay * 0.1, -0.08 - RANGE.ax * 0.15, 0);
  if (rangeMuzzle) rangeMuzzle.visible = RANGE.flash > 0;
}
function rangeAimEvent(e) {
  const r = $('c').getBoundingClientRect();
  RANGE.ax = clamp(((e.clientX - r.left) / r.width) * 2 - 1, -0.82, 0.82);
  RANGE.ay = clamp(-(((e.clientY - r.top) / r.height) * 2 - 1), -0.62, 0.48);
  rangeHud();
}
function rangeAimWorld(x, y, z) {
  rangeStand.updateMatrixWorld(true);
  rangeV.set(x, y, z).project(camera);
  RANGE.ax = clamp(rangeV.x, -0.82, 0.82); RANGE.ay = clamp(rangeV.y, -0.62, 0.48); rangeHud();
}
function rangeFruit(kind) {
  const g = new THREE.Group(); const K = RANGE_KINDS[kind]; const simple = rangeSimple();
  const mat = mkMat({ color: K.col, emissive: kind === 'gold' ? 0xf6c431 : 0x000000, emissiveIntensity: kind === 'gold' ? 0.6 : 0 });
  const body = new THREE.Mesh(RANGE.geos[kind], mat); body.castShadow = true;
  if (kind === 'pumpkin') body.scale.set(1, 0.78, 1);
  if (kind === 'melon') body.scale.set(0.9, 1.05, 0.9);
  if (kind === 'water') body.scale.set(1.18, 0.92, 1.18);
  g.add(body);
  if (TOON && !simple) body.add(new THREE.Mesh(RANGE.geos[kind], hullMats().small));
  const rib = (w, h, d, rot) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mkMat({ color: K.rib })); m.rotation.y = rot || 0; g.add(m); };
  if (kind === 'pumpkin') {
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.07, 0.16, 5), mkMat({ color: 0x3c6b32 })); stem.position.y = K.r * 0.72; g.add(stem);
    if (!simple) for (let i = 0; i < 4; i++) rib(0.05, K.r * 1.45, K.r * 1.85, i * Math.PI / 4);
  } else if (kind === 'melon' && !simple) {
    for (let i = 0; i < 3; i++) rib(K.r * 1.7, 0.035, K.r * 1.7, i * 0.5);
  } else if (kind === 'water') {
    const n = simple ? 3 : 5;
    for (let i = 0; i < n; i++) rib(0.07, K.r * 1.7, K.r * 2.05, i * Math.PI / n);
  } else if (kind === 'gold' && !simple) {
    const crown = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.16, 0.1), mkMat({ color: 0xfff6c8, emissive: 0xf6c431, emissiveIntensity: 0.4 }));
    crown.position.y = K.r * 0.85; g.add(crown);
  }
  return g;
}
function rangeSpawn(kind, mode) {
  const lane = Math.floor(Math.random() * 3) - 1;
  const fruit = rangeFruit(kind); rangeStand.add(fruit);
  const t = { g: fruit, kind, mode, lane, on: true, up: true, age: Math.random() * 0.4, phase: Math.random() * 6.28, r: RANGE_KINDS[kind].r * (kind === 'water' ? 1.05 : 1) };
  rangeLive.push(t); rangePlace(t, 0); return t;
}
function rangePlace(t, dt) {
  t.age += dt;
  const w = rangeWave(Math.min(59.9, RANGE.t)) || RANGE_WAVES[0];
  const sp = w.speed;
  const travel = t.mode === 'pop' ? 0.45 : 1.2;
  const x = t.lane * 1.7 + Math.sin(t.phase + t.age * sp) * travel;
  let y = 1.22 + RANGE_KINDS[t.kind].r * 0.15;
  if (t.mode === 'swing') y += Math.sin(t.phase * 1.7 + t.age * sp * 1.6) * 0.48;
  if (t.mode === 'pop') { t.up = (t.age % 1.7) < 1.05; }
  else t.up = true;
  t.g.position.set(x, t.up ? y : 0.35, 5.4 + (t.lane + 1) * 0.15);
  t.g.visible = t.on;
  t.g.scale.setScalar(t.on && t.up ? 1 : 0.02);
  if (t.on && t.up) t.g.rotation.y += dt * (t.kind === 'gold' ? 1.4 : 0.45);
}
function rangeBurst(pos, col) {
  const n = rangeSimple() ? 5 : 12;
  let used = 0;
  for (const d of rangeDebris) {
    if (d.m.visible) continue;
    d.m.visible = true; d.m.material.color.setHex(used < 2 ? 0xfff6e8 : col);
    d.m.scale.setScalar(0.7 + Math.random() * 1.3);
    d.m.position.copy(pos);
    d.v.set((Math.random() - 0.5) * 4.2, 2 + Math.random() * 2.4, (Math.random() - 0.5) * 2.4);
    d.t = 0; d.life = 0.7; used++; if (used >= n) break;
  }
}
function rangeHole(hit) {
  rangeBack.updateMatrixWorld(true);
  const local = rangeBack.worldToLocal(hit.clone());
  const h = rangeHoles[rangeHoleN % rangeHoles.length]; rangeHoleN++;
  h.visible = true; h.position.set(clamp(local.x, -3.4, 3.4), clamp(local.y, -1.5, 1.5), -0.2);
}
function rangeMark(text, good) {
  const pop = $('rangePop'); if (!pop) return;
  pop.textContent = text; pop.className = good ? 'good' : 'bad'; RANGE.pop = 0.65;
  $('rangeCross').className = good ? 'hit' : 'miss';
}
function rangeFire() {
  if (!RANGE.on || RANGE.phase !== 'play' || rangeReloading(RANGE.t) || RANGE.mag <= 0) return false;
  RANGE.mag--; RANGE.shots++; RANGE.flash = 0.08;
  rangeRay.setFromCamera(new THREE.Vector2(RANGE.ax, RANGE.ay), camera);
  let best = null, bd = 1e9, hp = null;
  for (const t of rangeLive) {
    if (!t.on || !t.up) continue;
    t.g.getWorldPosition(rangeV);
    const ocx = rangeV.x - rangeRay.ray.origin.x, ocy = rangeV.y - rangeRay.ray.origin.y, ocz = rangeV.z - rangeRay.ray.origin.z;
    const b = ocx * rangeRay.ray.direction.x + ocy * rangeRay.ray.direction.y + ocz * rangeRay.ray.direction.z;
    const c = ocx * ocx + ocy * ocy + ocz * ocz - t.r * t.r;
    const disc = b * b - c;
    if (disc > 0 && b > 0) { const dist = b - Math.sqrt(disc); if (dist < bd) { bd = dist; best = t; hp = rangeV.clone(); } }
  }
  if (best) {
    best.on = false; best.g.visible = false;
    RANGE.hits++; RANGE.combo++; RANGE.bestCombo = Math.max(RANGE.bestCombo, RANGE.combo);
    const left = Math.max(0, 60 - RANGE.t);
    const gained = Math.round(RANGE_KINDS[best.kind].pts * (1 + left / 120) + Math.max(0, RANGE.combo - 1) * 4);
    RANGE.score += gained;
    rangeBurst(hp || best.g.getWorldPosition(rangeV2), RANGE_KINDS[best.kind].col);
    rangeMark('+' + gained, true);
    if (settings.vibrate && isTouch) buzz(14);
  } else {
    RANGE.combo = 0; rangeMark('pudło', false);
    const planeZ = new THREE.Vector3(); rangeBack.getWorldPosition(planeZ);
    const n = new THREE.Vector3(0, 0, 1).applyQuaternion(rangeStand.quaternion);
    const denom = rangeRay.ray.direction.dot(n);
    if (Math.abs(denom) > 1e-4) {
      const tt = planeZ.clone().sub(rangeRay.ray.origin).dot(n) / denom;
      if (tt > 0) rangeHole(rangeRay.ray.origin.clone().addScaledVector(rangeRay.ray.direction, tt));
    }
  }
  if (RANGE.mag <= 0 && RANGE.reserve <= 0) rangeFinish();
  else if (RANGE.mag <= 0) RANGE.reload = 1.45;
  rangeHud(); return true;
}
function rangeFill(w) {
  let guard = 0;
  while (rangeLive.filter((t) => t.on).length < rangeCap() && guard++ < 6) {
    rangeSpawn(w.kinds[Math.floor(Math.random() * w.kinds.length)], w.modes[Math.floor(Math.random() * w.modes.length)]);
  }
}
function updateRange(dt) {
  if (RANGE.cool > 0) RANGE.cool -= dt;
  if (!RANGE.on) {
    if (RANGE.ring) RANGE.ring.material.opacity = 0.45 + 0.35 * Math.sin(performance.now() * 0.004);
    return;
  }
  RANGE.flash = Math.max(0, (RANGE.flash || 0) - dt);
  RANGE.pop = Math.max(0, (RANGE.pop || 0) - dt);
  if (RANGE.pop <= 0 && $('rangeCross')) $('rangeCross').className = '';
  rangeStand.updateMatrixWorld(true);
  const eye = rangeV.set(0, 1.55, -1.45).applyMatrix4(rangeStand.matrixWorld);
  const look = rangeV2.set(0, 1.28, 8).applyMatrix4(rangeStand.matrixWorld);
  G.camOverride = [eye.x, eye.y, eye.z, look.x, look.y, look.z];
  if (RANGE.phase === 'intro') {
    RANGE.t += dt; if (RANGE.t > 1.1) { RANGE.phase = 'play'; RANGE.t = 0; RANGE.wave = null; }
    rangeHud(); return;
  }
  if (RANGE.phase !== 'play') { rangeHud(); return; }
  RANGE.t += dt;
  const top = () => { const take = Math.min(5 - RANGE.mag, RANGE.reserve); RANGE.mag += take; RANGE.reserve -= take; };
  if (RANGE.t >= 17 && !RANGE.did1) { RANGE.did1 = true; top(); }
  if (RANGE.t >= 36 && !RANGE.did2) { RANGE.did2 = true; top(); }
  if (RANGE.reload > 0) { RANGE.reload -= dt; if (RANGE.reload <= 0) top(); }
  const w = rangeWave(RANGE.t);
  if (w && !rangeReloading(RANGE.t)) {
    if (RANGE.wave !== w.id) { RANGE.wave = w.id; rangeFill(w); RANGE.spawnT = 0.35; }
    RANGE.spawnT -= dt;
    const gap = settings.quality === 'low' ? 1.05 : (settings.quality === 'high' ? 0.55 : 0.72);
    if (RANGE.spawnT <= 0 && rangeLive.filter((t) => t.on).length < rangeCap()) {
      RANGE.spawnT = gap;
      rangeSpawn(w.kinds[Math.floor(Math.random() * w.kinds.length)], w.modes[Math.floor(Math.random() * w.modes.length)]);
    }
  } else if (!w) RANGE.wave = null;
  for (const t of rangeLive) if (t.on) rangePlace(t, dt);
  for (const d of rangeDebris) {
    if (!d.m.visible) continue; d.t += dt; d.v.y -= 11 * dt; d.m.position.addScaledVector(d.v, dt);
    if (d.t > d.life || d.m.position.y < 0.05) d.m.visible = false;
  }
  if (RANGE.t >= 60) rangeFinish();
  rangeHud();
}
addEventListener('pointermove', (e) => { if (G.inRange && !isTouch) rangeAimEvent(e); });
addEventListener('pointerdown', (e) => {
  if (!G.inRange || isTouch || RANGE.phase === 'done') return;
  if (e.target && e.target.closest && e.target.closest('button')) return;
  rangeFire();
});
function drawRangeMinimap(g, sc) {
  if (!rangeStand) return;
  g.fillStyle = '#e8503a'; g.fillRect(RANGE.px - 7 / sc, RANGE.pz - 5 / sc, 14 / sc, 10 / sc); g.strokeRect(RANGE.px - 7 / sc, RANGE.pz - 5 / sc, 14 / sc, 10 / sc);
  g.fillStyle = '#2a211c'; g.font = 'bold ' + (9 / sc) + 'px sans-serif'; g.textAlign = 'center'; g.fillText('S', RANGE.px, RANGE.pz + 1 / sc);
}

// AMBIENCE-CITY + FOOTSTEP. Synteza WebAudio (szum przefiltrowany), bez pobieranych próbek.
// Szum miasta cichnie, gdy gra radio. Kroki zostają. Głośność z suwaka efektów (0 = cisza).
const AMB = { ac: null, city: null, stepBuf: null, stepFilter: null, stepT: 0, unlocked: false };
function initAmbience() {
  const kick = () => ambUnlock();
  addEventListener('pointerdown', kick, { passive: true });
  addEventListener('keydown', kick);
}
function ambUnlock() {
  if (AMB.unlocked) { if (AMB.ac && AMB.ac.state === 'suspended') AMB.ac.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  let ac;
  try { ac = new AC(); } catch (e) { return; }
  AMB.ac = ac; AMB.unlocked = true;
  const n = ac.sampleRate * 2;
  const buf = ac.createBuffer(1, n, ac.sampleRate);
  const d = buf.getChannelData(0);
  let b0 = 0, b1 = 0;
  for (let i = 0; i < n; i++) {
    const w = Math.random() * 2 - 1;
    b0 = b0 * 0.995 + w * 0.005;
    b1 = b1 * 0.92 + w * 0.08;
    d[i] = b0 * 0.85 + b1 * 0.12;
  }
  const src = ac.createBufferSource(); src.buffer = buf; src.loop = true;
  const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 380;
  const g = ac.createGain(); g.gain.value = 0;
  src.connect(lp); lp.connect(g); g.connect(ac.destination); src.start();
  AMB.city = g;
  const sn = Math.floor(ac.sampleRate * 0.07);
  const sb = ac.createBuffer(1, sn, ac.sampleRate);
  const sd = sb.getChannelData(0);
  for (let i = 0; i < sn; i++) sd[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ac.sampleRate * 0.012));
  AMB.stepBuf = sb;
  const bp = ac.createBiquadFilter(); bp.type = 'lowpass'; bp.frequency.value = 220;
  bp.connect(ac.destination);
  AMB.stepFilter = bp;
  if (ac.state === 'suspended') ac.resume();
}
function ambSfx() { return settings.sfxVol == null ? 0.7 : settings.sfxVol; }
function ambFoot(loud) {
  const ac = AMB.ac; if (!ac || !AMB.stepBuf) return;
  const s = ac.createBufferSource(); s.buffer = AMB.stepBuf;
  const g = ac.createGain();
  const v = Math.max(0.001, ambSfx() * loud);
  g.gain.setValueAtTime(v, ac.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.07);
  s.connect(g); g.connect(AMB.stepFilter); s.start(); s.stop(ac.currentTime + 0.09);
}
function updateAmbience(dt) {
  if (!AMB.ac || !AMB.city) return;
  const sfx = ambSfx();
  const cityOn = G.started && !G.paused && sfx > 0.001 && !(RADIO && RADIO.playing);
  const target = cityOn ? sfx * 0.16 : 0;
  AMB.city.gain.setTargetAtTime(target, AMB.ac.currentTime, 0.12);
  if (!(G.started && !G.paused) || G.mode !== 'foot' || !player.onGround || player.speed < 0.45 || sfx <= 0.001) return;
  AMB.stepT -= dt;
  if (AMB.stepT > 0) return;
  const run = player.speed > 6.2;
  AMB.stepT = run ? 0.28 : 0.46;
  ambFoot(run ? 0.42 : 0.26);
}

// YUKA-STEER. Nearby pedestrians and traffic only (LOD). Sidewalks stay the authority:
// a pedestrian may speed up, slow down or turn around, but the step stays on the path.
function yukaRadius() { return { low: 180, med: 260, high: 340 }[settings.quality] || 220; }
function yukaNear(x, z) {
  const f = focusPos();
  return Math.hypot(x - f.x, z - f.z) < yukaRadius();
}
function yukaPedNudge(p, dt, tx, tz) {
  if (!yukaNear(p.x, p.z)) return 1;
  if (!p._yv) {
    p._yv = new Vehicle();
    p._yv.maxSpeed = 2.4;
    p._yv.maxForce = 10;
    p._yv.boundingRadius = 0.35;
    p._sep = new SeparationBehavior();
    p._flee = new FleeBehavior(new Vector3(p.x, 0, p.z), 8);
    p._flee.active = false;
    p._yv.steering.add(p._sep);
    p._yv.steering.add(p._flee);
  }
  const neighbors = [];
  for (const o of TR.peds) {
    if (!o.on || o === p) continue;
    if (Math.hypot(o.x - p.x, o.z - p.z) > 1.7) continue;
    if (!o._ent) { o._ent = new GameEntity(); o._ent.boundingRadius = 0.35; }
    o._ent.position.set(o.x, 0, o.z);
    neighbors.push(o._ent);
  }
  if (G.mode === 'foot' && Math.hypot(player.x - p.x, player.z - p.z) < 1.7) {
    if (!yukaPedNudge._player) { yukaPedNudge._player = new GameEntity(); yukaPedNudge._player.boundingRadius = 0.4; }
    yukaPedNudge._player.position.set(player.x, 0, player.z);
    neighbors.push(yukaPedNudge._player);
  }
  p._yv.neighbors = neighbors;
  p._yv.position.set(p.x, 0, p.z);
  p._yv.velocity.set(tx * p.v, 0, tz * p.v);
  let threat = null, td = 8;
  for (const c of cars) {
    if (!c.g.visible || c.speed < 2.4) continue;
    const d = Math.hypot(c.x - p.x, c.z - p.z);
    if (d < td) { td = d; threat = c; }
  }
  if (threat) { p._flee.active = true; p._flee.target.set(threat.x, 0, threat.z); p._flee.panicDistance = 8; }
  else p._flee.active = false;
  p._yv.update(dt);
  if (p._baseV == null) p._baseV = p.v;
  if (threat && td < 7) {
    const away = (p.x - threat.x) * tx + (p.z - threat.z) * tz;
    p.v = Math.min(2.6, p._baseV + 1.1);
    return away < 0 ? -1 : 1;
  }
  p.v = p._baseV;
  for (const n of neighbors) {
    const dx = n.position.x - p.x, dz = n.position.z - p.z;
    if (dx * tx + dz * tz > 0.15 && Math.hypot(dx, dz) < 1.15) { p.v = Math.min(p.v, 0.4); break; }
  }
  return 1;
}
function yukaTrafficSpeed(c, a, e, dt, cap) {
  if (!yukaNear(c.x, c.z)) return cap;
  if (!c._yv) {
    c._yv = new Vehicle();
    c._yv.maxForce = 18;
    c._yv.boundingRadius = c.rad || 1.1;
    c._path = new Path();
    c._follow = new FollowPathBehavior(c._path, 4);
    c._avoid = new ObstacleAvoidanceBehavior([]);
    c._avoid.dBoxMinLength = 6;
    c._avoid.brakingWeight = 0.85;
    c._yv.steering.add(c._follow);
    c._yv.steering.add(c._avoid);
    c._obs = [];
  }
  c._yv.maxSpeed = cap;
  c._yv.position.set(c.x, 0, c.z);
  const spd = Math.max(a.v, 0.4);
  c._yv.velocity.set(Math.sin(c.h) * spd, 0, Math.cos(c.h) * spd);
  const pts = [];
  const pose = agentPose(c);
  pts.push(new Vector3(pose.x, 0, pose.z));
  const ahead = Math.min(e.len, a.s + 8);
  const far = edgeSample(e, a.dir > 0 ? ahead : e.len - ahead, { x: 0, z: 0, h: 0 });
  pts.push(new Vector3(far.x, 0, far.z));
  c._path.clear();
  for (const p of pts) c._path.add(p);
  c._path.loop = false;
  const obstacles = [];
  for (const o of cars) {
    if (o === c || !o.g.visible) continue;
    if (Math.hypot(o.x - c.x, o.z - c.z) > 16) continue;
    if (!o._ent) { o._ent = new GameEntity(); }
    o._ent.position.set(o.x, 0, o.z);
    o._ent.boundingRadius = (o.rad || 1) + 0.4;
    obstacles.push(o._ent);
  }
  if (G.mode === 'foot' && Math.hypot(player.x - c.x, player.z - c.z) < 14) {
    if (!yukaTrafficSpeed._player) { yukaTrafficSpeed._player = new GameEntity(); yukaTrafficSpeed._player.boundingRadius = 0.6; }
    yukaTrafficSpeed._player.position.set(player.x, 0, player.z);
    obstacles.push(yukaTrafficSpeed._player);
  }
  c._avoid.obstacles = obstacles;
  c._yv.update(dt);
  return Math.min(cap, c._yv.getSpeed ? c._yv.getSpeed() : c._yv.velocity.length());
}

// MESH-BVH. Lazy bounds trees on the chunk meshes near the player. Camera pull and
// movement raycasts use them; chunks farther away drop the tree to save memory.
const BVH = { list: [], ray: new THREE.Raycaster(), built: 0, dropped: 0 };
function bvhCap() { return { low: 2, med: 4, high: 6 }[settings.quality] || 3; }
function bvhRadius() { return { low: 220, med: 360, high: 520 }[settings.quality] || 280; }
function bvhRegister(mesh) {
  const bs = mesh.geometry.boundingSphere;
  if (!bs) return;
  BVH.list.push({ mesh, x: bs.center.x, z: bs.center.z, r: bs.radius });
}
function bvhEnsure(x, z) {
  const R = bvhRadius(), cap = bvhCap();
  const near = [];
  for (const rec of BVH.list) if (Math.hypot(rec.x - x, rec.z - z) - rec.r < R) near.push(rec);
  near.sort((a, b) => Math.hypot(a.x - x, a.z - z) - Math.hypot(b.x - x, b.z - z));
  const keep = new Set(near.slice(0, cap));
  for (const rec of BVH.list) {
    const geo = rec.mesh.geometry;
    if (keep.has(rec)) {
      if (!geo.boundsTree && !rec.failed) {
        const n = geo.getAttribute('position').count;
        const capN = settings.quality === 'low' ? 70000 : 140000;
        if (n > capN) { rec.failed = true; continue; }
        try {
          if (!geo.index) {
            const idx = n > 65535 ? new Uint32Array(n) : new Uint16Array(n);
            for (let i = 0; i < n; i++) idx[i] = i;
            geo.setIndex(new THREE.BufferAttribute(idx, 1));
          }
          geo.boundsTree = new MeshBVH(geo);
          BVH.built++;
        } catch (e) { rec.failed = true; }
      }
    } else if (geo.boundsTree) {
      geo.boundsTree = null;
      BVH.dropped++;
    }
  }
}
function bvhHits(ox, oy, oz, dx, dy, dz, far) {
  const len = Math.hypot(dx, dy, dz) || 1;
  BVH.ray.ray.origin.set(ox, oy, oz);
  BVH.ray.ray.direction.set(dx / len, dy / len, dz / len);
  BVH.ray.near = 0;
  BVH.ray.far = far;
  BVH.ray.firstHitOnly = true;
  let best = null;
  for (const rec of BVH.list) {
    if (!rec.mesh.geometry.boundsTree) continue;
    const hits = [];
    rec.mesh.raycast(BVH.ray, hits);
    if (hits.length && (!best || hits[0].distance < best.distance)) best = hits[0];
  }
  return best;
}
// Shorten a ground move when a wall mesh is in the way. Returns null if no tree is ready.
function bvhMove(x, z, nx, nz, radius, height) {
  bvhEnsure(x, z);
  let ready = false;
  for (const rec of BVH.list) if (rec.mesh.geometry.boundsTree) { ready = true; break; }
  if (!ready) return null;
  const dist = Math.hypot(nx - x, nz - z);
  if (dist < 1e-4) return { x: nx, z: nz, hit: false, used: true };
  const hit = bvhHits(x, height, z, nx - x, 0, nz - z, dist + radius);
  if (!hit || hit.distance > dist + radius * 0.25) return { x: nx, z: nz, hit: false, used: true };
  const keep = Math.max(0, hit.distance - radius);
  const k = keep / dist;
  const hx = hit.face ? hit.face.normal.x : (x - nx) / dist;
  const hz = hit.face ? hit.face.normal.z : (z - nz) / dist;
  return { x: x + (nx - x) * k, z: z + (nz - z) * k, hit: true, used: true, nx: hx, nz: hz };
}
function bvhCamDist(ox, oy, oz, dx, dy, dz) {
  bvhEnsure(ox, oz);
  const dist = Math.hypot(dx, dy, dz);
  if (dist < 0.2) return null;
  const hit = bvhHits(ox, oy, oz, dx, dy, dz, dist);
  if (!hit) return null;
  return Math.max(0.15, hit.distance - 0.3) / dist;
}


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
  const wrap = $('minimapWrap');
  if (wrap) wrap.addEventListener('click', (e) => { e.stopPropagation(); openMap(); });
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
  g.fillStyle = '#e8503a';
  for (const p of MAP_PINS) {
    if (Math.hypot(p[1] - x, p[2] - z) > R * 0.92) continue;
    g.beginPath(); g.arc(p[1], p[2], 6 / sc, 0, 7); g.fill();
  }
  if (typeof drawNavOverlay === 'function') drawNavOverlay(g, sc);
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
const BM = { gpsClick: true };
const MAP_PINS = [
  ['Pomnik Głowackiego', 50, -21, '#e8503a'],
  ['The Italiana', -119.1, 158.1, '#e2a122'],
  ['Mokrzyszów', 3419, 750, '#45b65a'],
  ['Kościół Wniebowzięcia NMP', -84.2, -69.6, '#f4efe4'],
];
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
  BM.view = { x: 0, y: 0, s: 1 };
  buildTravelList();
  const box = $('mapCanvasWrap');
  const ptrs = new Map();
  let drag = null, pinch = null;
  const applyView = () => { c.style.transform = `translate(${BM.view.x}px,${BM.view.y}px) scale(${BM.view.s})`; };
  const clampView = () => {
    const pw = box.clientWidth || 300, ph = box.clientHeight || 300;
    const w = BM.W * BM.view.s, h = BM.H * BM.view.s, m = 70;
    BM.view.x = clamp(BM.view.x, m - w, pw - m);
    BM.view.y = clamp(BM.view.y, m - h, ph - m);
    applyView();
  };
  BM.fit = () => {
    const pw = box.clientWidth || 300, ph = box.clientHeight || 300;
    const px = G.mode === 'car' && activeCar ? activeCar.x : player.x;
    const pz = G.mode === 'car' && activeCar ? activeCar.z : player.z;
    const mx = (px - MINX) * BM.s, my = (pz - MINZ) * BM.s;
    const fit = Math.min(pw / BM.W, ph / BM.H);
    BM.view.s = clamp(Math.min(pw, ph) / (2400 * BM.s), fit, 3.2);
    BM.view.x = pw / 2 - mx * BM.view.s;
    BM.view.y = ph / 2 - my * BM.view.s;
    clampView();
  };
  const worldAt = (clientX, clientY) => {
    const r = box.getBoundingClientRect();
    const lx = clientX - r.left, ly = clientY - r.top;
    return { x: (lx - BM.view.x) / BM.view.s / BM.s + MINX, z: (ly - BM.view.y) / BM.view.s / BM.s + MINZ };
  };
  const pick = (x, z) => {
    if (BM.gpsClick) {
      if (inWater(x, z)) { toast('To jest woda – GPS nie prowadzi przez jezioro', 2000); return; }
      navSet(x, z, 'punkt na mapie', { src: 'place' }); closeMap(); toast('GPS ustawiony', 1400); return;
    }
    teleport(x, z); closeMap(); toast('Teleport', 1200);
  };
  box.addEventListener('pointerdown', (e) => {
    if (e.target.closest && e.target.closest('#travelList')) return;
    box.setPointerCapture(e.pointerId);
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (ptrs.size === 1) drag = { x: e.clientX, y: e.clientY, ox: BM.view.x, oy: BM.view.y, moved: false };
    if (ptrs.size === 2) {
      const a = [...ptrs.values()];
      pinch = { d: Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y) || 1, s: BM.view.s, cx: (a[0].x + a[1].x) / 2, cy: (a[0].y + a[1].y) / 2 };
      drag = null;
    }
  });
  box.addEventListener('pointermove', (e) => {
    const p = ptrs.get(e.pointerId); if (!p) return; p.x = e.clientX; p.y = e.clientY;
    if (ptrs.size >= 2 && pinch) {
      const a = [...ptrs.values()];
      const d = Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y) || 1;
      const rect = box.getBoundingClientRect();
      const sx = pinch.cx - rect.left, sy = pinch.cy - rect.top;
      const next = clamp(pinch.s * d / pinch.d, Math.min(rect.width / BM.W, rect.height / BM.H), 4);
      const k = next / BM.view.s;
      BM.view.x = sx - (sx - BM.view.x) * k; BM.view.y = sy - (sy - BM.view.y) * k; BM.view.s = next;
      clampView(); return;
    }
    if (!drag) return;
    if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > 6) drag.moved = true;
    BM.view.x = drag.ox + (e.clientX - drag.x); BM.view.y = drag.oy + (e.clientY - drag.y); clampView();
  });
  const endPtr = (e) => {
    const was = drag && !drag.moved && ptrs.size === 1;
    ptrs.delete(e.pointerId);
    if (ptrs.size < 2) pinch = null;
    if (was) { const w = worldAt(e.clientX, e.clientY); pick(w.x, w.z); }
    if (!ptrs.size) drag = null;
  };
  box.addEventListener('pointerup', endPtr);
  box.addEventListener('pointercancel', (e) => { ptrs.delete(e.pointerId); pinch = null; drag = null; });
  box.addEventListener('wheel', (e) => {
    if ($('mapScreen').classList.contains('hidden')) return;
    e.preventDefault();
    const rect = box.getBoundingClientRect();
    const sx = e.clientX - rect.left, sy = e.clientY - rect.top;
    const next = clamp(BM.view.s * (e.deltaY > 0 ? 0.9 : 1.1), Math.min(rect.width / BM.W, rect.height / BM.H), 4);
    const k = next / BM.view.s;
    BM.view.x = sx - (sx - BM.view.x) * k; BM.view.y = sy - (sy - BM.view.y) * k; BM.view.s = next;
    clampView();
  }, { passive: false });
  applyView();
}
function buildTravelList() {
  const list = $('travelList'); list.innerHTML = '';
  W.travel.forEach((t, i) => {
    const row = document.createElement('div'); row.className = 'trow';
    const b = document.createElement('button'); b.type = 'button'; b.textContent = (i + 1) + '. ' + t[0]; if (t[0][0] === '★') b.className = 'egg';
    b.onclick = () => { if (WANT.stars > 0) { toast('🚨 Szybka podróż niedostępna – najpierw zgub policję!', 2000); return; } teleport(t[1], t[2]); closeMap(); toast('Teleport: ' + t[0], 1800); };
    const g = document.createElement('button'); g.type = 'button'; g.className = 'gps'; g.textContent = 'GPS';
    g.onclick = () => { navSet(t[1], t[2], t[0], { src: 'place' }); closeMap(); toast('GPS: ' + t[0], 1600); };
    row.appendChild(b); row.appendChild(g); list.appendChild(row);
  });
}
function drawBigMap() {
  const g = BM.g; const [MINX, MINZ] = W.rect; const S = BM.s;
  g.setTransform(1, 0, 0, 1, 0, 0); g.drawImage(BM.base, 0, 0);
  g.font = 'bold 15px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  W.travel.forEach((t, i) => { const x = (t[1] - MINX) * S, y = (t[2] - MINZ) * S; g.fillStyle = t[0][0] === '★' ? '#0a8fa8' : '#123'; g.beginPath(); g.arc(x, y, 11, 0, 7); g.fill(); g.fillStyle = '#fff'; g.fillText(String(i + 1), x, y + 1); });
  g.font = 'bold 11px Fredoka, system-ui, sans-serif';
  for (const p of MAP_PINS) {
    const x = (p[1] - MINX) * S, y = (p[2] - MINZ) * S;
    g.fillStyle = p[3] || '#e8503a'; g.beginPath(); g.arc(x, y, 6, 0, 7); g.fill();
    g.lineWidth = 2; g.strokeStyle = '#2a211c'; g.stroke();
    g.fillStyle = '#1b140f'; g.fillText(p[0], x, y - 10);
  }
  if (typeof MIS !== 'undefined') {
    g.fillStyle = '#ffd21f';
    for (const m of MIS.list) if (m.giver) { const x = (m.giver[0] - MINX) * S, y = (m.giver[1] - MINZ) * S; g.beginPath(); g.arc(x, y, 4, 0, 7); g.fill(); }
  }
  g.fillStyle = '#2b4a6b'; g.font = 'bold 22px system-ui, sans-serif';
  for (const w of W.water) if (w.name && Math.abs(ringArea(w.ring)) > 200000) { let cx = 0, cz = 0; const n = w.ring.length / 2; for (let i = 0; i < w.ring.length; i += 2) { cx += w.ring[i]; cz += w.ring[i + 1]; } g.fillText(w.name, (cx / n - MINX) * S, (cz / n - MINZ) * S); }
  g.save(); g.setTransform(S, 0, 0, S, -MINX * S, -MINZ * S); drawMissionMinimap(g, S * 1.6); if (typeof drawNavOverlay === 'function') drawNavOverlay(g, S); g.restore();
  const px = G.mode === 'car' ? activeCar.x : player.x, pz = G.mode === 'car' ? activeCar.z : player.z; const ph = G.mode === 'car' ? activeCar.h : player.h;
  g.save(); g.translate((px - MINX) * S, (pz - MINZ) * S); g.rotate(Math.PI - ph); g.fillStyle = '#ff3b30'; g.strokeStyle = '#fff'; g.lineWidth = 3;
  g.beginPath(); g.moveTo(0, -16); g.lineTo(11, 12); g.lineTo(0, 6); g.lineTo(-11, 12); g.closePath(); g.fill(); g.stroke(); g.restore();
}
function openMap() {
  if (!G.started) return;
  drawBigMap(); $('mapScreen').classList.remove('hidden'); G.paused = true; G.mapOpen = true;
  if (document.pointerLockElement) document.exitPointerLock();
  const fitNow = () => { if (BM.fit) BM.fit(); };
  requestAnimationFrame(() => requestAnimationFrame(fitNow));
}
function closeMap() { $('mapScreen').classList.add('hidden'); G.mapOpen = false; G.paused = false; clock.getDelta(); }

// ======================= INPUT =======================
function initInput() {
  addEventListener('keydown', (e) => {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable)) return;
    G.keys.add(e.code);
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
    if (e.repeat) return;
    if (!G.started) return;
    if (G.tutor) { tutorKey(e.code); return; }
    if (G.journalOpen) { if (e.code === 'Escape' || e.code === 'KeyJ') closeJournal(); return; }
    if (G.dialogOpen) { if (e.code === 'KeyE' || e.code === 'Enter') dialogAction(); else if (e.code === 'Escape') dialogClose(); return; }
    if (G.inRange) { if (e.code === 'Escape' || e.code === 'KeyE') { if (typeof rangeExit === 'function') rangeExit(); } return; }
    if (G.inGarage) { garageKey(e.code); return; }
    if (POL.shop) { if (e.code === 'Digit1') { shopBuy('paint'); return; } if (e.code === 'Digit2') { shopBuy('fix'); return; } if (e.code === 'Escape' || e.code === 'Digit3') { shopClose(); return; } }
    if (e.code === 'Space' && G.mode === 'foot') G.jumpReq = true;
    if (e.code === 'KeyE' || e.code === 'KeyF') actionE();
    else if (e.code === 'KeyM') { G.mapOpen ? closeMap() : openMap(); }
    else if (e.code === 'KeyJ') { if (!G.mapOpen && !G.inGarage && !POL.shop) openJournal(); }
    else if (e.code === 'KeyG') {
      if (!NAV.on) return;
      if (NAV.src === 'mission') toast('To trasa misji. Inne miejsce: mapa M → GPS. Misję anulujesz w dzienniku (J).', 2600);
      else { navClear(); toast('GPS wyłączony', 1200); }
    }
    else if (e.code === 'KeyH') {
      if (G.mapOpen || G.journalOpen || G.dialogOpen || G.inGarage || G.inRange || G.tutor || (POL && POL.shop)) return;
      e.preventDefault(); objToggle();
    }
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
  canvas.addEventListener('click', () => { if (G.inRange) return; if (G.started && !G.paused && !isTouch && canvas.requestPointerLock) { try { const p = canvas.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch (e) { /* unsupported */ } } });
  let drag = null;
  canvas.addEventListener('mousedown', (e) => { drag = { x: e.clientX, y: e.clientY }; });
  addEventListener('mouseup', () => { drag = null; G.mouseLooking = false; });
  addEventListener('mousemove', (e) => {
    if (!G.started || G.paused || G.inRange) return;
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
  if (!startGame._once) {
    startGame._once = true;
    if (!SAVE.tut) openTutor();
    else toast(isTouch ? 'Dziennik: 📒. Mapa: GPS przy miejscu. Świecące „!” to misje.' : 'J – dziennik, M – mapa i GPS, G – wyłącz GPS. Świecące „!” to misje.', 4200);
  }
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
  $('rngSfx').value = settings.sfxVol === undefined ? 0.7 : settings.sfxVol; $('rngSfx').oninput = (e) => { settings.sfxVol = parseFloat(e.target.value); saveSettings(); };
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
  libs: () => ({
    kits: Object.keys(KIT),
    kay: Object.keys(KAY),
    bus: !!(typeof MESH !== 'undefined' && MESH.bus),
    bvh: typeof BVH !== 'undefined' ? { built: BVH.built, chunks: BVH.list.length, dropped: BVH.dropped } : null,
    yuka: typeof Vehicle === 'function',
    yukaPeds: typeof TR !== 'undefined' ? TR.peds.filter((p) => p._yv).length : 0,
    yukaCars: typeof TR !== 'undefined' ? TR.agents.filter((c) => c._yv).length : 0,
    nipple: typeof nipplejs !== 'undefined' && !!nipplejs.create,
    meshopt: typeof MeshoptDecoder !== 'undefined',
    paint: KIT.khatch && KIT.khatch.geo.userData.tags ? Array.from(KIT.khatch.geo.userData.tags).filter((t) => t === 1).length : 0,
  }),
  cam: () => {
    let best = null;
    const px = G.mode === 'car' && activeCar ? activeCar.x : player.x;
    const pz = G.mode === 'car' && activeCar ? activeCar.z : player.z;
    for (const c of cars) { if (!c.g.visible) continue; const d = Math.hypot(c.x - px, c.z - pz); if (!best || d < best.d) best = { x: c.x, z: c.z, d }; }
    return { x: camera.position.x, y: camera.position.y, z: camera.position.z, inB: insideBuildingH(camera.position.x, camera.position.z, camera.position.y), px, pz, near: best };
  },
  radioStep, radioPower, radioPlay, radioStop, setStars, crime, busted, wasted, damageCar, missionStart: (id) => missionStart(MIS.list.find((m) => m.id === id)), missionEnd, addMoney,
  traffic: () => ({ agents: TR.agents.length, pool: TR.pool.length, peds: TR.peds.filter((p) => p.on).length, pedList: TR.peds.filter((p) => p.on).map((p) => ({ x: p.x, z: p.z, h: p.h, look: p.look, fit: p.fit })), nodes: TR.nodes.length, edges: TR.edges.length, zebras: W.zebras || 0, moved: TR.stats.moved, spawned: TR.stats.spawned, cars: cars.length,
    list: TR.agents.map((c) => ({ x: c.x, z: c.z, h: c.h, v: c.ai ? c.ai.v : 0, e: c.ai ? c.ai.e : -1, mode: c.ai ? c.ai.mode : '' })) }),
  police: () => ({ stars: WANT.stars, seen: WANT.seen, evade: WANT.evade, chasers: chasers().length, blocks: POL.blocks.length, foot: POL.foot.filter((p) => p.on).length, bustT: POL.bustT, busted: G.bustedN || 0, footList: POL.foot.filter((p) => p.on).map((p) => Math.round(Math.hypot(p.x - focusXZ().x, p.z - focusXZ().z))), wasted: G.wastedN || 0, cut: !!G.cut, events: POL.events.slice(-10), siren: G.sirenVol || 0,
    list: POL.cars.filter((c) => c.g.visible).map((c) => ({ x: c.x, z: c.z, sp: c.speed, chase: !!c.pai, block: !!c.block, patrol: !!c.patrol, wrecked: !!c.wrecked, hp: Math.round(c.hp || 0), h: c.h, pi: c.pai ? c.pai.pi : -1, pl: c.pai && c.pai.path ? c.pai.path.length / 2 : 0, rev: c.pai ? +(c.pai.rev || 0).toFixed(1) : 0, srch: !!(c.pai && c.pai.search) })) }),
  mission: () => ({ active: MIS.active ? MIS.active.id : null, stage: MIS.active ? MIS.active.stage : null, obj: MIS.active ? MIS.active.obj : '', t: MIS.active ? MIS.active.t : null, target: MIS.active && MIS.active.target ? { x: MIS.active.target.x, z: MIS.active.target.z } : null, events: MIS.events.slice(-10), done: { ...SAVE.done }, money: SAVE.money, dialog: MIS.dlg ? MIS.dlg.id : null,
    givers: MIS.list.map((m) => ({ id: m.id, x: m.gx, z: m.gz, open: giverOpen(m) })), car: MIS.active && MIS.active.car ? { x: MIS.active.car.x, z: MIS.active.car.z } : null, cps: MIS.active && MIS.active.cps ? MIS.active.cps.length : 0, i: MIS.active ? MIS.active.i : 0 }),
  path: (ax, az, bx, bz) => { const p = astar(nearestNode(ax, az), nearestNode(bx, bz)); return p ? pathPoints(p) : null; },
  touchStats: () => ({ ...TP.stats, ptrs: TP.ptrs.size, joy: !!TP.joy, look: !!TP.look, jx: G.touch.jx, jy: G.touch.jy, gas: !!G.touch.gas, brake: !!G.touch.brake, hand: !!G.touch.hand, steer: activeCar ? activeCar.steer : 0 }), touchReset,
  dialogAction, dialogClose, shopBuy, shopClose, places: PLACES, money: () => SAVE.money,
  navState: () => ({ on: NAV.on, status: NAV.status, note: NAV.note, instr: NAV.instr, dist: NAV.dist, src: NAV.src, n: NAV.pts ? NAV.pts.length / 2 : 0, plans: NAV.plans, tail: !!NAV.tail, cls: NAV.cls, name: NAV.name, dx: NAV.dx, dz: NAV.dz, sig: NAV.sig, bridges: NAV.bridges || 0, comps: NAV.comps || 0 }),
  navSet: (x, z, name, opt) => navSet(x, z, name, opt || { src: 'place' }), navClear, navAudit, openJournal, closeJournal, openTutor, closeTutor, missionCancel,
  storyDone: () => storyDoneCount(), save: () => SAVE,
  stats: () => ({ buildings: W.buildings.length, roads: W.roads.length, trees: W.treeCount, chunks: W.chunkCount, calls: G.sceneCalls || renderer.info.render.calls, tris: G.sceneTris || renderer.info.render.triangles, seal: W.sealStats || null, clouds: W.cloudCount || 0, furn: W.furnCount || 0 }),
  garage: () => ({ open: GAR.open ? GAR.open.n : null, tab: GAR.tab, sel: GAR.sel, places: GAR.places.map((p) => ({ n: p.n, x: p.x, z: p.z, h: p.h })), cars: SAVE.garage.cars.map((r) => ({ uid: r.uid, model: r.model, color: r.color, up: { ...r.up }, st: carStats(r) })),
    own: GAR.own ? { uid: GAR.own.own.uid, model: GAR.own.model, x: GAR.own.x, z: GAR.own.z, hp: GAR.own.hp, st: GAR.own.st, nf: GAR.own.nf, inside: GAR.own === activeCar } : null, save: SAVE }),
  garageOpen: (i) => garageOpen(GAR.places[i || 0]), garageClose, garageTab: (t) => { GAR.tab = t; garageRender(); }, buyModel, upgradeCar, paintCar, spawnOwn: (uid, i) => spawnOwn(ownRec(uid), GAR.places[i || 0]), keepStolen, sellCar, storeCurrent, repairActive,
  carStats, impactDamage, carHitEvent, BAL, BAL_OLD, MODELS, UPG, migrateSave, nitroTick, collisionFx, fxq,
  drive: () => ({ drift: { ...DRV.drift }, drifts: DRV.drifts || 0, driftT: DRV.driftT || 0, air: DRV.air, skids: DRV.stats.skids, smoke: DRV.stats.smoke, sparks: DRV.stats.sparks, crunch: DRV.stats.crunch, maxShake: DRV.stats.maxShake, shake: G.shake || 0, slip: DRV.slip || 0, smokeAlive: DRV.smoke.alive, sparkAlive: DRV.sparks.alive,
    eng: { built: !!ENG.built, on: ENG.on, gear: ENG.gear, rpm: ENG.rpm }, pickups: DRV.pick ? DRV.pick.L.map((p) => ({ x: p.x, z: p.z, on: p.on, v: p.v })) : [], car: activeCar ? { vF: activeCar.vFl, vR: activeCar.vRl, hp: activeCar.hp, model: activeCar.model, nitroOn: !!activeCar.nitroOn, nf: activeCar.nf, st: activeCar.st || null, burn: activeCar.burn || 0 } : null, stats: { ...SAVE.stats } }),
  setYaw: (y) => { G.yaw = y; }, setQuality: (q) => { settings.quality = q; applyQuality(); updateVisibility(true); },
});

Object.defineProperties(G, { renderer: { get: () => renderer }, cars: { get: () => cars }, mis: { get: () => MIS }, car: { get: () => activeCar }, player: { get: () => player }, camera: { get: () => camera }, world: { get: () => W }, scene: { get: () => scene }, THREE: { get: () => THREE } });

init().catch((e) => { console.error(e); $('loadtxt').textContent = 'Błąd: ' + e.message; });
