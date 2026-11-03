
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
function actionE() { if (G.cut) return false; if (typeof dialogAction === 'function' && dialogAction()) return true; const b = nearEggButton(); if (b === 'go') return eggGo(); if (b === 'back') return eggBack(); if (missionAction()) return true; if (typeof garageAction === "function" && garageAction()) return true; if (shopAction()) return true; return enterExit(); }
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
