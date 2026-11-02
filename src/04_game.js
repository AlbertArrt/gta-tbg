
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
function applyFog() { const q = QUALITY[settings.quality]; scene.fog = new THREE.Fog(G.night ? FOG_NIGHT : FOG_DAY, q.dist * (TOON ? 0.72 : 0.45), q.dist); }
function applyTime() {
  const n = G.night;
  sky.material.uniforms.top.value.set(n ? '#050b18' : (TOON ? '#6fb7ff' : '#3f7fc4'));
  sky.material.uniforms.bottom.value.set(n ? '#14223a' : (TOON ? '#d8f0ff' : '#cfe0ee'));
  sky.material.uniforms.sunCol.value.set(n ? '#9fb3d9' : '#fff1c8');
  sky.material.uniforms.night.value = n ? 1 : 0;
  const sd = n ? new THREE.Vector3(-0.4, 0.55, 0.5) : new THREE.Vector3(0.45, 0.75, 0.35); sd.normalize();
  sky.material.uniforms.sunDir.value.copy(sd); G.sunDir = sd;
  hemi.intensity = n ? 0.35 : (TOON ? 1.25 : 1.6); hemi.color.set(n ? '#5a6f99' : (TOON ? '#eaf4ff' : '#dfefff')); hemi.groundColor.set(n ? '#1a1f2a' : (TOON ? '#8fae6a' : '#6f7a5a'));
  sun.intensity = n ? 0.35 : (TOON ? 2.2 : 2.4); sun.color.set(n ? '#9fb6ff' : '#fff3dd');
  W.mats.wall.emissiveIntensity = n ? 1.1 : 0;
  W.mats.water.color.set(n ? '#1b3550' : (TOON ? '#47a6e0' : '#3f7398'));
  W.mats.ground.color.set(n ? (TOON ? '#5f7f3c' : '#5d7048') : (TOON ? '#a3d65c' : '#93ad6e'));
  headlight.intensity = n ? 60 : 0;
  for (const c of cars.concat(TR.pool, POL.cars)) { c.headMat.emissiveIntensity = n ? 2.5 : 0.2; c.tailMat.emissiveIntensity = n ? 1.5 : 0.3; }
  renderer.toneMappingExposure = n ? 1.15 : 1.0;
  $('btnNight').textContent = n ? '☀️' : '🌙';
  applyFog();
}

