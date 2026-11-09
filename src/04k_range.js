// ======================= STRZELNICA ZWIERZYNIEC =======================
// Osobna minigra przy Lesie Zwierzyniec (ul. Borów). W mieście nie ma broni.
const RANGE = {
  x: 2375, z: -1694, h: Math.PI,
  on: false, phase: 'idle', t: 0, score: 0, hits: 0, shots: 0, combo: 0, bestCombo: 0,
  mag: 5, reserve: 10, reload: 0, spawnT: 0, ax: 0, ay: 0, cool: 0, kick: 0, flash: 0, pop: 0, wave: null,
};
const RANGE_KINDS = {
  pumpkin: { pts: 12, r: 0.48, col: 0xe07a1f, rib: 0xc45e12 },
  melon: { pts: 22, r: 0.36, col: 0xc6e07a, rib: 0x6a9a32 },
  water: { pts: 36, r: 0.44, col: 0x2f9a48, rib: 0x145c28 },
  gold: { pts: 55, r: 0.36, col: 0xf6c431, rib: 0xfff1a8 },
};
const RANGE_WAVES = [
  { id: 1, t0: 0, t1: 15, name: 'Rozgrzewka', kinds: ['pumpkin'], modes: ['rail'], speed: 0.9 },
  { id: 2, t0: 17, t1: 34, name: 'Tory i wahadła', kinds: ['pumpkin', 'melon', 'melon'], modes: ['rail', 'swing'], speed: 1.35 },
  { id: 3, t0: 36, t1: 50, name: 'Wyskakujące', kinds: ['melon', 'water', 'water'], modes: ['pop', 'swing'], speed: 1.8 },
  { id: 4, t0: 50, t1: 60, name: 'Złote owoce', kinds: ['gold'], modes: ['rail', 'pop'], speed: 1.5 },
];
const rangeV = new THREE.Vector3(), rangeV2 = new THREE.Vector3();
const rangeRay = new THREE.Raycaster();
let rangeStand = null, rangeBack = null, rangeRifle = null, rangeMuzzle = null;
let rangeLive = [], rangeDebris = [], rangeHoles = [], rangeHoleN = 0;

function rangeSimple() { return settings.quality === 'low'; }
function rangeCap() { return settings.quality === 'low' ? 2 : (settings.quality === 'high' ? 4 : 3); }
function rangeWave(t) { for (const w of RANGE_WAVES) if (t >= w.t0 && t < w.t1) return w; return null; }
function rangeReloading(t) { return (t >= 15 && t < 17) || (t >= 34 && t < 36) || RANGE.reload > 0; }
function rangeBox(g, w, h, d, x, y, z, col) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mkMat({ color: col }));
  m.position.set(x, y, z); m.castShadow = true; g.add(m); return m;
}
function rangeBoard(text) {
  const cv = document.createElement('canvas'); cv.width = 1024; cv.height = 192; const c = cv.getContext('2d');
  c.fillStyle = '#2a211c'; c.fillRect(0, 0, 1024, 192); c.fillStyle = '#ffd21f';
  c.font = 'bold 58px Fredoka, system-ui, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillText(text, 512, 100);
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(5.6, 0.95), new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }));
  m.rotation.y = Math.PI; return m;
}
function rangeNum(n) {
  const cv = document.createElement('canvas'); cv.width = 128; cv.height = 128; const c = cv.getContext('2d');
  c.fillStyle = '#ffd21f'; c.fillRect(0, 0, 128, 128); c.strokeStyle = '#2a211c'; c.lineWidth = 10; c.strokeRect(6, 6, 116, 116);
  c.fillStyle = '#2a211c'; c.font = 'bold 78px Fredoka, system-ui, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillText(String(n), 64, 70);
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false, fog: false }));
  s.scale.set(0.62, 0.62, 1); return s;
}

