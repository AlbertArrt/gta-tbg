
// ======================= MISSIONS =======================
const MIS = { list: [], active: null, dlg: null, tgt: null, events: [], started: 0 };
function misPlace(x, z, r = 1.2) { const [fx, fz] = findFree(x, z, r); return { x: fx, z: fz }; }
function roadSpot(x, z, maxR = 200) { const rp = nearestRoadPoint(x, z, true, maxR); if (!rp) return { x, z, h: 0 }; const nx = -Math.cos(rp.h), nz = Math.sin(rp.h), off = Math.max(0, rp.road.width / 2 - 1.3); return { x: rp.x + nx * off, z: rp.z + nz * off, h: rp.h }; }
function misCar(color, spot, opts) {
  const [x, z] = findFree(spot.x, spot.z, 2.2); const c = new Car(scene, color, x, z, spot.h || 0, opts || {}); c.mission = true; cars.push(c);
  c.headMat.emissiveIntensity = G.night ? 2.5 : 0.2; c.tailMat.emissiveIntensity = G.night ? 1.5 : 0.3; return c;
}
function misDropCar(c) { if (!c || c === activeCar) { if (c) c.mission = false; return; } const i = cars.indexOf(c); if (i >= 0) cars.splice(i, 1); scene.remove(c.g); }
function inCar(c) { return G.mode === 'car' && activeCar === c; }
function at(t, r, maxV = 99) { const f = focusXZ(); return Math.hypot(f.x - t.x, f.z - t.z) < r && (G.mode === 'foot' || activeCar.speed < maxV); }
function randomAddress(cx, cz, rMin, rMax) {
  for (let k = 0; k < 40; k++) { const b = W.buildings[Math.floor(Math.random() * W.buildings.length)]; const x = b.cx, z = b.cz; const d = Math.hypot(x - cx, z - cz); if (d < rMin || d > rMax) continue; const s = roadSpot(x, z, 60); if (Math.hypot(s.x - x, s.z - z) > 45) continue; return { x: s.x, z: s.z }; }
  return roadSpot(cx + rMin, cz);
}
const MDEF = [
  { id: 'taxi', name: 'Taryfa do Dzikowa', giver: [-7, 10], who: 'Pan Zdzisiek, taksówkarz', reward: 150, col: '#ffd21f',
    text: 'Siemano! Mój kumpel spóźni się na wesele na zamku w Dzikowie. Weź moją taryfę i zawieź go tam w 2,5 minuty. Tylko nie porysuj lakieru!',
    start(m) { m.car = misCar(0xffd21f, roadSpot(m.gx + 8, m.gz + 4), { kind: 'taxi' }); m.stage = 0; m.dest = roadSpot(300, -575); },
    update(m) {
      if (m.car.wrecked) return 'Taksówka rozbita';
      if (m.stage === 0) { m.target = m.car; m.obj = 'Wsiądź do taksówki'; if (inCar(m.car)) { m.stage = 1; m.t = 150; toast('Pasażer: „Na zamek, szefie, i to migiem!”', 2600); } return; }
      m.target = m.dest; m.obj = 'Zawieź pasażera do Zamku w Dzikowie'; if (m.t <= 0) return 'Za wolno – pasażer spóźnił się na wesele';
      if (!inCar(m.car)) m.obj = 'Wróć do taksówki!';
      else if (at(m.dest, 12, 4)) return 'win';
    }, bonus: (m) => Math.round(Math.max(0, m.t)) },
  { id: 'pizza', name: 'Pizza z Harendy', giver: [-57, 72], who: 'Szef Pizzerii Harenda', reward: 120, col: '#ff7a2a',
    text: 'Mamma mia, cały Tarnobrzeg głodny! Trzy pizze, cztery minuty. Skuter stoi przed lokalem – możesz też biec, ale pizza wystygnie!',
    start(m) { m.car = misCar(0xd2452f, roadSpot(m.gx + 5, m.gz + 3), { scooter: true }); m.t = 240; m.left = 3; m.dest = randomAddress(m.gx, m.gz, 180, 520); },
    update(m) {
      if (m.t <= 0) return 'Pizza wystygła…'; m.target = m.dest; m.obj = 'Dostarcz pizzę (' + (4 - m.left) + '/3)' + (inCar(m.car) ? '' : ' · skuter czeka przy pizzerii');
      if (at(m.dest, 7, 5)) { m.left--; addMoney(10, 'napiwek'); if (!m.left) return 'win'; toast('„Dzięki! Pachnie obłędnie!” Następny adres na mapie', 2200); m.dest = randomAddress(m.dest.x, m.dest.z, 160, 450); }
    }, bonus: (m) => Math.round(m.t / 4) },
  { id: 'race', name: 'Wyścig uliczny', giver: [-87, 370], who: 'Kuba „Turbo”', reward: 250, col: '#ff3b3b',
    text: 'Ej, ty! Wyścig uliczny: spod Urzędu, przez dworzec kolejowy, aż na Serbinów. Kto przyjedzie ostatni, ten stawia kebaba!',
    start(m) {
      const s = roadSpot(m.gx, m.gz); m.car = misCar(0xe8503a, s);
      const n0 = nearestNode(s.x, s.z), n1 = nearestNode(478, 162), n2 = nearestNode(1216, -49);
      const p1 = astar(n0, n1) || [n0, n1], p2 = astar(n1, n2) || [n1, n2]; const pts = pathPoints(p1.concat(p2.slice(1)));
      m.cps = []; let acc = 0; let lx = s.x, lz = s.z;
      for (let i = 0; i < pts.length; i += 2) { acc += Math.hypot(pts[i] - lx, pts[i + 1] - lz); lx = pts[i]; lz = pts[i + 1]; if (acc > 140 || i >= pts.length - 2) { m.cps.push({ x: pts[i], z: pts[i + 1] }); acc = 0; } }
      m.path = pts; m.i = 0; m.stage = 0; m.rivals = [];
      const fwd = Math.atan2(pts[2] - s.x, pts[3] - s.z) || s.h;
      for (const [k, c] of [[1, 0x3d8fe0], [2, 0x45b65a]]) { const r = misCar(c, { x: s.x - Math.sin(fwd) * 7 * k, z: s.z - Math.cos(fwd) * 7 * k, h: fwd }); r.rv = { pi: 0, cp: 0, stuck: 0, rev: 0, skill: 0.86 + k * 0.03 }; m.rivals.push(r); }
      m.car.h = fwd; m.car.sync();
    },
    update(m, dt) {
      if (m.stage === 0) { m.target = m.car; m.obj = 'Wsiądź do czerwonego auta na starcie'; if (inCar(m.car)) { m.stage = 1; m.count = 3.5; } return; }
      if (m.stage === 1) { m.count -= dt; m.obj = 'Start za ' + Math.max(1, Math.ceil(m.count - 0.5)); m.target = m.cps[0]; if (m.count <= 0.5) { m.stage = 2; banner('START!', 'go', 900); m.t0 = performance.now(); } return; }
      for (const r of m.rivals) rivalDrive(r, m, dt);
      const c = m.cps[m.i]; m.target = c; let pos = 1; for (const r of m.rivals) if (r.rv.cp > m.i || (r.rv.cp === m.i && Math.hypot(r.x - c.x, r.z - c.z) < Math.hypot(focusXZ().x - c.x, focusXZ().z - c.z))) pos++;
      m.obj = 'Checkpoint ' + (m.i + 1) + '/' + m.cps.length + ' · miejsce ' + pos + '/3';
      if (at(c, 11)) { m.i++; if (m.i >= m.cps.length) { const first = m.rivals.every((r) => r.rv.cp < m.cps.length); return first ? 'win' : 'Kuba: „Kebab na ciebie!” – przegrałeś wyścig'; } }
      if (m.rivals.some((r) => r.rv.cp >= m.cps.length) && m.i < m.cps.length - 1 && !m.warned) { m.warned = true; toast('Rywal już na mecie!', 1500); }
      if ((performance.now() - m.t0) / 1000 > 300) return 'Za długo!';
    }, cleanup(m) { for (const r of m.rivals || []) misDropCar(r); } },
  { id: 'escape', name: 'Ucieczka spod PKS', giver: [-365, 933], who: 'Tajemniczy Gość', reward: 300, col: '#a66bd0',
    text: 'Psst… Gliny szukają kogoś w twojej kurtce. Wsiadaj w co chcesz i zgub ich w trzy minuty, a odpalę ci 300 zł. Lakiernia też się liczy!',
    start(m) { m.t = 180; setStars(3, 'misja'); },
    update(m) { m.target = null; m.obj = 'Zgub pościg (★★★)'; if (WANT.stars === 0 && m.t < 179) return 'win'; if (m.t <= 0) return 'Nie zdążyłeś zgubić policji'; } },
  { id: 'steal', name: 'Zgarnij auto prezesa', giver: [1216, -49], who: 'Mietek z Serbinowa', reward: 350, col: '#e6b422',
    text: 'Na osiedlu stoi złote auto prezesa. Zgarnij je i dowieź do Warsztatu. Policja się kapnie – a każda rysa to mniej kasy!',
    start(m) { const a = randomAddress(m.gx, m.gz, 160, 320); m.car = misCar(0xe6b422, roadSpot(a.x, a.z)); m.stage = 0; m.dest = roadSpot(1081 + 28, 471 - 10, 80); },
    update(m) {
      if (m.car.wrecked) return 'Złote auto spłonęło';
      if (m.stage === 0) { m.target = m.car; m.obj = 'Ukradnij złote auto'; if (inCar(m.car)) { m.stage = 1; setStars(Math.max(2, WANT.stars), 'kradzież auta prezesa'); } return; }
      m.target = m.dest; m.obj = inCar(m.car) ? 'Dowieź auto do Warsztatu (stan ' + Math.round(m.car.hp) + '%)' : 'Wróć do złotego auta!';
      if (inCar(m.car) && at(m.dest, 9, 4)) return 'win';
    }, pay: (m) => Math.round(350 * Math.max(0.2, m.car.hp / 100)) },
  { id: 'offroad', name: 'Rajd Głowackiego', giver: null, who: 'Duch Bartosza Głowackiego', reward: 400, col: '#22e6ff',
    text: 'Hej, śmiałku! Kosynierzy biegali szybciej niż ty jeździsz! Przejedź trasę off-road nad Jeziorem Tarnobrzeskim w mniej niż 4 minuty!',
    start(m) { m.t0 = performance.now(); m.t = 300; eggGo(); },
    update(m) { m.target = null; const r = EGG.race; m.obj = 'Rajd nad jeziorem – limit 4:00';
      if (r.done && r.lastAt > m.t0) return r.last < 240 ? 'win' : 'Czas ' + fmtT(r.last) + ' – za wolno!';
      if (!r.running && !r.done) return 'Zjechałeś z trasy'; if (m.t <= 0) return 'Koniec czasu'; } },
  { id: 'courier', name: 'Kurier z leków', giver: [478, 162], who: 'Pani Halinka ze stacji', reward: 200, col: '#45b65a',
    text: 'Paczka z lekami dla apteki przy szpitalu! Ostrożnie, to szkło – trzy stłuczki i po lekach. Masz 2,5 minuty, kochaneczku.',
    start(m) { m.car = misCar(0xf4f1ea, roadSpot(m.gx + 6, m.gz + 3)); m.stage = 0; m.hits = 0; m.dest = roadSpot(-165, 788); },
    update(m) {
      if (m.car.wrecked) return 'Paczka spłonęła';
      if (m.stage === 0) { m.target = m.car; m.obj = 'Wsiądź do białego dostawczaka'; if (inCar(m.car)) { m.stage = 1; m.t = 150; } return; }
      if (m.hits >= 3) return 'Leki potłuczone!'; if (m.t <= 0) return 'Apteka już zamknięta';
      m.target = m.dest; m.obj = 'Dowieź leki do apteki · stłuczki ' + m.hits + '/3'; if (inCar(m.car) && at(m.dest, 10, 4)) return 'win';
    }, impact(m) { if (m.stage === 1 && inCar(m.car)) { m.hits++; toast('Brzdęk! Uważaj na paczkę (' + m.hits + '/3)', 1300); } } },
  { id: 'final', name: 'Legenda Tarnobrzega', giver: [789, -1258], who: 'Wielki Szef z Muzeum Siarki', reward: 1000, col: '#ffffff', needs: 5,
    text: 'Ostatnia robota, młody. Cała policja w mieście będzie cię szukać. Dojedź do Zamku w Dzikowie i zgub ogon. Wtedy zostaniesz legendą Tarnobrzega!',
    start(m) { m.stage = 0; m.dest = roadSpot(300, -575); setStars(4, 'wielki skok'); m.t = 360; },
    update(m) {
      if (m.t <= 0) return 'Koniec czasu';
      if (m.stage === 0) { m.target = m.dest; m.obj = 'Dojedź do Dzikowa (★★★★)'; if (at(m.dest, 14)) { m.stage = 1; toast('Teraz zgub policję!', 2000); } if (WANT.stars === 0) setStars(3, 'pościg wraca'); return; }
      m.target = null; m.obj = 'Zgub pościg!'; if (WANT.stars === 0) return 'win';
    } },
];
function rivalDrive(r, m, dt) {
  const v = r.rv; if (v.cp >= m.cps.length || r.wrecked) { updateCar(r, dt, { thr: 0, steer: 0, hand: true }); return; }
  const P = m.path; while (v.pi < P.length / 2 - 1 && Math.hypot(P[v.pi * 2] - r.x, P[v.pi * 2 + 1] - r.z) < 10) v.pi++;
  const c = m.cps[v.cp]; if (Math.hypot(c.x - r.x, c.z - r.z) < 13) v.cp++;
  const k = Math.min(P.length / 2 - 1, v.pi + 1); const tx = P[v.pi * 2] * 0.6 + P[k * 2] * 0.4, tz = P[v.pi * 2 + 1] * 0.6 + P[k * 2 + 1] * 0.4;
  let ang = Math.atan2(tx - r.x, tz - r.z) - r.h; ang = Math.atan2(Math.sin(ang), Math.cos(ang));
  let thr = v.skill, steer = clamp(ang * 2.5, -1, 1), hand = false; if (Math.abs(ang) > 0.9 && r.speed > 10) thr = 0; if (Math.abs(ang) > 1.5 && r.speed > 14) hand = true;
  if (v.rev > 0) { v.rev -= dt; thr = -1; steer = -Math.sign(ang); } else { v.stuck = r.speed < 1 ? v.stuck + dt : 0; if (v.stuck > 1.5) { v.rev = 1; v.stuck = 0; } }
  if (Math.hypot(r.x - focusXZ().x, r.z - focusXZ().z) > 350) { // far away: just glide along the path so they stay competitive
    const tx2 = P[v.pi * 2], tz2 = P[v.pi * 2 + 1]; const d = Math.hypot(tx2 - r.x, tz2 - r.z) || 1; const s = 17 * dt; r.x += (tx2 - r.x) / d * Math.min(s, d); r.z += (tz2 - r.z) / d * Math.min(s, d); r.h = Math.atan2(tx2 - r.x, tz2 - r.z) || r.h; r.sync(); return;
  }
  updateCar(r, dt, { thr, steer, hand });
}
function initMissions() {
  MIS.list = MDEF.map((d) => ({ ...d, done: !!SAVE.done[d.id] }));
  for (const m of MIS.list) {
    let gx, gz; if (m.id === 'offroad') { gx = EGG.mon.x + 5; gz = EGG.mon.z + 5; } else { gx = m.giver[0]; gz = m.giver[1]; }
    const p = misPlace(gx + (m.id === 'taxi' ? 12 : 0), gz + (m.id === 'taxi' ? 9 : 0), 1.2); m.gx = p.x; m.gz = p.z; m.cool = Math.hypot(player.x - p.x, player.z - p.z) < 12; m.obj3 = makeGiver(p.x, p.z, m.col, m.who);
  }
  MIS.tgt = makeTarget();
  const hud = $('hud'); const mh = document.createElement('div'); mh.id = 'mhud'; mh.className = 'hidden'; hud.appendChild(mh);
  const dl = document.createElement('div'); dl.id = 'dialog'; dl.className = 'cdialog hidden';
  dl.innerHTML = '<div class="who" id="dlgWho"></div><h3 id="dlgTitle"></h3><p id="dlgText"></p><div class="reward" id="dlgReward"></div><div class="btns"><button id="dlgYes">Przyjmij (E)</button><button id="dlgNo" class="sec">Nie teraz (Esc)</button></div>';
  document.body.appendChild(dl);
  $('dlgYes').onclick = () => dialogAction(); $('dlgNo').onclick = () => dialogClose();
  for (const id of ['dialog', 'shopMenu']) { $(id).addEventListener('touchstart', (e) => e.stopPropagation(), { passive: true }); $(id).addEventListener('mousedown', (e) => e.stopPropagation()); }
}
function makeGiver(x, z, col, who) {
  const g = new THREE.Group(); g.position.set(x, groundH(x, z), z);
  const c = new THREE.Color(col);
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 26, 16, 1, true), new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending })); beam.position.y = 13; g.add(beam);
  const ring = new THREE.Mesh(new THREE.RingGeometry(1.4, 1.9, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.9, depthWrite: false })); ring.position.y = 0.22; g.add(ring);
  const w = makeWalker({ shirt: c.getHex(), cap: 0x2a211c }); g.add(w);
  const ex = labelSprite('!', col, 1.6); ex.position.y = 3.2; g.add(ex);
  const lab = labelSprite(who, col, 6); lab.position.y = 4.4; lab.visible = false; g.add(lab);
  scene.add(g); return { g, beam, ring, w, ex, lab };
}
function makeTarget() {
  const g = new THREE.Group(); const col = new THREE.Color('#ffd21f');
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, 60, 20, 1, true), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.25, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending })); beam.position.y = 30; g.add(beam);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(5, 0.45, 8, 40).rotateX(Math.PI / 2), mkMat({ color: col, emissive: col, emissiveIntensity: 0.6 })); ring.position.y = 0.5; g.add(ring);
  const arrow = new THREE.Mesh(new THREE.ConeGeometry(1.2, 2.2, 4).rotateX(Math.PI), mkMat({ color: col, emissive: col, emissiveIntensity: 0.6 })); arrow.position.y = 6; g.add(arrow);
  g.visible = false; scene.add(g); return { g, beam, ring, arrow };
}
function giverOpen(m) { return !MIS.active && !m.busy && (!m.needs || MIS.list.filter((q) => q.done).length >= m.needs); }
function nearGiver() {
  const f = focusXZ(); for (const m of MIS.list) if (giverOpen(m) && Math.hypot(f.x - m.gx, f.z - m.gz) < (G.mode === 'car' ? 7 : 3.6)) return m; return null;
}
function missionHint() {
  if (MIS.active) return null; const m = nearGiver(); if (!m) return null;
  return (isTouch ? 'Dotknij AKCJA' : 'E') + ': porozmawiaj – ' + m.who + ' (' + m.name + ')';
}
function missionAction() { const m = nearGiver(); if (!m) return false; dialogOpen(m); return true; }
function dialogOpen(m) {
  MIS.dlg = m; G.paused = true; G.dialogOpen = true; if (document.pointerLockElement) document.exitPointerLock();
  $('dlgWho').textContent = m.who; $('dlgTitle').textContent = (m.done ? '✔ ' : '') + m.name; $('dlgText').textContent = '„' + m.text + '”';
  $('dlgReward').textContent = 'Nagroda: ' + m.reward + ' zł' + (m.done ? ' · już zaliczona – możesz powtórzyć' : '');
  $('dialog').classList.remove('hidden');
}
function dialogClose() { if (!MIS.dlg) return; const m = MIS.dlg; m.cool = true; MIS.dlg = null; G.dialogOpen = false; G.paused = false; clock.getDelta(); $('dialog').classList.add('hidden'); }
function dialogAction() { if (!MIS.dlg) return false; const m = MIS.dlg; dialogClose(); missionStart(m); return true; }
function missionStart(m) {
  if (MIS.active) return; MIS.active = m; m.t = undefined; m.target = null; m.obj = ''; m.stage = 0; m.car = null; m.startAt = performance.now();
  m.start(m); MIS.events.push({ id: m.id, ev: 'start', t: performance.now() });
  banner(m.name, 'mstart', 2000); $('mhud').classList.remove('hidden');
}
function missionEnd(ok, why) {
  const m = MIS.active; if (!m) return; MIS.active = null; MIS.tgt.g.visible = false; $('mhud').classList.add('hidden');
  if (m.cleanup) m.cleanup(m); if (m.car) { misDropCarLater(m.car); m.car = null; }
  MIS.events.push({ id: m.id, ev: ok ? 'pass' : 'fail', why, t: performance.now() });
  if (ok) {
    const pay = m.pay ? m.pay(m) : m.reward + (m.bonus ? m.bonus(m) : 0);
    m.done = true; SAVE.done[m.id] = true; addMoney(pay); saveGame();
    banner('MISJA ZALICZONA!\n+' + pay + ' zł', 'pass', 3600); MIS.lastPay = pay;
    if (m.id !== 'final' && MIS.list.filter((q) => q.done).length === 5 && !SAVE.finalHint) { SAVE.finalHint = true; saveGame(); setTimeout(() => toast('Odblokowano finał! Wielki Szef czeka przy Muzeum Siarki', 4000), 3800); }
    if (m.id === 'final') setTimeout(() => banner('LEGENDA TARNOBRZEGA! 🏆', 'pass', 5000), 3800);
  } else { banner('MISJA NIEUDANA\n' + (why || ''), 'fail', 3200); }
  m.cool = true;
}
function misDropCarLater(c) { if (c === activeCar) { c.mission = false; return; } c.dropAt = performance.now(); MIS.drop = MIS.drop || []; MIS.drop.push(c); }
function missionFail(why) { if (MIS.active) missionEnd(false, why); }
function missionImpact(v) { const m = MIS.active; if (m && m.impact) m.impact(m, v); }
function missionEvent(ev) { /* hook: 'lost' when police chase ends */ MIS.lastEvent = ev; }
function updateMissions(dt) {
  const f = focusXZ(); const tt = performance.now() * 0.003;
  for (const m of MIS.list) {
    const o = m.obj3; const show = giverOpen(m); o.g.visible = show; if (!show) continue;
    const d = Math.hypot(f.x - m.gx, f.z - m.gz); o.beam.material.opacity = 0.16 + 0.1 * Math.sin(tt + m.gx); o.ex.position.y = 3.2 + Math.sin(tt * 1.5) * 0.25; o.lab.visible = d < 40;
    o.w.rotation.y = Math.atan2(f.x - m.gx, f.z - m.gz);
    if (m.cool && d > 9) m.cool = false;
    if (!m.cool && !MIS.dlg && d < (G.mode === 'car' ? 6 : 3) && (G.mode === 'foot' || activeCar.speed < 3) && !G.cut) dialogOpen(m);
  }
  if (MIS.drop) for (const c of MIS.drop.slice()) if (c !== activeCar && Math.hypot(c.x - f.x, c.z - f.z) > 200) { misDropCar(c); MIS.drop.splice(MIS.drop.indexOf(c), 1); }
  const m = MIS.active; if (!m) return;
  if (m.t !== undefined) m.t -= dt;
  const r = m.update(m, dt);
  if (r === 'win') return missionEnd(true); if (r) return missionEnd(false, r);
  const T = m.target; MIS.tgt.g.visible = !!T && !(T === activeCar);
  if (T) { MIS.tgt.g.position.set(T.x, groundH(T.x, T.z), T.z); MIS.tgt.arrow.position.y = (T instanceof Car ? 4.5 : 6) + Math.sin(tt * 2) * 0.5; MIS.tgt.ring.visible = !(T instanceof Car); MIS.tgt.arrow.rotation.y += dt * 2; }
  const tm = m.t !== undefined && m.t >= 0 ? ' · ⏱ ' + fmtT(Math.max(0, m.t)).slice(0, 5) : '';
  const txt = '<b>' + m.name + '</b><span>' + m.obj + tm + '</span>'; if (MIS.hudTxt !== txt) { MIS.hudTxt = txt; $('mhud').innerHTML = txt; }
}
function drawMissionMinimap(g, sc) {
  g.lineWidth = 2 / sc; g.strokeStyle = '#2a211c';
  for (const m of MIS.list) { if (!giverOpen(m)) continue; g.fillStyle = m.col; g.beginPath(); g.arc(m.gx, m.gz, 8 / sc, 0, 7); g.fill(); g.stroke(); g.fillStyle = '#2a211c'; g.font = 'bold ' + (11 / sc) + 'px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('!', m.gx, m.gz + 0.5 / sc); }
  const T = MIS.active && MIS.active.target; if (T && T !== activeCar) { g.fillStyle = '#ffd21f'; g.beginPath(); g.moveTo(T.x, T.z - 11 / sc); g.lineTo(T.x + 8 / sc, T.z); g.lineTo(T.x, T.z + 11 / sc); g.lineTo(T.x - 8 / sc, T.z); g.closePath(); g.fill(); g.stroke(); }
  if (MIS.active && MIS.active.cps) { g.fillStyle = '#ff3b3b'; for (const r of MIS.active.rivals || []) { g.beginPath(); g.arc(r.x, r.z, 5 / sc, 0, 7); g.fill(); } }
  for (const c of POL.cars) if (c.g.visible && c !== activeCar && (c.pai || c.block || c.patrol)) { const b = Math.floor(performance.now() / 250) % 2; g.fillStyle = c.patrol ? '#3d6fe0' : (b ? '#ff2a2a' : '#2a5cff'); g.beginPath(); g.arc(c.x, c.z, 6 / sc, 0, 7); g.fill(); g.stroke(); }
  for (const p of POL.foot) if (p.on) { g.fillStyle = '#2a5cff'; g.beginPath(); g.arc(p.x, p.z, 4 / sc, 0, 7); g.fill(); }
  g.fillStyle = '#ff3fa4'; for (const s of PLACES.shops) { g.beginPath(); g.arc(s.x, s.z, 6 / sc, 0, 7); g.fill(); g.stroke(); }
}
