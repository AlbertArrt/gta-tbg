// ======================= STRZELNICA ZWIERZYNIEC =======================
// Osobna minigra przy Lesie Zwierzyniec (ul. Borów). W mieście nie ma broni.
const RANGE = {
  x: 2375, z: -1694, h: Math.PI,
  on: false, phase: 'idle', t: 0, score: 0, hits: 0, shots: 0, combo: 0, bestCombo: 0,
  mag: 5, reserve: 10, reload: 0, spawnT: 0, ax: 0, ay: 0, cool: 0,
};
const RANGE_KINDS = {
  pumpkin: { pts: 12, r: 0.46, col: 0xe07a1f },
  melon: { pts: 22, r: 0.32, col: 0x6fbf45 },
  water: { pts: 36, r: 0.4, col: 0x218a45 },
  gold: { pts: 55, r: 0.34, col: 0xf6c431 },
};
const RANGE_WAVES = [
  { t0: 0, t1: 15, name: 'Rozgrzewka', kinds: ['pumpkin'], modes: ['rail'], speed: 0.55 },
  { t0: 17, t1: 34, name: 'Tory i wahadła', kinds: ['pumpkin', 'melon', 'melon'], modes: ['rail', 'swing'], speed: 0.95 },
  { t0: 36, t1: 50, name: 'Wyskakujące', kinds: ['melon', 'water', 'water'], modes: ['pop', 'rail'], speed: 1.35 },
  { t0: 50, t1: 60, name: 'Złote owoce', kinds: ['gold'], modes: ['rail', 'pop'], speed: 1.15 },
];
const rangeV = new THREE.Vector3(), rangeV2 = new THREE.Vector3();
const rangeRay = new THREE.Raycaster();
let rangeStand = null, rangeBack = null, rangeRifle = null, rangeLive = [], rangeDebris = [], rangeHoles = [], rangeHoleN = 0;

function rangeSimple() { return settings.quality === 'low'; }
function rangeCap() { return settings.quality === 'low' ? 2 : (settings.quality === 'high' ? 4 : 3); }
function rangeWave(t) {
  for (const w of RANGE_WAVES) if (t >= w.t0 && t < w.t1) return w;
  return null;
}
function rangeReloading(t) { return (t >= 15 && t < 17) || (t >= 34 && t < 36) || RANGE.reload > 0; }

