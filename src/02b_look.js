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
  const iron = '#3a342c', wood = '#e0a15a', cream = '#f3e6c8', leaf = '#5fb53a', red = '#e8503a', blue = '#3d8fe0';
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
  const kinds = q === 'low' ? ['bin'] : ['bench', 'bin', 'hydrant', 'sign', 'planter'];
  const buckets = {}; kinds.forEach((k) => { buckets[k] = []; });
  const keep = new Set(['residential', 'tertiary', 'secondary', 'primary', 'living_street', 'unclassified']);
  const rad = { bench: 0.7, bin: 0.32, hydrant: 0.26, sign: 0.22, planter: 0.4 };
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
