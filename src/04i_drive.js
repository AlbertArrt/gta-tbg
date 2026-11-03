
// ======================= JAZDA: DŹWIĘK SILNIKA, DRIFT, ŚLADY OPON, DYM, ISKRY, NITRO, SKOKI, ZNAJDŹKI =======================
const FXQ = { low: { skid: 200, smoke: 0.4, parts: 40, sparks: 0.5 }, med: { skid: 420, smoke: 0.75, parts: 72, sparks: 0.8 }, high: { skid: 800, smoke: 1, parts: 96, sparks: 1 } };
const DRV = { drift: { on: false, t: 0, score: 0, grace: 0, mult: 1 }, air: 0, skidN: 0, emitAcc: 0, stats: { skids: 0, smoke: 0, sparks: 0, crunch: 0, maxShake: 0 } };
const fxq = () => FXQ[settings.quality] || FXQ.med;

// ---- skid marks: one ring-buffer mesh of quads
const SKID_MAX = 800;
function initSkids() {
  const g = new THREE.BufferGeometry(); const P = new Float32Array(SKID_MAX * 12), C = new Float32Array(SKID_MAX * 16), I = new Uint32Array(SKID_MAX * 6);
  for (let i = 0; i < SKID_MAX; i++) { const v = i * 4; I.set([v, v + 1, v + 2, v + 2, v + 1, v + 3], i * 6); }
  g.setAttribute('position', new THREE.BufferAttribute(P, 3)); g.setAttribute('color', new THREE.BufferAttribute(C, 4)); g.setIndex(new THREE.BufferAttribute(I, 1));
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
  const m = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, side: THREE.DoubleSide, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -12 });
  const mesh = new THREE.Mesh(g, m); mesh.frustumCulled = false; mesh.renderOrder = 1; scene.add(mesh);
  DRV.skid = { g, P, C, mesh, i: 0, dirty: false, last: [null, null] };
}
function skidSeg(x0, z0, x1, z1, a) {
  const S = DRV.skid, cap = fxq().skid; const i = S.i % cap; S.i = (S.i + 1) % cap;
  const dx = x1 - x0, dz = z1 - z0, L = Math.hypot(dx, dz) || 1, w = 0.18, nx = -dz / L * w, nz = dx / L * w;
  const off = inOffZone(x1, z1) ? 0.07 : 0.2; const y0 = groundH(x0, z0) + off, y1 = groundH(x1, z1) + off;
  S.P.set([x0 + nx, y0, z0 + nz, x0 - nx, y0, z0 - nz, x1 + nx, y1, z1 + nz, x1 - nx, y1, z1 - nz], i * 12);
  const c = TOON ? 0.035 : 0.02; for (let k = 0; k < 4; k++) S.C.set([c, c * 0.95, c * 0.9, a], i * 16 + k * 4);
  S.dirty = true; DRV.stats.skids++;
}
// ---- billboard particles (smoke = 1 draw, sparks/flames = 1 additive draw)
function makeParts(N, additive) {
  const base = new THREE.PlaneGeometry(1, 1); const g = new THREE.InstancedBufferGeometry();
  g.index = base.index; g.setAttribute('position', base.attributes.position); g.setAttribute('uv', base.attributes.uv);
  const iP = new THREE.InstancedBufferAttribute(new Float32Array(N * 4), 4), iC = new THREE.InstancedBufferAttribute(new Float32Array(N * 4), 4);
  iP.setUsage(THREE.DynamicDrawUsage); iC.setUsage(THREE.DynamicDrawUsage); g.setAttribute('iPos', iP); g.setAttribute('iCol', iC); g.instanceCount = N;
  const m = new THREE.ShaderMaterial({
    uniforms: { uInk: { value: TOON && !additive ? 1 : 0 }, uInkCol: { value: new THREE.Color(0x2a211c) } },
    vertexShader: 'attribute vec4 iPos; attribute vec4 iCol; varying vec2 vUv; varying vec4 vCol; void main(){ vUv = uv; vCol = iCol; vec4 mv = modelViewMatrix * vec4(iPos.xyz, 1.0); mv.xy += position.xy * iPos.w; gl_Position = projectionMatrix * mv; }',
    fragmentShader: additive
      ? 'varying vec2 vUv; varying vec4 vCol; void main(){ float d = length(vUv - 0.5) * 2.0; if (d > 1.0) discard; float a = (1.0 - d) * (1.0 - d) * vCol.a; gl_FragColor = vec4(mix(vec3(1.0, 0.98, 0.85), vCol.rgb, d) * a, a); \n#include <colorspace_fragment>\n }'
      : 'uniform float uInk; uniform vec3 uInkCol; varying vec2 vUv; varying vec4 vCol; void main(){ float d = length(vUv - 0.5) * 2.0; if (d > 1.0) discard; vec3 c = vCol.rgb * (1.0 - 0.16 * smoothstep(0.1, 0.9, vUv.x * 0.5 + (1.0 - vUv.y) * 0.5)); float a = vCol.a * (1.0 - smoothstep(0.86, 1.0, d)); if (uInk > 0.5) c = mix(c, uInkCol, smoothstep(0.72, 0.8, d) * 0.85); else a *= 1.0 - smoothstep(0.4, 1.0, d) * 0.7; gl_FragColor = vec4(c, a); \n#include <colorspace_fragment>\n }',
    transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
  });
  const mesh = new THREE.Mesh(g, m); mesh.frustumCulled = false; mesh.renderOrder = 2; scene.add(mesh);
  const L = []; for (let i = 0; i < N; i++) L.push({ t: 1, life: 0, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, s0: 1, s1: 1, r: 1, g: 1, b: 1, a: 1, grav: 0, drag: 1 });
  return { N, g, iP, iC, mesh, L, i: 0, alive: 0 };
}
const tmpCol = new THREE.Color();
function emitPart(S, x, y, z, vx, vy, vz, life, s0, s1, col, a, grav, drag) {
  const cap = Math.min(S.N, fxq().parts); let p = null;
  for (let k = 0; k < cap; k++) { const q = S.L[(S.i + k) % cap]; if (q.t >= q.life) { p = q; S.i = (S.i + k + 1) % cap; break; } }
  if (!p) { p = S.L[S.i % cap]; S.i = (S.i + 1) % cap; }
  tmpCol.set(col); p.t = 0; p.life = life; p.x = x; p.y = y; p.z = z; p.vx = vx; p.vy = vy; p.vz = vz; p.s0 = s0; p.s1 = s1; p.r = tmpCol.r; p.g = tmpCol.g; p.b = tmpCol.b; p.a = a; p.grav = grav; p.drag = drag;
}
function stepParts(S, dt) {
  const P = S.iP.array, C = S.iC.array; let alive = 0;
  for (let i = 0; i < S.N; i++) {
    const p = S.L[i];
    if (p.t >= p.life) { if (P[i * 4 + 3] !== 0) { P[i * 4 + 3] = 0; alive++; } continue; }
    p.t += dt; const k = Math.min(1, p.t / p.life), dr = Math.max(0, 1 - p.drag * dt);
    p.vx *= dr; p.vz *= dr; p.vy = p.vy * dr - p.grav * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
    if (p.grav > 0) { const gy = groundH(p.x, p.z) + 0.15; if (p.y < gy) { p.y = gy; p.vy *= -0.35; p.vx *= 0.6; p.vz *= 0.6; } }
    P[i * 4] = p.x; P[i * 4 + 1] = p.y; P[i * 4 + 2] = p.z; P[i * 4 + 3] = p.s0 + (p.s1 - p.s0) * k;
    C[i * 4] = p.r; C[i * 4 + 1] = p.g; C[i * 4 + 2] = p.b; C[i * 4 + 3] = p.a * (k < 0.15 ? k / 0.15 : 1 - (k - 0.15) / 0.85);
    alive++;
  }
  if (alive) { S.iP.needsUpdate = true; S.iC.needsUpdate = true; }
  S.alive = alive; S.mesh.visible = alive > 0;
}
// ---- money pickups (instanced banknote bundles)
const PICK_N = 16;
function initPickups() {
  const rnd = mulberry32(777); const r0 = W.travel[0]; const L = [];
  for (let t = 0; t < 400 && L.length < PICK_N; t++) {
    const a = rnd() * 6.283, R = 120 + rnd() * 1300; const rp = nearestRoadPoint(r0[1] + Math.cos(a) * R, r0[2] + Math.sin(a) * R, true, 150);
    if (!rp || inOffZone(rp.x, rp.z) || insideBuilding(rp.x, rp.z, 1.5) || L.some((q) => Math.hypot(q.x - rp.x, q.z - rp.z) < 160)) continue;
    const off = (rnd() - 0.5) * Math.max(0, rp.road.width - 2.5); const x = rp.x + Math.cos(rp.h) * off, z = rp.z - Math.sin(rp.h) * off;
    L.push({ x, z, y: groundH(x, z), v: 20 + Math.round(rnd() * 6) * 5, on: true, t: 0 });
  }
  const geo = mergeBoxes([[0.9, 0.36, 0.5, 0, 0, 0, '#4fd06a', 0], [0.92, 0.38, 0.12, 0, 0, 0, '#f4f1ea', 0]]);
  const mesh = new THREE.InstancedMesh(geo, mkMat({ vertexColors: true, emissive: 0x1a5a24 }), L.length); mesh.frustumCulled = false; scene.add(mesh);
  DRV.pick = { L, mesh, m: new THREE.Matrix4(), q: new THREE.Quaternion(), e: new THREE.Euler(), s: new THREE.Vector3(1, 1, 1), p: new THREE.Vector3() };
}
function updatePickups(dt) {
  const K = DRV.pick; if (!K) return; const f = focusXZ(); const t = performance.now() * 0.002;
  K.L.forEach((p, i) => {
    if (!p.on) { p.t -= dt; if (p.t <= 0 && Math.hypot(p.x - f.x, p.z - f.z) > 60) p.on = true; }
    const d = Math.hypot(p.x - f.x, p.z - f.z);
    if (p.on && d < (G.mode === 'car' ? 2.8 : 1.6) && !G.cut) { p.on = false; p.t = 240; SAVE.stats.pickups++; addMoney(p.v, 'znaleziona kasa'); sfxCoin(); for (let k = 0; k < 8; k++) emitPart(DRV.sparks, p.x, p.y + 1, p.z, (Math.random() - 0.5) * 5, 3 + Math.random() * 3, (Math.random() - 0.5) * 5, 0.5, 0.35, 0.1, '#7dff7a', 1, 9, 1); }
    K.e.set(0, t + i, Math.sin(t * 1.3 + i) * 0.25); K.q.setFromEuler(K.e); K.p.set(p.x, p.y + 1 + Math.sin(t * 1.7 + i) * 0.2, p.z);
    K.s.setScalar(p.on && d < 400 ? 1.35 : 0); K.m.compose(K.p, K.q, K.s); K.mesh.setMatrixAt(i, K.m);
  });
  K.mesh.instanceMatrix.needsUpdate = true;
}
function drawPickupMinimap(g, sc) {
  const K = DRV.pick; if (!K) return; const f = focusXZ(); g.fillStyle = '#4fd06a';
  for (const p of K.L) if (p.on && Math.hypot(p.x - f.x, p.z - f.z) < 260) { g.beginPath(); g.arc(p.x, p.z, 3.5 / sc, 0, 7); g.fill(); g.stroke(); }
}
function initDriveFx() { initSkids(); DRV.smoke = makeParts(96, false); DRV.sparks = makeParts(64, true); initPickups(); }

