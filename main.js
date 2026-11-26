// GTA TBG (Tarnobrzeg) – open-world browser game on OpenStreetMap data (© OpenStreetMap contributors, ODbL)
import * as THREE from 'three';
import { Vehicle, Vector3, Path, FollowPathBehavior, SeparationBehavior, FleeBehavior, ObstacleAvoidanceBehavior, GameEntity, MeshBVH, acceleratedRaycast, nipplejs } from './vendor/game-libs.js';
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
  const getChunk = (x, z) => { const k = Math.floor(x / CH) + ',' + Math.floor(z / CH); let c = chunks.get(k); if (!c) { c = { walls: new GeoBuf(), roofs: new GeoBuf(), detail: new GeoBuf(), area: new GeoBuf(), road: new GeoBuf(), mark: new GeoBuf(), water: new GeoBuf(), walk: new GeoBuf(), pave: new GeoBuf(), edges: [] }; if (TOON) c.walls.setX(null, -1); chunks.set(k, c); } return c; };
  W.visObjects = [];

  const maxAniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const { tex: winTex, emi: winEmi } = makeWindowTextures(maxAniso);
  const groundTex = makeGroundTexture(maxAniso), areaTex = makeGroundTexture(maxAniso), paveTex = makePaveTexture(maxAniso);
  areaTex.repeat.set(1, 1);
  W.mats = {
    wall: new THREE.MeshLambertMaterial({ vertexColors: true, map: winTex, emissive: 0xffd9a0, emissiveMap: winEmi, emissiveIntensity: 0 }),
    roof: new THREE.MeshLambertMaterial({ vertexColors: true }),
    area: new THREE.MeshLambertMaterial({ vertexColors: true, map: areaTex, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 }),
    pave: new THREE.MeshLambertMaterial({ vertexColors: true, map: paveTex, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -3 }),
    water: new THREE.MeshPhongMaterial({ color: 0x3f7398, specular: 0x9fc4e6, shininess: 90, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 }),
    road: new THREE.MeshLambertMaterial({ vertexColors: true, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -6 }),
    mark: new THREE.MeshLambertMaterial({ vertexColors: true, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -8 }),
    ground: new THREE.MeshLambertMaterial({ color: 0x93ad6e, map: groundTex }),
  };
  if (TOON) {
    W.mats = {
      wall: makeFacadeMat(maxAniso),
      roof: mkMat({ vertexColors: true }),
      balcony: mkMat({ vertexColors: true }),
      area: mkMat({ vertexColors: true, map: areaTex, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 }),
      pave: mkMat({ vertexColors: true, map: paveTex, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -3 }),
      water: mkMat({ color: 0x47a6e0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 }),
      walk: mkMat({ vertexColors: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 }),
      road: mkMat({ vertexColors: true, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -6 }),
      mark: mkMat({ vertexColors: true, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -8 }),
      ground: mkMat({ color: 0xa3d65c, map: groundTex }),
    };
  }

  // v3: ground is a subdivided plane that follows the camera (a single 60 km quad lost depth precision vs. roads near the camera)
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(12000, 12000, 96, 96), W.mats.ground);
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground); W.ground = ground;

  // ---- areas (landuse / parks / forests)
  const AREA_COL = TOON ? { grass: '#a6da5c', park: '#98d454', forest: '#7cbd4a', farmland: '#dcd27e', residential: '#b0dc66', industrial: '#cdc8bf', cemetery: '#94c560', pitch: '#7fc94b', sand: '#efdc9c', plaza: '#e3ddd0', parking: '#a2a3a6', wetland: '#8fc47a', scrub: '#8cc452', commercial: '#d8d1c6', garden: '#a2d85e', allotments: '#b2d968', orchard: '#9fd05a', railway: '#c4bcae' } : { grass: '#8dbb68', park: '#79b257', forest: '#4b8139', farmland: '#c8bd78', residential: '#aab394', industrial: '#b1aaa4', cemetery: '#779a64', pitch: '#4d9846', sand: '#d6c695', plaza: '#cbc2b1', parking: '#8c8c8a', wetland: '#7c9a70', scrub: '#789953', commercial: '#bcb3ab', garden: '#84b765', allotments: '#9cbc69', orchard: '#8fb45d', railway: '#a49c92' };
  const PAVED = new Set(['plaza', 'parking']);
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
    const paved = PAVED.has(kind);
    const { pts, faces } = triangulate(ring, holes);
    for (const f of faces) {
      const A = pts[f[0]], B = pts[f[1]], C = pts[f[2]];
      const ch = getChunk((A.x + B.x + C.x) / 3, (A.y + B.y + C.y) / 3);
      ch.area.tri(A.x, y, A.y, B.x, y, B.y, C.x, y, C.y, col,
        [A.x / 6, A.y / 6, B.x / 6, B.y / 6, C.x / 6, C.y / 6], 0, 1, 0);
      if (paved) ch.pave.tri(A.x, y + 0.004, A.y, B.x, y + 0.004, B.y, C.x, y + 0.004, C.y, col,
        [A.x / 2.4, A.y / 2.4, B.x / 2.4, B.y / 2.4, C.x / 2.4, C.y / 2.4], 0, 1, 0);
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
    W.waterways.push({ width, pts, name: w[1] >= 0 ? data.names[w[1]] : '' });
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
    if (rec.bridge) paintSpan(pts, width, c2, getChunk, rec);
    else if (!trailInZone(type, pts)) ribbon(pts, width, y, c2, (x, z) => getChunk(x, z).road, true); // off-road trails are draped over the terrain later
    for (let i = 0; i < pts.length - 2; i += 2) W.roadGrid.add(pts[i], pts[i + 1], pts[i + 2], pts[i + 3], W.roads.length - 1);
    if (!rec.bridge && (type === 'secondary' || type === 'tertiary' || type === 'primary' || type === 'trunk')) {
      if (!rec.oneway) dashes(pts, 0.14, 3, 6, y + 0.02, white, (x, z) => getChunk(x, z).mark, 0);
      if (type !== 'tertiary') { dashes(pts, 0.12, 1e9, 0, y + 0.02, edge, (x, z) => getChunk(x, z).mark, width / 2 - 0.45); dashes(pts, 0.12, 1e9, 0, y + 0.02, edge, (x, z) => getChunk(x, z).mark, -(width / 2 - 0.45)); }
    }
    if (TOON && SIDEWALK.has(type) && !rec.bridge && !trailInZone(type, pts)) {
      const wf = (x, z) => getChunk(x, z).walk; const yw = 0.1;
      for (const sg of [1, -1]) { dashes(pts, 2.4, 1e9, 0, yw, walkCol, wf, sg * (width / 2 + 1.45)); dashes(pts, 0.4, 1e9, 0, yw + 0.002, curbCol, wf, sg * (width / 2 + 0.15)); }
    }
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
    paintRailSpan(pts, getChunk);
  });
  if (W.spanGrid) W.spanGrid.finish();

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
  buildWallAO(scene);

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
    if (c.pave.count) addMesh(c.pave.toGeometry(), W.mats.pave, { bias: 190 });
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
  if (typeof indexWater === 'function') indexWater();
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

// Kontaktowe zaciemnienie gruntu przy elewacjach: pas ciemny u ściany, zanikający na 1,25 m.
// Rysowane tuż nad chodnikiem (0,108), więc drogi (0,13) je przykrywają, a nie odwrotnie.
function buildWallAO(scene) {
  const P = [], C = [];
  const Y = 0.108, REACH = 1.25, A0 = 0.42;
  const near = (x, z) => Math.hypot(x + 7, z - 10) < 800 || Math.hypot(x - 1216, z + 49) < 650;
  const put = (x, z, a) => { P.push(x, Y, z); C.push(0.16, 0.13, 0.10, a); };
  let n = 0;
  for (const b of W.buildings) {
    if (n >= 1600) break;
    const ring = b.ring;
    if (!ring || ring.length < 8 || b.h < 2.4 || b.kay || !near(b.cx, b.cz)) continue;
    const pos = ringArea(ring) > 0, m = ring.length / 2;
    for (let i = 0; i < m; i++) {
      const j = (i + 1) % m;
      const x1 = ring[i * 2], z1 = ring[i * 2 + 1], x2 = ring[j * 2], z2 = ring[j * 2 + 1];
      const len = Math.hypot(x2 - x1, z2 - z1);
      if (len < 0.6) continue;
      let nx = (z2 - z1) / len, nz = -(x2 - x1) / len;
      if (!pos) { nx = -nx; nz = -nz; }
      const ax = x1 + nx * 0.03, az = z1 + nz * 0.03, bx = x2 + nx * 0.03, bz = z2 + nz * 0.03;
      const cx = ax + nx * REACH, cz = az + nz * REACH, dx = bx + nx * REACH, dz = bz + nz * REACH;
      if (inWater(ax, az)) continue;
      put(ax, az, A0); put(bx, bz, A0); put(dx, dz, 0);
      put(ax, az, A0); put(dx, dz, 0); put(cx, cz, 0);
    }
    n++;
  }
  if (!P.length) return;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(C, 4));
  geo.computeBoundingSphere();
  const mat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, fog: true, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -12 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = 1; mesh.matrixAutoUpdate = false;
  scene.add(mesh); W.wallAO = mesh;
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
// BRIDGES: własny pomost (pokład + poręcze) na drogach i torach z OSM bridge=yes albo tam, gdzie tory idą przez głęboką wodę.
const SPAN_DECK = new THREE.Color('#3c3e43');
const SPAN_RAIL = new THREE.Color('#2a211c');
const SPAN_CAP = new THREE.Color('#f4f1ea');
function spanHeight(u, total) {
  const deck = total > 80 ? 3.3 : total > 28 ? 2.35 : 1.55;
  const ramp = Math.min(16, Math.max(4, total * 0.22));
  let k = 1;
  if (u < ramp) k = u / ramp;
  else if (u > total - ramp) k = (total - u) / ramp;
  return deck * Math.max(0, Math.min(1, k));
}
function spanSamples(pts) {
  const n = pts.length / 2; const out = [pts[0], pts[1]]; const step = 8; let acc = 0;
  for (let i = 0; i < n - 1; i++) {
    const x1 = pts[i * 2], z1 = pts[i * 2 + 1], x2 = pts[i * 2 + 2], z2 = pts[i * 2 + 3];
    const len = Math.hypot(x2 - x1, z2 - z1); if (len < 0.05) continue;
    let d = step - (acc % step); if (acc % step < 0.05) d = step;
    while (d < len - 0.4) { const t = d / len; out.push(x1 + (x2 - x1) * t, z1 + (z2 - z1) * t); d += step; }
    acc += len; out.push(x2, z2);
  }
  return out;
}
function paintSpan(pts, width, color, getChunk, rec) {
  pts = spanSamples(pts);
  const n = pts.length / 2; if (n < 2) return;
  const cum = [0];
  for (let i = 1; i < n; i++) cum.push(cum[i - 1] + Math.hypot(pts[i * 2] - pts[i * 2 - 2], pts[i * 2 + 1] - pts[i * 2 - 1]));
  const total = cum[n - 1]; if (total < 1.2) return;
  if (!W.spanGrid) { W.spanGrid = new SegGrid(28); W.spans = []; }
  const hw = Math.max(width * 0.5, 1.15);
  const deckCol = color || SPAN_DECK;
  let mx = 0, mz = 0;
  for (let i = 0; i < n - 1; i++) {
    const x1 = pts[i * 2], z1 = pts[i * 2 + 1], x2 = pts[i * 2 + 2], z2 = pts[i * 2 + 3];
    const len = cum[i + 1] - cum[i]; if (len < 0.15) continue;
    const dx = (x2 - x1) / len, dz = (z2 - z1) / len, nx = -dz, nz = dx;
    const y1 = spanHeight(cum[i], total), y2 = spanHeight(cum[i + 1], total);
    const ch = getChunk((x1 + x2) / 2, (z1 + z2) / 2);
    const slab = (y, dy, col, ny) => {
      const ax = x1 + nx * hw, az = z1 + nz * hw, bx = x2 + nx * hw, bz = z2 + nz * hw;
      const cx = x2 - nx * hw, cz = z2 - nz * hw, dx2 = x1 - nx * hw, dz2 = z1 - nz * hw;
      ch.road.tri(ax, y + dy, az, bx, y2 + dy, bz, cx, y2 + dy, cz, col, null, 0, ny, 0);
      ch.road.tri(ax, y + dy, az, cx, y2 + dy, cz, dx2, y + dy, dz2, col, null, 0, ny, 0);
    };
    slab(y1, 0.16, deckCol, 1);
    slab(y1, -0.08, SPAN_DECK, -1);
    for (const side of [1, -1]) {
      const o = hw + 0.08;
      const ax = x1 + nx * o * side, az = z1 + nz * o * side, bx = x2 + nx * o * side, bz = z2 + nz * o * side;
      const h1 = y1 + 0.95, h2 = y2 + 0.95;
      ch.walls.tri(ax, y1 + 0.2, az, bx, y2 + 0.2, bz, bx, h2, bz, SPAN_RAIL, null, nx * side, 0, nz * side);
      ch.walls.tri(ax, y1 + 0.2, az, bx, h2, bz, ax, h1, az, SPAN_RAIL, null, nx * side, 0, nz * side);
      ch.walls.tri(ax, h1, az, bx, h2, bz, bx, h2 + 0.12, bz, SPAN_CAP, null, 0, 1, 0);
      ch.walls.tri(ax, h1, az, bx, h2 + 0.12, bz, ax, h1 + 0.12, az, SPAN_CAP, null, 0, 1, 0);
    }
    W.spanGrid.add(x1, z1, x2, z2, { hw: hw + 0.35, y0: y1 + 0.16, y1: y2 + 0.16 });
    mx += (x1 + x2) * 0.5; mz += (z1 + z2) * 0.5;
  }
  const segN = Math.max(1, n - 1);
  W.spans.push({ name: (rec && rec.name) || (rec && rec.type) || 'most', type: (rec && rec.type) || 'road', len: Math.round(total), x: mx / segN, z: mz / segN, deck: spanHeight(total * 0.5, total) });
}
function paintRailSpan(pts, getChunk) {
  const n = pts.length / 2; if (n < 2) return;
  const keep = [];
  for (let i = 0; i < n - 1; i++) {
    const x = (pts[i * 2] + pts[i * 2 + 2]) / 2, z = (pts[i * 2 + 1] + pts[i * 2 + 3]) / 2;
    if (railNeedsDeck(x, z)) keep.push(i);
  }
  if (!keep.length) return;
  // group consecutive wet segments into one span
  let run = [keep[0]];
  const flush = () => {
    if (!run.length) return;
    const a = run[0], b = run[run.length - 1] + 1;
    const sub = pts.slice(a * 2, b * 2 + 2);
    paintSpan(sub, 3.4, new THREE.Color('#6a6258'), getChunk, { name: 'tory', type: 'rail' });
    run = [];
  };
  for (let k = 1; k < keep.length; k++) {
    if (keep[k] === run[run.length - 1] + 1) run.push(keep[k]);
    else { flush(); run = [keep[k]]; }
  }
  flush();
}
function railNeedsDeck(x, z) {
  for (const w of W.water) if (pointInRing(x, z, w.ring) && !w.holes.some((h) => pointInRing(x, z, h))) return true;
  for (const w of W.waterways) {
    if (w.width < 6) continue;
    const p = w.pts;
    for (let i = 0; i < p.length - 2; i += 2) {
      closestOnSeg(x, z, p[i], p[i + 1], p[i + 2], p[i + 3], tmpC);
      if (Math.hypot(tmpC.x - x, tmpC.z - z) < w.width * 0.32) return true;
    }
  }
  return false;
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
// Grunt: delikatna faktura (plamy + drobny szum), mnożona przez kolor pory dnia.
function makeGroundTexture(aniso) {
  const S = 256, c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d'), rnd = mulberry32(4242);
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, S, S);
  for (let i = 0; i < 240; i++) {
    const x = rnd() * S, y = rnd() * S, r = 8 + rnd() * 34;
    const grd = g.createRadialGradient(x, y, 0, x, y, r);
    grd.addColorStop(0, rnd() < 0.5 ? 'rgba(84,102,46,0.16)' : 'rgba(255,255,225,0.14)');
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd; g.beginPath(); g.arc(x, y, r, 0, 6.2832); g.fill();
  }
  for (let i = 0; i < 6000; i++) {
    g.fillStyle = rnd() < 0.5 ? 'rgba(64,84,36,0.10)' : 'rgba(255,255,238,0.10)';
    g.fillRect(rnd() * S, rnd() * S, 1 + rnd() * 2, 1 + rnd() * 2);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = aniso; t.repeat.set(1800, 1800); t.needsUpdate = true;
  return t;
}
// Kostka brukowa: rzędy kamieni z fugami, UV liczone w metrach (1 kafel = 2,4 m).
function makePaveTexture(aniso) {
  const S = 256, N = 8, cs = S / N, c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d'), rnd = mulberry32(777);
  g.fillStyle = '#8b877e'; g.fillRect(0, 0, S, S);
  const stone = (x, y) => {
    const l = 0.88 + rnd() * 0.22, b = Math.round(226 * l);
    g.fillStyle = `rgb(${b},${Math.round(b * 0.99)},${Math.round(b * 0.96)})`;
    g.beginPath();
    if (g.roundRect) g.roundRect(x + 1.7, y + 1.7, cs - 3.4, cs - 3.4, 3); else g.rect(x + 1.7, y + 1.7, cs - 3.4, cs - 3.4);
    g.fill();
    g.fillStyle = 'rgba(255,255,255,0.22)'; g.fillRect(x + 2.4, y + 2.4, cs - 4.8, 1.4);
    g.fillStyle = 'rgba(0,0,0,0.08)'; g.fillRect(x + 2.4, y + cs - 3.8, cs - 4.8, 1.4);
  };
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const off = (j % 2) * cs * 0.5;
    const x = (i * cs + off) % S, y = j * cs;
    stone(x, y);
    if (x + cs > S) stone(x - S, y);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = aniso;
  return t;
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
  W.treeColliders = W.treeGrid.meta.length;
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
  buildLampLight(scene);
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
  W.lamps = [];
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
        if (kind === 'lamp') W.lamps.push([x, z]);
        n++;
      }
    }
  }
  // Osobna siatka latarni wzdłuż ulic w centrum – bez niej noc nie ma rytmu świateł.
  const lampCap = q === 'low' ? 190 : (q === 'high' ? 520 : 380);
  const coreDist = (x, z) => Math.min(Math.hypot(x + 7, z - 10), Math.hypot(x - 1216, z + 49));
  const nearLamp = (x, z) => { for (const l of W.lamps) if ((l[0] - x) ** 2 + (l[1] - z) ** 2 < 144) return true; return false; };
  let lamps = buckets.lamp.length;
  // najpierw najbliższe centrum, żeby limit nie wyczerpał się na obrzeżach
  const order = W.roads.map((r, i) => i).filter((i) => !W.roads[i].bridge && keep.has(W.roads[i].type))
    .sort((a, b) => coreDist(W.roads[a].pts[0], W.roads[a].pts[1]) - coreDist(W.roads[b].pts[0], W.roads[b].pts[1]));
  for (const ri of order) {
    if (lamps >= lampCap) break;
    const r = W.roads[ri];
    const pts = r.pts;
    for (let i = 0; i < pts.length - 2 && lamps < lampCap; i += 2) {
      const x1 = pts[i], z1 = pts[i + 1], x2 = pts[i + 2], z2 = pts[i + 3];
      const len = Math.hypot(x2 - x1, z2 - z1); if (len < 10) continue;
      const dx = (x2 - x1) / len, dz = (z2 - z1) / len;
      const step = coreDist(x1, z1) < 300 ? 22 : 38;
      for (let t = 5; t < len - 5 && lamps < lampCap; t += step) {
        const side = (Math.floor(t / step) & 1) ? 1 : -1;
        const x = x1 + dx * t - dz * side * (r.width / 2 + 2.4);
        const z = z1 + dz * t + dx * side * (r.width / 2 + 2.4);
        if (coreDist(x, z) > 740) continue;
        if (nearLamp(x, z) || insideBuilding(x, z, 0.7) || inWater(x, z) || nearRoad(x, z, 0.3) || nearMark(x, z)) continue;
        buckets.lamp.push([x, z, Math.atan2(dx, dz)]);
        W.props.push({ x, z, r: rad.lamp });
        W.lamps.push([x, z]);
        lamps++;
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
// Nocne światło ulic: ciepła plama na jezdni pod każdą latarnią + halo w kloszu.
// Jedna instancja na latarnię, widoczne tylko w nocy (przełącza applyTime).
function makePoolTexture() {
  const S = 128, c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  grd.addColorStop(0, 'rgba(255,232,182,0.85)');
  grd.addColorStop(0.42, 'rgba(255,206,132,0.40)');
  grd.addColorStop(1, 'rgba(255,188,110,0)');
  g.fillStyle = grd; g.fillRect(0, 0, S, S);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function buildLampLight(scene) {
  const lamps = W.lamps || [];
  if (!lamps.length) return;
  const R = settings.quality === 'low' ? 8.5 : (settings.quality === 'high' ? 10.5 : 9.5);
  const geo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const mat = new THREE.MeshBasicMaterial({ map: makePoolTexture(), color: 0xffe2b0, transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending, fog: true, polygonOffset: true, polygonOffsetFactor: -8, polygonOffsetUnits: -16 });
  const pools = new THREE.InstancedMesh(geo, mat, lamps.length);
  const m4 = new THREE.Matrix4();
  lamps.forEach((p, i) => { m4.makeScale(R, 1, R); m4.setPosition(p[0], 0.185, p[1]); pools.setMatrixAt(i, m4); });
  pools.instanceMatrix.needsUpdate = true;
  pools.frustumCulled = false; pools.renderOrder = 3; pools.visible = !!G.night;
  scene.add(pools); W.lampPools = pools;
  const hm = new THREE.MeshBasicMaterial({ color: 0xfff2cf, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
  const heads = new THREE.InstancedMesh(new THREE.SphereGeometry(0.34, 8, 6), hm, lamps.length);
  lamps.forEach((p, i) => { m4.makeScale(1, 1, 1); m4.setPosition(p[0], 3.1, p[1] + 0.04); heads.setMatrixAt(i, m4); });
  heads.instanceMatrix.needsUpdate = true;
  heads.frustumCulled = false; heads.renderOrder = 4; heads.visible = !!G.night;
  scene.add(heads); W.lampHeads = heads;
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
(function () {
  function b64(s) {
    const bin = atob(s), n = bin.length, a = new Uint8Array(n);
    for (let i = 0; i < n; i++) a[i] = bin.charCodeAt(i);
    return a;
  }
  function M(name, n, ni, ax, ay, az, qs, spanX, spanZ, p64, n64, u64, i64) {
    const pb = b64(p64), nb = b64(n64), ub = b64(u64), ib = b64(i64);
    const pos = new Float32Array(n * 3), nrm = new Float32Array(n * 3), uv = new Float32Array(n * 2);
    const pv = new Uint16Array(pb.buffer, pb.byteOffset, n * 3);
    const nv = new Int8Array(nb.buffer, nb.byteOffset, n * 3);
    const uvb = new Uint16Array(ub.buffer, ub.byteOffset, n * 2);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = ax + pv[i * 3] * qs; pos[i * 3 + 1] = ay + pv[i * 3 + 1] * qs; pos[i * 3 + 2] = az + pv[i * 3 + 2] * qs;
      nrm[i * 3] = nv[i * 3] / 127; nrm[i * 3 + 1] = nv[i * 3 + 1] / 127; nrm[i * 3 + 2] = nv[i * 3 + 2] / 127;
      uv[i * 2] = uvb[i * 2] / 65535; uv[i * 2 + 1] = uvb[i * 2 + 1] / 65535;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setIndex(new THREE.BufferAttribute(new Uint16Array(ib.buffer, ib.byteOffset, ni), 1));
    g.computeBoundingSphere();
    KAY[name] = { geo: g, spanX, spanZ };
  }
  M("A",819,1305,-0.60337,0.0,-0.725,2.37e-05,1.2067,1.45,"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jDbam23PjDbam23PjDbam23PYRELuuDBYRFatofGYRFatofGYRFatuDByzELuuDBYRELuofGYRELuofGyzFatuDByzELuofGyzELuofGyzFatofGyzFatofGIi8duNnEIi8duNnEChQduNnEChQduNnEGlZopdnEGlaU1tnEMXGU1tnEMXFopdnEr06x3PG+r06x3PG+r04/1ovSr04/1ovSr04/1ovSr04/1vG+r04/1vG+m3ix3PG+m3ix3PG+r06x3IvSr06x3IvSr06x3IvSm3g/1vG+m3g/1vG+m3ix3IvSm3ix3IvSm3ix3IvSm3g/1ovSm3g/1ovSm3g/1ovSdG/f2Y/AdG8+pVbIdG8+pVbIdG8+pY/AdG/f2VbIdG/f2VbIO3Xf2VbIO3U+pVbIEFI+pVbI11ff2Y/AEFLf2VbI11c+pY/A11ff2VbI11ff2VbI11c+pVbI11c+pVbIr050puC5r050puC5r07am+C5r07am+C5r07am+C5m3h0puC5m3h0puC5r050pnjVr050pnjVr050pnjVm3jam+C5m3jam+C5m3jam+C5m3h0pnjVm3h0pnjVm3h0pnjVr07am23Pr07am23Pr07am23Pr07loXjVr07loXjVr07loXjVr07loXjVm3jloXjVm3jloXjVm3jloXjVm3jloXjVm3jam23Pm3jam23Pm3jam23PcFOPyuDBcFPdxofGcFPdxofGcFPdxuDB23OPyuDBcFOPyofGcFOPyofG23PdxuDB23OPyofG23OPyofG23PdxofG23PdxofGMXGhyNnEMXGhyNnEGlahyNnEGlahyNnEKZiU1tnEQLOU1tnEvpCx3PG+vpCx3PG+vpA/1ovSvpA/1ovSvpA/1ovSvpA/1vG+vpA/1vG+q7qx3PG+q7qx3PG+vpCx3IvSvpCx3IvSvpCx3IvSq7o/1vG+q7o/1vG+q7qx3IvSq7qx3IvSq7qx3IvSq7o/1ovSq7o/1ovSq7o/1ovSg7Hf2Y/Ag7E+pVbIg7E+pVbIg7E+pY/Ag7Hf2VbIg7Hf2VbISrff2VbISrc+pVbIH5Q+pVbI5pnf2Y/AH5Tf2VbI5pk+pY/A5pnf2VbI5pnf2VbI5pk+pVbI5pk+pVbIvpB0puC5vpB0puC5vpDam+C5vpDam+C5q7p0puC5q7p0puC5vpB0pnjVvpB0pnjVvpB0pnjVq7ram+C5q7ram+C5q7ram+C5q7p0pnjVq7p0pnjVq7p0pnjVvpDam23PvpDam23PvpDam23PvpDloXjVvpDloXjVvpDloXjVq7rloXjVq7rloXjVq7rloXjVq7rloXjVq7ram23Pq7ram23Pq7ram23PQLOlotnEKZilotnEjwB677LWjwB677LWjwB677LWjwD+/7LWjwD+/7LWjwD+/7LWjwB67wAAjwB67wAAjwB67wAAjwD+/wAAjwD+/wAAjwD+/wAAvMZ677LWvMZ677LWvMZ677LWvMb+/7LWvMb+/7LWvMb+/7LWvMZ67wAAvMZ67wAAvMZ67wAAvMb+/wAAvMb+/wAAvMb+/wAA+bX+/8MQ+bX+/8MQ+bX+/8MQUhH+/8MQUhH+/8MQUhH+/8MQUhH+/+7FUhH+/+7FUhH+/+7F+bX+/+7F+bX+/+7F+bX+/+7FiBXU+PkUiBXU+PkUiBXU+PkUw7HU+PkUw7HU+PkUw7HU+PkUw7HU+LnBw7HU+LnBw7HU+LnBiBXU+LnBiBXU+LnBiBXU+LnBjwDge7LWjwDge7LWjwDge7LWjwBjjLLWjwBjjLLWjwBjjLLWjwDgewAAjwDgewAAjwDgewAAjwBjjAAAjwBjjAAAjwBjjAAAvMbge7LWvMbge7LWvMbge7LWvMZjjLLWvMZjjLLWvMZjjLLWvMbgewAAvMbgewAAvMbgewAAvMZjjAAAvMZjjAAAvMZjjAAAjwDge0IIjwDge0IIjwDge3DOjwDge3DOjwBjjHDOjwBjjHDOjwBjjEIIjwBjjEIIvMbge3DOvMbge3DOvMbge0IIvMbge0IIvMZjjEIIvMZjjEIIvMZjjHDOvMZjjHDOS8fOILIzS8f/J7IzS8f/JxtCS8fOIBtCS8ePLHg+S8fAM3g+S8fAM+FMS8ePLOFM6T8nHyYH6T9ZJiYHgTFZJiYHgTEnHyYHIzXoKiYHIzUaMiYHuiYaMiYHuiboKiYHAKPJsyYHAKP7uiYHmJT7uiYHmJTJsyYHOpiKvyYHOpi8xiYH0Ym8xiYH0YmKvyYHAAAxwT5lAABjyD5lAABjyKZzAAAxwaZzAABwtQRwAACivARwAACivGx+AABwtWx+vMYhhEIIvMYhhEIIvMYhhEIIvMYhhEIIjgAhhEIIjgAhhEIIjgAhhEIIjgAhhEIIbmVqMQLHMmClPALH7KNqMQLHKKmlPALHyZddOALHkXFdOALHrYTLOgLHkXEPRwLHyZcPRwLHrYR+SQLHjgAOaHfvjgAOaHfvjgAOaHfvvMYOaHfvvMYOaHfvvMYOaHfvvMbWe3DOvMbWe3DOjgDWe3DOjgDWe3DOliEOaHfvliEOaHfvliEOaHfvliEOaHfvnkIOaHfvnkIOaHfvnkIOaHfvnkIOaHfvpWMOaHfvpWMOaHfvpWMOaHfvpWMOaHfvrYQOaHfvrYQOaHfvrYQOaHfvrYQOaHfvtaUOaHfvtaUOaHfvtaUOaHfvtaUOaHfvtaXWe3DOtaXWe3DOrYTWe3DOrYTWe3DOpWPWe3DOpWPWe3DOnkLWe3DOnkLWe3DOliHWe3DOliHWe3DOvMYFaHDOjgAFaHDOjgDMX3fvjgDMX3fvvMbMX3fvvMbMX3fvliHMX3fvliHMX3fvnkLMX3fvnkLMX3fvpWPMX3fvpWPMX3fvrYTMX3fvrYTMX3fvtaXMX3fvtaXMX3fvvMbDX3DOjgDDX3DO","gQAAAACBfwAAAACBfwAAAAB/gQAAAAB/AAB/fwAAAACBfwAAAAB/gQAAAAB/gQAAAACBAAB/AAB/fwAAAAB/fwAAAAB/gQAAAAB/gQAAAAB/AAB/AAB/AAB/AAB/AAB/gQAAAH8AAAB/gQAAAIEAAAB/AIEAfwAAAAB/AH8AfwAAAAB/gQAAAH8AAAB/gQAAAIEAAAB/AIEAfwAAAAB/AH8AfwAAAAB/gQAAAH8AAAB/gQAAAIEAAAB/gQAAAH8AAAB/gQAAAIEAAAB/AIEAfwAAAAB/AH8AfwAAAAB/AIEAfwAAAAB/AH8AfwAAAAB/gQAAAH8AAAB/gQAAAIEAAAB/AIEAfwAAAAB/AH8AfwAAgQAAAH8AAH8AfwAAgQAAAH8AAH8AfwAAgQAAAIEAgQAAAH8AAH8AfwAAAIEAfwAAgQAAAIEAAIEAfwAAAH8AfwAAgQAAAIEAgQAAAH8AgQAAAIEAAIEAfwAAAIEAfwAAgQAAAIEAgQAAAH8AAH8AfwAAAIEAfwAAAAB/AAB/AAB/AAB/AH8AgQAAgQAAAAB/AIEAgQAAAIEAAH8AfwAAAH8AgQAAAAB/fwAAAIEAAH8AAAB/fwAAAAB/fwAAAIEAgQAAgQAAAAB/gQAAgQAAAAB/AAB/AAB/AAB/fwAAAAB/fwAAAAB/fwAAAAB/fwAAAH8AgQAAgQAAAH8AfwAAAH8AgQAAAAB/fwAAAH8AAAB/fwAAgQAAAAB/AAB/fwAAAH8AAAB/AIEAAIEAAH8AAH8AAAB/AIEAAH8AAAB/AAB/AIEAAAB/AAB/AAB/AAB/gQAAgQAAAAB/gQAAgQAAAAB/AAB/AAB/AAB/fwAAAAB/fwAAAAB/fwAAAAB/fwAAAAB/AAB/AAB/AAB/AH8AAAB/AH8AAH8AAAB/AH8AAAB/AAB/pqYAt7dJAIEAAKZapgBaAAB/t7dJAKZagQAApgBapqYAt7dJt0lJAFpapgBaAAB/ploAt0lJAFpaAH8AploAt0lJgQAApgBapqYAt7e3AIEAAKamgQAApgCmpqYAt7e3pgCmt7e3AKamploAt0m3AFqmAH8At0m3AFqmpgCmploAt0m3gQAApgCmAIEAAKZaSbdJWqYAWgBafwAASbdJWqYAAAB/WgBaAKZaSbdJAFpaAH8ASUlJWloAAFpaSUlJAAB/WgBaSUlJWloAWgBafwAAAIEAAKamSbe3WqYAWgCmAKamSbe3WgCmfwAASbe3WqYAAFqmAH8ASUm3WloASUm3WloAWgCmfwAAAFqmSUm3WgCmAAB/AH8AgQAAgQAAAAB/AIEAgQAAAIEAAH8AgQAAAAB/AAB/fwAAAAB/fwAAAAB/fwAAAAB/fwAAAH8AgQAAgQAAAIEAAH8AgQAAAAB/gQAAAAB/AIEAAAB/AAB/AH8AfwAAfwAAAIEAAH8AAAB/fwAAAAB/fwAAAIEAgQAAgQAAAAB/gQAAgQAAAAB/AAB/AAB/AH8AfwAAfwAAAIEAAH8AAAB/fwAAAAB/fwAAAIEAAAB/AAB/AAB/AAB/AAB/AH8AgQAAgQAAAAB/AIEAgQAAAIEAAH8AfwAAAH8AgQAAAAB/fwAAAIEAAH8AAAB/fwAAAAB/fwAAAIEAgQAAgQAAAAB/gQAAgQAAAAB/AAB/AAB/AAB/fwAAAAB/fwAAAAB/fwAAAAB/fwAAAH8AgQAAgQAAgQAAAIEAAH8AfwAAAH8AgQAAAAB/fwAAfwAAAIEAAH8AAAB/fwAAgQAAAIEAAKZagQAAgQAAAAB/AKZaAAB/fwAAfwAAAKZafwAAAIEAAKZaAH8AAAB/AIEAAIEAAH8AAH8AAAB/AIEAAH8AAAB/AAB/AIEAAAB/AAB/AAB/AAB/AAB/AAB/AAB/AAB/AH8AgQAAgQAAAAB/AIEAgQAAAIEAAH8AfwAAAH8AgQAAAAB/fwAAAIEAAH8AAAB/fwAAAAB/fwAAAIEAgQAAgQAAAAB/gQAAgQAAAAB/AAB/AAB/AAB/fwAAAAB/fwAAAAB/fwAAAAB/fwAAAH8AgQAAgQAAgQAAAIEAAH8AfwAAAH8AgQAAAAB/fwAAfwAAAIEAAH8AAAB/fwAAgQAAAIEAAKZagQAAgQAAAAB/AKZaAAB/fwAAfwAAAKZafwAAAIEAAKZaAH8AAAB/AIEAAIEAAH8AAH8AAAB/AIEAAH8AAAB/AAB/AIEAAAB/AAB/AAB/AAB/AAB/AAB/AH8AgQAAgQAAAAB/AIEAgQAAAIEAAH8AfwAAAH8AgQAAAAB/fwAAAIEAAH8AAAB/fwAAAAB/fwAAAIEAgQAAgQAAAAB/gQAAgQAAAAB/AAB/AAB/AAB/fwAAAAB/fwAAAAB/fwAAAAB/fwAAAH8AgQAAgQAAAIEAAH8AfwAAAH8A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HUNgJB1DYCQdQ08pHUNPKR1DTzEdQ2AcHUNgJB1DYCTHTU8px01PKcdNTzHHTWAcx01gJMdNYCTiVE8p4lRPKeJUTzHiVGAc4lRgJOJUYCQdQ08pHUNPMR1DTykdQ08xHUNgHB1DYCQdQ2AcHUNgJMdNTynHTU8x4lRPKeJUTzHiVGAc4lRgJMdNYBzHTWAkxGI/qMRiFqA4ZRagOGU/qMdiQ6jHYhqgO2UaoDtlQ6jEYo+SxGJmijhlZoo4ZY+Sx2KTksdiaoo7ZWqKO2WTknxFI0x8RftDT0f7Q09HI0x/RSdMf0X/Q1JH/0NSRydMUkfXYVJHr1l/Ra9Zf0XXYU9H02FPR6tZfEWrWXxF02EASBBxAFAQZQBoELEAcBClAEgQcQBQEGUAaBCxAHAQpTykTKuFot+fhLRMqzu23590sfWlTKf1pWCs9KNMp1qZdLFamWCsWJfyLKmf8ixVqvIsq68ON6kfDjdVKg43qy8ONyUMDjcnHPIsJYzyLCec8iypn/IsVaoON6kfDjdVKvIsqZ/yLFWqDjepHw43VSryLKmf8ixVqg43qR8ON1Uq8iypn/IsVaoON6kfDjdVKvIsqZ/yLFWqDjepHw43VSryLCWMDjclDPIsJYwONyUM8iwljA43JQzyLCWMDjclDPIsJYwONyUMDje1L/IstK/yLHqy8izQtw43ezION9E38ix6sg43ezLyLHqyDjd7MvIserION3sy8ix6sg43ezLyLHqyDjd7Mg432jfyLNq3","NQA5AHQANQB0AG8AGgBDAEAAGgBAABwABgAZAO0CBgDtAgAAJwAqAGgAJwBoAGoAFAA3ADQAFAA0AB0AHQBPAFgAHQBYABsAUABTAHsAUAB7AH0AQgBEAHcAQgB3AHYAGwASACIAGwAiAB8AEgAOACUAEgAlACIADgAYACgADgAoACUA7gLqAgMA7gIDAAEAKwBMAAgAKwAIAAUABQAWAC4ABQAuACsAbAAwAEoAbABKAHkAEQAdADQAEQA0ADEAFAAMADoAFAA6ADcADAARADEADAAxADoACAAcAEAACABAAD0AGgAHAEYAGgBGAEMABwAIAD0ABwA9AEYAHgAcAEkAHAAIAEwAHABMAEkAXQBNAC0AXQAtAFwAHQARAFIAHQBSAE8AEQASAFUAEQBVAFIAEgAbAFgAEgBYAFUARQBIAGIARQBiAHgAWQBRAH4AWQB+AH8AOAA7AHEAOABxAHMASwBOAF4ASwBeAHoAVABWAIEAVACBAHwAVwBaAIAAVwCAAIIAIAAjAGMAIABjAGUAKQAhAGYAKQBmAGcARwA/AGAARwBgAGEAMwA2AHAAMwBwAG4ALAAvAGsALABrAFsAPgBBAHUAPgB1AF8AJAAmAGkAJABpAGQAPAAyAG0APABtAHIABAACAOkCBADpAhUAKAAYABsAKAAbAB8AFgAeAC4AHgBJAC4AxwDJAIMAxwCDAIYAlgCSAIoAlgCKAJgAkwCPAJcAkwCXAJkAiACMAIkAiACJAJEAjgCHAJAAjgCQAJUAjQCUAJoAjQCaAIsAoQCgAJ0AoQCdAKIAmwCeAJwAmwCcAJ8ApwClAKMApwCjAKkApgCkAKgApgCoAKoAtQCyALgAtQC4ALkArgCrALAArgCwALQAswCvALYAswC2ALoArACtALcArAC3ALEAxADBALwAxAC8AMUAhQCEAMoAhQDKAMgAvwC7AMAAvwDAAMMAvgDCAMYAvgDGAL0A0QDQAM0A0QDNANIAywDOAMwAywDMAM8A1wDVANMA1wDTANkA1gDUANgA1gDYANoA2wDcAN4A2wDeAN0A5QDjAOAA5QDgAOYA4QDfAOIA4QDiAOQAHQEnAfYAHQH2AOwANQE/ASwBNQEsARoBOQENAfoAOQH6ACIB7wD9ABMB7wATAQMB6ADtAPIA8wD4APwAAAEGAQgBCwEOARIBFwEbASABIwEmASkBLwEzATYBOgE8AUEB/wDnAPEA/wDxAAUB6wD1AP4A6wD+APAA9wAKAREB9wARAfsAEAEHAQQBEAEEARQBLgECAQkBLgEJATIBDAE4AUABDAFAAQ8BPgE0ATEBPgExAUIBGAEwATcBGAE3ARwBOwEkASoBOwEqAT0BKAEeARkBKAEZASsB6gAWAR8B6gAfAe4AIQH5APQAIQH0ACUBAQEtARUBAQEVAekARQFJAUYBRQFGAUwBZwFNAUcBZwFHAWkBUgFQAU4BUgFOAVQBUQFPAVMBUQFTAVUBVgFaAXgBVgF4AXQBVwFYAV0BVwFdAVsBfgFgAUMBfgFDAWEBawFIAUoBawFKAWUBZAFjAWgBZAFoAWoBYgFEAUsBYgFLAWYBcgFxAW4BcgFuAXMBbAFvAW0BbAFtAXABXAFeAXsBXAF7AXkBdgF1AXoBdgF6AXwBXwFZAXcBXwF3AX0B0QHTAX8B0QF/AYIBkgGOAYYBkgGGAZQBjwGLAZMBjwGTAZUBhAGIAYUBhAGFAY0BigGDAYwBigGMAZEBiQGQAZYBiQGWAYcBnQGcAZkBnQGZAZ4BlwGaAZgBlwGYAZsBowGhAZ8BowGfAaUBogGgAaQBogGkAaYBqwGzAcMBqwHDAbgBtQGwAbwBtQG8Ab4BrAGnAa4BrAGuAbQBsQGtAbYBsQG2Ab8BwQG9AbkBwQG5AcQBqQG3AboBqAGqAbsBqAG7Aa8BwgGyAcABzgHLAcYBzgHGAc8BgQGAAdQBgQHUAdIByQHFAcoByQHKAc0ByAHMAdAByAHQAccBJwIpAtUBJwLVAdgB6AHkAdwB6AHcAeoB5QHhAekB5QHpAesB2gHeAdsB2gHbAeMB4AHZAeIB4AHiAecB3wHmAewB3wHsAd0B8wHyAe8B8wHvAfQB7QHwAe4B7QHuAfEB+QH3AfUB+QH1AfsB+AH2AfoB+AH6AfwBAQIJAhkCAQIZAg4CCwIGAhICCwISAhQCAgL9AQQCAgIEAgoCBwIDAgwCBwIMAhUCFwITAg8CFwIPAhoC/wENAhAC/gEAAhEC/gERAgUCGAIIAhYCJAIhAhwCJAIcAiUC1wHWASoC1wEqAigCHwIbAiACHwIgAiMCHgIiAiYCHgImAh0CPAI4AjACPAIwAj4COQI1Aj0COQI9Aj8CLgIyAi8CLgIvAjcCNAItAjYCNAI2AjsCMwI6AkACMwJAAjECRwJGAkMCRwJDAkgCQQJEAkICQQJCAkUCTQJLAkkCTQJJAk8CTAJKAk4CTAJOAlACVAJcAmsCVAJrAmECXgJZAmQCXgJkAmYCVQJRAlcCVQJXAl0CWgJWAl8CWgJfAmcCaQJlAmICaQJiAmwCUwJgAmMCUgJTAmMCUgJjAlgCagJbAmgCLAIrAm4CLAJuAm0CbwJzAnkCbwJ5AnUCdgJ6AoUCdgKFAoECggKGAoACggKAAnwCewJ/AnQCewJ0AnACdwKDAn0CdwJ9AnECjAKPAp4CjAKeApUChAJ4AooChAKKAocCeAJyAo0CeAKNAooCcgJ+ApACcgKQAo0CfgKEAocCfgKHApAClgKTApwClgKcApkCiQKLApQCiQKUApgCjgKSApsCjgKbAp0CkQKIApcCkQKXApoCtwK+AqkCtwKpAqUCpgKqArUCpgK1ArECvwLGArACvwKwAqwCqwKvAqQCqwKkAqACugLAAq0CugKtAqECxQK7AqICxQKiAq4CtAKoAr0CtAK9AsMCpwKzAsICpwLCArgCsgK2AsQCsgLEAsECnwKjArwCnwK8ArkCyQLKAscCyQLHAsgCzQLOAssCzQLLAswC0QLQAs8C0QLPAtIC1QLUAtMC1QLTAtYC2QLYAtcC2QLXAtoC3QLcAtsC3QLbAt4C4ALfAuIC4ALiAuEC5ALjAuYC5ALmAuUCEAAKAOgCEADoAuwCDwDrAhcADwAXAA0A5wIJAAsA5wILABMA8gL3AvMC8gLzAvEC9gL0AvUC9gL1AvgC+AL1AvMC+ALzAvcC9gLwAu8C9gLvAvQCGAMVA/wCGAP8Av8CAQP5AgMDAQMDAx8DIAMFAwkDIAMJAx4DHQMHAwsDHQMLAxsDHAMNAxEDHAMRAxoDGQMPAxMDGQMTAxcD+wICAyIDAAP+AiEDDgMsAy4DDgMuAxIDBgMoAyoDBgMqAwoDIgMyAyQDIgMkA/sCEAMtAy8DEAMvAxQDCAMpAysDCAMrAwwD+gIjAycD+gInAwQD/gImAzED/gIxAyEDFgMwAyUDFgMlA/0C");
  M("E",1762,2850,-1.00337,0.0,-0.725,3.43e-05,2.0067,1.45,"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mICrcgyAt2Orcg+Tt2Orcg+Tt2Orcg+TmIBeawyAmIBeawyAmIBeawyAmICrcg+TmICrcg+TmICrcg+Tt2Nea+WOt2Nea+WOt2Nea+WOt2OHbw+Tt2OHbw+Tt2OHbw+Tt2OHbw+TmICHbw+TmICHbw+TmICHbw+TmICHbw+TmIBea+WOmIBea+WOmIBea+WO/WaLi4+F/Wb/iMSI/Wb/iMSI/Wb/iI+FUn2Li4+F/WaLi8SI/WaLi8SIUn3/iI+FUn2Li8SIUn2Li8SIUn3/iMSIUn3/iMSIfHs2ipyHfHs2ipyH02g2ipyH02g2ipyHVZbzcZyHVZbTk5yH/qjTk5yH/qjzcZyHOZEJmIqDOZEJmIqDOZGYkwuROZGYkwuROZGYkwuROZGYk4qDOZGYk4qDGq4JmIqDGq4JmIqDOZEJmAuROZEJmAuROZEJmAuRGq6Yk4qDGq6Yk4qDGq4JmAuRGq4JmAuRGq4JmAuRGq6YkwuRGq6YkwuRGq6YkwuRzKcXlqeEzKfWcQOKzKfWcQOKzKfWcaeEzKcXlgOKzKcXlgOKxqsXlgOKxqvWcQOKjZPWcQOKiJcXlqeEjZMXlgOKiJfWcaeEiJcXlgOKiJcXlgOKiJfWcQOKiJfWcQOKOZGrcgyAOZGrcgyAOZFeawyAOZFeawyAGq6rcgyAGq6rcgyAOZGrcg+TOZGrcg+TOZGrcg+TGq5eawyAGq5eawyAGq5eawyAGq6rcg+TGq6rcg+TGq6rcg+TOZFea+WOOZFea+WOOZFea+WOOZGHbw+TOZGHbw+TOZGHbw+TGq6Hbw+TGq6Hbw+TGq6Hbw+TGq6Hbw+TGq5ea+WOGq5ea+WOGq5ea+WOf5SLi4+Ff5T/iMSIf5T/iMSIf5T/iI+F1KqLi4+Ff5SLi8SIf5SLi8SI1Kr/iI+F1KqLi8SI1KqLi8SI1Kr/iMSI1Kr/iMSI/qg2ipyH/qg2ipyHVZY2ipyHVZY2ipyH18PzcZyH18PTk5yHgdbTk5yHgdbzcZyHu74JmIqDu74JmIqDu76YkwuRu76YkwuRu76YkwuRu76Yk4qDu76Yk4qDnNsJmIqDnNsJmIqDu74JmAuRu74JmAuRu74JmAuRnNuYk4qDnNuYk4qDnNsJmAuRnNsJmAuRnNsJmAuRnNuYkwuRnNuYkwuRnNuYkwuRTtUXlqeETtXWcQOK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AIEAAH8AfwAAAIEAfwAAAAB/gQAAAIEAAAB/gQAAAH8AAAB/AH8AfwAAAAB/AIEAfwAAAAB/AAB/AAB/AAB/AAB/AH8AgQAAgQAAAAB/AIEAgQAAAIEAAH8AfwAAAH8AgQAAAAB/fwAAAIEAAH8AAAB/fwAAAAB/fwAAAIEAgQAAgQAAAAB/gQAAgQAAAAB/AAB/AAB/AAB/fwAAAAB/fwAAAAB/fwAAAAB/fwAAAH8AgQAAgQAAgQAAAIEAAH8AfwAAAH8AgQAAAAB/fwAAfwAAAIEAAH8AAAB/fwAAgQAAAIEAAKZagQAAgQAAAAB/AKZaAAB/fwAAfwAAAKZafwAAAIEAAKZaAH8AAAB/AIEAAIEAAH8AAH8AAAB/AIEAAH8AAAB/AAB/AIEAAAB/AAB/AAB/AAB/AAB/AAB/AAB/AAB/AH8AgQAAgQAAAAB/AIEAgQAAAIEAAH8AfwAAAH8AgQAAAAB/fwAAAIEAAH8AAAB/fwAAAAB/fwAAAIEAgQAAgQAAAAB/gQAAgQAAAAB/AAB/AAB/AAB/fwAAAAB/fwAAAAB/fwAAAAB/fwAAAH8AgQAAgQAAgQAAAIEAAH8AfwAAAH8AgQAAAAB/fwAAfwAAAIEAAH8AAAB/fwAAgQAAAIEAAKZagQAAgQAAAAB/AKZaAAB/fwAAfwAAAKZafwAAAIEAAKZaAH8AAAB/AIEAAIEAAH8AAH8AAAB/AIEAAH8AAAB/AAB/AIEAAAB/AAB/AAB/AAB/AAB/AAB/AAB/AAB/AH8AgQAAgQAAAAB/AIEAgQAAAIEAAH8AfwAAAH8AgQAAAAB/fwAAAIEAAH8AAAB/fwAAAAB/fwAAAIEAgQAAgQAAAAB/gQAAgQAAAAB/AAB/AAB/AAB/fwAAAAB/fwAAAAB/fwAAAAB/fwAAAH8AgQAAgQAAAIEAAH8AfwAAAH8AgQAAAAB/fwAAfwAAAIEAAH8AAAB/fwAAgQAAAIEAAKZagQAAAAB/AKZaAAB/fwAAfwAAAKZafwAAAIEAAKZaAH8AAAB/AIEAAIEAAH8AAH8AAAB/AIEAAH8AAAB/AAB/AIEAAAB/AAB/AAB/AAB/AAB/AAB/AAB/AAB/AH8AgQAAgQAAAAB/AIEAgQAAAIEAAH8AfwAAAH8AgQAAAAB/fwAAAIEAAH8AAAB/fwAAAAB/fwAAAIEAgQAAgQAAAAB/gQAAgQAAAAB/AAB/AAB/AAB/fwAAAAB/fwAAAAB/fwAAAAB/fwAAAH8AgQAAgQAAgQAAAIEAAH8AfwAAAH8AgQAAAAB/fwAAAIEAAH8AAAB/fwAAgQAAAIEAAKZagQAAgQAAAAB/AKZaAAB/fwAAAKZafwAAAIEAAKZaAH8AAAB/AIEAAIEAAH8AAH8AAAB/AIEAAH8AAAB/AAB/AIEAAAB/AAB/AAB/AAB/AAB/AAB/AAB/AAB/AH8AgQAAgQAAAAB/AIEAgQAAAIEAAH8AfwAAAH8AgQAAAAB/fwAAAIEAAH8AAAB/fwAAAAB/fwAAAIEAgQAAgQAAAAB/gQAAgQAAAAB/AAB/AAB/AAB/fwAAAAB/fwAAAAB/fwAAAAB/fwAAAH8AgQAAgQAAAIEAAH8AfwAAAH8AgQAAAAB/fwAAAIEAAH8AAAB/fwAAgQAAAIEAAKZagQAAAAB/AKZaAAB/fwAAAKZafwAAAIEAAKZaAH8AAAB/AIEAAIEAAH8AAH8AAAB/AIEAAH8AAAB/AAB/AIEAAAB/AAB/AAB/AAB/AAB/AAB/AAB/AAB/AH8AgQAAgQAAAAB/AIEAgQAAAIEAAH8AfwAAAH8AgQAAAAB/fwAAAIEAAH8AAAB/fwAAAAB/fwAAAIEAgQAAgQAAAAB/gQAAgQAAAAB/AAB/AAB/AAB/fwAAAAB/fwAAAAB/fwAAAAB/fwAAAH8AgQAAgQAAgQAAAIEAAH8AfwAAAH8AgQAAAAB/fwAAfwAAAIEAAH8AAAB/fwAAgQAAAIEAAKZagQAAgQAAAAB/AKZaAAB/fwAAfwAAAKZafwAAAIEAAKZaAH8AAAB/AIEAAIEAAH8AAH8AAAB/AIEAAH8AAAB/AAB/AIEAAAB/AAB/AAB/AAB/AAB/AAB/AAB/AAB/AH8AgQAAgQAAAAB/AIEAgQAAAIEAAH8AfwAAAH8AgQAAAAB/fwAAAIEAAH8AAAB/fwAAAAB/fwAAAIEAgQAAgQAAAAB/gQAAgQAAAAB/AAB/AAB/AAB/fwAAAAB/fwAAAAB/fwAAAAB/fwAAAH8AgQAAgQAAgQAAAIEAAH8AfwAAAH8AgQAAAAB/fwAAfwAAAIEAAH8AAAB/fwAAgQAAAIEAAKZagQAAgQAAAAB/AKZaAAB/fwAAfwAAAKZafwAAAIEAAKZaAH8AAAB/AIEAAIEAAH8AAH8AAAB/AIEAAH8AAAB/AAB/AIEAAAB/AAB/AAB/AAB/AAB/AAB/AAB/AAB/AH8AgQAAgQAAAAB/AIEAgQAAAIEAAH8AfwAAAH8AgQAAAAB/fwAAAIEAAH8AAAB/fwAAAAB/fwAAAIEAgQAAgQAAAAB/gQAAgQAAAAB/AAB/AAB/AAB/fwAAAAB/fwAAAAB/fwAAAAB/fwAAAH8AgQAAgQAAAIEAAH8AfwAAAH8AgQAAAAB/fwAAAIEAAH8AAAB/fwAAgQAAAIEAAKZagQAAAAB/AKZaAAB/fwAAAKZafwAAAIEAAKZaAH8AAAB/AIEAAIEAAH8AAH8AAAB/AIEAAH8AAAB/AAB/AIEAAAB/AAB/AAB/AAB/AAB/AAB/AAB/AAB/AH8AgQAAgQAAAAB/AIEAgQAAAIEAAH8AfwAAAH8AgQAAAAB/fwAAAIEAAH8AAAB/fwAAAAB/fwAAAIEAgQAAgQAAAAB/gQAAgQAAAAB/AAB/AAB/AAB/fwAAAAB/fwAAAAB/fwAAAAB/fwAAAH8AgQAAgQAAAIEAAH8AfwAAAH8AgQAAAAB/fwAAAIEAAH8AAAB/fwAAgQAAAIEAAKZagQAAAAB/AKZaAAB/fwAAAKZafwAAAIEAAKZaAH8AAAB/AIEAAIEAAH8AAH8AAAB/AIEAAH8AAAB/AAB/AIEAAAB/AAB/AAB/AAB/AAB/AAB/AAB/AAB/AH8AgQAAgQAAAAB/AIEAgQAAAIEAAH8AfwAAAH8AgQAAAAB/fwAAAIEAAH8AAAB/fwAAAAB/fwAAAIEAgQAAgQAAAAB/gQAAgQAAAAB/AAB/AAB/AAB/fwAAAAB/fwAAAAB/fwAAAAB/fwAAAH8AgQAAgQAAAIEAAH8AfwAAAH8AgQAAAAB/fwAAfwAAAIEAAH8AAAB/fwAAgQAAAIEAAKZagQAAAAB/AKZaAAB/fwAAfwAAAKZafwAAAIEAAKZaAH8AAAB/AIEAAIEAAH8AAH8AAAB/AIEAAH8AAAB/AAB/AIEAAAB/AAB/AAB/AAB/gQAAAAB/AIEAAH8AgQAAAAB/gQAAAACBAIEAAH8AgQAAAACBAAB/fwAAAIEAAH8AAAB/fwAAAACBfwAAAIEAAH8AAACBfwAAAH8Ak0AAAEBtAH8AAEBtbUAAAH8AAECTbUAAAH8Ak0AAAECTAH8AAEBtbUAAAH8Ak0AAAEBtAH8Ak0AAAECTAH8AAECTbUAAgQAAAAB/AIEAAH8AgQAAAAB/gQAAAACBAIEAAH8AgQAAAACBAAB/fwAAAIEAAH8AAAB/fwAAAACBfwAAAIEAAH8AAACBfwAAgQAAAIEAgQAAAIEAAH8AgQAAAH8AgQAAfwAAAIEAfwAAAIEAAH8AfwAAAH8AfwAAgQAAAAB/AIEAAH8AgQAAAAB/gQAAAACBAIEAAH8AgQAAAACBAAB/fwAAAIEAAH8AAAB/fwAAAACBfwAAAIEAAH8AAACBfwAAgQAAAIEAgQAAAIEAAH8AgQAAAH8AgQAAfwAAAIEAfwAAAIEAAH8AfwAAAH8AfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAAACBAACBAACBAACBAACBAACBAACBAACBAACBAACBAACBAACBAACBAACBAACBAACBgQAAgQAAgQAAgQAAfwAAfwAAfwAAfwAAAAB/AH8AgQAAgQAAAAB/AIEAgQAAAIEAAH8AgQAAAAB/AAB/fwAAAAB/fwAAAAB/fwAAAAB/fwAAAH8AgQAAgQAAAIEAAH8AgQAAAAB/gQAAAAB/AIEAAAB/AAB/AH8AfwAAfwAAAIEAAH8AAAB/fwAAAAB/fwAAAIEAgQAAgQAAAAB/gQAAgQAAAAB/AAB/AAB/AH8AfwAAfwAAAIEAAH8AAAB/fwAAAAB/fwAAAIEAAAB/AAB/AH8AfwAAAAB/fwAAAIEAfwAAAIEAAH8AAAB/fwAAAAB/gQAAAAB/gQAAgQAAAAB/gQAAAAB/AH8AfwAAfwAAAIEAAH8AAAB/fwAAAAB/fwAAAIEAAAB/AAB/AH8AgQAAgQAAAIEAAH8AgQAAAAB/gQAAAAB/AIEAfwAAAAB/fwAAfwAAAAB/fwAAAAB/AAB/AH8AgQAAgQAAAIEAAH8AgQAAAAB/gQAAAAB/AIEAAAB/AAB/AAB/AAB/AAB/AH8AgQAAgQAAAAB/AIEAgQAAAIEAAH8AfwAAAH8AgQAAAAB/fwAAAIEAAH8AAAB/fwAAAAB/fwAAAIEAgQAAgQAAAAB/gQAAgQAAAAB/AAB/AAB/AAB/fwAAAAB/fwAAAAB/fwAAAAB/fwAAAH8AgQAAgQAAAH8AfwAAAH8AgQAAAAB/fwAAAH8AAAB/fwAA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eFJfLnBQVyBwUFcgcFBXJHBQVyR4UlcgeFJXJHhSVyR4UkAMeFJADHhSQAx4UkAMeFJIFnhSSBZ4UkgacFBIFnBQSBZwUEgacFBIGodYXy6HWF8uh1hfLodYXy6PWlcgj1pXII9aVySPWlckh1hXIIdYVyCHWFckh1hXJIdYQAyHWEAMh1hADIdYQAyHWEgWh1hIFodYSBqHWEgaj1pIFo9aSBaPWkgaj1pIGodYXy6HWF8uh1hfLodYXy6HWFcgh1hXJIdYVySPWlcgj1pXII9aVySPWlckh1hADIdYQAyHWEAMh1hADI9aSBaPWkgWj1pIGo9aSBqHWEgWh1hIFodYSBomC89X2xbPVyYLGkzbFhpMRCkqIGA6KiBEKQ4PYDoOD0QpKiBgOiogRCkOD2A6Dg8mC89X2xbPVyYLGkzbFhpMs2/oYG9vnl7Ga11hgWsTX0QpKiBgOiogRCkOD2A6Dg+BNfntc9Uamn8K+e0Qwhqafwr57RDCGpqBNfntc9UamgTPqZ8Ez1WqBM+rrw43JQwEzyWMBM8ljATPJ5wON6kfDjdVKgTPqZ8Ez1WqDjepHw43VSoEz6mfBM9Vqg43qR8ON1UqBM+pnwTPVaoON6kfDjdVKgTPqZ8Ez1WqDjepHw43VSoEz6mfBM9Vqg43JQwEzyWMDjclDATPJYwONyUMBM8ljA43JQwEzyWMDjclDATPJYwEz7SvBM96sgTP0LcON3syBM96sg43ezIEz3qyDjd7MgTPerION3syBM96sg43ezIEz3qyDjd7MgTPerIEz9q3DjepHw43VSoEz6mfBM9Vqg43qR8ON1UqDjerLw43JQwONyccDjepHw43VSoEz6mfBM9Vqg43qR8ON1UqBM+pnwTPVaoON6kfDjdVKgTPqZ8Ez1WqDjclDATPJYwONyUMBM8ljA43JQwEzyWMDje1Lw43ezION9E3Djd7MgTPerION3syBM96sg43ezIEz3qyDjfaNw==","KwAvAGoAKwBqAGUANgARAMsAHQAgAF4AHQBeAGAAmAAtACoAmAAqABQAFABFAE4AFABOABIARgBJAHEARgBxAHMAYQCCAJMAYQCTACUAJACRAJcAOgA9AG0AOgBtAFMAEgAMABgAEgAYABUADADNABsADAAbABgAzQDMAB4AzQAeABsACAAOAAEACAABAKIAyADBAMsAEwACACEAEwAhACQACwAUACoACwAqACcAmAAGADAAmAAwAC0ABgALACcABgAnADAAAwARADYAAwA2ADMAAgATADwAAgA8ADkAEQADAEIAEQBCAD8AAwACADkAAwA5AEIAFAALAEgAFABIAEUACwAMAEsACwBLAEgADAASAE4ADABOAEsAPgBAAG8APgBvAG4ATwBHAHQATwB0AHUALgAxAGcALgBnAGkAQQBEAFYAQQBWAHAASgBMAHcASgB3AHIATQBQAHYATQB2AHgAIgCWAIQAIgCEAFEAQwA7AFQAQwBUAFUAFgAZAFkAFgBZAFsAJgAjAFIAJgBSAGIAHwAXAFwAHwBcAF0AWACzAMUAWADFADUAKQAsAGYAKQBmAGQANAA3AGsANABrAFcAGgAcAF8AGgBfAFoAMgAoAGMAMgBjAGgAHgDMABIAHgASABUAPAATABEAPAARAD8ADQCZAJ8ADQCfAAAABACdAJsABACbAA8AkQCaAJcAlQCSAIEAlQCBAIMAhwCPAH8AhwB/AHwAkACNAH4AkAB+AIAAngAGAI4AngCOAIUAAgCgAJQAAgCUACEAiQCGAHsAiQB7AHkABgCYAIsABgCLAI4AnACeAIUAnACFAIgAoACaAJEAoACRAJQAnACIAIsAnACLAJgAOADCALEAOACxAGwAjACKAHoAjAB6AH0ApgAFABAApgAQAAoAwQA2AMsAtwC/AK8AtwCvAKwAwAC9AK4AwACuALAAwwDGALQAwwC0ALIAzQCoAL4AzQC+ALUAyACkAMQAyADEAMEAuQC2AKsAuQCrAKkAqADKALsAqAC7AL4AxACkAAMAxAADADMAzADNALUAzAC1ALgAzAC4ALsAzAC7AMoAEwAkAJcAvAC6AKoAvACqAK0AxwAHAKEAxwChAKMACQDJAKcACQCnAKUA4wDnAAYB4wAGAQEB2wDeAPwA2wD8AP4ABgDlAOIABgDiAAsACwDrAPQACwD0AAwA7ADvAAcB7AAHAQkBDADSANYADADWANMA0gA9AdkA0gDZANYAPQHNANwAPQHcANkA0QALAOIA0QDiAN8ABgDQAOgABgDoAOUA0ADRAN8A0ADfAOgACwDRAO4ACwDuAOsA0QDSAPEA0QDxAO4A0gAMAPQA0gD0APEA9QDtAAoB9QAKAQsB5gDpAAMB5gADAQUB8ADyAA0B8AANAQgB8wD2AAwB8wAMAQ4B1ADXAPcA1AD3APkA3QDVAPoA3QD6APsA4QDkAAIB4QACAQAB2ADaAP0A2AD9APgA6gDgAP8A6gD/AAQB3ADNAAwA3AAMANMAzgAjAZ0AzgCdAAQAGQEhARUBGQEVARIBIgEfARQBIgEUARYBJAHQACABJAEgARcBGwEYAREBGwERAQ8B0AAGAB0B0AAdASABngAkARcBngAXARoBngAaAR0BngAdAQYAHgEcARABHgEQARMBJgHPAAUAJgEFAKYAMwE7AS8BMwEvASwBPAE5AS4BPAEuATABPQEoAToBPQE6ATEBNQEyASsBNQErASkBKAGoADcBKAE3AToBzQA9ATEBzQAxATQBzQA0ATcBzQA3AagAOAE2ASoBOAEqAS0BpQCnACcBpQAnASUBkAGSAT4BkAE+AUEBUQFNAUUBUQFFAVMBTgFKAVIBTgFSAVQBQwFHAUQBQwFEAUwBSQFCAUsBSQFLAVABSAFPAVUBSAFVAUYBXAFbAVgBXAFYAV0BVgFZAVcBVgFXAVoBYgFgAV4BYgFeAWQBYQFfAWMBYQFjAWUBagFyAYIBagGCAXcBdAFvAXsBdAF7AX0BawFmAW0BawFtAXMBcAFsAXUBcAF1AX4BgAF8AXgBgAF4AYMBaAF2AXkBZwFpAXoBZwF6AW4BgQFxAX8BjQGKAYUBjQGFAY4BQAE/AZMBQAGTAZEBiAGEAYkBiAGJAYwBhwGLAY8BhwGPAYYB5gHoAZQB5gGUAZcBpwGjAZsBpwGbAakBpAGgAagBpAGoAaoBmQGdAZoBmQGaAaIBnwGYAaEBnwGhAaYBngGlAasBngGrAZwBsgGxAa4BsgGuAbMBrAGvAa0BrAGtAbABuAG2AbQBuAG0AboBtwG1AbkBtwG5AbsBwAHIAdgBwAHYAc0BygHFAdEBygHRAdMBwQG8AcMBwQHDAckBxgHCAcsBxgHLAdQB1gHSAc4B1gHOAdkBvgHMAc8BvQG/AdABvQHQAcQB1wHHAdUB4wHgAdsB4wHbAeQBlgGVAekBlgHpAecB3gHaAd8B3gHfAeIB3QHhAeUB3QHlAdwBOgI8AuoBOgLqAe0B/QH5AfEB/QHxAf8B+gH2Af4B+gH+AQAC7wHzAfAB7wHwAfgB9QHuAfcB9QH3AfwB9AH7AQEC9AEBAvIBCAIHAgQCCAIEAgkCAgIFAgMCAgIDAgYCDgIMAgoCDgIKAhACDQILAg8CDQIPAhECFQIdAiwCFQIsAiICHwIaAiUCHwIlAicCFgISAhgCFgIYAh4CGwIXAiACGwIgAigCKgImAiMCKgIjAi0CFAIhAiQCEwIUAiQCEwIkAhkCKwIcAikCNwI0Ai8CNwIvAjgC7AHrAT0C7AE9AjsCMgIuAjMCMgIzAjYCMQI1AjkCMQI5AjACjgKQAj4CjgI+AkECUQJNAkUCUQJFAlMCTgJKAlICTgJSAlQCQwJHAkQCQwJEAkwCSQJCAksCSQJLAlACSAJPAlUCSAJVAkYCXAJbAlgCXAJYAl0CVgJZAlcCVgJXAloCYgJgAl4CYgJeAmQCYQJfAmMCYQJjAmUCagJxAoACagKAAnYCcwJvAnoCcwJ6AnwCawJmAm0CawJtAnICcAJsAnQCcAJ0An0CfgJ7AncCfgJ3AoECaQJ1AnkCZwJoAngCZwJ4Am4CfwJwAn0CiwKIAoMCiwKDAowCQAI/ApECQAKRAo8ChgKCAocChgKHAooChQKJAo0ChQKNAoQC4ALiApIC4AKSApUCpQKhApkCpQKZAqcCogKeAqYCogKmAqgClwKbApgClwKYAqACnQKWAp8CnQKfAqQCnAKjAqkCnAKpApoCsAKvAqwCsAKsArECqgKtAqsCqgKrAq4CtgK0ArICtgKyArgCtQKzArcCtQK3ArkCvQLEAtICvQLSAskCxgLCAswCxgLMAs4CvgK6AsACvgLAAsUCwwK/AscCwwLHAs8C0ALNAsoC0ALKAtMCvALIAssCuwK8AssCuwLLAsEC0QLDAs8C3QLaAtUC3QLVAt4ClAKTAuMClALjAuEC2ALUAtkC2ALZAtwC1wLbAt8C1wLfAtYCNgM4A+QCNgPkAucC9wLzAusC9wLrAvkC9ALwAvgC9AL4AvoC6QLtAuoC6QLqAvIC7wLoAvEC7wLxAvYC7gL1AvsC7gL7AuwCAgMBA/4CAgP+AgMD/AL/Av0C/AL9AgADCAMGAwQDCAMEAwoDBwMFAwkDBwMJAwsDEAMYAygDEAMoAx0DGgMVAyEDGgMhAyMDEQMMAxMDEQMTAxkDFwMSAxsDFwMbAyUDJgMiAx4DJgMeAykDDgMcAx8DDQMPAyADDQMgAxQDJwMWAyQDMwMwAysDMwMrAzQD5gLlAjkD5gI5AzcDLgMqAy8DLgMvAzIDLQMxAzUDLQM1AywDjAOOAzoDjAM6Az0DTQNJA0EDTQNBA08DSgNGA04DSgNOA1ADPwNDA0ADPwNAA0gDRQM+A0cDRQNHA0wDRANLA1EDRANRA0IDWANXA1QDWANUA1kDUgNVA1MDUgNTA1YDXgNcA1oDXgNaA2ADXQNbA18DXQNfA2EDZgNuA34DZgN+A3MDcANrA3cDcAN3A3kDZwNiA2kDZwNpA28DbQNoA3EDbQNxA3sDfAN4A3QDfAN0A38DZQNyA3YDYwNkA3UDYwN1A2oDfQNsA3oDiQOGA4EDiQOBA4oDPAM7A48DPAOPA40DhAOAA4UDhAOFA4gDgwOHA4sDgwOLA4ID3gPgA5AD3gOQA5MDowOfA5cDowOXA6UDoAOcA6QDoAOkA6YDlQOZA5YDlQOWA54DmwOUA50DmwOdA6IDmgOhA6cDmgOnA5gDrgOtA6oDrgOqA68DqAOrA6kDqAOpA6wDtAOyA7ADtAOwA7YDswOxA7UDswO1A7cDuwPCA9ADuwPQA8cDxAPAA8oDxAPKA8wDvAO4A74DvAO+A8MDwQO9A8UDwQPFA80DzgPLA8gDzgPIA9EDugPGA8kDuQO6A8kDuQPJA78DzwPBA80D2wPYA9MD2wPTA9wDkgORA+EDkgPhA98D1gPSA9cD1gPXA9oD1QPZA90D1QPdA9QDMAQyBOIDMATiA+UD9QPxA+kD9QPpA/cD8gPuA/YD8gP2A/gD5wPrA+gD5wPoA/AD7QPmA+8D7QPvA/QD7APzA/kD7AP5A+oDAAT/A/wDAAT8AwEE+gP9A/sD+gP7A/4DBgQEBAIEBgQCBAgEBQQDBAcEBQQHBAkEDQQUBCIEDQQiBBkEFgQSBBwEFgQcBB4EDgQKBBAEDgQQBBUEEwQPBBcEEwQXBB8EIAQdBBoEIAQaBCMEDAQYBBsECwQMBBsECwQbBBEEIQQTBB8ELQQqBCUELQQlBC4E5APjAzME5AMzBDEEKAQkBCkEKAQpBCwEJwQrBC8EJwQvBCYEhASGBDQEhAQ0BDcERwRDBDsERwQ7BEkERARABEgERARIBEoEOQQ9BDoEOQQ6BEIEPwQ4BEEEPwRBBEYEPgRFBEsEPgRLBDwEUgRRBE4EUgROBFMETARPBE0ETARNBFAEWARWBFQEWARUBFoEVwRVBFkEVwRZBFsEXwRnBHYEXwR2BGwEaQRkBG8EaQRvBHEEYARcBGIEYARiBGgEZQRhBGoEZQRqBHIEdARwBG0EdARtBHcEXgRrBG4EXQReBG4EXQRuBGMEdQRmBHMEgQR+BHkEgQR5BIIENgQ1BIcENgSHBIUEfAR4BH0EfAR9BIAEewR/BIMEewSDBHoEiASMBJIEiASSBI4EjwSTBJ4EjwSeBJoEmwSfBJkEmwSZBJUElASYBI0ElASNBIkEkAScBJYEkASWBIoEpQSoBLcEpQS3BK4EnQSRBKMEnQSjBKAEkQSLBKYEkQSmBKMEiwSXBKkEiwSpBKYElwSdBKAElwSgBKkErwSsBLUErwS1BLIEogSkBK0EogStBLEEpwSrBLQEpwS0BLYEqgShBLAEqgSwBLME0ATXBMIE0ATCBL4EvwTDBM4EvwTOBMoE2ATfBMkE2ATJBMUExATIBL0ExAS9BLkE0wTZBMYE0wTGBLoE3gTUBLsE3gS7BMcEzQTBBNYEzQTWBNwEwATMBNsEwATbBNEEywTPBN0EywTdBNoEuAS8BNUEuATVBNIE+AT/BOoE+ATqBOYE5wTrBPYE5wT2BPIEAAUHBfEEAAXxBO0E7ATwBOUE7ATlBOEE+wQBBe4E+wTuBOIEBgX8BOMEBgXjBO8E9QTpBP4E9QT+BAQF6AT0BAMF6AQDBfkE8wT3BAUF8wQFBQIF4ATkBP0E4AT9BPoECgULBQgFCgUIBQkFDgUPBQwFDgUMBQ0FEgUTBRAFEgUQBREFFgUXBRQFFgUUBRUFGgUZBRgFGgUYBRsFHgUdBRwFHgUcBR8FIgUhBSAFIgUgBSMFJgUlBSQFJgUkBScFKQUoBSsFKQUrBSoFLQUuBS8FLQUvBSwFMgU2BTMFMgUzBTkFVAU6BTQFVAU0BVYFPwU9BTsFPwU7BUEFPgU8BUAFPgVABUIFQwVHBWUFQwVlBWEFRAVFBUoFRAVKBUgFhwaFBjAFhwYwBU4FWAU1BTcFWAU3BVIFUQVQBVUFUQVVBVcFTwUxBTgFTwU4BVMFXwVeBVsFXwVbBWAFWQVcBVoFWQVaBV0FSQVLBWgFSQVoBWYFYwViBWcFYwVnBWkFTAVGBWQFTAVkBWoFbgV2BXAFbgVwBXIFkQWTBW8FkQVvBXUFfAV+BXcFfAV3BXkFegV9BXsFegV7BXgFfwWdBaEFfwWhBYMFgAWFBYcFgAWHBYEFgQaDBmwFgQZsBYoFlAWOBXMFlAVzBXEFjQWSBZAFjQWQBYwFiwWPBXQFiwV0BW0FmwWcBZYFmwWWBZkFlQWaBZcFlQWXBZgFhAWjBaUFhAWlBYYFnwWkBaIFnwWiBZ4FiAWmBaAFiAWgBYIF7AXuBagF7AWoBasFuwW3Ba8FuwWvBb0FuAW0BbwFuAW8Bb4FrQWxBa4FrQWuBbYFswWsBbUFswW1BboFsgW5Bb8FsgW/BbAFxgXFBcIFxgXCBccFwAXDBcEFwAXBBcQFzAXKBcgFzAXIBc4FywXJBc0FywXNBc8F2gXXBd0F2gXdBd4F0wXQBdUF0wXVBdkF2AXUBdsF2AXbBd8F0QXSBdwF0QXcBdYF6QXmBeEF6QXhBeoFqgWpBe8FqgXvBe0F5AXgBeUF5AXlBegF4wXnBesF4wXrBeIF9gX1BfIF9gXyBfcF8AXzBfEF8AXxBfQF/AX6BfgF/AX4Bf4F+wX5Bf0F+wX9Bf8FAAYBBgMGAAYDBgIGCgYIBgUGCgYFBgsGBgYEBgcGBgYHBgkGQgZMBhsGQgYbBhEGWgZkBlEGWgZRBj8GXgYyBh8GXgYfBkcGFAYiBjgGFAY4BigGDQYSBhcGGAYdBiEGJQYrBi0GMAYzBjcGPAZABkUGSAZLBk4GVAZYBlsGXwZhBmYGJAYMBhYGJAYWBioGEAYaBiMGEAYjBhUGHAYvBjYGHAY2BiAGNQYsBikGNQYpBjkGUwYnBi4GUwYuBlcGMQZdBmUGMQZlBjQGYwZZBlYGYwZWBmcGPQZVBlwGPQZcBkEGYAZJBk8GYAZPBmIGTQZDBj4GTQY+BlAGDwY7BkQGDwZEBhMGRgYeBhkGRgYZBkoGJgZSBjoGJgY6Bg4GaAZqBmsGaAZrBmkGbAZtBm8GbAZvBm4GcAZxBnMGcAZzBnIGdAZ1BncGdAZ3BnYGeAZ5BnsGeAZ7BnoGfAZ9Bn8GfAZ/Bn4GiQWCBoAGiQWABqcFawVNBYQGawWEBoYGowafBr0Gowa9BosGjQaIBpEGjQaRBqwGqwaPBpMGqwaTBqkGqgaVBpkGqgaZBqgGpwaXBpsGpwabBqUGpgadBqEGpgahBqQGigaOBq0GmAa2BrgGmAa4BpwGkAayBrQGkAa0BpQGrQa8Bq8GrQavBooGnga5BrsGnga7BqIGlga1BrcGlga3BpoGiQauBrMGiQazBpIGoAa6BrAGoAawBr4G0gbOBsEG0gbBBsQGjAa/BsgGjAbIBtcG1gbGBsoG1gbKBtQG1QbMBtAG1QbQBtMGxQbDBtgGxwbbBt0GxwbdBssGzQbeBuAGzQbgBtEGwAaxBtwGwAbcBskGwwbaBuEGwwbhBtgGzwbfBtkGzwbZBsIG");
  M("G",1955,3159,-1.00337,0.0,-0.725,3.43e-05,2.0067,1.45,"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iJfWceZtiJcXlkJziJcXlkJziJfWcUJziJfWcUJzOZGrcktpOZGrcktpOZFea0tpOZFea0tpOZFea0tpGq6rcktpGq6rcktpOZGrck58OZGrck58OZGrck58Gq5ea0tpGq5ea0tpGq6rck58Gq6rck58Gq6rck58OZFeayR4OZFeayR4OZFeayR4OZGHb058OZGHb058OZGHb058OZGHb058Gq6Hb058Gq6Hb058Gq6Hb058Gq5eayR4Gq5eayR4Gq5eayR4f5SLi85uf5T/iANyf5T/iANyf5T/iM5u1KqLi85uf5SLiwNyf5SLiwNy1Kr/iM5u1KqLiwNy1KqLiwNy1Kr/iANy1Kr/iANy/qg2ittw/qg2ittwVZY2ittwVZY2ittw18Pzcdtw18PTk9twgdbTk9twgdbzcdtwu74JmMlsu74JmMlsu76Yk0p6u76Yk0p6u76Yk0p6u76Yk8lsu76Yk8lsnNsJmMlsnNsJmMlsu74JmEp6u74JmEp6u74JmEp6nNuYk8lsnNuYk8lsnNsJmEp6nNsJmEp6nNsJmEp6nNuYk0p6nNuYk0p6nNuYk0p6TtUXluZtTtXWcUJzTtXWcUJzTtXWceZtTtUXlkJzTtUXlkJzSdkXlkJzSdnWcUJzD8HWcUJzCsUXluZtD8EXlkJzCsXWceZtCsUXlkJzCsUXlkJzCsXWcUJzCsXWcUJzu76rcktpu76rcktpu75ea0tpu75ea0tpu75ea0tpnNurcktpnNurcktpu76rck58u76rck58u76rck58nNtea0tpnNtea0tpnNurck58nNurck58nNurck58u75eayR4u75eayR4u75eayR4u76Hb058u76Hb058u76Hb058u76Hb058nNuHb058nNuHb058nNuHb058nNteayR4nNteayR4nNteayR4AcKLi85uAcL/iANyAcL/iANyAcL/iM5uVtiLi85uAcKLiwNyAcKLiwNyVtj/iM5uVtiLiwNyVtiLiwNyVtj/iANyVtj/iANygdY2ittwgdY2ittw18M2ittw18M2ittwVZaXwdtwVZZ249tw/qh249tw/qiXwdtwOZGs58lsOZGs58lsOZE740p6OZE740p6OZE740p6OZE748lsOZE748lsGq6s58lsGq6s58lsOZGs50p6OZGs50p6OZGs50p6Gq4748lsGq4748lsGq6s50p6Gq6s50p6Gq6s50p6Gq4740p6Gq4740p6Gq4740p6zKe75eZtzKd5wUJzzKd5wUJzzKd5weZtzKe75UJzzKe75UJzxqu75UJzxqt5wUJzjZN5wUJziJe75eZtjZO75UJziJd5weZtiJe75UJziJe75UJziJd5wUJziJd5wUJzOZFPwktpOZFPwktpOZECu0tpOZECu0tpOZECu0tpGq5PwktpGq5PwktpOZFPwk58OZFPwk58OZFPwk58Gq4Cu0tpGq4Cu0tpGq5Pwk58Gq5Pwk58Gq5Pwk58OZECuyR4OZECuyR4OZECuyR4OZErv058OZErv058OZErv058OZErv058Gq4rv058Gq4rv058Gq4rv058Gq4CuyR4Gq4CuyR4Gq4CuyR4f5QL1M5uf5SA0QNyf5SA0QNyf5SA0c5u1KoL1M5uf5QL1ANyf5QL1ANy1KqA0c5u1KoL1ANy1KoL1ANy1KqA0QNy1KqA0QNy/qi30ttw/qi30ttwVZa30ttwVZa30ttw18OXwdtw18N249twgdZ249twgdaXwdtwu76s58lsu76s58lsu74740p6u74740p6u74740p6u74748lsu74748lsnNus58lsnNus58lsu76s50p6u76s50p6u76s50p6nNs748lsnNs748lsnNus50p6nNus50p6nNus50p6nNs740p6nNs740p6nNs740p6TtW75eZtTtV5wUJzTtV5wUJzTtV5weZtTtW75UJzTtW75UJzSdm75UJzSdl5wUJzD8F5wUJzCsW75eZtD8G75UJzCsV5weZtCsW75UJzCsW75UJzCsV5wUJzCsV5wUJzu75Pwktpu75Pwktpu74Cu0tpu74Cu0tpu74Cu0tpnNtPwktpnNtPwktpu75Pwk58u75Pwk58u75Pwk58nNsCu0tpnNsCu0tpnNtPwk58nNtPwk58nNtPwk58u74CuyR4u74CuyR4u74CuyR4u74rv058u74rv058u74rv058u74rv058nNsrv058nNsrv058nNsrv058nNsCuyR4nNsCuyR4nNsCuyR4AcIv285uAcKj2ANyAcKj2ANyAcKj2M5uVtgv285uAcIv2wNyAcIv2wNyVtij2M5uVtgv2wNyVtgv2wNyVtij2ANyVtij2ANygdba2dtwgdba2dtw18Pa2dtw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Zlv/QfikJ3L/QfikJ3L/Qfik6Yj4QTeOYgD4QTeO","AACBAACBAAB/gQAAAACBgQAAAACBAAB/AAB/AAB/AAB/fwAAAAB/fwAAAAB/gQAAAH8AAAB/gQAAAIEAAAB/AIEAfwAAAAB/AH8AfwAAAAB/gQAAAH8AAAB/gQAAAIEAAAB/AIEAfwAAAAB/AH8AfwAAAAB/gQAAAH8AAAB/gQAAAIEAAAB/AIEAfwAAAAB/AH8AfwAAgQAAAH8AgQAAAIEAgQAAAH8AAH8AfwAAAIEAfwAAgQAAAIEAgQAAAIEAgQAAAH8AAH8AfwAAAIEAfwAAAACBAACBgQAAAACBgQAAAAB/gQAAAACBgQAAAAB/gQAAAH8AgQAAAIEAAH8AfwAAAIEAfwAAAIEAfwAAAH8AfwAAAAB/gQAAAIEAAAB/gQAAAH8AAAB/AH8AfwAAAAB/AIEAfwAAAAB/AIEAfwAAAAB/AH8AfwAAgQAAAAB/gQAAAAB/AAB/AAB/AAB/AAB/fwAAAAB/AAB/gQAAAH8AAAB/gQAAAIEAAAB/AIEAfwAAAAB/AH8AfwAAAAB/gQAAAH8AAAB/gQAAAIEAAAB/AIEAfwAAAAB/AH8AfwAAgQAAAIEAgQAAAH8AAH8AfwAAAIEAfwAAgQAAAIEAgQAAAH8AAH8AfwAAAIEAfwAAgQAAAACBgQAAAAB/gQAAAH8AgQAAAIEAAH8AfwAAAIEAfwAAAAB/gQAAAIEAAAB/gQAAAH8AAAB/AH8AfwAAAAB/AIEAfwAAAAB/fwAAAACBAAB/fwAAAAB/fwAAAACBAAB/AAB/fwAAfwAAAACBfwAAAAB/fwAAAAB/AH8AfwAAAAB/gQAAAH8AAAB/gQAAAIEAAAB/AIEAfwAAAAB/AIEAfwAAAAB/AH8AfwAAAAB/gQAAAH8AAAB/gQAAAIEAgQAAAH8AAH8AfwAAAIEAfwAAgQAAAIEAAIEAfwAAAH8AfwAAgQAAAIEAgQAAAH8AgQAAAH8AgQAAAIEAAH8AfwAAAIEAfwAAgQAAAIEAAIEAfwAAAH8AfwAAgQAAAH8AAAB/gQAAAIEAAAB/gQAAAH8AAAB/AH8AfwAAAAB/AIEAfwAAAAB/AIEAfwAAAAB/gQAAAIEAAAB/gQAAAH8AAAB/AH8AfwAAAAB/fwAAAAB/fwAAAAB/fwAAAAB/fwAAAACBAAB/AAB/fwAAAAB/AIEAfwAAAAB/AH8AfwAAAAB/gQAAAH8AAAB/gQAAAIEAAIEAfwAAAH8AfwAAgQAAAIEAgQAAAH8AgQAAAH8AgQAAAIEAAH8AfwAAAIEAfwAAAAB/gQAAAIEAAAB/gQAAAH8AAAB/AH8AfwAAAAB/AIEAfwAAfwAAAAB/AACBAACBAACBAACBAACBAAB/gQAAAH8AAAB/gQAAAIEAgQAAAH8AAH8AfwAAgQAAAIEAAIEAfwAAAAB/AAB/AAB/AAB/AH8AgQAAgQAAAAB/AIEAgQAAAIEAAH8AfwAAAH8AgQAAAAB/fwAAAIEAAH8AAAB/fwAAAAB/fwAAAIEAgQAAgQAAAAB/gQAAgQAAAAB/AAB/AAB/AAB/fwAAAAB/fwAAAAB/fwAAAAB/fwAAAH8AgQAAgQAAgQAAAIEAAH8AfwAAAH8AgQAAAAB/fwAAAIEAAH8AAAB/fwAAgQAAAIEAAKZagQAAgQAAAAB/AKZaAAB/fwAAAKZafwAAAIEAAKZaAH8AAAB/AIEAAIEAAH8AAH8AAAB/AIEAAH8AAAB/AAB/AIEAAAB/AAB/AAB/AAB/AAB/fwAAAIEAAH8AAAB/fwAAAAB/AAB/AAB/AAB/AH8AgQAAgQAAAAB/AIEAgQAAAIEAAH8AfwAAAH8AgQAAAAB/fwAAAIEAAH8AAAB/fwAAAAB/fwAAAIEAgQAAgQAAAAB/gQAAgQAAAAB/AAB/AAB/AAB/fwAAAAB/fwAAAAB/fwAAAAB/fwAAAH8AgQAAgQAAgQAAAIEAAH8AfwAAAH8AgQAAAAB/fwAAfwAAAIEAAH8AAAB/fwAAgQAAAIEAAKZagQAAgQAAAAB/AKZaAAB/fwAAfwAAAKZafwAAAIEAAKZaAH8AAAB/AIEAAIEAAH8AAH8AAAB/AIEAAH8AAAB/AAB/AIEAAAB/AAB/AAB/AAB/fwAAAIEAAH8AgQAAAAB/AAB/AAB/AAB/AAB/AH8AgQAAgQAAAAB/AIEAgQAAAIEAAH8AfwAAAH8AgQAAAAB/fwAAAIEAAH8AAAB/fwAAAAB/fwAAAIEAgQAAgQAAAAB/gQAAgQAAAAB/AAB/AAB/AAB/fwAAAAB/fwAAAAB/fwAAAAB/fwAAAH8AgQAAgQAAgQAAAIEAAH8AfwAAAH8AgQAAAAB/fwAAfwAAAIEAAH8AAAB/fwAAgQAAAIEAAKZagQAAgQAAAAB/AKZaAAB/fwAAfwAAAKZafwAAAIEAAKZaAH8AAAB/AIEAAIEAAH8AAH8AAAB/AIEAAH8AAAB/AAB/AIEAAAB/AAB/AAB/AAB/AH8AfwAAgQAAAIEAAAB/AAB/AAB/AAB/AH8AgQAAgQAAAAB/AIEAgQAAAIEAAH8AfwAAAH8AgQAAAAB/fwAAAIEAAH8AAAB/fwAAAAB/fwAAAIEAgQAAgQAAAAB/gQAAgQAAAAB/AAB/AAB/AAB/fwAAAAB/fwAAAAB/fwAAAAB/fwAAAH8AgQAAgQAAgQAAAIEAAH8AfwAAAH8AgQAAAAB/fwAAfwAAAIEAAH8AAAB/fwAAgQAAAIEAAKZagQAAgQAAAAB/AKZaAAB/fwAAfwAAAKZafwAAAIEAAKZaAH8AAAB/AIEAAIEAAH8AAH8AAAB/AIEAAH8AAAB/AAB/AIEAAAB/AAB/AAB/AAB/gQAAAAB/AIEAAH8AgQAAAAB/AAB/AAB/AAB/AH8AgQAAgQAAAAB/AIEAgQAAAIEAAH8AfwAAAH8AgQAAAAB/fwAAAIEAAH8AAAB/fwAAAAB/fwAAAIEAgQAAgQAAAAB/gQAAgQAAAAB/AAB/AAB/AAB/fwAAAAB/fwAAAAB/fwAAAAB/fwAAAH8AgQAAgQAAgQAAAIEAAH8AfwAAAH8AgQAAAAB/fwAAfwAAAIEAAH8AAAB/fwAAgQAAAIEAAKZagQAAgQAAAAB/AKZaAAB/fwAAfwAAAKZafwAAAIEAAKZaAH8AAAB/AIEAAIEAAH8AAH8AAAB/AIEAAH8AAAB/AAB/AIEAAAB/AAB/AAB/AAB/AAB/AAB/AAB/AAB/AAB/AAB/AH8AgQAAgQAAAAB/AIEAgQAAAIEAAH8AfwAAAH8AgQAAAAB/fwAAAIEAAH8AAAB/fwAAAAB/fwAAAIEAgQAAgQAAAAB/gQAAgQAAAAB/AAB/AAB/AAB/fwAAAAB/fwAAAAB/fwAAAAB/fwAAAH8AgQAAgQAAAIEAAH8AfwAAAH8AgQAAAAB/fwAAfwAAAIEAAH8AAAB/fwAAgQAAAIEAAKZagQAAAAB/AKZaAAB/fwAAfwAAAKZafwAAAIEAAKZaAH8AAAB/AIEAAIEAAH8AAH8AAAB/AIEAAH8AAAB/AAB/AIEAAAB/AAB/AAB/AAB/AAB/AAB/gQAAgQAAAAB/gQAAgQAAAAB/AAB/AAB/AAB/fwAAAAB/fwAAAAB/fwAAAAB/fwAAAH8AgQAAgQAAgQAAAIEAAH8AfwAAAH8AgQAAAAB/fwAAAIEAAH8AAAB/fwAAgQAAAIEAAKZagQAAgQAAAAB/AKZaAAB/fwAAAKZafwAAAIEAAKZaAH8AAAB/AIEAAIEAAH8AAH8AAAB/AIEAAH8AAAB/AAB/AIEAAAB/AAB/AAB/AAB/AAB/AAB/AAB/AAB/AH8AgQAAgQAAAAB/AIEAgQAAAIEAAH8AfwAAAH8AgQAAAAB/fwAAAIEAAH8AAAB/fwAAAAB/fwAAAIEAgQAAgQAAAAB/gQAAgQAAAAB/AAB/AAB/AAB/fwAAAAB/fwAAAAB/fwAAAAB/fwAAAH8AgQAAgQAAgQAAAIEAAH8AfwAAAH8AgQAAAAB/fwAAAIEAAH8AAAB/fwAAgQAAAIEAAKZagQAAgQAAAAB/AKZaAAB/fwAAAKZafwAAAIEAAKZaAH8AAAB/AIEAAIEAAH8AAH8AAAB/AIEAAH8AAAB/AAB/AIEAAAB/AAB/AAB/AAB/AAB/AAB/AAB/AAB/AH8AgQAAgQAAAAB/AIEAgQAAAIEAAH8AfwAAAH8AgQAAAAB/fwAAAIEAAH8AAAB/fwAAAAB/fwAAAIEAgQAAgQAAAAB/gQAAgQAAAAB/AAB/AAB/AAB/fwAAAAB/fwAAAAB/fwAAAAB/fwAAAH8AgQAAgQAAgQAAAIEAAH8AfwAAAH8AgQAAAAB/fwAAAIEAAH8AAAB/fwAAgQAAAIEAAKZagQAAgQAAAAB/AKZaAAB/fwAAAKZafwAAAIEAAKZaAH8AAAB/AIEAAIEAAH8AAH8AAAB/AIEAAH8AAAB/AAB/AIEAAAB/AAB/AAB/AAB/AAB/AAB/AAB/AAB/AH8AgQAAgQAAAAB/AIEAgQAAAIEAAH8AfwAAAH8AgQAAAAB/fwAAAIEAAH8AAAB/fwAAAAB/fwAAAIEAgQAAgQAAAAB/gQAAgQAAAAB/AAB/AAB/AAB/fwAAAAB/fwAAAAB/fwAAAAB/fwAAAH8AgQAAgQAAgQAAAIEAAH8AfwAAAH8AgQAAAAB/fwAAAIEAAH8AAAB/fwAAgQAAAIEAAKZagQAAgQAAAAB/AKZaAAB/fwAAAKZafwAAAIEAAKZaAH8AAAB/AIEAAIEAAH8AAH8AAAB/AIEAAH8AAAB/AAB/AIEAAAB/AAB/AAB/AAB/AAB/fwAAAIEAAH8AAAB/fwAAfwAAAIEAAH8AgQAAAAB/AH8AfwAAgQAAAIEAgQAAAAB/AIEAAH8AgQAAAAB/AAB/AAB/AAB/gQAAgQAAAAB/gQAAgQAAAAB/AAB/AAB/AAB/fwAAAAB/fwAAAAB/fwAAAAB/fwAAAH8AgQAAgQAAgQAAAIEAAH8AfwAAAH8AgQAAAAB/fwAAfwAAAIEAAH8AAAB/fwAAgQAAAIEAAKZagQAAgQAAAAB/AKZaAAB/fwAAfwAAAKZafwAAAIEAAKZaAH8AAAB/AIEAAIEAAH8AAH8AAAB/AIEAAH8AAAB/AAB/AIEAAAB/AAB/AAB/AAB/AAB/AAB/AAB/AAB/AH8AgQAAgQAAAAB/AIEAgQAAAIEAAH8AfwAAAH8AgQAAAAB/fwAAAIEAAH8AAAB/fwAAAAB/fwAAAIEAgQAAgQAAAAB/gQAAgQAAAAB/AAB/AAB/AAB/fwAAAAB/fwAAAAB/fwAAAAB/fwAAAH8AgQAAgQAAgQAAAIEAAH8AfwAAAH8AgQAAAAB/fwAAfwAAAIEAAH8AAAB/fwAAgQAAAIEAAKZagQAAgQAAAAB/AKZaAAB/fwAAfwAAAKZafwAAAIEAAKZaAH8AAAB/AIEAAIEAAH8AAH8AAAB/AIEAAH8AAAB/AAB/AIEAAAB/AAB/AAB/AAB/AAB/AH8AgQAAgQAAAAB/AIEAgQAAAIEAAH8AgQAAAAB/AAB/fwAAAAB/fwAAAAB/fwAAAAB/fwAAAH8AgQAAgQAAAIEAAH8AgQAAAAB/gQAAAAB/AIEAAAB/AAB/AH8AfwAAfwAAAIEAAH8AAAB/fwAAAAB/fwAAAIEAgQAAgQAAAAB/gQAAgQAAAAB/AAB/AAB/AH8AfwAAfwAAAIEAAH8AAAB/fwAAAAB/fwAAAIEAAAB/gQAAAAB/AIEAAH8AgQAAAAB/gQAAAACBAIEAAH8AgQAAAACBAAB/fwAAAIEAAH8AAAB/fwAAAACBfwAAAIEAAH8AAACBfwAAgQAAAIEAgQAAAIEAAH8AgQAAAH8AgQAAfwAAAIEAfwAAAIEAAH8AfwAAAH8AfwAAgQAAAAB/AIEAAH8AgQAAAAB/gQAAAACBAIEAAH8AgQAAAACBAAB/fwAAAIEAAH8AAAB/fwAAAACBfwAAAIEAAH8AAACBfwAAgQAAAAB/AIEAAH8AgQAAAAB/gQAAAACBAIEAAH8AgQAAAACBAAB/fwAAAIEAAH8AAAB/fwAAAACBfwAAAIEAAH8AAACBfwAAAH8Ak0AAAEBtAH8AAEBtbUAAAH8AAECTbUAAAH8Ak0AAAECTAH8AAEBtbUAAAH8Ak0AAAEBtAH8Ak0AAAECTAH8AAECTbUAAgQAAAIEAgQAAAIEAAH8AgQAAAH8AgQAAfwAAAIEAfwAAAIEAAH8AfwAAAH8AfwAAgQAAAAB/AIEAAH8AgQAAAAB/AAB/fwAAAIEAAH8AAAB/fwAAgQAAAIEAAH8AgQAAfwAAAIEAAH8AfwAAgQAAAAB/AIEAAH8AgQAAAAB/AAB/fwAAAIEAAH8AAAB/fwAAgQAAAAB/AIEAAH8AgQAAAAB/gQAAAACBAIEAAH8AgQAAAACBAAB/fwAAAIEAAH8AAAB/fwAAAACBfwAAAIEAAH8AAACBfwAAAH8Ak0AAAEBtAH8AAEBtbUAAAH8AAECTbUAAAH8Ak0AAAECTAH8AAEBtbUAAAH8Ak0AAAEBtAH8Ak0AAAECTAH8AAECTbUAAgQAAAIEAAH8AgQAAfwAAAIEAAH8AfwAAAAB/fwAAAAB/fwAAAAB/AAB/AAB/AAB/AH8AgQAAgQAAAAB/AIEAgQAAAIEAAH8AfwAAAH8AgQAAAAB/fwAAAIEAAH8AAAB/fwAAAAB/fwAAAIEAgQAAgQAAAAB/gQAAgQAAAAB/AAB/AAB/AAB/fwAAAAB/fwAAAAB/fwAAAAB/fwAAAH8AgQAAgQAAAH8AfwAAAH8AgQAAAAB/fwAAAH8AAAB/fwAAgQAAAAB/AAB/fwAAAH8AAAB/AIEAAIEAAH8AAH8AAAB/AIEAAH8AAAB/AAB/AIEAAAB/AAB/AAB/AAB/gQAAgQAAAAB/gQAAgQAAAAB/AAB/AAB/AAB/fwAAAAB/fwAAAAB/fwAAAAB/fwAAAAB/AAB/AAB/AAB/AH8AAAB/AH8AAH8AAAB/AH8AAAB/AAB/pqYAt7dJAIEAAKZapgBaAAB/t7dJAKZagQAApgBapqYAt7dJt0lJAFpapgBaAAB/ploAt0lJAFpaAH8AploAt0lJgQAApgBapqYAt7e3AIEAAKamgQAApgCmpqYAt7e3pgCmt7e3AKamploAt0m3AFqmAH8At0m3AFqmpgCmploAt0m3gQAApgCmAIEA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h1hfLodYXy6HWF8uj1pXII9aVyCPWlckj1pXJIdYVyCHWFcgh1hXJIdYVySHWEAMh1hADIdYQAyHWEAMh1hIFodYSBaHWEgah1hIGo9aSBaPWkgWj1pIGo9aSBqHWF8uh1hfLodYXy6HWF8uh1hXIIdYVySHWFckj1pXII9aVyCPWlckj1pXJIdYQAyHWEAMh1hADIdYQAyPWkgWj1pIFo9aSBqPWkgah1hIFodYSBaHWEgaxGI/qMRiFqA4ZRagOGU/qMdiQ6jHYhqgO2UaoDtlQ6jEYmebxGI+kzhlPpM4ZWebx2Jrm8diQpM7ZUKTO2Vrm8QCj1LEAmdKOAVnSjgFj1LIApNSyAJrSjsFa0o7BZNSxGIjjMRi+oM4ZfqDOGUjjMdiJ4zHYv6DO2X+gztlJ4w7pdchO6WvGceirxnHotchOKXTITilqxnEoqsZxKLTIaYG4GSmBh9XWhrgZFoaH1clJuA2JSYfKdo54DbaOR8ppSlgFaUpnwdaPWAVWj2fB/IsqV/yLFVq8iyrbw43qR8ON1UqDjerLw43JQwONycc8iwlTPIsJ1zyLKlf8ixVag43qR8ON1Uq8iypX/IsVWoON6kfDjdVKvIsqV/yLFVqDjepHw43VSryLKlf8ixVag43qR8ON1Uq8iypX/IsVWoON6kfDjdVKvIsJUwONyUM8iwlTA43JQzyLCVMDjclDPIsJUwONyUM8iwlTA43JQwON7Uv8iy1b/Ise3LyLNF3Djd7Mg430TfyLHtyDjd7MvIse3ION3sy8ix7cg43ezLyLHtyDjd7MvIse3ION3syDjfaN/Is2nc=","bwBoAHIAFgAZADkAFgA5ADsADAAmAC8ADAAvAAkAJwAqAD4AJwA+AEAAHwBpAFgAHwBYAD0ACQAHABEACQARAA4ABwB0ABQABwAUABEAdABzABcAdAAXABQAAgAIAB0AAgAdABoAawBLAAIAawACABoAcQYKAFYBcQZWAVMBCAACACMACAAjACAAAgBxBlMBAgBTASMADABzBikADAApACYAcwYHACwAcwYsACkABwAJAC8ABwAvACwAMAAoAEEAMABBAEIAKwAtAEQAKwBEAD8ALgAxAEMALgBDAEUADwASADQADwA0ADYAGAAQADcAGAA3ADgAMwBaAGwAMwBsABwAGwAeADwAGwA8ADIAEwAVADoAEwA6ADUAFwBzAAkAFwAJAA4AVgEKAAgAVgEIACAABABOAUYABABGAEkAHQAIAHIAXgBmAFYAXgBWAFMAZwBkAFUAZwBVAFcAagBtAFsAagBbAFkAdABPAGUAdABlAFwAbwBLAGsAbwBrAGgAYABdAFIAYABSAFAATwBxAGIATwBiAGUAcwB0AFwAcwBcAF8AcwBfAGIAcwBiAHEAaAAdAHIAYwBhAFEAYwBRAFQAbgADAEgAbgBIAEoABQBwAE4ABQBOAEwAgACDAJUAgACVAJcAoQABAFIBoQBSAU0AcwaEAI0AcwaNAAcAhQCIAJgAhQCYAJoABwB3AHsABwB7AHgAdwC4AH4AdwB+AHsAuAB0AIEAuACBAH4AcwZ1AIcAcwaHAIQAdQB3AIoAdQCKAIcAdwAHAI0AdwCNAIoAjgCGAJsAjgCbAJwAiQCLAJ4AiQCeAJkAjACPAJ0AjACdAJ8AeQB8AJAAeQCQAJIAggB6AJMAggCTAJQAfQB/AJYAfQCWAJEAgQB0AAcAgQAHAHgATQBSAVABTQBQAQYArgC2AKoArgCqAKcAtwC0AKkAtwCpAKsAuACjALUAuAC1AKwAsACtAKYAsACmAKQAowBPALIAowCyALUAdAC4AKwAdACsAK8AdACvALIAdACyAE8AswCxAKUAswClAKgATABOAKIATACiAKAA2ADcAO8A2ADvAOoAGAHaANcAGAHXAMYA0ADSAOQA0ADkAOcATwHEALoATwG6AEcAvQC7AMsAvQDLAMgAuwAYAc4AuwDOAMsAxgC9AMgAxgDIANEAwQDGANcAwQDXANQAGAHAAN0AGAHdANoAwADBANQAwADUAN0A2wDeAOwA2wDsAO4AyQDNAOEAyQDhAOIA0wDKAOMA0wDjAOUA1gDZAOsA1gDrAOkAzADPAOYAzADmAOAA3wDVAOgA3wDoAO0AzgAYAcYAzgDGANEAwwAZAR0BwwAdAbkAvgAbARkBvgAZAcMADwEaARgBDwEYAQwBEwEQAfgAEwH4AP4AAgEKAfYAAgH2APMACwEIAfUACwH1APcADgEXAf0ADgH9APsAHAHAAAkBHAEJAQABGAG7ABUBGAEVAQwBBAEBAfIABAHyAPAAwAAYAQYBwAAGAQkBuwAeARIBuwASARUBGgEcAQABGgEAAQMBFgEUAf8AFgH/APwAHgEaAQ8BHgEPARIBGgEDAQYBGgEGARgBEQENAfoAEQH6APkABwEFAfEABwHxAPQAUQG/AMQAUQHEAE8BKAEsATcBKAE3ATIBwAAqAScBwAAnAcEAIgHBACcBIgEnASQBwAAhAS0BwAAtASoBIQEiASQBIQEkAS0BKwEuATQBKwE0ATYBJgEpATMBJgEzATEBLwElATABLwEwATUBHwFMARsBHwEbAb4AQgFKAT4BQgE+ATsBSwFIAT0BSwE9AT8BTQEhAUkBTQFJAUABRAFBAToBRAE6ATgBIQHAAEYBIQFGAUkBHAFNAUABHAFAAUMBHAFDAUYBHAFGAcAARwFFATkBRwE5ATwBAAAgAb8AAAC/AFEBWAEhAF8BWAFfAV4BIgAlAFwBIgBcAWABJABVAVoBJABaAVsBVAFXAV0BVAFdAVkBsQGzAWEBsQFhAWQBdAFwAWgBdAFoAXYBcQFtAXUBcQF1AXcBZgFqAWcBZgFnAW8BbAFlAW4BbAFuAXMBawFyAXgBawF4AWkBfwF+AXsBfwF7AYABeQF8AXoBeQF6AX0BhQGDAYEBhQGBAYcBhAGCAYYBhAGGAYgBjQGUAaMBjQGjAZkBlgGSAZ0BlgGdAZ8BjgGJAZABjgGQAZUBkwGPAZcBkwGXAaABoQGeAZoBoQGaAaQBjAGYAZwBigGLAZsBigGbAZEBogGTAaABrgGrAaYBrgGmAa8BYwFiAbQBYwG0AbIBqQGlAaoBqQGqAa0BqAGsAbABqAGwAacBDQIPArsBDQK7Ab4BzgHKAcIBzgHCAdABywHHAc8BywHPAdEBwAHEAcEBwAHBAckBxgG/AcgBxgHIAc0BxQHMAdIBxQHSAcMB2QHYAdUB2QHVAdoB0wHWAdQB0wHUAdcB3wHdAdsB3wHbAeEB3gHcAeAB3gHgAeIB5wHvAf8B5wH/AfQB8QHsAfgB8QH4AfoB6AHjAeoB6AHqAfAB7QHpAfIB7QHyAfsB/QH5AfUB/QH1AQAC5QHzAfYB5AHmAfcB5AH3AesB/gHuAfwBCgIHAgICCgICAgsCvQG8ARACvQEQAg4CBQIBAgYCBQIGAgkCBAIIAgwCBAIMAgMCaAJqAhYCaAIWAhkCKQIlAh0CKQIdAisCJgIiAioCJgIqAiwCGwIfAhwCGwIcAiQCIQIaAiMCIQIjAigCIAInAi0CIAItAh4CNAIzAjACNAIwAjUCLgIxAi8CLgIvAjICOgI4AjYCOgI2AjwCOQI3AjsCOQI7Aj0CQgJKAloCQgJaAk8CTAJHAlMCTAJTAlUCQwI+AkUCQwJFAksCSAJEAk0CSAJNAlYCWAJUAlACWAJQAlsCQAJOAlECPwJBAlICPwJSAkYCWQJJAlcCZQJiAl0CZQJdAmYCGAIXAmsCGAJrAmkCYAJcAmECYAJhAmQCXwJjAmcCXwJnAl4CwgLEAnACwgJwAnMCgwJ/AncCgwJ3AoUCgAJ8AoQCgAKEAoYCdQJ5AnYCdQJ2An4CewJ0An0CewJ9AoICegKBAocCegKHAngCjgKNAooCjgKKAo8CiAKLAokCiAKJAowClAKSApAClAKQApYCkwKRApUCkwKVApcCnAKkArQCnAK0AqkCpgKhAq0CpgKtAq8CnQKYAp8CnQKfAqUCogKeAqcCogKnArACsgKuAqoCsgKqArUCmwKoAqwCmQKaAqsCmQKrAqACswKjArECvwK8ArcCvwK3AsACcgJxAsUCcgLFAsMCugK2ArsCugK7Ar4CuQK9AsECuQLBArgCHQMfA8sCHQPLAs4C3gLaAtIC3gLSAuAC2wLXAt8C2wLfAuEC0ALUAtEC0ALRAtkC1gLPAtgC1gLYAt0C1QLcAuIC1QLiAtMC6QLoAuUC6QLlAuoC4wLmAuQC4wLkAucC7wLtAusC7wLrAvEC7gLsAvAC7gLwAvIC9wL/Ag8D9wIPAwQDAQP8AggDAQMIAwoD+ALzAvoC+AL6AgAD/gL5AgID/gICAwwDDQMJAwUDDQMFAxAD9QIDAwYD9AL2AgcD9AIHA/sCDgP9AgsDGgMXAxIDGgMSAxsDzQLMAiADzQIgAx4DFQMRAxYDFQMWAxkDFAMYAxwDFAMcAxMDcwN1AyMDcwMjAyYDNgMyAyoDNgMqAzgDMwMvAzcDMwM3AzkDKAMsAykDKAMpAzEDLgMnAzADLgMwAzUDLQM0AzoDLQM6AysDQQNAAz0DQQM9A0IDOwM+AzwDOwM8Az8DRwNFA0MDRwNDA0kDRgNEA0gDRgNIA0oDTgNWA2UDTgNlA1sDWANTA14DWANeA2ADTwNLA1EDTwNRA1cDVQNQA1kDVQNZA2IDYwNfA1wDYwNcA2YDTQNaA10DTANNA10DTANdA1IDZANUA2EDcANtA2gDcANoA3EDJQMkA3YDJQN2A3QDawNnA2wDawNsA28DagNuA3IDagNyA2kDsQOzA3gDsQN4AyEDuQEVAscCuQHHArUBEQJtAroBEQK6AbYBygJuAsYCygLGAhQCbALJAhMCbAITArgBbwISArcBbwK3AcgCfwN+A3sDfwN7A4ADeQN8A3oDeQN6A30DhQODA4EDhQOBA4cDhAOCA4YDhAOGA4gDjQOUA6MDjQOjA5kDlgOSA50DlgOdA58DjgOJA5ADjgOQA5UDkwOPA5cDkwOXA6ADoQOeA5oDoQOaA6QDjAOYA5wDigOLA5sDigObA5EDogOTA6ADrgOrA6YDrgOmA68DIgN3A7QDIgO0A7IDqQOlA6oDqQOqA60DqAOsA7ADqAOwA6cDBQQHBLUDBQS1A7gDyAPEA7wDyAO8A8oDxQPBA8kDxQPJA8sDugO+A7sDugO7A8MDwAO5A8IDwAPCA8cDvwPGA8wDvwPMA70D0wPSA88D0wPPA9QDzQPQA84DzQPOA9ED2QPXA9UD2QPVA9sD2APWA9oD2APaA9wD4QPoA/cD4QP3A+0D6gPmA/ED6gPxA/MD4gPdA+QD4gPkA+kD5wPjA+sD5wPrA/QD9QPyA+4D9QPuA/gD4APsA/AD3gPfA+8D3gPvA+UD9gPnA/QDAgT/A/oDAgT6AwMEtwO2AwgEtwMIBAYE/QP5A/4D/QP+AwEE/AMABAQE/AMEBPsDWQRbBAkEWQQJBAwEHAQYBBAEHAQQBB4EGQQVBB0EGQQdBB8EDgQSBA8EDgQPBBcEFAQNBBYEFAQWBBsEEwQaBCAEEwQgBBEEJwQmBCMEJwQjBCgEIQQkBCIEIQQiBCUELQQrBCkELQQpBC8ELAQqBC4ELAQuBDAENQQ8BEsENQRLBEEEPgQ6BEUEPgRFBEcENgQxBDgENgQ4BD0EOwQ3BD8EOwQ/BEgESQRGBEIESQRCBEwEMwRABEMEMgQ0BEQEMgREBDkESgQ7BEgEVgRTBE4EVgROBFcECwQKBFwECwRcBFoEUQRNBFIEUQRSBFUEUARUBFgEUARYBE8ErQSvBF0ErQRdBGAEcARsBGQEcARkBHIEbQRpBHEEbQRxBHMEYgRmBGMEYgRjBGsEaARhBGoEaARqBG8EZwRuBHQEZwR0BGUEewR6BHcEewR3BHwEdQR4BHYEdQR2BHkEgQR/BH0EgQR9BIMEgAR+BIIEgASCBIQEiQSQBJ8EiQSfBJUEkgSOBJkEkgSZBJsEigSFBIwEigSMBJEEjwSLBJMEjwSTBJwEnQSaBJYEnQSWBKAEhwSUBJcEhgSIBJgEhgSYBI0EngSPBJwEqgSnBKIEqgSiBKsEXwReBLAEXwSwBK4EpQShBKYEpQSmBKkEpASoBKwEpASsBKMEAwUFBcgEAwXIBMUEtQS7BMEEtQTBBLEEtwS9BLYEtwS2BLIExAS+BMAExATABLoEvATDBLkEvAS5BLQEvwS4BLMEvwSzBMIEzwTOBMsEzwTLBNAEyQTMBMoEyQTKBM0E1QTTBNEE1QTRBNcE1ATSBNYE1ATWBNgE3QTlBPUE3QT1BOoE5wTiBO4E5wTuBPAE3gTZBOAE3gTgBOYE4wTfBOgE4wToBPEE8wTvBOsE8wTrBPYE3ATpBO0E2gTbBOwE2gTsBOEE9ATkBPIEAAX9BPgEAAX4BAEFxgTHBAYFxgQGBQQF+wT3BPwE+wT8BP8E+gT+BAIF+gQCBfkEWQVbBQcFWQUHBQoFGgUWBQ4FGgUOBRwFFwUTBRsFFwUbBR0FDAUQBQ0FDAUNBRUFEgULBRQFEgUUBRkFEQUYBR4FEQUeBQ8FJQUkBSEFJQUhBSYFHwUiBSAFHwUgBSMFKwUpBScFKwUnBS0FKgUoBSwFKgUsBS4FMwU7BUsFMwVLBUAFPQU4BUQFPQVEBUYFNAUvBTYFNAU2BTwFOQU1BT4FOQU+BUcFSQVFBUEFSQVBBUwFMgU/BUMFMAUxBUIFMAVCBTcFSgU6BUgFVgVTBU4FVgVOBVcFCQUIBVwFCQVcBVoFUQVNBVIFUQVSBVUFUAVUBVgFUAVYBU8FXwVjBWAFXwVgBWYFgQVnBWEFgQVhBYMFbAVqBWgFbAVoBW4FawVpBW0FawVtBW8FcAV0BZIFcAWSBY4FcQVyBXcFcQV3BXUFmAV6BV0FmAVdBXsFhQViBWQFhQVkBX8FfgV9BYIFfgWCBYQFfAVeBWUFfAVlBYAFjAWLBYgFjAWIBY0FhgWJBYcFhgWHBYoFdgV4BZUFdgWVBZMFkAWPBZQFkAWUBZYFsQW4BaMFsQWjBZ8FoAWkBa8FoAWvBasFuQXABaoFuQWqBaYFpQWpBZ4FpQWeBZoFtAW6BacFtAWnBZsFvwW1BZwFvwWcBagFrgWiBbcFrgW3Bb0FoQWtBbwFoQW8BbIFrAWwBb4FrAW+BbsFmQWdBbYFmQW2BbMFCQYQBssFCQbLBccFyAXMBdcFyAXXBdMFEQYYBtIFEQbSBc4FzQXRBcYFzQXGBcIFDAYSBs8FDAbPBcMFFwYNBsQFFwbEBdAF2QXdBeMF2QXjBd8F4AXkBe8F4AXvBesF7AXwBeoF7AXqBeYF5QXpBd4F5QXeBdoF4QXtBecF4QXnBdsF9gX5BQgG9gUIBv8F7gXiBfQF7gX0BfEF4gXcBfcF4gX3BfQF3AXoBfoF3AX6BfcF6AXuBfEF6AXxBfoFAAb9BQYGAAYGBgMG8wX1Bf4F8wX+BQIG+AX8BQUG+AUFBgcG+wXyBQEG+wUBBgQG1gXKBQ8G1gUPBhUGyQXVBRQGyQUUBgoG1AXYBRYG1AUWBhMGwQXFBQ4GwQUOBgsGKQYsBiQGKQYkBiAGHwYjBh4GHwYeBhoGJgYqBiEGJgYhBhsGKwYnBhwGKwYcBiIGGQYdBigGGQYoBiUGbQZwBjgGbQY4BjQGMwY3BjIGMwYyBi4GagZuBjUGagY1Bi8GbwZrBjAGbwYwBjYGOQY9BkMGOQZDBj8GQAZEBk8GQAZPBksGTAZQBkoGTAZKBkYGRQZJBj4GRQY+BjoGQQZNBkcGQQZHBjsGVgZZBmgGVgZoBl8GTgZCBlQGTgZUBlEGQgY8BlcGQgZXBlQGPAZIBloGPAZaBlcGSAZOBlEGSAZRBloGYAZdBmYGYAZmBmMGUwZVBl4GUwZeBmIGWAZcBmUGWAZlBmcGWwZSBmEGWwZhBmQGLQYxBmwGLQZsBmkGDQDHAMIADQDCAHQGdAbCACMBdAYjAXYAcga8AMUAcgbFAAsAeQVzBZEFeQWRBZcFuQa7BnUGuQZ1BngGiAaEBnwGiAZ8BooGhQaBBokGhQaJBosGegZ+BnsGegZ7BoMGgAZ5BoIGgAaCBocGfwaGBowGfwaMBn0GkwaSBo8GkwaPBpQGjQaQBo4GjQaOBpEGmQaXBpUGmQaVBpsGmAaWBpoGmAaaBpwGpwakBqoGpwaqBqsGoAadBqIGoAaiBqYGpQahBqgGpQaoBqwGngafBqkGngapBqMGtgazBq4GtgauBrcGdwZ2BrwGdwa8BroGsQatBrIGsQayBrUGsAa0BrgGsAa4Bq8GwwbCBr8Gwwa/BsQGvQbABr4GvQa+BsEGyQbHBsUGyQbFBssGyAbGBsoGyAbKBswGzQbOBtAGzQbQBs8G1wbVBtIG1wbSBtgG0wbRBtQG0wbUBtYGDwcZB+gGDwfoBt4GJwcxBx4HJwceBwwHKwf/BuwGKwfsBhQH4QbvBgUH4QYFB/UG2gbfBuQG5QbqBu4G8gb4BvoG/QYABwQHCQcNBxIHFQcYBxsHIQclBygHLAcuBzMH8QbZBuMG8QbjBvcG3QbnBvAG3QbwBuIG6Qb8BgMH6QYDB+0GAgf5BvYGAgf2BgYHIAf0BvsGIAf7BiQH/gYqBzIH/gYyBwEHMAcmByMHMAcjBzQHCgciBykHCgcpBw4HLQcWBxwHLQccBy8HGgcQBwsHGgcLBx0H3AYIBxEH3AYRB+AGEwfrBuYGEwfmBhcH8wYfBwcH8wYHB9sGNwc4BzUHNwc1BzYHOwc8BzkHOwc5BzoHPwdABz0HPwc9Bz4HQwdEB0EHQwdBB0IHRwdGB0UHRwdFB0gHSwdKB0kHSwdJB0wHTwdOB00HTwdNB1AHUwdSB1EHUwdRB1QHVgdVB1gHVgdYB1cHWgdbB1wHWgdcB1kHYAdeB10HYAddB18HZAdiB2EHZAdhB2MHaAdmB2UHaAdlB2cHiAeFB2wHiAdsB28HcQdpB3MHcQdzB48HkAd1B3kHkAd5B44HjQd3B3sHjQd7B4sHjAd9B4EHjAeBB4oHiQd/B4MHiQeDB4cHawdyB5IHcAduB5EHfgecB54HfgeeB4IHdgeYB5oHdgeaB3oHkgeiB5QHkgeUB2sHgAedB58HgAefB4QHeAeZB5sHeAebB3wHageTB5cHageXB3QHbgeWB6EHbgehB5EHhgegB5UHhgeVB20H");
})();
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
    // TREE-COLLIDE: pień to walec. Siatka ma komórki 16 m, więc sprawdzane są tylko drzewa obok.
    if (withTrees && W.treeGrid) {
      const ts = W.treeGrid.s; const tr = 0.52;
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
(function () {
  function b64(s) {
    const bin = atob(s), n = bin.length, a = new Uint8Array(n);
    for (let i = 0; i < n; i++) a[i] = bin.charCodeAt(i);
    return a;
  }
  function bits(bytes, n) {
    const t = new Uint8Array(n);
    for (let i = 0; i < n; i++) if (bytes[i >> 3] & (1 << (i & 7))) t[i] = 1;
    return t;
  }
  function K(name, n, ni, ax, ay, az, qs, wr, wp, offs, rad, len, wid, h, p64, n64, c64, i64, body64, acc64) {
    const pb = b64(p64), nb = b64(n64), cb = b64(c64), ib = b64(i64);
    const pos = new Float32Array(n * 3), nrm = new Float32Array(n * 3), col = new Float32Array(n * 3);
    const pv = new Uint16Array(pb.buffer, pb.byteOffset, n * 3);
    const nv = new Int8Array(nb.buffer, nb.byteOffset, n * 3);
    for (let i = 0; i < n * 3; i++) {
      const a = i % 3 === 0 ? ax : i % 3 === 1 ? ay : az;
      pos[i] = a + pv[i] * qs;
      nrm[i] = nv[i] / 127;
    }
    for (let i = 0; i < n * 3; i++) col[i] = cb[i] / 255;
    const idx = new Uint16Array(ib.buffer, ib.byteOffset, ni);
    const tags = bits(b64(body64), n);
    const acc = bits(b64(acc64), n);
    for (let i = 0; i < n; i++) if (acc[i]) tags[i] = 2;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    g.userData.tags = tags;
    g.computeBoundingSphere();
    KIT[name] = { geo: g, wr, wp, offs, rad, len, wid, h };
  }
  K("khatch",1597,2280,-0.832,0.192,-1.856,5.6e-05,0.384,[[-0.384, 1.037], [0.384, 1.037], [-0.384, -1.037], [0.384, -1.037]],[-1.131, 0, 1.131],0.9,3.648,1.664,1.408,"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AACBAACBAH8AAH8AAH8AAH8AAJLBAIXfAJLBAIXfAMGSAKamAMGSAKamAAB/AAB/APh/APh/AKamAJLBAKamAJLBAJI/AKZaAJI/AKZaAIXfAIEAAIXfAIEAAIUhAJI/AIUhAJI/APh/APh/AN97AN97AN97AN97AMFuAMFuAPiBAN+FAPiBAN+FAMFuAMFuAKZaAKZaAN+FAMGSAN+FAMGSAACBAACBAPiBAPiBAIEAAIUhAIEAAIUhAPiBAPiBAN+FAN+FAAB/AAB/APh/APh/AIEAAIUhAIEAAIUhAIUhAJI/AIUhAJI/AMGSAMGSAKamAKamAPh/APh/AN97AN97AMFuAMFuAKZaAKZaAN97AN97AMFuAMFuAJI/AKZaAJI/AKZaAKamAJLBAKamAJLBAIXfAIEAAIXfAIEAAN+FAN+FAMGSAMGSAJLBAIXfAJLBAIXfgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAAACBAACBAPiBAPiBAACBAACBAPiBAPiBAJI/AKZaAJI/AKZaAN+FAMGSAN+FAMGSAIEAAIUhAIEAAIUhAMGSAKamAMGSAKamAJLBAIXfAJLBAIXfAN97AN97AMFuAMFuAMFuAMFuAKZaAKZaAKamAJLBAKamAJLBAIUhAJI/AIUhAJI/APiBAN+FAPiBAN+FAO9+AO9+AN97AN97AIXfAIEAAIXfAIEAAPiBAPiBAN+FAN+FAIUhAJI/AIUhAJI/AO9+AO9+AN97AN97AKamAJLBAKamAJLBAN97AN97AMFuAMFugQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAAN+FAN+FAMGSAMGSAIXfAIEAAIXfAIEAAMGSAKamAMGSAKamAJI/AKZaAJI/AKZaAJLBAIXfAJLBAIXfAACBAACBAPiBAPiBfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAAIEAAIUhAIEAAIUhAMFuAMFuAKZaAKZaAACBAACBAACBAAB/AAB/AAB/AAB/gQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAA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AACBAACBAACBAACBAACBAACBAACBAACBAACBAH8AAH8Az3UAz3UAMXUAMXUAAH8AAH8Az3UAz3UAizEAizEAdTEAdTEAMXUAMXUAgQAAgQAAgQAAizEAgQAAizEAdTEAfwAAdTEAfwAAfwAAfwAAAACBAACBAACBAACBAACBAACBAACBAACBAAB/AAB/AAB/AAB/AAB/AAB/AAB/AAB/AACBAACBAACBAACBAACBAACBAACBAACBAHDFAHDFAHDFAHDFAHDFAHDFAHDFAHDFiCgAiCgAiCgAiCgAeCgAeCgAeCgAeCgAAGZMAGZMAGZMAGZMAAB/pgBaAAB/pgBagQAAgQAApgBapgBaWgBaAAB/WgBaAAB/fwAAfwAAWgBaWgBa","////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////QWeM////QWeM////////QWeMQWeM////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////QWeMQWeM////QWeM////QWeM////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////QWeM////QWeMQWeM////QWeMQWeMQWeM////QWeMQWeM////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHqQWeM////QWeM////////QWeMQWeM////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////QWeMQWeM////QWeM////QWeM////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////QWeM////QWeMQWeM////QWeMQWeMQWeM////QWeMQWeM////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHqQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeM6FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA6KiEcPY/gKiEcPY/gKiEcPY/gKiEcPY/gQWeMPY/gQWeMPY/gPY/gQWeMPY/gQWeMQWeMQWeMPY/gPY/gPY/gPY/gPY/gPY/gPY/gPY/gPY/gPY/gPY/gPY/gPY/gPY/gPY/gPY/gPY/gPY/g","AgABAAAAAQACAAMABgAFAAQABQAGAAcABwAGAAgACAAGAAkACAAJAAoACgAJAAsACgALAAwACgAMAA0ADQAMAA4ADQAOAA8ADQAPABAAEAAPABEAEAARABIAEgARABMAEgATABQAEgAUABUAFQAUABYAFQAWABcAFwAWABgAFwAYABkAGQAYABoAGQAaABsAGQAbABwAHAAbAB0AHAAdAB4AHAAeAB8AHAAfACAAHAAgACEAIAAfACIAJQAkACMAJAAlACYAJgAlACcAJgAnACgAJgAoACkAJgApACoAKgApACsAKwApACwAKwAsAC0ALQAsAC4ALgAsAC8ALgAvADAAMAAvADEAMAAxADIAMgAxADMAMgAzADQANAAzADUANQAzADYANQA2ADcANwA2ADgANwA4ADkAOQA4ADoAOgA4ADsAOgA7ADwAPAA7AD0APQA7AD4APgA7AD8APgA/AEAAQwBCAEEAQgBDAEQARABDAEUARQBDAEYARgBDAEcASgBJAEgASQBKAEsASwBKAEwATABKAE0AUABPAE4ATwBQAFEAVABTAFIAUwBUAFUAWABXAFYAVwBYAFkAXABbAFoAWwBcAF0AYABfAF4AXwBgAGEAZABjAGIAYwBkAGUAaABnAGYAZwBoAGkAZwBpAGoAbQBsAGsAbABtAG4AcQBwAG8AcABxAHIAdQB0AHMAdAB1AHYAeQB4AHcAeAB5AHoAfQB8AHsAfAB9AH4AgQCAAH8AgACBAIIAhQCEAIMAhACFAIYAiQCIAIcAiACJAIoAjQCMAIsAjACNAI4AkQCQAI8AkACRAJIAlQCUAJMAlACVAJYAlACWAJcAlACXAJgAmwCaAJkAmgCbAJwAnwCeAJ0AngCfAKAAowCiAKEAogCjAKQApwCmAKUApgCnAKgAqwCqAKkAqgCrAKwArwCuAK0ArgCvALAAswCyALEAsgCzALQAtwC2ALUAtgC3ALgAuwC6ALkAugC7ALwAvAC7AL0AwAC/AL4AvwDAAMEAxADDAMIAwwDEAMUAyADHAMYAxwDIAMkAxwDJAMoAzQDMAMsAzADNAM4AzgDNAM8A0gDRANAA0QDSANMA1gDVANQA1QDWANcA2gDZANgA2QDaANsA2wDaANwA3wDeAN0A3gDfAOAA4ADfAOEA5ADjAOIA4wDkAOUA6ADnAOYA5wDoAOkA7ADrAOoA6wDsAO0A8ADvAO4A7wDwAPEA9ADzAPIA8wD0APUA+AD3APYA9wD4APkA/AD7APoA+wD8AP0A+wD9AP4AAQEAAf8AAAEBAQIBBQEEAQMBBAEFAQYBBAEGAQcBCgEJAQgBCQEKAQsBDgENAQwBDQEOAQ8BDwEOARABDwEQAREBFAETARIBEwEUARUBFQEWARMBFQEUARcBFwEUARgBGQEWARUBGQEaARYBGwEaARkBHAEaARsBGgEcAR0BIAEfAR4BHwEgASEBJAEjASIBIwEkASUBKAEnASYBJwEoASkBJwEpASoBJwEqASsBJwErASwBLwEuAS0BLgEvATABMwEyATEBMgEzATQBNwE2ATUBOAE2ATcBOAE3ATkBOgE2ATgBOwE2AToBPAE2ATsBPAE9ATYBPgE9ATwBPwE9AT4BPwFAAT0BQQFAAT8BQQFCAUABQwFCAUEBRAFCAUMBRAFFAUIBRgFFAUQBRgFHAUUBSAFHAUYBSAFJAUcBSgFJAUgBSwFJAUoBSwFMAUkBTQFMAUsBTgFMAU0BTAFOAU8BUAFPAU4BUAFRAU8BUgFRAVABUQFSAVMBVgFVAVQBVQFWAVcBWgFZAVgBWQFaAVsBXgFdAVwBXQFeAV8BXwFgAV0BXwFeAWEBYQFeAWIBYwFgAV8BYwFkAWABYwFlAWQBZgFlAWMBZgFnAWUBaAFnAWYBaAFpAWcBagFpAWgBagFrAWkBagFsAWsBbQFsAWoBbQFuAWwBbwFuAW0BbwFwAW4BbwFxAXABcgFxAW8BcgFzAXEBcgF0AXMBdQF0AXIBdgF0AXUBdwF0AXYBeAF0AXcBdAF4AXkBfAF7AXoBewF8AX0BgAF/AX4BfwGAAYEBhAGDAYIBgwGEAYUBhQGEAYYBhgGEAYcBhgGHAYgBiAGHAYkBiQGHAYoBigGHAYsBjgGNAYwBjQGOAY8BjQGPAZABjQGQAZEBjQGRAZIBkgGRAZMBkgGTAZQBkgGUAZUBmAGXAZYBlwGYAZkBnAGbAZoBmwGcAZ0BoAGfAZ4BnwGgAaEBpAGjAaIBowGkAaUBqAGnAaYBpwGoAakBrAGrAaoBqwGsAa0BqwGtAa4BqwGuAa8BqwGvAbABsAGvAbEBsQGvAbIBsgGvAbMBsgGzAbQBsAGxAbUBtgG1AbEBtwGwAbUBuAGwAbcBuQGwAbgBugG1AbYBtQG6AbsBuwG6AbwBtgG9AboBvQG2Ab4BvQG+Ab8BwAGwAbkBwQGwAcABsAHBAcIBuQHDAcABuQHEAcMBxAG5AcUByAHHAcYBxwHIAckBzAHLAcoBywHMAc0B0AHPAc4BzwHQAdEB1AHTAdIB0wHUAdUB2AHXAdYB2AHZAdcB2gHZAdgB2wHZAdoB3AHZAdsB2QHcAd0B3gHdAdwB3gHfAd0B4AHfAd4B3wHgAeEB5AHjAeIB4wHkAeUB4wHlAeYB5gHlAecB5wHlAegB5wHoAekB5wHpAeoB6gHpAesB7gHtAewB7QHuAe8B8gHxAfAB8QHyAfMB9gH1AfQB9QH2AfcB+gH5AfgB+QH6AfsB/gH9AfwB/QH+Af8BAgIBAgACAQICAgMCBgIFAgQCBQIGAgcCCgIJAggCCQIKAgsCDgINAgwCDQIOAg8CEgIRAhACEQISAhMCEwISAhQCEwIUAhUCFQIUAhYCFQIWAhcCGgIZAhgCGQIaAhsCHgIdAhwCHQIeAh8CIgIhAiACIQIiAiMCJgIlAiQCJQImAicCKgIpAigCKQIqAisCLgItAiwCLQIuAi8CMgIxAjACMQIyAjMCNgI1AjQCNQI2AjcCOgI5AjgCOQI6AjsCOwI6AjwCOwI8Aj0CPQI8Aj4CPQI+Aj8CQgJBAkACQQJCAkMCRgJFAkQCRQJGAkcCSgJJAkgCSQJKAksCTgJNAkwCTQJOAk8CUgJRAlACVQJUAlMCWAJXAlYCVwJYAlkCXAJbAloCWwJcAl0CYAJfAl4CXwJgAmECZAJjAmICYwJkAmUCaAJnAmYCZwJoAmkCbAJrAmoCawJsAm0CcAJvAm4CbwJwAnECdAJzAnICcwJ0AnUCeAJ3AnYCdwJ4AnkCfAJ7AnoCewJ8An0CgAJ/An4CfwKAAoEChAKDAoICgwKEAoUCiAKHAoYChwKIAokCjAKLAooCiwKMAo0CkAKPAo4CjwKQApEClAKTApICkwKUApUCmAKXApYClwKYApkCnAKbApoCmwKcAp0CoAKfAp4CnwKgAqECpAKjAqICowKkAqUCqAKnAqYCpwKoAqkCrAKrAqoCqwKsAq0CsAKvAq4CrwKwArECtAKzArICswK0ArUCuAK3ArYCtwK4ArkCvAK7AroCuwK8Ar0CwAK/Ar4CvwLAAsECxALDAsICwwLEAsUCyALHAsYCxwLIAskCzALLAsoCywLMAs0CzQLMAs4CzgLMAs8CzwLMAtAC0ALMAtEC0QLMAtIC0gLMAtMC0wLMAtQC1ALMAtUC1QLMAtYC1gLMAtcC1wLMAtgC2wLaAtkC2gLbAtwC3ALbAt0C3ALdAt4C3ALeAt8C3ALfAuAC3ALgAuEC3ALhAuIC3ALiAuMC3ALjAuQC3ALkAuUC3ALlAuYC3ALmAucC6gLpAugC6QLqAusC7gLtAuwC7QLuAu8C8gLxAvAC8QLyAvMC9gL1AvQC9QL2AvcC+gL5AvgC+QL6AvsC/gL9AvwC/QL+Av8CAgMBAwADAQMCAwMDBgMFAwQDBQMGAwcDCgMJAwgDCQMKAwsDDgMNAwwDDQMOAw8DEgMRAxADEQMSAxMDFgMVAxQDFQMWAxcDGgMZAxgDGQMaAxsDHgMdAxwDHQMeAx8DIgMhAyADIQMiAyMDJgMlAyQDJQMmAycDKgMpAygDKQMqAysDLgMtAywDLQMuAy8DMgMxAzADMQMyAzMDNgM1AzQDNQM2AzcDNwM2AzgDOAM2AzkDOQM2AzoDOgM2AzsDOwM2AzwDPAM2Az0DPQM2Az4DPgM2Az8DPwM2A0ADQAM2A0EDQQM2A0IDRQNEA0MDRANFA0YDSQNIA0cDSANJA0oDTQNMA0sDTANNA04DUQNQA08DUANRA1IDVQNUA1MDVANVA1YDWQNYA1cDWANZA1oDXQNcA1sDXANdA14DXgNdA18DXgNfA2ADXgNgA2EDXgNhA2IDXgNiA2MDXgNjA2QDXgNkA2UDXgNlA2YDXgNmA2cDXgNnA2gDXgNoA2kDbANrA2oDawNsA20DcANvA24DbwNwA3EDKwUqBSkFKgUrBSwFLwUuBS0FLgUvBTAFMwUyBTEFMgUzBTQFNwU2BTUFNgU3BTgFOwU6BTkFOgU7BTwFOgU8BT0FPAU7BT4FPAU+BT8FPwU+BUAFQAU+BUEFQQU+BUIFRQVEBUMFRAVFBUYFSQVIBUcFSAVJBUoFSgVJBUsFSwVJBUwFSwVMBU0FTQVMBU4FTQVOBU8FTQVPBVAFTQVQBVEFVAVTBVIFUwVUBVUFWAVXBVYFVwVYBVkFXAVbBVoFWwVcBV0FYAVfBV4FXwVgBWEFZAVjBWIFZQVjBWQFZgVjBWUFZwVjBWYFYwVnBWgFaQVoBWcFaQVqBWgFaQVrBWoFawVpBWwFbwVuBW0FbgVvBXAFcAVvBXEFcAVxBXIFcgVxBXMFcwVxBXQFdwV2BXUFdwV4BXYFeQV4BXcFeAV5BXoFegV5BXsFegV7BXwFfAV7BX0FfQV7BX4FfgV7BX8FfwV7BYAFgAV7BYEFgQV7BYIFggV7BYMFggWDBYQFggWEBYUFggWFBYYFhgWFBYcFhgWHBYgFiAWHBYkFhwWKBYkFhwWLBYoFjAWLBYcFiwWMBY0FjQWMBY4FjQWOBY8FjwWOBZAFjwWQBZEFkQWQBZIFkwWSBZAF3gPgA+ED4APeA90DlgWVBZQFlQWWBZcF2gPZA9cD2QPaA9wDmgWZBZgFmQWaBZsFngWdBZwFnQWeBZ8FogWhBaAFoQWiBaMFpgWlBaQFpwWlBaYFqAWlBacFqAWnBakFqgWlBagFpQWqBasFrgWtBawFrgWvBa0FrgWwBa8FsQWwBa4FsQWyBbAFswWyBbEFswW0BbIFswW1BbQFswW2BbUFtwW2BbMFtwW4BbYFtwW5BbgFugW5BbcFuQW6BbsFvAW7BboFvQW7BbwFvgW7Bb0FvgW/BbsFvgXABb8FvgXBBcAFvgXCBcEFvgXDBcIFvgXEBcMFvgXFBcQFxgXFBb4FxgXHBcUFxgXIBccFxgXJBcgFyQXGBcoFngPLBZwDywWeA8wFywXMBc0FzQXMBc4FzwVyA3QDcgPPBdAF0AXPBdEF0AXRBdIFmQPTBZoD0wWZA9QF0wXUBdUF1QXUBdYF1wV4A3cDeAPXBdgF2AXXBdkF2QXXBdoF3QXcBdsF2wXcBd4F3AXfBd4F3QXgBdwF4QXfBdwF4gXgBd0F4wXfBeEF4AXiBeMF4wXkBd8F5AXjBeIF5wXmBeUF5gXnBegF6wXqBekF6gXrBewF7wXuBe0F7gXvBfAF8wXyBfEF8gXzBfQF9wX2BfUF9gX3BfgF+AX3BfkF+AX5BfoF/QX8BfsF/AX9Bf4F/gX9Bf8F/wX9BQAGAwYCBgEGAgYDBgQGBwYGBgUGBgYHBggGCwYKBgkGCgYLBgwGDAYLBg0GDAYNBg4GDgYNBg8GDgYPBhAGEwYSBhEGEgYTBhQGFAYTBhUGFAYVBhYGFgYVBhcGFgYXBhgGGwYaBhkGGgYbBhwGHwYeBh0GHgYfBiAGIwYiBiEGIgYjBiQGJwYmBiUGJgYnBigGKwYqBikGKgYrBiwGLwYuBi0GLgYvBjAGMwYyBjEGMgYzBjQGNwY2BjUGNgY3BjgGOwY6BjkGOgY7BjwG","////////////////////////////////////////////////////////X/P///9P/f///////0vk////////////////////////PwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABo/v///6n///////9/ifz//////x8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=","AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA/v//AQAAAAA=");
K("ksedan",1072,2112,-0.96,0.192,-1.664,5e-05,0.384,[[-0.384, 0.845], [0.384, -0.845], [-0.384, -0.845], [0.384, 0.845]],[-1.012, 0, 1.012],0.922,3.264,1.92,1.664,"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AH0VAH0VAHQ0AH0VAH0VAG8+AH0VAH8AAH8AploAploAAACBAACBAACBAACBAACBAACBAACBAACBAAB/AAB/AAB/AAB/gQAAploAgQAAploAWloAfwAAWloAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAAHnZAHE6AHnZAHE6AE2bAHnZAE2bAHnZfRkAfRkAfRkAfRkAfRkAfRkAfRkAfRkAfRkAgxkAgxkAgxkAgxkAgxkAgxkAgxkAgxkAgxkAAAB/AAB/AAB/AAB/AAB/AAB/AAB/AAB/AGSyAC+KAGSyAE2bAC+KAC+KAE2bAC+KAACBAACBAACBAACBAACBAACBAACBAACBAACBAACBAACBAACBAACBAACBAACBAACBAAB/AAB/AAB/AAB/AAB/AAB/AAB/AAB/AAB/pgBaAAB/ogBVWgBaAAB/XgBVAAB/fwAAfwAAXgBVWgBagQAAgQAApgBaogBVAC+KAC+KAC+KAC+KAE9jAE9jAE9jAE9jfRkAfRkAfRkAfRkAfRkAgxkAgxkAgxkAgxkAgxkAAACBAACBAACBAACBAACBAACBAACBAACB","////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHqQWeMQWeMQWeMQWeM9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHqQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeM9PHqQWeM9PHqQWeMQWeMQWeM9PHqQWeM9PHq9PHqQWeM9PHqQWeMQWeMQWeMQWeM9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHqQWeM9PHqQWeMQWeMQWeM6FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA6PY/gPY/gPY/gPY/gPY/gPY/gPY/gPY/gPY/gPY/gPY/gPY/gPY/gPY/gPY/gPY/gPY/gPY/gPY/gPY/gQWeMQWeMPY/gPY/gPY/gQWeMPY/gQWeMQWeMQWeMPY/gQWeMPY/gQWeMKiEcKiEcPY/gPY/gKiEcKiEcPY/gPY/g","AgABAAAAAQACAAMABgAFAAQABQAGAAcABwAGAAgACAAGAAkACQAGAAoACQAKAAsACwAKAAwACwAMAA0ACwANAA4ADgANAA8ADgAPABAADgAQABEAEQAQABIAEQASABMAEwASABQAEwAUABUAEwAVABYAFgAVABcAFgAXABgAGAAXABkAGAAZABoAGgAZABsAGgAbABwAGgAcAB0AHQAcAB4AHQAeAB8AHQAfACAAHQAgACEAIAAfACIAIAAiACMAIwAiACQAJAAiACUAJQAiACYAJQAmACcAJwAmACgAJwAoACkAJwApACoAKgApACsAKgArACwAKgAsAC0ALQAsAC4ALQAuAC8ALwAuADAALwAwADEALwAxADIAMgAxADMAMgAzADQANAAzADUANAA1ADYANgA1ADcANgA3ADgANgA4ADkAOQA4ADoAOQA6ADsAOQA7ADwAOQA8AD0AOQA9AD4APQA8AD8AQgBBAEAAQwBBAEIAQwBCAEQARQBBAEMARgBBAEUARwBBAEYARwBIAEEASQBIAEcASgBIAEkASgBLAEgATABLAEoATABNAEsATgBNAEwATwBNAE4ATwBQAE0AUQBQAE8AUQBSAFAAUwBSAFEAUwBUAFIAVQBUAFMAVgBUAFUAVgBXAFQAWABXAFYAWQBXAFgAVwBZAFoAWwBaAFkAWwBcAFoAWwBdAFwAWwBeAF0AXwBeAFsAXwBgAF4AXgBgAGEAYgBgAF8AYwBgAGIAYwBkAGAAZQBkAGMAZgBkAGUAZgBnAGQAaABnAGYAaABpAGcAagBpAGgAawBpAGoAawBsAGkAbQBsAGsAbQBuAGwAbwBuAG0AbwBwAG4AcQBwAG8AcgBwAHEAcgBzAHAAdABzAHIAdQBzAHQAcwB1AHYAdwB2AHUAdwB4AHYAdwB5AHgAegB5AHcAeQB6AHsAfgB9AHwAfQB+AH8AfwB+AIAAgAB+AIEAhACDAIIAgwCEAIUAhQCEAIYAhgCEAIcAhwCEAIgAiwCKAIkAigCLAIwAjwCOAI0AjgCPAJAAkwCSAJEAkgCTAJQAlwCWAJUAlgCXAJgAmwCaAJkAmgCbAJwAnwCeAJ0AngCfAKAAowCiAKEAogCjAKQAogCkAKUAqACnAKYApwCoAKkArACrAKoAqwCsAK0AsACvAK4ArwCwALEAtACzALIAswC0ALUAuAC3ALYAtwC4ALkAvAC7ALoAuwC8AL0AwAC/AL4AvwDAAMEAxADDAMIAwwDEAMUAyADHAMYAxwDIAMkAzADLAMoAywDMAM0A0ADPAM4AzwDQANEAzwDRANIAzwDSANMAzwDTANQA1wDWANUA1gDXANgA2wDaANkA2gDbANwA2gDcAN0A2gDdAN4A3gDdAN8A3wDdAOAA4wDiAOEA4gDjAOQA5wDmAOUA5gDnAOgA6ADnAOkA6QDnAOoA6QDqAOsA6QDrAOwA7wDuAO0A7gDvAPAA8wDyAPEA8gDzAPQA9wD2APUA9gD3APgA+wD6APkA+gD7APwA/wD+AP0A/gD/AAABAwECAQEBAgEDAQQBBwEGAQUBBgEHAQgBCAEHAQkBDAELAQoBCwEMAQ0BEAEPAQ4BDwEQAREBFAETARIBEwEUARUBEwEVARYBGQEYARcBGAEZARoBGgEZARsBHgEdARwBHQEeAR8BIgEhASABIQEiASMBJgElASQBJQEmAScBJwEmASgBKwEqASkBKgErASwBLAErAS0BMAEvAS4BLwEwATEBNAEzATIBMwE0ATUBOAE3ATYBNwE4ATkBPAE7AToBOwE8AT0BQAE/AT4BPwFAAUEBRAFDAUIBQwFEAUUBSAFHAUYBRwFIAUkBTAFLAUoBSwFMAU0BSwFNAU4BUQFQAU8BUAFRAVIBVQFUAVMBVAFVAVYBVAFWAVcBWgFZAVgBWQFaAVsBXgFdAVwBXQFeAV8BYgFhAWABYQFiAWMBZgFlAWQBZQFmAWcBZwFoAWUBZwFmAWkBaQFmAWoBawFoAWcBawFsAWgBbQFsAWsBbgFsAW0BbAFuAW8BcgFxAXABcQFyAXMBdgF1AXQBdQF2AXcBegF5AXgBeQF6AXsBeQF7AXwBeQF8AX0BgAF/AX4BfwGAAYEBhAGDAYIBgwGEAYUBiAGHAYYBhwGIAYkBjAGLAYoBiwGMAY0BkAGPAY4BjwGQAZEBlAGTAZIBkwGUAZUBmAGXAZYBlwGYAZkBnAGbAZoBmwGcAZ0BoAGfAZ4BnwGgAaEBpAGjAaIBowGkAaUBqAGnAaYBqAGpAacBqgGpAagBqwGpAaoBrAGpAasBqQGsAa0BrgGtAawBrgGvAa0BsAGvAa4BrwGwAbEBtAGzAbIBswG0AbUBswG1AbYBtwG2AbUBuAG2AbcBuQG2AbgBuQG6AbYBugG5AbsBtwG1AbwBtwG8Ab0BtwG9Ab4BvgG9Ab8BvAG1AcABtQHBAcABwgHAAcEBwAHCAcMBwwHCAcQBtQHFAcEBwQHFAcYBxwHFAbUBxgHFAcgBxgHIAckBxwHKAcUBxwHLAcoBxwHMAcsBzAHHAc0B0AHPAc4BzwHQAdEB1AHTAdIB0wHUAdUB2AHXAdYB1wHYAdkB3AHbAdoB2wHcAd0B4AHfAd4B3wHgAeEB5AHjAeIB4wHkAeUB6AHnAeYB5wHoAekB7AHrAeoB6wHsAe0B7QHsAe4B7QHuAe8B7wHuAfAB7wHwAfEB9AHzAfIB8wH0AfUB+AH3AfYB9wH4AfkB/AH7AfoB+wH8Af0BAAL/Af4B/wEAAgECBAIDAgICAwIEAgUCCAIHAgYCBwIIAgkCDAILAgoCCwIMAg0CEAIPAg4CDwIQAhECFAITAhICEwIUAhUCFQIUAhYCFQIWAhcCFwIWAhgCFwIYAhkCHAIbAhoCGwIcAh0CIAIfAh4CHwIgAiECJAIjAiICIwIkAiUCKAInAiYCJwIoAikCLAIrAioCKwIsAi0CMAIvAi4CLwIwAjECNAIzAjICMwI0AjUCOAI3AjYCNwI4AjkCPAI7AjoCOwI8Aj0CQAI/Aj4CPwJAAkECRAJDAkICQwJEAkUCSAJHAkYCRwJIAkkCTAJLAkoCSwJMAk0CUAJPAk4CTwJQAlECVAJTAlICUwJUAlUCWAJXAlYCVwJYAlkCXAJbAloCWwJcAl0CYAJfAl4CXwJgAmECZAJjAmICYwJkAmUCaAJnAmYCZwJoAmkCbAJrAmoCawJsAm0CcAJvAm4CbwJwAnECdAJzAnICcwJ0AnUCeAJ3AnYCdwJ4AnkCfAJ7AnoCewJ8An0CgAJ/An4CfwKAAoEChAKDAoICgwKEAoUCiAKHAoYChwKIAokCjAKLAooCiwKMAo0CkAKPAo4CjwKQApEClAKTApICkwKUApUCmAKXApYClwKYApkCnAKbApoCmwKcAp0CoAKfAp4CnwKgAqECpAKjAqICowKkAqUCqAKnAqYCpwKoAqkCrAKrAqoCqwKsAq0CsAKvAq4CrwKwArECtAKzArICswK0ArUCuAK3ArYCtwK4ArkCvAK7AroCuwK8Ar0CwAK/Ar4CvwLAAsECxALDAsICwwLEAsUCyALHAsYCxwLIAskCzALLAsoCywLMAs0CzQLMAs4CzgLMAs8CzwLMAtAC0ALMAtEC0QLMAtIC0gLMAtMC0wLMAtQC1ALMAtUC1QLMAtYC1gLMAtcC1wLMAtgC2wLaAtkC2gLbAtwC3ALbAt0C3ALdAt4C3ALeAt8C3ALfAuAC3ALgAuEC3ALhAuIC3ALiAuMC3ALjAuQC3ALkAuUC3ALlAuYC3ALmAucC6gLpAugC6QLqAusC7gLtAuwC7QLuAu8C7wLuAvAC7wLwAvEC7wLxAvIC7wLyAvMC7wLzAvQC7wL0AvUC7wL1AvYC7wL2AvcC7wL3AvgC7wL4AvkC7wL5AvoC/QL8AvsC/AL9Av4C/gL9Av8C/wL9AgADAAP9AgEDAQP9AgIDAgP9AgMDAwP9AgQDBAP9AgUDBQP9AgYDBgP9AgcDBwP9AggDCAP9AgkDDAMLAwoDCwMMAw0DEAMPAw4DDwMQAxEDFAMTAxIDEwMUAxUDGAMXAxYDFwMYAxkDHAMbAxoDGwMcAx0DIAMfAx4DHwMgAyEDJAMjAyIDIwMkAyUDKAMnAyYDJwMoAykDLAMrAyoDKwMsAy0DMAMvAy4DLwMwAzEDNAMzAzIDMwM0AzUDOAM3AzYDNwM4AzkDPAM7AzoDOwM8Az0DQAM/Az4DPwNAA0EDRANDA0IDQwNEA0UDSANHA0YDRwNIA0kDTANLA0oDSwNMA00DTgNNA0wDTgNPA00DTgNQA08DTgNRA1ADTgNSA1EDUwNSA04DUwNUA1IDUwNVA1QDVgNVA1MDVwNVA1YDVwNYA1UDVwNZA1gDWgNZA1cDWwNZA1oDXANbA1oDWwNdA1kDWwNeA10DWwNfA14DWwNgA18DWwNhA2ADYgNhA1sDYgNjA2EDYgNkA2MDYgNlA2QDYgNmA2UDZQNmA2cDaANmA2IDaQNmA2gDZgNpA2oDbQNsA2sDbANtA24DcQNwA28DcANxA3IDcgNxA3MDcgNzA3QDdwN2A3UDdgN3A3gDeAN3A3kDegN5A3cDewN5A3oDeQN7A3wDfwN+A30DfgN/A4ADgwOCA4EDggODA4QDhAODA4UDhQODA4YDhQOGA4cDhwOGA4gDiAOGA4kDiAOJA4oDjQOMA4sDjAONA44DkQOQA48DkAORA5IDkwOSA5EDkwOUA5IDlQOUA5MDlAOVA5YDmQOYA5cDmAOZA5oDnQOcA5sDnAOdA54DoQOgA58DoAOhA6IDpQOkA6MDpAOlA6YDpgOlA6cDqAOkA6YDpwOlA6kDqgOkA6gDqQOlA6sDqQOrA6wDrAOrA60DrQOrA64DrgOrA68DrwOrA7ADrwOwA7EDsQOwA7IDqgOzA6QDqgO0A7MDswO0A7UDtgO0A6oDtwO0A7YDuAO0A7cDuQO0A7gDugO0A7kDugO7A7QDvAO7A7oDvQO7A7wDvgO7A70DvwO7A74DvwO+A8ADwQO7A78DwgO7A8EDuwPCA8MDxgPFA8QDxQPGA8cDygPJA8gDyQPKA8sDzgPNA8wDzwPNA84D0APNA88DzQPQA9ED0gPRA9AD0gPTA9ED0wPSA9QD1wPWA9UD1gPXA9gD2APXA9kD2APZA9oD2gPZA9sD2gPbA9wD2gPcA90D4APfA94D3wPgA+ED4gPhA+AD4gPjA+ED5APjA+ID4wPkA+UD6APnA+YD5wPoA+kD6gPmA+cD5wPpA+sD5gPqA+wD6wPpA+0D7APqA+0D7APtA+kD8APvA+4D7wPwA/ED9APzA/ID8wP0A/UD+AP3A/YD9wP4A/kD+QP4A/oD+QP6A/sD+wP6A/wD+wP8A/0DAAT/A/4D/wMABAEEAQQABAIEAQQCBAMEAwQCBAQEAwQEBAUECAQHBAYEBwQIBAkEDAQLBAoECwQMBA0EEAQPBA4EDwQQBBEEFAQTBBIEEwQUBBUEGAQXBBYEFwQYBBkEHAQbBBoEGwQcBB0EIAQfBB4EHwQgBCEEIQQgBCIEJQQkBCMEJAQlBCYEJgQlBCcEKgQpBCgEKQQqBCsELgQtBCwELQQuBC8E","//////////////////////////////////////////////////////////////////////////////////////////8/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=","AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADA//8/AAAAAAA=");
K("kvan",1138,2262,-0.96,0.192,-1.792,5.4e-05,0.384,[[-0.384, 0.973], [0.384, 0.973], [-0.384, -0.973], [0.384, -0.973]],[-1.091, 0, 1.091],0.922,3.52,1.92,1.728,"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APh/APh/AAB/AAB/APh/APh/AKamAJLBAKamAJLBAJI/AKZaAJI/AKZaAJI/AKZaAJI/AKZaAIXfAIEAAIXfAIEAAIUhAJI/AIUhAJI/AMFuAMFuAKZaAKZaAKamAJLBAKamAJLBAPh/APh/AN97AN97AN+FAMGSAN+FAMGSAPiBAN+FAPiBAN+FAPh/APh/AN97AN97AIUhAJI/AIUhAJI/AN97AN97AMFuAMFuAPiBAN+FAPiBAN+FAMFuAMFuAKZaAKZaAN+FAMGSAN+FAMGSAIXfAIEAAIXfAIEAAACBAACBAPiBAPiBAIEAAIUhAIEAAIUhAPiBAPiBAN+FAN+FAAB/AAB/APh/APh/AIEAAIUhAIEAAIUhAIUhAJI/AIUhAJI/AMGSAMGSAKamAKamAPh/APh/AN97AN97AMFuAMFuAKZaAKZaAN97AN97AMFuAMFuAJI/AKZaAJI/AKZaAKamAJLBAKamAJLBAIXfAIEAAIXfAIEAAN+FAN+FAMGSAMGSAJLBAIXfAJLBAIXfgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAAACBAACBAPiBAPiBfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAAACBAACBAPiBAPiBAPiBAPiBAN+FAN+FAAB/AAB/APh/APh/AIEAAIUhAIEAAIUhAIUhAJI/AIUhAJI/AMGSAKamAMGSAKamAPh/APh/AN97AN97AMFuAMFuAKZaAKZaAN97AN97AMFuAMFuAKamAJLBAKamAJLBAIXfAIEAAIXfAIEAAJI/AKZaAJI/AKZaAN+FAN+FAMGSAMGSAJLBAIXfAJLBAIXfAC92AC92AC92AC92AC92AC92AC92AC92AIEAAIEAAIEAAIEAgxkAgxkAgxkAgxkAgxkAgxkAgxkAgxkAAAB/AAB/AAB/AAB/AAB/gQAAgQAAgQAAgQAAfwAAfwAAfwAAfwAAAAB/AAB/AAB/AAB/AAB/AIEAAIEAAIEAAIEAAH8AAH8AAH8AAH8AAH8AAH8AAH8AAH8AfRkAfRkAfRkAfRkAfRkAfRkAfRkAfRkAAACBAACBAACBAACBAACBAACBAACBAACBAACBAACBAACBAACBgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAAAB/AAB/AAB/AAB/AAB/ACl4ACl4AAB/AAB/AAB/AAB/AAB/fwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAAHsfAHsfAHsfAHsfAHI5AHsfAHI5AHsfAHsfAHsfACl4ACl4AHI5AHI5AH8AAH8AAH8AAH8AAH8AAH8AAH8AAH8AAC+KAC+KAC+KAC+KAC+KAC+KAC+KAC+KgQAAgQAAgQAAgQAAAHLHAHI5AHLHAHI5AExmAExmAHI5AHI5AEyaAEyaAHLHAHLHfwAAfwAAfwAAfwAAAACBAACBAACBAACBAACBAACBAACBAACBAACBAACBAAB/AAB/AAB/AAB/AAB/AAB/AAB/AAB/AACBAACBAACBAACBAACBAACBAACBAACBgxkAgxkAgxkAgxkAgxkAgxkAgxkAgxkAAC92AC92AC92AC92AC+KAC+KAC+KAC+KfRkAfRkAfRkAfRkAfRkAfRkAfRkAfRkAgQAAgQAApgBalSo2ryBcWgBaAAB/USBcACl4AAB/pgBaACl4ryBcfwAAfwAAayo2WgBaUSBcUSBcACl4ayo2AE5kACl4ryBcAE5klSo2AACBAACBAACBAACBAACBAACBAACBAACB","////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq6FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA6QWeMPY/gQWeMPY/gPY/gPY/gQWeMQWeMQWeMQWeMPY/gPY/gPY/gPY/gPY/gPY/gPY/gQWeMPY/gPY/gQWeMPY/gQWeMQWeMPY/gPY/gPY/gPY/gPY/gPY/gPY/gPY/gPY/gPY/gPY/gPY/gPY/gPY/gPY/gPY/gPY/gPY/gPY/gPY/gPY/gPY/gPY/gPY/gPY/gPY/gKiEcKiEcPY/gPY/gKiEcKiEcPY/gPY/g","AgABAAAAAQACAAMABgAFAAQABQAGAAcABwAGAAgACAAGAAkACQAGAAoACQAKAAsACwAKAAwACwAMAA0ACwANAA4ADgANAA8ADgAPABAADgAQABEAEQAQABIAEQASABMAEwASABQAEwAUABUAEwAVABYAFgAVABcAFgAXABgAGAAXABkAGAAZABoAGgAZABsAGgAbABwAGgAcAB0AHQAcAB4AHQAeAB8AHQAfACAAHQAgACEAIAAfACIAIAAiACMAIwAiACQAJAAiACUAJQAiACYAJQAmACcAJwAmACgAJwAoACkAJwApACoAKgApACsAKgArACwAKgAsAC0ALQAsAC4ALQAuAC8ALwAuADAALwAwADEALwAxADIAMgAxADMAMgAzADQANAAzADUANAA1ADYANgA1ADcANgA3ADgANgA4ADkAOQA4ADoAOQA6ADsAOQA7ADwAOQA8AD0AOQA9AD4APQA8AD8AQgBBAEAAQQBCAEMARgBFAEQARwBFAEYARwBGAEgASQBFAEcASgBFAEkASwBFAEoASwBMAEUATQBMAEsATgBMAE0ATgBPAEwAUABPAE4AUABRAE8AUgBRAFAAUwBRAFIAUwBUAFEAVQBUAFMAVQBWAFQAVwBWAFUAVwBYAFYAWQBYAFcAWgBYAFkAWgBbAFgAXABbAFoAXQBbAFwAWwBdAF4AXwBeAF0AXwBgAF4AXwBhAGAAXwBiAGEAYwBiAF8AYwBkAGIAYgBkAGUAZgBkAGMAZwBkAGYAZwBoAGQAaQBoAGcAagBoAGkAagBrAGgAbABrAGoAbABtAGsAbgBtAGwAbwBtAG4AbwBwAG0AcQBwAG8AcQByAHAAcwByAHEAcwB0AHIAdQB0AHMAdgB0AHUAdgB3AHQAeAB3AHYAeQB3AHgAdwB5AHoAewB6AHkAewB8AHoAewB9AHwAfgB9AHsAfQB+AH8AggCBAIAAgQCCAIMAgwCCAIQAhACCAIUAiACHAIYAhwCIAIkAiQCIAIoAigCIAIsAiwCIAIwAjwCOAI0AjgCPAJAAkwCSAJEAkgCTAJQAlwCWAJUAlgCXAJgAmwCaAJkAmgCbAJwAnwCeAJ0AngCfAKAAowCiAKEAogCjAKQApwCmAKUApgCnAKgApgCoAKkArACrAKoAqwCsAK0AsACvAK4ArwCwALEAtACzALIAswC0ALUAuAC3ALYAtwC4ALkAvAC7ALoAuwC8AL0AwAC/AL4AvwDAAMEAxADDAMIAwwDEAMUAyADHAMYAxwDIAMkAzADLAMoAywDMAM0A0ADPAM4AzwDQANEA1ADTANIA0wDUANUA0wDVANYA0wDWANcA0wDXANgA2wDaANkA2gDbANwA3wDeAN0A3gDfAOAA3gDgAOEA3gDhAOIA4gDhAOMA4wDhAOQA5wDmAOUA5gDnAOgA6wDqAOkA6gDrAOwA7ADrAO0A7QDrAO4A7QDuAO8A7QDvAPAA8wDyAPEA8gDzAPQA9wD2APUA9gD3APgA+wD6APkA+gD7APwA/wD+AP0A/gD/AAABAwECAQEBAgEDAQQBBwEGAQUBBgEHAQgBCwEKAQkBCgELAQwBDAELAQ0BEAEPAQ4BDwEQAREBFAETARIBEwEUARUBGAEXARYBFwEYARkBFwEZARoBHQEcARsBHAEdAR4BHgEdAR8BIgEhASABIQEiASMBJgElASQBJQEmAScBKgEpASgBKQEqASsBKwEqASwBLwEuAS0BLgEvATABMAEvATEBNAEzATIBMwE0ATUBOAE3ATYBNwE4ATkBPAE7AToBOwE8AT0BQAE/AT4BPwFAAUEBRAFDAUIBQwFEAUUBSAFHAUYBRwFIAUkBTAFLAUoBSwFMAU0BUAFPAU4BTwFQAVEBTwFRAVIBVQFUAVMBVAFVAVYBWQFYAVcBWAFZAVoBWAFaAVsBXgFdAVwBXQFeAV8BYgFhAWABYQFiAWMBZgFlAWQBZQFmAWcBagFpAWgBaQFqAWsBaQFrAWwBaQFsAW0BaQFtAW4BbgFtAW8BbwFtAXABcAFtAXEBcAFxAXIBbgFvAXMBcwF0AW4BdAFzAXUBcwFvAXYBdwF2AW8BdwFvAXgBdwF4AXkBegF5AXgBeQF6AXsBfAF2AXcBfAF3AX0BfAF9AX4BfgF9AX8BgAF2AXwBgQF2AYABgQGCAXYBggGBAYMBhgGFAYQBhQGGAYcBigGJAYgBiQGKAYsBjgGNAYwBjQGOAY8BjQGPAZABjQGQAZEBlAGTAZIBkwGUAZUBmAGXAZYBmAGZAZcBmgGZAZgBmwGZAZoBnAGZAZsBmQGcAZ0BngGdAZwBngGfAZ0BoAGfAZ4BnwGgAaEBpAGjAaIBowGkAaUBqAGnAaYBpwGoAakBrAGrAaoBqwGsAa0BsAGvAa4BrwGwAbEBtAGzAbIBswG0AbUBuAG3AbYBtwG4AbkBvAG7AboBuwG8Ab0BwAG/Ab4BvwHAAcEBxAHDAcIBwwHEAcUByAHHAcYBxwHIAckBzAHLAcoBywHMAc0B0AHPAc4BzwHQAdEB0QHQAdIB0gHQAdMB0QHUAc8BzwHUAdUB0QHWAdQB1gHVAdQB1QHWAdcB1gHYAdcB2QHWAdEB2QHYAdYB2QHaAdgB2wHaAdkB3AHaAdsB2gHcAd0B4AHfAd4B3wHgAeEB5AHjAeIB4wHkAeUB6AHnAeYB5wHoAekB7AHrAeoB6wHsAe0B8AHvAe4B7wHwAfEB9AHzAfIB8wH0AfUB9QH0AfYB9QH2AfcB9wH2AfgB9wH4AfkB/AH7AfoB+wH8Af0BAAL/Af4B/wEAAgECBAIDAgICAwIEAgUCCAIHAgYCBwIIAgkCDAILAgoCCwIMAg0CEAIPAg4CDwIQAhECFAITAhICEwIUAhUCGAIXAhYCFwIYAhkCHAIbAhoCGwIcAh0CHQIcAh4CHQIeAh8CHwIeAiACHwIgAiECJAIjAiICIwIkAiUCKAInAiYCJwIoAikCLAIrAioCKwIsAi0CMAIvAi4CMwIyAjECNgI1AjQCNQI2AjcCNwI2AjgCNwI4AjkCPAI7AjoCOwI8Aj0CQAI/Aj4CPwJAAkECRAJDAkICQwJEAkUCSAJHAkYCRwJIAkkCTAJLAkoCSwJMAk0CUAJPAk4CTwJQAlECVAJTAlICUwJUAlUCWAJXAlYCVwJYAlkCXAJbAloCWwJcAl0CYAJfAl4CXwJgAmECZAJjAmICYwJkAmUCaAJnAmYCZwJoAmkCbAJrAmoCawJsAm0CcAJvAm4CbwJwAnECdAJzAnICcwJ0AnUCeAJ3AnYCdwJ4AnkCfAJ7AnoCewJ8An0CgAJ/An4CfwKAAoEChAKDAoICgwKEAoUCiAKHAoYChwKIAokCjAKLAooCiwKMAo0CkAKPAo4CjwKQApEClAKTApICkwKUApUCmAKXApYClwKYApkCnAKbApoCmwKcAp0CoAKfAp4CnwKgAqECpAKjAqICowKkAqUCqAKnAqYCpwKoAqkCrAKrAqoCqwKsAq0CsAKvAq4CrwKwArECtAKzArICswK0ArUCuAK3ArYCtwK4ArkCvAK7AroCuwK8Ar0CwAK/Ar4CvwLAAsECxALDAsICwwLEAsUCyALHAsYCxwLIAskCzALLAsoCywLMAs0C0ALPAs4CzwLQAtEC1ALTAtIC0wLUAtUC2ALXAtYC1wLYAtkC3ALbAtoC2wLcAt0C4ALfAt4C3wLgAuEC4QLgAuIC4gLgAuMC4wLgAuQC5ALgAuUC5QLgAuYC5gLgAucC5wLgAugC6ALgAukC6QLgAuoC6gLgAusC6wLgAuwC7wLuAu0C7gLvAvAC8ALvAvEC8ALxAvIC8ALyAvMC8ALzAvQC8AL0AvUC8AL1AvYC8AL2AvcC8AL3AvgC8AL4AvkC8AL5AvoC8AL6AvsC/gL9AvwC/QL+Av8CAgMBAwADAQMCAwMDAwMCAwQDAwMEAwUDAwMFAwYDAwMGAwcDAwMHAwgDAwMIAwkDAwMJAwoDAwMKAwsDAwMLAwwDAwMMAw0DAwMNAw4DEQMQAw8DEAMRAxIDEgMRAxMDEwMRAxQDFAMRAxUDFQMRAxYDFgMRAxcDFwMRAxgDGAMRAxkDGQMRAxoDGgMRAxsDGwMRAxwDHAMRAx0DIAMfAx4DHwMgAyEDJAMjAyIDIwMkAyUDKAMnAyYDJwMoAykDLAMrAyoDKwMsAy0DMAMvAy4DLwMwAzEDNAMzAzIDMwM0AzUDOAM3AzYDNwM4AzkDPAM7AzoDOwM8Az0DQAM/Az4DPwNAA0EDRANDA0IDQwNEA0UDSANHA0YDRwNIA0kDTANLA0oDSwNMA00DUANPA04DTwNQA1EDVANTA1IDUwNUA1UDWANXA1YDVwNYA1kDWQNYA1oDWwNaA1gDXANaA1sDWgNcA10DYANfA14DXwNgA2EDZANjA2IDYwNkA2UDYwNlA2YDZgNlA2cDZgNnA2gDZgNoA2kDbANrA2oDawNsA20DbQNsA24DcQNwA28DcANxA3IDdQN0A3MDdAN1A3YDeQN4A3cDeAN5A3oDegN5A3sDfgN9A3wDfQN+A38DggOBA4ADgQOCA4MDhgOFA4QDhQOGA4cDigOJA4gDiwOJA4oDjAOJA4sDiQOMA40DjgONA4wDjQOOA48DkgORA5ADkQOSA5MDkwOSA5QDlAOSA5UDlgORA5MDkQOWA5cDmAOXA5YDmAOZA5cDmgOZA5gDmQOaA5sDngOdA5wDnQOeA58DoAOfA54DoAOhA58DoAOiA6EDoAOjA6IDpAOjA6ADpAOlA6MDpgOlA6QDpgOnA6UDqAOnA6YDqQOnA6gDqQOqA6cDqwOqA6kDqgOrA6wDrQOsA6sDrQOuA6wDrwOuA60DrwOwA64DrwOxA7ADrwOyA7EDrwOzA7IDrwO0A7MDtQO0A68DtQO2A7QDtQO3A7YDtQO4A7cDtwO4A7kDuQO4A7oDuwO4A7UDvAO4A7sDuAO8A70DwAO/A74DvwPAA8EDwQPAA8IDwAPDA8IDwgPDA8QDxQPDA8ADxQPGA8MDxQPHA8YDyAPHA8UDxwPIA8kDzAPLA8oDywPMA80DzQPMA84DzwPLA80DzgPMA9ADzwPRA8sDzgPQA9ID0wPRA88D0wPUA9ED1QPUA9MD1QPWA9QD0gPQA9cD2APWA9UD0gPXA9kD2QPXA9oD2gPXA9sD2wPXA9wD2wPcA90D3QPcA94D3wPWA9gD4APWA98D4QPWA+AD4gPWA+ED4wPWA+ID1gPjA+QD4wPiA+UD4wPlA+YD5gPlA+cD5wPlA+gD5wPoA+kD6QPoA+oD6QPqA+sD7gPtA+wD7QPuA+8D7wPuA/AD8APuA/ED8APxA/ID8gPxA/MD8wPxA/QD8wP0A/UD+AP3A/YD9wP4A/kD/AP7A/oD+wP8A/0D/gP6A/sD+wP9A/8D+gP+AwAE/wP9AwEEAAT+AwEEAAQBBP0DBAQDBAIEAwQEBAUEBgQCBAMEAwQFBAcEAgQGBAgEBwQFBAkECAQGBAkECAQJBAUEDAQLBAoECwQMBA0EEAQPBA4EDwQQBBEEFAQTBBIEEwQUBBUEGAQXBBYEFwQYBBkEHAQbBBoEGwQcBB0EIAQfBB4EHwQgBCEEIQQgBCIEJQQkBCMEJAQlBCYEJgQlBCcEKgQpBCgEKQQqBCsEKwQqBCwEKwQsBC0ELQQsBC4ELQQuBC8EMgQxBDAEMQQyBDMEMwQyBDQEMwQ0BDUENQQ0BDYENQQ2BDcEOgQ5BDgEOwQ5BDoEOwQ8BDkEPQQ8BDsEPQQ+BDwEPgQ9BD8EQgRBBEAEQQRCBEMERgRFBEQERQRGBEcESgRJBEgESQRKBEsETARJBEsESwRKBE0ETQRKBE4ETQROBE8EUgRRBFAEUQRSBFMEUwRSBFQEVwRWBFUEVgRXBFgEWwRaBFkEWgRbBFwEXwReBF0EXgRfBGAEYARfBGEEZARjBGIEYwRkBGUEaARnBGYEZwRoBGkEbARrBGoEawRsBG0EcARvBG4EbwRwBHEE","//////////////////////////////////////////////////////////////////////////////////////////////8DAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=","AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAMD/////////////////////////////////////AAAAAAAAAAA=");
K("kpickup",1180,2328,-0.96,0.192,-1.7569,5.4e-05,0.384,[[0.384, 1.002], [-0.384, 1.002], [-0.384, -0.816], [0.384, -0.816]],[-1.089, 0, 1.089],0.922,3.514,1.92,1.664,"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AIEAAIUhAIIRAAB/AAB/APh/APh/AAB/AAB/APh/APh/AKamAJLBAKamAJLBAJI/AKZaAJI/AKZaAJI/AKZaAJI/AKZaAIXfAIEAAIXfAIEAAIUhAJI/AIUhAJI/AMFuAMFuAKZaAKZaAKamAJLBAKamAJLBAPh/APh/AN97AN97AN+FAMGSAN+FAMGSAPiBAN+FAPiBAN+FAPh/APh/AN97AN97AIUhAJI/AIUhAJI/AN97AN97AMFuAMFuAPiBAN+FAPiBAN+FAMFuAMFuAKZaAKZaAN+FAMGSAN+FAMGSAIXfAIEAAIXfAIEAAILvAACBAACBAPiBAPiBAIEAAIUhAIEAAIUhAPiBAPiBAN+FAN+FAAB/AAB/APh/APh/AIEAAIUhAIEAAIUhAIUhAJI/AIUhAJI/AMGSAMGSAKamAKamAPh/APh/AN97AN97AMFuAMFuAKZaAKZaAN97AN97AMFuAMFuAJI/AKZaAJI/AKZaAKamAJLBAKamAJLBAIXfAIEAAIXfAIEAAN+FAN+FAMGSAMGSAJLBAIXfAJLBAIXfgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAAACBAACBAPiBAPiBAACBAACBAPiBAPiBAPiBAPiBAN+FAN+FAAB/AAB/APh/APh/AIIRAIUhAIEAAIUhAIEAAIUhAJI/AIUhAJI/AMGSAKamAMGSAKamAPh/APh/AN97AN97AMFuAMFuAKZaAKZaAN97AN97AMFuAMFuAKamAJLBAKamAJLBAIXfAILvAIXfAIEAAIEAAJI/AKZaAJI/AKZaAN+FAN+FAMGSAMGSAJLBAIXfAJLBAIXfgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAAE9jAE9jAHE6AE9jAE9jAHE6AE9jAE9jAAB/AAB/AAB/AAB/AAB/AAB/AAB/AAB/AACBAACBAACBAACBAACBAACBAACBAACBiwDPiwDPiwAxiwAxzwCLMQCLzwCLMQCLAIEAAIEAAIEAAIEAAIEAAIEAAIEAAIEAAIEAAIEAAIEAAIEAAIEAAIEAAGpGAGpGAGpGAGpGAGpGAGpGAGpGAGpGAGpGAGpGAGpGAGpGAAB/AAB/AAB/AAB/gQAAploAgQAAploAAH8AAH8AploAploAAAB/AAB/AAB/AAB/AIEAAIEAAIEAAIEAWloAfwAAWloAfwAAAIEAAIEAAIEAAIEAWloAWloAAH8AAH8AAAB/AAB/AAB/AAB/AH8AAH8AAH8AAH8AAH8AAH8AAH8AAH8AAH8AAH8AAH8AAH8AAH8AAH8AfwAAfwAAfwAAfwAAfwAAgxkAgxkAgxkAgxkAgxkAgxkAgxkAgxkAgxkAgxkAgQAAgQAAgQAAgQAAgQAAAH8AAHE6AH8AAHE6fRkAfRkAfRkAfRkAfRkAfRkAfRkAfRkAfRkAfRkAAP+BAP+BAP+BAP+BAP+BAP+BgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAiwAxiwAxpgBapgBadQDPdQDPdQAxdQAxdQAxdQAxWgBaWgBaMQCLMQCLdQDPdQDPiwDPzwCLiwDPzwCLAACBAACBAACBAACBAACBAACBAACBAACBAH8AAH8AAH8AAH8AAH8AAH8AAH8AAH8AAH8AAH8AAH8AAH8AAH8AAH8AAH8AAH8AAAB/AAB/AAB/AAB/AAB/AAB/AAB/AAB/AACBAACBAACBAACBAACBAACBAACBAACBWgBaAAB/ZwBLAAB/AAB/pgBaAAB/mQBLgQAAgQAApgBamQBLfwAAfwAAZwBLWgBapgCmAACBpgCmAACBAACBWgCmAACBWgCmWgCmWgCmfwAAfwAApgCmpgCmgQAAgQAAAE9jAE9jAE9jAE9jfRkAfRkAfRkAfRkAgxkAgxkAgxkAgxkA","////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq6FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA6PY/gPY/gPY/gPY/gPY/gPY/gPY/gPY/gPY/gPY/gPY/gPY/gPY/gPY/gPY/gPY/gKiEcKiEcPY/gPY/gKiEcKiEcPY/gPY/gPY/gKiEcPY/gKiEcKiEcPY/gKiEcPY/gQWeMQWeMPY/gPY/gPY/gQWeMPY/gQWeMQWeMPY/gQWeMPY/g","AgABAAAAAQACAAMABgAFAAQABQAGAAcABwAGAAgACAAGAAkACQAGAAoACQAKAAsACwAKAAwACwAMAA0ACwANAA4ADgANAA8ADgAPABAADgAQABEAEQAQABIAEQASABMAEwASABQAEwAUABUAEwAVABYAFgAVABcAFgAXABgAGAAXABkAGAAZABoAGgAZABsAGgAbABwAGgAcAB0AHQAcAB4AHQAeAB8AHQAfACAAHQAgACEAIAAfACIAIAAiACMAIwAiACQAJAAiACUAJQAiACYAJQAmACcAJwAmACgAJwAoACkAJwApACoAKgApACsAKgArACwAKgAsAC0ALQAsAC4ALQAuAC8ALwAuADAALwAwADEALwAxADIAMgAxADMAMgAzADQANAAzADUANAA1ADYANgA1ADcANgA3ADgANgA4ADkAOQA4ADoAOQA6ADsAOQA7ADwAOQA8AD0AOQA9AD4APQA8AD8AQgBBAEAAQwBBAEIAQwBCAEQARQBBAEMARgBBAEUARwBBAEYARwBIAEEASQBIAEcASgBIAEkASgBLAEgATABLAEoATABNAEsATgBNAEwATwBNAE4ATwBQAE0AUQBQAE8AUQBSAFAAUwBSAFEAUwBUAFIAVQBUAFMAVgBUAFUAVgBXAFQAWABXAFYAWQBXAFgAVwBZAFoAWwBaAFkAWwBcAFoAWwBdAFwAWwBeAF0AXwBeAFsAXwBgAF4AXgBgAGEAYgBgAF8AYwBgAGIAYwBkAGAAZQBkAGMAZgBkAGUAZgBnAGQAaABnAGYAaABpAGcAagBpAGgAawBpAGoAawBsAGkAbQBsAGsAbQBuAGwAbwBuAG0AbwBwAG4AcQBwAG8AcgBwAHEAcgBzAHAAdABzAHIAdQBzAHQAcwB1AHYAdwB2AHUAdwB4AHYAdwB5AHgAegB5AHcAeQB6AHsAfgB9AHwAfQB+AH8AfwB+AIAAgAB+AIEAgQB+AIIAhQCEAIMAhACFAIYAhgCFAIcAhwCFAIgAiACFAIkAjACLAIoAiwCMAI0AkACPAI4AjwCQAJEAlACTAJIAkwCUAJUAmACXAJYAlwCYAJkAnACbAJoAmwCcAJ0AoACfAJ4AnwCgAKEApACjAKIAowCkAKUAowClAKYAqQCoAKcAqACpAKoArQCsAKsArACtAK4AsQCwAK8AsACxALIAtQC0ALMAtAC1ALYAuQC4ALcAuAC5ALoAvQC8ALsAvAC9AL4AwQDAAL8AwADBAMIAxQDEAMMAxADFAMYAyQDIAMcAyADJAMoAzQDMAMsAzADNAM4A0QDQAM8A0ADRANIA0ADSANMA0ADTANQA0ADUANUA2ADXANYA1wDYANkA3ADbANoA2wDcAN0A2wDdAN4A2wDeAN8A3wDeAOAA4ADeAOEA5ADjAOIA4wDkAOUA6ADnAOYA5wDoAOkA6QDoAOoA6gDoAOsA6gDrAOwA6gDsAO0A8ADvAO4A7wDwAPEA9ADzAPIA8wD0APUA+AD3APYA9wD4APkA/AD7APoA+wD8AP0AAAH/AP4A/wAAAQEBBAEDAQIBAwEEAQUBCAEHAQYBBwEIAQkBCQEIAQoBDQEMAQsBDAENAQ4BEQEQAQ8BEAERARIBFQEUARMBFAEVARYBFAEWARcBGgEZARgBGQEaARsBGwEaARwBHwEeAR0BHgEfASABIwEiASEBIgEjASQBJwEmASUBJgEnASgBKAEnASkBLAErASoBKwEsAS0BLQEsAS4BMQEwAS8BMAExATIBNQE0ATMBNAE1ATYBOQE4ATcBOAE5AToBPQE8ATsBPAE9AT4BQQFAAT8BQAFBAUIBRQFEAUMBRAFFAUYBSQFIAUcBSAFJAUoBTQFMAUsBTAFNAU4BTAFOAU8BUgFRAVABUQFSAVMBVgFVAVQBVQFWAVcBVQFXAVgBWwFaAVkBWgFbAVwBXwFeAV0BXgFfAWABYwFiAWEBYgFjAWQBZAFjAWUBZAFlAWYBZAFmAWcBZAFnAWgBawFqAWkBagFrAWwBbwFuAW0BbgFvAXABcwFyAXEBcgFzAXQBcgF0AXUBcgF1AXYBcgF2AXcBegF5AXgBeQF6AXsBfgF9AXwBfQF+AX8BggGBAYABgQGCAYMBhgGFAYQBhQGGAYcBigGJAYgBiQGKAYsBjgGNAYwBjQGOAY8BkgGRAZABkQGSAZMBlgGVAZQBlQGWAZcBmgGZAZgBmQGaAZsBngGdAZwBngGfAZ0BoAGfAZ4BoQGfAaABogGfAaEBnwGiAaMBpAGjAaIBpAGlAaMBpgGlAaQBpQGmAacBqgGpAagBqQGqAasBqQGrAawBrQGsAasBrQGrAa4BrwGsAa0BrwGtAbABrwGwAbEBsQGwAbIBswGsAa8BtAGsAbMBtAG1AawBtQG0AbYBqwG3Aa4BuAGuAbcBrgG4AbkBuQG4AboBqwG7AbcBtwG7AbwBvQG7AasBvAG7Ab4BvAG+Ab8BvQHAAbsBvQHBAcABvQHCAcEBwgG9AcMBxgHFAcQBxQHGAccBygHJAcgByQHKAcsBzgHNAcwBzQHOAc8B0gHRAdAB0QHSAdMB0wHUAdEB0wHSAdUB1QHSAdYB1wHUAdMB1wHYAdQB2QHYAdcB2gHYAdkB2AHaAdsB3gHdAdwB3QHeAd8B3wHeAeAB4AHeAeEB5AHjAeIB4wHkAeUB6AHnAeYB5wHoAekB7AHrAeoB6wHsAe0B8AHvAe4B7wHwAfEB9AHzAfIB8wH0AfUB+AH3AfYB9wH4AfkB/AH7AfoB+wH8Af0BAAL/Af4B/wEAAgECAQIAAgICAQICAgMCAwICAgQCAwIEAgUCCAIHAgYCBwIIAgkCDAILAgoCCwIMAg0CEAIPAg4CDwIQAhECFAITAhICEwIUAhUCGAIXAhYCFwIYAhkCHAIbAhoCGwIcAh0CIAIfAh4CHwIgAiECJAIjAiICIwIkAiUCKAInAiYCJwIoAikCKQIoAioCKQIqAisCKwIqAiwCKwIsAi0CMAIvAi4CLwIwAjECNAIzAjICMwI0AjUCOAI3AjYCNwI4AjkCPAI7AjoCOwI8Aj0CQAI/Aj4CPwJAAkECRAJDAkICQwJEAkUCSAJHAkYCRwJIAkkCTAJLAkoCSwJMAk0CUAJPAk4CTwJQAlECVAJTAlICUwJUAlUCWAJXAlYCVwJYAlkCWQJYAloCXQJcAlsCXAJdAl4CYQJgAl8CYAJhAmICZQJkAmMCZAJlAmYCaQJoAmcCaAJpAmoCbQJsAmsCbAJtAm4CcQJwAm8CcAJxAnICdQJ0AnMCdAJ1AnYCeQJ4AncCeAJ5AnoCfQJ8AnsCfAJ9An4CgQKAAn8CgAKBAoIChQKEAoMChAKFAoYCiQKIAocCiAKJAooCjQKMAosCjAKNAo4CkQKQAo8CkAKRApIClQKUApMClAKVApYCmQKYApcCmAKZApoCnQKcApsCnAKdAp4CoQKgAp8CoAKhAqICpQKkAqMCpAKlAqYCpgKlAqcCqgKpAqgCqQKqAqsCrgKtAqwCrQKuAq8CsgKxArACsQKyArMCtgK1ArQCtQK2ArcCugK5ArgCuQK6ArsCvgK9ArwCvQK+Ar8CwgLBAsACwQLCAsMCxgLFAsQCxQLGAscCygLJAsgCyQLKAssCzgLNAswCzQLOAs8C0gLRAtAC0QLSAtMC1gLVAtQC1QLWAtcC2gLZAtgC2QLaAtsC3gLdAtwC3QLeAt8C4gLhAuAC4QLiAuMC5gLlAuQC5QLmAucC5wLmAugC6ALmAukC6QLmAuoC6gLmAusC6wLmAuwC7ALmAu0C7QLmAu4C7gLmAu8C7wLmAvAC8ALmAvEC8QLmAvIC9QL0AvMC9AL1AvYC9gL1AvcC9gL3AvgC9gL4AvkC9gL5AvoC9gL6AvsC9gL7AvwC9gL8Av0C9gL9Av4C9gL+Av8C9gL/AgAD9gIAAwEDBAMDAwIDAwMEAwUDCAMHAwYDBwMIAwkDDAMLAwoDCwMMAw0DEAMPAw4DDwMQAxEDFAMTAxIDEwMUAxUDFQMUAxYDGQMYAxcDGAMZAxoDHQMcAxsDHAMdAx4DIQMgAx8DIAMhAyIDJQMkAyMDJAMlAyYDKQMoAycDKAMpAyoDLQMsAysDLAMtAy4DMQMwAy8DMAMxAzIDMgMxAzMDNgM1AzQDNQM2AzcDOgM5AzgDOQM6AzsDPgM9AzwDPQM+Az8DQgNBA0ADQQNCA0MDQwNCA0QDRANCA0UDRQNCA0YDRgNCA0cDRwNCA0gDSANCA0kDSQNCA0oDSgNCA0sDSwNCA0wDTANCA00DTQNCA04DUQNQA08DUANRA1IDUgNRA1MDUgNTA1QDUgNUA1UDUgNVA1YDUgNWA1cDUgNXA1gDUgNYA1kDUgNZA1oDUgNaA1sDUgNbA1wDUgNcA10DYANfA14DXwNgA2EDYQNgA2IDYwNiA2ADZANiA2MDYgNkA2UDaANnA2YDZwNoA2kDbANrA2oDawNsA20DcANvA24DbwNwA3EDcgNxA3ADcgNzA3EDdANzA3IDcwN0A3UDeAN3A3YDdwN4A3kDfAN7A3oDewN8A30DgAN/A34DfwOAA4EDgQOAA4IDggOAA4MDggOEA4EDggOFA4QDggOGA4UDhwOGA4IDhwOIA4YDhgOIA4kDigOIA4cDiAOKA4sDjgONA4wDjQOOA48DjwOOA5ADkAOOA5EDkAORA5IDkgORA5MDkwORA5QDlAORA5UDlQORA5YDlQOWA5cDmgOZA5gDmQOaA5sDngOdA5wDnQOeA58DogOhA6ADoQOiA6MDpgOlA6QDpQOmA6cDqgOpA6gDqQOqA6sDrgOtA6wDrQOuA68DsgOxA7ADsQOyA7MDtgO1A7QDtQO2A7cDugO5A7gDuQO6A7sDvgO9A7wDvQO+A78DvwO+A8ADvgPBA8ADwgPAA8EDwQO+A8MDwQPDA8QDxAPDA8UDxQPDA8YDxgPDA8cDxgPHA8gDyAPHA8kDzAPLA8oDywPMA80DzQPMA84D0QPQA88D0QPSA9AD0QPTA9ID0wPRA9QD1APRA9UD1APVA9YD1APWA9cD1wPWA9gD2wPaA9kD2gPbA9wD3APbA90D4APfA94D3wPgA+ED5APjA+ID5APlA+MD5gPlA+QD5wPlA+YD5wPoA+UD6APnA+kD6QPnA+oD6wPqA+cD7gPtA+wD7QPuA+8D7wPuA/AD8APuA/ED9APzA/ID8wP0A/UD9QP0A/YD9gP0A/cD9wP0A/gD+AP0A/kD9gP3A/oD9gP6A/sD9gP7A/wD/AP7A/0D/AP9A/4D/AP+A/8D/AP/AwAE/AMABAEE/AMBBAIEAgQBBAMEAwQBBAQEAwQEBAUEAwQFBAYEBgQFBAcEBgQHBAgEBgQIBAkECgQGBAkECQQIBAsECQQLBAwEDAQLBA0EDAQNBA4EDgQNBA8EDwQNBBAEDwQQBBEEDwQRBBIEFQQUBBMEFgQUBBUEFgQVBBcEFwQVBBgEGQQUBBYEGAQVBBoEGwQUBBkEGAQaBBwEHQQUBBsEHgQUBB0EHwQUBB4EHwQgBBQEIQQgBB8EIAQhBCIEHAQaBCMEIgQhBCQEIwQaBCUEJQQaBCYEIwQlBCcEJwQlBCgEJwQoBCkEKAQqBCkEKgQoBCsEKQQqBCwELAQqBC0ELQQqBC4EIgQkBC8ELwQkBDAELwQwBDEEMgQiBC8EIgQyBDMENgQ1BDQENQQ2BDcEOgQ5BDgEOQQ6BDsEPgQ9BDwEPQQ+BD8EQgRBBEAEQQRCBEMERgRFBEQERQRGBEcESgRJBEgESQRKBEsETgRNBEwETQROBE8EUgRRBFAEUQRSBFMEUwRSBFQEVARVBFMEVARSBFYEVgRSBFcEVwRSBFgEVwRYBFkEWQRYBFoEWgRYBFsEWgRbBFwEWgRcBF0EWgRdBF4EWgReBF8EYgRhBGAEYQRiBGMEYwRiBGQEYwRkBGUEZQRkBGYEZQRmBGcEagRpBGgEaQRqBGsEawRqBGwEawRsBG0EbQRsBG4EbQRuBG8EcgRxBHAEcQRyBHMEdgR1BHQEdQR2BHcEegR5BHgEeQR6BHsEfgR9BHwEfQR+BH8EggSBBIAEgQSCBIMEhgSFBIQEhQSGBIcEigSJBIgEiQSKBIsEjgSNBIwEjQSOBI8EkgSRBJAEkQSSBJMElgSVBJQElQSWBJcEmgSZBJgEmQSaBJsE","//////////////////////////////////////////////////////////////////////////////////////////////8/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==","AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADA/////////////////////////////////////////////wAAAAAAAA==");
K("ktruck",1152,2262,-0.96,0.192,-1.92,5.8e-05,0.384,[[-0.384, 1.101], [0.384, 1.101], [-0.384, -0.973], [0.384, -0.973]],[-1.171, 0, 1.171],0.922,3.776,1.92,1.664,"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AIEAAIUhAIIRAAB/AAB/APh/APh/AAB/AAB/APh/APh/AKamAJLBAKamAJLBAJI/AKZaAJI/AKZaAJI/AKZaAJI/AKZaAIXfAIEAAIXfAIEAAIUhAJI/AIUhAJI/AMFuAMFuAKZaAKZaAKamAJLBAKamAJLBAPh/APh/AN97AN97AN+FAMGSAN+FAMGSAPiBAN+FAPiBAN+FAPh/APh/AN97AN97AIUhAJI/AIUhAJI/AN97AN97AMFuAMFuAPiBAN+FAPiBAN+FAMFuAMFuAKZaAKZaAN+FAMGSAN+FAMGSAIXfAIEAAIXfAIEAAILvAACBAACBAPiBAPiBAIEAAIUhAIEAAIUhAPiBAPiBAN+FAN+FAAB/AAB/APh/APh/AIEAAIUhAIEAAIUhAIUhAJI/AIUhAJI/AMGSAMGSAKamAKamAPh/APh/AN97AN97AMFuAMFuAKZaAKZaAN97AN97AMFuAMFuAJI/AKZaAJI/AKZaAKamAJLBAKamAJLBAIXfAIEAAIXfAIEAAN+FAN+FAMGSAMGSAJLBAIXfAJLBAIXfgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAAACBAACBAPiBAPiBAACBAACBAPiBAPiBAPiBAPiBAN+FAN+FAAB/AAB/APh/APh/AIIRAIUhAIEAAIUhAIEAAIUhAJI/AIUhAJI/AMGSAKamAMGSAKamAPh/APh/AN97AN97AMFuAMFuAKZaAKZaAN97AN97AMFuAMFuAKamAJLBAKamAJLBAIXfAILvAIXfAIEAAIEAAJI/AKZaAJI/AKZaAN+FAN+FAMGSAMGSAJLBAIXfAJLBAIXfgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAAAB/AAB/AAB/AAB/WloAWloAAH8AAH8AAH8AAHE6AH8AAHE6AIEAAIEAAIEAAIEAAC+KAC+KAC+KAC+KAC+KAC+KAC+KAC+KAC+KAC+KAE9jAE9jAHE6AE9jAE9jAHE6AE9jAE9jAIEAAIEAAIEAAIEAAH0VAH0VAH0VAH0VAH0VAH0VAH0VAH0VAH0VAH0VAH8AAH8AploAploAfRkAfRkAfRkAfRkAfRkAfRkAfRkAfRkAAAB/AAB/AAB/AAB/gQAAploAgQAAploAWloAfwAAWloAfwAAgxkAgxkAgxkAgxkAgxkAgxkAgxkAgxkAgQAAgQAAgQAAgQAAgQAAAAB/AAB/AAB/AAB/fwAAfwAAfwAAfwAAfwAAAAB/AAB/AAB/AAB/AAB/AAB/AAB/AAB/iwDPiwDPgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAiwDPiwDPgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAzwCLzwCLiwDPiwDPzwCLzwCLiwDPiwDPAH8AAH8AAH8AAH8AAH8AAH8AAH8AAH8AAH8AAH8AfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAdQDPdQDPfwAAfwAAfwAAdQDPdQDPzwCLAACBzwCLAACBMQCLMQCLAACBAACBMQCLzwCLMQCLzwCLMQCLMQCLdQDPdQDPMQCLMQCLdQDPdQDPAACBAACBAACBAACBAACBAACBAACBAACBAAB/AAB/AAB/AAB/AAB/AAB/AAB/AAB/AACBAACBAACBAACBAACBAACBAACBAACBgxkAgxkAgxkAgxkAgxkAAE9jAE9jAE9jAE9jfRkAfRkAfRkAfRkAfRkAAC+KAC+KAC+KAC+KWgBaAAB/XgBVAAB/fwAAfwAAXgBVWgBagQAAgQAApgBaogBVAAB/pgBaAAB/ogBVzwCLAACBzwCLAACBdQDPdQDPfwAAfwAAzwCLzwCLiwDPiwDPiwDPiwDPgQAAgQAAMQCLMQCLdQDPdQDPAACBMQCLAACBMQCL","////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHqQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeMQWeM6FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA6QWeMPY/gQWeMPY/gQWeMQWeMQWeMPY/gPY/gPY/gQWeMPY/gQWeMQWeMPY/gPY/gPY/gPY/gPY/gPY/gPY/gPY/gPY/gPY/gPY/gPY/gPY/gPY/gPY/gPY/gPY/gPY/gPY/gPY/gKiEcKiEcPY/gPY/gPY/gKiEcPY/gKiEcKiEcPY/gKiEcPY/gKiEcPY/gKiEcPY/gPY/gKiEcPY/gKiEcKiEcKiEcPY/gPY/g","AgABAAAABQAEAAMACAAHAAYABwAIAAkADAALAAoACwAMAA0ADQAMAA4ADgAMAA8ADwAMABAADwAQABEAEQAQABIAEQASABMAEQATABQAFAATABUAFAAVABYAFAAWABcAFwAWABgAFwAYABkAGQAYABoAGQAaABsAGQAbABwAHAAbAB0AHAAdAB4AHgAdAB8AHgAfACAAIAAfACEAIAAhACIAIAAiACMAIwAiACQAIwAkACUAIwAlACYAIwAmACcAJgAlACgAJgAoACkAKQAoACoAKgAoACsAKwAoACwAKwAsAC0ALQAsAC4ALQAuAC8ALQAvADAAMAAvADEAMAAxADIAMAAyADMAMwAyADQAMwA0ADUANQA0ADYANQA2ADcANQA3ADgAOAA3ADkAOAA5ADoAOgA5ADsAOgA7ADwAPAA7AD0APAA9AD4APAA+AD8APwA+AEAAPwBAAEEAPwBBAEIAPwBCAEMAPwBDAEQAQwBCAEUASABHAEYARwBIAEkATABLAEoATQBLAEwATQBMAE4ATwBLAE0AUABLAE8AUQBLAFAAUQBSAEsAUwBSAFEAVABSAFMAVABVAFIAVgBVAFQAVgBXAFUAWABXAFYAWQBXAFgAWQBaAFcAWwBaAFkAWwBcAFoAXQBcAFsAXQBeAFwAXwBeAF0AYABeAF8AYABhAF4AYgBhAGAAYwBhAGIAYQBjAGQAZQBkAGMAZQBmAGQAZQBnAGYAZQBoAGcAaQBoAGUAaQBqAGgAaABqAGsAbABqAGkAbQBqAGwAbQBuAGoAbwBuAG0AcABuAG8AcABxAG4AcgBxAHAAcgBzAHEAdABzAHIAdQBzAHQAdQB2AHMAdwB2AHUAdwB4AHYAeQB4AHcAeQB6AHgAewB6AHkAfAB6AHsAfAB9AHoAfgB9AHwAfwB9AH4AfQB/AIAAgQCAAH8AgQCCAIAAgQCDAIIAhACDAIEAgwCEAIUAiACHAIYAhwCIAIkAiQCIAIoAigCIAIsAiwCIAIwAjwCOAI0AjgCPAJAAkwCSAJEAkgCTAJQAlwCWAJUAlgCXAJgAmwCaAJkAmgCbAJwAnwCeAJ0AngCfAKAAowCiAKEAogCjAKQApwCmAKUApgCnAKgApgCoAKkArACrAKoAqwCsAK0AsACvAK4ArwCwALEAtACzALIAswC0ALUAuAC3ALYAtwC4ALkAvAC7ALoAuwC8AL0AwAC/AL4AvwDAAMEAxADDAMIAwwDEAMUAyADHAMYAxwDIAMkAzADLAMoAywDMAM0A0ADPAM4AzwDQANEA1ADTANIA0wDUANUA2ADXANYA1wDYANkA1wDZANoA1wDaANsA2wDaANwA3ADaAN0A4ADfAN4A3wDgAOEA5ADjAOIA4wDkAOUA5QDkAOYA5gDkAOcA5gDnAOgA5gDoAOkA7ADrAOoA6wDsAO0A8ADvAO4A7wDwAPEA9ADzAPIA8wD0APUA+AD3APYA9wD4APkA/AD7APoA+wD8AP0AAAH/AP4A/wAAAQEBBAEDAQIBAwEEAQUBBQEEAQYBCQEIAQcBCAEJAQoBDQEMAQsBDAENAQ4BEQEQAQ8BEAERARIBEAESARMBFgEVARQBFQEWARcBFwEWARgBGwEaARkBGgEbARwBHwEeAR0BHgEfASABIwEiASEBIgEjASQBJAEjASUBKAEnASYBJwEoASkBKQEoASoBLQEsASsBLAEtAS4BMQEwAS8BMAExATIBNQE0ATMBNAE1ATYBOQE4ATcBOAE5AToBPQE8ATsBPAE9AT4BQQFAAT8BQAFBAUIBRQFEAUMBRAFFAUYBSQFIAUcBSAFJAUoBSAFKAUsBTgFNAUwBTQFOAU8BUgFRAVABUQFSAVMBUQFTAVQBVwFWAVUBVgFXAVgBWwFaAVkBWgFbAVwBXwFeAV0BXgFfAWABYwFiAWEBYgFjAWQBZwFmAWUBZgFnAWgBawFqAWkBagFrAWwBagFsAW0BagFtAW4BagFuAW8BcgFxAXABcQFyAXMBdgF1AXQBdgF3AXUBeAF3AXYBeQF3AXgBegF3AXkBdwF6AXsBfAF7AXoBfAF9AXsBfgF9AXwBfQF+AX8BggGBAYABgQGCAYMBhgGFAYQBhQGGAYcBhwGGAYgBiAGGAYkBjAGLAYoBiwGMAY0BkAGPAY4BjwGQAZEBlAGTAZIBkwGUAZUBlQGWAZMBlQGUAZcBlwGUAZgBmQGWAZUBmQGaAZYBmwGaAZkBnAGaAZsBmgGcAZ0BoAGfAZ4BnwGgAaEBpAGjAaIBowGkAaUBqAGnAaYBpwGoAakBqQGoAaoBqQGqAasBrgGtAawBrQGuAa8BsgGxAbABsQGyAbMBtgG1AbQBtQG2AbcBugG5AbgBuQG6AbsBvgG9AbwBvQG+Ab8BvQG/AcABvQHAAcEBvQHBAcIBwgHBAcMBwwHBAcQBxAHBAcUBxAHFAcYBwgHDAccBxwHIAcIByAHHAckBxwHDAcoBywHKAcMBywHDAcwBywHMAc0BzgHNAcwBzQHOAc8B0AHKAcsB0AHLAdEB0AHRAdIB0gHRAdMB1AHKAdAB1QHKAdQB1QHWAcoB1gHVAdcB2gHZAdgB2QHaAdsB2wHaAdwB3AHaAd0B3QHaAd4B4QHgAd8B4AHhAeIB5QHkAeMB5AHlAeYB5AHmAecB5AHnAegB5AHoAekB7AHrAeoB6wHsAe0B8AHvAe4B7wHwAfEB9AHzAfIB8wH0AfUB+AH3AfYB9wH4AfkB/AH7AfoB+wH8Af0BAAL/Af4B/wEAAgECBAIDAgICAwIEAgUCBQIEAgYCBQIGAgcCBwIGAggCBwIIAgkCDAILAgoCCwIMAg0CEAIPAg4CDwIQAhECFAITAhICEwIUAhUCGAIXAhYCFwIYAhkCHAIbAhoCGwIcAh0CIAIfAh4CHwIgAiECJAIjAiICIwIkAiUCKAInAiYCJwIoAikCLAIrAioCKwIsAi0CLQIsAi4CLQIuAi8CLwIuAjACLwIwAjECNAIzAjICMwI0AjUCOAI3AjYCNwI4AjkCPAI7AjoCOwI8Aj0CQAI/Aj4CPwJAAkECRAJDAkICQwJEAkUCSAJHAkYCRwJIAkkCTAJLAkoCSwJMAk0CUAJPAk4CTwJQAlECVAJTAlICUwJUAlUCWAJXAlYCVwJYAlkCWQJYAloCXQJcAlsCXAJdAl4CYQJgAl8CYAJhAmICZQJkAmMCZAJlAmYCaQJoAmcCaAJpAmoCbQJsAmsCbAJtAm4CcQJwAm8CcAJxAnICdQJ0AnMCdAJ1AnYCeQJ4AncCeAJ5AnoCfQJ8AnsCfAJ9An4CgQKAAn8CgAKBAoIChQKEAoMChAKFAoYCiQKIAocCiAKJAooCjQKMAosCjAKNAo4CkQKQAo8CkAKRApIClQKUApMClAKVApYCmQKYApcCmAKZApoCnQKcApsCnAKdAp4CoQKgAp8CoAKhAqICpQKkAqMCpAKlAqYCpgKlAqcCqgKpAqgCqQKqAqsCrgKtAqwCrQKuAq8CsgKxArACsQKyArMCtgK1ArQCtQK2ArcCugK5ArgCuQK6ArsCvgK9ArwCvQK+Ar8CwgLBAsACwQLCAsMCxgLFAsQCxQLGAscCygLJAsgCyQLKAssCzgLNAswCzQLOAs8C0gLRAtAC0QLSAtMC1gLVAtQC1QLWAtcC2gLZAtgC2QLaAtsC3gLdAtwC3QLeAt8C4gLhAuAC4QLiAuMC5gLlAuQC5QLmAucC5wLmAugC6ALmAukC6QLmAuoC6gLmAusC6wLmAuwC7ALmAu0C7QLmAu4C7gLmAu8C7wLmAvAC8ALmAvEC8QLmAvIC9QL0AvMC9AL1AvYC9gL1AvcC9gL3AvgC9gL4AvkC9gL5AvoC9gL6AvsC9gL7AvwC9gL8Av0C9gL9Av4C9gL+Av8C9gL/AgAD9gIAAwEDBAMDAwIDAwMEAwUDCAMHAwYDBwMIAwkDDAMLAwoDCwMMAw0DEAMPAw4DDwMQAxEDFAMTAxIDEwMUAxUDFQMUAxYDGQMYAxcDGAMZAxoDHQMcAxsDHAMdAx4DIQMgAx8DIAMhAyIDJQMkAyMDJAMlAyYDKQMoAycDKAMpAyoDLQMsAysDLAMtAy4DMQMwAy8DMAMxAzIDMgMxAzMDNgM1AzQDNQM2AzcDOgM5AzgDOQM6AzsDPgM9AzwDPQM+Az8DQgNBA0ADQQNCA0MDQwNCA0QDRANCA0UDRQNCA0YDRgNCA0cDRwNCA0gDSANCA0kDSQNCA0oDSgNCA0sDSwNCA0wDTANCA00DTQNCA04DUQNQA08DUANRA1IDUgNRA1MDUgNTA1QDUgNUA1UDUgNVA1YDUgNWA1cDUgNXA1gDUgNYA1kDUgNZA1oDUgNaA1sDUgNbA1wDUgNcA10DYANfA14DXwNgA2EDZANjA2IDYwNkA2UDaANnA2YDZwNoA2kDbANrA2oDawNsA20DcANvA24DbwNwA3EDbwNxA3IDcgNxA3MDcQNwA3QDdQNzA3EDdANwA3YDcwN1A3cDdwN1A3YDdwN2A3ADegN5A3gDeQN6A3sDewN6A3wDfQN8A3oDfgN8A30DfAN+A38DggOBA4ADgQOCA4MDhgOFA4QDhQOGA4cDhwOGA4gDiAOGA4kDiAOJA4oDigOJA4sDiwOJA4wDiwOMA40DkAOPA44DjwOQA5EDlAOTA5IDlQOTA5QDlgOTA5UDkwOWA5cDmAOXA5YDlwOYA5kDnAObA5oDmwOcA50DoAOfA54DnwOgA6EDpAOjA6IDowOkA6UDqAOnA6YDpwOoA6kDpwOpA6oDqgOpA6sDqgOrA6wDqgOsA60DsAOvA64DrwOwA7EDsQOwA7IDtQO0A7MDtAO1A7YDuQO4A7cDuAO5A7oDugO5A7sDvgO9A7wDvQO+A78DvwO+A8ADwQPAA74DwgPAA8EDwAPCA8MDxgPFA8QDxQPGA8cDxwPGA8gDyQPIA8YDyQPGA8oDygPGA8sDzAPIA8kDzQPIA8wDzQPMA84DzQPOA88DzQPPA9ADzQPQA9EDzQPRA9IDzQPSA9MD1APIA80DyAPUA9UDzQPTA9YD1gPTA9cD2APWA9cD1wPTA9kD2QPTA9oD2QPaA9sD2QPbA9wD3APbA90D3QPbA94D3QPeA98D3QPfA+AD4APfA+ED4APhA+ID4APiA+MD4APjA+QD4APkA+UD6APnA+YD5wPoA+kD7APrA+oD6wPsA+0D8APvA+4D8QPvA/AD8gPvA/ED8wPvA/ID7wPzA/QD9QP0A/MD9gP0A/UD9AP2A/cD+gP5A/gD+QP6A/sD+wP6A/wD/QP5A/sD/AP6A/4D/wP5A/0D/gP6AwAE/gMABAEEAQQABAIEAgQABAMEAwQABAQEBAQABAUE/wMGBPkD/wMHBAYEBgQHBAgE/wMJBAcECgQJBP8DCwQJBAoEDAQJBAsEDQQJBAwEDgQJBA0EDwQJBA4EEAQJBA8EEAQPBBEEEgQJBBAEEwQJBBIECQQTBBQEEAQRBBUEFQQRBBYEFQQWBBcEGAQQBBUEEAQYBBkEHAQbBBoEGwQcBB0EHQQcBB4EHgQcBB8EIAQbBB0EGwQgBCEEIgQhBCAEIgQjBCEEJAQjBCIEIwQkBCUEKAQnBCYEJwQoBCkELAQrBCoEKwQsBC0EMAQvBC4ELwQwBDEENAQzBDIEMwQ0BDUEOAQ3BDYENwQ4BDkEOQQ4BDoEOQQ6BDsEOwQ6BDwEOwQ8BD0EQAQ/BD4EPwRABEEEQQRABEIEQQRCBEMEQwRCBEQEQwREBEUESARHBEYERwRIBEkESQRIBEoETQRMBEsETARNBE4EUQRQBE8EUARRBFIEUgRRBFMEVgRVBFQEVQRWBFcEWgRZBFgEWQRaBFsEXgRdBFwEXQReBF8EYgRhBGAEYQRiBGMEZgRlBGQEZQRmBGcEagRpBGgEaQRqBGsEbgRtBGwEbQRuBG8EcgRxBHAEcQRyBHMEdgR1BHQEdQR2BHcEegR5BHgEeQR6BHsEfgR9BHwEfQR+BH8E","//////////////////////////////////////////////////////////////////////////////////////////////8/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA","AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAMD//z8AAAAAAAAA");
K("ktaxi",1138,2232,-0.96,0.192,-1.792,5.4e-05,0.384,[[-0.384, 0.973], [0.384, 0.973], [0.384, -0.973], [-0.384, -0.973]],[-1.091, 0, 1.091],0.922,3.52,1.92,1.92,"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fwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAWloAfwAAWloAfwAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAAH8AAH8AAH8AAH8AAH8AAAB/AAB/AAB/AAB/830Vq10QDX0VVV0QAE9jAE9jAGJRAE9jAE9jAGJRAE9jAE9jAAB/AAB/AAB/AAB/AE2bAHnZAE2bAHnZAGJRAGJRAHwdAHwdgxkAgxkAgxkAgxkAgxkAgxkAgxkAgxkAgxkAgxkAfRkAfRkAfRkAfRkAfRkAfRkAfRkAfRkAfRkAfRkAAH8AAHnZAH8AAH8AAHnZAHwdAHwdAH8AAC+KAE2bAC+KAC+KAGSyAE2bAGSyAC+KAACBAACBAACBAACBAACBAACBAACBAACBAAB/AAB/AAB/AAB/ex8Aex8Aex8Aex8AAACBAACBAACBAACBAH8AAH8AAH8AAH8AhR8AhR8AhR8AhR8AgQAAgQAAgQAAgQAAfwAAfwAAfwAAfwAAAAB/AAB/AAB/AAB/AAB/AAB/AAB/AAB/AACBAACBAACBAACBAACBAACBAACBAACBAAB/AAB/AAB/AAB/AAB/AAB/AAB/AAB/AOx9AOx9AAB/AAB/ANh4ANh4AOx9AOx9AACBAACBAACBAACBAACBAACBAACBAACBgxkAgxkAgxkAgxkAgxkAAE9jAE9jAE9jAE9jAE9jAE9jAC+KAC+KAC+KAC+KfRkAfRkAfRkAfRkAfRkA","////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHqPY/gPY/gPY/gPY/gPY/gPY/gPY/gPY/gPY/gPY/gPY/gPY/gPY/gPY/gPY/gPY/gPY/gPY/gPY/gPY/gPY/gPY/gPY/gPY/gPY/gPY/gPY/gPY/gPY/gPY/gPY/gPY/gPY/gPY/gPY/gPY/gPY/gPY/gPY/gPY/gPY/gPY/gPY/gPY/gPY/gPY/gPY/gPY/gPY/gPY/gPY/gPY/gPY/gPY/gPY/gPY/gPY/gPY/gPY/gPY/gPY/gPY/gPY/gPY/gPY/gPY/gPY/gPY/gPY/gPY/gPY/gPY/gPY/gPY/gPY/gPY/gPY/gPY/gPY/gPY/gPY/gPY/gPY/gPY/gPY/gPY/gPY/gPY/gPY/gPY/gPY/gPY/gPY/gPY/gPY/gPY/gPY/gPY/gPY/gPY/gPY/gPY/gPY/gPY/gPY/gPY/gPY/gPY/gPY/gPY/gPY/gPY/gPY/gPY/gPY/gPY/gPY/gPY/gPY/gPY/gPY/gPY/gPY/gPY/gPY/gPY/gPY/gPY/gPY/gPY/gPY/gPY/gPY/gPY/gPY/gPY/gPY/gPY/gPY/gPY/gPY/gPY/gPY/gPY/gKiEcKiEcKiEcKiEcPY/gPY/gPY/gPY/gPY/gPY/gKiEcKiEcKiEcKiEcKiEcKiEcKiEcKiEcPY/gKiEcPY/gKiEcPY/gKiEcPY/gKiEcPY/gPY/gPY/gKiEcPY/gPY/gKiEcPY/gKiEcPY/gKiEcPY/gKiEcKiEcKiEcKiEcKiEcKiEcKiEcKiEcPY/gKiEcPY/gPY/gPY/gKiEcPY/gPY/g6FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA6PY/gPY/gPY/gPY/gPY/gPY/gPY/gPY/g6FA66FA66FA66FA66FA66FA66FA66FA6KiEcKiEcPY/gPY/gKiEcKiEcPY/gPY/gQWeMPY/gQWeMPY/gQWeMQWeMQWeMPY/gQWeMQWeMPY/gPY/gPY/gPY/gPY/gPY/gQWeMPY/gQWeMQWeM","AgABAAAAAQACAAMABgAFAAQABQAGAAcABwAGAAgACAAGAAkACQAGAAoACQAKAAsACwAKAAwACwAMAA0ACwANAA4ADgANAA8ADgAPABAADgAQABEAEQAQABIAEQASABMAEwASABQAEwAUABUAEwAVABYAFgAVABcAFgAXABgAGAAXABkAGAAZABoAGgAZABsAGgAbABwAGgAcAB0AHQAcAB4AHQAeAB8AHQAfACAAHQAgACEAIAAfACIAIAAiACMAIwAiACQAJAAiACUAJQAiACYAJQAmACcAJwAmACgAJwAoACkAJwApACoAKgApACsAKgArACwAKgAsAC0ALQAsAC4ALQAuAC8ALwAuADAALwAwADEALwAxADIAMgAxADMAMgAzADQANAAzADUANAA1ADYANgA1ADcANgA3ADgANgA4ADkAOQA4ADoAOQA6ADsAOQA7ADwAOQA8AD0AOQA9AD4APQA8AD8AQgBBAEAAQwBBAEIAQwBCAEQARQBBAEMARgBBAEUARwBBAEYARwBIAEEASQBIAEcASgBIAEkASgBLAEgATABLAEoATABNAEsATgBNAEwATwBNAE4ATwBQAE0AUQBQAE8AUQBSAFAAUwBSAFEAUwBUAFIAVQBUAFMAVgBUAFUAVgBXAFQAWABXAFYAWQBXAFgAVwBZAFoAWwBaAFkAWwBcAFoAWwBdAFwAWwBeAF0AXwBeAFsAXwBgAF4AXgBgAGEAYgBgAF8AYwBgAGIAYwBkAGAAZQBkAGMAZgBkAGUAZgBnAGQAaABnAGYAaABpAGcAagBpAGgAawBpAGoAawBsAGkAbQBsAGsAbQBuAGwAbwBuAG0AbwBwAG4AcQBwAG8AcgBwAHEAcgBzAHAAdABzAHIAdQBzAHQAcwB1AHYAdwB2AHUAdwB4AHYAdwB5AHgAegB5AHcAeQB6AHsAfgB9AHwAfQB+AH8AfwB+AIAAgAB+AIEAhACDAIIAgwCEAIUAhQCEAIYAhgCEAIcAhwCEAIgAiwCKAIkAigCLAIwAjwCOAI0AjgCPAJAAkwCSAJEAkgCTAJQAlwCWAJUAlgCXAJgAmwCaAJkAmgCbAJwAnwCeAJ0AngCfAKAAowCiAKEAogCjAKQAogCkAKUAqACnAKYApwCoAKkArACrAKoAqwCsAK0AsACvAK4ArwCwALEAtACzALIAswC0ALUAuAC3ALYAtwC4ALkAvAC7ALoAuwC8AL0AwAC/AL4AvwDAAMEAxADDAMIAwwDEAMUAyADHAMYAxwDIAMkAzADLAMoAywDMAM0A0ADPAM4AzwDQANEAzwDRANIAzwDSANMAzwDTANQA1wDWANUA1gDXANgA2wDaANkA2gDbANwA2gDcAN0A2gDdAN4A2gDeAN8A3wDeAOAA3wDgAOEA3wDhAOIA5QDkAOMA5ADlAOYA6QDoAOcA6ADpAOoA6gDpAOsA6wDpAOwA7ADpAO0A7ADtAO4A7gDtAO8A7wDtAPAA8wDyAPEA8gDzAPQA9wD2APUA9gD3APgA+wD6APkA+gD7APwA/wD+AP0A/gD/AAABAwECAQEBAgEDAQQBBwEGAQUBBgEHAQgBCwEKAQkBCgELAQwBDAELAQ0BEAEPAQ4BDwEQAREBFAETARIBEwEUARUBGAEXARYBFwEYARkBFwEZARoBHQEcARsBHAEdAR4BHgEdAR8BIgEhASABIQEiASMBJgElASQBJQEmAScBKgEpASgBKQEqASsBKwEqASwBLwEuAS0BLgEvATABMAEvATEBNAEzATIBMwE0ATUBOAE3ATYBNwE4ATkBPAE7AToBOwE8AT0BQAE/AT4BPwFAAUEBRAFDAUIBQwFEAUUBSAFHAUYBRwFIAUkBTAFLAUoBSwFMAU0BUAFPAU4BTwFQAVEBTwFRAVIBVQFUAVMBVAFVAVYBWQFYAVcBWAFZAVoBWAFaAVsBXgFdAVwBXQFeAV8BYgFhAWABYQFiAWMBZgFlAWQBZQFmAWcBagFpAWgBaQFqAWsBbgFtAWwBbQFuAW8BbQFvAXABbQFwAXEBdAFzAXIBcwF0AXUBeAF3AXYBeAF5AXcBegF5AXgBewF5AXoBfAF5AXsBeQF8AX0BfgF9AXwBfgF/AX0BgAF/AX4BfwGAAYEBhAGDAYIBgwGEAYUBiAGHAYYBhwGIAYkBjAGLAYoBiwGMAY0BkAGPAY4BjwGQAZEBlAGTAZIBkwGUAZUBmAGXAZYBlwGYAZkBnAGbAZoBmwGcAZ0BoAGfAZ4BnwGgAaEBpAGjAaIBowGkAaUBpQGmAaMBpQGnAaYBpQGoAacBpQGkAakBqQGkAaoBqwGoAaUBqwGsAagBrQGsAasBrgGsAa0BrAGuAa8BsgGxAbABsQGyAbMBtgG1AbQBtQG2AbcBugG5AbgBuQG6AbsBvgG9AbwBvQG+Ab8BwgHBAcABwQHCAcMBxgHFAcQBxQHGAccBxQHHAcgByQHIAccBygHIAckBywHIAcoBzAHIAcsByAHMAc0ByQHHAc4ByQHOAc8ByQHPAdAB0AHPAdEBzgHHAdIBxwHTAdIB1AHSAdMB0gHUAdUB1QHUAdYBxwHXAdMB0wHXAdgB2QHXAccB2AHXAdoB2AHaAdsB2QHcAdcB2QHdAdwB2QHeAd0B3gHZAd8B4gHhAeAB4QHiAeMB5gHlAeQB5QHmAecB6gHpAegB6QHqAesB7gHtAewB7QHuAe8B8gHxAfAB8QHyAfMB9gH1AfQB9QH2AfcB9wH2AfgB9wH4AfkB+QH4AfoB+QH6AfsB/gH9AfwB/QH+Af8BAgIBAgACAQICAgMCBgIFAgQCBQIGAgcCCgIJAggCCQIKAgsCDgINAgwCDQIOAg8CEgIRAhACEQISAhMCFgIVAhQCFQIWAhcCGgIZAhgCGQIaAhsCHgIdAhwCHQIeAh8CHwIeAiACHwIgAiECIQIgAiICIQIiAiMCJgIlAiQCJQImAicCKgIpAigCKQIqAisCLgItAiwCLQIuAi8CMgIxAjACMQIyAjMCNgI1AjQCNQI2AjcCOgI5AjgCOQI6AjsCPgI9AjwCPQI+Aj8CQgJBAkACQQJCAkMCRgJFAkQCRQJGAkcCSgJJAkgCSQJKAksCTgJNAkwCTQJOAk8CUgJRAlACUQJSAlMCVgJVAlQCVQJWAlcCWgJZAlgCWQJaAlsCXgJdAlwCXQJeAl8CYgJhAmACYQJiAmMCZgJlAmQCZQJmAmcCagJpAmgCaQJqAmsCbgJtAmwCbQJuAm8CcgJxAnACcQJyAnMCdgJ1AnQCdQJ2AncCegJ5AngCeQJ6AnsCfgJ9AnwCfQJ+An8CggKBAoACgQKCAoMChgKFAoQChQKGAocCigKJAogCiQKKAosCjgKNAowCjQKOAo8CkgKRApACkQKSApMClgKVApQClQKWApcCmgKZApgCmQKaApsCngKdApwCnQKeAp8CogKhAqACoQKiAqMCpgKlAqQCpQKmAqcCqgKpAqgCqQKqAqsCrgKtAqwCrQKuAq8CsgKxArACsQKyArMCtgK1ArQCtQK2ArcCugK5ArgCuQK6ArsCvgK9ArwCvQK+Ar8CwgLBAsACwQLCAsMCxgLFAsQCxQLGAscCygLJAsgCyQLKAssCzgLNAswCzQLOAs8C0gLRAtAC0QLSAtMC1gLVAtQC1QLWAtcC1wLWAtgC2ALWAtkC2QLWAtoC2gLWAtsC2wLWAtwC3ALWAt0C3QLWAt4C3gLWAt8C3wLWAuAC4ALWAuEC4QLWAuIC5QLkAuMC5ALlAuYC5gLlAucC5gLnAugC5gLoAukC5gLpAuoC5gLqAusC5gLrAuwC5gLsAu0C5gLtAu4C5gLuAu8C5gLvAvAC5gLwAvEC9ALzAvIC8wL0AvUC+AL3AvYC9wL4AvkC+QL4AvoC+QL6AvsC+QL7AvwC+QL8Av0C+QL9Av4C+QL+Av8C+QL/AgAD+QIAAwED+QIBAwID+QICAwMD+QIDAwQDBwMGAwUDBgMHAwgDCAMHAwkDCQMHAwoDCgMHAwsDCwMHAwwDDAMHAw0DDQMHAw4DDgMHAw8DDwMHAxADEAMHAxEDEQMHAxIDEgMHAxMDFgMVAxQDFQMWAxcDGgMZAxgDGQMaAxsDHgMdAxwDHQMeAx8DIgMhAyADIQMiAyMDJgMlAyQDJQMmAycDKgMpAygDKQMqAysDLgMtAywDLQMuAy8DMgMxAzADMQMyAzMDNgM1AzQDNQM2AzcDOgM5AzgDOQM6AzsDPgM9AzwDPQM+Az8DQgNBA0ADQQNCA0MDRgNFA0QDRQNGA0cDSgNJA0gDSQNKA0sDTgNNA0wDUQNQA08DVANTA1IDUwNUA1UDWANXA1YDVwNYA1kDXANbA1oDWwNcA10DYANfA14DXwNgA2EDYQNgA2IDYQNiA2MDZgNlA2QDZQNmA2cDagNpA2gDaQNqA2sDawNqA2wDbwNuA20DbgNvA3ADcwNyA3EDcgNzA3QDdQN0A3MDdQN2A3QDdwN2A3UDdgN3A3gDewN6A3kDegN7A3wDfwN+A30DfgN/A4ADgwOCA4EDggODA4QDhAODA4UDhQODA4YDhwOCA4QDiAOCA4cDiAOJA4IDigOJA4gDigOLA4kDjAOLA4oDhQOGA40DjAOOA4sDjQOGA48DjwOGA5ADkAOGA5EDkQOGA5IDkgOGA5MDkwOGA5QDlQOOA4wDlgOOA5UDlgOVA5cDmAOXA5UDmQOOA5YDmgOOA5kDmwOOA5oDmwOcA44DnQOcA5sDngOcA50DnwOcA54DoAOcA58DoAOfA6EDogOcA6ADowOcA6IDnAOjA6QDpwOmA6UDpgOnA6gDqwOqA6kDqgOrA6wDrQOqA6wDrAOrA64DrgOrA68DsAOqA60DrgOvA7EDrgOxA7IDsgOxA7MDswOxA7QDswO0A7UDtQO0A7YDtQO2A7cDtQO3A7gDtQO4A7kDtQO5A7oDtQO6A7sDtQO7A7wDsAO9A6oDsAO+A70DvQO+A78DvQO/A8ADsAPBA74DsAPCA8EDsAPDA8IDxAPDA7ADxAPFA8MDxAPGA8UDxAPHA8YDxAPIA8cDxwPIA8kDygPIA8QDywPIA8oDyAPLA8wDzwPOA80DzgPPA9AD0APPA9ED1APTA9ID0wPUA9UD2APXA9YD1wPYA9kD3APbA9oD2wPcA90D3QPcA94D3wPeA9wD4APeA98D3gPgA+ED5APjA+ID4wPkA+UD6APnA+YD5wPoA+kD7APrA+oD6wPsA+0D8APvA+4D7wPwA/ED8QPwA/ID8QPyA/MD8wPyA/QD8wP0A/UD9QP0A/YD9QP2A/cD+gP5A/gD+wP5A/oD+wP8A/kD/QP8A/sD/AP9A/4D/wP+A/0D/wMABP4DAAT/AwEEBAQDBAIEAgQDBAUEBAQGBAMEBQQDBAcEBgQEBAgEBwQJBAUECAQJBAcECQQIBAQEDAQLBAoECgQLBA0EDAQOBAsEDwQNBAsEDgQMBBAEDwQRBA0EEAQRBA8EEQQQBAwEFAQTBBIEEwQUBBUEGAQXBBYEFwQYBBkEHAQbBBoEGwQcBB0EIAQfBB4EHwQgBCEEJAQjBCIEIwQkBCUEKAQnBCYEJwQoBCkELAQrBCoEKwQsBC0EMAQvBC4ELwQwBDEENAQzBDIEMwQ0BDUEOAQ3BDYENwQ4BDkEOQQ4BDoEOQQ6BDsEOwQ6BDwEOwQ8BD0EQAQ/BD4EPwRABEEEQQRABEIEQQRCBEMEQwRCBEQEQwREBEUESARHBEYERwRIBEkETARLBEoESwRMBE0EUARPBE4ETwRQBFEEVARTBFIEUwRUBFUEWARXBFYEVwRYBFkEXARbBFoEWwRcBF0EYARfBF4EXwRgBGEEYQRgBGIEZQRkBGMEZARlBGYEZgRlBGcEZwRlBGgEawRqBGkEagRrBGwEbwRuBG0EbgRvBHAEcARvBHEE","/////////////////////////////////////////////////////////////////////////////////////////////wAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=","AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAPz//////z/APwAAAAA=");
K("kpolice",1120,2208,-0.96,0.256,-1.984,5.7e-05,0.384,[[0.384, -1.037], [0.384, 1.037], [-0.384, -1.037], [-0.384, 1.037]],[-1.151, 0, 1.151],0.922,3.712,1.92,1.664,"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AH8AAH8AAH8AAHrcAH8AAH8AAH8AAH8AAH8AAHrcADmOADmOAFOgADmOADmOAFOgADmOADmOz4sAi88Az4sAi88AMYsAz4sAMYsAz4sAdc8AMYsAdc8AMYsAz3UAz3UAizEAizEAi88AizEAi88AizEAAAB/AAB/AAB/AAB/AAB/AAB/AAB/AAB/MXUAMXUAz3UAz3UAdTEAdc8AdTEAdc8AdTEAdTEAMXUAMXUAAACBAACBAACBAACBAACBAACBAACBAACBAACBAACBAACBAACBAACBAACBAACBAACBAACBAACBgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAAFqmAFpaAFqmAFpaAAB/AFpaAAB/AFpaAACBAACBAFqmAFqmQmwAcToAQmwAcToAAAB/AAB/AAB/AAB/QmwAQmwAAH8AAH8AAACBAACBAACBAACBAACBAACBAACBAACBAACBAACBAACBAACBAH8AvmwAAH8AvmwAAACBAACBAACBAACBjzoAvmwAjzoAvmwAAAB/AAB/AAB/AAB/hR8AhR8AhR8AhR8AAFpaAFpaAFpaAFpaex8Aex8Aex8Aex8AADmOADmOADmOADmOgQAAgQAApgBapgBaAAB/pgBaAAB/pgBafwAAfwAAWgBaWgBaWgBaAAB/WgBaAAB/","6FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA6////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////6FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA69PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq6FA66FA66FA66FA69PHq6FA69PHq6FA69PHq9PHq6FA66FA6PY/gKiEcPY/gKiEcKiEcKiEcPY/gPY/gPY/gPY/gPY/gPY/gKiEcPY/gKiEcPY/gKiEcKiEcPY/gPY/gKiEcKiEcPY/gPY/gKiEcKiEcKiEcKiEcKiEcKiEcKiEcKiEcKiEcKiEcKiEcKiEcKiEcKiEcKiEcKiEcQWeMPY/gQWeMPY/gQWeMPY/gQWeMPY/gPY/gQWeMPY/gQWeMPY/gPY/gPY/gPY/gPY/gPY/gPY/gPY/gPY/gPY/gPY/gPY/gPY/gPY/gPY/gPY/gPY/gPY/gPY/gPY/g","AgABAAAAAQACAAMABgAFAAQABQAGAAcABwAGAAgACAAGAAkACQAGAAoACgAGAAsACgALAAwACgAMAA0ADQAMAA4ADQAOAA8ADQAPABAAEAAPABEAEAARABIAEgARABMAEgATABQAEgAUABUAFQAUABYAFQAWABcAFwAWABgAFwAYABkAGQAYABoAGQAaABsAGQAbABwAHAAbAB0AHAAdAB4AHAAeAB8AHAAfACAAHwAeACEAHwAhACIAIgAhACMAIwAhACQAJAAhACUAJAAlACYAJgAlACcAJgAnACgAJgAoACkAKQAoACoAKQAqACsAKQArACwALAArAC0ALAAtAC4ALgAtAC8ALgAvADAALgAwADEAMQAwADIAMQAyADMAMwAyADQAMwA0ADUANQA0ADYANQA2ADcANQA3ADgAOAA3ADkAOAA5ADoAOAA6ADsAOAA7ADwAOAA8AD0APAA7AD4AQQBAAD8AQABBAEIARQBEAEMARgBEAEUARgBFAEcASABEAEYASQBEAEgASgBEAEkASgBLAEQATABLAEoATQBLAEwATQBOAEsATwBOAE0ATwBQAE4AUQBQAE8AUgBQAFEAUgBTAFAAVABTAFIAVABVAFMAVgBVAFQAVgBXAFUAWABXAFYAWQBXAFgAWQBaAFcAWwBaAFkAXABaAFsAWgBcAF0AXgBdAFwAXgBfAF0AXgBgAF8AXgBhAGAAYgBhAF4AYgBjAGEAYQBjAGQAZQBjAGIAZgBjAGUAZgBnAGMAaABnAGYAaQBnAGgAaQBqAGcAawBqAGkAawBsAGoAbQBsAGsAbgBsAG0AbgBvAGwAcABvAG4AcABxAG8AcgBxAHAAcgBzAHEAdABzAHIAdQBzAHQAdQB2AHMAdwB2AHUAeAB2AHcAeAB5AHYAeAB6AHkAeAB7AHoAfAB7AHgAewB8AH0AgAB/AH4AfwCAAIEAhACDAIIAgwCEAIUAiACHAIYAhwCIAIkAjACLAIoAiwCMAI0AkACPAI4AjwCQAJEAlACTAJIAkwCUAJUAmACXAJYAlwCYAJkAmQCYAJoAnQCcAJsAnACdAJ4AoQCgAJ8AoAChAKIApQCkAKMApAClAKYAqQCoAKcAqACpAKoArQCsAKsArACtAK4ArACuAK8AsgCxALAAsQCyALMAtgC1ALQAtQC2ALcAugC5ALgAuQC6ALsAvgC9ALwAvQC+AL8AvwC+AMAAwwDCAMEAwgDDAMQAxwDGAMUAxgDHAMgAywDKAMkAygDLAMwAzADLAM0A0ADPAM4AzwDQANEA1ADTANIA0wDUANUA2ADXANYA1wDYANkA3ADbANoA2wDcAN0A4ADfAN4A3wDgAOEA5ADjAOIA4wDkAOUA6ADnAOYA5wDoAOkA7ADrAOoA6wDsAO0A8ADvAO4A7wDwAPEA9ADzAPIA8wD0APUA+AD3APYA9wD4APkA/AD7APoA+wD8AP0AAAH/AP4A/wAAAQEBBAEDAQIBAwEEAQUBCAEHAQYBBwEIAQkBDAELAQoBCwEMAQ0BEAEPAQ4BDwEQAREBFAETARIBEwEUARUBGAEXARYBFwEYARkBFwEZARoBFwEaARsBGwEaARwBHAEaAR0BIAEfAR4BHwEgASEBJAEjASIBIwEkASUBKAEnASYBJwEoASkBLAErASoBKwEsAS0BMAEvAS4BLwEwATEBNAEzATIBMwE0ATUBOAE3ATYBNwE4ATkBPAE7AToBOwE8AT0BQAE/AT4BPwFAAUEBRAFDAUIBQwFEAUUBSAFHAUYBRwFIAUkBSQFIAUoBTQFMAUsBTAFNAU4BUQFQAU8BUAFRAVIBVQFUAVMBVAFVAVYBVAFWAVcBWgFZAVgBWQFaAVsBWwFaAVwBXwFeAV0BXgFfAWABYwFiAWEBYgFjAWQBZwFmAWUBZgFnAWgBaAFnAWkBbAFrAWoBawFsAW0BbQFsAW4BcQFwAW8BcAFxAXIBdQF0AXMBdAF1AXYBeQF4AXcBeAF5AXoBfQF8AXsBfAF9AX4BgQGAAX8BgAGBAYIBhQGEAYMBhAGFAYYBiQGIAYcBiAGJAYoBjQGMAYsBjAGNAY4BkQGQAY8BkAGRAZIBkAGSAZMBlgGVAZQBlQGWAZcBlwGWAZgBmwGaAZkBmgGbAZwBnwGeAZ0BngGfAaABngGgAaEBpAGjAaIBowGkAaUBqAGnAaYBpwGoAakBrAGrAaoBqwGsAa0BsAGvAa4BrwGwAbEBtAGzAbIBswG0AbUBtQG2AbMBtQG0AbcBtwG0AbgBuQG2AbUBuQG6AbYBuwG6AbkBvAG6AbsBugG8Ab0BwAG/Ab4BvwHAAcEBxAHDAcIBwwHEAcUByAHHAcYBxwHIAckBzAHLAcoBywHMAc0B0AHPAc4BzwHQAdEB1AHTAdIB0wHUAdUB2AHXAdYB1wHYAdkB3AHbAdoB2wHcAd0B4AHfAd4B3wHgAeEB5AHjAeIB4wHkAeUB6AHnAeYB5wHoAekB7AHrAeoB6wHsAe0B8AHvAe4B7wHwAfEB9AHzAfIB8wH0AfUB+AH3AfYB9wH4AfkB/AH7AfoB+wH8Af0BAAL/Af4B/wEAAgECBAIDAgICAwIEAgUCCAIHAgYCBwIIAgkCDAILAgoCCwIMAg0CEAIPAg4CDwIQAhECFAITAhICEwIUAhUCGAIXAhYCFwIYAhkCHAIbAhoCGwIcAh0CIAIfAh4CHwIgAiECJAIjAiICIwIkAiUCKAInAiYCJwIoAikCLAIrAioCKwIsAi0CMAIvAi4CLwIwAjECNAIzAjICMwI0AjUCOAI3AjYCNwI4AjkCPAI7AjoCOwI8Aj0CQAI/Aj4CPwJAAkECQQJAAkICQgJAAkMCQgJDAkQCQgJEAkUCSAJHAkYCRwJIAkkCTAJLAkoCSwJMAk0CUAJPAk4CTwJQAlECVAJTAlICUwJUAlUCWAJXAlYCVwJYAlkCXAJbAloCWwJcAl0CYAJfAl4CXwJgAmECZAJjAmICZAJlAmMCZgJlAmQCZwJlAmYCaAJlAmcCZQJoAmkCagJpAmgCagJrAmkCbAJrAmoCawJsAm0CcAJvAm4CbwJwAnECdAJzAnICcwJ0AnUCdQJ0AnYCdQJ2AncCdQJ3AngCeAJ3AnkCeAJ5AnoCewJ4AnoCegJ5AnwCegJ8An0CfQJ8An4CgQKAAn8CgAKBAoICggKBAoMCgwKBAoQChAKBAoUChAKFAoYChgKFAocChwKFAogChgKHAokCiQKHAooCiQKKAosCjgKNAowCjQKOAo8CjQKPApACkAKPApEClAKTApICkwKUApUClQKUApYClgKUApcClwKUApgCmwKaApkCmgKbApwCnAKbAp0CnQKbAp4CngKbAp8CogKhAqACoQKiAqMCowKiAqQCpQKkAqICpgKkAqUCpAKmAqcCqgKpAqgCqQKqAqsCrgKtAqwCrQKuAq8CrwKuArACsAKuArECrwKwArICsgKwArMCsgKzArQCsgK0ArUCtQK0ArYCuQK4ArcCuAK5AroCvQK8ArsCvAK9Ar4CvAK+Ar8CvAK/AsACvALAAsECxALDAsICwwLEAsUCxQLEAsYCyQLIAscCyALJAsoCygLJAssCygLLAswCzwLOAs0CzgLPAtAC0wLSAtEC0gLTAtQC0gLUAtUC0gLVAtYC0gLWAtcC2gLZAtgC2QLaAtsC3gLdAtwC3QLeAt8C3wLeAuAC3wLgAuEC5ALjAuIC4wLkAuUC4wLlAuYC4wLmAucC5QLkAugC6ALkAukC6QLkAuoC6gLkAusC6wLkAuwC6gLrAu0C7gLtAusC8QLwAu8C8ALxAvIC9QL0AvMC9AL1AvYC9AL2AvcC+AL0AvcC9wL2AvkC9wL5AvoC+gL5AvsC+wL5AvwC+wL8Av0CAAP/Av4C/wIAAwEDAgMBAwADAgMDAwEDBAMDAwIDAwMEAwUDCAMHAwYDBwMIAwkDCQMIAwoDCgMIAwsDDAMHAwkDBwMMAw0DEAMPAw4DDwMQAxEDEQMQAxIDEQMSAxMDEwMSAxQDEwMUAxUDEwMVAxYDEwMWAxcDEwMXAxgDFwMWAxkDFwMZAxoDHQMcAxsDHAMdAx4DHAMeAx8DHwMeAyADIAMeAyEDIAMhAyIDIAMiAyMDIwMiAyQDJwMmAyUDJgMnAygDJgMoAykDJgMpAyoDJgMqAysDKwMqAywDLAMqAy0DLQMqAy4DLQMuAy8DKwMsAzADMQMwAywDMAMxAzIDMgMxAzMDNAMrAzADNQMrAzQDNgMrAzUDNgM3AysDNwM2AzgDOwM6AzkDOgM7AzwDPAM7Az0DPAM9Az4DQQNAAz8DQANBA0IDQwNCA0EDQgNDA0QDRQNEA0MDRANFA0YDSQNIA0cDSANJA0oDSgNJA0sDSwNJA0wDSwNMA00DSwNNA04DTQNMA08DTwNMA1ADUANMA1EDUQNMA1IDUQNSA1MDUwNSA1QDVANSA1UDWANXA1YDVwNYA1kDWQNYA1oDWgNYA1sDWwNYA1wDXANYA10DWwNcA14DWwNeA18DWwNfA2ADWwNgA2EDYQNgA2IDYQNiA2MDYQNjA2QDZwNmA2UDZgNnA2gDawNqA2kDagNrA2wDbwNuA20DbgNvA3ADcwNyA3EDcgNzA3QDdwN2A3UDdgN3A3gDewN6A3kDegN7A3wDfwN+A30DfgN/A4ADgAN/A4EDhAODA4IDhAOCA4UDhAOGA4MDhAOFA4cDiAOGA4QDhgOIA4kDigOHA4UDiwOHA4oDiAOMA4kDjAOHA4sDjQOMA4gDjAONA4cDkAOPA44DkAOOA5EDjwOQA5IDkAORA5MDkgOUA48DlAOTA5EDlQOUA5IDlAOVA5MDmAOXA5YDlwOYA5kDnAObA5oDmwOcA50DoAOfA54DnwOgA6EDpAOjA6IDowOkA6UDqAOnA6YDpwOoA6kDrAOrA6oDqwOsA60DrQOsA64DrQOuA68DrwOuA7ADrwOwA7EDtAOzA7IDswO0A7UDuAO3A7YDtwO4A7kDvAO7A7oDuwO8A70DwAO/A74DvwPAA8EDwQPAA8IDxQPEA8MDxAPFA8YDxgPFA8cDygPJA8gDyQPKA8sDywPKA8wDywPMA80DzQPMA84DzQPOA88D0gPRA9AD0QPSA9MD0wPSA9QD1APSA9UD1QPSA9YD1gPSA9cD1wPSA9gD2APSA9kD2QPSA9oD2gPSA9sD2wPSA9wD3APSA90D3QPSA94D4QPgA98D4APhA+ID4gPhA+MD4gPjA+QD4gPkA+UD4gPlA+YD4gPmA+cD4gPnA+gD4gPoA+kD4gPpA+oD4gPqA+sD4gPrA+wD4gPsA+0D8APvA+4D7wPwA/ED8QPwA/ID8QPyA/MD8QPzA/QD8QP0A/UD8QP1A/YD8QP2A/cD8QP3A/gD8QP4A/kD8QP5A/oD8QP6A/sD8QP7A/wD/wP+A/0D/gP/AwAEAAT/AwEEAQT/AwIEAgT/AwMEAwT/AwQEBAT/AwUEBQT/AwYEBgT/AwcEBwT/AwgECAT/AwkECQT/AwoECgT/AwsEDgQNBAwEDQQOBA8EEgQRBBAEEQQSBBMEFgQVBBQEFQQWBBcEGgQZBBgEGQQaBBsEHgQdBBwEHQQeBB8EIgQhBCAEIQQiBCMEJgQlBCQEJQQmBCcEKgQpBCgEKQQqBCsELgQtBCwELQQuBC8EMgQxBDAEMQQyBDMENgQ1BDQENQQ2BDcEOgQ5BDgEOQQ6BDsEPgQ9BDwEPQQ+BD8EQgRBBEAEQQRCBEMERgRFBEQERQRGBEcESgRJBEgESQRKBEsETgRNBEwETQROBE8EUgRRBFAEUQRSBFMEVgRVBFQEVQRWBFcEWgRZBFgEWQRaBFsEXgRdBFwEXQReBF8E","AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAPz///////////////////////////////////////////////8/AAAAAAAAAAAAAAAAAAAAAAAAAAA=","/////////////////////////////////////////////////////////////////////////////////////////////////////////////wMAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADA//8AAAAAAAAA8MoAAAAAAAAAAAA=");
K("kambulance",1564,3132,-0.96,0.256,-2.112,6.3e-05,0.384,[[-0.384, 1.293], [0.384, 1.293], [-0.384, -1.165], [0.384, -1.165]],[-1.29, 0, 1.29],0.922,4.16,1.92,2.304,"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khulVjqxlh+FXjqxkhulVvvAlh+FXvvAkVaFXjqxlVqlVjqxkVaFXvvAlVqlVvvAZCmlVvvAkhulVvvAZCmFXvvAlh+FXvvAZCmlVjqxZCmFXjqxkhulVjqxlh+FXjqxkhtGbqmFlh8mdqmFkhtGbmqVlh8mdmqVZClGbmqVkhtGbmqVZCkmdmqVlh8mdmqVkVYmdqmFkVYmdmqVwkwmdqmFwkwmdmqVlVpGbmqVwkxGbmqVkVYmdmqVwkwmdmqVZCkmdqmFZCkmdmqVlh8mdqmFlh8mdmqVkVYmdqmFlVpGbqmFkVYmdmqVlVpGbmqVlVpGbrETkVYmdrETwkxGbrETwkwmdrETZClGbrETZCkmdrETkhtGbrETlh8mdrETkVYmdrETkVYmdnIjwkwmdrETwkwmdnIjkhtGbrETlh8mdrETkhtGbnIjlh8mdnIjkVYmdrETlVpGbrETkVYmdnIjlVpGbnIjZCkmdrETZCkmdnIjlh8mdrETlh8mdnIj","AACBAACBAACBAACBAACBAACBAACBAACBAACBAACBAACBAACBgQAAploAgQAAploAAIEAAIEAAIEAAIEAAAB/AAB/AAB/AAB/AAB/gQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAWloAfwAAWloAfwAAAAB/AAB/AAB/AAB/AAB/WloAWloAAH8AAH8AAIEAAIEAAIEAAIEAAH8AAH8AploAploAfwAAfwAAfwAAfwAAfwAAfwAAMQB1AAB/MQB1AAB/gQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAAAB/zwB1AAB/zwB1MQB1AAB/MQB1AAB/AAB/AAB/AAB/AAB/AAB/AAB/AAB/AAB/AAB/AAB/AAB/zwB1zwB1AAB/AH8AAH8AAH8AAH8AAH8AAH8AfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAWgBaWgBaMQB1MQB1WgBaWgBaMQB1MQB1zwB1pgBazwB1pgBazwB1pgBazwB1pgBafwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAACl4ACl4AHI5AHI5AGpFAHsfAHsfAHsfAHI5AHsfAGpFAHI5AHsfAHsfAACBAACBAACBAACBAACBAACBAACBAACBAACBAACBAAB/AAB/AAB/AAB/AAB/AAB/AAB/AAB/AAB/AAB/TWUATWUAs2UAs2UATWUAeiIATWUAeiIAhiIAs2UAhiIAs2UAgxkAgxkAgxkAgxkAgxkAgxkAfRkAfRkAfRkAfRkAfRkAfRkAeNgAeNgAeNgAeNgAeNgAeNgAeNgAeNgAeNgAeNgAeNgAeNgAAC92AC92AGZLAC92AC92AGZLAC92AC92iNgAiNgAiNgAiNgAiNgAiNgAiNgAiNgAiNgAiNgAiNgAiNgAANh4ANh4ANh4ANh4AIEAAIEAAIEAAIEAAIEAAIEAAIEAAIEAAGZLAH8AAH8AAH8AAH8AAH8AAGZLAH8AAH8AAH8AAH8AAH8AAAB/AAB/AAB/AAB/gQAAgQAAgQAAgQAAAAB/AAB/AAB/AAB/fwAAfwAAfwAAfwAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAAAB/zwB1AAB/zwB1zwB1pgBazwB1pgBafwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAMQB1AAB/MQB1AAB/WgBaWgBaMQB1MQB1AAB/AAB/MQB1MQB1AAB/fwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAWgBaWgBaMQB1MQB1AACBAACBAACBAACBAACBAACBAACBAACBAAB/zwB1AAB/zwB1AAB/zwB1pgBazwB1pgBagQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAAACBAACBAACBAACBAG4/AFpaAG4/AFpaAH8AAHvfAH8AAHvfAFqmAG7BAFqmAG7BAG7BAFqmAG7BAFqmAFqmAG7BAFqmAG7BAH8AAHshAH8AAHshACGFAB6FAD+SAD2RAFpaAG4/AFpaAG4/AHvfAH8AAHvfAH8AACF7AB57AD9uAD1vACF7AD9uAB57AD1vABGCABGCACGFAB6FADF1AD9uADF1AD9uAG4/AFpaAG4/AFpaAG7BAHvfAG7BAHvfACGFAD+SAB6FAD2RAHvfAH8AAHvfAH8AAHshAG4/AHshAG4/AH8AAHshAH8AAHshAGdKAF9UAB57ACF7AG7BAHvfAG7BAHvfAF9UAGdKACF7AB57AD1vAE1lAD9uAFpaAFpaAD2RAE2bAD+SAFqmAFqmAHshAG4/AHshAG4/AD1vAD9uAE1lAFpaAFpaAD2RAD+SAE2bAFqmAFqmABGCABGCAB6FACGFAHshAH8AAHshAH8AAD+SADGLADGLAD+SAH8AAHvfAH8AAHvfADF1AD9uADF1AD9uACl4ACl4AAB/AAB/AAB/AAB/AAB/AAB/AFqmAFpaAFqmAFpaAAB/AAB/AFpaAFpaAIEAAIEAAIEAAIEAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAAACBAACBAACBAACBAACBAACBAACBAACBgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAAG4/AHshAG4/AHshfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAAFqmAD+SAD+SAFqmAFpaAD9uAD9uAFpaAD+SADGLADGLAD+SAHshAH8AAHshAH8AAD9uAFpaAD9uAFpaAHvfAG7BAHvfAG7BAHvfAG7BAG7BAHvfAFpaAG4/AFpaAG4/AG7BAFqmAG7BAFqmAG4/AHshAG4/AHshAD+SAFqmAD+SAFqmAH8AAH8AAH8AAH8AAH8AAH8AAH8AAH8AAH8AAH8AAH8AAH8AfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAAIEAAIEAAIEAAIEAAIEAAIEAAIEAAIEAAIEAAIEAAIEAAIEAAIEAAIEAAIEAAIEAAAB/AAB/AAB/AAB/fwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAfwAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAgQAAAACBAACBAACBAACBAH8AAH8AAH8AAH8AAH8AAH8AAH8AAH8AAH8AfwAAfwAAfwAAfwAAAH8AAH8AAH8AAH8AAH8AAH8AAH8AAH8AAH8AAACBAACBAACBAACBAACBAACBAFqmAFqmAIEAAIEAAIEAAIEAAIEAAIEAAIEAAIEAAIEAAIEApgCmzwCLpgCmzwCLpgCmpgCmiwDPiwDPMQCLWgCmMQCLWgCmWgCmWgCmdQDPdQDPWgBaGQB9WgBaGQB9dQAxdQAxWgBaWgBaGQB95wB9GQB95wB9iwAxpgBa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jzoAvmwAjzoAvmwAQmwAcToAQmwAcToAAAB/AAB/AAB/AAB/AACBAACBAACBAACBjzoAvmwAjzoAvmwAAAB/AAB/AAB/AAB/QmwAQmwAAH8AAH8AAAB/AAB/AAB/AAB/AH8AAH8AvmwAvmwAQmwAcToAQmwAcToAAACBAACBAACBAACBAACBAACBAACBAACBQmwAQmwAAH8AAH8AjzoAvmwAjzoAvmwAQmwAcToAQmwAcToAAH8AAH8AvmwAvmwA","6FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA69PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHqQWeMQWeM9PHqQWeM9PHqQWeM9PHq9PHqQWeMQWeMQWeM9PHqQWeM9PHq9PHqQWeM9PHqQWeM9PHqQWeM9PHqQWeM9PHq9PHqQWeMQWeM9PHq9PHqQWeMQWeMQWeM9PHqQWeM9PHqQWeM9PHqQWeM9PHq9PHq9PHqQWeMQWeMQWeM9PHqQWeM9PHq9PHq9PHq9PHqQWeMQWeM9PHq9PHq9PHq9PHq9PHq9PHq9PHqQWeM9PHq9PHqQWeM9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHqQWeM9PHqQWeM9PHq9PHq9PHqQWeMQWeM9PHqQWeM9PHqQWeM9PHq9PHq9PHqQWeMQWeM9PHq9PHqQWeMQWeM9PHqQWeM9PHq9PHq9PHq9PHqQWeM9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq9PHq6FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA66FA6PY/gPY/gPY/gPY/gPY/gPY/gPY/gPY/gPY/gPY/gPY/gPY/gQWeMPY/gQWeMPY/gPY/gPY/gQWeMPY/gPY/gQWeMPY/gPY/gPY/gPY/gQWeMPY/gQWeMPY/gQWeMQWeMQWeMQWeMPY/gPY/gPY/gPY/gPY/gPY/gPY/gPY/gPY/gPY/gPY/gPY/gPY/gPY/gPY/gPY/gPY/gPY/gPY/gPY/gPY/gPY/gPY/gPY/gPY/gPY/gKiEcKiEcKiEcKiEcKiEcKiEcKiEcKiEcKiEcKiEcKiEcKiEcKiEcKiEcKiEcKiEcKiEcKiEcKiEcKiEcKiEcKiEcKiEcKiEcKiEcKiEcKiEcKiEcKiEcKiEcKiEcKiEcKiEcKiEcKiEcKiEcKiEcKiEcKiEcKiEcKiEcKiEcKiEcKiEcKiEcKiEcKiEcKiEcKiEcKiEcKiEcKiEcKiEcKiEcKiEcKiEcKiEcKiEcKiEcKiEcKiEcKiEcKiEcKiEcKiEcKiEcKiEcKiEcKiEcKiEcKiEcKiEcKiEcKiEcKiEcKiEcKiEcKiEcKiEcKiEc","AgABAAAAAQACAAMAAwACAAQAAwAEAAUAAwAFAAYABgAFAAcACAAGAAcACQAGAAgACgAGAAkABgAKAAsADgANAAwADQAOAA8AEgARABAAEQASABMAFgAVABQAFQAWABcAFwAWABgAGwAaABkAGgAbABwAHQAcABsAHQAeABwAHQAfAB4AHQAgAB8AIQAgAB0AIQAiACAAIwAiACEAIwAkACIAJQAkACMAJgAkACUAJgAnACQAKAAnACYAJwAoACkAKgApACgAKgArACkAKgAsACsALAAqAC0AMAAvAC4ALwAwADEANAAzADIAMwA0ADUANQA0ADYAOQA4ADcAOAA5ADoAPQA8ADsAPAA9AD4AQQBAAD8AQABBAEIARQBEAEMARABFAEYARgBFAEcARgBHAEgASwBKAEkASgBLAEwATwBOAE0ATgBPAFAAUABPAFEAUQBPAFIAVQBUAFMAVABVAFYAVgBXAFQAWABWAFUAWABXAFYAWABZAFcAWABaAFkAWQBaAFsAWgBcAFsAWABdAFoAWgBdAFwAWABeAF0AXwBcAF0AYABeAFgAYQBcAF8AXgBgAGEAYQBiAFwAYgBhAGAAZQBkAGMAZABlAGYAaQBoAGcAaABpAGoAaABqAGsAawBqAGwAbQBsAGoAbQBuAGwAbQBvAG4AagBpAHAAbQBqAHEAcABpAHIAcgBzAHEAbQBxAHMAcwByAHQAcgBpAHQAdABpAHUAdgB1AGkAdgBtAHUAdwBtAHYAdwBvAG0AbwB3AHgAewB6AHkAegB7AHwAfAB7AH0AfQB7AH4AgQCAAH8AggCAAIEAgwCAAIIAggCEAIMAhACAAIMAhQCAAIQAhgCAAIUAhQCHAIYAiACGAIcAiACJAIYAiQCAAIYAiACKAIkAiwCAAIkAjACKAIgAjQCAAIsAigCMAI0AjQCOAIAAjgCNAIwAkQCQAI8AkACRAJIAlQCUAJMAlACVAJYAmQCYAJcAmACZAJoAnQCcAJsAnACdAJ4AoQCgAJ8AoAChAKIAogChAKMAowChAKQAowCkAKUApQCkAKYApQCmAKcApgCoAKcAqACmAKkApwCoAKoAqgCoAKsAqgCrAKwArACrAK0ArACtAK4ArgCtAK8ArwCtALAAsACtALEAsQCyALAAsgCxALMAtgC1ALQAtQC2ALcAtwC2ALgAuwC6ALkAugC7ALwAvAC7AL0AvAC9AL4AvgC9AL8AvwC9AMAAwAC9AMEAxADDAMIAxQDDAMQAxQDGAMMAxgDFAMcAxADIAMUAyQDIAMQAygDIAMkAyADKAMsAzgDNAMwAzQDOAM8AzQDPANAA0ADPANEA0QDPANIA0wDSAM8A0wDUANIA1ADTANUA2ADXANYA1wDYANkA3ADbANoA2wDcAN0A4ADfAN4A3wDgAOEA5ADjAOIA4wDkAOUA5QDkAOYA5QDmAOcA6gDpAOgA6QDqAOsA6wDqAOwA7ADqAO0A8ADvAO4A7wDwAPEA8QDwAPIA8gDwAPMA9gD1APQA9QD2APcA9QD3APgA9QD4APkA/AD7APoA+wD8AP0A/QD8AP4A/wD+APwAAAH+AP8A/gAAAQEBBAEDAQIBAwEEAQUBAwEFAQYBAwEGAQcBCgEJAQgBCQEKAQsBCQELAQwBCQEMAQ0BEAEPAQ4BDwEQAREBFAETARIBEwEUARUBGAEXARYBFwEYARkBHAEbARoBGwEcAR0BHgEaARsBGwEdAR8BGgEeASABHwEdASEBIQEdASIBIgEdASMBIAEjAR0BIAEeASQBIAElASMBIAEkASUBKAEnASYBJwEoASkBLAErASoBKwEsAS0BMAEvAS4BLwEwATEBNAEzATIBMwE0ATUBOAE3ATYBNwE4ATkBPAE7AToBOwE8AT0BQAE/AT4BPwFAAUEBRAFDAUIBQwFEAUUBSAFHAUYBRwFIAUkBTAFLAUoBSwFMAU0BUAFPAU4BTwFQAVEBVAFTAVIBUwFUAVUBWAFXAVYBVwFYAVkBVwFZAVoBXQFcAVsBXQFeAVwBXQFfAV4BXQFgAV8BYQFgAV0BYgFgAWEBYAFiAWMBYwFiAWQBZAFiAWUBZAFlAWYBZgFlAWcBZwFlAWgBaAFlAWkBaQFlAWoBagFlAWsBawFlAWwBbAFlAW0BcAFvAW4BbwFwAXEBdAFzAXIBcwF0AXUBeAF3AXYBdwF4AXkBfAF7AXoBewF8AX0BfQF8AX4BgQGAAX8BgAGBAYIBhQGEAYMBhAGFAYYBhAGGAYcBhAGHAYgBhAGIAYkBiQGIAYoBhgGFAYsBiwGFAYwBjAGFAY0BjQGFAY4BiQGKAY8BiQGPAZABiQGQAZEBiQGRAZIBiQGSAZMBiQGTAZQBiQGUAZUBmAGXAZYBlwGYAZkBnAGbAZoBmwGcAZ0BoAGfAZ4BoQGeAZ8BpAGjAaIBowGkAaUBqAGnAaYBqQGmAacBrAGrAaoBqwGsAa0BsAGvAa4BrwGwAbEBtAGzAbIBswG0AbUBuAG3AbYBuQG2AbcBvAG7AboBuwG8Ab0BwAG/Ab4BvwHAAcEBxAHDAcIBwwHEAcUByAHHAcYBxwHIAckBzAHLAcoBzQHKAcsB0AHPAc4BzwHQAdEB1AHTAdIB0wHUAdUB2AHXAdYB1wHYAdkB3AHbAdoB2wHcAd0B4AHfAd4B3wHgAeEB5AHjAeIB4wHkAeUB6AHnAeYB5wHoAekB7AHrAeoB6wHsAe0B8AHvAe4B7wHwAfEB9AHzAfIB8wH0AfUB8wH1AfYB+QH4AfcB+AH5AfoB+AH6AfsB/gH9AfwB/QH+Af8BAgIBAgACAQICAgMCAwICAgQCBwIGAgUCBgIHAggCCAIHAgkCDAILAgoCCwIMAg0CEAIPAg4CEQIOAg8CFAITAhICFQISAhMCGAIXAhYCGQIWAhcCHAIbAhoCHQIaAhsCIAIfAh4CHwIgAiECIgIhAiACIgIjAiECJAIjAiICIwIkAiUCKAInAiYCJwIoAikCLAIrAioCKwIsAi0CMAIvAi4CLwIwAjECNAIzAjICMwI0AjUCNQI0AjYCNgI0AjcCNwI0AjgCOAI0AjkCOAI5AjoCOAI6AjsCOwI6AjwCOwI8Aj0COwI9Aj4CPgI9Aj8CPgI/AkACQAI/AkECQAJBAkICQAJCAkMCQwJCAkQCQwJEAkUCRQJEAkYCRQJGAkcCRwJGAkgCRwJIAkkCRwJJAkoCSgJJAksCSgJLAkwCSgJMAk0CSgJNAk4CTQJMAk8CTQJPAlACUwJSAlECUgJTAlQCVwJWAlUCVgJXAlgCWwJaAlkCWgJbAlwCXAJbAl0CXAJdAl4CXAJeAl8CXwJeAmACXwJgAmECXwJhAmICXwJiAmMCXwJjAmQCXwJkAmUCXwJlAmYCXwJmAmcCXwJnAmgCawJqAmkCbAJpAmoCbwJuAm0CbgJvAnACbgJwAnECcQJwAnICcgJwAnMCcgJzAnQCdAJzAnUCdQJzAnYCdgJzAncCdwJzAngCeAJzAnkCeQJzAnoCegJzAnsCewJzAnwCfwJ+An0CgAJ9An4CgwKCAoEChAKBAoIChwKGAoUCiAKFAoYCiwKKAokCjAKJAooCjwKOAo0CkAKNAo4CkwKSApEClAKRApIClwKWApUCmAKVApYCmwKaApkCnAKZApoCnwKeAp0CoAKdAp4CowKiAqECpAKhAqICpwKmAqUCqAKlAqYCqwKqAqkCqgKrAqwCrAKrAq0CrQKrAq4CrgKrAq8CsAKtAq4CsQKtArACsQKwArICswKtArECrQKzArQCtwK2ArUCtgK3ArgCtgK4ArkCtgK5AroCtgK6ArsCtgK7ArwCtgK8Ar0CtgK9Ar4CtgK+Ar8CwgLBAsACwQLCAsMCwwLCAsQCxALCAsUCxQLCAsYCxgLCAscCxwLCAsgCyALCAskCyQLCAsoCzQLMAssCzALNAs4CzgLNAs8CzgLPAtAC0ALPAtEC0QLPAtIC0QLSAtMC1ALMAs4C1QLMAtQC1gLMAtUC1wLMAtYC1gLYAtcC1wLZAswC2QLXAtoC3QLcAtsC3ALdAt4C4QLgAt8C4ALhAuIC4ALiAuMC4ALjAuQC5ALjAuUC5QLjAuYC5QLmAucC5wLmAugC6ALmAukC6ALpAuoC6gLpAusC6gLrAuwC7ALrAu0C7ALtAu4C7gLtAu8C7wLtAvAC7wLwAvEC8QLwAvIC8QLyAvMC8wLyAvQC9ALyAvUC9AL1AvYC9gL1AvcC9wL1AvgC9gL3AvkC+QL3AvoC/QL8AvsC/AL9Av4C/gL9Av8C/gL/AgAD/gIAAwED/gIBAwIDAgMBAwMDAwMBAwQDAwMEAwUDBQMEAwYDBgMEAwcDBgMHAwgDCAMHAwkDCAMJAwoDCgMJAwsDCgMLAwwDDAMLAw0DDQMLAw4DDQMOAw8DDwMOAxADDwMQAxEDEQMQAxIDEgMQAxMDEgMTAxQDFAMTAxUDFQMTAxYDFgMTAxcDFQMWAxgDGAMWAxkDHAMbAxoDGwMcAx0DHQMcAx4DHgMcAx8DHgMfAyADHgMgAyEDIQMgAyIDIQMiAyMDIQMjAyQDJAMjAyUDJAMlAyYDJgMlAycDJgMnAygDJgMoAykDKQMoAyoDKQMqAysDKwMqAywDKwMsAy0DLQMsAy4DLQMuAy8DLQMvAzADMAMvAzEDMAMxAzIDMAMyAzMDMgMxAzQDMgM0AzUDOAM3AzYDNwM4AzkDPAM7AzoDOwM8Az0DQAM/Az4DPwNAA0EDQQNAA0IDQQNCA0MDQQNDA0QDRANDA0UDRQNDA0YDSQNIA0cDSANJA0oDTQNMA0sDTANNA04DTgNPA0wDTwNOA1ADUQNQA04DUANRA1IDUgNRA1MDVgNVA1QDVQNWA1cDWgNZA1gDWQNaA1sDXgNdA1wDXQNeA18DXwNeA2ADYANeA2EDYQNeA2IDYQNiA2MDYQNjA2QDZANjA2UDaANnA2YDZwNoA2kDbANrA2oDawNsA20DcANvA24DbwNwA3EDdANzA3IDcwN0A3UDeAN3A3YDdwN4A3kDfAN7A3oDewN8A30DgAN/A34DfwOAA4EDhAODA4IDgwOEA4UDiAOHA4YDhwOIA4kDjAOLA4oDiwOMA40DjQOOA4sDjQOMA48DjwOMA5ADkQOOA40DkQOSA44DkwOSA5EDlAOSA5MDkgOUA5UDmAOXA5YDlwOYA5kDlwOZA5oDlwOaA5sDlwObA5wDnAObA50DnQObA54DnQOeA58DogOhA6ADoQOiA6MDpgOlA6QDpQOmA6cDqgOpA6gDqQOqA6sDrgOtA6wDrQOuA68DsgOxA7ADsQOyA7MDswOyA7QDtwO2A7UDtgO3A7gDuwO6A7kDugO7A7wDvwO+A70DvgO/A8ADwAO/A8EDxAPDA8IDwwPEA8UDxQPEA8YDyQPIA8cDyAPJA8oDzQPMA8sDzAPNA84D0QPQA88D0APRA9ID1QPUA9MD1APVA9YD2QPYA9cD2APZA9oD2gPZA9sD3gPdA9wD3QPeA98D4gPhA+AD4QPiA+MD5gPlA+QD5QPmA+cD6gPpA+gD6QPqA+sD7gPtA+wD7QPuA+8D8gPxA/AD8QPyA/MD9gP1A/QD9QP2A/cD+gP5A/gD+QP6A/sD+wP6A/wD+wP8A/0D/QP8A/4D/QP+A/8DAgQBBAAEAQQCBAMEBgQFBAQEBQQGBAcECgQJBAgECQQKBAsEDgQNBAwEDQQOBA8EEgQRBBAEEQQSBBMEFgQVBBQEFQQWBBcEGgQZBBgEGQQaBBsEHgQdBBwEHQQeBB8EIgQhBCAEIQQiBCMEIwQiBCQEIwQkBCUEJQQkBCYEJQQmBCcEKgQpBCgEKQQqBCsELgQtBCwELQQuBC8EMgQxBDAEMQQyBDMENgQ1BDQENQQ2BDcEOgQ5BDgEOQQ6BDsEPAQ7BDoEOwQ8BD0EQAQ/BD4EPwRABEEEQgRBBEAEQQRCBEMERgRFBEQERQRGBEcERwRGBEgESwRKBEkESgRLBEwETQRMBEsETARNBE4EUQRQBE8EUARRBFIEUwRSBFEEUgRTBFQEVwRWBFUEVgRXBFgEWwRaBFkEWgRbBFwEXwReBF0EXgRfBGAEYwRiBGEEYgRjBGQEZwRmBGUEZgRnBGgEawRqBGkEagRrBGwEbQRsBGsEbARtBG4EcQRwBG8EcARxBHIEdQR0BHMEdAR1BHYEdQR3BHYEdwR1BHgEewR6BHkEegR7BHwEfwR+BH0EfgR/BIAEfgSABIEEggSABH8EgASDBIEEgwSABIIEhgSFBIQEhQSGBIcEhwSIBIUEiASHBIkEjASLBIoEiwSMBI0EkASPBI4EjwSQBJEElASTBJIEkwSUBJUEkwSVBJYEmQSYBJcEmASZBJoEnQScBJsEnASdBJ4EoQSgBJ8EoAShBKIEpQSkBKMEpASlBKYEqQSoBKcEqASpBKoErQSsBKsErAStBK4ErwSuBK0ErgSvBLAEswSyBLEEsgSzBLQEtASzBLUEtQSzBLYEtgSzBLcEtwSzBLgEuASzBLkEuQSzBLoEugSzBLsEuwSzBLwEvASzBL0EvQSzBL4EvgSzBL8EwgTBBMAEwQTCBMMExgTFBMQExQTGBMcEygTJBMgEyQTKBMsEygTMBMsEzATKBM0E0ATPBM4EzwTQBNEE0gTRBNAE0QTSBNME1gTVBNQE1QTWBNcE2ATVBNcE1QTYBNkE3ATbBNoE2wTcBN0E3gTdBNwE3QTeBN8E4gThBOAE4QTiBOME5gTlBOQE5QTmBOcE6gTpBOgE6QTqBOsE7gTtBOwE7QTuBO8E8ATvBO4E7wTwBPEE9ATzBPIE8wT0BPUE+AT3BPYE9wT4BPkE+QT4BPoE+QT6BPsE+QT7BPwE+QT8BP0E+QT9BP4E+QT+BP8E+QT/BAAF+QQABQEF+QQBBQIF+QQCBQMF+QQDBQQFBwUGBQUFBgUHBQgFCQUGBQgFBgUJBQoFDQUMBQsFDAUNBQ4FDwUOBQ0FDgUPBRAFEwUSBREFEgUTBRQFFQUUBRMFFAUVBRYFGQUYBRcFGAUZBRoFHQUcBRsFHAUdBR4FIQUgBR8FIAUhBSIFJQUkBSMFJAUlBSYFKQUoBScFKAUpBSoFLQUsBSsFLAUtBS4FLgUvBSwFLQUwBS4FLgUxBS8FMQUuBTAFNAUzBTIFMwU0BTUFOAU3BTYFNwU4BTkFOgU5BTgFNwU5BTsFOQU6BTwFOwU5BTwFPwU+BT0FPgU/BUAFQwVCBUEFQgVDBUQFRAVDBUUFRQVDBUYFRgVDBUcFRwVDBUgFSwVKBUkFSgVLBUwFTwVOBU0FTgVPBVAFUwVSBVEFUgVTBVQFVAVTBVUFVAVVBVYFVAVWBVcFVAVXBVgFWwVaBVkFXAVZBVoFXQVcBVoFXgVdBVoFXwVeBVoFYAVfBVoFYQVgBVoFYgVhBVoFYwViBVoFZgVlBWQFZwVkBWUFaAVkBWcFaQVkBWgFagVkBWkFawVkBWoFbAVkBWsFbQVkBWwFbgVkBW0FcQVwBW8FcQVvBXIFcAVxBXMFdAVxBXIFcwVxBXUFcQV0BXUFeAV3BXYFdwV4BXkFeQV4BXoFfQV8BXsFfAV9BX4FfgV9BX8FggWBBYAFgQWCBYMFgwWCBYQFgwWEBYUFhQWEBYYFhQWGBYcFigWJBYgFiQWKBYsFiwWKBYwFiwWMBY0FjQWMBY4FjQWOBY8FkgWRBZAFkQWSBZMFkwWSBZQFkwWUBZUFmAWXBZYFlwWYBZkFmQWYBZoFmgWYBZsFngWdBZwFnwWdBZ4FnwWgBZ0FoQWgBZ8FoQWiBaAFowWiBaEFpAWiBaMFogWkBaUFqAWnBaYFpwWoBakFqQWoBaoFqgWoBasFrAWqBasFqwWoBa0FrQWoBa4FrQWuBa8FsgWxBbAFsQWyBbMFtgW1BbQFtQW2BbcFugW5BbgFuQW6BbsFvgW9BbwFvQW+Bb8FwgXBBcAFwQXCBcMFxgXFBcQFxQXGBccFygXJBcgFyQXKBcsFzgXNBcwFzQXOBc8F0gXRBdAF0QXSBdMF1gXVBdQF1QXWBdcF2gXZBdgF2QXaBdsF3gXdBdwF3QXeBd8F4gXhBeAF4QXiBeMF5gXlBeQF5QXmBecF6gXpBegF6QXqBesF7gXtBewF7QXuBe8F8gXxBfAF8QXyBfMF9gX1BfQF9QX2BfcF+gX5BfgF+QX6BfsF/gX9BfwF/QX+Bf8FAgYBBgAGAQYCBgMGBgYFBgQGBQYGBgcGCgYJBggGCQYKBgsGDgYNBgwGDQYOBg8GEgYRBhAGEQYSBhMGFgYVBhQGFQYWBhcGGgYZBhgGGQYaBhsG","AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADA//////////////////////////////////////////////////////////////////////////////////////////////////////////////8PAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==","/////////////////////////////////////wMAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAwP///wAAAAAAAAAAAAAAAAAAAAAAAA==");
})();
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
  const B = c.body, DK = '#2a211c', GL = TOON ? '#41678c' : '#223344';
  const specs = [
    [2.35, 1.05, 8.2, 0, 1.02, 0, color, 1],
    [2.22, 0.85, 7.15, 0, 1.88, -0.2, GL],
    [2.4, 0.26, 8.28, 0, 2.42, -0.05, color, 1],
    [1.7, 0.2, 0.08, 0, 2.54, 3.9, '#f6c431', 2],
    [0.06, 1.45, 0.95, 1.18, 1.14, 1.45, '#3a322c'],
    [0.06, 1.45, 0.95, 1.18, 1.14, 2.55, '#3a322c'],
    [2.42, 0.2, 0.16, 0, 0.42, 4.14, DK],
    [2.42, 0.2, 0.16, 0, 0.42, -4.14, DK],
    [2.38, 0.12, 8.22, 0, 0.82, 0, '#f4f1ea', 2],
  ];
  c.geo = mergeBoxes(specs);
  const bm = new THREE.Mesh(c.geo, carMat()); bm.castShadow = true; B.add(bm); c.bodyMesh = bm;
  if (TOON) { c.hull = new THREE.Mesh(c.geo, hullMats().box); B.add(c.hull); }
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
  if (W.lampPools) W.lampPools.visible = n;
  if (W.lampHeads) W.lampHeads.visible = n;
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
  spawnCars(); spawnEgg(); initTraffic(); initPolice(); initMissions(); initGarages(); initDriveFx(); if (typeof initDive === 'function') initDive();
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
    if (typeof waterAt === 'function' && waterAt(player.x, player.z) === 'shallow') speed *= 0.5;
    const nx = player.x + mx * speed * dt, nz = player.z + mz * speed * dt;
    const hop = typeof bvhMove === 'function' ? bvhMove(player.x, player.z, nx, nz, 0.35, 0.9) : null;
    collideCircle(hop ? hop.x : nx, hop ? hop.z : nz, 0.35, col, true, !(hop && hop.used));
    if (hop && hop.hit) { col.hit = true; col.nx = hop.nx; col.nz = hop.nz; }
    let px = col.x, pz = col.z;
    if (insideBuilding(px, pz, 0) && !insideBuilding(player.x, player.z, 0)) { px = player.x; pz = player.z; }
    if (typeof waterAt === 'function' && waterAt(px, pz) === 'deep') {
      px = player.x; pz = player.z;
      const now = performance.now();
      if (now - (G.wetFoot || 0) > 1600) { G.wetFoot = now; toast('Za głęboko! Tu się nie przejdzie.'); }
    }
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
  if (typeof waterAt === 'function' && waterAt(c.x, c.z) !== 'deep') c.dry = { x: c.x, z: c.z };
  // SHALLOWS: bród przez rów albo brzeg jeziora, wolno i z pluskiem.
  if (typeof waterAt === 'function' && waterAt(c.x, c.z) === 'shallow') {
    MAXV = Math.min(MAXV, 6.2); ACC = Math.min(ACC, 4);
    if (vF > MAXV) vF -= (vF - MAXV) * Math.min(1, dt * 3.2);
    if (c === activeCar && Math.abs(vF) > 1.5 && performance.now() - (c.splashT || 0) > 180) { c.splashT = performance.now(); splashAt(c.x, c.y || 0, c.z, 4); }
  }
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
      collideCircle(cx, cz, c.rad, col, true, !(hop && hop.used)); // TREE-COLLIDE
      if (col.hit) {
        c.x += col.x - cx; c.z += col.z - cz;
        const vn = c.vx * col.nx + c.vz * col.nz;
        if (vn < 0) { impact = Math.max(impact, -vn); c.vx -= vn * col.nx * 1.35; c.vz -= vn * col.nz * 1.35; c.vx *= 0.8; c.vz *= 0.8; }
      }
    }
    // safety: never let any part of the car end up inside a building footprint
    let bad = false; for (const off of c.offs) if (insideBuilding(c.x + Math.sin(c.h) * off, c.z + Math.cos(c.h) * off, 0)) { bad = true; break; }
    if (bad) { impact = Math.max(impact, Math.hypot(c.vx, c.vz)); c.x = ox; c.z = oz; c.vx *= -0.25; c.vz *= -0.25; break; }
    // WATER-BLOCK: głęboka woda odrzuca auto na ostatni suchy punkt.
    if (typeof waterAt === 'function' && waterAt(c.x, c.z) === 'deep') {
      splashAt(c.x, c.y || 0, c.z, 8);
      const back = c.dry || (typeof dryNear === 'function' ? dryNear(ox, oz) : null);
      if (back) { c.x = back.x; c.z = back.z; c.dry = { x: back.x, z: back.z }; }
      else { c.x = ox; c.z = oz; }
      c.vx = 0; c.vz = 0;
      if (isPlayer && performance.now() - (G.wetCar || 0) > 1600) { G.wetCar = performance.now(); toast('Auto nie pływa!'); }
      break;
    }
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
  if (!zone && !c.y && !c.vy && !c.air && !c.sus && !c.susV && !c.pitch && !c.roll) {
    const deck = typeof bridgeDeckH === 'function' ? bridgeDeckH(c.x, c.z) : 0;
    if (deck < 0.25) { c.pgh = 0; return; }
  }
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
  if (G.diving && typeof diveCamera === 'function') { diveCamera(); return; }
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
  if (G.diving) {
    if (W.chunkGroup) W.chunkGroup.visible = false;
    if (W.treeGroup) W.treeGroup.visible = false;
    if (W.ground) W.ground.visible = false;
    if (TR && TR.pedMesh) TR.pedMesh.visible = false;
    for (const c of cars) if (c.g && c.g.visible) c.g.visible = false;
    return;
  }
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
    else if (G.diving && typeof updateDive === 'function') updateDive(dt);
    else if (G.cut) { G.cut.t -= dt; if (G.mode === 'car') updateCar(activeCar, dt, { thr: 0, steer: 0, hand: true }); if (G.cut.t <= 0) { const f = G.cut.fn; G.cut = null; f(); } }
    else if (G.mode === 'foot') updateFoot(dt); else updateCar(activeCar, dt, true);
    updateParked(dt);
    updateTraffic(dt); updatePolice(dt); updateDamage(dt); updateShops(dt);
    updateEgg(dt); updateMissions(dt); updateNav(dt); updateGarages(dt); updateDriveFx(dt); if (typeof updateRange === 'function') updateRange(dt);
    const eh = G.diving || G.inRange ? null : (eggHint() || missionHint() || (typeof rangeHint === 'function' ? rangeHint() : null) || garageHint() || shopHint());
    const diveH = !G.diving && !eh && typeof diveHint === 'function' ? diveHint() : '';
    const near = !G.diving && G.mode === 'foot' && cars.some((c) => Math.hypot(c.x - player.x, c.z - player.z) < 3.8);
    const ride = (!eh && !near && !diveH && typeof rideHint === 'function') ? rideHint() : '';
    hint(G.diving ? '' : (eh || diveH || (near ? (isTouch ? 'Naciśnij Wsiądź' : 'Naciśnij E albo F, aby wsiąść') : '') || ride));
    const lbl = G.diving ? 'Wynurz' : (diveH ? 'NURKUJ' : (G.mode === 'foot' ? (eh ? (nearEggButton() ? 'TELEPORT' : 'AKCJA') : 'Wsiądź') : 'Wysiądź'));
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
  let h = 0;
  if (W.off && inOffRect(x, z)) {
    const m = offMask(x, z); h = m > 0.002 ? m * hillRaw(x, z) : 0;
    if (bumps && m > 0.15) h += m * 0.09 * (Math.sin(x * 2.3) * Math.sin(z * 1.9) + 0.6 * Math.sin(x * 0.9 + z * 1.3));
    for (const r of W.off.ramps) {
      const dx = x - r.x, dz = z - r.z; const u = dx * r.fx + dz * r.fz, v = dx * r.fz - dz * r.fx;
      if (u > 0 && u < r.L && Math.abs(v) < r.w / 2) { const y = r.base + u / r.L * r.H; if (y > h) h = y; }
    }
  }
  if (typeof bridgeDeckH === 'function') { const b = bridgeDeckH(x, z); if (b > h) h = b; }
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

// OFFROAD-RINGS-DRY: dry trail samples a car can actually drive, joined across fords and bridges.
function segDrivable(x0, z0, x1, z1) {
  const L = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.ceil(L / 8));
  for (let k = 0; k <= n; k++) {
    const t = k / n;
    if (waterAt(x0 + (x1 - x0) * t, z0 + (z1 - z0) * t, true) === 'deep') return false;
  }
  return true;
}
function buildDryNet() {
  const nodes = [], parent = [];
  const find = (a) => { while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a]; } return a; };
  const unite = (a, b) => { a = find(a); b = find(b); if (a !== b) parent[a] = b; };
  const add = (x, z) => { const i = nodes.length; nodes.push({ x, z }); parent.push(i); return i; };
  for (const t of W.off.trails) {
    const p = t.pts; let prev = -1, px = 0, pz = 0;
    for (let i = 0; i < p.length - 2; i += 2) {
      const x1 = p[i], z1 = p[i + 1], x2 = p[i + 2], z2 = p[i + 3];
      const L = Math.hypot(x2 - x1, z2 - z1) || 1, steps = Math.max(1, Math.ceil(L / 16));
      for (let s = (i === 0 ? 0 : 1); s <= steps; s++) {
        const x = x1 + (x2 - x1) * (s / steps), z = z1 + (z2 - z1) * (s / steps);
        if (waterAt(x, z, true) === 'deep') { prev = -1; continue; }
        if (prev >= 0 && Math.hypot(x - px, z - pz) < 8) continue;
        const id = add(x, z);
        if (prev >= 0 && Math.hypot(x - px, z - pz) < 28 && segDrivable(px, pz, x, z)) unite(prev, id);
        prev = id; px = x; pz = z;
      }
    }
  }
  const cell = 24, buckets = new Map();
  nodes.forEach((n, i) => { const k = Math.floor(n.x / cell) + ',' + Math.floor(n.z / cell); const a = buckets.get(k); if (a) a.push(i); else buckets.set(k, [i]); });
  for (let i = 0; i < nodes.length; i++) {
    const cx = Math.floor(nodes[i].x / cell), cz = Math.floor(nodes[i].z / cell);
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
      const a = buckets.get((cx + dx) + ',' + (cz + dz)); if (!a) continue;
      for (const j of a) {
        if (j <= i || find(i) === find(j)) continue;
        const d = Math.hypot(nodes[i].x - nodes[j].x, nodes[i].z - nodes[j].z);
        if (d > 22 || d < 0.4) continue;
        if (segDrivable(nodes[i].x, nodes[i].z, nodes[j].x, nodes[j].z)) unite(i, j);
      }
    }
  }
  const nearestIn = (comp, x, z, maxR) => {
    let best = -1, bd = maxR * maxR;
    for (let i = 0; i < nodes.length; i++) {
      if (comp >= 0 && find(i) !== comp) continue;
      const d = (nodes[i].x - x) ** 2 + (nodes[i].z - z) ** 2;
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  };
  return { nodes, find, nearest: (x, z, maxR) => nearestIn(-1, x, z, maxR), nearestIn };
}
function nearestDryReach(x0, z0, tx, tz) {
  const pad = 900, cell = 18;
  const minx = Math.min(x0, tx) - pad, minz = Math.min(z0, tz) - pad;
  const maxx = Math.max(x0, tx) + pad, maxz = Math.max(z0, tz) + pad;
  const nx = Math.ceil((maxx - minx) / cell), nz = Math.ceil((maxz - minz) / cell);
  if (nx < 2 || nz < 2 || nx * nz > 50000) return null;
  const ix = (x) => Math.max(0, Math.min(nx - 1, Math.floor((x - minx) / cell)));
  const iz = (z) => Math.max(0, Math.min(nz - 1, Math.floor((z - minz) / cell)));
  const id = (i, j) => j * nx + i;
  const blocked = new Uint8Array(nx * nz);
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    if (waterAt(minx + (i + 0.5) * cell, minz + (j + 0.5) * cell, true) === 'deep') blocked[id(i, j)] = 1;
  }
  const start = id(ix(x0), iz(z0)), goal = id(ix(tx), iz(tz));
  blocked[start] = 0;
  const q = [start]; const seen = new Uint8Array(nx * nz); seen[start] = 1;
  for (let qi = 0; qi < q.length && !seen[goal]; qi++) {
    const cur = q[qi], i = cur % nx, j = (cur / nx) | 0;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ni = i + di, nj = j + dj; if (ni < 0 || nj < 0 || ni >= nx || nj >= nz) continue;
      const nid = id(ni, nj); if (seen[nid] || blocked[nid]) continue;
      seen[nid] = 1; q.push(nid);
    }
  }
  if (seen[goal]) return { x: tx, z: tz, reached: true };
  let best = null, bd = 1e18;
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    if (!seen[id(i, j)]) continue;
    const x = minx + (i + 0.5) * cell, z = minz + (j + 0.5) * cell;
    if (Math.hypot(x - x0, z - z0) < 90) continue;
    const d = (x - tx) ** 2 + (z - tz) ** 2;
    if (d < bd) { bd = d; best = { x, z, reached: false }; }
  }
  return best;
}
function placeDryRings(o, raw) {
  const net = buildDryNet();
  o.ringMoves = []; o.ringGaps = []; o.cps = [];
  o.ringScan = raw.map(([x, z], i) => ({ i, x: +x.toFixed(1), z: +z.toFixed(1), w: waterAt(x, z), car: waterAt(x, z, true) }));
  let comp = -1;
  raw.forEach(([rx, rz], i) => {
    const wet = waterAt(rx, rz, true) === 'deep';
    let id = net.nearest(rx, rz, wet ? 450 : 60);
    if (wet && comp >= 0 && (id < 0 || net.find(id) !== comp)) {
      const alt = net.nearestIn(comp, rx, rz, 450);
      if (alt >= 0) id = alt;
    }
    let x = rx, z = rz;
    if (wet && id >= 0) { x = net.nodes[id].x; z = net.nodes[id].z; }
    if (Math.hypot(x - rx, z - rz) > 2) o.ringMoves.push({ i, ox: +rx.toFixed(1), oz: +rz.toFixed(1), x: +x.toFixed(1), z: +z.toFixed(1) });
    o.cps.push([x, z]);
    if (id >= 0 && Math.hypot(net.nodes[id].x - x, net.nodes[id].z - z) < 30) comp = net.find(id);
    else { const n = net.nearest(x, z, 36); if (n >= 0) comp = net.find(n); }
  });
  for (let i = 1; i < o.cps.length; i++) {
    const a = o.cps[i - 1], b = o.cps[i];
    if (segDrivable(a[0], a[1], b[0], b[1])) continue;
    const hit = nearestDryReach(a[0], a[1], b[0], b[1]);
    if (hit && hit.reached) continue;
    if (!hit) { o.ringGaps.push({ i: i - 1, j: i }); continue; }
    let x = hit.x, z = hit.z;
    const tr = nearestTrailPoint(x, z, 36);
    if (tr && waterAt(tr.x, tr.z, true) !== 'deep' && Math.hypot(tr.x - x, tr.z - z) < 36) { x = tr.x; z = tr.z; }
    o.ringMoves.push({ i, ox: +b[0].toFixed(1), oz: +b[1].toFixed(1), x: +x.toFixed(1), z: +z.toFixed(1), why: 'odcięty' });
    o.cps[i] = [x, z];
  }
  for (let i = 1; i < o.cps.length; i++) {
    const a = o.cps[i - 1], b = o.cps[i];
    if (segDrivable(a[0], a[1], b[0], b[1])) continue;
    const hit = nearestDryReach(a[0], a[1], b[0], b[1]);
    if (!hit || !hit.reached) o.ringGaps.push({ i: i - 1, j: i, ax: +a[0].toFixed(1), az: +a[1].toFixed(1), bx: +b[0].toFixed(1), bz: +b[1].toFixed(1) });
  }
  if (o.th && waterAt(o.th.x, o.th.z, true) === 'deep') {
    const id = net.nearest(o.th.x, o.th.z, 300);
    if (id >= 0) { o.ringMoves.push({ i: 'start', ox: +o.th.x.toFixed(1), oz: +o.th.z.toFixed(1), x: +net.nodes[id].x.toFixed(1), z: +net.nodes[id].z.toFixed(1) }); o.th.x = net.nodes[id].x; o.th.z = net.nodes[id].z; }
  }
}
// Called from buildWorld after roads/buildings/water exist and before trees are planted.
function buildOffroad(scene) {
  const c = OFFZ.cell; const nx = Math.ceil((OFFZ.x1 - OFFZ.x0) / c) + 1, nz = Math.ceil((OFFZ.z1 - OFFZ.z0) / c) + 1;
  const o = W.off = { nx, nz, mask: new Float32Array(nx * nz), ramps: [], trails: [], cps: [] };
  for (const r of W.roads) if (trailInZone(r.type, r.pts)) o.trails.push(r);
  // trailhead + checkpoints snapped to real OSM tracks/paths
  const th = nearestTrailPoint(TH_GUESS[0], TH_GUESS[1], 250) || { x: TH_GUESS[0], z: TH_GUESS[1], h: 0 };
  o.th = th;
  const raw = [];
  for (const [gx, gz] of CP_GUESS) { const p = nearestTrailPoint(gx, gz, 160); raw.push(p ? [p.x, p.z] : [gx, gz]); }
  o.cps = raw.map((p) => [p[0], p[1]]);
  // OFFROAD-RINGS-DRY
  if (typeof indexWater === 'function') indexWater();
  placeDryRings(o, raw);
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
  window.__egg = EGG; EGG.action = actionE; EGG.groundH = groundH; EGG.showCp = showCp;
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
function actionE() { if (G.cut) return false; if (G.diving && typeof diveAction === 'function') return diveAction(); if (G.inRange && typeof rangeAction === 'function') return rangeAction(); if (typeof dialogAction === 'function' && dialogAction()) return true; const b = nearEggButton(); if (b === 'go') return eggGo(); if (b === 'back') return eggBack(); if (missionAction()) return true; if (typeof rangeAction === 'function' && rangeAction()) return true; if (typeof garageAction === "function" && garageAction()) return true; if (typeof diveAction === 'function' && diveAction()) return true; if (shopAction()) return true; return enterExit(); }
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
  if (typeof initTrafficLights === 'function') initTrafficLights();
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
    if (insideBuilding(p.x, p.z, 1.0) || (typeof waterSpawnBlocked === 'function' && waterSpawnBlocked(p.x, p.z))) continue;
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
    if (insideBuilding(p.x, p.z, 1.1) || (typeof waterSpawnBlocked === 'function' && waterSpawnBlocked(p.x, p.z))) continue;
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
  if (typeof updateTrafficLights === 'function') updateTrafficLights(dt);
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
    if (typeof lightCarSpeed === 'function') target = Math.min(target, lightCarSpeed(c, a, e));
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
  if (typeof waterAt === 'function' && waterAt(p.x, p.z) === 'deep') { pedRescue(p); return; }
  if (p.kind === 'cross') {
    const dx = p.tx - p.x, dz = p.tz - p.z, L = Math.hypot(dx, dz) || 1;
    if (typeof lightPedHold === 'function' && lightPedHold((p.x + p.tx) * 0.5, (p.z + p.tz) * 0.5)) { p.h = Math.atan2(dx, dz); return; }
    p.t -= dt;
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
    if (e.cross && typeof lightPedHold === 'function' && lightPedHold(p.x, p.z)) return;
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
        if (!pedBlocked(smp.x, smp.z) && !carriageNear(smp.x, smp.z) && !(typeof waterSpawnBlocked === 'function' && waterSpawnBlocked(smp.x, smp.z))) {
          const p = spawnPedAt(smp.x, smp.z); if (!p) return;
          p.kind = 'walk'; p.e = e.id; p.s = s; p.dir = Math.random() < 0.5 ? 1 : -1; p.v = 1.15 + Math.random() * 0.4; return;
        }
      }
    }
    const arr = TR.egrid.get(Math.floor(x / 100) + ',' + Math.floor(z / 100)); if (!arr) continue;
    const e = TR.edges[arr[Math.floor(Math.random() * arr.length)]]; if (!e.ped || e.len < 12 || e.bridge) continue;
    let side = Math.random() < 0.5 ? 1 : -1; const s = 1 + Math.random() * Math.max(0.2, e.len - 2);
    let smp = pedSide(e, s, side, { x: 0, z: 0, h: 0 });
    if (pedBlocked(smp.x, smp.z) || carriageNear(smp.x, smp.z) || (typeof waterSpawnBlocked === 'function' && waterSpawnBlocked(smp.x, smp.z))) { side = -side; smp = pedSide(e, s, side, { x: 0, z: 0, h: 0 }); if (pedBlocked(smp.x, smp.z) || carriageNear(smp.x, smp.z) || (typeof waterSpawnBlocked === 'function' && waterSpawnBlocked(smp.x, smp.z))) continue; }
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
  // ITALIANA-BOSS-FRONT: chodnik przed zachodnią ścianą restauracji, twarzą do ul. Tadeusza Kościuszki (nie za budynkiem).
  { id: 'placki', name: 'Dostawa placków ziemniaczanych', giver: [-128.29, 156.05], face: -1.7, who: 'Szef The Italiana', where: 'ul. Kościuszki 7', reward: 280, recordPay: 40, side: true, bestKey: 'placki', bestLow: true, col: '#e2a122',
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
  const lab = labelSprite(who, col, 6); lab.position.y = 4.9; lab.visible = false;
  lab.material.depthTest = false; lab.renderOrder = 6; g.add(lab);
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
  if (typeof npcVisit === 'function') npcVisit(m);
  const greet = typeof npcGreet === 'function' ? npcGreet(m) : '';
  $('dlgWho').textContent = m.who; $('dlgTitle').textContent = (m.done ? '✔ ' : '') + m.name; $('dlgText').textContent = '„' + (greet ? greet + ' ' : '') + m.text + '”';
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
  if (typeof npcRemember === 'function') npcRemember(m.id, ok ? 'done' : 'fail', m.name);
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
    const o = m.obj3; if (!o) continue;
    if (typeof npcStep === 'function') npcStep(m);
    const show = giverOpen(m); o.g.visible = show; if (!show) continue;
    const d = Math.hypot(f.x - m.gx, f.z - m.gz); o.beam.material.opacity = 0.16 + 0.1 * Math.sin(tt + m.gx); o.ex.position.y = 3.2 + Math.sin(tt * 1.5) * 0.25; o.lab.visible = d < 40;
    o.w.rotation.y = m.face != null ? m.face : Math.atan2(f.x - m.gx, f.z - m.gz);
    if (o.lab && typeof npcPin === 'function') {
      const pin = m.who + ' · ' + npcPin(m);
      if (o.lab.userData.txt !== pin) { paintNpcLabel(o.lab, pin, m.col); o.lab.userData.txt = pin; }
    }
    if (d < 80) animateWalker(o.w, (typeof npcPhase === 'function' && npcPhase(m) === 'wander') ? 1.25 : 0, dt, false);
    if (m.cool && d > 9) m.cool = false;
    if (!G.diving && !m.cool && !MIS.dlg && d < (G.mode === 'car' ? 6 : 3) && (G.mode === 'foot' || activeCar.speed < 3) && !G.cut) dialogOpen(m);
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
  for (const k of ['gas', 'brake', 'hand', 'run', 'jump', 'nitro', 'diveUp', 'diveDown']) G.touch[k] = false;
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
  const showDive = typeof diveJournalCard === 'function' && (JRN.tab === 'open' || (JRN.tab === 'active' && !MIS.active));
  if (showDive) body.appendChild(diveJournalCard());
  const rows = MIS.list.filter((m) => (JRN.tab === 'active' ? misBucket(m) === 'active' : JRN.tab === 'done' ? (m.done && misBucket(m) !== 'active') : misBucket(m) === 'open' || misBucket(m) === 'locked'));
  if (JRN.tab === 'active' && MIS.active) {
    const info = document.createElement('div'); info.className = 'jNow';
    info.textContent = (MIS.active.obj || 'Jedź według dziennika') + (typeof MIS.active.t === 'number' ? ' · ⏱ ' + fmtT(Math.max(0, MIS.active.t)).slice(0, 5) : '');
    body.appendChild(info);
  }
  if (!rows.length) {
    if (showDive) return;
    const e = document.createElement('div'); e.className = 'jEmpty';
    e.textContent = JRN.tab === 'active' ? 'Brak aktywnej misji. Wejdź w Dostępne albo szukaj świecącego „!”.' : (JRN.tab === 'done' ? 'Jeszcze nic nie ukończone.' : 'Wszystko już zaliczone – powtórki są w zakładce Ukończone.');
    body.appendChild(e); return;
  }
  for (const m of rows) body.appendChild(journalCard(m));
}
function journalCard(m) {
  const card = document.createElement('div'); card.className = 'jCard';
  const h = document.createElement('b'); h.textContent = m.name; card.appendChild(h);
  const who = document.createElement('div'); who.className = 'jWho'; who.textContent = m.who + (m.where ? ' · ' + m.where : '') + (typeof npcPin === 'function' ? ' · ' + npcPin(m) : ''); card.appendChild(who);
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

// TRAFFIC-LIGHTS
// Własna, lokalna sygnalizacja (bez sieci, bez kopiowania cudzych projektów).
// Wypiek OSM nie ma węzłów highway=traffic_signals, a zapytanie na żywo nie wróciło,
// więc światła stoją na skupionych skrzyżowaniach dróg primary/secondary/tertiary
// z co najmniej dwiema nazwami ulic (te same dane, co reszta mapy).
// Cykl na oś: zielone, żółte, faza piesza (wszystko czerwone), potem druga oś.
// Auta z ruchu stają przed linią stopu. Piesi wchodzą na pasy dopiero na swoim zielonym.
// Gracz nie jest karany. Odświeżane są tylko światła blisko kamery.
const TL_RAW = [
  [-3647.0, 4599.0, 'Turystyczna × Wisłostrada'],
  [-3524.5, 5660.5, 'Strefowa × Zakładowa'],
  [-2408.5, 2340.0, 'Plażowa × Wisłostrada'],
  [-1222.5, 1242.5, 'Wisłostrada × Dworska'],
  [-706.0, 2176.5, 'Siarkowa × Orląt Lwowskich × Adama Mickiewicza'],
  [-685.5, 1788.0, 'Krzywa × Adama Mickiewicza'],
  [-648.5, 1033.5, 'Graniczna × Wisłostrada'],
  [-532.5, 2371.5, 'Krzywa × Orląt Lwowskich'],
  [-447.5, 251.5, 'Stanisława Jachowicza × Sokola × Wiślna'],
  [-338.0, 1048.5, 'Generała Władysława Sikorskiego × Adama Mickiewicza × Wisłostrada'],
  [-237.5, 798.0, 'Rondo Siarkowców × Adama Mickiewicza'],
  [-152.5, 579.0, 'Adama Mickiewicza × Jana Kochanowskiego'],
  [-131.5, 479.5, 'Stanisława Moniuszki × Adama Mickiewicza × Stanisława Wyspiańskiego'],
  [-106.5, 350.0, 'Sokola × Adama Mickiewicza'],
  [-46.5, 145.5, 'Józefa Piłsudskiego × Adama Mickiewicza'],
  [55.0, 543.0, 'Rondo Gracjana Fróga × Targowa × Stanisława Wyspiańskiego'],
  [67.0, 157.5, 'Józefa Piłsudskiego × Targowa × Rondo Juliusza Tarnowskiego'],
  [159.5, 1045.5, 'Porucznika Józefa Sarny × Generała Władysława Sikorskiego'],
  [184.5, 130.5, 'Plac Generała Grota-Roweckiego × Józefa Piłsudskiego'],
  [207.5, 1002.0, 'Porucznika Józefa Sarny × Generała Władysława Sikorskiego'],
  [223.5, 53.5, 'Henryka Sienkiewicza × Rondo Solidarności'],
  [264.0, 3345.0, 'Ocicka × Orląt Lwowskich'],
  [281.0, 858.0, 'Świętej Barbary × Szpitalna × Generała Władysława Sikorskiego'],
  [360.0, 574.5, 'Stanisława Wyspiańskiego × Mikołaja Kopernika × Generała Władysława Sikorskiego'],
  [476.0, 155.5, 'Henryka Sienkiewicza × Generała Władysława Sikorskiego'],
  [606.5, -360.5, 'Zwierzyniecka × Kardynała Stefana Wyszyńskiego × Generała Władysława Sikorskiego'],
  [647.0, -506.5, 'Sandomierska × Generała Władysława Sikorskiego'],
  [937.0, -1704.0, 'Polna × Jana Słomki'],
  [962.0, -1473.5, 'Profesora Stanisława Tarnowskiego × Rondo Ochotników Dzikowskich'],
  [965.5, -825.0, 'Kazimierza Wielkiego × Generała Władysława Sikorskiego'],
  [989.0, 307.5, 'Henryka Sienkiewicza × Marii Dąbrowskiej'],
  [1034.0, -923.5, 'Bolesława Śmiałego × Generała Władysława Sikorskiego'],
  [1057.0, -962.5, 'Generała Władysława Sikorskiego × Wiejska'],
  [1066.5, -1651.5, 'Jana Słomki × Profesora Stanisława Tarnowskiego'],
  [1095.0, -595.0, 'Dąbrówki × Konstytucji 3 Maja × Kazimierza Wielkiego'],
  [1136.0, -2488.5, 'Polna × Sadowa'],
  [1156.5, -477.5, 'Królowej Jadwigi × Kazimierza Wielkiego'],
  [1192.5, -406.5, 'Eugeniusza Kwiatkowskiego × Kazimierza Wielkiego'],
  [1210.5, -358.0, 'Eugeniusza Kwiatkowskiego × Rondo Księdza Prałata Michała Józefczyka'],
  [1322.0, 367.0, 'Henryka Sienkiewicza × Rondo Olgi i Andrzeja Małkowskich'],
  [1365.0, -1501.0, 'Fabryczna × Jana Słomki × Aleja Warszawska'],
  [1576.5, 410.5, 'Rondo Młodzieżowego Ruchu Oporu × 871'],
  [1670.5, 541.5, 'Rondo Rodziny Pawlasów × 871'],
  [1697.5, 567.0, 'Dworcowa × Rondo Rodziny Pawlasów'],
  [2070.0, 471.0, 'Henryka Sienkiewicza × Rondo Centralnego Okręgu Przemysłowego'],
  [3176.5, 684.0, 'Henryka Sienkiewicza × Zakrzowska'],
  [3388.5, 702.0, 'Zamkowa × Henryka Sienkiewicza'],
  [3953.5, 4434.0, 'Brzozowa × Jana Pawła II'],
];
const TL_CYCLE = 26;
const TL = { list: [], grid: new Map(), meshes: [], visT: 0, nearN: 0, shown: 0 };
const tlD = new THREE.Object3D();

function initTrafficLights() {
  const kept = [];
  TL_RAW.forEach((row, i) => {
    const s = { i, x: row[0], z: row[1], name: row[2], h0: 0, node: -1 };
    snapSignal(s);
    if (kept.some((o) => Math.hypot(o.x - s.x, o.z - s.z) < 14)) return;
    s.i = kept.length;
    kept.push(s);
  });
  TL.list = kept;
  for (const s of TL.list) {
    const ck = Math.floor(s.x / 80) + ',' + Math.floor(s.z / 80);
    let arr = TL.grid.get(ck); if (!arr) { arr = []; TL.grid.set(ck, arr); } arr.push(s);
  }
  buildSignalMeshes();
}

function snapSignal(s) {
  const cx = Math.floor(s.x / 100), cz = Math.floor(s.z / 100);
  let best = -1, bd = 32;
  for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
    const arr = TR.egrid.get((cx + i) + ',' + (cz + j)); if (!arr) continue;
    for (const id of arr) {
      const e = TR.edges[id];
      for (const nid of [e.a, e.b]) {
        const n = TR.nodes[nid]; if (!n || n.deg < 3) continue;
        const d = Math.hypot(n.x - s.x, n.z - s.z);
        if (d < bd) { bd = d; best = nid; }
      }
    }
  }
  if (best < 0) return;
  const n = TR.nodes[best];
  s.x = n.x; s.z = n.z; s.node = best;
  let h0 = 0, got = false;
  for (const o of TR.adj[best]) {
    const e = TR.edges[o.e]; if (!e) continue;
    const u = o.dir > 0 ? Math.min(10, e.len * 0.35) : Math.max(0, e.len - Math.min(10, e.len * 0.35));
    const smp = edgeSample(e, u, { x: 0, z: 0, h: 0 });
    h0 = Math.atan2(smp.x - n.x, smp.z - n.z); got = true; break;
  }
  if (got) s.h0 = h0;
}

function tlMat(color) {
  const m = mkMat({ color });
  m.shadowSide = THREE.FrontSide;
  return m;
}
function tlPut(mesh, i, x, y, z, hy, sx, sy, sz) {
  tlD.position.set(x, y, z);
  tlD.rotation.set(0, hy, 0);
  tlD.scale.set(sx, sy, sz);
  tlD.updateMatrix();
  mesh.setMatrixAt(i, tlD.matrix);
}
function buildSignalMeshes() {
  const n = TL.list.length * 4;
  if (!n) return;
  const pole = new THREE.InstancedMesh(new THREE.BoxGeometry(0.32, 3.5, 0.32), tlMat(0x2a211c), n);
  const head = new THREE.InstancedMesh(new THREE.BoxGeometry(0.52, 1.02, 0.4), tlMat(0x1a1612), n);
  const red = new THREE.InstancedMesh(new THREE.BoxGeometry(0.28, 0.2, 0.1), tlMat(0xe23b3b), n);
  const yel = new THREE.InstancedMesh(new THREE.BoxGeometry(0.28, 0.2, 0.1), tlMat(0xf0c431), n);
  const grn = new THREE.InstancedMesh(new THREE.BoxGeometry(0.28, 0.2, 0.1), tlMat(0x3dcc5a), n);
  TL.meshes = [pole, head, red, yel, grn];
  TL.lamps = [red, yel, grn];
  let k = 0;
  for (const s of TL.list) {
    const fx = Math.sin(s.h0), fz = Math.cos(s.h0);
    const lx = Math.cos(s.h0), lz = -Math.sin(s.h0);
    const spots = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
    s.base = k;
    s.spots = [];
    for (const [sx, sz] of spots) {
      const x = s.x + fx * sx * 6.2 + lx * sz * 6.2;
      const z = s.z + fz * sx * 6.2 + lz * sz * 6.2;
      const y = groundH(x, z);
      const hy = Math.atan2(s.x - x, s.z - z);
      const hx = Math.sin(hy), hz = Math.cos(hy);
      s.spots.push({ x, z, y, hy, hx, hz });
      tlPut(pole, k, x, y + 1.75, z, hy, 1, 1, 1);
      tlPut(head, k, x + hx * 0.18, y + 3.35, z + hz * 0.18, hy, 1, 1, 1);
      tlPut(red, k, x + hx * 0.42, y + 3.62, z + hz * 0.42, hy, 1, 1, 1);
      tlPut(yel, k, x + hx * 0.42, y + 3.35, z + hz * 0.42, hy, 0.001, 0.001, 0.001);
      tlPut(grn, k, x + hx * 0.42, y + 3.08, z + hz * 0.42, hy, 0.001, 0.001, 0.001);
      k++;
    }
    s._k = '';
  }
  for (const m of TL.meshes) {
    m.instanceMatrix.needsUpdate = true;
    m.frustumCulled = false;
    m.castShadow = false;
    m.receiveShadow = false;
    scene.add(m);
  }
}

function lightPhase(s, now) {
  const t = ((now / 1000 + s.i * 3.7) % TL_CYCLE + TL_CYCLE) % TL_CYCLE;
  const ped = (t >= 10 && t < 13) || t >= 23;
  let a = 'red', b = 'red';
  if (t < 8) a = 'green';
  else if (t < 10) a = 'yellow';
  else if (t >= 13 && t < 21) b = 'green';
  else if (t >= 21 && t < 23) b = 'yellow';
  const key = (ped ? 'p' : 'c') + a[0] + b[0];
  return { car: [a, b], ped, key };
}
function lightAxisOf(s, h) {
  let d = Math.abs(Math.atan2(Math.sin(h - s.h0), Math.cos(h - s.h0)));
  if (d > Math.PI / 2) d = Math.PI - d;
  return d < 0.65 ? 0 : 1;
}
function lightNear(x, z, r) {
  const cx = Math.floor(x / 80), cz = Math.floor(z / 80);
  let best = null, bd = r;
  for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
    const arr = TL.grid.get((cx + i) + ',' + (cz + j)); if (!arr) continue;
    for (const s of arr) {
      const d = Math.hypot(s.x - x, s.z - z);
      if (d < bd) { bd = d; best = s; }
    }
  }
  return best;
}
function lightCarSpeed(c, a, e) {
  if (!TL.list.length) return 1e9;
  const nid = a.dir > 0 ? e.b : e.a;
  const nd = TR.nodes[nid]; if (!nd) return 1e9;
  const s = lightNear(nd.x, nd.z, 18); if (!s) return 1e9;
  const rem = e.len - a.s;
  if (rem > 20 || rem < 2.2) return 1e9;
  const col = lightPhase(s, performance.now()).car[lightAxisOf(s, c.h)];
  if (col === 'green') return 1e9;
  if (col === 'yellow' && rem < 8) return 1e9;
  const stop = 6.5;
  if (rem <= stop) return 0;
  return Math.max(0, (rem - stop) * 1.15);
}
function lightPedHold(x, z) {
  if (!TL.list.length) return false;
  const s = lightNear(x, z, 18); if (!s) return false;
  return !lightPhase(s, performance.now()).ped;
}
function updateTrafficLights(dt) {
  if (!TL.lamps) return;
  TL.visT -= dt; if (TL.visT > 0) return;
  TL.visT = 0.4;
  const f = focusPos();
  const R = settings.quality === 'low' ? 150 : (settings.quality === 'high' ? 280 : 210);
  const now = performance.now();
  let near = 0, dirty = false;
  for (const s of TL.list) {
    const on = Math.hypot(s.x - f.x, s.z - f.z) < R;
    if (on) near++;
    const ph = on ? lightPhase(s, now) : null;
    const key = ph ? ph.key : 'off';
    if (s._k === key) continue;
    s._k = key; dirty = true;
    for (let c = 0; c < 4; c++) {
      const p = s.spots[c]; const i = s.base + c;
      const col = ph ? ph.car[c < 2 ? 0 : 1] : '';
      const ys = [p.y + 3.62, p.y + 3.35, p.y + 3.08];
      for (let li = 0; li < 3; li++) {
        const want = (li === 0 && col === 'red') || (li === 1 && col === 'yellow') || (li === 2 && col === 'green');
        const sc = want ? 1 : 0.001;
        tlPut(TL.lamps[li], i, p.x + p.hx * 0.42, ys[li], p.z + p.hz * 0.42, p.hy, sc, sc, sc);
      }
    }
  }
  TL.nearN = near;
  if (dirty) for (const m of TL.lamps) m.instanceMatrix.needsUpdate = true;
}

// NPC-ROUTINE
// Własna, lokalna rutyna zleceniodawców (bez sieci, bez modelu językowego).
// Zegar: Europe/Warsaw, czyli czas lokalny urządzenia — gra dzieje się w Tarnobrzegu.
// 7:00–22:00 każdy dawca stoi na swoim posterunku i da się z nim pogadać.
// Przez 3 minuty w swojej minucie godziny robi krótki spacer (do ~3 m, wciąż w zasięgu rozmowy).
// 22:00–7:00 zostaje na miejscu, tylko kwestia jest senna. Misja nie znika.
// Nastrój (zadowolony / neutralny / zły) i kilka ostatnich spotkań siedzą w localStorage.
const NPC_MEM_KEY = 'gtatbg_npcmem';
const NPC_MEM_CAP = 10;
const NPC_BREAK = {
  taxi: 10, pizza: 15, race: 20, escape: 25, steal: 30, offroad: 35, courier: 40, final: 45,
  kursy: 50, targ: 5, uliczna: 12, jezioro: 18, drift: 22, tort: 28, placki: 33, list: 38, paczka: 48,
};
const NPC_MOOD_LINE = {
  zadowolony: 'Dobrze cię widzieć. Ostatnia robota była czysta.',
  zły: 'Znowu ty? Ostatnio się nie udało. Pokaż, że umiesz.',
  neutralny: 'Cześć. Masz chwilę na robotę?',
};

function warsawClock() {
  try {
    const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Warsaw', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date());
    let h = 0, m = 0;
    for (const p of parts) { if (p.type === 'hour') h = parseInt(p.value, 10) || 0; else if (p.type === 'minute') m = parseInt(p.value, 10) || 0; }
    return { h: ((h % 24) + 24) % 24, m: Math.max(0, Math.min(59, m)) };
  } catch (e) {
    const d = new Date();
    return { h: d.getHours(), m: d.getMinutes() };
  }
}
function npcPhase(m) {
  const c = warsawClock();
  const mins = c.h * 60 + c.m;
  if (mins < 7 * 60 || mins >= 22 * 60) return 'sleepy';
  const br0 = NPC_BREAK[(m && m.id) || ''];
  const br = br0 == null ? 10 : br0;
  const slot = c.m;
  if (slot >= br && slot < br + 3) return 'wander';
  return 'work';
}
function npcPin(m) {
  const ph = npcPhase(m);
  if (ph === 'wander') return 'spacer, wraca za chwilę';
  if (ph === 'sleepy') return 'senny, od 7:00';
  return 'na miejscu do 22:00';
}
function npcLoad() {
  try { const o = JSON.parse(localStorage.getItem(NPC_MEM_KEY) || '{}'); return o && typeof o === 'object' ? o : {}; } catch (e) { return {}; }
}
function npcSave(all) {
  try { localStorage.setItem(NPC_MEM_KEY, JSON.stringify(all)); } catch (e) { /* prywatny tryb */ }
}
function npcBag(id) {
  const all = npcLoad();
  const b = all[id];
  if (!b || typeof b !== 'object') return { log: [], mood: '', moodAt: 0 };
  if (!Array.isArray(b.log)) b.log = [];
  return b;
}
function npcMood(id) {
  const b = npcBag(id);
  if (b.mood !== 'zadowolony' && b.mood !== 'zły') return 'neutralny';
  if (!b.moodAt || Date.now() - b.moodAt > 20 * 3600000) return 'neutralny';
  return b.mood;
}
function npcPush(id, entry, mood) {
  if (!id) return;
  const all = npcLoad();
  const b = all[id] && typeof all[id] === 'object' ? all[id] : { log: [] };
  if (!Array.isArray(b.log)) b.log = [];
  b.log.push(entry);
  if (b.log.length > NPC_MEM_CAP) b.log = b.log.slice(-NPC_MEM_CAP);
  if (mood) { b.mood = mood; b.moodAt = entry.t; }
  all[id] = b;
  npcSave(all);
}
function npcRemember(id, kind, name) {
  const mood = kind === 'done' ? 'zadowolony' : (kind === 'fail' ? 'zły' : '');
  npcPush(id, { t: Date.now(), kind, name: name || '' }, mood);
}
function npcVisit(m) {
  if (!m || !m.id) return;
  const b = npcBag(m.id);
  const last = b.log[b.log.length - 1];
  if (last && last.kind === 'visit' && Date.now() - last.t < 120000) return;
  npcPush(m.id, { t: Date.now(), kind: 'visit', name: m.name || '' }, '');
}
function npcWhen(t) {
  const h = (Date.now() - t) / 3600000;
  if (h < 2) return 'przed chwilą';
  if (h < 16) return 'dziś';
  if (h < 40) return 'wczoraj';
  return 'ostatnio';
}
function npcCap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }
function npcMemoryLine(m) {
  const ev = [...(npcBag(m.id).log || [])].reverse().find((e) => e && (e.kind === 'done' || e.kind === 'fail'));
  if (!ev) return '';
  const w = npcWhen(ev.t);
  if (ev.kind === 'fail') {
    if (m.id === 'placki') return npcCap(w) + ' placki nie dojechały.';
    return npcCap(w) + ' „' + (ev.name || m.name) + '” się nie udało.';
  }
  if (m.id === 'placki') return 'O, to ty! ' + npcCap(w) + ' placki dowiozłeś na czas!';
  return 'O, to ty! ' + npcCap(w) + ' „' + (ev.name || m.name) + '” poszło gładko.';
}
function npcGreet(m) {
  if (!m) return '';
  const ph = npcPhase(m);
  const mood = npcMood(m.id);
  const mem = npcMemoryLine(m);
  const base = mem || NPC_MOOD_LINE[mood] || NPC_MOOD_LINE.neutralny;
  if (ph === 'sleepy') return (mem ? mem + ' ' : '') + 'Jestem senny, ale pogadam. Pełna para od siódmej.';
  if (ph === 'wander') return base + ' Krótka przerwa, ale jestem.';
  return base;
}
function paintNpcLabel(sprite, text, color) {
  let cv = sprite.userData.cv;
  if (!cv) {
    cv = document.createElement('canvas'); cv.width = 640; cv.height = 96; sprite.userData.cv = cv;
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
    sprite.material.map = tex; sprite.material.needsUpdate = true;
  }
  const g = cv.getContext('2d');
  g.clearRect(0, 0, 640, 96);
  g.fillStyle = 'rgba(8,16,30,0.78)';
  g.beginPath();
  if (g.roundRect) g.roundRect(4, 4, 632, 88, 26); else g.rect(4, 4, 632, 88);
  g.fill();
  g.strokeStyle = color || '#ffd21f'; g.lineWidth = 5; g.stroke();
  g.fillStyle = '#fff';
  g.font = (text.length > 36 ? 'bold 26px ' : 'bold 34px ') + 'system-ui, sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, 320, 50);
  sprite.material.map.needsUpdate = true;
  // na wąskim (pionowym) ekranie tabliczka musi się zmieścić w kadrze
  const fit = innerWidth < 760 ? 0.72 : 1;
  const w = Math.min(9.2, 4.4 + text.length * 0.11) * fit;
  sprite.scale.set(w, w * 96 / 640, 1);
}
function npcStep(m) {
  if (!m || !m.obj3) return;
  if (m.hx == null) { m.hx = m.gx; m.hz = m.gz; }
  let x = m.hx, z = m.hz;
  if (npcPhase(m) === 'wander') {
    const h = m.face != null ? m.face : 0;
    const along = Math.sin(performance.now() * 0.0012) * 3;
    const tx = m.hx + Math.cos(h) * along, tz = m.hz - Math.sin(h) * along;
    if (!insideBuilding(tx, tz, 0.55)) { x = tx; z = tz; }
  }
  if (m._npcX === x && m._npcZ === z) return;
  m._npcX = x; m._npcZ = z; m.gx = x; m.gz = z;
  m.obj3.g.position.set(x, groundH(x, z), z);
}

// WATER-BLOCK, SHALLOWS, BRIDGES
// Własna, lokalna warstwa: głęboka woda zatrzymuje auto i pieszych, wąski ciek to bród,
// a pomost mostu (pokład z paintSpan) jest suchy i unosi pojazd. Bez sieci.
const SHORE_M = 4.2;

function bridgeDeckH(x, z) {
  const g = W.spanGrid; if (!g || !g.stamp) return 0;
  let best = 0;
  g.query(x, z, 8, (i) => {
    const s = g.s; const m = g.meta[i]; if (!m) return;
    closestOnSeg(x, z, s[i * 4], s[i * 4 + 1], s[i * 4 + 2], s[i * 4 + 3], tmpC);
    if ((tmpC.x - x) ** 2 + (tmpC.z - z) ** 2 <= m.hw * m.hw) {
      const y = m.y0 + (m.y1 - m.y0) * tmpC.t;
      if (y > best) best = y;
    }
  });
  return best;
}
function indexWater() {
  W.wwGrid = new SegGrid(48);
  for (const w of W.waterways || []) {
    const p = w.pts; if (!p || p.length < 4) continue;
    const deep = w.width >= 6;
    for (let i = 0; i < p.length - 2; i += 2) W.wwGrid.add(p[i], p[i + 1], p[i + 2], p[i + 3], { hw: w.width * 0.5, deep });
  }
  W.wwGrid.finish();
  W.waterB = (W.water || []).map((w) => {
    let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
    for (let i = 0; i < w.ring.length; i += 2) { x0 = Math.min(x0, w.ring[i]); x1 = Math.max(x1, w.ring[i]); z0 = Math.min(z0, w.ring[i + 1]); z1 = Math.max(z1, w.ring[i + 1]); }
    return { ring: w.ring, holes: w.holes, x0, x1, z0, z1 };
  });
}
function onPaved(x, z) {
  const g = W.roadGrid; if (!g || !g.stamp) return false;
  let hit = false;
  g.query(x, z, 14, (i) => {
    if (hit) return;
    const r = W.roads[g.meta[i]]; if (!r || !r.drivable) return;
    closestOnSeg(x, z, g.s[i * 4], g.s[i * 4 + 1], g.s[i * 4 + 2], g.s[i * 4 + 3], tmpC);
    if (Math.hypot(tmpC.x - x, tmpC.z - z) < r.width / 2 + 0.4) hit = true;
  });
  return hit;
}
function waterAt(x, z, pavedOnly) {
  if (bridgeDeckH(x, z) > 0.08) return 'bridge';
  if (W.fords) for (const f of W.fords) {
    closestOnSeg(x, z, f.x0, f.z0, f.x1, f.z1, tmpC);
    if (Math.hypot(tmpC.x - x, tmpC.z - z) <= f.hw) return 'shallow';
  }
  if (pavedOnly) { if (onPaved(x, z)) return 'dry'; }
  else if (typeof nearRoad === 'function' && nearRoad(x, z, 0.15)) return 'dry';
  let kind = 'dry';
  const g = W.wwGrid;
  if (g && g.stamp) {
    g.query(x, z, 62, (i) => {
      const s = g.s; const m = g.meta[i]; if (!m) return;
      closestOnSeg(x, z, s[i * 4], s[i * 4 + 1], s[i * 4 + 2], s[i * 4 + 3], tmpC);
      const dx = tmpC.x - x, dz = tmpC.z - z, d = Math.hypot(dx, dz);
      if (d > m.hw) return;
      if (!m.deep) { if (kind !== 'deep') kind = 'shallow'; return; }
      if (m.hw - d < 3.2) { if (kind !== 'deep') kind = 'shallow'; }
      else kind = 'deep';
    });
  }
  if (kind === 'deep') return 'deep';
  const boxes = W.waterB;
  if (boxes) for (let b = 0; b < boxes.length; b++) {
    const w = boxes[b];
    if (x < w.x0 || x > w.x1 || z < w.z0 || z > w.z1) continue;
    if (!pointInRing(x, z, w.ring) || w.holes.some((h) => pointInRing(x, z, h))) continue;
    let shore = 1e9; const r = w.ring; const n = r.length / 2;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      closestOnSeg(x, z, r[i * 2], r[i * 2 + 1], r[j * 2], r[j * 2 + 1], tmpC);
      const d = Math.hypot(tmpC.x - x, tmpC.z - z);
      if (d < shore) shore = d;
    }
    return shore < SHORE_M ? 'shallow' : 'deep';
  }
  return kind;
}
// OFFROAD-RINGS-DRY: a footpath painted across the lake is not a place a car can stop.
function ringBlocked(x, z) { return waterAt(x, z) === 'deep' || waterAt(x, z, true) === 'deep'; }
function vehicleRingPoints() {
  const out = [];
  if (W.off && W.off.cps) W.off.cps.forEach(([x, z], i) => out.push({ id: 'offroad-' + i, x, z }));
  if (typeof chainCheckpoints === 'function') {
    for (const c of chainCheckpoints([[-733, 661, 'start'], [-290, 700, 'Stadion'], [-68, 776, 'Szpital'], [-87, 370, 'Urząd'], [-7, 10, 'Rynek']], 170)) out.push({ id: 'uliczna', x: c.x, z: c.z, name: c.name || '' });
  }
  if (typeof nearestNode === 'function' && typeof astar === 'function' && typeof pathPoints === 'function' && typeof roadSpot === 'function') {
    const s = roadSpot(-87, 370);
    const n0 = nearestNode(s.x, s.z), n1 = nearestNode(478, 162), n2 = nearestNode(1216, -49);
    if (n0 >= 0 && n1 >= 0 && n2 >= 0) {
      const p1 = astar(n0, n1) || [n0, n1], p2 = astar(n1, n2) || [n1, n2];
      const pts = pathPoints(p1.concat(p2.slice(1)));
      let acc = 0, lx = s.x, lz = s.z;
      for (let i = 0; i < pts.length; i += 2) {
        acc += Math.hypot(pts[i] - lx, pts[i + 1] - lz); lx = pts[i]; lz = pts[i + 1];
        if (acc > 140 || i >= pts.length - 2) { out.push({ id: 'wyscig', x: lx, z: lz }); acc = 0; }
      }
    }
    for (const [id, x, z] of [['taxi', 300, -575], ['apteka', -165, 788], ['final', 300, -575]]) {
      const p = roadSpot(x, z, 140); out.push({ id, x: p.x, z: p.z });
    }
  }
  return out;
}
function auditVehicleRings() {
  const bad = [];
  for (const c of vehicleRingPoints()) {
    const w = waterAt(c.x, c.z);
    const car = waterAt(c.x, c.z, true);
    if (w === 'deep' || (String(c.id).startsWith('offroad') && car === 'deep')) bad.push({ id: c.id, x: +c.x.toFixed(1), z: +c.z.toFixed(1), name: c.name || '', w, car });
  }
  const gaps = (W.off && W.off.ringGaps) || [];
  if (bad.length || gaps.length) console.warn('OFFROAD-RINGS-DRY', { bad, gaps });
  else console.log('OFFROAD-RINGS-DRY ok', vehicleRingPoints().length);
  return { bad, gaps, moves: (W.off && W.off.ringMoves) || [], scan: (W.off && W.off.ringScan) || [], n: vehicleRingPoints().length };
}
function dryNear(x, z) {
  if (waterAt(x, z) !== 'deep') return { x, z };
  for (let rad = 24; rad <= 2200; rad += 48) {
    for (let a = 0; a < 8; a++) {
      const px = x + Math.cos(a * 0.785) * rad, pz = z + Math.sin(a * 0.785) * rad;
      if (waterAt(px, pz) !== 'deep' && !insideBuilding(px, pz, 1.2)) return { x: px, z: pz };
    }
  }
  return null;
}
function waterSpawnBlocked(x, z) {
  const k = waterAt(x, z);
  return k === 'deep' || k === 'shallow';
}
function splashAt(x, y, z, n) {
  if (typeof emitPart !== 'function' || typeof DRV === 'undefined' || !DRV.sparks) return;
  const cap = settings.quality === 'low' ? 3 : Math.min(n, 6);
  for (let i = 0; i < cap; i++) {
    const a = Math.random() * 6.28, s = 1.1 + Math.random() * 1.5;
    emitPart(DRV.sparks, x, (y || 0) + 0.35, z, Math.cos(a) * s, 1.5 + Math.random() * 1.6, Math.sin(a) * s, 0.32, 0.2, 0.05, '#8fd4f2', 0.85, 7, 1.1);
  }
}

// DIVE-TREASURE
// Własne nurkowanie w Jeziorze Tarnobrzeskim: wypożyczalnia na plaży, dno z piasku,
// skał i wodorostów, skarby w localStorage. Bez sieci i bez cudzych assetów.
const DIVE_RENT = { x: -1792, z: 2348, name: 'Wypożyczalnia sprzętu nurkowego' };
const DIVE_O2 = 38;
const DIVE_FLOOR = -7.15;
const DIVE_FLOAT = 0.08;
const DIVE_LINE = -0.4;
const DIVE_WEEK_MS = 7 * 24 * 3600 * 1000;
const DIVE_LOOT = [
  { id: 'skrzynia', name: 'Skrzynia skarbów', pay: 250, dx: 6, dz: 16 },
  { id: 'moneta', name: 'Stara moneta', pay: 40, dx: -14, dz: 20 },
  { id: 'telefon', name: 'Zgubiony telefon', pay: 80, dx: 18, dz: 28 },
  { id: 'kotwica', name: 'Kotwica', pay: 60, dx: -8, dz: 34 },
  { id: 'butelka', name: 'Butelka z listą', pay: 90, dx: 22, dz: 12 },
  { id: 'zegarek', name: 'Złoty zegarek', pay: 180, dx: -20, dz: 26 },
  { id: 'perla', name: 'Perła', pay: 120, dx: 4, dz: 40 },
  { id: 'kompas', name: 'Stary kompas', pay: 70, dx: 28, dz: 36 },
  { id: 'pierscien', name: 'Złoty pierścień', pay: 150, dx: -24, dz: 14 },
  { id: 'bursztyn', name: 'Bursztyn', pay: 100, dx: 12, dz: 46 },
];
const DIVE = { on: false, x: 0, y: 0, z: 0, o2: DIVE_O2, bag: [], loot: [], world: null, rig: null, hud: null, bubbles: null, t: 0 };

function diveLoad() {
  let o = {};
  try { o = JSON.parse(localStorage.getItem('gtatbg_dive') || '{}') || {}; } catch (e) { o = {}; }
  if (!o.seed) o.seed = 7;
  if (!Array.isArray(o.found)) o.found = [];
  const now = Date.now();
  if (!o.week || now - o.week > DIVE_WEEK_MS) { o.found = []; o.week = now; o.seed = (o.seed + 3) % 997 || 3; diveSave(o); }
  return o;
}
function diveSave(o) {
  try { localStorage.setItem('gtatbg_dive', JSON.stringify(o)); } catch (e) { /* prywatny tryb */ }
}
function diveRnd(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function initDive() {
  const g = new THREE.Group();
  g.position.set(DIVE_RENT.x, groundH(DIVE_RENT.x, DIVE_RENT.z), DIVE_RENT.z);
  const wood = mkMat({ color: 0xc9843a }), wall = mkMat({ color: 0xf4e2b0 }), roof = mkMat({ color: 0xd2553f }), post = mkMat({ color: 0x2a211c });
  const add = (w, h, d, x, y, z, mat) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); m.castShadow = false; g.add(m); };
  add(2.2, 2.2, 1.6, 0, 1.2, 0, wall);
  add(2.5, 0.28, 2, 0, 2.4, 0, roof);
  add(0.18, 2.4, 0.18, -1.05, 1.2, 0.75, post);
  add(0.18, 2.4, 0.18, 1.05, 1.2, 0.75, post);
  for (let i = 0; i < 5; i++) add(1.1, 0.12, 0.7, 0, 0.2, 1.3 + i * 0.85, wood);
  scene.add(g);
  DIVE.booth = g;
  const hud = document.createElement('div');
  hud.id = 'diveHud'; hud.className = 'hidden';
  hud.innerHTML = '<b>Powietrze</b><div class="bar"><i id="diveAir"></i></div><span id="diveLoot">Skarby: 0/10</span><em id="diveHintLine"><i id="diveArrow">➤</i> <b id="diveDist"></b></em>';
  document.body.appendChild(hud);
  DIVE.hud = hud;
  diveHoldButton('tDiveUp', 'diveUp');
  diveHoldButton('tDiveDown', 'diveDown');
  if (W.travel && !W.travel.some((t) => String(t[0]).includes('Nurkowanie'))) W.travel.splice(1, 0, ['🤿 Nurkowanie – zatopione skarby', DIVE_RENT.x, DIVE_RENT.z]);
}
function diveFoundCount() { return diveLoad().found.length; }
function diveJournalCard() {
  const n = diveFoundCount();
  const card = document.createElement('div'); card.className = 'jCard';
  const h = document.createElement('b'); h.textContent = 'Nurkowanie – zatopione skarby'; card.appendChild(h);
  const who = document.createElement('div'); who.className = 'jWho'; who.textContent = 'Wypożyczalnia · plaża Jeziora Tarnobrzeskiego'; card.appendChild(who);
  const rec = document.createElement('div'); rec.className = 'jPay'; rec.textContent = 'Skarby: ' + n + '/10'; card.appendChild(rec);
  const p = document.createElement('p'); p.textContent = 'Zejdź pod wodę przy budce na plaży. Wynurz się tam, żeby schować łup do kasy.'; card.appendChild(p);
  const btns = document.createElement('div'); btns.className = 'jBtns';
  const gps = document.createElement('button'); gps.type = 'button'; gps.textContent = 'GPS';
  gps.onclick = () => {
    navSet(DIVE_RENT.x, DIVE_RENT.z, 'Nurkowanie – zatopione skarby', { src: 'place' });
    closeJournal(); toast('GPS: Nurkowanie', 1400);
  };
  btns.appendChild(gps); card.appendChild(btns);
  return card;
}
function drawDiveIcon(g, r) {
  g.beginPath(); g.arc(0, 0, r, 0, 7); g.fillStyle = '#1a8a9a'; g.fill();
  g.lineWidth = Math.max(2, r * 0.16); g.strokeStyle = '#2a211c'; g.stroke();
  g.strokeStyle = '#fff'; g.lineWidth = Math.max(1.6, r * 0.14); g.lineCap = 'round'; g.lineJoin = 'round';
  g.beginPath(); g.arc(0, -r * 0.22, r * 0.2, 0, 7); g.stroke();
  g.beginPath(); g.moveTo(0, -r * 0.02); g.lineTo(0, r * 0.46); g.stroke();
  g.beginPath(); g.moveTo(-r * 0.4, r * 0.16); g.lineTo(0, r * 0.46); g.lineTo(r * 0.4, r * 0.16); g.stroke();
}
function diveHint() {
  if (G.diving || G.mode !== 'foot') return '';
  if (Math.hypot(player.x - DIVE_RENT.x, player.z - DIVE_RENT.z) > 4.6) return '';
  return (isTouch ? 'Dotknij NURKUJ' : 'E') + ': nurkowanie w jeziorze';
}
function diveNearRent() { return Math.hypot(DIVE.x - DIVE_RENT.x, DIVE.z - DIVE_RENT.z) < 14 && DIVE.y > DIVE_LINE; }
function diveHoldButton(id, key) {
  const el = $(id); if (!el || el.dataset.diveBound) return;
  el.dataset.diveBound = '1';
  const down = (e) => {
    if (e.cancelable) e.preventDefault();
    e.stopPropagation();
    G.touch[key] = true; el.classList.add('active');
    if (e.pointerId != null) { try { el.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ } }
  };
  const up = (e) => {
    G.touch[key] = false; el.classList.remove('active');
    if (e && e.pointerId != null) { try { el.releasePointerCapture(e.pointerId); } catch (err) { /* ignore */ } }
  };
  el.addEventListener('pointerdown', down);
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', up);
  el.addEventListener('pointerleave', (e) => { if (!el.hasPointerCapture(e.pointerId)) up(e); });
  el.addEventListener('touchstart', down, { passive: false });
  el.addEventListener('touchend', up, { passive: false });
  el.addEventListener('touchcancel', up, { passive: false });
}
function diveAction() {
  if (G.diving) return diveTryExit();
  if (G.mode !== 'foot' || Math.hypot(player.x - DIVE_RENT.x, player.z - DIVE_RENT.z) > 4.6) return false;
  diveStart();
  return true;
}
function diveSandY(x, z) {
  return -7.6 + Math.sin(x * 0.16) * Math.cos(z * 0.13) * 0.45 + Math.sin(x * 0.05 + z * 0.04) * 0.28;
}
function makeDiver() {
  const g = new THREE.Group();
  const suit = mkMat({ color: 0x17657c }), dark = mkMat({ color: 0x142028 }), skin = mkMat({ color: 0xf0c9a0 }), yel = mkMat({ color: 0xf0c431 }), finC = mkMat({ color: 0x2a211c });
  const box = (w, h, d, mat) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  const body = box(0.46, 0.34, 0.9, suit); g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), skin); head.position.set(0, 0.02, 0.58); g.add(head);
  const mask = box(0.3, 0.14, 0.08, dark); mask.position.set(0, 0.04, 0.74); g.add(mask);
  const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.5, 8), yel); tank.rotation.x = Math.PI / 2; tank.position.set(0, 0.24, -0.02); g.add(tank);
  const armL = new THREE.Group(); armL.position.set(-0.3, 0, 0.18);
  const armR = new THREE.Group(); armR.position.set(0.3, 0, 0.18);
  const arm = box(0.12, 0.12, 0.48, suit); arm.position.z = 0.2; armL.add(arm); armR.add(arm.clone());
  g.add(armL); g.add(armR);
  const legL = new THREE.Group(); legL.position.set(-0.12, 0, -0.42);
  const legR = new THREE.Group(); legR.position.set(0.12, 0, -0.42);
  const thigh = box(0.14, 0.14, 0.42, suit); thigh.position.z = -0.18;
  legL.add(thigh); legR.add(thigh.clone());
  const finL = box(0.26, 0.05, 0.32, finC); finL.position.set(0, 0, -0.46); legL.add(finL);
  const finR = finL.clone(); legR.add(finR);
  g.add(legL); g.add(legR);
  return { g, armL, armR, legL, legR };
}
function diveEnsureWorld() {
  if (DIVE.world) return;
  const root = new THREE.Group(); root.visible = false; root.frustumCulled = false;
  const rnd = diveRnd(11);
  const geo = new THREE.PlaneGeometry(86, 86, 16, 16); geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) pos.setY(i, diveSandY(pos.getX(i), pos.getZ(i)) + 7.6);
  geo.computeVertexNormals(); geo.computeBoundingSphere();
  const sand = new THREE.Mesh(geo, mkMat({ color: 0xe4c98a })); sand.position.y = -7.6; sand.frustumCulled = false; root.add(sand);
  const rim = new THREE.Mesh(new THREE.RingGeometry(40, 43, 28).rotateX(-Math.PI / 2), mkMat({ color: 0x2a211c })); rim.position.y = -7.35; root.add(rim);
  const rockG = new THREE.DodecahedronGeometry(0.7, 0);
  const nRock = settings.quality === 'low' ? 22 : 34;
  const rocks = new THREE.InstancedMesh(rockG, mkMat({ color: 0x8a7360 }), nRock); rocks.frustumCulled = false;
  const dummy = new THREE.Object3D();
  for (let i = 0; i < nRock; i++) {
    const a = rnd() * 6.28, r = i < 6 ? 4 + rnd() * 10 : 8 + rnd() * 32;
    const x = Math.cos(a) * r, z = Math.sin(a) * r + 8;
    dummy.position.set(x, diveSandY(x, z) + 0.35, z);
    dummy.scale.set(0.7 + rnd() * 1.3, 0.45 + rnd() * 0.7, 0.7 + rnd() * 1.2);
    dummy.rotation.set(0, rnd() * 6, rnd() * 0.4);
    dummy.updateMatrix(); rocks.setMatrixAt(i, dummy.matrix);
  }
  root.add(rocks);
  DIVE.weeds = [];
  const nWeed = settings.quality === 'low' ? 16 : 24;
  for (let i = 0; i < nWeed; i++) {
    const a = rnd() * 6.28, r = 3 + rnd() * 34, x = Math.cos(a) * r, z = Math.sin(a) * r + 6;
    const w = new THREE.Mesh(new THREE.ConeGeometry(0.28, 1.6 + rnd() * 1.1, 5), mkMat({ color: i % 2 ? 0x2f8f48 : 0x3aaa55 }));
    w.position.set(x, diveSandY(x, z) + 0.7, z); w.userData.base = w.rotation.z; root.add(w); DIVE.weeds.push(w);
  }
  DIVE.fish = [];
  for (let i = 0; i < 6; i++) {
    const f = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.22, 0.55), mkMat({ color: i % 2 ? 0xf0a24a : 0xf4f1ea }));
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.22, 0.18), mkMat({ color: 0x2a211c })); tail.position.z = -0.34;
    f.add(body); f.add(tail); root.add(f);
    DIVE.fish.push({ g: f, tail, a: rnd() * 6, r: 6 + rnd() * 18, y: -3.2 - rnd() * 2.4, sp: 0.35 + rnd() * 0.4 });
  }
  const nCaust = settings.quality === 'low' ? 5 : 8;
  DIVE.caust = [];
  for (let i = 0; i < nCaust; i++) {
    const a = rnd() * 6.28, r = 4 + rnd() * 28, x = Math.cos(a) * r, z = Math.sin(a) * r + 10;
    const c = new THREE.Mesh(new THREE.CircleGeometry(1.4 + rnd(), 8).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xd8fff2, transparent: true, opacity: 0.22, depthWrite: false }));
    c.position.set(x, diveSandY(x, z) + 0.2, z); root.add(c); DIVE.caust.push(c);
  }
  const surf = new THREE.Mesh(new THREE.CircleGeometry(72, 28).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x7ec8ea, transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide }));
  surf.position.y = 0; root.add(surf);
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.35, 0.7, 18).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xf4fbff, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }));
  ring.visible = false; ring.frustumCulled = false; root.add(ring); DIVE.splash = ring;
  const bubG = new THREE.SphereGeometry(0.16, 6, 5);
  const bubbles = new THREE.InstancedMesh(bubG, new THREE.MeshBasicMaterial({ color: 0xe8fff8, transparent: true, opacity: 0.7, depthWrite: false }), 12);
  bubbles.instanceMatrix.setUsage(THREE.DynamicDrawUsage); bubbles.frustumCulled = false; root.add(bubbles);
  const diver = makeDiver();
  root.add(diver.g);
  scene.add(root);
  DIVE.world = root; DIVE.rig = diver.g; DIVE.diver = diver; DIVE.bubbles = bubbles; DIVE.bub = [];
  for (let i = 0; i < 12; i++) DIVE.bub.push({ a: rnd() * 6, r: 0.3 + rnd(), y: rnd() * 2.4 });
  DIVE.loot = [];
  DIVE.fogA = new THREE.Color(0x1f8f90); DIVE.fogB = new THREE.Color(0x06343c);
}
function divePlaceLoot() {
  const save = diveLoad();
  if (save.found.length >= DIVE_LOOT.length) { save.found = []; save.seed = (save.seed + 5) % 997 || 5; save.week = Date.now(); diveSave(save); toast('Dno znowu kryje skarby.', 2200); }
  const rnd = diveRnd(save.seed);
  const found = new Set(save.found);
  for (const old of DIVE.loot) DIVE.world.remove(old.mesh);
  DIVE.loot = [];
  for (const def of DIVE_LOOT) {
    const mesh = new THREE.Group();
    const body = new THREE.Mesh(def.id === 'skrzynia' || def.id === 'kotwica' ? new THREE.BoxGeometry(0.7, 0.45, 0.5) : new THREE.SphereGeometry(0.28, 8, 6), mkMat({ color: def.pay > 140 ? 0xe2a122 : 0xf4f1ea, emissive: 0xf6c431, emissiveIntensity: 0.35 }));
    mesh.add(body);
    const x = def.dx + (rnd() - 0.5) * 5, z = def.dz + (rnd() - 0.5) * 5;
    mesh.position.set(x, diveSandY(x, z) + 0.35, z);
    mesh.visible = !found.has(def.id);
    DIVE.world.add(mesh);
    DIVE.loot.push({ ...def, x, z, mesh, got: found.has(def.id) });
  }
}
function diveStart() {
  diveEnsureWorld();
  divePlaceLoot();
  DIVE.on = true; G.diving = true; DIVE.bag = []; DIVE.o2 = DIVE_O2; DIVE.t = 0; DIVE.pitch = -0.2; DIVE.vy = 0; DIVE.surf = false;
  DIVE.x = DIVE_RENT.x; DIVE.y = -4.2; DIVE.z = DIVE_RENT.z + 8;
  DIVE.world.position.set(DIVE_RENT.x, 0, DIVE_RENT.z);
  DIVE.world.visible = true;
  player.mesh.visible = false;
  DIVE.hid = cars.filter((c) => c.g.visible).map((c) => c);
  if (W.chunkGroup) W.chunkGroup.visible = false;
  if (W.treeGroup) W.treeGroup.visible = false;
  if (W.ground) W.ground.visible = false;
  if (DIVE.booth) DIVE.booth.visible = false;
  if (typeof sky !== 'undefined' && sky) sky.visible = false;
  for (const c of cars) c.g.visible = false;
  if (TR && TR.pedMesh) TR.pedMesh.visible = false;
  scene.fog = new THREE.Fog(0x14686c, 5, settings.quality === 'low' ? 28 : 42);
  DIVE.bg = scene.background; scene.background = scene.fog.color;
  $('touch').classList.add('dive');
  $('street').style.visibility = 'hidden';
  const mh = $('mhud'); DIVE.mhudOn = mh && !mh.classList.contains('hidden'); if (mh) mh.classList.add('hidden');
  DIVE.hud.classList.remove('hidden');
  if (document.pointerLockElement) document.exitPointerLock();
  toast('Na powierzchni łapiesz oddech. Skarby oddajesz przy budce.', 2600);
  diveHud();
}
function diveHud() {
  const air = $('diveAir'); if (air) air.style.width = Math.max(0, DIVE.o2 / DIVE_O2 * 100) + '%';
  const n = diveLoad().found.length + DIVE.bag.length;
  const el = $('diveLoot'); if (el) el.textContent = 'Skarby: ' + n + '/' + DIVE_LOOT.length;
}
function diveTryExit() {
  if (!diveNearRent()) { toast('Wypłyń przy wypożyczalni, żeby oddać skarby.', 1800); return true; }
  diveBank();
  diveStop();
  return true;
}
function diveBank() {
  if (!DIVE.bag.length) { toast('Nic nie wyłowiłeś.', 1400); return; }
  const save = diveLoad();
  let pay = 0;
  for (const id of DIVE.bag) {
    if (!save.found.includes(id)) save.found.push(id);
    const def = DIVE_LOOT.find((q) => q.id === id);
    if (def) pay += def.pay;
  }
  save.week = save.week || Date.now();
  diveSave(save);
  DIVE.bag = [];
  if (pay) addMoney(pay, 'skarby z jeziora');
  toast('Kasa za skarby: +' + pay + ' zł', 2200);
}
function diveFail() {
  if (DIVE.fading) return;
  DIVE.fading = true; DIVE.bag = [];
  let el = $('diveFade');
  if (!el) { el = document.createElement('div'); el.id = 'diveFade'; document.body.appendChild(el); }
  el.textContent = 'Zabrakło powietrza! Skarby zostały na dnie.';
  el.classList.add('on');
  setTimeout(() => { diveStop(); el.classList.remove('on'); DIVE.fading = false; }, 700);
}
function diveStop() {
  DIVE.on = false; G.diving = false;
  if (DIVE.world) DIVE.world.visible = false;
  const x = DIVE_RENT.x + 2.4, z = DIVE_RENT.z - 2.6;
  player.x = x; player.z = z; player.y = groundH(x, z); player.vy = 0; player.onGround = true; player.h = Math.PI; player.speed = 0;
  player.mesh.visible = true; player.mesh.rotation.set(0, player.h, 0); player.mesh.position.set(x, player.y, z);
  G.mode = 'foot'; G.yaw = player.h; G.pitch = -0.22;
  if (W.chunkGroup) W.chunkGroup.visible = true;
  if (W.treeGroup) W.treeGroup.visible = true;
  if (W.ground) W.ground.visible = true;
  if (DIVE.booth) DIVE.booth.visible = true;
  if (typeof sky !== 'undefined' && sky) sky.visible = true;
  $('street').style.visibility = '';
  const mh = $('mhud'); if (mh && DIVE.mhudOn) mh.classList.remove('hidden');
  if (TR && TR.pedMesh) TR.pedMesh.visible = true;
  for (const c of DIVE.hid || []) if (c.g) c.g.visible = true;
  DIVE.hid = [];
  scene.background = DIVE.bg || null;
  if (typeof applyFog === 'function') applyFog();
  $('touch').classList.remove('dive');
  DIVE.hud.classList.add('hidden');
  updateVisibility(true);
}
function updateDive(dt) {
  if (!DIVE.on || G.paused) return;
  const { f, s } = inputAxes();
  const run = G.keys.has('ShiftLeft') || G.keys.has('ShiftRight') || G.touch.run;
  const spd = (run ? 6.2 : 4.2) * Math.min(1, Math.hypot(f, s) || (f || s ? 1 : 0));
  let mx = 0, mz = 0;
  if (Math.abs(f) + Math.abs(s) > 0.08) {
    const yaw = G.yaw, fx = Math.sin(yaw), fz = Math.cos(yaw), rx = -Math.cos(yaw), rz = Math.sin(yaw);
    mx = fx * f + rx * s; mz = fz * f + rz * s;
    const ml = Math.hypot(mx, mz) || 1; mx = mx / ml * spd; mz = mz / ml * spd;
    const th = Math.atan2(mx, mz); let dh = th - player.h; dh = Math.atan2(Math.sin(dh), Math.cos(dh)); player.h += dh * Math.min(1, dt * 8);
  }
  const up = G.keys.has('Space') || G.touch.diveUp;
  const down = G.keys.has('KeyC') || G.touch.diveDown;
  let vy = 0;
  if (up && !down) vy = 3;
  else if (down && !up) vy = -3;
  DIVE.vy = vy;
  DIVE.x += mx * dt; DIVE.z += mz * dt; DIVE.y += vy * dt;
  const rr = Math.hypot(DIVE.x - DIVE_RENT.x, DIVE.z - DIVE_RENT.z);
  if (rr > 70) { const k = 70 / rr; DIVE.x = DIVE_RENT.x + (DIVE.x - DIVE_RENT.x) * k; DIVE.z = DIVE_RENT.z + (DIVE.z - DIVE_RENT.z) * k; }
  DIVE.y = Math.max(DIVE_FLOOR, Math.min(DIVE_FLOAT, DIVE.y));
  const surf = DIVE.y > DIVE_LINE;
  if (surf && !down) DIVE.y += (DIVE_FLOAT - DIVE.y) * Math.min(1, dt * 6);
  player.x = DIVE.x; player.z = DIVE.z;
  if (surf) DIVE.o2 = Math.min(DIVE_O2, DIVE.o2 + dt * (DIVE_O2 / 2.5));
  else DIVE.o2 -= dt * (run && spd > 1 ? 1.35 : 1);
  if (DIVE.o2 <= 0) { diveFail(); return; }
  if (surf !== DIVE.surf) {
    DIVE.surf = surf;
    if (surf) diveBreakSurface();
    else diveSubmerge();
  }
  if (DIVE.splash && DIVE.splash.visible) {
    DIVE.splashT = (DIVE.splashT || 0) + dt;
    const k = DIVE.splashT / 0.55;
    DIVE.splash.scale.setScalar(1 + k * 4);
    DIVE.splash.material.opacity = Math.max(0, 0.85 * (1 - k));
    if (k >= 1) DIVE.splash.visible = false;
  }
  const bob = (spd < 0.4 ? Math.sin(DIVE.t * 1.6) * 0.08 : 0);
  DIVE.rig.position.set(DIVE.x - DIVE_RENT.x, DIVE.y + bob, DIVE.z - DIVE_RENT.z);
  DIVE.rig.rotation.y = player.h;
  const kick = Math.sin(DIVE.t * (spd > 0.4 || surf ? 8 : 2.2)) * ((spd > 0.4 || surf) ? 0.7 : 0.18);
  const dv = DIVE.diver;
  if (dv) { dv.legL.rotation.x = kick; dv.legR.rotation.x = -kick; dv.armL.rotation.x = -kick * 0.6; dv.armR.rotation.x = kick * 0.6; dv.g.rotation.x = surf ? -1.15 : -DIVE.vy * 0.08; }
  DIVE.t += dt;
  if (DIVE.weeds) for (let i = 0; i < DIVE.weeds.length; i++) DIVE.weeds[i].rotation.z = Math.sin(DIVE.t * 1.4 + i) * 0.28;
  if (DIVE.fish) for (const f of DIVE.fish) {
    f.a += dt * f.sp; f.g.position.set(Math.cos(f.a) * f.r, f.y, Math.sin(f.a) * f.r + 12); f.g.rotation.y = -f.a + Math.PI / 2;
    if (f.tail) f.tail.rotation.y = Math.sin(DIVE.t * 8 + f.a) * 0.5;
  }
  if (DIVE.caust) for (let i = 0; i < DIVE.caust.length; i++) DIVE.caust[i].material.opacity = 0.12 + Math.abs(Math.sin(DIVE.t * 1.3 + i)) * 0.2;
  if (!surf) {
    const depth = Math.min(1, Math.max(0, (-DIVE.y) / 7));
    if (scene.fog && DIVE.fogA) { scene.fog.color.copy(DIVE.fogA).lerp(DIVE.fogB, depth); if (scene.background && scene.background.isColor) scene.background.copy(scene.fog.color); }
  }
  $('touch').classList.toggle('dive-exit', diveNearRent());
  let near = null, nd = 1e9;
  for (const item of DIVE.loot) {
    if (item.got) continue;
    item.mesh.rotation.y += dt;
    const gy = diveSandY(item.x, item.z) + 0.35 + Math.sin(DIVE.t * 2 + item.x) * 0.12;
    item.mesh.position.y = gy;
    if (item.mesh.children[0] && item.mesh.children[0].material) item.mesh.children[0].material.emissiveIntensity = 0.45 + Math.sin(DIVE.t * 5 + item.z) * 0.35;
    const d = Math.hypot(DIVE.x - (DIVE_RENT.x + item.x), DIVE.z - (DIVE_RENT.z + item.z));
    if (d < nd) { nd = d; near = item; }
    if (d < 2.4 && Math.abs(DIVE.y - gy) < 2.2) {
      item.got = true; item.mesh.visible = false; DIVE.bag.push(item.id);
      divePop('+' + item.pay + ' zł');
      if (typeof sfxCoin === 'function') sfxCoin();
      if (typeof emitPart === 'function' && typeof DRV !== 'undefined' && DRV.sparks) {
        for (let k = 0; k < 8; k++) { const a = Math.random() * 6.28; emitPart(DRV.sparks, DIVE.x, DIVE.y, DIVE.z, Math.cos(a) * 2, 1.5, Math.sin(a) * 2, 0.35, 0.2, 0.05, '#ffe14a', 1, 4, 1); }
      }
      toast(item.name, 1200);
    }
  }
  const arrow = $('diveArrow'), dist = $('diveDist');
  if (arrow && surf && DIVE.bag.length) {
    const ang = Math.atan2(DIVE_RENT.x - DIVE.x, DIVE_RENT.z - DIVE.z) - player.h;
    arrow.style.transform = 'rotate(' + ang + 'rad)';
    if (dist) dist.textContent = 'Płyń do budki, żeby oddać skarby';
  } else if (arrow && near) {
    const ang = Math.atan2((DIVE_RENT.x + near.x) - DIVE.x, (DIVE_RENT.z + near.z) - DIVE.z) - player.h;
    arrow.style.transform = 'rotate(' + ang + 'rad)';
    if (dist) dist.textContent = Math.round(nd) + ' m';
  }
  const dummy = DIVE._d || (DIVE._d = new THREE.Object3D());
  for (let i = 0; i < DIVE.bub.length; i++) {
    const b = DIVE.bub[i]; b.y += dt * (0.7 + (i % 3) * 0.2); if (b.y > 3.2) b.y = 0;
    const lx = DIVE.x - DIVE_RENT.x, lz = DIVE.z - DIVE_RENT.z;
    dummy.position.set(lx + Math.cos(b.a) * b.r, Math.min(-0.2, DIVE.y + 0.3 + b.y), lz + Math.sin(b.a) * b.r);
    dummy.scale.setScalar(0.7 + b.y * 0.15);
    dummy.updateMatrix(); DIVE.bubbles.setMatrixAt(i, dummy.matrix);
  }
  DIVE.bubbles.instanceMatrix.needsUpdate = true;
  diveHud();
}
function diveBreakSurface() {
  if (typeof sky !== 'undefined' && sky) sky.visible = true;
  scene.fog = new THREE.Fog(0xb7e4f2, 14, 78);
  scene.background = DIVE.bg || new THREE.Color(0x8ec8ee);
  if (DIVE.splash) {
    DIVE.splash.visible = true; DIVE.splashT = 0; DIVE.splash.material.opacity = 0.85; DIVE.splash.scale.setScalar(1);
    DIVE.splash.position.set(DIVE.x - DIVE_RENT.x, 0.04, DIVE.z - DIVE_RENT.z);
  }
  divePop('Wdech!');
  sfxBreath();
}
function diveSubmerge() {
  if (typeof sky !== 'undefined' && sky) sky.visible = false;
  scene.fog = new THREE.Fog(0x14686c, 5, settings.quality === 'low' ? 28 : 42);
  scene.background = scene.fog.color;
}
function sfxBreath() {
  const ac = typeof audioCtx === 'function' ? audioCtx() : null; if (!ac) return;
  const t = ac.currentTime, vol = typeof sfxVol === 'function' ? sfxVol() : 0.7;
  const n = ac.createBufferSource(); n.buffer = noiseBuf(ac, 0.45);
  const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 420; bp.Q.value = 0.7;
  const g = ac.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.12 * vol, t + 0.06); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.42);
  n.connect(bp); bp.connect(g); g.connect(ac.destination); n.start(t); n.stop(t + 0.45);
}
function divePop(text) {
  const el = document.createElement('div'); el.className = 'divePop'; el.textContent = text; document.body.appendChild(el);
  setTimeout(() => { if (el.parentNode) el.parentNode.removeChild(el); }, 900);
}
function diveCamera() {
  const dist = 4.8;
  const px = DIVE.x - Math.sin(G.yaw) * dist, pz = DIVE.z - Math.cos(G.yaw) * dist;
  if (DIVE.surf) {
    camera.position.set(px, 1.85, pz);
    camera.lookAt(DIVE.x + Math.sin(G.yaw) * 7, 0.45, DIVE.z + Math.cos(G.yaw) * 7);
    return;
  }
  const aim = (DIVE.vy || 0) * 0.35;
  DIVE.pitch = (DIVE.pitch || 0) + (aim - (DIVE.pitch || 0)) * 0.12;
  camera.position.set(px, DIVE.y + 1.35, pz);
  camera.lookAt(DIVE.x + Math.sin(G.yaw) * 3, DIVE.y + 0.2 + DIVE.pitch * 3, DIVE.z + Math.cos(G.yaw) * 3);
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
    if (p[0] === 'Nurkowanie') continue;
    if (Math.hypot(p[1] - x, p[2] - z) > R * 0.92) continue;
    g.beginPath(); g.arc(p[1], p[2], 6 / sc, 0, 7); g.fill();
  }
  if (typeof drawDiveIcon === 'function') {
    const dx = DIVE_RENT.x - x, dz = DIVE_RENT.z - z, dist = Math.hypot(dx, dz) || 1;
    const lim = R * 0.78; const k = dist > lim ? lim / dist : 1;
    g.save(); g.translate(x + dx * k, z + dz * k); drawDiveIcon(g, 12 / sc);
    if (dist < R * 0.9) { g.fillStyle = '#1b140f'; g.font = 'bold ' + (11 / sc) + 'px Fredoka, system-ui, sans-serif'; g.textAlign = 'center'; g.fillText('Nurkowanie', 0, -16 / sc); }
    g.restore();
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
  ['Nurkowanie', -1792, 2348, '#1a8a9a'],
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
    if (p[0] === 'Nurkowanie') continue;
    const x = (p[1] - MINX) * S, y = (p[2] - MINZ) * S;
    g.fillStyle = p[3] || '#e8503a'; g.beginPath(); g.arc(x, y, 6, 0, 7); g.fill();
    g.lineWidth = 2; g.strokeStyle = '#2a211c'; g.stroke();
    g.fillStyle = '#1b140f'; g.fillText(p[0], x, y - 10);
  }
  if (typeof MIS !== 'undefined') {
    g.fillStyle = '#ffd21f';
    g.font = 'bold 11px Fredoka, system-ui, sans-serif'; g.fillStyle = '#1b140f';
    for (const m of MIS.list) if (m.giver) {
      const x = (m.giver[0] - MINX) * S, y = (m.giver[1] - MINZ) * S; g.fillStyle = '#ffd21f'; g.beginPath(); g.arc(x, y, 4, 0, 7); g.fill();
      if (typeof npcPin === 'function' && giverOpen(m)) { g.fillStyle = '#1b140f'; g.fillText(npcPin(m), x, y + 16); }
    }
  }
  g.fillStyle = '#2b4a6b'; g.font = 'bold 22px system-ui, sans-serif';
  for (const w of W.water) if (w.name && Math.abs(ringArea(w.ring)) > 200000) { let cx = 0, cz = 0; const n = w.ring.length / 2; for (let i = 0; i < w.ring.length; i += 2) { cx += w.ring[i]; cz += w.ring[i + 1]; } g.fillText(w.name, (cx / n - MINX) * S, (cz / n - MINZ) * S); }
  g.save(); g.setTransform(S, 0, 0, S, -MINX * S, -MINZ * S); drawMissionMinimap(g, S * 1.6); if (typeof drawNavOverlay === 'function') drawNavOverlay(g, S); g.restore();
  const px = G.mode === 'car' ? activeCar.x : player.x, pz = G.mode === 'car' ? activeCar.z : player.z; const ph = G.mode === 'car' ? activeCar.h : player.h;
  g.save(); g.translate((px - MINX) * S, (pz - MINZ) * S); g.rotate(Math.PI - ph); g.fillStyle = '#ff3b30'; g.strokeStyle = '#fff'; g.lineWidth = 3;
  g.beginPath(); g.moveTo(0, -16); g.lineTo(11, 12); g.lineTo(0, 6); g.lineTo(-11, 12); g.closePath(); g.fill(); g.stroke(); g.restore();
  if (typeof drawDiveIcon === 'function') {
    const x = (DIVE_RENT.x - MINX) * S, y = (DIVE_RENT.z - MINZ) * S;
    g.save(); g.translate(x, y); drawDiveIcon(g, 18);
    g.font = 'bold 18px Fredoka, system-ui, sans-serif'; g.textAlign = 'center'; g.fillStyle = '#fff6e4'; g.strokeStyle = '#2a211c'; g.lineWidth = 4;
    g.strokeText('Nurkowanie', 0, -28); g.fillText('Nurkowanie', 0, -28); g.restore();
  }
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
    if (e.code === 'Space' && G.mode === 'foot' && !G.diving) G.jumpReq = true;
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
    else if (e.code === 'KeyC' && !G.diving) G.camZoom = G.camZoom ? 0 : 1;
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
    bvh: typeof BVH !== 'undefined' ? { built: BVH.built, chunks: BVH.list.length, dropped: BVH.dropped } : null,
    yuka: typeof Vehicle === 'function',
    yukaPeds: typeof TR !== 'undefined' ? TR.peds.filter((p) => p._yv).length : 0,
    yukaCars: typeof TR !== 'undefined' ? TR.agents.filter((c) => c._yv).length : 0,
    nipple: typeof nipplejs !== 'undefined' && !!nipplejs.create,
    lights: typeof TL !== 'undefined' ? TL.list.length : 0,
    trees: typeof W !== 'undefined' ? W.treeColliders || 0 : 0,
    spans: typeof W !== 'undefined' && W.spans ? W.spans.length : 0,
    lightNear: typeof TL !== 'undefined' ? TL.nearN : 0,
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
    givers: MIS.list.map((m) => ({ id: m.id, x: m.gx, z: m.gz, hx: m.hx, hz: m.hz, open: giverOpen(m), phase: typeof npcPhase === 'function' ? npcPhase(m) : '' })), car: MIS.active && MIS.active.car ? { x: MIS.active.car.x, z: MIS.active.car.z } : null, cps: MIS.active && MIS.active.cps ? MIS.active.cps.length : 0, i: MIS.active ? MIS.active.i : 0 }),
  path: (ax, az, bx, bz) => { const p = astar(nearestNode(ax, az), nearestNode(bx, bz)); return p ? pathPoints(p) : null; },
  touchStats: () => ({ ...TP.stats, ptrs: TP.ptrs.size, joy: !!TP.joy, look: !!TP.look, jx: G.touch.jx, jy: G.touch.jy, gas: !!G.touch.gas, brake: !!G.touch.brake, hand: !!G.touch.hand, steer: activeCar ? activeCar.steer : 0 }), touchReset,
  dialogAction, dialogClose, shopBuy, shopClose, places: PLACES, money: () => SAVE.money,
  npcGreet: (id) => npcGreet(MIS.list.find((m) => m.id === id)), npcPhase: (id) => npcPhase(MIS.list.find((m) => m.id === id)), npcMood: (id) => npcMood(id), npcRemember, npcBag,
  surface: () => ({
    trees: W.treeColliders || 0,
    at: (x, z) => waterAt(x, z),
    deck: (x, z) => bridgeDeckH(x, z),
    spans: (W.spans || []).map((s) => ({ name: s.name, type: s.type, len: s.len, x: +s.x.toFixed(0), z: +s.z.toFixed(0), deck: +s.deck.toFixed(2) })),
    tree: () => {
      const s = W.treeGrid && W.treeGrid.s; if (!s || !s.length) return null;
      const x = s[0] + 0.01, z = s[1]; const o = { x: 0, z: 0, hit: false };
      collideCircle(x + 0.25, z, 0.95, o, true, false);
      return { x: +x.toFixed(1), z: +z.toFixed(1), hit: !!o.hit };
    },
  }),
  dive: () => ({ on: !!G.diving, x: DIVE.x, y: DIVE.y, z: DIVE.z, o2: DIVE.o2, bag: DIVE.bag.slice(), rent: { ...DIVE_RENT }, n: DIVE_LOOT.length }),
  rings: () => (typeof auditVehicleRings === 'function' ? auditVehicleRings() : null),
  lights: () => (typeof TL === 'undefined' ? null : {
    n: TL.list.length, near: TL.nearN,
    at: TL.list.map((s) => ({ n: s.name, x: +s.x.toFixed(1), z: +s.z.toFixed(1) })),
    phase: (i) => lightPhase(TL.list[i], performance.now()),
  }),
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
