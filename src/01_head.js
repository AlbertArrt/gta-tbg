// GTA TBG (Tarnobrzeg) – open-world browser game on OpenStreetMap data (© OpenStreetMap contributors, ODbL)
import * as THREE from 'three';

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
