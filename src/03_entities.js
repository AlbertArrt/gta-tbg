
// ======================= ENTITIES =======================
function box(w, h, d, color, x, y, z, mat) {
  const geo = new THREE.BoxGeometry(w, h, d);
  const m = new THREE.Mesh(geo, mat || mkMat({ color }));
  m.position.set(x, y, z); m.castShadow = true;
  if (TOON && !box.noHull) { addHdir(geo); const hl = new THREE.Mesh(geo, hullMats().small); m.add(hl); }
  return m;
}
function makeWalker(opt = {}) {
  const g = new THREE.Group();
  const skin = mkMat({ color: opt.skin || 0xe2b08c });
  const shirt = mkMat({ color: opt.shirt || 0xf2c218 });
  const pants = mkMat({ color: opt.pants || 0x2c3e66 });
  const shoes = mkMat({ color: 0x222222 });
  const hair = mkMat({ color: opt.hair || 0x3a2a1c });
  const body = new THREE.Group(); g.add(body);
  body.add(box(0.5, 0.62, 0.28, 0, 0, 1.22, 0, shirt));
  body.add(box(0.51, 0.1, 0.29, 0, 0, 1.2, 0, mkMat({ color: opt.belt || 0x1f5fbf })));
  const head = new THREE.Group(); head.position.set(0, 1.68, 0); body.add(head);
  head.add(box(0.3, 0.32, 0.3, 0, 0, 0, 0, skin)); head.add(box(0.32, 0.1, 0.32, 0, 0, 0.15, 0.0, opt.cap ? mkMat({ color: opt.cap }) : hair));
  box.noHull = true; head.add(box(0.06, 0.05, 0.02, 0, -0.07, 0.03, 0.155, shoes)); head.add(box(0.06, 0.05, 0.02, 0, 0.07, 0.03, 0.155, shoes)); box.noHull = false;
  const limb = (w, h, mat, x, y) => { const p = new THREE.Group(); p.position.set(x, y, 0); const m = box(w, h, w, 0, 0, -h / 2, 0, mat); p.add(m); body.add(p); return p; };
  const armL = limb(0.14, 0.6, shirt, -0.33, 1.5), armR = limb(0.14, 0.6, shirt, 0.33, 1.5);
  armL.children[0].add(box(0.13, 0.14, 0.13, 0, 0, -0.33, 0, skin)); armR.children[0].add(box(0.13, 0.14, 0.13, 0, 0, -0.33, 0, skin));
  const legL = limb(0.19, 0.88, pants, -0.13, 0.9), legR = limb(0.19, 0.88, pants, 0.13, 0.9);
  legL.children[0].add(box(0.2, 0.1, 0.3, 0, 0, -0.44, 0.05, shoes)); legR.children[0].add(box(0.2, 0.1, 0.3, 0, 0, -0.44, 0.05, shoes));
  g.userData = { body, armL, armR, legL, legR, phase: 0 };
  return g;
}
function animateWalker(w, speed, dt, air) {
  const u = w.userData;
  if (air) { u.armL.rotation.x = -2.6; u.armR.rotation.x = -2.6; u.legL.rotation.x = 0.5; u.legR.rotation.x = -0.3; return; }
  if (speed > 0.2) u.phase += dt * speed * 1.9; else u.phase *= 0.85;
  const a = Math.sin(u.phase) * Math.min(1, speed / 4) * 0.9;
  u.legL.rotation.x = a; u.legR.rotation.x = -a; u.armL.rotation.x = -a * 0.8; u.armR.rotation.x = a * 0.8;
  u.body.position.y = Math.abs(Math.sin(u.phase)) * 0.05 * Math.min(1, speed / 4);
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
    B.add(new THREE.Mesh(mergeBoxes(heads.map((h) => [...h, '#ffffff'])), this.headMat)); B.add(new THREE.Mesh(mergeBoxes(tails.map((h) => [...h, '#ffffff'])), this.tailMat));
    if (this.police) {
      this.lbR = new THREE.MeshBasicMaterial({ color: 0x661111 }); this.lbB = new THREE.MeshBasicMaterial({ color: 0x112266 });
      const r = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.16, 0.36), this.lbR); r.position.set(-0.23, 1.62, -0.25); B.add(r);
      const b2 = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.16, 0.36), this.lbB); b2.position.set(0.23, 1.62, -0.25); B.add(b2);
    }
    this.wheels = [];
    const WR = this.scooter ? 0.27 : (OR ? 0.5 : 0.36), WW = this.scooter ? 0.14 : (OR ? 0.36 : 0.26); this.wr = WR;
    const key = WR + '_' + WW + '_' + TOON;
    Car.wheelGeo = Car.wheelGeo || {};
    if (!Car.wheelGeo[key]) {
      const wg = new THREE.CylinderGeometry(WR, WR, WW, TOON ? 12 : 14).rotateZ(Math.PI / 2);
      const parts = [[0, 0, 0, 0, 0, 0, '#1a1a1a', 0, wg]];
      if (TOON) {
        const rimCol = OR ? '#e4efe0' : '#f4f1ea';
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
      Car.wheelGeo[key] = mergeBoxes(parts);
    }
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
    this.x = x; this.z = z; this.h = heading; this.vx = 0; this.vz = 0; this.steer = 0; this.spin = 0; this.yawRate = 0;
    this.y = groundH(x, z); this.vy = 0; this.pgh = this.y; this.air = false; this.sus = 0; this.susV = 0; this.pitch = 0; this.roll = 0;
    this.sync();
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
function collideCircle(x, z, r, out, withTrees) {
  let px = x, pz = z, hit = false, nxs = 0, nzs = 0;
  for (let it = 0; it < 3; it++) {
    let moved = false; const s = W.bGrid.s;
    W.bGrid.query(px, pz, r + 0.5, (i) => {
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
  const geo = new THREE.SphereGeometry(4500, 32, 16);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: new THREE.Color() }, bottom: { value: new THREE.Color() }, sunDir: { value: new THREE.Vector3(0, 1, 0) }, sunCol: { value: new THREE.Color() }, night: { value: 0 } },
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); vec4 p = modelViewMatrix*vec4(position,1.0); gl_Position = projectionMatrix*p; gl_Position.z = gl_Position.w*0.9999; }',
    fragmentShader: `uniform vec3 top; uniform vec3 bottom; uniform vec3 sunDir; uniform vec3 sunCol; uniform float night; varying vec3 vP;
      float h(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,45.164)))*43758.5453); }
      void main(){ float t = clamp(vP.y*1.4+0.15,0.0,1.0); vec3 c = mix(bottom, top, pow(t,0.7));
        float s = max(dot(normalize(vP), normalize(sunDir)),0.0); c += sunCol*(pow(s,800.0)*4.0 + pow(s,12.0)*0.25);
        if(night>0.5 && vP.y>0.05){ vec3 q = floor(vP*300.0); float st = step(0.9975, h(q)); c += vec3(st)*0.9; }
        gl_FragColor = vec4(c,1.0);
        ${TOON ? '#include <colorspace_fragment>' : ''} }`,
  });
  const m = new THREE.Mesh(geo, mat); m.frustumCulled = false; m.renderOrder = -1; scene.add(m);
  return m;
}
