
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
    let doorI = -1, doorL = 0;
    if (TOON) {
      const mm = ring.length / 2;
      for (let i = 0; i < mm; i++) {
        const j = (i + 1) % mm;
        const L = Math.hypot(ring[j * 2] - ring[i * 2], ring[j * 2 + 1] - ring[i * 2 + 1]);
        if (L > doorL) { doorL = L; doorI = i; }
      }
    }
    const wantDoor = TOON && doorL > 4.2 && !SHEDS.has(kind) && wallH > 2.5;
    const blockish = palette === PAL.block && floors >= 3 && area > 140 && area < 4500;
    const addQuad = (x1, z1, x2, z2, nx, nz, u0, u1, tcode) => {
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
      if (TOON && area > 45 && (area < 700 || kind === 'church' || kind === 'chapel')) addChimney(ch, cx, cz, wallH + roofH, kind);
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
  setLoad(0.76, 'Pierzeje ulic…'); await nextFrame();
  sealStreetWalls(fronts, getChunk);
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
  W.landmarks = data.landmarks;
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