// ---- collisions: sparks, crunch, camera shake
function collisionFx(c, impact, px, pz) {
  const f = focusXZ(); if (Math.hypot(c.x - f.x, c.z - f.z) > 90) return;
  const now = performance.now(); if (now - (c.fxHitT || 0) < 120) return; c.fxHitT = now;
  const x = px !== undefined ? px : c.x + Math.sin(c.h) * 1.9 * Math.sign(c.vFl || 1), z = pz !== undefined ? pz : c.z + Math.cos(c.h) * 1.9 * Math.sign(c.vFl || 1);
  const n = Math.round(Math.min(18, 4 + impact * 0.6) * fxq().sparks); const y = (c.y || 0) + 0.7;
  for (let k = 0; k < n; k++) { const a = Math.random() * 6.283, s = 3 + Math.random() * (4 + impact * 0.3); emitPart(DRV.sparks, x, y, z, Math.cos(a) * s, 1.5 + Math.random() * 5, Math.sin(a) * s, 0.4 + Math.random() * 0.3, 0.5, 0.12, Math.random() < 0.5 ? '#ffb02e' : '#ffe14a', 1, 14, 0.8); }
  DRV.stats.sparks += n;
  if (impact > 9) for (let k = 0; k < 3; k++) emitPart(DRV.smoke, x, y + 0.3, z, (Math.random() - 0.5) * 2, 1 + Math.random(), (Math.random() - 0.5) * 2, 0.9, 1.0, 2.4, '#d8d4d0', 0.85, 0, 1.5);
  if (c === activeCar) {
    G.shake = Math.min(1.6, (G.shake || 0) + impact / 18); DRV.stats.maxShake = Math.max(DRV.stats.maxShake, G.shake);
    sfxCrunch(Math.min(1, impact / 22)); if (impact > 12) buzz(Math.min(80, impact * 3));
    if (DRV.drift.on && impact > 6) { DRV.drift.on = false; DRV.drift.score = 0; driftHud('crash'); }
  } else sfxCrunch(Math.min(0.6, impact / 30));
}
// ---- nitro (fuel 0..1, refills slowly)
function nitroTick(c, want, dt) {
  const st = c.st; if (c.nf === undefined) c.nf = 1;
  if (want && c.nf > 0.01) { c.nf = Math.max(0, c.nf - dt / st.ncap); c.nOut = c.nf <= 0.01; return true; }
  c.nf = Math.min(1, c.nf + dt * 0.07); return false;
}
// ---- drift scoring → money
function driftHud(state) {
  const e = $('drift'); if (!e) return; const D = DRV.drift;
  if (state === 'crash') { e.className = 'crash'; e.innerHTML = 'DRIFT PRZERWANY!'; clearTimeout(D.hideT); D.hideT = setTimeout(() => e.classList.add('hidden'), 1100); return; }
  if (state === 'bank') { e.className = 'bank'; e.innerHTML = 'DRIFT ' + Math.round(D.score) + '<small>+' + D.cash + ' zł</small>'; clearTimeout(D.hideT); D.hideT = setTimeout(() => e.classList.add('hidden'), 1400); return; }
  if (state === 'off') { e.classList.add('hidden'); return; }
  clearTimeout(D.hideT); e.className = ''; e.innerHTML = 'DRIFT ' + Math.round(D.score) + '<small>×' + D.mult.toFixed(1) + '</small>';
}
function bankDrift() {
  const D = DRV.drift; D.on = false;
  if (D.score >= 50 && D.t > 0.6) {
    D.cash = Math.round(D.score / 7); SAVE.stats.driftBest = Math.max(SAVE.stats.driftBest, Math.round(D.score)); SAVE.stats.driftCash += D.cash;
    addMoney(D.cash, 'drift ' + Math.round(D.score) + ' pkt'); driftHud('bank'); DRV.drifts = (DRV.drifts || 0) + 1;
  } else driftHud('off');
  D.score = 0; D.t = 0;
}
function updateDriveFx(dt) {
  const S = DRV.skid; const c = G.mode === 'car' ? activeCar : null;
  if (c && !G.cut && !c.scooter) {
    const vF = c.vFl || 0, vR = c.vRl || 0, spd = Math.hypot(vF, vR), slip = Math.atan2(Math.abs(vR), Math.abs(vF) + 0.01);
    // drift
    const D = DRV.drift; const drifting = !c.air && !c.wrecked && spd > 8 && slip > 0.2 && vF > 3;
    if (drifting) {
      if (!D.on) { D.on = true; D.t = 0; D.score = 0; D.grace = 0; }
      D.t += dt; D.grace = 0; D.mult = 1 + Math.min(1, D.t / 4); D.score += spd * Math.min(slip, 1.2) * dt * 10 * D.mult; DRV.driftT = (DRV.driftT || 0) + dt;
      if (D.score > 20) driftHud('on');
    } else if (D.on) { D.grace += dt; if (D.grace > 0.7 || spd < 4) bankDrift(); }
    // stunt jumps (off-road zone)
    if (c.air) DRV.air += dt;
    else if (DRV.air > 0) { if (DRV.air > 0.7 && !c.wrecked) { const cash = Math.round(DRV.air * 40); SAVE.stats.jumps++; SAVE.stats.jumpBest = Math.max(SAVE.stats.jumpBest, +DRV.air.toFixed(2)); addMoney(cash, 'skok ' + DRV.air.toFixed(1) + ' s'); } DRV.air = 0; }
    // tyre marks + smoke
    const hardBrake = c.brkl > 0.5 && vF > 9, sliding = slip > 0.17 && spd > 6, burn = c.thrl > 0 && Math.abs(vF) < 5 && c.handl;
    const skid = !c.air && !c.wrecked && (sliding || hardBrake || (c.handl && spd > 4) || burn);
    const fx = Math.sin(c.h), fz = Math.cos(c.h), rx = Math.cos(c.h), rz = -Math.sin(c.h); const back = (c.offs && c.offs[0]) || -1.3;
    for (let w = 0; w < 2; w++) {
      const s = w ? 1 : -1, wx = c.x + fx * back + rx * 0.86 * s, wz = c.z + fz * back + rz * 0.86 * s;
      if (!skid) { S.last[w] = null; continue; }
      const L = S.last[w]; if (!L) { S.last[w] = [wx, wz]; continue; }
      const d = Math.hypot(wx - L[0], wz - L[1]); if (d > 6) { S.last[w] = [wx, wz]; continue; }
      if (d > 0.45) { skidSeg(L[0], L[1], wx, wz, Math.min(0.75, 0.35 + slip * 0.6)); S.last[w] = [wx, wz]; }
    }
    if (skid && (sliding || burn) && !inOffZone(c.x, c.z)) {
      DRV.emitAcc += dt * (12 + spd * 0.6) * fxq().smoke * Math.min(1.5, slip * 2 + (burn ? 1 : 0));
      while (DRV.emitAcc > 1) { DRV.emitAcc -= 1; const s = Math.random() < 0.5 ? 1 : -1; emitPart(DRV.smoke, c.x + fx * back + rx * 0.9 * s, (c.y || 0) + 0.35, c.z + fz * back + rz * 0.9 * s, c.vx * 0.25 + (Math.random() - 0.5) * 1.5, 0.6 + Math.random() * 0.8, c.vz * 0.25 + (Math.random() - 0.5) * 1.5, 1.1 + Math.random() * 0.6, 0.7, 2.6 + Math.random(), TOON ? '#f1eee8' : '#d9d6d2', TOON ? 0.95 : 0.6, -0.2, 1.4); DRV.stats.smoke++; }
    } else if (skid && inOffZone(c.x, c.z) && Math.random() < dt * 8 * fxq().smoke) emitPart(DRV.smoke, c.x + fx * back, (c.y || 0) + 0.3, c.z + fz * back, (Math.random() - 0.5), 0.5, (Math.random() - 0.5), 0.9, 0.6, 2, '#b08a5a', 0.8, 0, 1.5); // dust
    DRV.slip = skid ? Math.min(1, slip * 1.6 + (hardBrake ? 0.4 : 0)) : 0;
    // nitro flames + HUD
    if (c.nitroOn) for (let k = 0; k < 2; k++) emitPart(DRV.sparks, c.x + fx * (back - 0.9) + rx * 0.4 * (k ? 1 : -1), (c.y || 0) + 0.45, c.z + fz * (back - 0.9) + rz * 0.4 * (k ? 1 : -1), -fx * 6 + c.vx * 0.8, 0.3, -fz * 6 + c.vz * 0.8, 0.18, 0.55, 0.15, k ? '#4fc3ff' : '#ff8a1e', 1, 0, 2);
  } else { S.last[0] = S.last[1] = null; DRV.slip = 0; if (DRV.drift.on) bankDrift(); DRV.air = 0; }
  const nb = $('nitrobar'), hasN = !!(c && c.st && c.st.nitro);
  if (nb) { if (hasN) { nb.classList.remove('hidden'); nb.firstChild.style.width = Math.round(c.nf * 100) + '%'; nb.classList.toggle('on', !!c.nitroOn); } else if (!nb.classList.contains('hidden')) nb.classList.add('hidden'); }
  const tc = $('touch'); if (tc && tc.classList.contains('hasnitro') !== hasN) tc.classList.toggle('hasnitro', hasN);
  if (S.dirty) { S.g.attributes.position.needsUpdate = true; S.g.attributes.color.needsUpdate = true; S.dirty = false; }
  stepParts(DRV.smoke, dt); stepParts(DRV.sparks, dt); updatePickups(dt);
}

