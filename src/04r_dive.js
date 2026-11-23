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
  const lab = labelSprite('NURKI', '#1a8a9a', 4.2); lab.position.set(0, 3.3, 0); g.add(lab);
  scene.add(g);
  DIVE.booth = g;
  const hud = document.createElement('div');
  hud.id = 'diveHud'; hud.className = 'hidden';
  hud.innerHTML = '<b>Powietrze</b><div class="bar"><i id="diveAir"></i></div><span id="diveLoot">Skarby: 0/10</span>';
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
function diveEnsureWorld() {
  if (DIVE.world) return;
  const root = new THREE.Group(); root.visible = false;
  const sand = new THREE.Mesh(new THREE.CircleGeometry(78, 28).rotateX(-Math.PI / 2), mkMat({ color: 0xd7c08a }));
  sand.position.y = -12.2; root.add(sand);
  const rnd = diveRnd(11);
  const rockG = new THREE.DodecahedronGeometry(1, 0);
  const rocks = new THREE.InstancedMesh(rockG, mkMat({ color: 0x8d7b66 }), 34);
  const weedG = new THREE.ConeGeometry(0.35, 2.2, 5);
  const weeds = new THREE.InstancedMesh(weedG, mkMat({ color: 0x2f8a4a }), 26);
  const dummy = new THREE.Object3D();
  for (let i = 0; i < 34; i++) {
    const a = rnd() * 6.28, r = 6 + rnd() * 62;
    dummy.position.set(Math.cos(a) * r, -12 + rnd() * 0.6, Math.sin(a) * r);
    dummy.scale.set(0.6 + rnd() * 1.4, 0.35 + rnd() * 0.8, 0.6 + rnd() * 1.3);
    dummy.rotation.set(rnd(), rnd(), rnd());
    dummy.updateMatrix(); rocks.setMatrixAt(i, dummy.matrix);
  }
  for (let i = 0; i < 26; i++) {
    const a = rnd() * 6.28, r = 4 + rnd() * 60;
    dummy.position.set(Math.cos(a) * r, -11.3, Math.sin(a) * r);
    dummy.scale.set(1, 0.7 + rnd() * 1.1, 1);
    dummy.rotation.set(0, rnd() * 6, 0);
    dummy.updateMatrix(); weeds.setMatrixAt(i, dummy.matrix);
  }
  rocks.castShadow = weeds.castShadow = false;
  root.add(rocks); root.add(weeds);
  if (settings.quality === 'high') {
    const ray = new THREE.Mesh(new THREE.ConeGeometry(3.2, 18, 5, 1, true), new THREE.MeshBasicMaterial({ color: 0xc6efe4, transparent: true, opacity: 0.08, depthWrite: false, side: THREE.DoubleSide }));
    for (let i = 0; i < 4; i++) { const m = ray.clone(); m.position.set((i - 1.5) * 14, -2, 10 + i * 8); m.rotation.x = 0.15; root.add(m); }
  }
  const bubG = new THREE.SphereGeometry(0.12, 6, 5);
  const bubbles = new THREE.InstancedMesh(bubG, new THREE.MeshBasicMaterial({ color: 0xd8fff4, transparent: true, opacity: 0.55, depthWrite: false }), 10);
  bubbles.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  root.add(bubbles);
  const rig = new THREE.Group();
  const sw = makeWalker({ comic: true, hairStyle: 'cap', shirt: 0x1a6a8a, jacket: 0xf6f1e4, pants: 0x243056 });
  const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.55, 8), mkMat({ color: 0xe7d7a2 }));
  tank.position.set(0, 1.15, -0.22); sw.add(tank);
  rig.add(sw);
  root.add(rig);
  scene.add(root);
  DIVE.world = root; DIVE.rig = rig; DIVE.swimmer = sw; DIVE.bubbles = bubbles; DIVE.bub = [];
  for (let i = 0; i < 10; i++) DIVE.bub.push({ a: rnd() * 6, r: 0.4 + rnd() * 0.8, y: rnd() * 3 });
  DIVE.loot = [];
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
    mesh.position.set(x, -10.6, z);
    mesh.visible = !found.has(def.id);
    DIVE.world.add(mesh);
    DIVE.loot.push({ ...def, x, z, mesh, got: found.has(def.id) });
  }
}
function diveStart() {
  diveEnsureWorld();
  divePlaceLoot();
  DIVE.on = true; G.diving = true; DIVE.bag = []; DIVE.o2 = DIVE_O2; DIVE.t = 0;
  DIVE.x = DIVE_RENT.x; DIVE.y = -1.2; DIVE.z = DIVE_RENT.z + 6;
  DIVE.world.position.set(DIVE_RENT.x, 0, DIVE_RENT.z);
  DIVE.world.visible = true;
  player.mesh.visible = false;
  DIVE.hid = cars.filter((c) => c.g.visible).map((c) => c);
  if (W.chunkGroup) W.chunkGroup.visible = false;
  if (W.treeGroup) W.treeGroup.visible = false;
  if (typeof sky !== 'undefined' && sky) sky.visible = false;
  for (const c of cars) c.g.visible = false;
  if (TR && TR.pedMesh) TR.pedMesh.visible = false;
  scene.fog = new THREE.Fog(0x1c6e68, 3.5, settings.quality === 'low' ? 22 : 32);
  DIVE.bg = scene.background; scene.background = new THREE.Color(0x145e58);
  $('touch').classList.add('dive');
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
  DIVE.bag = [];
  toast('Zabrakło powietrza! Skarby zostały na dnie.', 2600);
  diveStop();
}
function diveStop() {
  DIVE.on = false; G.diving = false;
  if (DIVE.world) DIVE.world.visible = false;
  player.mesh.visible = true;
  player.x = DIVE_RENT.x + 1.4; player.z = DIVE_RENT.z - 1.2; player.y = groundH(player.x, player.z); player.vy = 0; player.onGround = true; player.h = 0;
  G.mode = 'foot'; G.yaw = player.h;
  if (W.chunkGroup) W.chunkGroup.visible = true;
  if (W.treeGroup) W.treeGroup.visible = true;
  if (typeof sky !== 'undefined' && sky) sky.visible = true;
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
  if (G.keys.has('Space') || G.touch.diveUp) vy += 2.5;
  if (G.keys.has('KeyC') || G.touch.diveDown) vy -= 2.5;
  DIVE.x += mx * dt; DIVE.z += mz * dt; DIVE.y += vy * dt;
  const rr = Math.hypot(DIVE.x - DIVE_RENT.x, DIVE.z - DIVE_RENT.z);
  if (rr > 70) { const k = 70 / rr; DIVE.x = DIVE_RENT.x + (DIVE.x - DIVE_RENT.x) * k; DIVE.z = DIVE_RENT.z + (DIVE.z - DIVE_RENT.z) * k; }
  DIVE.y = Math.max(-12, Math.min(-0.45, DIVE.y));
  player.x = DIVE.x; player.z = DIVE.z;
  DIVE.o2 -= dt * (run && spd > 1 ? 1.35 : 1);
  if (DIVE.o2 <= 0) { diveFail(); return; }
  DIVE.rig.position.set(DIVE.x - DIVE_RENT.x, DIVE.y, DIVE.z - DIVE_RENT.z);
  DIVE.rig.rotation.y = player.h;
  if (typeof animateWalker === 'function') animateWalker(DIVE.swimmer, spd, dt, false);
  DIVE.t += dt;
  for (const item of DIVE.loot) {
    if (item.got) continue;
    item.mesh.rotation.y += dt;
    const bob = Math.sin(DIVE.t * 2 + item.x) * 0.15;
    item.mesh.position.y = -10.55 + bob;
    if (item.mesh.children[0] && item.mesh.children[0].material) item.mesh.children[0].material.emissiveIntensity = 0.25 + Math.sin(DIVE.t * 4 + item.z) * 0.2;
    if (Math.hypot(DIVE.x - (DIVE_RENT.x + item.x), DIVE.z - (DIVE_RENT.z + item.z)) < 2.6 && Math.abs(DIVE.y - item.mesh.position.y) < 2.4) {
      item.got = true; item.mesh.visible = false; DIVE.bag.push(item.id);
      toast(item.name + ' · +' + item.pay + ' zł po wynurzeniu', 1400);
    }
  }
  const dummy = DIVE._d || (DIVE._d = new THREE.Object3D());
  for (let i = 0; i < DIVE.bub.length; i++) {
    const b = DIVE.bub[i]; b.y += dt * (0.7 + (i % 3) * 0.2); if (b.y > 3.2) b.y = 0;
    dummy.position.set(Math.cos(b.a) * b.r, DIVE.y + 1.2 + b.y, Math.sin(b.a) * b.r);
    dummy.scale.setScalar(0.7 + b.y * 0.15);
    dummy.updateMatrix(); DIVE.bubbles.setMatrixAt(i, dummy.matrix);
  }
  DIVE.bubbles.instanceMatrix.needsUpdate = true;
  diveHud();
}
function diveCamera() {
  const dist = 5.2, y = DIVE.y - 0.2;
  const px = DIVE.x - Math.sin(G.yaw) * dist, pz = DIVE.z - Math.cos(G.yaw) * dist;
  camera.position.set(px, Math.max(-11.2, y + 1.5), pz);
  camera.lookAt(DIVE.x, DIVE.y + 0.8, DIVE.z);
}
