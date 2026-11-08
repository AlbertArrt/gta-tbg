
// ======================= HUD =======================
function updateStreet() {
  const x = G.mode === 'car' ? activeCar.x : player.x, z = G.mode === 'car' ? activeCar.z : player.z;
  let best = null, bd = 40; const s = W.roadGrid.s;
  W.roadGrid.query(x, z, 40, (i) => {
    const r = W.roads[W.roadGrid.meta[i]]; if (!r.name) return;
    closestOnSeg(x, z, s[i * 4], s[i * 4 + 1], s[i * 4 + 2], s[i * 4 + 3], tmpC);
    const d = Math.hypot(tmpC.x - x, tmpC.z - z) - r.width / 2; if (d < bd) { bd = d; best = r.name; }
  });
  if (W.off && inOffRect(x, z) && offMask(x, z) > 0.25 && (!best || bd > 3)) best = 'Trasy off-road · Jezioro Tarnobrzeskie';
  if (!best || bd > 6) { for (const t of W.travel) if (Math.hypot(t[1] - x, t[2] - z) < 55) { best = t[0]; break; } }
  if (!best) {
    let ln = null, ld = 1e18;
    for (const l of W.landmarks) { if (l[3] !== 'suburb' && l[3] !== 'quarter' && l[3] !== 'neighbourhood' && l[3] !== 'village' && l[3] !== 'hamlet') continue; const d = (l[1] - x) ** 2 + (l[2] - z) ** 2; if (d < ld) { ld = d; ln = l[0]; } }
    best = ln ? 'okolice: ' + ln : 'Tarnobrzeg';
  }
  if (best !== G.street) { G.street = best; $('street').textContent = best; }
}

