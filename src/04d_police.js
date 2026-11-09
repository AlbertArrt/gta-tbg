
// ======================= WANTED LEVEL, POLICE, DAMAGE, LAKIERNIA, MONEY =======================
const SAVE = { money: 100, done: {}, best: {} };
(function loadSave() { try { const s = JSON.parse(localStorage.getItem('gtatbg_save') || 'null'); if (s && typeof s.money === 'number') Object.assign(SAVE, s); } catch (e) { /* ignore */ } })();
function saveGame() { try { localStorage.setItem('gtatbg_save', JSON.stringify(SAVE)); } catch (e) { /* ignore */ } }
function addMoney(n, why) {
  SAVE.money = Math.max(0, Math.round(SAVE.money + n)); saveGame(); moneyHud(n);
  if (why) toast((n >= 0 ? '+' : '') + n + ' zł · ' + why, 1800);
}
// ---- balance (v3): cars ~2-3x tougher, police slower to escalate / bust, easier to shake at 1-2 stars
const BAL = {
  dmgThr: 6, dmgK: 1.5, dmgV2: 20, dmgK2: 0.8, burnT: 5,           // damage = 1.5*(v-6) + 0.8*max(0,v-20)  [v = impact m/s]
  want: [0, 1, 1, 3, 4, 5],                                         // chasing cruisers per star level
  spawnInt: [0, 6, 5, 2.6, 2.4, 2.2], spawnR: [0, 150, 140, 120, 110, 110],
  pmul: [1, 0.8, 0.87, 0.95, 1, 1],                                 // cruiser top speed / accel multiplier
  losR: [0, 90, 100, 125, 165, 175], seeClose: 18, knowT: [0, 6, 7, 9, 10, 10],
  evadeBase: 5, evadeK: 2,                                          // seconds out of sight to lose the stars: 5 + 2*S
  escalateT: 90, escalateMax: 2,                                    // long chase in view adds a star (only up to 2)
  bustDist: 5, bustSpeed: 1.0, bustT: 5, bustDecay: 3,
  footBustD: 1.2, footBustT: 1.0, footSpd: [0, 6.0, 6.4, 7.0, 7.3, 7.3], footMinStars: 3, footInt: 12,
  speedV: 24, speedD: 28,
};
const BAL_OLD = { dmgThr: 3, dmgK: 4, carCarThr: 4, carCarK: 3, burnT: 3.2, want: [0, 1, 2, 4, 5, 5], spawnInt: 2.2, spawnR: 110, losR: [0, 125, 125, 125, 170, 170], seeClose: 25, knowT: 10, evade: '8 + 3*S', escalateT: 50, escalateMax: 3, bustDist: 8, bustSpeed: 2, bustT: 3, bustDecay: 2, footBustD: 1.3, footBustT: 0, footSpd: 7.3, footMinStars: 2, footInt: 9, speedV: 19.5, speedD: 38 };
function impactDamage(v) { return v <= BAL.dmgThr ? 0 : (v - BAL.dmgThr) * BAL.dmgK + Math.max(0, v - BAL.dmgV2) * BAL.dmgK2; }
const WANT = { stars: 0, evade: 0, seen: false, seenT: 0, cool: {}, crimes: 0, maxSeen: 0 };
const POL = { cars: [], pool: [], foot: [], blocks: [], spawnT: 0, blockT: 0, losT: 0, bustT: 0, siren: null, events: [] };
const PLACES = {
  komenda: [-497, 303], szpital: [-68, 776], rynek: [-7, 10],
  shops: [{ n: 'Lakiernia „Warsztat”', x: 1081, z: 471 }, { n: 'Lakiernia DULUX', x: -442, z: 377 }, { n: 'Lakiernia przy myjni', x: 1381, z: -1262 }],
};
function ensureHud() {
  const hud = $('hud'); if ($('wanted')) return;
  const mk = (tag, id, cls, html) => { const e = document.createElement(tag); e.id = id; if (cls) e.className = cls; if (html) e.innerHTML = html; hud.appendChild(e); return e; };
  mk('div', 'wanted', '', '<span>★</span><span>★</span><span>★</span><span>★</span><span>★</span>');
  mk('div', 'money', '', '100 zł');
  mk('div', 'hpbar', 'hidden', '<i></i>');
  mk('div', 'bustbar', 'hidden', '<i></i><b>ZATRZYMANIE – ruszaj się!</b>');
  mk('div', 'nitrobar', 'hidden', '<i></i><b>NITRO</b>');
  mk('div', 'drift', 'hidden', '');
  const b = document.createElement('div'); b.id = 'banner'; b.className = 'hidden'; document.body.appendChild(b);
  const sm = document.createElement('div'); sm.id = 'shopMenu'; sm.className = 'cdialog hidden';
  sm.innerHTML = '<h3>🎨 Lakiernia</h3><p id="shopTxt"></p><div class="btns"><button id="shopPaint">1 · Przemaluj – 100 zł</button><button id="shopFix">2 · Napraw – 50 zł</button><button id="shopExit" class="sec">Esc · Wyjdź</button></div>';
  document.body.appendChild(sm);
  $('shopPaint').onclick = () => shopBuy('paint'); $('shopFix').onclick = () => shopBuy('fix'); $('shopExit').onclick = () => shopClose();
  moneyHud(0); starsHud();
}
function moneyHud(delta) {
  const m = $('money'); if (!m) return; m.textContent = SAVE.money + ' zł';
  if (delta) { m.classList.remove('bump'); void m.offsetWidth; m.classList.add('bump'); }
}
function starsHud() {
  const w = $('wanted'); if (!w) return; const sp = w.children;
  for (let i = 0; i < 5; i++) sp[i].className = i < WANT.stars ? 'on' : '';
  w.classList.toggle('flash', WANT.stars > 0 && !WANT.seen);
  w.classList.toggle('active', WANT.stars > 0);
}
function banner(txt, cls, ms = 2600) {
  const b = $('banner'); b.textContent = txt; b.className = cls || ''; clearTimeout(banner._t);
  banner._t = setTimeout(() => b.classList.add('hidden'), ms);
}
function setStars(n, why) {
  n = clamp(Math.round(n), 0, 5); const old = WANT.stars; if (n === old) return;
  WANT.stars = n; WANT.evade = 0; WANT.maxSeen = Math.max(WANT.maxSeen, n);
  if (n > old) { WANT.seen = true; WANT.seenT = 0; WANT.knowT = BAL.knowT[n]; const ff = focusXZ(); WANT.lx = ff.x; WANT.lz = ff.z; toast('★'.repeat(n) + ' Poszukiwany!' + (why ? ' · ' + why : ''), 1800); }
  if (n === 0 && old > 0) { policeStandDown(); }
  POL.events.push({ t: performance.now(), stars: n, why: why || '' });
  starsHud();
}
const CRIMES = { ped: [1, 2.5, 'potrącenie pieszego'], ramPolice: [1, 6, 'taranowanie policji'], carjack: [1, 8, 'kradzież auta'], speed: [1, 15, 'przekroczenie prędkości'], shootout: [1, 1, ''] };
function crime(kind) {
  const c = CRIMES[kind]; if (!c) return; const now = performance.now() / 1000;
  if (WANT.cool[kind] && now - WANT.cool[kind] < c[1]) return; WANT.cool[kind] = now; WANT.crimes++;
  if (kind === 'ped') WANT.peds = (WANT.peds || 0) + 1;
  if (kind === 'ramPolice') WANT.rams = (WANT.rams || 0) + 1;
  let add = c[0];
  if (kind === 'ped' && WANT.stars >= 2) add = 0;                              // every 3rd pedestrian (below)
  if ((kind === 'carjack' || kind === 'speed') && WANT.stars >= 1) add = 0;    // only gets you noticed, no escalation
  if (kind === 'ramPolice' && WANT.stars >= 2 && WANT.rams % 2) add = 0;       // every 2nd ram at 2+ stars
  if (WANT.stars === 0 || add) setStars(Math.min(5, WANT.stars + Math.max(add, WANT.stars ? 0 : 1)), c[2]);
  else if (kind === 'ped' && WANT.peds % 3 === 0) setStars(WANT.stars + 1, c[2]);
}
function carHitEvent(other, v) {
  if (!other.police) return;
  if (!activeCar || v <= 5) return;
  // only when YOU ram the cruiser (you move into it faster than it moves into you) – a cop ramming a parked player is not a crime
  const a = activeCar, dx = other.x - a.x, dz = other.z - a.z, L = Math.hypot(dx, dz) || 1, mine = ((a.vx || 0) * dx + (a.vz || 0) * dz) / L, his = -((other.vx || 0) * dx + (other.vz || 0) * dz) / L;
  if (a.speed > 6 && mine > 4 && mine + 0.5 >= his) crime('ramPolice');
}

