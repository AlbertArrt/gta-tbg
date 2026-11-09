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
  { h: 'Auto, mapa, GPS', p: 'E albo WSIĄDŹ – wsiądź i wysiądź. M otwiera mapę: klik przenosi (gdy nie goni cię policja), przycisk GPS rysuje trasę po ulicach. Trasa omija budynki i wodę. G albo „Anuluj GPS” kasuje wyznaczony cel. Cel misji ustawia się sam przy kolejnym etapie.' },
  { h: 'Misje i dziennik', p: 'Świecące „!” to zleceniodawcy. Dziennik (J albo 📒) ma zakładki Aktywna, Dostępne i Ukończone: kroki, nagroda, rekord. Można przyjąć, przerwać i jechać od nowa. Zegar misji stoi, gdy dziennik albo mapa jest otwarta.' },
  { h: 'Policja, garaż, radio', p: 'Gwiazdki za potrącenie, taran radiowozu, kradzież i pędzenie obok policji. Zgub pościg albo wpadnij do lakierni. Niebieskie G to garaż i tuning. Q / R zmienia stację (jest Radio Leliwa), T wycisza. Ten samouczek włączysz ponownie z menu.' },
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
  if (clr) clr.onclick = () => { navClear(); toast('GPS wyłączony', 1200); if (BM.c) drawBigMap(); };
}