const MM = {};
function initMinimap() {
  MM.c = $('minimap'); MM.g = MM.c.getContext('2d');
  // spatial grid of features for fast minimap drawing
  MM.cell = 120; MM.grid = new Map();
  const add = (x0, z0, x1, z1, item) => {
    for (let ix = Math.floor(x0 / MM.cell); ix <= Math.floor(x1 / MM.cell); ix++) for (let iz = Math.floor(z0 / MM.cell); iz <= Math.floor(z1 / MM.cell); iz++) {
      const k = ix * 100000 + iz; let a = MM.grid.get(k); if (!a) { a = []; MM.grid.set(k, a); } a.push(item);
    }
  };
  const bb = (p) => { let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9; for (let i = 0; i < p.length; i += 2) { x0 = Math.min(x0, p[i]); x1 = Math.max(x1, p[i]); z0 = Math.min(z0, p[i + 1]); z1 = Math.max(z1, p[i + 1]); } return [x0, z0, x1, z1]; };
  for (const w of W.water) { const b = bb(w.ring); add(...b, { t: 0, p: w.ring }); }
  for (const w of W.waterways) { const b = bb(w.pts); add(...b, { t: 1, p: w.pts, w: w.width }); }
  for (const f of W.forests) { const b = bb(f.ring); add(...b, { t: 5, p: f.ring }); }
  for (const r of W.roads) { if (r.type === 'footway' || r.type === 'path' || r.type === 'steps' || r.type === 'track') continue; const b = bb(r.pts); add(...b, { t: 2, p: r.pts, w: r.width, major: r.type === 'secondary' || r.type === 'tertiary' || r.type === 'primary' }); }
  for (const b of W.buildings) { const x = bb(b.ring); add(...x, { t: 3, p: b.ring }); }
}
function drawMinimap() {
  const g = MM.g, S = MM.c.width; const x = G.mode === 'car' ? activeCar.x : player.x, z = G.mode === 'car' ? activeCar.z : player.z;
  const R = G.mode === 'car' ? 320 : 170; const sc = S / 2 / R;
  g.setTransform(1, 0, 0, 1, 0, 0); g.fillStyle = '#a9bf8d'; g.fillRect(0, 0, S, S);
  const rot = G.yaw + Math.PI; // heading-up
  g.setTransform(1, 0, 0, 1, S / 2, S / 2); g.rotate(rot); g.scale(sc, sc); g.translate(-x, -z);
  // three.js z = south; canvas y = down = south. heading-up: rotate so forward points up.
  const seen = new Set(); const items = [[], [], [], [], [], []];
  for (let ix = Math.floor((x - R * 1.42) / MM.cell); ix <= Math.floor((x + R * 1.42) / MM.cell); ix++) for (let iz = Math.floor((z - R * 1.42) / MM.cell); iz <= Math.floor((z + R * 1.42) / MM.cell); iz++) {
    const a = MM.grid.get(ix * 100000 + iz); if (!a) continue; for (const it of a) { if (seen.has(it)) continue; seen.add(it); items[it.t].push(it); }
  }
  const poly = (p) => { g.beginPath(); g.moveTo(p[0], p[1]); for (let i = 2; i < p.length; i += 2) g.lineTo(p[i], p[i + 1]); };
  g.fillStyle = '#6d9a55'; for (const it of items[5]) { poly(it.p); g.closePath(); g.fill(); }
  g.fillStyle = '#5d8fc0'; for (const it of items[0]) { poly(it.p); g.closePath(); g.fill(); }
  g.strokeStyle = '#5d8fc0'; g.lineCap = 'round'; g.lineJoin = 'round'; for (const it of items[1]) { g.lineWidth = Math.max(it.w, 2 / sc); poly(it.p); g.stroke(); }
  g.fillStyle = '#c6b8a6'; for (const it of items[3]) { poly(it.p); g.closePath(); g.fill(); }
  for (const it of items[2]) { g.strokeStyle = it.major ? '#ffd76a' : '#ffffff'; g.lineWidth = Math.max(it.w * 1.2, 3 / sc); poly(it.p); g.stroke(); }
  drawEggMinimap(g, sc);
  if (typeof drawNavOverlay === 'function') drawNavOverlay(g, sc);
  // cars
  for (const c of cars) { if (c === activeCar || !c.g.visible || c.police) continue; g.fillStyle = c.mission ? '#ffd21f' : c.ai ? '#6c6c74' : '#d33'; g.save(); g.translate(c.x, c.z); g.rotate(-c.h); g.fillRect(-1.2, -2.3, 2.4, 4.6); g.restore(); }
  drawMissionMinimap(g, sc);
  g.setTransform(1, 0, 0, 1, 0, 0);
  // player arrow (always up), heading relative to camera yaw
  const ph = G.mode === 'car' ? activeCar.h : player.h; const rel = -(ph - G.yaw);
  g.save(); g.translate(S / 2, S / 2); g.rotate(rel); g.fillStyle = '#ff3b30'; g.strokeStyle = '#fff'; g.lineWidth = 2;
  g.beginPath(); g.moveTo(0, -10); g.lineTo(7, 8); g.lineTo(0, 4); g.lineTo(-7, 8); g.closePath(); g.fill(); g.stroke(); g.restore();
  $('compass').style.transform = `rotate(${rot}rad) translateY(-88px) rotate(${-rot}rad)`;
}

const SP = {};
function drawSpeedo() {
  if (!SP.g) SP.g = $('speedGauge').getContext('2d');
  const v = Math.round(Math.abs(activeCar.forwardSpeed) * 3.6);
  if (v === SP.last) return; SP.last = v; $('speedVal').textContent = v;
  const g = SP.g; g.clearRect(0, 0, 140, 140);
  const a0 = Math.PI * 0.75, a1 = Math.PI * 2.25;
  g.lineWidth = 9; g.lineCap = 'round'; g.strokeStyle = 'rgba(255,255,255,.18)'; g.beginPath(); g.arc(70, 70, 58, a0, a1); g.stroke();
  const t = Math.min(1, v / 180); g.strokeStyle = v > 120 ? '#ff5a3c' : (v > 60 ? '#ffc23c' : '#59d36a');
  g.beginPath(); g.arc(70, 70, 58, a0, a0 + (a1 - a0) * t); g.stroke();
}

