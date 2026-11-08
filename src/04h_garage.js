
// ======================= GARAŻE: WŁASNE AUTA, SALON, TUNING, LAKIER =======================
const MODELS = {
  hatch: { n: 'Kropka', d: 'Mały hatchback – tani, zwinny, ale delikatny', price: 800, maxv: 42, acc: 12, brk: 27, grip: 9.6, steer: 0.6, armor: 1.0, pitch: 1.25, gears: 5, col: 0xf6c431 },
  sedan: { n: 'Leliwa', d: 'Rodzinny sedan – solidny wszechstronniak', price: 2500, maxv: 48, acc: 13.5, brk: 28, grip: 9, steer: 0.55, armor: 0.85, pitch: 1.0, gears: 5, col: 0x3d8fe0 },
  jeep: { n: 'Kosynier 4×4', d: 'Terenówka – twarda i nie boi się błota', price: 4500, maxv: 43, acc: 14.5, brk: 26, grip: 8.6, steer: 0.52, armor: 0.7, pitch: 0.78, gears: 5, col: 0x45b65a },
  sport: { n: 'Siarka GT', d: 'Sportowe coupé – szybkie i przyczepne', price: 8000, maxv: 60, acc: 19, brk: 34, grip: 11, steer: 0.58, armor: 1.0, pitch: 1.4, gears: 6, col: 0xe8503a },
  muscle: { n: 'Interceptor', d: 'Muscle car à la radiowóz – ciężki taran z V8', price: 12000, maxv: 56, acc: 17.5, brk: 30, grip: 9.6, steer: 0.54, armor: 0.62, pitch: 0.68, gears: 5, col: 0x23262e },
};
const UPG = {
  engine: { n: 'Silnik', ic: '⚙️', max: 3, price: [600, 1400, 2800], d: '+6% prędkości maks., +12% przyspieszenia' },
  brakes: { n: 'Hamulce', ic: '🛑', max: 3, price: [300, 700, 1500], d: '+15% siły hamowania' },
  grip: { n: 'Opony i zawieszenie', ic: '🛞', max: 3, price: [400, 900, 1900], d: '+10% przyczepności, +4% skrętu' },
  armor: { n: 'Pancerz', ic: '🛡️', max: 3, price: [500, 1200, 2500], d: '−15% obrażeń za poziom' },
  nitro: { n: 'Nitro', ic: '🔥', max: 2, price: [1500, 3000], d: 'Shift / X / przycisk NITRO – zastrzyk mocy' },
};
const PAINTS = [0xe8503a, 0xf08a2c, 0xf6c431, 0x45b65a, 0x4fc3c8, 0x3d8fe0, 0x5a6b8c, 0xa66bd0, 0xe86fa0, 0xf4f1ea, 0x23262e, 0x8a5a3a];
const PAINT_PRICE = 100, REPAIR_PRICE = 50, GAR_CAP = 6;
const GAR = { places: [], open: null, tab: 'mine', own: null, ownLost: false, sel: 0 };
const hex = (c) => '#' + (c >>> 0).toString(16).padStart(6, '0');