function initRange() {
  const g = new THREE.Group(); g.position.set(RANGE.x, 0, RANGE.z); g.rotation.y = RANGE.h; rangeStand = g;
  const wood = 0xc4894a, dark = 0x6b3a22, roof = 0xc4553a, sand = 0xe7d3a4, hay = 0xe2c56a, ink = 0x2a211c;
  rangeBox(g, 8.4, 0.08, 14.2, 0, 0.04, 5.2, sand);
  rangeBox(g, 7.4, 0.16, 2.4, 0, 2.55, -1.55, roof);
  for (let i = 0; i < 6; i++) rangeBox(g, 1.05, 0.1, 0.18, -2.6 + i * 1.05, 2.28, -0.42, i % 2 ? 0xf4f1ea : roof);
  rangeBox(g, 0.28, 2.2, 2.6, -3.45, 1.1, -1.3, wood); rangeBox(g, 0.28, 2.2, 2.6, 3.45, 1.1, -1.3, wood);
  rangeBox(g, 0.16, 2.2, 0.16, -3.45, 1.1, -2.5, ink); rangeBox(g, 0.16, 2.2, 0.16, 3.45, 1.1, -2.5, ink);
  rangeBox(g, 3.4, 0.72, 0.42, 0, 0.78, -0.15, 0xf4f1ea);
  rangeBox(g, 3.5, 0.08, 0.5, 0, 1.16, -0.12, wood);
  rangeBox(g, 0.35, 0.7, 10.4, -3.7, 0.4, 6.2, dark); rangeBox(g, 0.35, 0.7, 10.4, 3.7, 0.4, 6.2, dark);
  for (const x of [-1.7, 0, 1.7]) {
    rangeBox(g, 0.08, 0.08, 10.4, x, 1.02, 6.5, 0x8d97a3);
    rangeBox(g, 0.08, 0.55, 0.08, x, 0.72, 2.2, ink);
    rangeBox(g, 0.08, 0.55, 0.08, x, 0.72, 11.2, ink);
    const tag = rangeNum(x > 0 ? 1 : x < 0 ? 3 : 2); tag.position.set(x, 1.72, 2.35); g.add(tag);
  }
  const board = new THREE.Group(); board.position.set(0, 1.7, 12.25); g.add(board);
  rangeBack = rangeBox(board, 7.4, 3.5, 0.26, 0, 0, 0, 0xd7b07a);
  rangeBox(board, 7.7, 0.16, 0.32, 0, 1.83, 0, ink); rangeBox(board, 7.7, 0.16, 0.32, 0, -1.83, 0, ink);
  rangeBox(board, 0.16, 3.7, 0.32, -3.78, 0, 0, ink); rangeBox(board, 0.16, 3.7, 0.32, 3.78, 0, 0, ink);
  for (const x of [-1.7, 0, 1.7]) rangeBox(board, 1.7, 2.15, 0.06, x, 0.05, -0.16, 0xf6ead2);
  for (const x of [-2.4, 0, 2.4]) rangeBox(g, 1.15, 0.42, 0.62, x, 0.28, 11.55, hay);
  rangeBox(g, 0.85, 0.5, 0.7, -2.55, 0.32, -2.55, wood);
  const sign = rangeBoard('STRZELNICA ZWIERZYNIEC'); sign.position.set(0, 1.62, -2.95); g.add(sign);
  const ring = new THREE.Mesh(new THREE.RingGeometry(2.3, 3.05, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xe8503a, transparent: true, opacity: 0.9, depthWrite: false }));
  ring.position.set(0, 0.1, -4.6); g.add(ring); RANGE.ring = ring;
  scene.add(g); g.updateMatrixWorld(true);
  rangeV.set(0, 0, -4.6).applyMatrix4(g.matrixWorld); RANGE.px = rangeV.x; RANGE.pz = rangeV.z;
  const seg = rangeSimple() ? 7 : 10;
  RANGE.geos = {};
  for (const k in RANGE_KINDS) RANGE.geos[k] = new THREE.SphereGeometry(RANGE_KINDS[k].r, seg, seg);
  for (const [kind, x, y, z] of [['pumpkin', -2.15, 0.85, -2.5], ['melon', -2.55, 0.78, -2.15], ['water', -1.75, 0.78, -2.15]]) {
    const f = rangeFruit(kind); f.position.set(x, y, z); f.scale.setScalar(0.72); g.add(f);
  }
  for (let i = 0; i < 20; i++) {
    const h = new THREE.Mesh(new THREE.CircleGeometry(0.11, 10), new THREE.MeshBasicMaterial({ color: 0x2a211c }));
    h.visible = false; rangeBack.add(h); rangeHoles.push(h);
  }
  for (let i = 0; i < (rangeSimple() ? 10 : 22); i++) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.08, 5, 4), mkMat({ color: 0xfff1ea }));
    m.visible = false; scene.add(m); rangeDebris.push({ m, v: new THREE.Vector3(), t: 0, life: 0 });
  }
  buildRangeHud();
  if (W.travel) W.travel.push(['🎯 Strzelnica Zwierzyniec', RANGE.px, RANGE.pz]);
  if (typeof MIS !== 'undefined') {
    MIS.list.push({
      id: 'strzelnica', name: 'Strzelnica Zwierzyniec', who: 'Strzelnica', where: 'Las Zwierzyniec, ul. Borów',
      reward: 200, side: true, range: true, bestKey: 'strzelnica', bestLow: false, col: '#e8503a',
      text: 'Wiatrówka sportowa, trzy tory i tylko owoce: dynie, melony, arbuzy. Minuta, 15 nabojów. Wynik z celności, serii i czasu. Przyzwoity przebieg to około 150–250 zł. W mieście nie ma strzelania.',
      gx: RANGE.px, gz: RANGE.pz, done: !!(SAVE.done && SAVE.done.strzelnica), obj3: null, cool: false,
    });
  }
  Object.assign(G, {
    rangeEnter, rangeExit, rangeFire, rangeAimWorld,
    rangeState: () => ({ on: RANGE.on, phase: RANGE.phase, t: +RANGE.t.toFixed(2), score: RANGE.score, hits: RANGE.hits, shots: RANGE.shots, mag: RANGE.mag, reserve: RANGE.reserve, combo: RANGE.combo, pay: rangePay(RANGE.score), best: SAVE.best.strzelnica || 0, n: rangeLive.filter((q) => q.on).length, x: RANGE.px, z: RANGE.pz, targets: rangeLive.filter((q) => q.on && q.up).map((q) => { const p = q.g.getWorldPosition(new THREE.Vector3()); return { x: p.x, y: p.y, z: p.z, kind: q.kind }; }) }),
  });
}
function buildRangeHud() {
  const el = document.createElement('div'); el.id = 'rangeHud'; el.className = 'hidden';
  el.innerHTML = '<div id="rangeTop"><b id="rangeWave">Strzelnica</b><span id="rangeTime">1:00</span><span id="rangeScore">0 pkt</span></div><div id="rangeCombo"></div><div id="rangeAmmo"><div id="rangePips"><i></i><i></i><i></i><i></i><i></i></div><span id="rangeLeft">zostało 15 / 15</span></div><div id="rangeCross"></div><div id="rangePop"></div><div id="rangeEnd" class="hidden"><b id="rangeEndTitle">Koniec przebiegu</b><ul><li><span>Trafienia</span><b id="rangeStatHits"></b></li><li><span>Najlepsza seria</span><b id="rangeStatCombo"></b></li><li><span>Punkty</span><b id="rangeStatScore"></b></li><li><span>Wypłata</span><b id="rangeStatPay"></b></li><li><span>Rekord</span><b id="rangeStatBest"></b></li></ul><p id="rangeEndNote"></p><div class="row"><button type="button" id="rangeAgain">Jeszcze raz</button><button type="button" id="rangeLeave">Wyjdź</button></div></div><button type="button" id="rangeFire">STRZAŁ</button><button type="button" id="rangeOut">Wyjdź</button>';
  document.body.appendChild(el);
  $('rangeFire').onclick = (e) => { e.stopPropagation(); rangeFire(); };
  $('rangeOut').onclick = (e) => { e.stopPropagation(); rangeExit(); };
  $('rangeLeave').onclick = (e) => { e.stopPropagation(); rangeExit(); };
  $('rangeAgain').onclick = (e) => { e.stopPropagation(); rangeBegin(); };
  for (const id of ['rangeFire', 'rangeOut', 'rangeLeave', 'rangeAgain', 'rangeEnd']) {
    const n = $(id); if (!n) continue;
    n.addEventListener('pointerdown', (e) => e.stopPropagation());
  }
}
function rangeNear() {
  if (!rangeStand) return false;
  const f = focusXZ(); return Math.hypot(f.x - RANGE.px, f.z - RANGE.pz) < (G.mode === 'car' ? 8 : 5.5);
}
function rangeHint() {
  if (!rangeStand || RANGE.on) return null;
  if (!rangeNear()) return null;
  if (WANT.stars) return 'Strzelnica zamknięta, dopóki ściga cię policja';
  if (G.mode === 'car') return 'Strzelnica Zwierzyniec: wysiądź, potem ' + (isTouch ? 'AKCJA' : 'E');
  return (isTouch ? 'AKCJA' : 'E') + ': Strzelnica Zwierzyniec – wiatrówka, tylko owoce';
}
function rangeAction() {
  if (RANGE.on) { rangeExit(); return true; }
  if (!rangeNear() || G.cut) return false;
  if (RANGE.cool > 0) return true;
  if (WANT.stars) { toast('Najpierw zgub policję. Na strzelnicy nie ma kryjówki.', 1800); return true; }
  if (G.mode !== 'foot') { toast('Wysiądź – na stanowisko wchodzisz pieszo.', 1600); return true; }
  rangeEnter(); return true;
}
function rangeEnter() {
  if (RANGE.on) return;
  RANGE.on = true; G.inRange = true; RANGE.backX = player.x; RANGE.backZ = player.z; RANGE.backH = player.h;
  player.mesh.visible = false; player.vx = 0; player.vz = 0;
  if (document.pointerLockElement) document.exitPointerLock();
  rangeStand.updateMatrixWorld(true);
  if (!rangeRifle) {
    rangeRifle = new THREE.Group();
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.08, 0.36), mkMat({ color: 0x8a5a32 }));
    const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.02, 0.52), mkMat({ color: 0x2a211c })); barrel.position.set(0, 0.05, -0.32);
    const fore = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.04, 0.22), mkMat({ color: 0xa56b3c })); fore.position.set(0, 0.035, -0.16);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.1, 0.05), mkMat({ color: 0x6b4228 })); grip.position.set(0, -0.04, 0.04);
    rangeMuzzle = new THREE.Mesh(new THREE.SphereGeometry(0.045, 6, 5), new THREE.MeshBasicMaterial({ color: 0xfff1c2 }));
    rangeMuzzle.position.set(0, 0.05, -0.6); rangeMuzzle.visible = false;
    rangeRifle.add(stock, barrel, fore, grip, rangeMuzzle); camera.add(rangeRifle);
  }
  rangeRifle.visible = true; rangeRifle.position.set(0.46, -0.22, -0.72); rangeRifle.scale.setScalar(1.45);
  $('hud').classList.add('rangeHide');
  $('rangeHud').classList.remove('hidden');
  $('touch').classList.add('range');
  rangeBegin();
}
function rangeBegin() {
  for (const t of rangeLive) { t.g.visible = false; rangeStand.remove(t.g); }
  rangeLive.length = 0;
  for (const h of rangeHoles) h.visible = false;
  for (const d of rangeDebris) d.m.visible = false;
  rangeHoleN = 0;
  Object.assign(RANGE, { phase: 'intro', t: 0, score: 0, hits: 0, shots: 0, combo: 0, bestCombo: 0, mag: 5, reserve: 10, reload: 0, spawnT: 0.2, ax: 0, ay: 0, did1: false, did2: false, kick: 0, flash: 0, pop: 0, wave: null });
  $('rangeEnd').classList.add('hidden'); $('rangeHud').classList.remove('done');
  rangeHud();
}
function rangeExit() {
  if (!RANGE.on) return;
  RANGE.on = false; G.inRange = false; RANGE.phase = 'idle';
  player.mesh.visible = true;
  player.x = RANGE.backX; player.z = RANGE.backZ; player.h = RANGE.backH; player.y = groundH(player.x, player.z);
  player.mesh.position.set(player.x, player.y, player.z); player.mesh.rotation.y = player.h;
  G.camOverride = null; if (typeof applyFog === 'function') applyFog();
  if (rangeRifle) rangeRifle.visible = false;
  $('hud').classList.remove('rangeHide');
  $('rangeHud').classList.add('hidden'); $('rangeHud').classList.remove('done');
  $('touch').classList.remove('range');
  G.keys.clear(); RANGE.cool = 1.2;
}
function rangePay(score) { return clamp(Math.round(score * 0.82), 0, 280); }
function rangeFinish() {
  if (RANGE.phase === 'done') return;
  RANGE.phase = 'done';
  const acc = RANGE.shots ? RANGE.hits / RANGE.shots : 0;
  RANGE.score += Math.round(acc * 60);
  const pay = rangePay(RANGE.score);
  const prev = SAVE.best.strzelnica;
  const improved = prev == null || RANGE.score > prev + 0.5;
  if (improved) SAVE.best.strzelnica = Math.round(RANGE.score);
  const m = MIS.list.find((q) => q.id === 'strzelnica');
  if (m) { m.done = true; SAVE.done.strzelnica = true; }
  if (SAVE.claimed) SAVE.claimed.strzelnica = true;
  if (pay) addMoney(pay, 'strzelnica');
  else saveGame();
  $('rangeEndTitle').textContent = improved ? 'Nowy rekord!' : 'Koniec przebiegu';
  $('rangeStatHits').textContent = RANGE.hits + ' / ' + Math.max(RANGE.shots, RANGE.hits);
  $('rangeStatCombo').textContent = '×' + RANGE.bestCombo;
  $('rangeStatScore').textContent = RANGE.score + ' pkt';
  $('rangeStatPay').textContent = pay + ' zł';
  $('rangeStatBest').textContent = Math.round(SAVE.best.strzelnica || RANGE.score) + ' pkt';
  $('rangeEndNote').textContent = improved ? 'Zapisane w dzienniku.' : ('Rekord bez zmian: ' + Math.round(prev) + ' pkt.');
  $('rangeEnd').classList.remove('hidden'); $('rangeHud').classList.add('done');
  rangeHud();
}
function rangeHud() {
  const left = RANGE.phase === 'play' ? Math.max(0, 60 - RANGE.t) : (RANGE.phase === 'intro' ? 60 : 0);
  const w = rangeWave(RANGE.t);
  const re = rangeReloading(RANGE.t) && RANGE.phase === 'play';
  $('rangeWave').textContent = RANGE.phase === 'intro' ? 'Gotowi…' : (RANGE.phase === 'done' ? 'Wynik' : (re ? 'Przeładowanie' : (w ? w.name : 'Strzelnica')));
  $('rangeTime').textContent = '0:' + String(Math.ceil(left)).padStart(2, '0');
  $('rangeScore').textContent = RANGE.score + ' pkt';
  const pips = $('rangePips'); if (pips) for (let i = 0; i < 5; i++) pips.children[i].className = i < RANGE.mag ? 'on' : '';
  const leftN = RANGE.mag + RANGE.reserve;
  $('rangeLeft').textContent = re ? 'przeładowanie' : ('zostało ' + leftN + ' / 15');
  $('rangeCombo').textContent = RANGE.combo > 1 ? ('seria ×' + RANGE.combo) : '';
  const c = $('c').getBoundingClientRect();
  const cross = $('rangeCross');
  cross.style.left = ((RANGE.ax * 0.5 + 0.5) * c.width) + 'px';
  cross.style.top = ((-RANGE.ay * 0.5 + 0.5) * c.height) + 'px';
  const pop = $('rangePop');
  pop.style.left = cross.style.left; pop.style.top = cross.style.top;
  pop.style.opacity = RANGE.pop > 0 ? String(Math.min(1, RANGE.pop * 2)) : '0';
  if (rangeRifle) {
    const k = RANGE.kick || 0;
    rangeRifle.position.set(0.46, -0.22, -0.72 + k * 0.12);
    rangeRifle.rotation.set(0.08 + k * 0.25 - RANGE.ay * 0.08, -0.05 - RANGE.ax * 0.12, 0);
  }
  if (rangeMuzzle) rangeMuzzle.visible = RANGE.flash > 0;
}
function rangeAimEvent(e) {
  const r = $('c').getBoundingClientRect();
  RANGE.ax = clamp(((e.clientX - r.left) / r.width) * 2 - 1, -0.82, 0.82);
  RANGE.ay = clamp(-(((e.clientY - r.top) / r.height) * 2 - 1), -0.55, 0.42);
  rangeHud();
}
function rangeAimWorld(x, y, z) {
  rangeStand.updateMatrixWorld(true);
  rangeV.set(x, y, z).project(camera);
  RANGE.ax = clamp(rangeV.x, -0.82, 0.82); RANGE.ay = clamp(rangeV.y, -0.55, 0.42); rangeHud();
}
function rangeFruit(kind) {
  const g = new THREE.Group(); const K = RANGE_KINDS[kind]; const simple = rangeSimple();
  const mat = mkMat({ color: K.col, emissive: kind === 'gold' ? 0xf6c431 : 0x000000, emissiveIntensity: kind === 'gold' ? 0.6 : 0 });
  const body = new THREE.Mesh(RANGE.geos[kind], mat); body.castShadow = true;
  if (kind === 'pumpkin') body.scale.set(1, 0.78, 1);
  if (kind === 'melon') body.scale.set(0.9, 1.05, 0.9);
  if (kind === 'water') body.scale.set(1.18, 0.92, 1.18);
  g.add(body);
  if (TOON && !simple) body.add(new THREE.Mesh(RANGE.geos[kind], hullMats().small));
  const rib = (w, h, d, rot) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mkMat({ color: K.rib })); m.rotation.y = rot || 0; g.add(m); };
  if (kind === 'pumpkin') {
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.07, 0.16, 5), mkMat({ color: 0x3c6b32 })); stem.position.y = K.r * 0.72; g.add(stem);
    if (!simple) for (let i = 0; i < 4; i++) rib(0.05, K.r * 1.45, K.r * 1.85, i * Math.PI / 4);
  } else if (kind === 'melon' && !simple) {
    for (let i = 0; i < 3; i++) rib(K.r * 1.7, 0.035, K.r * 1.7, i * 0.5);
  } else if (kind === 'water') {
    const n = simple ? 3 : 5;
    for (let i = 0; i < n; i++) rib(0.07, K.r * 1.7, K.r * 2.05, i * Math.PI / n);
  } else if (kind === 'gold' && !simple) {
    const crown = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.16, 0.1), mkMat({ color: 0xfff6c8, emissive: 0xf6c431, emissiveIntensity: 0.4 }));
    crown.position.y = K.r * 0.85; g.add(crown);
  }
  return g;
}
function rangeSpawn(kind, mode) {
  const lane = Math.floor(Math.random() * 3) - 1;
  const fruit = rangeFruit(kind); rangeStand.add(fruit);
  const t = { g: fruit, kind, mode, lane, on: true, up: true, age: Math.random() * 0.4, phase: Math.random() * 6.28, r: RANGE_KINDS[kind].r * (kind === 'water' ? 1.05 : 1) };
  rangeLive.push(t); rangePlace(t, 0); return t;
}
function rangePlace(t, dt) {
  t.age += dt;
  const w = rangeWave(Math.min(59.9, RANGE.t)) || RANGE_WAVES[0];
  const sp = w.speed;
  const travel = t.mode === 'pop' ? 0.45 : 1.2;
  const x = t.lane * 1.7 + Math.sin(t.phase + t.age * sp) * travel;
  let y = 1.22 + RANGE_KINDS[t.kind].r * 0.15;
  if (t.mode === 'swing') y += Math.sin(t.phase * 1.7 + t.age * sp * 1.6) * 0.48;
  if (t.mode === 'pop') { t.up = (t.age % 1.7) < 1.05; }
  else t.up = true;
  t.g.position.set(x, t.up ? y : 0.35, 5.4 + (t.lane + 1) * 0.15);
  t.g.visible = t.on;
  t.g.scale.setScalar(t.on && t.up ? 1 : 0.02);
  if (t.on && t.up) t.g.rotation.y += dt * (t.kind === 'gold' ? 1.4 : 0.45);
}
function rangeBurst(pos, col) {
  const n = rangeSimple() ? 5 : 12;
  let used = 0;
  for (const d of rangeDebris) {
    if (d.m.visible) continue;
    d.m.visible = true; d.m.material.color.setHex(used < 2 ? 0xfff6e8 : col);
    d.m.scale.setScalar(0.7 + Math.random() * 1.3);
    d.m.position.copy(pos);
    d.v.set((Math.random() - 0.5) * 4.2, 2 + Math.random() * 2.4, (Math.random() - 0.5) * 2.4);
    d.t = 0; d.life = 0.7; used++; if (used >= n) break;
  }
}
function rangeHole(hit) {
  rangeBack.updateMatrixWorld(true);
  const local = rangeBack.worldToLocal(hit.clone());
  const h = rangeHoles[rangeHoleN % rangeHoles.length]; rangeHoleN++;
  h.visible = true; h.position.set(clamp(local.x, -3.4, 3.4), clamp(local.y, -1.5, 1.5), -0.2);
}
function rangeMark(text, good) {
  const pop = $('rangePop'); if (!pop) return;
  pop.textContent = text; pop.className = good ? 'good' : 'bad'; RANGE.pop = 0.65;
  $('rangeCross').className = good ? 'hit' : 'miss';
}
function rangeFire() {
  if (!RANGE.on || RANGE.phase !== 'play' || rangeReloading(RANGE.t) || RANGE.mag <= 0) return false;
  RANGE.mag--; RANGE.shots++; RANGE.kick = 1; RANGE.flash = 0.08;
  rangeRay.setFromCamera(new THREE.Vector2(RANGE.ax, RANGE.ay), camera);
  let best = null, bd = 1e9, hp = null;
  for (const t of rangeLive) {
    if (!t.on || !t.up) continue;
    t.g.getWorldPosition(rangeV);
    const ocx = rangeV.x - rangeRay.ray.origin.x, ocy = rangeV.y - rangeRay.ray.origin.y, ocz = rangeV.z - rangeRay.ray.origin.z;
    const b = ocx * rangeRay.ray.direction.x + ocy * rangeRay.ray.direction.y + ocz * rangeRay.ray.direction.z;
    const c = ocx * ocx + ocy * ocy + ocz * ocz - t.r * t.r;
    const disc = b * b - c;
    if (disc > 0 && b > 0) { const dist = b - Math.sqrt(disc); if (dist < bd) { bd = dist; best = t; hp = rangeV.clone(); } }
  }
  if (best) {
    best.on = false; best.g.visible = false;
    RANGE.hits++; RANGE.combo++; RANGE.bestCombo = Math.max(RANGE.bestCombo, RANGE.combo);
    const left = Math.max(0, 60 - RANGE.t);
    const gained = Math.round(RANGE_KINDS[best.kind].pts * (1 + left / 120) + Math.max(0, RANGE.combo - 1) * 4);
    RANGE.score += gained;
    rangeBurst(hp || best.g.getWorldPosition(rangeV2), RANGE_KINDS[best.kind].col);
    rangeMark('+' + gained, true);
    if (settings.vibrate && isTouch) buzz(14);
  } else {
    RANGE.combo = 0; rangeMark('pudło', false);
    const planeZ = new THREE.Vector3(); rangeBack.getWorldPosition(planeZ);
    const n = new THREE.Vector3(0, 0, 1).applyQuaternion(rangeStand.quaternion);
    const denom = rangeRay.ray.direction.dot(n);
    if (Math.abs(denom) > 1e-4) {
      const tt = planeZ.clone().sub(rangeRay.ray.origin).dot(n) / denom;
      if (tt > 0) rangeHole(rangeRay.ray.origin.clone().addScaledVector(rangeRay.ray.direction, tt));
    }
  }
  if (RANGE.mag <= 0 && RANGE.reserve <= 0) rangeFinish();
  else if (RANGE.mag <= 0) RANGE.reload = 1.45;
  rangeHud(); return true;
}
function rangeFill(w) {
  let guard = 0;
  while (rangeLive.filter((t) => t.on).length < rangeCap() && guard++ < 6) {
    rangeSpawn(w.kinds[Math.floor(Math.random() * w.kinds.length)], w.modes[Math.floor(Math.random() * w.modes.length)]);
  }
}
function updateRange(dt) {
  if (RANGE.cool > 0) RANGE.cool -= dt;
  if (!RANGE.on) {
    if (RANGE.ring) RANGE.ring.material.opacity = 0.45 + 0.35 * Math.sin(performance.now() * 0.004);
    return;
  }
  RANGE.kick = Math.max(0, (RANGE.kick || 0) - dt * 5);
  RANGE.flash = Math.max(0, (RANGE.flash || 0) - dt);
  RANGE.pop = Math.max(0, (RANGE.pop || 0) - dt);
  if (RANGE.pop <= 0 && $('rangeCross')) $('rangeCross').className = '';
  rangeStand.updateMatrixWorld(true);
  const kick = RANGE.kick || 0;
  const eye = rangeV.set(0.15, 1.62 - kick * 0.03, -1.05).applyMatrix4(rangeStand.matrixWorld);
  const look = rangeV2.set(RANGE.ax * 0.15, 1.38 - kick * 0.08, 7.4).applyMatrix4(rangeStand.matrixWorld);
  G.camOverride = [eye.x, eye.y, eye.z, look.x, look.y, look.z];
  if (RANGE.phase === 'intro') {
    RANGE.t += dt; if (RANGE.t > 1.1) { RANGE.phase = 'play'; RANGE.t = 0; RANGE.wave = null; }
    rangeHud(); return;
  }
  if (RANGE.phase !== 'play') { rangeHud(); return; }
  RANGE.t += dt;
  const top = () => { const take = Math.min(5 - RANGE.mag, RANGE.reserve); RANGE.mag += take; RANGE.reserve -= take; };
  if (RANGE.t >= 17 && !RANGE.did1) { RANGE.did1 = true; top(); }
  if (RANGE.t >= 36 && !RANGE.did2) { RANGE.did2 = true; top(); }
  if (RANGE.reload > 0) { RANGE.reload -= dt; if (RANGE.reload <= 0) top(); }
  const w = rangeWave(RANGE.t);
  if (w && !rangeReloading(RANGE.t)) {
    if (RANGE.wave !== w.id) { RANGE.wave = w.id; rangeFill(w); RANGE.spawnT = 0.35; }
    RANGE.spawnT -= dt;
    const gap = settings.quality === 'low' ? 1.05 : (settings.quality === 'high' ? 0.55 : 0.72);
    if (RANGE.spawnT <= 0 && rangeLive.filter((t) => t.on).length < rangeCap()) {
      RANGE.spawnT = gap;
      rangeSpawn(w.kinds[Math.floor(Math.random() * w.kinds.length)], w.modes[Math.floor(Math.random() * w.modes.length)]);
    }
  } else if (!w) RANGE.wave = null;
  for (const t of rangeLive) if (t.on) rangePlace(t, dt);
  for (const d of rangeDebris) {
    if (!d.m.visible) continue; d.t += dt; d.v.y -= 11 * dt; d.m.position.addScaledVector(d.v, dt);
    if (d.t > d.life || d.m.position.y < 0.05) d.m.visible = false;
  }
  if (RANGE.t >= 60) rangeFinish();
  rangeHud();
}
addEventListener('pointermove', (e) => { if (G.inRange && !isTouch) rangeAimEvent(e); });
addEventListener('pointerdown', (e) => {
  if (!G.inRange || isTouch || RANGE.phase === 'done') return;
  if (e.target && e.target.closest && e.target.closest('button')) return;
  rangeFire();
});
function drawRangeMinimap(g, sc) {
  if (!rangeStand) return;
  g.fillStyle = '#e8503a'; g.fillRect(RANGE.px - 7 / sc, RANGE.pz - 5 / sc, 14 / sc, 10 / sc); g.strokeRect(RANGE.px - 7 / sc, RANGE.pz - 5 / sc, 14 / sc, 10 / sc);
  g.fillStyle = '#2a211c'; g.font = 'bold ' + (9 / sc) + 'px sans-serif'; g.textAlign = 'center'; g.fillText('S', RANGE.px, RANGE.pz + 1 / sc);
}
