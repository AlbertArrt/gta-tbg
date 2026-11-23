// DIVE-TREASURE
// Własne nurkowanie w Jeziorze Tarnobrzeskim: wypożyczalnia na plaży, dno z piasku,
// skał i wodorostów, skarby w localStorage. Bez sieci i bez cudzych assetów.
const DIVE_RENT = { x: -1792, z: 2348, name: 'Wypożyczalnia sprzętu nurkowego' };
const DIVE_O2 = 38;
const DIVE_WEEK_MS = 7 * 24 * 3600 * 1000;
const DIVE_LOOT = [
  { id: 'skrzynia', name: 'Skrzynia skarbów', pay: 250, dx: 6, dz: 16 },
  { id: 'moneta', name: 'Stara moneta', pay: 40, dx: -14, dz: 20 },
  { id: 'telefon', name: 'Zgubiony telefon', pay: 80, dx: 18, dz: 28 },
  { id: 'kotwica', name: 'Kotwica', pay: 60, dx: -8, dz: 34 },
  { id: 'butelka', name: 'Butelka z listą', pay: 90, dx: 22, dz: 12 },
  { id: 'zegarek', name: 'Złoty zegarek', pay: 180, dx: -20, dz: 26 },
  { id: 'perla', name: 'Perła', pay: 120, dx: 4, dz: 40 },
  { id: 'kompas', name: 'Stary kompas', pay: 70, dx: 28, dz: 36 },
  { id: 'pierscien', name: 'Złoty pierścień', pay: 150, dx: -24, dz: 14 },
  { id: 'bursztyn', name: 'Bursztyn', pay: 100, dx: 12, dz: 46 },
];
const DIVE = { on: false, x: 0, y: 0, z: 0, o2: DIVE_O2, bag: [], loot: [], world: null, rig: null, hud: null, bubbles: null, t: 0 };

