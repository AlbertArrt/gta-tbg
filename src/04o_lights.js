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