function carStats(rec) {
  const M = MODELS[rec.model] || MODELS.sedan, u = rec.up || {};
  const L = (k) => u[k] || 0;
  return {
    maxv: M.maxv * (1 + 0.06 * L('engine')), acc: M.acc * (1 + 0.12 * L('engine')), brk: M.brk * (1 + 0.15 * L('brakes')),
    grip: M.grip * (1 + 0.1 * L('grip')), steer: M.steer * (1 + 0.04 * L('grip')), armor: M.armor * (1 - 0.15 * L('armor')),
    nitro: L('nitro'), nboost: L('nitro') >= 2 ? 1.35 : 1.25, ncap: L('nitro') >= 2 ? 5 : 3.2, pitch: M.pitch, gears: M.gears,
  };
}
// ---- save migration (v1 → v2: garage, stats). Old saves keep money + finished missions.
function migrateSave() {
  if (typeof SAVE.money !== 'number' || !isFinite(SAVE.money)) SAVE.money = 100;
  if (!SAVE.done || typeof SAVE.done !== 'object') SAVE.done = {};
  if (!SAVE.best || typeof SAVE.best !== 'object') SAVE.best = {};
  const old = !SAVE.v || SAVE.v < 2;
  if (!SAVE.garage || !Array.isArray(SAVE.garage.cars)) SAVE.garage = { cars: [], sel: 0, next: 1 };
  const g = SAVE.garage; g.next = Math.max(1, g.next | 0);
  g.cars = g.cars.filter((r) => r && MODELS[r.model]).slice(0, GAR_CAP);
  for (const r of g.cars) {
    const up = r.up && typeof r.up === 'object' ? r.up : {}; r.up = {};
    for (const k in UPG) r.up[k] = Math.max(0, Math.min(UPG[k].max, Math.round(+up[k] || 0)));
    if (typeof r.color !== 'number') r.color = MODELS[r.model].col;
    if (!r.uid) r.uid = g.next++; else g.next = Math.max(g.next, r.uid + 1);
  }
  if (!g.cars.length) g.cars.push({ uid: g.next++, model: 'hatch', color: MODELS.hatch.col, up: { engine: 0, brakes: 0, grip: 0, armor: 0, nitro: 0 }, starter: true });
  if (!g.cars.some((r) => r.uid === g.sel)) g.sel = g.cars[0].uid;
  SAVE.stats = Object.assign({ driftBest: 0, driftCash: 0, jumps: 0, jumpBest: 0, pickups: 0 }, SAVE.stats || {});
  if (!SAVE.claimed || typeof SAVE.claimed !== 'object' || Array.isArray(SAVE.claimed)) SAVE.claimed = {};
  if (typeof SAVE.tut !== 'number') SAVE.tut = 0;
  SAVE.v = 3; GAR.migrated = old; saveGame();
}
migrateSave();
const ownRec = (uid) => SAVE.garage.cars.find((r) => r.uid === uid) || null;

// ---- places, markers
function initGarages() {
  const defs = [{ n: 'Garaże', x: 934, z: 828 }, { n: 'Garaż przy Orlenie', x: -79, z: 1055 }];
  for (const d of defs) {
    const rp = nearestRoadPoint(d.x, d.z, true, 300); if (!rp) continue;
    const name = d.n + (rp.road.name ? ' – ' + rp.road.name : '');
    const rx = Math.cos(rp.h), rz = -Math.sin(rp.h), fx = Math.sin(rp.h), fz = Math.cos(rp.h);
    const p = { n: name, x: rp.x, z: rp.z, h: rp.h, px: rp.x + fx * 9, pz: rp.z + fz * 9, cool: false };
    const g = new THREE.Group(); g.position.set(p.x, groundH(p.x, p.z), p.z);
    const ring = new THREE.Mesh(new THREE.RingGeometry(4.2, 5.2, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x2fd0ff, transparent: true, opacity: 0.8, depthWrite: false })); ring.position.y = 0.22; g.add(ring);
    const ico = new THREE.Group(); ico.position.y = 4.4; g.add(ico);
    const wall = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.5, 1.8), mkMat({ color: 0xf4f1ea })); ico.add(wall);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(1.75, 0.8, 4).rotateY(Math.PI / 4), mkMat({ color: 0x2fd0ff })); roof.scale.z = 0.75; roof.position.y = 1.15; ico.add(roof);
    for (const s of [-1, 1]) { const door = new THREE.Mesh(new THREE.BoxGeometry(1.7, 1.1, 0.05), mkMat({ color: 0x5a6b8c })); door.position.set(0, -0.15, s * 0.92); ico.add(door); }
    const lab = labelSprite('🔧 GARAŻ', '#2fd0ff', 5); lab.position.y = 7.2; g.add(lab);
    scene.add(g); p.g = g; p.ring = ring; p.ico = ico; GAR.places.push(p);
    W.travel.push(['🔧 ' + name, p.x + rx * 3, p.z + rz * 3]);
  }
  PLACES.garages = GAR.places;
  buildGarageUi();
  if (GAR.migrated) setTimeout(() => toast('Nowość: 🔧 garaże! Kupuj auta i tuninguj je (niebieskie punkty na mapie)', 4200), 4000);
}
function nearGarage(r = 7) { const f = focusXZ(); return GAR.places.find((p) => Math.hypot(p.x - f.x, p.z - f.z) < r) || null; }
function garageHint() {
  const p = nearGarage(9); if (!p || GAR.open) return null;
  if (WANT.stars) return p.n + ': policja na ogonie – najpierw ją zgub!';
  return '🔧 ' + p.n + (G.mode === 'car' ? ': zatrzymaj się w kółku (E)' : ': naciśnij ' + (isTouch ? 'AKCJA' : 'E') + ' – twoje auta i tuning');
}
function garageAction() { const p = nearGarage(9); if (!p || G.cut) return false; if (WANT.stars) { toast('Garaż zamknięty, dopóki ściga cię policja!', 1800); return true; } garageOpen(p); return true; }
function updateGarages(dt) {
  const t = performance.now() * 0.003;
  for (const p of GAR.places) { p.ring.material.opacity = 0.5 + 0.35 * Math.sin(t); p.ico.rotation.y += dt * 0.8; p.ico.position.y = 4.4 + Math.sin(t * 0.7) * 0.25; }
  // own car lost (wrecked) → insurance brings it back to the garage
  const o = GAR.own;
  if (o && (o.wrecked || GAR.ownLost) && o !== activeCar && !G.cut) { removeOwn(); toast('Ubezpieczenie: twoje auto wróciło do garażu (naprawione) 🔧', 3000); }
  const p = nearGarage(6);
  if (!p) { for (const q of GAR.places) q.cool = false; return; }
  if (G.mode === 'car' && activeCar.speed < 2 && !p.cool && !G.cut && !WANT.stars && !(MIS.active && MIS.active.id === 'steal')) { p.cool = true; garageOpen(p); }
}
function drawGarageMinimap(g, sc) {
  for (const p of GAR.places) {
    g.fillStyle = '#2fd0ff'; g.fillRect(p.x - 7 / sc, p.z - 6 / sc, 14 / sc, 12 / sc); g.strokeRect(p.x - 7 / sc, p.z - 6 / sc, 14 / sc, 12 / sc);
    g.fillStyle = '#2a211c'; g.font = 'bold ' + (10 / sc) + 'px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('G', p.x, p.z + 0.5 / sc);
  }
  const o = GAR.own; if (o && o !== activeCar) { g.fillStyle = '#7dff7a'; g.beginPath(); g.arc(o.x, o.z, 6 / sc, 0, 7); g.fill(); g.stroke(); }
}

