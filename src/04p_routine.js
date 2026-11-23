// NPC-ROUTINE
// Własna, lokalna rutyna zleceniodawców (bez sieci, bez modelu językowego).
// Zegar: Europe/Warsaw, czyli czas lokalny urządzenia — gra dzieje się w Tarnobrzegu.
// 7:00–22:00 każdy dawca stoi na swoim posterunku i da się z nim pogadać.
// Przez 3 minuty w swojej minucie godziny robi krótki spacer (do ~3 m, wciąż w zasięgu rozmowy).
// 22:00–7:00 zostaje na miejscu, tylko kwestia jest senna. Misja nie znika.
// Nastrój (zadowolony / neutralny / zły) i kilka ostatnich spotkań siedzą w localStorage.
const NPC_MEM_KEY = 'gtatbg_npcmem';
const NPC_MEM_CAP = 10;
const NPC_BREAK = {
  taxi: 10, pizza: 15, race: 20, escape: 25, steal: 30, offroad: 35, courier: 40, final: 45,
  kursy: 50, targ: 5, uliczna: 12, jezioro: 18, drift: 22, tort: 28, placki: 33, list: 38, paczka: 48,
};
const NPC_MOOD_LINE = {
  zadowolony: 'Dobrze cię widzieć. Ostatnia robota była czysta.',
  zły: 'Znowu ty? Ostatnio się nie udało. Pokaż, że umiesz.',
  neutralny: 'Cześć. Masz chwilę na robotę?',
};

