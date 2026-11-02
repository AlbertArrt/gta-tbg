
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