// ---- spawning / storing own cars
function applyOwn(c, rec) { c.own = rec; c.st = carStats(rec); c.nf = 1; c.hp = 100; }
function removeOwn() {
  const c = GAR.own; GAR.own = null; GAR.ownLost = false; if (!c) return;
  if (c === activeCar) leaveCarQuiet();
  const i = cars.indexOf(c); if (i >= 0) cars.splice(i, 1); scene.remove(c.g); c.g.visible = false; c.x = 0; c.z = -99999; if (c.geo && c.geo.dispose) c.geo.dispose();
}
function leaveCarQuiet() { const c = activeCar; if (!c) return; c.vx = c.vz = 0; enterExit(); }
function enterCarDirect(c) {
  if (G.mode === 'car') leaveCarQuiet();
  activeCar = c; G.mode = 'car'; player.mesh.visible = false; G.yaw = c.h; c.vx = c.vz = 0;
  $('speedo').classList.remove('hidden'); $('touch').classList.add('incar'); $('tEnter').textContent = 'WYSIĄDŹ';
}
function spawnOwn(rec, p) {
  if (GAR.own) removeOwn();
  // whatever car we came with is parked a bit further down the road
  if (G.mode === 'car' && activeCar) { const c = activeCar; leaveCarQuiet(); const [x, z] = findFree(p.px, p.pz, 2.4); c.x = x; c.z = z; c.h = p.h; c.vx = c.vz = 0; c.sync(); }
  const c = new Car(scene, rec.color, p.x, p.z, p.h, { model: rec.model }); applyOwn(c, rec); cars.push(c); GAR.own = c;
  SAVE.garage.sel = rec.uid; saveGame(); enterCarDirect(c); return c;
}
function storeCurrent() { // park the own car you arrived in
  if (!GAR.own || GAR.own !== activeCar) return false; removeOwn(); toast('Auto zaparkowane w garażu 🅿️', 1600); return true;
}
function keepStolen() {
  const c = activeCar;
  if (!c || G.mode !== 'car' || c.own || c.police || c.scooter || c.mission || c === EGG.jeep || c.wrecked) return toast('Tego auta nie da się wstawić do garażu', 1800), false;
  if (SAVE.garage.cars.length >= GAR_CAP) return toast('Garaż pełny (' + GAR_CAP + ' aut) – sprzedaj coś', 1800), false;
  const g = SAVE.garage; const rec = { uid: g.next++, model: c.offroad ? 'jeep' : 'sedan', color: c.color, up: { engine: 0, brakes: 0, grip: 0, armor: 0, nitro: 0 }, stolen: true };
  g.cars.push(rec); leaveCarQuiet();
  if (c.fromPool) despawnCar(c); else { const i = cars.indexOf(c); if (i >= 0) cars.splice(i, 1); scene.remove(c.g); c.g.visible = false; }
  GAR.sel = rec.uid; saveGame(); toast('Auto trafia do twojej kolekcji! 🚗', 2000); return true;
}
function sellCar(uid) {
  const g = SAVE.garage; const r = ownRec(uid); if (!r || g.cars.length <= 1) return false;
  const M = MODELS[r.model]; let val = r.stolen ? 300 : Math.round(M.price * 0.5);
  for (const k in UPG) for (let l = 0; l < (r.up[k] || 0); l++) val += Math.round(UPG[k].price[l] * 0.3);
  if (GAR.own && GAR.own.own === r) removeOwn();
  g.cars.splice(g.cars.indexOf(r), 1); if (g.sel === uid) g.sel = g.cars[0].uid; if (GAR.sel === uid) GAR.sel = g.cars[0].uid;
  addMoney(val, 'sprzedaż auta'); return val;
}
function buyModel(m) {
  const M = MODELS[m]; if (!M) return false; const g = SAVE.garage;
  if (g.cars.some((r) => r.model === m && !r.stolen)) { toast('Już masz to auto', 1400); return false; }
  if (g.cars.length >= GAR_CAP) { toast('Garaż pełny (' + GAR_CAP + ' aut)', 1600); return false; }
  if (SAVE.money < M.price) { toast('Za mało kasy – brakuje ' + (M.price - SAVE.money) + ' zł', 1800); return false; }
  const rec = { uid: g.next++, model: m, color: M.col, up: { engine: 0, brakes: 0, grip: 0, armor: 0, nitro: 0 } };
  g.cars.push(rec); GAR.sel = rec.uid; g.sel = rec.uid; addMoney(-M.price, 'nowe auto: ' + M.n); flash(); return rec;
}
function upgradeCar(uid, k) {
  const r = ownRec(uid), U = UPG[k]; if (!r || !U) return false; const l = r.up[k] || 0;
  if (l >= U.max) { toast('Maksymalny poziom', 1200); return false; }
  const price = U.price[l]; if (SAVE.money < price) { toast('Za mało kasy – brakuje ' + (price - SAVE.money) + ' zł', 1800); return false; }
  r.up[k] = l + 1; addMoney(-price, U.n + ' ' + (l + 1) + '/' + U.max);
  if (GAR.own && GAR.own.own === r) { const nf = GAR.own.nf; GAR.own.st = carStats(r); GAR.own.nf = nf === undefined ? 1 : nf; }
  return true;
}
function paintCar(uid, col) {
  const r = ownRec(uid); if (!r) return false; if (r.color === col) return false;
  if (SAVE.money < PAINT_PRICE) { toast('Za mało kasy na lakier', 1500); return false; }
  r.color = col; addMoney(-PAINT_PRICE, 'nowy lakier');
  if (GAR.own && GAR.own.own === r) { GAR.own.setPaint(col); GAR.own.color = col; }
  return true;
}
function repairActive() {
  const c = activeCar; if (!c || G.mode !== 'car' || c.hp >= 99.5) return false;
  if (SAVE.money < REPAIR_PRICE) { toast('Za mało kasy na naprawę', 1500); return false; }
  c.hp = 100; c.burn = 0; addMoney(-REPAIR_PRICE, 'naprawa'); hpHud(); return true;
}
function ownWrecked(c) { if (c && c === GAR.own) GAR.ownLost = true; }