// ---------- police cars
function initPolice() {
  ensureHud();
  for (let i = 0; i < 7; i++) { const c = new Car(scene, 0xffffff, 0, -99999, 0, { police: true }); c.g.visible = false; c.pooled = true; POL.pool.push(c); POL.cars.push(c); }
  for (let i = 0; i < 4; i++) { const w = makeWalker({ shirt: 0x24489c, pants: 0x1a2340, hairStyle: 'cap', cap: 0x1a2340, belt: 0x111111, jacket: 0x1c3f8a }); w.visible = false; scene.add(w); POL.foot.push({ w, on: false, x: 0, z: 0, h: 0, y: 0 }); }
  // paint-shop markers
  for (const s of PLACES.shops) {
    const [x, z] = findFree(s.x, s.z, 3.5); s.x = x; s.z = z;
    const g = new THREE.Group(); g.position.set(x, 0.05, z);
    const ring = new THREE.Mesh(new THREE.RingGeometry(4.2, 5.2, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xff3fa4, transparent: true, opacity: 0.8, depthWrite: false })); ring.position.y = 0.2; g.add(ring);
    const can = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 1.8, 14), mkMat({ color: 0xff3fa4 })); can.position.y = 4.5; g.add(can);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.4, 0.5, 10), mkMat({ color: 0xffffff })); cap.position.y = 5.6; g.add(cap);
    const lab = labelSprite('🎨 LAKIERNIA', '#ff3fa4', 5); lab.position.y = 7.4; g.add(lab);
    scene.add(g); s.g = g; s.ring = ring; s.can = can;
  }
  POL.fx = makeFx();
}
function freePolice() { return POL.pool.pop() || null; }
function placeOnRoadNear(cx, cz, rMin, rMax, faceX, faceZ) {
  for (let t = 0; t < 16; t++) {
    const ang = Math.random() * 6.283, R = rMin + Math.random() * (rMax - rMin);
    const rp = nearestRoadPoint(cx + Math.cos(ang) * R, cz + Math.sin(ang) * R, true, 120); if (!rp || rp.road.type === 'service' && t < 10) continue;
    if (inOffZone(rp.x, rp.z) !== inOffZone(cx, cz)) continue;
    const d = Math.hypot(rp.x - cx, rp.z - cz); if (d < rMin * 0.7 || d > rMax * 1.3) continue;
    if (cars.some((o) => o.g.visible && Math.hypot(o.x - rp.x, o.z - rp.z) < 8)) continue;
    if (insideBuilding(rp.x, rp.z, 1.2)) continue;
    let h = rp.h; if (faceX !== undefined && Math.sin(h) * (faceX - rp.x) + Math.cos(h) * (faceZ - rp.z) < 0) h += Math.PI;
    return { x: rp.x, z: rp.z, h };
  }
  return null;
}
function activatePolice(c, p) {
  c.x = p.x; c.z = p.z; c.h = p.h; c.vx = c.vz = 0; c.y = groundH(p.x, p.z); c.vy = 0; c.hp = 100; c.wrecked = false; c.burn = 0; c.g.visible = true; c.pooled = false; c.sync();
  c.pai = { path: null, pi: 0, repath: 0, stuck: 0, rev: 0, leave: 0 }; if (!cars.includes(c)) cars.push(c);
  c.headMat.emissiveIntensity = G.night ? 2.5 : 0.2; c.tailMat.emissiveIntensity = G.night ? 1.5 : 0.3;
}
function chasers() { return POL.cars.filter((c) => c.pai && !c.block && !c.wrecked && c.g.visible); }
function policeLeave(c) { c.pai = null; c.patrol = false; const j = TR.agents.indexOf(c); if (j >= 0) TR.agents.splice(j, 1); c.ai = null; }
function policeStandDown() {
  for (const c of POL.cars) if (c.pai) c.pai.leave = 1;
  for (const f of POL.foot) if (f.on) f.leave = true;
  for (const b of POL.blocks) b.leave = true;
}
function focusXZ() { return G.mode === 'car' && activeCar ? activeCar : player; }
function hasLOS(ax, az, bx, bz) {
  const d = Math.hypot(bx - ax, bz - az); const n = Math.ceil(d / 7);
  for (let i = 1; i < n; i++) { const t = i / n; if (insideBuildingH(ax + (bx - ax) * t, az + (bz - az) * t, 1.6)) return false; }
  return true;
}
function updatePolice(dt) {
  const f = focusXZ(); const S = WANT.stars;
  // light bars + siren
  const blink = Math.floor(performance.now() / 160) % 2;
  let nearest = 1e9;
  for (const c of POL.cars) {
    if (!c.g.visible) continue; const on = (c.pai && !c.pai.leave) || c.block;
    c.lbR.color.setHex(on ? (blink ? 0xff2020 : 0x441010) : 0x661111); c.lbB.color.setHex(on ? (blink ? 0x10204a : 0x2a5cff) : 0x112266);
    if (on && c !== activeCar) nearest = Math.min(nearest, Math.hypot(c.x - f.x, c.z - f.z));
  }
  sirenUpdate(nearest, dt);
  // speeding next to a patrol / police car
  if (G.mode === 'car' && activeCar && !activeCar.police && activeCar.speed > BAL.speedV) {
    for (const c of POL.cars) if (c.g.visible && c !== activeCar && Math.hypot(c.x - f.x, c.z - f.z) < BAL.speedD && hasLOS(c.x, c.z, f.x, f.z)) { crime('speed'); break; }
  }
  // patrol car converts to a chaser once there are stars
  if (S > 0) for (const c of TR.agents.slice()) if (c.patrol && Math.hypot(c.x - f.x, c.z - f.z) < 260) { policeLeave(c); c.patrol = false; c.pai = { path: null, pi: 0, repath: 0, stuck: 0, rev: 0, leave: 0 }; }
  // spawn chasers
  const want = BAL.want[S] || 0;
  POL.spawnT -= dt;
  if (S > 0 && POL.spawnT <= 0 && (WANT.seen || chasers().length === 0) && chasers().filter((c) => !c.pai.leave).length < want && !G.cut) {
    POL.spawnT = BAL.spawnInt[S]; const c = freePolice();
    if (c) { const p = placeOnRoadNear(f.x, f.z, BAL.spawnR[S], BAL.spawnR[S] + 80, f.x, f.z); if (p) { activatePolice(c, p); } else POL.pool.push(c); }
  }
  // roadblocks at 4-5 stars, ahead of the player
  POL.blockT -= dt;
  if (S >= 4 && POL.blockT <= 0 && G.mode === 'car' && activeCar && activeCar.speed > 6) {
    POL.blockT = 22; const fx = activeCar.vx / activeCar.speed, fz = activeCar.vz / activeCar.speed;
    const rp = nearestRoadPoint(f.x + fx * 130, f.z + fz * 130, true, 60);
    if (rp && POL.pool.length >= 2 && Math.hypot(rp.x - f.x, rp.z - f.z) > 70) {
      const nx = -Math.cos(rp.h), nz = Math.sin(rp.h); const half = Math.max(2.2, rp.road.width / 4);
      for (const s of [-1, 1]) { const c = freePolice(); const p = { x: rp.x + nx * half * s, z: rp.z + nz * half * s, h: rp.h + Math.PI / 2 + (s > 0 ? 0.25 : -0.25) }; activatePolice(c, p); c.block = true; c.pai = null; POL.blocks.push(c); }
      toast('🚧 Blokada policji przed tobą!', 1800);
    }
  }
  // drive chasers
  for (const c of POL.cars) {
    if (!c.g.visible || c === activeCar) continue;
    const d = Math.hypot(c.x - f.x, c.z - f.z);
    if (c.block) { if ((S < 4 || c.leave) && d > 120) { const i = POL.blocks.indexOf(c); if (i >= 0) POL.blocks.splice(i, 1); c.block = false; c.leave = false; despawnCar(c); } else if (c.speed > 0.05) updateCar(c, dt, false); continue; }
    if (!c.pai) continue;
    if (c.wrecked) { updateCar(c, dt, false); if (d > 300) despawnCar(c); continue; }
    if (c.pai.leave) { c.pai.leave += dt; updateCar(c, dt, { thr: 0, steer: 0, hand: true }); if (d > 140 || c.pai.leave > 25) despawnCar(c); continue; }
    if (d > 520) { despawnCar(c); continue; }
    chaseDrive(c, f, d, dt);
  }
  // line of sight + escape timer
  POL.losT -= dt; if (WANT.knowT > 0) WANT.knowT -= dt;
  if (S > 0 && POL.losT <= 0) {
    POL.losT = 0.25; let seen = false; const R = BAL.losR[S];
    for (const c of POL.cars) if (c.g.visible && (c.pai || c.block) && c !== activeCar && !c.wrecked && !(c.pai && c.pai.leave)) { const d = Math.hypot(c.x - f.x, c.z - f.z); if (d < R && (d < BAL.seeClose || hasLOS(c.x, c.z, f.x, f.z))) { seen = true; break; } }
    if (!seen && (WANT.knowT || 0) > 0) seen = true; // fresh crime: dispatch knows where you are for a few seconds
    if (!seen) for (const p of POL.foot) if (p.on && !p.leave && Math.hypot(p.x - f.x, p.z - f.z) < 70 && hasLOS(p.x, p.z, f.x, f.z)) { seen = true; break; }
    if (seen !== WANT.seen) { WANT.seen = seen; starsHud(); }
    if (seen) { WANT.lx = f.x; WANT.lz = f.z; }
  }
  if (S > 0 && !G.cut) {
    if (WANT.seen) { WANT.evade = 0; WANT.seenT += dt; if (WANT.seenT > BAL.escalateT && S < BAL.escalateMax) { WANT.seenT = 0; setStars(S + 1, 'pościg trwa'); } }
    else { WANT.evade += dt; if (WANT.evade > BAL.evadeBase + BAL.evadeK * S) { setStars(0); toast('Zgubiłeś policję! 😎', 2200); if (typeof missionEvent === 'function') missionEvent('lost'); } }
  }
  updateFootCops(dt, f);
  // BUSTED
  if (S > 0 && !G.cut) {
    let close = false;
    if (G.mode === 'car') { for (const c of POL.cars) if (c.g.visible && !c.wrecked && c !== activeCar && (c.pai || c.block) && Math.hypot(c.x - f.x, c.z - f.z) < BAL.bustDist) { close = true; break; } }
    if (G.mode === 'car') POL.bustT = close && activeCar.speed < BAL.bustSpeed ? POL.bustT + dt : Math.max(0, POL.bustT - dt * BAL.bustDecay);
    else { let g = 0; for (const p of POL.foot) if (p.on) g = Math.max(g, p.grab || 0); POL.bustT = g / BAL.footBustT * BAL.bustT; }
    if (POL.bustT > BAL.bustT && G.mode === 'car') busted();
  } else POL.bustT = 0;
  bustHud();
}
function chaseDrive(c, f, d, dt) {
  const a = c.pai; a.repath -= dt;
  if (!WANT.seen && WANT.lx !== undefined) { // search mode: head for the last place the player was seen, then sweep around it
    if (Math.hypot(c.x - WANT.lx, c.z - WANT.lz) < 20) { const r = nearestRoadPoint(WANT.lx + (Math.random() - 0.5) * 160, WANT.lz + (Math.random() - 0.5) * 160, true, 80); if (r) { WANT.lx = r.x; WANT.lz = r.z; } a.repath = 0; }
    if (!a.search) { a.search = true; a.repath = 0; }
    f = { x: WANT.lx, z: WANT.lz }; d = Math.hypot(c.x - f.x, c.z - f.z);
  } else if (a.search) { a.search = false; a.repath = 0; }
  const direct = d < 45 && hasLOS(c.x, c.z, f.x, f.z);
  if (!direct && a.repath <= 0) {
    a.repath = 2 + Math.random() * 0.5;
    const n0 = nearestNode(c.x, c.z), n1 = nearestNode(f.x, f.z); const path = astar(n0, n1);
    if (path) { a.path = pathPoints(path); a.path.unshift(TR.nodes[n0].x, TR.nodes[n0].z); const er = nearestRoadPoint(f.x, f.z, true, 60); if (er) a.path.push(er.x, er.z); a.pi = 0; const P = a.path; if (P.length >= 4 && Math.hypot(P[2] - c.x, P[3] - c.z) < Math.hypot(P[2] - P[0], P[3] - P[1]) + 2) a.pi = 1; } else a.path = null; // v3: don't U-turn back to a node already passed
  }
  let tx = f.x, tz = f.z;
  if (!direct && a.path) {
    while (a.pi < a.path.length / 2 - 1 && Math.hypot(a.path[a.pi * 2] - c.x, a.path[a.pi * 2 + 1] - c.z) < 9) a.pi++;
    tx = a.path[a.pi * 2]; tz = a.path[a.pi * 2 + 1];
  } else if (direct && activeCar && G.mode === 'car' && WANT.stars >= 3) { tx = f.x + activeCar.vx * 0.5; tz = f.z + activeCar.vz * 0.5; } // lead the target a bit (ram) – only from 3 stars
  c.pmul = BAL.pmul[WANT.stars] || 1;
  let ang = Math.atan2(tx - c.x, tz - c.z) - c.h; ang = Math.atan2(Math.sin(ang), Math.cos(ang));
  let steer = clamp(ang * 2.5, -1, 1), thr = 1, hand = false;
  if (direct && WANT.stars <= 2 && d < 14 && G.mode === 'car' && activeCar) thr = c.speed > activeCar.speed + 2 ? 0 : 0.6; // low stars: tail you, don't smash into you
  if (Math.abs(ang) > 1.1 && c.speed > 11) { thr = 0; hand = Math.abs(ang) > 1.6; }
  if (Math.abs(ang) > 2.2 && c.speed < 4) { thr = -1; steer = -steer; }
  if (direct && G.mode === 'foot' && d < 14) { thr = c.speed > 3 ? -1 : 0; if (c.speed < 1.5) spawnFootCopFrom(c); }
  if (a.rev > 0) { a.rev -= dt; thr = a.revT; steer = a.revS; }
  else { a.stuck = Math.abs(c.speed) < 1.2 && thr !== 0 ? a.stuck + dt : 0; if (a.stuck > 1.4) { a.revT = thr > 0 ? -1 : 1; a.rev = 1.3; a.revS = (thr > 0 ? -1 : 1) * Math.sign(ang || 1); a.stuck = 0; a.repath = 0; } } // unstick: back off (or pull forward) away from the obstacle
  updateCar(c, dt, { thr, steer, hand });
}
// ---------- foot police
function spawnFootCopFrom(c) {
  const p = POL.foot.find((q) => !q.on); if (!p || c.footOut) return; c.footOut = true;
  p.on = true; p.leave = false; p.x = c.x - Math.cos(c.h) * 1.8; p.z = c.z + Math.sin(c.h) * 1.8; p.h = c.h; p.y = groundH(p.x, p.z); p.w.visible = true; p.car = c;
}
function updateFootCops(dt, f) {
  if (WANT.stars > 0 && G.mode === 'foot') { // at 2+ stars a cop on foot may also come around a corner
    POL.footT = (POL.footT || 0) - dt;
    if (POL.footT <= 0 && WANT.stars >= BAL.footMinStars) { POL.footT = BAL.footInt; const p = POL.foot.find((q) => !q.on); if (p) { let s = null; for (let k = 0; k < 6 && !s; k++) { const q = placeOnRoadNear(f.x, f.z, 35, 70); if (q && (k > 3 || hasLOS(q.x, q.z, f.x, f.z))) s = q; } if (s) { p.stuckT = 0; p.side = 0; p.on = true; p.leave = false; p.x = s.x; p.z = s.z; p.y = groundH(s.x, s.z); p.w.visible = true; p.car = null; } } }
  }
  for (const p of POL.foot) {
    if (!p.on) continue; const dx = f.x - p.x, dz = f.z - p.z, d = Math.hypot(dx, dz);
    if (p.leave || WANT.stars === 0 || d > 160) { if (d > 60 || p.leave === 'now') { p.on = false; p.w.visible = false; if (p.car) p.car.footOut = false; continue; } }
    let spd = 0;
    if (!p.leave && WANT.stars > 0 && G.mode === 'foot') {
      spd = BAL.footSpd[WANT.stars] || 7.3; let ux = dx / (d || 1), uz = dz / (d || 1);
      if (p.side) { p.sideT -= dt; const sx = -uz * p.side, sz = ux * p.side; ux = ux * 0.25 + sx; uz = uz * 0.25 + sz; const L = Math.hypot(ux, uz); ux /= L; uz /= L; if (p.sideT <= 0) p.side = 0; }
      const ox = p.x, oz = p.z; collideCircle(p.x + ux * spd * dt, p.z + uz * spd * dt, 0.35, col, true); p.x = col.x; p.z = col.z; p.h = Math.atan2(ux, uz);
      const moved = Math.hypot(p.x - ox, p.z - oz); p.stuckT = moved < spd * dt * 0.35 ? (p.stuckT || 0) + dt : Math.max(0, (p.stuckT || 0) - dt);
      if (p.stuckT > 0.6 && !p.side) { p.side = Math.random() < 0.5 ? -1 : 1; p.sideT = 1.6; p.stuckT = 0; } // wall-follow around buildings
      p.grab = d < BAL.footBustD ? (p.grab || 0) + dt : Math.max(0, (p.grab || 0) - dt * 2);
      if (p.grab > BAL.footBustT && !G.cut) { p.grab = 0; busted(); }
    } else if (p.car && Math.hypot(p.car.x - p.x, p.car.z - p.z) > 2) { const ex = p.car.x - p.x, ez = p.car.z - p.z, L = Math.hypot(ex, ez); spd = 4; p.x += ex / L * spd * dt; p.z += ez / L * spd * dt; p.h = Math.atan2(ex, ez); }
    else if (p.car) { p.on = false; p.w.visible = false; p.car.footOut = false; continue; }
    p.y = groundH(p.x, p.z); p.w.position.set(p.x, p.y, p.z); p.w.rotation.y = p.h; animateWalker(p.w, spd, dt, false);
  }
}
// ---------- busted / wasted
function clearPolice() {
  for (const c of POL.cars.slice()) if (c.g.visible && c !== activeCar) { c.block = false; despawnCar(c); }
  POL.blocks.length = 0; for (const p of POL.foot) { p.on = false; p.w.visible = false; }
  for (const c of POL.cars) c.footOut = false;
}
function busted() {
  if (G.cut) return; POL.bustT = 0; G.bustedN = (G.bustedN || 0) + 1;
  banner('ZATRZYMANY!', 'busted', 3200); sfxHit(0.5);
  const fine = Math.min(SAVE.money, 50 + Math.round(SAVE.money * 0.1));
  if (typeof missionFail === 'function') missionFail('Zatrzymała cię policja');
  G.cut = { t: 2.2, fn: () => {
    if (G.mode === 'car') { activeCar.vx = activeCar.vz = 0; enterExit(); }
    setStars(0); clearPolice(); if (fine) addMoney(-fine, 'mandat'); respawnAt(PLACES.komenda, 'Komenda Policji – wychodzisz za kaucją');
  } };
}
function wasted() {
  if (G.cut) return; G.wastedN = (G.wastedN || 0) + 1;
  banner('ROZBITY!', 'wasted', 3400);
  const fee = Math.min(SAVE.money, 75 + Math.round(SAVE.money * 0.05));
  if (typeof missionFail === 'function') missionFail('Auto wybuchło');
  G.cut = { t: 2.4, fn: () => {
    const c = activeCar; if (typeof ownWrecked === 'function') ownWrecked(c); if (c) { activeCar = null; G.mode = 'foot'; player.mesh.visible = true; if (c.rider) c.rider.visible = false; $('speedo').classList.add('hidden'); $('touch').classList.remove('incar'); $('tEnter').textContent = 'WSIĄDŹ'; }
    setStars(0); clearPolice(); if (fee) addMoney(-fee, 'rachunek ze szpitala'); respawnAt(PLACES.szpital, 'Szpital – poskładali cię jak nowego');
  } };
}
function respawnAt(pl, msg) {
  if (G.mode === 'car') enterExit();
  teleport(pl[0], pl[1]); player.h = G.yaw; updateVisibility(true); flash(); setTimeout(() => toast(msg, 2400), 400);
}
// ---------- damage, smoke, fire, explosion
function damageCar(c, n) {
  if (!c || c.wrecked || c.pooled || n <= 0) return;
  if (c === activeCar && G.cut) return;
  if (c.pai && c !== activeCar) n *= 0.35; // police cruisers are reinforced (they ram a lot)
  if (c.st) n *= c.st.armor; // model toughness + armour upgrade
  if (n <= 0) return;
  const was = c.hp; c.hp = Math.max(0, c.hp - n); if (c.hp <= 0 && !c.burn) { c.burn = BAL.burnT; if (c === activeCar) toast('🔥 Auto się pali! Wysiadaj (E)!', 2500); }
  if (c === activeCar && was >= 60 && c.hp < 60 && c.hp > 0) toast('Spod maski leci dym…', 1400);
  if (c === activeCar && was >= 15 && c.hp < 15 && c.hp > 0) toast('🔥 Silnik się zapala! Do warsztatu!', 2200);
  if (c === activeCar) hpHud();
}
function bustHud() {
  const b = $('bustbar'); if (!b) return; const k = POL.bustT / BAL.bustT;
  if (k < 0.06 || G.cut) { if (!b.classList.contains('hidden')) b.classList.add('hidden'); return; }
  b.classList.remove('hidden'); b.firstChild.style.width = Math.min(100, k * 100).toFixed(0) + '%';
}
function hpHud() {
  const b = $('hpbar'); if (!b) return; const c = activeCar;
  if (!c || G.mode !== 'car') { b.classList.add('hidden'); return; }
  b.classList.remove('hidden'); const i = b.firstChild; i.style.width = c.hp + '%'; i.style.background = c.hp > 60 ? '#5bd35b' : c.hp > 30 ? '#ffc21a' : '#ff4b3a';
}
function makeFx() {
  const cv = document.createElement('canvas'); cv.width = cv.height = 64; const g = cv.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 4, 32, 32, 30); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.6, 'rgba(255,255,255,0.75)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.beginPath(); g.arc(32, 32, 30, 0, 7); g.fill(); g.strokeStyle = 'rgba(42,33,28,0.9)'; g.lineWidth = 3; g.beginPath(); g.arc(32, 32, 27, 0, 7); g.stroke();
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; const fx = { list: [], tex };
  for (let i = 0; i < 64; i++) { const m = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: true }); const s = new THREE.Sprite(m); s.visible = false; scene.add(s); fx.list.push({ s, t: 0, life: 0 }); }
  return fx;
}
function emitFx(x, y, z, color, size, life, vy) {
  const p = POL.fx.list.find((q) => q.t >= q.life); if (!p) return;
  p.t = 0; p.life = life; p.vy = vy; p.size = size; p.s.material.color.set(color); p.s.position.set(x + (Math.random() - 0.5) * 0.8, y, z + (Math.random() - 0.5) * 0.8); p.s.visible = true;
}
function updateDamage(dt) {
  const f = focusXZ(); POL.fxT = (POL.fxT || 0) - dt; const emit = POL.fxT <= 0; if (emit) POL.fxT = 0.11;
  for (const c of cars) {
    if (!c.g.visible) continue;
    if (c.burn > 0) {
      c.burn -= dt; if (emit) { emitFx(c.x, (c.y || 0) + 1.3, c.z, Math.random() < 0.5 ? '#ff8a1e' : '#ffd23a', 1.4, 0.6, 3); emitFx(c.x, (c.y || 0) + 1.8, c.z, '#4a4442', 1.8, 1.6, 2.5); }
      if (c.burn <= 0) explode(c);
    } else if (emit && (c.hp < 60 || c.wrecked) && Math.hypot(c.x - f.x, c.z - f.z) < 150) {
      const hx = c.x + Math.sin(c.h) * 1.6, hz = c.z + Math.cos(c.h) * 1.6, hy = (c.y || 0) + 1.1;
      if (c.wrecked) emitFx(hx, hy, hz, '#3a3634', 1.0, 1.4, 2);
      else if (c.hp < 15) { emitFx(hx, hy - 0.1, hz, Math.random() < 0.5 ? '#ff8a1e' : '#ffd23a', 0.8, 0.45, 2.2); emitFx(hx, hy + 0.3, hz, '#4a4442', 1.3, 1.5, 2.4); } // stage 3: fire under the hood
      else if (c.hp < 35) emitFx(hx, hy, hz, '#5a5552', 1.1, 1.5, 2.2);                                                                                  // stage 2: dark smoke
      else if (Math.random() < 0.5) emitFx(hx, hy, hz, '#d8d4d0', 0.7, 1.1, 1.6);                                                                          // stage 1: light steam
    }
    if (c.wrecked && !c.pooled && c !== activeCar && !c.fromPool && !c.police && Math.hypot(c.x - f.x, c.z - f.z) > 420) unwreck(c);
  }
  for (const p of POL.fx.list) {
    if (p.t >= p.life) { if (p.s.visible) p.s.visible = false; continue; }
    p.t += dt; const k = p.t / p.life; p.s.position.y += p.vy * dt; const sc = p.size * (0.6 + k * 1.6); p.s.scale.set(sc, sc, 1); p.s.material.opacity = (1 - k) * 0.9;
  }
  if (activeCar && G.mode === 'car') { POL.hpT = (POL.hpT || 0) - dt; if (POL.hpT <= 0) { POL.hpT = 0.3; hpHud(); } } else if ($('hpbar') && !$('hpbar').classList.contains('hidden')) hpHud();
}
function explode(c) {
  c.wrecked = true; c.burn = 0; c.hp = 0; c.wreckPaint = c.color; recolorTag(c.geo, 1, 0x2b2726); recolorTag(c.geo, 2, 0x2b2726);
  c.vy = 6; c.vx *= 0.3; c.vz *= 0.3;
  for (let i = 0; i < 14; i++) emitFx(c.x, (c.y || 0) + 0.8 + Math.random() * 1.5, c.z, i % 3 ? '#ff7a1a' : '#ffe14a', 3.2, 0.9, 1 + Math.random() * 3);
  const f = focusXZ(); const d = Math.hypot(c.x - f.x, c.z - f.z);
  if (d < 120) { toast('BUM! 💥', 1200); sfxHit(1); }
  for (const o of cars) if (o !== c && o.g.visible && Math.hypot(o.x - c.x, o.z - c.z) < 6) { damageCar(o, 25); const nx = o.x - c.x, nz = o.z - c.z, L = Math.hypot(nx, nz) || 1; o.vx += nx / L * 6; o.vz += nz / L * 6; }
  for (const p of TR.peds) if (p.on && Math.hypot(p.x - c.x, p.z - c.z) < 7 && p.state !== 'fall') { p.state = 'fall'; p.t = 0; p.fvx = (p.x - c.x) * 2; p.fvz = (p.z - c.z) * 2; p.fh = p.h; }
  if (c === activeCar && G.mode === 'car') wasted();
  else if (c.pai) { /* wrecked police car stays until far away */ }
}
function unwreck(c) { c.wrecked = false; c.hp = 100; c.burn = 0; if (c.wreckPaint !== undefined) { recolorTag(c.geo, 1, c.police ? 0xf4f6fa : c.wreckPaint); if (c.police) recolorTag(c.geo, 2, 0x1f55c8); else if (c.stripe !== undefined) recolorTag(c.geo, 2, c.stripe); c.wreckPaint = undefined; } }
// ---------- Lakiernia (paint & repair shop)
function nearShop(r = 7) { const f = focusXZ(); return PLACES.shops.find((s) => Math.hypot(s.x - f.x, s.z - f.z) < r) || null; }
function shopHint() {
  const s = nearShop(9); if (!s) return null;
  if (G.mode === 'foot') return s.n + ' – wjedź tu autem: przemalowanie gubi pościg';
  return WANT.stars ? s.n + ': zatrzymaj się, by przemalować (50 zł)' : s.n + ': zatrzymaj się (E)';
}
function shopAction() { const s = nearShop(9); if (!s || G.mode !== 'car') return false; shopOpen(s); return true; }
function shopOpen(s) {
  POL.shop = s; const m = $('shopMenu'); m.classList.remove('hidden');
  $('shopTxt').textContent = s.n + ' · stan auta ' + Math.round(activeCar.hp) + '% · masz ' + SAVE.money + ' zł';
}
function shopClose() { $('shopMenu').classList.add('hidden'); if (POL.shop) POL.shop.cool = true; POL.shop = null; }
function shopBuy(what) {
  const c = activeCar; if (!c || !POL.shop) return shopClose();
  const price = what === 'paint' ? 100 : 50; if (SAVE.money < price) { toast('Za mało kasy! Potrzeba ' + price + ' zł', 1800); return; }
  if (what === 'paint') repaint(c); else { c.hp = 100; hpHud(); }
  addMoney(-price, what === 'paint' ? 'nowy lakier' : 'naprawa'); flash(); shopClose();
}
function repaint(c) {
  const pal = TOON_CAR_COLORS.filter((x) => x !== c.color); const col = pal[Math.floor(Math.random() * pal.length)];
  if (c.origColor === undefined) c.origColor = c.color; if (c.police) recolorTag(c.geo, 1, col); else c.setPaint(col); c.hp = 100; hpHud();
}
function updateShops(dt) {
  const t = performance.now() * 0.003;
  for (const s of PLACES.shops) { s.ring.material.opacity = 0.5 + 0.35 * Math.sin(t); s.can.rotation.y += dt; }
  const s = nearShop(7);
  if (!s) { for (const q of PLACES.shops) q.cool = false; if (POL.shop) shopClose(); return; }
  if (G.mode !== 'car' || activeCar.speed > 3 || s.cool || G.cut || (MIS.active && MIS.active.id === 'steal')) return;
  if (WANT.stars > 0) {
    if (SAVE.money >= 50) { repaint(activeCar); addMoney(-50, 'szybkie malowanie'); setStars(0); flash(); toast('Nowy lakier – policja cię nie poznaje! 🎨', 2400); s.cool = true; if (typeof missionEvent === 'function') missionEvent('lost'); }
    else { toast('Za mało kasy na lakier (50 zł)!', 1800); s.cool = true; }
  } else if (!POL.shop) shopOpen(s);
}
// ---------- Web Audio siren + hit sound
function audioCtx() {
  if (POL.ac === undefined) { try { POL.ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { POL.ac = null; } }
  if (POL.ac && POL.ac.state === 'suspended' && G.started) POL.ac.resume().catch(() => {});
  return POL.ac;
}
function sirenUpdate(dist, dt) {
  const want = dist < 260 && G.started && !G.paused; const ac = want || POL.siren ? audioCtx() : null; if (!ac) return;
  if (!POL.siren && want) {
    const o = ac.createOscillator(), o2 = ac.createOscillator(), g = ac.createGain(), lp = ac.createBiquadFilter();
    o.type = 'sawtooth'; o2.type = 'square'; lp.type = 'lowpass'; lp.frequency.value = 2200; g.gain.value = 0;
    o.connect(lp); o2.connect(lp); lp.connect(g); g.connect(ac.destination); o.start(); o2.start(); POL.siren = { o, o2, g, ph: 0 };
  }
  if (!POL.siren) return; const s = POL.siren; s.ph += dt;
  const fq = 720 + 520 * (0.5 + 0.5 * Math.sin(s.ph * 2 * Math.PI / 3.2)) * (WANT.stars >= 3 ? 1 : 1);
  const yelp = WANT.stars >= 3 ? (Math.floor(s.ph * 4) % 2 ? 1.25 : 1) : 1;
  s.o.frequency.setTargetAtTime(fq * yelp, ac.currentTime, 0.02); s.o2.frequency.setTargetAtTime(fq * yelp * 0.5, ac.currentTime, 0.02);
  const vol = want ? 0.07 * clamp(1 - dist / 260, 0, 1) ** 1.5 : 0; s.g.gain.setTargetAtTime(vol, ac.currentTime, 0.1);
  G.sirenVol = vol;
}
function sfxHit(k) {
  const ac = audioCtx(); if (!ac) return;
  const n = ac.createBufferSource(), b = ac.createBuffer(1, ac.sampleRate * 0.5, ac.sampleRate), d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 3);
  const g = ac.createGain(); g.gain.value = 0.25 * k; n.buffer = b; n.connect(g); g.connect(ac.destination); n.start();
}