function diveLoad() {
  let o = {};
  try { o = JSON.parse(localStorage.getItem('gtatbg_dive') || '{}') || {}; } catch (e) { o = {}; }
  if (!o.seed) o.seed = 7;
  if (!Array.isArray(o.found)) o.found = [];
  const now = Date.now();
  if (!o.week || now - o.week > DIVE_WEEK_MS) { o.found = []; o.week = now; o.seed = (o.seed + 3) % 997 || 3; diveSave(o); }
  return o;
}
function diveSave(o) {
  try { localStorage.setItem('gtatbg_dive', JSON.stringify(o)); } catch (e) { /* prywatny tryb */ }
}
function diveRnd(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function initDive() {
  const g = new THREE.Group();
  g.position.set(DIVE_RENT.x, groundH(DIVE_RENT.x, DIVE_RENT.z), DIVE_RENT.z);
  const wood = mkMat({ color: 0xc9843a }), wall = mkMat({ color: 0xf4e2b0 }), roof = mkMat({ color: 0xd2553f }), post = mkMat({ color: 0x2a211c });
  const add = (w, h, d, x, y, z, mat) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); m.castShadow = false; g.add(m); };
  add(2.2, 2.2, 1.6, 0, 1.2, 0, wall);
  add(2.5, 0.28, 2, 0, 2.4, 0, roof);
  add(0.18, 2.4, 0.18, -1.05, 1.2, 0.75, post);
  add(0.18, 2.4, 0.18, 1.05, 1.2, 0.75, post);
  for (let i = 0; i < 5; i++) add(1.1, 0.12, 0.7, 0, 0.2, 1.3 + i * 0.85, wood);
  scene.add(g);
  DIVE.booth = g;
  const hud = document.createElement('div');
  hud.id = 'diveHud'; hud.className = 'hidden';
  hud.innerHTML = '<b>Powietrze</b><div class="bar"><i id="diveAir"></i></div><span id="diveLoot">Skarby: 0/10</span><em id="diveHintLine"><i id="diveArrow">➤</i> <b id="diveDist"></b></em>';
  document.body.appendChild(hud);
  DIVE.hud = hud;
  if (W.travel && !W.travel.some((t) => String(t[0]).includes('Nurkowanie'))) W.travel.splice(1, 0, ['🤿 Nurkowanie – zatopione skarby', DIVE_RENT.x, DIVE_RENT.z]);
}
function diveFoundCount() { return diveLoad().found.length; }
function diveJournalCard() {
  const n = diveFoundCount();
  const card = document.createElement('div'); card.className = 'jCard';
  const h = document.createElement('b'); h.textContent = 'Nurkowanie – zatopione skarby'; card.appendChild(h);
  const who = document.createElement('div'); who.className = 'jWho'; who.textContent = 'Wypożyczalnia · plaża Jeziora Tarnobrzeskiego'; card.appendChild(who);
  const rec = document.createElement('div'); rec.className = 'jPay'; rec.textContent = 'Skarby: ' + n + '/10'; card.appendChild(rec);
  const p = document.createElement('p'); p.textContent = 'Zejdź pod wodę przy budce na plaży. Wynurz się tam, żeby schować łup do kasy.'; card.appendChild(p);
  const btns = document.createElement('div'); btns.className = 'jBtns';
  const gps = document.createElement('button'); gps.type = 'button'; gps.textContent = 'GPS';
  gps.onclick = () => {
    navSet(DIVE_RENT.x, DIVE_RENT.z, 'Nurkowanie – zatopione skarby', { src: 'place' });
    closeJournal(); toast('GPS: Nurkowanie', 1400);
  };
  btns.appendChild(gps); card.appendChild(btns);
  return card;
}
function drawDiveIcon(g, r) {
  g.beginPath(); g.arc(0, 0, r, 0, 7); g.fillStyle = '#1a8a9a'; g.fill();
  g.lineWidth = Math.max(2, r * 0.16); g.strokeStyle = '#2a211c'; g.stroke();
  g.strokeStyle = '#fff'; g.lineWidth = Math.max(1.6, r * 0.14); g.lineCap = 'round'; g.lineJoin = 'round';
  g.beginPath(); g.arc(0, -r * 0.22, r * 0.2, 0, 7); g.stroke();
  g.beginPath(); g.moveTo(0, -r * 0.02); g.lineTo(0, r * 0.46); g.stroke();
  g.beginPath(); g.moveTo(-r * 0.4, r * 0.16); g.lineTo(0, r * 0.46); g.lineTo(r * 0.4, r * 0.16); g.stroke();
}
function diveHint() {
  if (G.diving || G.mode !== 'foot') return '';
  if (Math.hypot(player.x - DIVE_RENT.x, player.z - DIVE_RENT.z) > 4.6) return '';
  return (isTouch ? 'Dotknij NURKUJ' : 'E') + ': nurkowanie w jeziorze';
}
function diveNearRent() { return Math.hypot(DIVE.x - DIVE_RENT.x, DIVE.z - DIVE_RENT.z) < 16 && DIVE.y > -1.6; }
function diveAction() {
  if (G.diving) return diveTryExit();
  if (G.mode !== 'foot' || Math.hypot(player.x - DIVE_RENT.x, player.z - DIVE_RENT.z) > 4.6) return false;
  diveStart();
  return true;
}
function diveSandY(x, z) {
  return -7.6 + Math.sin(x * 0.16) * Math.cos(z * 0.13) * 0.45 + Math.sin(x * 0.05 + z * 0.04) * 0.28;
}
function makeDiver() {
  const g = new THREE.Group();
  const suit = mkMat({ color: 0x17657c }), dark = mkMat({ color: 0x142028 }), skin = mkMat({ color: 0xf0c9a0 }), yel = mkMat({ color: 0xf0c431 }), finC = mkMat({ color: 0x2a211c });
  const box = (w, h, d, mat) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  const body = box(0.46, 0.34, 0.9, suit); g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), skin); head.position.set(0, 0.02, 0.58); g.add(head);
  const mask = box(0.3, 0.14, 0.08, dark); mask.position.set(0, 0.04, 0.74); g.add(mask);
  const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.5, 8), yel); tank.rotation.x = Math.PI / 2; tank.position.set(0, 0.24, -0.02); g.add(tank);
  const armL = new THREE.Group(); armL.position.set(-0.3, 0, 0.18);
  const armR = new THREE.Group(); armR.position.set(0.3, 0, 0.18);
  const arm = box(0.12, 0.12, 0.48, suit); arm.position.z = 0.2; armL.add(arm); armR.add(arm.clone());
  g.add(armL); g.add(armR);
  const legL = new THREE.Group(); legL.position.set(-0.12, 0, -0.42);
  const legR = new THREE.Group(); legR.position.set(0.12, 0, -0.42);
  const thigh = box(0.14, 0.14, 0.42, suit); thigh.position.z = -0.18;
  legL.add(thigh); legR.add(thigh.clone());
  const finL = box(0.26, 0.05, 0.32, finC); finL.position.set(0, 0, -0.46); legL.add(finL);
  const finR = finL.clone(); legR.add(finR);
  g.add(legL); g.add(legR);
  return { g, armL, armR, legL, legR };
}
function diveEnsureWorld() {
  if (DIVE.world) return;
  const root = new THREE.Group(); root.visible = false; root.frustumCulled = false;
  const rnd = diveRnd(11);
  const geo = new THREE.PlaneGeometry(86, 86, 16, 16); geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) pos.setY(i, diveSandY(pos.getX(i), pos.getZ(i)) + 7.6);
  geo.computeVertexNormals(); geo.computeBoundingSphere();
  const sand = new THREE.Mesh(geo, mkMat({ color: 0xe4c98a })); sand.position.y = -7.6; sand.frustumCulled = false; root.add(sand);
  const rim = new THREE.Mesh(new THREE.RingGeometry(40, 43, 28).rotateX(-Math.PI / 2), mkMat({ color: 0x2a211c })); rim.position.y = -7.35; root.add(rim);
  const rockG = new THREE.DodecahedronGeometry(0.7, 0);
  const nRock = settings.quality === 'low' ? 22 : 34;
  const rocks = new THREE.InstancedMesh(rockG, mkMat({ color: 0x8a7360 }), nRock); rocks.frustumCulled = false;
  const dummy = new THREE.Object3D();
  for (let i = 0; i < nRock; i++) {
    const a = rnd() * 6.28, r = i < 6 ? 4 + rnd() * 10 : 8 + rnd() * 32;
    const x = Math.cos(a) * r, z = Math.sin(a) * r + 8;
    dummy.position.set(x, diveSandY(x, z) + 0.35, z);
    dummy.scale.set(0.7 + rnd() * 1.3, 0.45 + rnd() * 0.7, 0.7 + rnd() * 1.2);
    dummy.rotation.set(0, rnd() * 6, rnd() * 0.4);
    dummy.updateMatrix(); rocks.setMatrixAt(i, dummy.matrix);
  }
  root.add(rocks);
  DIVE.weeds = [];
  const nWeed = settings.quality === 'low' ? 16 : 24;
  for (let i = 0; i < nWeed; i++) {
    const a = rnd() * 6.28, r = 3 + rnd() * 34, x = Math.cos(a) * r, z = Math.sin(a) * r + 6;
    const w = new THREE.Mesh(new THREE.ConeGeometry(0.28, 1.6 + rnd() * 1.1, 5), mkMat({ color: i % 2 ? 0x2f8f48 : 0x3aaa55 }));
    w.position.set(x, diveSandY(x, z) + 0.7, z); w.userData.base = w.rotation.z; root.add(w); DIVE.weeds.push(w);
  }
  DIVE.fish = [];
  for (let i = 0; i < 6; i++) {
    const f = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.22, 0.55), mkMat({ color: i % 2 ? 0xf0a24a : 0xf4f1ea }));
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.22, 0.18), mkMat({ color: 0x2a211c })); tail.position.z = -0.34;
    f.add(body); f.add(tail); root.add(f);
    DIVE.fish.push({ g: f, tail, a: rnd() * 6, r: 6 + rnd() * 18, y: -3.2 - rnd() * 2.4, sp: 0.35 + rnd() * 0.4 });
  }
  const nCaust = settings.quality === 'low' ? 5 : 8;
  DIVE.caust = [];
  for (let i = 0; i < nCaust; i++) {
    const a = rnd() * 6.28, r = 4 + rnd() * 28, x = Math.cos(a) * r, z = Math.sin(a) * r + 10;
    const c = new THREE.Mesh(new THREE.CircleGeometry(1.4 + rnd(), 8).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xd8fff2, transparent: true, opacity: 0.22, depthWrite: false }));
    c.position.set(x, diveSandY(x, z) + 0.2, z); root.add(c); DIVE.caust.push(c);
  }
  const surf = new THREE.Mesh(new THREE.CircleGeometry(70, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x3aa8c4, transparent: true, opacity: 0.38, depthWrite: false, side: THREE.DoubleSide }));
  surf.position.y = -0.35; root.add(surf);
  const bubG = new THREE.SphereGeometry(0.16, 6, 5);
  const bubbles = new THREE.InstancedMesh(bubG, new THREE.MeshBasicMaterial({ color: 0xe8fff8, transparent: true, opacity: 0.7, depthWrite: false }), 12);
  bubbles.instanceMatrix.setUsage(THREE.DynamicDrawUsage); bubbles.frustumCulled = false; root.add(bubbles);
  const diver = makeDiver();
  root.add(diver.g);
  scene.add(root);
  DIVE.world = root; DIVE.rig = diver.g; DIVE.diver = diver; DIVE.bubbles = bubbles; DIVE.bub = [];
  for (let i = 0; i < 12; i++) DIVE.bub.push({ a: rnd() * 6, r: 0.3 + rnd(), y: rnd() * 2.4 });
  DIVE.loot = [];
  DIVE.fogA = new THREE.Color(0x1f8f90); DIVE.fogB = new THREE.Color(0x06343c);
}
function divePlaceLoot() {
  const save = diveLoad();
  if (save.found.length >= DIVE_LOOT.length) { save.found = []; save.seed = (save.seed + 5) % 997 || 5; save.week = Date.now(); diveSave(save); toast('Dno znowu kryje skarby.', 2200); }
  const rnd = diveRnd(save.seed);
  const found = new Set(save.found);
  for (const old of DIVE.loot) DIVE.world.remove(old.mesh);
  DIVE.loot = [];
  for (const def of DIVE_LOOT) {
    const mesh = new THREE.Group();
    const body = new THREE.Mesh(def.id === 'skrzynia' || def.id === 'kotwica' ? new THREE.BoxGeometry(0.7, 0.45, 0.5) : new THREE.SphereGeometry(0.28, 8, 6), mkMat({ color: def.pay > 140 ? 0xe2a122 : 0xf4f1ea, emissive: 0xf6c431, emissiveIntensity: 0.35 }));
    mesh.add(body);
    const x = def.dx + (rnd() - 0.5) * 5, z = def.dz + (rnd() - 0.5) * 5;
    mesh.position.set(x, diveSandY(x, z) + 0.35, z);
    mesh.visible = !found.has(def.id);
    DIVE.world.add(mesh);
    DIVE.loot.push({ ...def, x, z, mesh, got: found.has(def.id) });
  }
}
function diveStart() {
  diveEnsureWorld();
  divePlaceLoot();
  DIVE.on = true; G.diving = true; DIVE.bag = []; DIVE.o2 = DIVE_O2; DIVE.t = 0; DIVE.pitch = -0.35; DIVE.vy = 0;
  DIVE.x = DIVE_RENT.x; DIVE.y = -4.2; DIVE.z = DIVE_RENT.z + 8;
  DIVE.world.position.set(DIVE_RENT.x, 0, DIVE_RENT.z);
  DIVE.world.visible = true;
  player.mesh.visible = false;
  DIVE.hid = cars.filter((c) => c.g.visible).map((c) => c);
  if (W.chunkGroup) W.chunkGroup.visible = false;
  if (W.treeGroup) W.treeGroup.visible = false;
  if (W.ground) W.ground.visible = false;
  if (DIVE.booth) DIVE.booth.visible = false;
  if (typeof sky !== 'undefined' && sky) sky.visible = false;
  for (const c of cars) c.g.visible = false;
  if (TR && TR.pedMesh) TR.pedMesh.visible = false;
  scene.fog = new THREE.Fog(0x14686c, 5, settings.quality === 'low' ? 28 : 42);
  DIVE.bg = scene.background; scene.background = scene.fog.color;
  $('touch').classList.add('dive');
  $('street').style.visibility = 'hidden';
  const mh = $('mhud'); DIVE.mhudOn = mh && !mh.classList.contains('hidden'); if (mh) mh.classList.add('hidden');
  DIVE.hud.classList.remove('hidden');
  if (document.pointerLockElement) document.exitPointerLock();
  toast('Nurkowanie. Wypłyń przy wypożyczalni, żeby schować skarby.', 2600);
  diveHud();
}
function diveHud() {
  const air = $('diveAir'); if (air) air.style.width = Math.max(0, DIVE.o2 / DIVE_O2 * 100) + '%';
  const n = diveLoad().found.length + DIVE.bag.length;
  const el = $('diveLoot'); if (el) el.textContent = 'Skarby: ' + n + '/' + DIVE_LOOT.length;
}
function diveTryExit() {
  if (!diveNearRent()) { toast('Wypłyń przy wypożyczalni, żeby oddać skarby.', 1800); return true; }
  diveBank();
  diveStop();
  return true;
}
function diveBank() {
  if (!DIVE.bag.length) { toast('Nic nie wyłowiłeś.', 1400); return; }
  const save = diveLoad();
  let pay = 0;
  for (const id of DIVE.bag) {
    if (!save.found.includes(id)) save.found.push(id);
    const def = DIVE_LOOT.find((q) => q.id === id);
    if (def) pay += def.pay;
  }
  save.week = save.week || Date.now();
  diveSave(save);
  DIVE.bag = [];
  if (pay) addMoney(pay, 'skarby z jeziora');
  toast('Kasa za skarby: +' + pay + ' zł', 2200);
}
function diveFail() {
  if (DIVE.fading) return;
  DIVE.fading = true; DIVE.bag = [];
  let el = $('diveFade');
  if (!el) { el = document.createElement('div'); el.id = 'diveFade'; document.body.appendChild(el); }
  el.textContent = 'Zabrakło powietrza! Skarby zostały na dnie.';
  el.classList.add('on');
  setTimeout(() => { diveStop(); el.classList.remove('on'); DIVE.fading = false; }, 700);
}
function diveStop() {
  DIVE.on = false; G.diving = false;
  if (DIVE.world) DIVE.world.visible = false;
  const x = DIVE_RENT.x + 2.4, z = DIVE_RENT.z - 2.6;
  player.x = x; player.z = z; player.y = groundH(x, z); player.vy = 0; player.onGround = true; player.h = Math.PI; player.speed = 0;
  player.mesh.visible = true; player.mesh.rotation.set(0, player.h, 0); player.mesh.position.set(x, player.y, z);
  G.mode = 'foot'; G.yaw = player.h; G.pitch = -0.22;
  if (W.chunkGroup) W.chunkGroup.visible = true;
  if (W.treeGroup) W.treeGroup.visible = true;
  if (W.ground) W.ground.visible = true;
  if (DIVE.booth) DIVE.booth.visible = true;
  if (typeof sky !== 'undefined' && sky) sky.visible = true;
  $('street').style.visibility = '';
  const mh = $('mhud'); if (mh && DIVE.mhudOn) mh.classList.remove('hidden');
  if (TR && TR.pedMesh) TR.pedMesh.visible = true;
  for (const c of DIVE.hid || []) if (c.g) c.g.visible = true;
  DIVE.hid = [];
  scene.background = DIVE.bg || null;
  if (typeof applyFog === 'function') applyFog();
  $('touch').classList.remove('dive');
  DIVE.hud.classList.add('hidden');
  updateVisibility(true);
}
function updateDive(dt) {
  if (!DIVE.on || G.paused) return;
  const { f, s } = inputAxes();
  const run = G.keys.has('ShiftLeft') || G.keys.has('ShiftRight') || G.touch.run;
  const spd = (run ? 6.2 : 4.2) * Math.min(1, Math.hypot(f, s) || (f || s ? 1 : 0));
  let mx = 0, mz = 0;
  if (Math.abs(f) + Math.abs(s) > 0.08) {
    const yaw = G.yaw, fx = Math.sin(yaw), fz = Math.cos(yaw), rx = -Math.cos(yaw), rz = Math.sin(yaw);
    mx = fx * f + rx * s; mz = fz * f + rz * s;
    const ml = Math.hypot(mx, mz) || 1; mx = mx / ml * spd; mz = mz / ml * spd;
    const th = Math.atan2(mx, mz); let dh = th - player.h; dh = Math.atan2(Math.sin(dh), Math.cos(dh)); player.h += dh * Math.min(1, dt * 8);
  }
  let vy = 0;
  if (G.keys.has('Space') || G.touch.diveUp) vy += 2.6;
  if (G.keys.has('KeyC') || G.touch.diveDown) vy -= 2.6;
  DIVE.vy = vy;
  DIVE.x += mx * dt; DIVE.z += mz * dt; DIVE.y += vy * dt;
  const rr = Math.hypot(DIVE.x - DIVE_RENT.x, DIVE.z - DIVE_RENT.z);
  if (rr > 70) { const k = 70 / rr; DIVE.x = DIVE_RENT.x + (DIVE.x - DIVE_RENT.x) * k; DIVE.z = DIVE_RENT.z + (DIVE.z - DIVE_RENT.z) * k; }
  DIVE.y = Math.max(-7.15, Math.min(-0.7, DIVE.y));
  player.x = DIVE.x; player.z = DIVE.z;
  DIVE.o2 -= dt * (run && spd > 1 ? 1.35 : 1);
  if (DIVE.o2 <= 0) { diveFail(); return; }
  const bob = (spd < 0.4 ? Math.sin(DIVE.t * 1.6) * 0.08 : 0);
  DIVE.rig.position.set(DIVE.x - DIVE_RENT.x, DIVE.y + bob, DIVE.z - DIVE_RENT.z);
  DIVE.rig.rotation.y = player.h;
  const kick = Math.sin(DIVE.t * (spd > 0.4 ? 8 : 2.2)) * (spd > 0.4 ? 0.7 : 0.18);
  const dv = DIVE.diver;
  if (dv) { dv.legL.rotation.x = kick; dv.legR.rotation.x = -kick; dv.armL.rotation.x = -kick * 0.6; dv.armR.rotation.x = kick * 0.6; dv.g.rotation.x = -DIVE.vy * 0.12; }
  DIVE.t += dt;
  if (DIVE.weeds) for (let i = 0; i < DIVE.weeds.length; i++) DIVE.weeds[i].rotation.z = Math.sin(DIVE.t * 1.4 + i) * 0.28;
  if (DIVE.fish) for (const f of DIVE.fish) {
    f.a += dt * f.sp; f.g.position.set(Math.cos(f.a) * f.r, f.y, Math.sin(f.a) * f.r + 12); f.g.rotation.y = -f.a + Math.PI / 2;
    if (f.tail) f.tail.rotation.y = Math.sin(DIVE.t * 8 + f.a) * 0.5;
  }
  if (DIVE.caust) for (let i = 0; i < DIVE.caust.length; i++) DIVE.caust[i].material.opacity = 0.12 + Math.abs(Math.sin(DIVE.t * 1.3 + i)) * 0.2;
  const depth = Math.min(1, Math.max(0, (-DIVE.y - 0.7) / 6));
  if (scene.fog && DIVE.fogA) { scene.fog.color.copy(DIVE.fogA).lerp(DIVE.fogB, depth); if (scene.background && scene.background.isColor) scene.background.copy(scene.fog.color); }
  $('touch').classList.toggle('dive-exit', diveNearRent());
  let near = null, nd = 1e9;
  for (const item of DIVE.loot) {
    if (item.got) continue;
    item.mesh.rotation.y += dt;
    const gy = diveSandY(item.x, item.z) + 0.35 + Math.sin(DIVE.t * 2 + item.x) * 0.12;
    item.mesh.position.y = gy;
    if (item.mesh.children[0] && item.mesh.children[0].material) item.mesh.children[0].material.emissiveIntensity = 0.45 + Math.sin(DIVE.t * 5 + item.z) * 0.35;
    const d = Math.hypot(DIVE.x - (DIVE_RENT.x + item.x), DIVE.z - (DIVE_RENT.z + item.z));
    if (d < nd) { nd = d; near = item; }
    if (d < 2.4 && Math.abs(DIVE.y - gy) < 2.2) {
      item.got = true; item.mesh.visible = false; DIVE.bag.push(item.id);
      divePop('+' + item.pay + ' zł');
      if (typeof sfxCoin === 'function') sfxCoin();
      if (typeof emitPart === 'function' && typeof DRV !== 'undefined' && DRV.sparks) {
        for (let k = 0; k < 8; k++) { const a = Math.random() * 6.28; emitPart(DRV.sparks, DIVE.x, DIVE.y, DIVE.z, Math.cos(a) * 2, 1.5, Math.sin(a) * 2, 0.35, 0.2, 0.05, '#ffe14a', 1, 4, 1); }
      }
      toast(item.name, 1200);
    }
  }
  const arrow = $('diveArrow'), dist = $('diveDist');
  if (arrow && near) {
    const ang = Math.atan2((DIVE_RENT.x + near.x) - DIVE.x, (DIVE_RENT.z + near.z) - DIVE.z) - player.h;
    arrow.style.transform = 'rotate(' + ang + 'rad)';
    if (dist) dist.textContent = Math.round(nd) + ' m';
  }
  const dummy = DIVE._d || (DIVE._d = new THREE.Object3D());
  for (let i = 0; i < DIVE.bub.length; i++) {
    const b = DIVE.bub[i]; b.y += dt * (0.7 + (i % 3) * 0.2); if (b.y > 3.2) b.y = 0;
    const lx = DIVE.x - DIVE_RENT.x, lz = DIVE.z - DIVE_RENT.z;
    dummy.position.set(lx + Math.cos(b.a) * b.r, DIVE.y + 0.3 + b.y, lz + Math.sin(b.a) * b.r);
    dummy.scale.setScalar(0.7 + b.y * 0.15);
    dummy.updateMatrix(); DIVE.bubbles.setMatrixAt(i, dummy.matrix);
  }
  DIVE.bubbles.instanceMatrix.needsUpdate = true;
  diveHud();
}
function divePop(text) {
  const el = document.createElement('div'); el.className = 'divePop'; el.textContent = text; document.body.appendChild(el);
  setTimeout(() => { if (el.parentNode) el.parentNode.removeChild(el); }, 900);
}
function diveCamera() {
  DIVE.pitch = (DIVE.pitch || -0.35) + (((DIVE.vy || 0) * -0.22) - (DIVE.pitch || 0)) * 0.12;
  const dist = 4.6, lift = 1.25;
  const px = DIVE.x - Math.sin(G.yaw) * dist, pz = DIVE.z - Math.cos(G.yaw) * dist;
  camera.position.set(px, DIVE.y + lift, pz);
  camera.lookAt(DIVE.x + Math.sin(G.yaw) * 3, DIVE.y + 0.15 + DIVE.pitch * 2.4, DIVE.z + Math.cos(G.yaw) * 3);
}