// ---- UI
function buildGarageUi() {
  const d = document.createElement('div'); d.id = 'garage'; d.className = 'cdialog hidden';
  d.innerHTML = '<div class="gHead"><h3 id="gTitle">🔧 Garaż</h3><div id="gCash" class="gCash"></div><button id="gX" class="sec gX" aria-label="Wyjdź">✕</button></div>' +
    '<div class="gTabs"><button data-t="mine">🚗 Moje auta</button><button data-t="shop">🏷️ Salon</button><button data-t="tune">🔧 Tuning</button><button data-t="paint">🎨 Lakier</button></div>' +
    '<div id="gBody" class="gBody"></div><div class="gFoot">' + (isTouch ? 'Stuknij ✕, by wyjść' : '1–4 zakładki · ←/→ wybór auta · Esc wyjście') + '</div>';
  document.body.appendChild(d);
  d.addEventListener('touchstart', (e) => e.stopPropagation(), { passive: true }); d.addEventListener('mousedown', (e) => e.stopPropagation());
  $('gX').onclick = () => garageClose();
  d.querySelectorAll('.gTabs button').forEach((b) => { b.onclick = () => { GAR.tab = b.dataset.t; garageRender(); }; });
  $('gBody').addEventListener('click', (e) => {
    const b = e.target.closest('[data-a]'); if (!b || b.disabled) return; const a = b.dataset.a, v = b.dataset.v; buzz(12);
    if (a === 'out') { const r = ownRec(+v); if (r) { spawnOwn(r, GAR.open); garageClose(); toast('Wyjeżdżasz: ' + carName(r) + ' 🚗', 1600); } return; }
    if (a === 'sel') { GAR.sel = +v; GAR.tab = 'tune'; }
    else if (a === 'selp') { GAR.sel = +v; GAR.tab = 'paint'; }
    else if (a === 'buy') { const r = buyModel(v); if (r) GAR.tab = 'mine'; }
    else if (a === 'up') upgradeCar(GAR.sel, v);
    else if (a === 'paint') paintCar(GAR.sel, +v);
    else if (a === 'fix') repairActive();
    else if (a === 'store') storeCurrent();
    else if (a === 'keep') keepStolen();
    else if (a === 'sell') { if (b.dataset.sure) sellCar(+v); else { b.dataset.sure = 1; b.textContent = 'Na pewno?'; return; } }
    else if (a === 'cyc') cycleSel(+v);
    garageRender();
  });
}
const carName = (r) => (MODELS[r.model] || MODELS.sedan).n + (r.stolen ? ' (z ulicy)' : '');
function cycleSel(dir) { const L = SAVE.garage.cars; let i = L.findIndex((r) => r.uid === GAR.sel); i = (i + dir + L.length) % L.length; GAR.sel = L[i].uid; }
function statBars(st) {
  const row = (n, k, txt) => '<div class="gStat"><span>' + n + '</span><i><b style="width:' + Math.round(Math.min(1, k) * 100) + '%"></b></i><em>' + txt + '</em></div>';
  return '<div class="gStats">' + row('Prędkość', st.maxv / 75, Math.round(st.maxv * 3.6) + ' km/h') + row('Przyspieszenie', st.acc / 28, (st.acc / 13).toFixed(2) + '×') +
    row('Hamulce', st.brk / 55, (st.brk / 28).toFixed(2) + '×') + row('Prowadzenie', st.grip / 15, (st.grip / 9).toFixed(2) + '×') + row('Wytrzymałość', 1 / st.armor / 3, (1 / st.armor).toFixed(1) + '×') +
    (st.nitro ? row('Nitro', st.nitro / 2, 'poz. ' + st.nitro) : '') + '</div>';
}
const pips = (l, m) => '<span class="gPips">' + '●'.repeat(l) + '<s>' + '○'.repeat(m - l) + '</s></span>';
function garageRender() {
  const p = GAR.open; if (!p) return; const T = GAR.tab, g = SAVE.garage, m = SAVE.money;
  $('gTitle').textContent = '🔧 ' + p.n; $('gCash').textContent = m + ' zł';
  document.querySelectorAll('#garage .gTabs button').forEach((b) => b.classList.toggle('on', b.dataset.t === T));
  if (!ownRec(GAR.sel)) GAR.sel = g.sel;
  let h = '';
  if (T === 'mine') {
    const inOwn = G.mode === 'car' && GAR.own && activeCar === GAR.own;
    if (G.mode === 'car' && activeCar && !activeCar.own && !activeCar.police && !activeCar.scooter && !activeCar.mission) h += '<div class="gNote">Przyjechałeś cudzym autem. <button data-a="keep">🅿️ Zatrzymaj je w garażu</button></div>';
    for (const r of g.cars) {
      const st = carStats(r), out = GAR.own && GAR.own.own === r; const lv = Object.keys(UPG).reduce((s, k) => s + (r.up[k] || 0), 0);
      h += '<div class="gCard' + (r.uid === GAR.sel ? ' sel' : '') + '"><div class="gCarHead"><span class="gSw" style="background:' + hex(r.color) + '"></span><b>' + carName(r) + '</b><small>' + (out ? (activeCar === GAR.own ? 'jedziesz nim' : 'stoi w mieście') : 'w garażu') + ' · tuning ' + lv + '</small></div>' + statBars(st) +
        '<div class="gBtns">' + (out && inOwn ? '<button data-a="store">🅿️ Zaparkuj tutaj</button>' : '<button data-a="out" data-v="' + r.uid + '">🚗 Wyjedź</button>') +
        '<button class="sec" data-a="sel" data-v="' + r.uid + '">🔧 Tuning</button><button class="sec" data-a="selp" data-v="' + r.uid + '">🎨</button>' +
        (g.cars.length > 1 ? '<button class="sec small" data-a="sell" data-v="' + r.uid + '">Sprzedaj</button>' : '') + '</div></div>';
    }
  } else if (T === 'shop') {
    for (const k in MODELS) {
      const M = MODELS[k], st = carStats({ model: k, up: {} }), has = g.cars.some((r) => r.model === k && !r.stolen);
      h += '<div class="gCard"><div class="gCarHead"><span class="gSw" style="background:' + hex(M.col) + '"></span><b>' + M.n + '</b><small>' + M.d + '</small></div>' + statBars(st) +
        '<div class="gBtns">' + (has ? '<button disabled>✔ Masz już</button>' : '<button data-a="buy" data-v="' + k + '"' + (m < M.price ? ' class="poor"' : '') + '>Kup – ' + M.price + ' zł</button>') + '</div></div>';
    }
  } else {
    const r = ownRec(GAR.sel); const st = carStats(r);
    h += '<div class="gSelBar"><button class="sec" data-a="cyc" data-v="-1">◀</button><div><span class="gSw" style="background:' + hex(r.color) + '"></span><b>' + carName(r) + '</b></div><button class="sec" data-a="cyc" data-v="1">▶</button></div>';
    if (T === 'tune') {
      h += statBars(st);
      for (const k in UPG) {
        const U = UPG[k], l = r.up[k] || 0, mx = l >= U.max, pr = mx ? 0 : U.price[l];
        h += '<div class="gUp"><div class="gUpL"><b>' + U.ic + ' ' + U.n + '</b> ' + pips(l, U.max) + '<small>' + U.d + '</small></div>' +
          (mx ? '<button disabled>MAX</button>' : '<button data-a="up" data-v="' + k + '"' + (m < pr ? ' class="poor"' : '') + '>Ulepsz – ' + pr + ' zł</button>') + '</div>';
      }
    } else {
      h += '<p class="gTxt">Nowy lakier: ' + PAINT_PRICE + ' zł</p><div class="gPal">' + PAINTS.map((c) => '<button class="gPaint' + (c === r.color ? ' on' : '') + '" data-a="paint" data-v="' + c + '" style="background:' + hex(c) + '" aria-label="kolor"></button>').join('') + '</div>';
      if (G.mode === 'car' && activeCar) h += '<div class="gNote">Stan auta, którym jedziesz: <b>' + Math.round(activeCar.hp) + '%</b> ' + (activeCar.hp < 99.5 ? '<button data-a="fix">🔧 Napraw – ' + REPAIR_PRICE + ' zł</button>' : '✔') + '</div>';
    }
  }
  $('gBody').innerHTML = h;
}
function garageOpen(p) {
  if (!p) p = GAR.places[0]; GAR.open = p; GAR.tab = GAR.tab || 'mine'; if (!ownRec(GAR.sel)) GAR.sel = SAVE.garage.sel;
  if (G.mode === 'car' && activeCar) { activeCar.vx = activeCar.vz = 0; }
  if (POL.shop) shopClose();
  G.paused = true; G.inGarage = true; if (document.pointerLockElement) document.exitPointerLock();
  if (typeof touchReset === 'function') touchReset();
  $('garage').classList.remove('hidden'); garageRender(); return true;
}
function garageClose() {
  if (!GAR.open) return; GAR.open.cool = true; GAR.open = null; G.inGarage = false; G.paused = false; clock.getDelta(); $('garage').classList.add('hidden');
}
function garageKey(code) {
  if (code === 'Escape' || code === 'KeyE') return garageClose();
  const tabs = { Digit1: 'mine', Digit2: 'shop', Digit3: 'tune', Digit4: 'paint' };
  if (tabs[code]) { GAR.tab = tabs[code]; garageRender(); }
  else if (code === 'ArrowLeft' || code === 'ArrowRight') { cycleSel(code === 'ArrowLeft' ? -1 : 1); garageRender(); }
}