// ---- procedural audio: engine (rpm + gears), tyre squeal, crunch, coin
const ENG = { gear: 1, rpm: 0.2, shiftT: 0, on: false };
function sfxVol() { return settings.sfxVol === undefined ? 0.7 : settings.sfxVol; }
function noiseBuf(ac, sec) { const b = ac.createBuffer(1, Math.floor(ac.sampleRate * sec), ac.sampleRate), d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; return b; }
function engineBuild(ac) {
  const out = ac.createGain(); out.gain.value = 0; out.connect(ac.destination);
  const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 600; lp.Q.value = 2.5; lp.connect(out);
  const sh = ac.createWaveShaper(); const cv = new Float32Array(256); for (let i = 0; i < 256; i++) { const x = i / 128 - 1; cv[i] = Math.tanh(x * 2.2); } sh.curve = cv; sh.connect(lp);
  const o1 = ac.createOscillator(); o1.type = 'sawtooth'; const o2 = ac.createOscillator(); o2.type = 'square';
  const g1 = ac.createGain(); g1.gain.value = 0.55; const g2 = ac.createGain(); g2.gain.value = 0.45; o1.connect(g1); o2.connect(g2); g1.connect(sh); g2.connect(sh);
  const lfo = ac.createOscillator(); lfo.frequency.value = 22; const lg = ac.createGain(); lg.gain.value = 6; lfo.connect(lg); lg.connect(o1.frequency); // combustion rumble
  o1.start(); o2.start(); lfo.start();
  const sq = ac.createBufferSource(); sq.buffer = noiseBuf(ac, 1.5); sq.loop = true; const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1900; bp.Q.value = 7; const sg = ac.createGain(); sg.gain.value = 0; sq.connect(bp); bp.connect(sg); sg.connect(ac.destination); sq.start();
  Object.assign(ENG, { ac, out, lp, o1, o2, lfo, sg, bp, built: true });
}
function engineTick(dt) {
  const c = activeCar; const on = G.started && !G.paused && !G.cut && G.mode === 'car' && c && !c.wrecked && sfxVol() > 0;
  if (!ENG.built) { if (!on) return; const ac = audioCtx(); if (!ac) return; engineBuild(ac); }
  const ac = ENG.ac, t = ac.currentTime;
  if (!on) { if (ENG.on) { ENG.out.gain.setTargetAtTime(0, t, 0.08); ENG.sg.gain.setTargetAtTime(0, t, 0.05); ENG.on = false; } return; }
  ENG.on = true; dt = Math.min(dt, 0.05);
  const st = c.st, top = st ? st.maxv : (c.offroad ? 41 : 48), G_ = st ? st.gears : 5, pitch = c.scooter ? 1.9 : st ? st.pitch : c.police ? 0.85 : c.offroad ? 0.8 : 1;
  const v = Math.abs(c.vFl || 0), band = top / G_, thr = Math.max(0, c.thrl || 0);
  if (v > band * ENG.gear * 0.98 && ENG.gear < G_) { ENG.gear++; ENG.shiftT = 0.16; } else if (ENG.gear > 1 && v < band * (ENG.gear - 1) * 0.8) ENG.gear--;
  const lo = ENG.gear === 1 ? 0 : band * (ENG.gear - 1) * 0.8; let r = Math.max(0, Math.min(1.05, (v - lo) / (band * ENG.gear - lo)));
  r = ENG.gear === 1 ? r : 0.3 + r * 0.7;
  if (c.air || (c.handl && thr > 0 && v < 6)) r = Math.max(r, thr * 0.9); // revving in the air / burnout
  const tgt = 0.16 + r * 0.84; ENG.rpm += (tgt - ENG.rpm) * Math.min(1, dt * (ENG.shiftT > 0 ? 14 : 7)); ENG.shiftT = Math.max(0, ENG.shiftT - dt);
  const f = (34 + ENG.rpm * 128) * pitch * (c.nitroOn ? 1.06 : 1), vol = sfxVol();
  ENG.o1.frequency.setTargetAtTime(f, t, 0.03); ENG.o2.frequency.setTargetAtTime(f * 0.5, t, 0.03); ENG.lfo.frequency.setTargetAtTime(f * 0.25, t, 0.05);
  ENG.lp.frequency.setTargetAtTime(260 + ENG.rpm * 1500 + thr * 700 + (c.nitroOn ? 600 : 0), t, 0.05);
  const gain = (0.035 + 0.035 * thr + 0.025 * ENG.rpm) * vol * (ENG.shiftT > 0 ? 0.35 : 1) * (c.hp < 15 ? 0.8 + Math.random() * 0.3 : 1);
  ENG.out.gain.setTargetAtTime(gain, t, 0.04);
  ENG.sg.gain.setTargetAtTime((DRV.slip || 0) * 0.05 * vol, t, 0.06); ENG.bp.frequency.setTargetAtTime(1500 + Math.abs(c.vRl || 0) * 40, t, 0.1);
}
function sfxCrunch(k) {
  const ac = audioCtx(); if (!ac || k <= 0.02) return; const t = ac.currentTime, vol = sfxVol() * k; DRV.stats.crunch++;
  const n = ac.createBufferSource(); n.buffer = DRV.crunchBuf || (DRV.crunchBuf = noiseBuf(ac, 0.4));
  const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 650 + Math.random() * 500; bp.Q.value = 1.2;
  const g = ac.createGain(); g.gain.setValueAtTime(0.5 * vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.35); n.connect(bp); bp.connect(g); g.connect(ac.destination); n.start(t); n.stop(t + 0.4);
  const o = ac.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(95, t); o.frequency.exponentialRampToValueAtTime(38, t + 0.25);
  const og = ac.createGain(); og.gain.setValueAtTime(0.6 * vol, t); og.gain.exponentialRampToValueAtTime(0.001, t + 0.3); o.connect(og); og.connect(ac.destination); o.start(t); o.stop(t + 0.32);
}
function sfxCoin() {
  const ac = audioCtx(); if (!ac) return; const t = ac.currentTime, vol = sfxVol();
  for (const [f, d] of [[988, 0], [1319, 0.08]]) { const o = ac.createOscillator(); o.type = 'square'; o.frequency.value = f; const g = ac.createGain(); g.gain.setValueAtTime(0.06 * vol, t + d); g.gain.exponentialRampToValueAtTime(0.001, t + d + 0.18); o.connect(g); g.connect(ac.destination); o.start(t + d); o.stop(t + d + 0.2); }
}