function warsawClock() {
  try {
    const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Warsaw', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date());
    let h = 0, m = 0;
    for (const p of parts) { if (p.type === 'hour') h = parseInt(p.value, 10) || 0; else if (p.type === 'minute') m = parseInt(p.value, 10) || 0; }
    return { h: ((h % 24) + 24) % 24, m: Math.max(0, Math.min(59, m)) };
  } catch (e) {
    const d = new Date();
    return { h: d.getHours(), m: d.getMinutes() };
  }
}
function npcPhase(m) {
  const c = warsawClock();
  const mins = c.h * 60 + c.m;
  if (mins < 7 * 60 || mins >= 22 * 60) return 'sleepy';
  const br0 = NPC_BREAK[(m && m.id) || ''];
  const br = br0 == null ? 10 : br0;
  const slot = c.m;
  if (slot >= br && slot < br + 3) return 'wander';
  return 'work';
}
function npcPin(m) {
  const ph = npcPhase(m);
  if (ph === 'wander') return 'spacer, wraca za chwilę';
  if (ph === 'sleepy') return 'senny, od 7:00';
  return 'na miejscu do 22:00';
}
function npcLoad() {
  try { const o = JSON.parse(localStorage.getItem(NPC_MEM_KEY) || '{}'); return o && typeof o === 'object' ? o : {}; } catch (e) { return {}; }
}
function npcSave(all) {
  try { localStorage.setItem(NPC_MEM_KEY, JSON.stringify(all)); } catch (e) { /* prywatny tryb */ }
}
function npcBag(id) {
  const all = npcLoad();
  const b = all[id];
  if (!b || typeof b !== 'object') return { log: [], mood: '', moodAt: 0 };
  if (!Array.isArray(b.log)) b.log = [];
  return b;
}
function npcMood(id) {
  const b = npcBag(id);
  if (b.mood !== 'zadowolony' && b.mood !== 'zły') return 'neutralny';
  if (!b.moodAt || Date.now() - b.moodAt > 20 * 3600000) return 'neutralny';
  return b.mood;
}
function npcPush(id, entry, mood) {
  if (!id) return;
  const all = npcLoad();
  const b = all[id] && typeof all[id] === 'object' ? all[id] : { log: [] };
  if (!Array.isArray(b.log)) b.log = [];
  b.log.push(entry);
  if (b.log.length > NPC_MEM_CAP) b.log = b.log.slice(-NPC_MEM_CAP);
  if (mood) { b.mood = mood; b.moodAt = entry.t; }
  all[id] = b;
  npcSave(all);
}
function npcRemember(id, kind, name) {
  const mood = kind === 'done' ? 'zadowolony' : (kind === 'fail' ? 'zły' : '');
  npcPush(id, { t: Date.now(), kind, name: name || '' }, mood);
}
function npcVisit(m) {
  if (!m || !m.id) return;
  const b = npcBag(m.id);
  const last = b.log[b.log.length - 1];
  if (last && last.kind === 'visit' && Date.now() - last.t < 120000) return;
  npcPush(m.id, { t: Date.now(), kind: 'visit', name: m.name || '' }, '');
}
function npcWhen(t) {
  const h = (Date.now() - t) / 3600000;
  if (h < 2) return 'przed chwilą';
  if (h < 16) return 'dziś';
  if (h < 40) return 'wczoraj';
  return 'ostatnio';
}
function npcCap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }
function npcMemoryLine(m) {
  const ev = [...(npcBag(m.id).log || [])].reverse().find((e) => e && (e.kind === 'done' || e.kind === 'fail'));
  if (!ev) return '';
  const w = npcWhen(ev.t);
  if (ev.kind === 'fail') {
    if (m.id === 'placki') return npcCap(w) + ' placki nie dojechały.';
    return npcCap(w) + ' „' + (ev.name || m.name) + '” się nie udało.';
  }
  if (m.id === 'placki') return 'O, to ty! ' + npcCap(w) + ' placki dowiozłeś na czas!';
  return 'O, to ty! ' + npcCap(w) + ' „' + (ev.name || m.name) + '” poszło gładko.';
}
function npcGreet(m) {
  if (!m) return '';
  const ph = npcPhase(m);
  const mood = npcMood(m.id);
  const mem = npcMemoryLine(m);
  const base = mem || NPC_MOOD_LINE[mood] || NPC_MOOD_LINE.neutralny;
  if (ph === 'sleepy') return (mem ? mem + ' ' : '') + 'Jestem senny, ale pogadam. Pełna para od siódmej.';
  if (ph === 'wander') return base + ' Krótka przerwa, ale jestem.';
  return base;
}
function paintNpcLabel(sprite, text, color) {
  let cv = sprite.userData.cv;
  if (!cv) {
    cv = document.createElement('canvas'); cv.width = 640; cv.height = 96; sprite.userData.cv = cv;
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
    sprite.material.map = tex; sprite.material.needsUpdate = true;
  }
  const g = cv.getContext('2d');
  g.clearRect(0, 0, 640, 96);
  g.fillStyle = 'rgba(8,16,30,0.78)';
  g.beginPath();
  if (g.roundRect) g.roundRect(4, 4, 632, 88, 26); else g.rect(4, 4, 632, 88);
  g.fill();
  g.strokeStyle = color || '#ffd21f'; g.lineWidth = 5; g.stroke();
  g.fillStyle = '#fff';
  g.font = (text.length > 36 ? 'bold 26px ' : 'bold 34px ') + 'system-ui, sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, 320, 50);
  sprite.material.map.needsUpdate = true;
  const w = Math.min(9.2, 4.4 + text.length * 0.11);
  sprite.scale.set(w, w * 96 / 640, 1);
}
function npcStep(m) {
  if (!m || !m.obj3) return;
  if (m.hx == null) { m.hx = m.gx; m.hz = m.gz; }
  let x = m.hx, z = m.hz;
  if (npcPhase(m) === 'wander') {
    const h = m.face != null ? m.face : 0;
    const along = Math.sin(performance.now() * 0.0012) * 3;
    const tx = m.hx + Math.cos(h) * along, tz = m.hz - Math.sin(h) * along;
    if (!insideBuilding(tx, tz, 0.55)) { x = tx; z = tz; }
  }
  if (m._npcX === x && m._npcZ === z) return;
  m._npcX = x; m._npcZ = z; m.gx = x; m.gz = z;
  m.obj3.g.position.set(x, groundH(x, z), z);
}