async function init() {
  const canvas = $('c');
  renderer = new THREE.WebGLRenderer({ canvas, antialias: QUALITY[settings.quality].aa, powerPreference: 'high-performance' });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
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

  player = { x: 0, z: 0, y: 0, vy: 0, h: 0, mesh: makeWalker(), speed: 0, onGround: true };
  scene.add(player.mesh);
  spawnAtRynek();
  spawnCars(); spawnEgg(); initTraffic(); initPolice(); initMissions();
  applyTime(); applyQuality();
  initMinimap(); initBigMap(); initInput(); initRadio(); initMenu();
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
  spots.slice(0, 14).forEach((s, i) => { cars.push(new Car(scene, CAR_COLORS[i % CAR_COLORS.length], s[0], s[1], s[2] + (rnd() < 0.5 ? 0 : Math.PI))); });
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
    $('speedo').classList.remove('hidden'); $('touch').classList.add('incar'); $('tEnter').textContent = 'WYSIĄDŹ';
    return true;
  }
  const c = activeCar; if (c.speed > 4) { toast('Zwolnij, aby wysiąść'); return false; }
  const fx = Math.sin(c.h), fz = Math.cos(c.h); const rx = Math.cos(c.h), rz = -Math.sin(c.h);
  let px = c.x - rx * 2.0, pz = c.z - rz * 2.0;
  if (insideBuilding(px, pz, 0.5)) { px = c.x + rx * 2.0; pz = c.z + rz * 2.0; }
  if (insideBuilding(px, pz, 0.5)) { [px, pz] = findFree(c.x - fx * 3.5, c.z - fz * 3.5, 0.6); }
  player.x = px; player.z = pz; player.y = groundH(px, pz); player.h = c.h; player.mesh.visible = true;
  c.vx = c.vz = 0; activeCar = null; G.mode = 'foot'; if (c.rider) c.rider.visible = false;
  $('speedo').classList.add('hidden'); $('touch').classList.remove('incar'); $('tEnter').textContent = 'WSIĄDŹ';
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
    const nx = player.x + mx * speed * dt, nz = player.z + mz * speed * dt;
    collideCircle(nx, nz, 0.35, col, true);
    let px = col.x, pz = col.z;
    if (insideBuilding(px, pz, 0) && !insideBuilding(player.x, player.z, 0)) { px = player.x; pz = player.z; }
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
  let thr = 0, brk = 0, steerIn = 0, hand = false;
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
  const OR = c.offroad; let MAXV = OR ? 41 : 48; const ACC = OR ? 14 : 13, BRK = 28;
  // surface (only in the off-road zone): dirt trails and grass slow normal cars much more than the 4x4
  let surfGrip = 1; c.surf = 'road';
  if (W.off && inOffRect(c.x, c.z)) {
    const onWay = nearRoad(c.x, c.z, 0.8); const f = onWay ? (OR ? 0.72 : 0.5) : (OR ? 0.55 : 0.28);
    c.surf = onWay ? 'dirt' : 'grass'; MAXV *= f; surfGrip = onWay ? (OR ? 0.85 : 0.6) : (OR ? 0.7 : 0.35);
    if (vF > MAXV) vF -= (vF - MAXV) * Math.min(1, dt * 1.6);
  }
  if (c.wrecked) { thr = 0; hand = true; } if (c.scooter) MAXV = 22;
  if (c.air) { thr *= 0.15; hand = false; }
  if (thr > 0) { if (vF < -0.5) vF += BRK * dt; else vF += ACC * thr * dt * (1 - Math.max(0, vF) / MAXV); }
  else if (thr < 0) { if (vF > 0.5) vF -= BRK * dt; else vF = Math.max(-12, vF - 7 * dt); }
  else { vF -= Math.sign(vF) * Math.min(Math.abs(vF), (2.2 + Math.abs(vF) * 0.04) * dt); }
  if (hand) { vF -= Math.sign(vF) * Math.min(Math.abs(vF), 9 * dt); }
  const maxSteer = 0.55 / (1 + Math.abs(vF) * 0.035);
  c.steer = lerp(c.steer, steerIn * maxSteer, Math.min(1, dt * (drive && G.touch.jon ? 7 : 6)));
  const grip = c.air ? 0.2 : (hand ? 1.3 : 9 * surfGrip);
  vR -= vR * Math.min(1, grip * dt);
  const yawRate = vF / 2.6 * Math.tan(c.steer) * (hand ? 1.35 : 1) * (c.air ? 0.15 : 1);
  c.h += yawRate * dt; c.yawRate = yawRate;
  const nfx = Math.sin(c.h), nfz = Math.cos(c.h), nrx = Math.cos(c.h), nrz = -Math.sin(c.h);
  c.vx = nfx * vF + nrx * vR; c.vz = nfz * vF + nrz * vR;
  // move with substeps and collide with buildings
  const dist = Math.hypot(c.vx, c.vz) * dt; const steps = Math.max(1, Math.ceil(dist / 0.3));
  let impact = 0;
  for (let i = 0; i < steps; i++) {
    const ox = c.x, oz = c.z;
    c.x += c.vx * dt / steps; c.z += c.vz * dt / steps;
    for (const off of c.offs) {
      const cx = c.x + Math.sin(c.h) * off, cz = c.z + Math.cos(c.h) * off;
      collideCircle(cx, cz, c.rad, col, false);
      if (col.hit) {
        c.x += col.x - cx; c.z += col.z - cz;
        const vn = c.vx * col.nx + c.vz * col.nz;
        if (vn < 0) { impact = Math.max(impact, -vn); c.vx -= vn * col.nx * 1.35; c.vz -= vn * col.nz * 1.35; c.vx *= 0.8; c.vz *= 0.8; }
      }
    }
    // safety: never let any part of the car end up inside a building footprint
    let bad = false; for (const off of c.offs) if (insideBuilding(c.x + Math.sin(c.h) * off, c.z + Math.cos(c.h) * off, 0)) { bad = true; break; }
    if (bad) { impact = Math.max(impact, Math.hypot(c.vx, c.vz)); c.x = ox; c.z = oz; c.vx *= -0.25; c.vz *= -0.25; break; }
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
          impact = Math.max(impact, -vn); c.vx -= vn * nx * 0.6; c.vz -= vn * nz * 0.6; o.vx += vn * nx * 0.6; o.vz += vn * nz * 0.6;
          if (-vn > 2.5) { trafficHit(o, c, -vn); if (o === activeCar || c === activeCar) carHitEvent(c === activeCar ? o : c, -vn); if (-vn > 4) damageCar(o, (-vn - 3) * 3); }
        }
        o.sync();
      }
    }
  }
  const now = performance.now();
  if (impact > 3) { damageCar(c, (impact - 3) * 4); if (c === activeCar && now - (G.lastHit || 0) > 700) { G.lastHit = now; G.collisions++; if (typeof missionImpact === 'function') missionImpact(impact); toast('Bum! Kolizja'); } }
  updateCarVertical(c, dt);
  c.sync();
  c.spin += vF * dt / (c.wr || 0.36);
  for (const w of c.wheels) { w.w.rotation.x = c.spin; if (w.front) w.pv.rotation.y = c.steer; }
  c.g.rotation.x = c.pitch; c.g.rotation.z = c.roll + clamp(-c.yawRate * vF * 0.004, -0.06, 0.06);
}
// vertical physics: gravity, terrain following, natural jumps over crests/ramps, spring suspension
function updateCarVertical(c, dt) {
  const zone = W.off && inOffRect(c.x, c.z);
  if (!zone && !c.y && !c.vy && !c.air && !c.sus && !c.susV && !c.pitch && !c.roll) { c.pgh = 0; return; }
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
    tx = player.x; tz = player.z; ty = player.y + 1.6; dist = G.camZoom ? 2.8 : 5.2; height = 0;
  }
  const cp = Math.cos(G.pitch), sp = Math.sin(G.pitch);
  let px = tx - Math.sin(G.yaw) * dist * cp, pz = tz - Math.cos(G.yaw) * dist * cp, py = ty + height - sp * dist;
  if (G.mode === 'car') py = ty + height - sp * dist * 0.5;
  // pull camera in when a building is in the way
  const steps = 8; let lastOk = 1;
  for (let i = 1; i <= steps; i++) { const t = i / steps; const sx = lerp(tx, px, t), sz = lerp(tz, pz, t); const sy = lerp(ty, py, t); const b = insideBuildingH(sx, sz, sy); if (b) { lastOk = Math.max(0.15, (i - 1) / steps); break; } }
  px = lerp(tx, px, lastOk); pz = lerp(tz, pz, lastOk); py = Math.max(groundH(px, pz) + 0.4, lerp(ty, py, lastOk));
  camPos.set(px, py, pz);
  if (G.mode === 'car') camera.position.lerp(camPos, Math.min(1, dt * 10)); else camera.position.copy(camPos);
  camLook.set(tx, ty + (G.mode === 'car' ? 0.4 : 0.1), tz);
  camera.lookAt(camLook);
}
function insideBuildingH(x, z, y) {
  const a = W.bCells.get(Math.floor(x / 32) * 100000 + Math.floor(z / 32)); if (!a) return false;
  for (const i of a) { const b = W.buildings[i]; if (y < b.h && pointInRing(x, z, b.ring)) return true; }
  return false;
}

