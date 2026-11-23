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