// ---------- big map
const BM = {};
function initBigMap() {
  const [MINX, MINZ, MAXX, MAXZ] = W.rect; const w = MAXX - MINX, h = MAXZ - MINZ;
  const S = 1400 / Math.max(w, h); BM.s = S; BM.W = Math.round(w * S); BM.H = Math.round(h * S);
  const base = document.createElement('canvas'); base.width = BM.W; base.height = BM.H; const g = base.getContext('2d');
  g.fillStyle = '#b9cc9c'; g.fillRect(0, 0, BM.W, BM.H);
  g.setTransform(S, 0, 0, S, -MINX * S, -MINZ * S);
  const poly = (p) => { g.beginPath(); g.moveTo(p[0], p[1]); for (let i = 2; i < p.length; i += 2) g.lineTo(p[i], p[i + 1]); };
  g.fillStyle = '#7aa762'; for (const f of W.forests) { poly(f.ring); g.closePath(); g.fill(); }
  g.fillStyle = '#5d8fc0'; for (const w2 of W.water) { poly(w2.ring); g.closePath(); g.fill(); }
  g.strokeStyle = '#5d8fc0'; g.lineCap = 'round'; g.lineJoin = 'round'; for (const w2 of W.waterways) { g.lineWidth = Math.max(w2.width, 1.5 / S); poly(w2.pts); g.stroke(); }
  g.fillStyle = '#b5a693'; for (const b of W.buildings) { poly(b.ring); g.closePath(); g.fill(); }
  const order = ['service', 'living_street', 'unclassified', 'residential', 'tertiary', 'secondary', 'primary', 'trunk'];
  for (const t of order) for (const r of W.roads) { if (r.type !== t) continue; g.strokeStyle = (t === 'secondary' || t === 'primary' || t === 'trunk') ? '#f7c04a' : (t === 'tertiary' ? '#fde08a' : '#ffffff'); g.lineWidth = Math.max(r.width, (t === 'secondary' ? 3.2 : 1.6) / S); poly(r.pts); g.stroke(); }
  BM.base = base;
  const c = $('bigmap'); c.width = BM.W; c.height = BM.H; BM.c = c; BM.g = c.getContext('2d');
  buildTravelList();
  c.addEventListener('click', (e) => {
    const r = c.getBoundingClientRect(); const mx = (e.clientX - r.left) / r.width * BM.W, my = (e.clientY - r.top) / r.height * BM.H;
    const x = mx / BM.s + MINX, z = my / BM.s + MINZ;
    if (BM.gpsClick) {
      if (inWater(x, z)) { toast('To jest woda – GPS nie prowadzi przez jezioro', 2000); return; }
      navSet(x, z, 'punkt na mapie', { src: 'place' }); closeMap(); toast('GPS ustawiony', 1400); return;
    }
    teleport(x, z); closeMap(); toast('Teleport', 1200);
  });
}
function buildTravelList() {
  const list = $('travelList'); list.innerHTML = '';
  W.travel.forEach((t, i) => {
    const row = document.createElement('div'); row.className = 'trow';
    const b = document.createElement('button'); b.type = 'button'; b.textContent = (i + 1) + '. ' + t[0]; if (t[0][0] === '★') b.className = 'egg';
    b.onclick = () => { if (WANT.stars > 0) { toast('🚨 Szybka podróż niedostępna – najpierw zgub policję!', 2000); return; } teleport(t[1], t[2]); closeMap(); toast('Teleport: ' + t[0], 1800); };
    const g = document.createElement('button'); g.type = 'button'; g.className = 'gps'; g.textContent = 'GPS';
    g.onclick = () => { navSet(t[1], t[2], t[0], { src: 'place' }); closeMap(); toast('GPS: ' + t[0], 1600); };
    row.appendChild(b); row.appendChild(g); list.appendChild(row);
  });
}
function drawBigMap() {
  const g = BM.g; const [MINX, MINZ] = W.rect; const S = BM.s;
  g.setTransform(1, 0, 0, 1, 0, 0); g.drawImage(BM.base, 0, 0);
  g.font = 'bold 15px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  W.travel.forEach((t, i) => { const x = (t[1] - MINX) * S, y = (t[2] - MINZ) * S; g.fillStyle = t[0][0] === '★' ? '#0a8fa8' : '#123'; g.beginPath(); g.arc(x, y, 11, 0, 7); g.fill(); g.fillStyle = '#fff'; g.fillText(String(i + 1), x, y + 1); });
  g.fillStyle = '#2b4a6b'; g.font = 'bold 22px system-ui, sans-serif';
  for (const w of W.water) if (w.name && Math.abs(ringArea(w.ring)) > 200000) { let cx = 0, cz = 0; const n = w.ring.length / 2; for (let i = 0; i < w.ring.length; i += 2) { cx += w.ring[i]; cz += w.ring[i + 1]; } g.fillText(w.name, (cx / n - MINX) * S, (cz / n - MINZ) * S); }
  g.save(); g.setTransform(S, 0, 0, S, -MINX * S, -MINZ * S); drawMissionMinimap(g, S * 1.6); if (typeof drawNavOverlay === 'function') drawNavOverlay(g, S); g.restore();
  const px = G.mode === 'car' ? activeCar.x : player.x, pz = G.mode === 'car' ? activeCar.z : player.z; const ph = G.mode === 'car' ? activeCar.h : player.h;
  g.save(); g.translate((px - MINX) * S, (pz - MINZ) * S); g.rotate(Math.PI - ph); g.fillStyle = '#ff3b30'; g.strokeStyle = '#fff'; g.lineWidth = 3;
  g.beginPath(); g.moveTo(0, -16); g.lineTo(11, 12); g.lineTo(0, 6); g.lineTo(-11, 12); g.closePath(); g.fill(); g.stroke(); g.restore();
}
function openMap() { if (!G.started) return; drawBigMap(); $('mapScreen').classList.remove('hidden'); G.paused = true; G.mapOpen = true; if (document.pointerLockElement) document.exitPointerLock(); }
function closeMap() { $('mapScreen').classList.add('hidden'); G.mapOpen = false; G.paused = false; clock.getDelta(); }