let visT = 0;
function updateVisibility(force) {
  const q = QUALITY[settings.quality]; const cx = camera.position.x, cz = camera.position.z;
  // kontury budynków (linie ekranowe) tylko w pobliżu – daleko i tak giną we mgle, a kosztują dużo wierzchołków
  const EDGE_D = (q.edge || 400) * (STYLE === 'lite' ? 0.75 : 1);
  const D = G.camOverride ? 2600 : (G.started ? q.dist : Math.max(q.dist, 900));
  for (const v of W.visObjects) {
    const d = Math.hypot(v.x - cx, v.z - cz) - v.r;
    if (v.near) v.obj.visible = d < TREE_NEAR && d < D + v.bias;
    else if (v.far) v.obj.visible = d >= TREE_NEAR - 10 && d < D + v.bias;
    else if (v.edge) v.obj.visible = d < Math.min(D + v.bias, EDGE_D);
    else v.obj.visible = d < D + v.bias;
  }
}

let fpsAcc = 0, fpsN = 0, hudT = 0;
function loop() {
  const rawDt = clock.getDelta(); let dt = Math.min(0.05, rawDt); const tU = performance.now();
  if (G.started && !G.paused) {
    if (G.cut) { G.cut.t -= dt; if (G.mode === 'car') updateCar(activeCar, dt, { thr: 0, steer: 0, hand: true }); if (G.cut.t <= 0) { const f = G.cut.fn; G.cut = null; f(); } }
    else if (G.mode === 'foot') updateFoot(dt); else updateCar(activeCar, dt, true);
    updateParked(dt);
    updateTraffic(dt); updatePolice(dt); updateDamage(dt); updateShops(dt);
    updateEgg(dt); updateMissions(dt);
    const eh = eggHint() || missionHint() || shopHint();
    const near = G.mode === 'foot' && cars.some((c) => Math.hypot(c.x - player.x, c.z - player.z) < 3.8);
    hint(eh || (near ? (isTouch ? 'Naciśnij WSIĄDŹ' : 'Naciśnij E, aby wsiąść') : ''));
    if (G.mode === 'foot') { const lbl = eh ? (nearEggButton() ? 'TELEPORT' : 'AKCJA') : 'WSIĄDŹ'; if (G.tLbl !== lbl) { G.tLbl = lbl; $('tEnter').textContent = lbl; } } else G.tLbl = '';
  }
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
  updateRadio(dt);
  renderFrame();
  fpsAcc += Math.min(rawDt, 1); fpsN++; if (fpsAcc > 0.5) { G.fps = Math.round(fpsN / fpsAcc); fpsAcc = 0; fpsN = 0; if (settings.fps) $('fps').textContent = G.fps + ' FPS · ' + renderer.info.render.calls + ' dc'; }
  if (G.started) { hudT -= dt; if (hudT <= 0) { hudT = 0.25; updateStreet(); } drawMinimap(); if (G.mode === 'car') drawSpeedo(); }
}
function onResize() {
  if (!renderer) return;
  renderer.setSize(innerWidth, innerHeight, false); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); resizePost();
}
