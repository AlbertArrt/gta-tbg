// AMBIENCE-CITY + FOOTSTEP. Synteza WebAudio (szum przefiltrowany), bez pobieranych próbek.
// Szum miasta cichnie, gdy gra radio. Kroki zostają. Głośność z suwaka efektów (0 = cisza).
const AMB = { ac: null, city: null, stepBuf: null, stepFilter: null, stepT: 0, unlocked: false };
function initAmbience() {
  const kick = () => ambUnlock();
  addEventListener('pointerdown', kick, { passive: true });
  addEventListener('keydown', kick);
}
function ambUnlock() {
  if (AMB.unlocked) { if (AMB.ac && AMB.ac.state === 'suspended') AMB.ac.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  let ac;
  try { ac = new AC(); } catch (e) { return; }
  AMB.ac = ac; AMB.unlocked = true;
  const n = ac.sampleRate * 2;
  const buf = ac.createBuffer(1, n, ac.sampleRate);
  const d = buf.getChannelData(0);
  let b0 = 0, b1 = 0;
  for (let i = 0; i < n; i++) {
    const w = Math.random() * 2 - 1;
    b0 = b0 * 0.995 + w * 0.005;
    b1 = b1 * 0.92 + w * 0.08;
    d[i] = b0 * 0.85 + b1 * 0.12;
  }
  const src = ac.createBufferSource(); src.buffer = buf; src.loop = true;
  const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 380;
  const g = ac.createGain(); g.gain.value = 0;
  src.connect(lp); lp.connect(g); g.connect(ac.destination); src.start();
  AMB.city = g;
  const sn = Math.floor(ac.sampleRate * 0.07);
  const sb = ac.createBuffer(1, sn, ac.sampleRate);
  const sd = sb.getChannelData(0);
  for (let i = 0; i < sn; i++) sd[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ac.sampleRate * 0.012));
  AMB.stepBuf = sb;
  const bp = ac.createBiquadFilter(); bp.type = 'lowpass'; bp.frequency.value = 220;
  bp.connect(ac.destination);
  AMB.stepFilter = bp;
  if (ac.state === 'suspended') ac.resume();
}
function ambSfx() { return settings.sfxVol == null ? 0.7 : settings.sfxVol; }
function ambFoot(loud) {
  const ac = AMB.ac; if (!ac || !AMB.stepBuf) return;
  const s = ac.createBufferSource(); s.buffer = AMB.stepBuf;
  const g = ac.createGain();
  const v = Math.max(0.001, ambSfx() * loud);
  g.gain.setValueAtTime(v, ac.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.07);
  s.connect(g); g.connect(AMB.stepFilter); s.start(); s.stop(ac.currentTime + 0.09);
}
function updateAmbience(dt) {
  if (!AMB.ac || !AMB.city) return;
  const sfx = ambSfx();
  const cityOn = G.started && !G.paused && sfx > 0.001 && !(RADIO && RADIO.playing);
  const target = cityOn ? sfx * 0.16 : 0;
  AMB.city.gain.setTargetAtTime(target, AMB.ac.currentTime, 0.12);
  if (!(G.started && !G.paused) || G.mode !== 'foot' || !player.onGround || player.speed < 0.45 || sfx <= 0.001) return;
  AMB.stepT -= dt;
  if (AMB.stepT > 0) return;
  const run = player.speed > 6.2;
  AMB.stepT = run ? 0.28 : 0.46;
  ambFoot(run ? 0.42 : 0.26);
}