// ======================= INPUT =======================
function initInput() {
  addEventListener('keydown', (e) => {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT')) return;
    G.keys.add(e.code);
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
    if (e.repeat) return;
    if (!G.started) return;
    if (G.tutor) { tutorKey(e.code); return; }
    if (G.journalOpen) { if (e.code === 'Escape' || e.code === 'KeyJ') closeJournal(); return; }
    if (G.dialogOpen) { if (e.code === 'KeyE' || e.code === 'Enter') dialogAction(); else if (e.code === 'Escape') dialogClose(); return; }
    if (G.inGarage) { garageKey(e.code); return; }
    if (POL.shop) { if (e.code === 'Digit1') { shopBuy('paint'); return; } if (e.code === 'Digit2') { shopBuy('fix'); return; } if (e.code === 'Escape' || e.code === 'Digit3') { shopClose(); return; } }
    if (e.code === 'Space' && G.mode === 'foot') G.jumpReq = true;
    if (e.code === 'KeyE' || e.code === 'KeyF') actionE();
    else if (e.code === 'KeyM') { G.mapOpen ? closeMap() : openMap(); }
    else if (e.code === 'KeyJ') { if (!G.mapOpen && !G.inGarage && !POL.shop) openJournal(); }
    else if (e.code === 'KeyG') {
      if (!NAV.on) return;
      if (NAV.src === 'mission') toast('To trasa misji. Inne miejsce: mapa M → GPS. Misję anulujesz w dzienniku (J).', 2600);
      else { navClear(); toast('GPS wyłączony', 1200); }
    }
    else if (e.code === 'KeyR' || e.code === 'Period') radioStep(1);
    else if (e.code === 'KeyQ' || e.code === 'Comma') radioStep(-1);
    else if (e.code === 'KeyT') radioPower();
    else if (e.code === 'KeyN') toggleNight();
    else if (e.code === 'KeyC') G.camZoom = G.camZoom ? 0 : 1;
    else if (e.code === 'Escape') { if (G.mapOpen) closeMap(); else pauseGame(); }
  });
  addEventListener('keyup', (e) => G.keys.delete(e.code));
  addEventListener('blur', () => G.keys.clear());
  const canvas = $('c');
  canvas.addEventListener('click', () => { if (G.started && !G.paused && !isTouch && canvas.requestPointerLock) { try { const p = canvas.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch (e) { /* unsupported */ } } });
  let drag = null;
  canvas.addEventListener('mousedown', (e) => { drag = { x: e.clientX, y: e.clientY }; });
  addEventListener('mouseup', () => { drag = null; G.mouseLooking = false; });
  addEventListener('mousemove', (e) => {
    if (!G.started || G.paused) return;
    let dx = 0, dy = 0;
    if (document.pointerLockElement === canvas) { dx = e.movementX; dy = e.movementY; }
    else if (drag) { dx = e.clientX - drag.x; dy = e.clientY - drag.y; drag = { x: e.clientX, y: e.clientY }; }
    if (dx || dy) look(dx, dy);
  });
  initTouch();
  $('btnMap').onclick = () => openMap(); $('mapClose').onclick = () => closeMap();
  $('btnNight').onclick = () => toggleNight(); $('btnPause').onclick = () => pauseGame();
  $('btnRadio').onclick = () => toggleRadio();
  const stop = (e) => e.stopPropagation();
  for (const id of ['topbtns', 'radioPanel']) { $(id).addEventListener('touchstart', stop, { passive: true }); $(id).addEventListener('mousedown', stop); }
}
function look(dx, dy) {
  const s = 0.0026 * settings.sens;
  G.yaw -= dx * s; G.pitch = clamp(G.pitch - dy * s, -1.25, 0.45);
  if (G.mode === 'car') { G.mouseLooking = true; clearTimeout(look._t); look._t = setTimeout(() => { G.mouseLooking = false; }, 900); }
}
function toggleNight() { G.night = !G.night; settings.time = G.night ? 'night' : 'day'; $('selTime').value = settings.time; saveSettings(); applyTime(); }
function pauseGame() {
  G.paused = true; if (document.pointerLockElement) document.exitPointerLock();
  $('menu').classList.remove('hidden'); $('hud').classList.add('hidden'); $('touch').classList.add('hidden'); $('btnStart').textContent = 'WZNÓW';
}
function startGame() {
  G.started = true; G.paused = false; clock.getDelta();
  $('menu').classList.add('hidden'); $('hud').classList.remove('hidden');
  if (isTouch) $('touch').classList.remove('hidden');
  updateVisibility(true); updateStreet();
  if (!startGame._once) {
    startGame._once = true;
    if (!SAVE.tut) openTutor();
    else toast(isTouch ? 'Dziennik: 📒. Mapa: GPS przy miejscu. Świecące „!” to misje.' : 'J – dziennik, M – mapa i GPS, G – wyłącz GPS. Świecące „!” to misje.', 4200);
  }
}
function initMenu() {
  $('btnStart').onclick = () => startGame();
  $('btnHelp').onclick = () => { $('helpBox').classList.toggle('hidden'); $('settingsBox').classList.add('hidden'); };
  $('btnSettings').onclick = () => { $('settingsBox').classList.toggle('hidden'); $('helpBox').classList.add('hidden'); };
  $('selQuality').value = settings.quality; $('selTime').value = settings.time; $('rngSens').value = settings.sens; $('chkFps').checked = !!settings.fps;
  $('fps').classList.toggle('hidden', !settings.fps);
  $('selQuality').onchange = (e) => { settings.quality = e.target.value; saveSettings(); applyQuality(); updateVisibility(true); };
  $('selTime').onchange = (e) => { G.night = e.target.value === 'night'; settings.time = e.target.value; saveSettings(); applyTime(); };
  $('rngSens').oninput = (e) => { settings.sens = parseFloat(e.target.value); saveSettings(); };
  $('rngSteer').value = settings.steerSens; $('rngBtn').value = settings.btnScale; $('chkLeft').checked = !!settings.leftHanded; $('chkVibe').checked = !!settings.vibrate;
  $('rngSteer').oninput = (e) => { settings.steerSens = parseFloat(e.target.value); saveSettings(); };
  $('rngSfx').value = settings.sfxVol === undefined ? 0.7 : settings.sfxVol; $('rngSfx').oninput = (e) => { settings.sfxVol = parseFloat(e.target.value); saveSettings(); };
  $('rngBtn').oninput = (e) => { settings.btnScale = parseFloat(e.target.value); saveSettings(); applyTouchLayout(); };
  $('chkLeft').onchange = (e) => { settings.leftHanded = e.target.checked; saveSettings(); applyTouchLayout(); };
  $('chkVibe').onchange = (e) => { settings.vibrate = e.target.checked; saveSettings(); if (e.target.checked) buzz(20); };
  $('selStyle').value = settings.style; $('chkRadioAuto').checked = !!settings.radioAuto;
  $('selStyle').onchange = (e) => { settings.style = e.target.value; saveSettings(); $('styleNote').textContent = 'Przeładowuję grę z nowym stylem…'; setTimeout(() => location.reload(), 300); };
  $('chkRadioAuto').onchange = (e) => { settings.radioAuto = e.target.checked; saveSettings(); };
  $('chkFps').onchange = (e) => { settings.fps = e.target.checked; saveSettings(); $('fps').classList.toggle('hidden', !settings.fps); };
}

Object.assign(G, {
  teleport, enterExit, openMap, closeMap, toggleRadio, toggleNight, startGame, pauseGame, actionE,
  radioStep, radioPower, radioPlay, radioStop, setStars, crime, busted, wasted, damageCar, missionStart: (id) => missionStart(MIS.list.find((m) => m.id === id)), missionEnd, addMoney,
  traffic: () => ({ agents: TR.agents.length, pool: TR.pool.length, peds: TR.peds.filter((p) => p.on).length, nodes: TR.nodes.length, edges: TR.edges.length, zebras: W.zebras || 0, moved: TR.stats.moved, spawned: TR.stats.spawned, cars: cars.length,
    list: TR.agents.map((c) => ({ x: c.x, z: c.z, h: c.h, v: c.ai ? c.ai.v : 0, e: c.ai ? c.ai.e : -1, mode: c.ai ? c.ai.mode : '' })) }),
  police: () => ({ stars: WANT.stars, seen: WANT.seen, evade: WANT.evade, chasers: chasers().length, blocks: POL.blocks.length, foot: POL.foot.filter((p) => p.on).length, bustT: POL.bustT, busted: G.bustedN || 0, footList: POL.foot.filter((p) => p.on).map((p) => Math.round(Math.hypot(p.x - focusXZ().x, p.z - focusXZ().z))), wasted: G.wastedN || 0, cut: !!G.cut, events: POL.events.slice(-10), siren: G.sirenVol || 0,
    list: POL.cars.filter((c) => c.g.visible).map((c) => ({ x: c.x, z: c.z, sp: c.speed, chase: !!c.pai, block: !!c.block, patrol: !!c.patrol, wrecked: !!c.wrecked, hp: Math.round(c.hp || 0), h: c.h, pi: c.pai ? c.pai.pi : -1, pl: c.pai && c.pai.path ? c.pai.path.length / 2 : 0, rev: c.pai ? +(c.pai.rev || 0).toFixed(1) : 0, srch: !!(c.pai && c.pai.search) })) }),
  mission: () => ({ active: MIS.active ? MIS.active.id : null, stage: MIS.active ? MIS.active.stage : null, obj: MIS.active ? MIS.active.obj : '', t: MIS.active ? MIS.active.t : null, target: MIS.active && MIS.active.target ? { x: MIS.active.target.x, z: MIS.active.target.z } : null, events: MIS.events.slice(-10), done: { ...SAVE.done }, money: SAVE.money, dialog: MIS.dlg ? MIS.dlg.id : null,
    givers: MIS.list.map((m) => ({ id: m.id, x: m.gx, z: m.gz, open: giverOpen(m) })), car: MIS.active && MIS.active.car ? { x: MIS.active.car.x, z: MIS.active.car.z } : null, cps: MIS.active && MIS.active.cps ? MIS.active.cps.length : 0, i: MIS.active ? MIS.active.i : 0 }),
  path: (ax, az, bx, bz) => { const p = astar(nearestNode(ax, az), nearestNode(bx, bz)); return p ? pathPoints(p) : null; },
  touchStats: () => ({ ...TP.stats, ptrs: TP.ptrs.size, joy: !!TP.joy, look: !!TP.look, jx: G.touch.jx, jy: G.touch.jy, gas: !!G.touch.gas, brake: !!G.touch.brake, hand: !!G.touch.hand, steer: activeCar ? activeCar.steer : 0 }), touchReset,
  dialogAction, dialogClose, shopBuy, shopClose, places: PLACES, money: () => SAVE.money,
  navState: () => ({ on: NAV.on, status: NAV.status, note: NAV.note, instr: NAV.instr, dist: NAV.dist, src: NAV.src, n: NAV.pts ? NAV.pts.length / 2 : 0, plans: NAV.plans, tail: !!NAV.tail, cls: NAV.cls, name: NAV.name, dx: NAV.dx, dz: NAV.dz, sig: NAV.sig, bridges: NAV.bridges || 0, comps: NAV.comps || 0 }),
  navSet: (x, z, name, opt) => navSet(x, z, name, opt || { src: 'place' }), navClear, navAudit, openJournal, closeJournal, openTutor, closeTutor, missionCancel,
  storyDone: () => storyDoneCount(), save: () => SAVE,
  stats: () => ({ buildings: W.buildings.length, roads: W.roads.length, trees: W.treeCount, chunks: W.chunkCount, calls: renderer.info.render.calls, tris: renderer.info.render.triangles }),
  garage: () => ({ open: GAR.open ? GAR.open.n : null, tab: GAR.tab, sel: GAR.sel, places: GAR.places.map((p) => ({ n: p.n, x: p.x, z: p.z, h: p.h })), cars: SAVE.garage.cars.map((r) => ({ uid: r.uid, model: r.model, color: r.color, up: { ...r.up }, st: carStats(r) })),
    own: GAR.own ? { uid: GAR.own.own.uid, model: GAR.own.model, x: GAR.own.x, z: GAR.own.z, hp: GAR.own.hp, st: GAR.own.st, nf: GAR.own.nf, inside: GAR.own === activeCar } : null, save: SAVE }),
  garageOpen: (i) => garageOpen(GAR.places[i || 0]), garageClose, garageTab: (t) => { GAR.tab = t; garageRender(); }, buyModel, upgradeCar, paintCar, spawnOwn: (uid, i) => spawnOwn(ownRec(uid), GAR.places[i || 0]), keepStolen, sellCar, storeCurrent, repairActive,
  carStats, impactDamage, carHitEvent, BAL, BAL_OLD, MODELS, UPG, migrateSave, nitroTick, collisionFx, fxq,
  drive: () => ({ drift: { ...DRV.drift }, drifts: DRV.drifts || 0, driftT: DRV.driftT || 0, air: DRV.air, skids: DRV.stats.skids, smoke: DRV.stats.smoke, sparks: DRV.stats.sparks, crunch: DRV.stats.crunch, maxShake: DRV.stats.maxShake, shake: G.shake || 0, slip: DRV.slip || 0, smokeAlive: DRV.smoke.alive, sparkAlive: DRV.sparks.alive,
    eng: { built: !!ENG.built, on: ENG.on, gear: ENG.gear, rpm: ENG.rpm }, pickups: DRV.pick ? DRV.pick.L.map((p) => ({ x: p.x, z: p.z, on: p.on, v: p.v })) : [], car: activeCar ? { vF: activeCar.vFl, vR: activeCar.vRl, hp: activeCar.hp, model: activeCar.model, nitroOn: !!activeCar.nitroOn, nf: activeCar.nf, st: activeCar.st || null, burn: activeCar.burn || 0 } : null, stats: { ...SAVE.stats } }),
  setYaw: (y) => { G.yaw = y; }, setQuality: (q) => { settings.quality = q; applyQuality(); updateVisibility(true); },
});

Object.defineProperties(G, { renderer: { get: () => renderer }, cars: { get: () => cars }, mis: { get: () => MIS }, car: { get: () => activeCar }, player: { get: () => player }, camera: { get: () => camera }, world: { get: () => W }, scene: { get: () => scene }, THREE: { get: () => THREE } });

init().catch((e) => { console.error(e); $('loadtxt').textContent = 'Błąd: ' + e.message; });