function initRange() {
  const g = new THREE.Group(); g.position.set(RANGE.x, 0, RANGE.z); g.rotation.y = RANGE.h; rangeStand = g;
  const wood = 0xd7b07a, ink = 0x2a211c, roofC = 0xc4553a, metal = 0x8d97a3;
  const add = (w, h, d, x, y, z, col) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mkMat({ color: col })); m.position.set(x, y, z); m.castShadow = true; g.add(m); return m; };
  add(6.4, 0.16, 1.5, 0, 2.72, -1.85, roofC);
  add(0.18, 2.5, 0.18, -3.0, 1.25, -1.8, ink); add(0.18, 2.5, 0.18, 3.0, 1.25, -1.8, ink);
  add(0.18, 2.5, 0.18, -3.0, 1.25, 1.1, ink); add(0.18, 2.5, 0.18, 3.0, 1.25, 1.1, ink);
  add(4.6, 0.9, 0.55, 0, 0.85, 0.15, 0xf4f1ea);
  add(4.4, 0.08, 0.5, 0, 1.32, 0.15, wood);
  for (const x of [-1.7, 0, 1.7]) add(0.06, 0.06, 10.2, x, 1.05, 6.4, metal);
  rangeBack = add(7.2, 3.3, 0.32, 0, 1.65, 12.35, wood);
  add(0.16, 3.3, 0.2, -3.55, 1.65, 6.2, ink); add(0.16, 3.3, 0.2, 3.55, 1.65, 6.2, ink);
  const sign = rangeSign(); sign.position.set(0, 3.2, -2.15); g.add(sign);
  const ring = new THREE.Mesh(new THREE.RingGeometry(2.4, 3.1, 28).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xe8503a, transparent: true, opacity: 0.85, depthWrite: false }));
  ring.position.set(0, 0.08, -4.4); g.add(ring); RANGE.ring = ring;
  scene.add(g); g.updateMatrixWorld(true);
  rangeV.set(0, 0, -4.4).applyMatrix4(g.matrixWorld); RANGE.px = rangeV.x; RANGE.pz = rangeV.z;
  const simple = rangeSimple();
  const seg = simple ? 6 : 10;
  RANGE.geos = {};
  for (const k in RANGE_KINDS) RANGE.geos[k] = new THREE.SphereGeometry(RANGE_KINDS[k].r, seg, seg);
  for (let i = 0; i < 16; i++) {
    const h = new THREE.Mesh(new THREE.CircleGeometry(0.07, 8), new THREE.MeshBasicMaterial({ color: 0x2a211c }));
    h.visible = false; h.renderOrder = 2; rangeBack.add(h); rangeHoles.push(h);
  }
  for (let i = 0; i < (simple ? 8 : 16); i++) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.07, 5, 4), mkMat({ color: 0xfff1ea }));
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
  el.innerHTML = '<div id="rangeTop"><b id="rangeWave">Strzelnica</b><span id="rangeTime">1:00</span><span id="rangeScore">0 pkt</span></div><div id="rangeAmmo">5 · 10</div><div id="rangeCombo"></div><div id="rangeCross"></div><div id="rangeEnd" class="hidden"><b id="rangeEndTitle">Koniec przebiegu</b><p id="rangeEndText"></p><div class="row"><button type="button" id="rangeAgain">Jeszcze raz</button><button type="button" id="rangeLeave" class="sec">Wyjdź</button></div></div><button type="button" id="rangeFire">STRZAŁ</button><button type="button" id="rangeOut">Wyjdź</button>';
  document.body.appendChild(el);
  $('rangeFire').onclick = (e) => { e.stopPropagation(); rangeFire(); };
  $('rangeOut').onclick = (e) => { e.stopPropagation(); rangeExit(); };
  $('rangeLeave').onclick = (e) => { e.stopPropagation(); rangeExit(); };
  $('rangeAgain').onclick = (e) => { e.stopPropagation(); rangeBegin(); };
  for (const id of ['rangeFire', 'rangeOut', 'rangeLeave', 'rangeAgain', 'rangeHud']) {
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
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.07, 0.32), mkMat({ color: 0x8a5a32 }));
    const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.018, 0.46), mkMat({ color: 0x2a211c })); barrel.position.set(0, 0.045, -0.28);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.08, 0.05), mkMat({ color: 0x6b4228 })); grip.position.set(0, -0.04, 0.02);
    rangeRifle = new THREE.Group(); rangeRifle.add(stock, barrel, grip); camera.add(rangeRifle);
  }
  rangeRifle.visible = true; rangeRifle.position.set(0.42, -0.16, -0.85); rangeRifle.scale.setScalar(1.7);
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
  Object.assign(RANGE, { phase: 'intro', t: 0, score: 0, hits: 0, shots: 0, combo: 0, bestCombo: 0, mag: 5, reserve: 10, reload: 0, spawnT: 0.4, ax: 0, ay: 0, did1: false, did2: false });
  $('rangeEnd').classList.add('hidden');
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
  $('rangeHud').classList.add('hidden'); $('touch').classList.remove('range');
  G.keys.clear(); RANGE.cool = 1.2;
}
function rangeSign() {
  const cv = document.createElement('canvas'); cv.width = 768; cv.height = 128; const c = cv.getContext('2d');
  c.fillStyle = '#2a211c'; c.fillRect(0, 0, 768, 128); c.fillStyle = '#ffd21f';
  c.font = 'bold 52px Fredoka, system-ui, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillText('STRZELNICA ZWIERZYNIEC', 384, 66);
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false, fog: false })); s.scale.set(8.4, 1.4, 1); return s;
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
  const rec = improved ? ' Nowy rekord!' : (prev != null ? ' Rekord: ' + Math.round(prev) + ' pkt.' : '');
  $('rangeEndTitle').textContent = improved ? 'Nowy rekord!' : 'Koniec przebiegu';
  $('rangeEndText').textContent = 'Trafienia ' + RANGE.hits + '/' + Math.max(RANGE.shots, RANGE.hits) + ' · najlepsza seria ' + RANGE.bestCombo + ' · ' + RANGE.score + ' pkt · ' + pay + ' zł.' + rec;
  $('rangeEnd').classList.remove('hidden');
  rangeHud();
}
function rangeHud() {
  const left = RANGE.phase === 'play' ? Math.max(0, 60 - RANGE.t) : (RANGE.phase === 'intro' ? 60 : 0);
  const w = rangeWave(RANGE.t);
  $('rangeWave').textContent = RANGE.phase === 'intro' ? 'Gotowi…' : (RANGE.phase === 'done' ? 'Wynik' : (rangeReloading(RANGE.t) && RANGE.phase === 'play' ? 'Przeładowanie' : (w ? w.name : 'Strzelnica')));
  $('rangeTime').textContent = '0:' + String(Math.ceil(left)).padStart(2, '0');
  $('rangeScore').textContent = RANGE.score + ' pkt';
  $('rangeAmmo').textContent = RANGE.phase === 'done' ? '' : ('naboje ' + RANGE.mag + ' · ' + RANGE.reserve);
  $('rangeCombo').textContent = RANGE.combo > 1 ? ('seria ×' + RANGE.combo) : '';
  const c = $('c').getBoundingClientRect();
  const cross = $('rangeCross');
  cross.style.left = ((RANGE.ax * 0.5 + 0.5) * c.width) + 'px';
  cross.style.top = ((-RANGE.ay * 0.5 + 0.5) * c.height) + 'px';
  if (rangeRifle) { rangeRifle.rotation.set(0.12 - RANGE.ay * 0.1, -0.08 - RANGE.ax * 0.15, 0); }
}
function rangeAimEvent(e) {
  const r = $('c').getBoundingClientRect();
  RANGE.ax = clamp(((e.clientX - r.left) / r.width) * 2 - 1, -0.82, 0.82);
  RANGE.ay = clamp(-(((e.clientY - r.top) / r.height) * 2 - 1), -0.62, 0.48);
  rangeHud();
}
function rangeAimWorld(x, y, z) {
  rangeStand.updateMatrixWorld(true);
  rangeV.set(x, y, z).project(camera);
  RANGE.ax = clamp(rangeV.x, -0.82, 0.82); RANGE.ay = clamp(rangeV.y, -0.62, 0.48); rangeHud();
}
function rangeSpawn(kind, mode) {
  const lane = Math.floor(Math.random() * 3) - 1;
  const g = new THREE.Group();
  const geo = RANGE.geos[kind];
  const mat = mkMat({ color: RANGE_KINDS[kind].col, emissive: kind === 'gold' ? 0xf6c431 : 0x000000, emissiveIntensity: kind === 'gold' ? 0.45 : 0 });
  const mesh = new THREE.Mesh(geo, mat); mesh.castShadow = true; g.add(mesh);
  if (TOON && !rangeSimple()) { const h = new THREE.Mesh(geo, hullMats().small); g.add(h); }
  if (!rangeSimple() && kind === 'pumpkin') { const s = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.14, 0.08), mkMat({ color: 0x3d6b32 })); s.position.y = RANGE_KINDS[kind].r; g.add(s); }
  if (!rangeSimple() && kind === 'water') { const s = new THREE.Mesh(new THREE.BoxGeometry(RANGE_KINDS[kind].r * 1.8, 0.08, RANGE_KINDS[kind].r * 1.8), mkMat({ color: 0xb7e38a })); g.add(s); }
  rangeStand.add(g);
  const t = { g, mesh, kind, mode, lane, on: true, up: true, age: 0, phase: Math.random() * 6.28, r: RANGE_KINDS[kind].r };
  rangeLive.push(t); return t;
}
function rangePlace(t, dt) {
  t.age += dt;
  const w = rangeWave(Math.min(59.9, RANGE.t)) || RANGE_WAVES[0];
  const sp = w.speed;
  const x = t.lane * 1.7 + Math.sin(t.phase + t.age * sp) * (t.mode === 'rail' || t.mode === 'swing' ? 1.15 : 0.35);
  let y = 1.15 + RANGE_KINDS[t.kind].r;
  if (t.mode === 'swing') y += Math.sin(t.phase * 1.3 + t.age * sp * 1.4) * 0.42;
  if (t.mode === 'pop') { const cyc = (t.age % 1.8); t.up = cyc < 1.15; y = t.up ? y : 0.4; }
  else t.up = true;
  const z = 4.2 + (t.lane + 1) * 1.6;
  t.g.position.set(x, y, z); t.g.visible = t.on && t.up;
  t.g.rotation.y += dt * 0.6;
}
function rangeBurst(pos, col) {
  const n = rangeSimple() ? 4 : 8;
  let used = 0;
  for (const d of rangeDebris) {
    if (d.m.visible) continue;
    d.m.visible = true; d.m.material.color.setHex(col); d.m.position.copy(pos);
    d.v.set((Math.random() - 0.5) * 3.2, 1.5 + Math.random() * 2.2, (Math.random() - 0.5) * 2.2);
    d.t = 0; d.life = 0.55; used++; if (used >= n) break;
  }
}
function rangeHole(hit) {
  rangeBack.updateMatrixWorld(true);
  const local = rangeBack.worldToLocal(hit.clone());
  const h = rangeHoles[rangeHoleN % rangeHoles.length]; rangeHoleN++;
  h.visible = true; h.position.set(clamp(local.x, -3.3, 3.3), clamp(local.y, -1.4, 1.4), -0.18);
}
function rangeFire() {
  if (!RANGE.on || RANGE.phase !== 'play' || rangeReloading(RANGE.t) || RANGE.mag <= 0) return false;
  RANGE.mag--; RANGE.shots++; RANGE.reload = 0;
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
    const mul = 1 + left / 120;
    RANGE.score += Math.round(RANGE_KINDS[best.kind].pts * mul + Math.max(0, RANGE.combo - 1) * 4);
    rangeBurst(hp || best.g.getWorldPosition(rangeV2), RANGE_KINDS[best.kind].col);
    if (settings.vibrate && isTouch) buzz(12);
  } else {
    RANGE.combo = 0;
    const planeZ = new THREE.Vector3(); rangeBack.getWorldPosition(planeZ);
    const n = new THREE.Vector3(0, 0, 1).applyQuaternion(rangeStand.quaternion);
    const denom = rangeRay.ray.direction.dot(n);
    if (Math.abs(denom) > 1e-4) {
      const tt = planeZ.clone().sub(rangeRay.ray.origin).dot(n) / denom;
      if (tt > 0) rangeHole(rangeRay.ray.origin.clone().addScaledVector(rangeRay.ray.direction, tt));
    }
  }
  if (RANGE.mag <= 0 && RANGE.reserve <= 0) rangeFinish();
  else if (RANGE.mag <= 0) RANGE.reload = 1.5;
  rangeHud(); return true;
}
function updateRange(dt) {
  if (RANGE.cool > 0) RANGE.cool -= dt;
  if (!RANGE.on) {
    if (RANGE.ring) RANGE.ring.material.opacity = 0.45 + 0.35 * Math.sin(performance.now() * 0.004);
    return;
  }
  rangeStand.updateMatrixWorld(true);
  const eye = rangeV.set(0, 1.55, -1.45).applyMatrix4(rangeStand.matrixWorld);
  const look = rangeV2.set(0, 1.28, 8).applyMatrix4(rangeStand.matrixWorld);
  G.camOverride = [eye.x, eye.y, eye.z, look.x, look.y, look.z];
  if (RANGE.phase === 'intro') {
    RANGE.t += dt; if (RANGE.t > 1.3) { RANGE.phase = 'play'; RANGE.t = 0; }
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
    RANGE.spawnT -= dt;
    if (RANGE.spawnT <= 0 && rangeLive.filter((t) => t.on).length < rangeCap()) {
      RANGE.spawnT = rangeSimple() ? 1.55 : 1.15;
      const kind = w.kinds[Math.floor(Math.random() * w.kinds.length)];
      const mode = w.modes[Math.floor(Math.random() * w.modes.length)];
      rangeSpawn(kind, mode);
    }
  }
  for (const t of rangeLive) if (t.on) rangePlace(t, dt);
  for (const d of rangeDebris) {
    if (!d.m.visible) continue; d.t += dt; d.v.y -= 9 * dt; d.m.position.addScaledVector(d.v, dt);
    if (d.t > d.life) d.m.visible = false;
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
