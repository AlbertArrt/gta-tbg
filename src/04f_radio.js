
// ======================= RADIO (stacje w stylu GTA) =======================
const RADIO = { i: 0, audio: null, playing: false, auto: false, fails: 0, npTimer: 0, wd: 0, popT: 0, hideT: 0, now: '', msg: '', lastMode: 'foot', userOff: false };
function initRadio() {
  RADIO.i = clamp(settings.station | 0, 0, RADIO_STATIONS.length - 1);
  $('radioPlay').onclick = () => radioPower(); $('radioPrev').onclick = () => radioStep(-1); $('radioNext').onclick = () => radioStep(1);
  $('radioVol').value = settings.radioVol; $('radioVol').oninput = (e) => { settings.radioVol = parseFloat(e.target.value); saveSettings(); if (RADIO.audio) RADIO.audio.volume = settings.radioVol; };
  addEventListener('offline', () => { if (RADIO.playing) { radioStop(); radioMsg('Brak internetu – radio offline. Gra działa dalej.'); } });
  radioUI();
}
function radioMsg(t) { RADIO.msg = t || ''; $('radioMsg').textContent = RADIO.msg; radioUI(); }
function radioUI() {
  const s = RADIO_STATIONS[RADIO.i];
  $('radioName').textContent = s.name; $('radioGenre').textContent = s.genre + ' · ' + (RADIO.i + 1) + '/' + RADIO_STATIONS.length;
  $('radioNow').textContent = RADIO.playing ? (RADIO.now ? '♪ ' + RADIO.now : 'Na żywo') : 'Wyłączone';
  $('radioPlay').textContent = RADIO.playing ? '⏻ Wyłącz' : '⏻ Włącz'; $('btnRadio').classList.toggle('on', RADIO.playing);
  G.radio = { index: RADIO.i, name: s.name, genre: s.genre, url: s.url, playing: RADIO.playing, readyState: RADIO.audio ? RADIO.audio.readyState : 0, currentTime: RADIO.audio ? RADIO.audio.currentTime : 0, now: RADIO.now, msg: RADIO.msg, fails: RADIO.fails, count: RADIO_STATIONS.length };
}
function radioShowPanel(ms = 3500) { const p = $('radioPanel'); p.classList.remove('hidden'); clearTimeout(RADIO.hideT); RADIO.hideT = setTimeout(() => p.classList.add('hidden'), ms); }
function radioPopup() {
  const s = RADIO_STATIONS[RADIO.i]; const p = $('radioPop'); p.innerHTML = '<b>' + s.name + '</b><span>' + s.genre + '</span>';
  p.classList.remove('show'); void p.offsetWidth; p.classList.add('show'); clearTimeout(RADIO.popT); RADIO.popT = setTimeout(() => p.classList.remove('show'), 2600);
}
function toggleRadio() { radioShowPanel(6000); }   // HUD 📻 button: show the station switcher
function radioPower() { if (RADIO.playing) { RADIO.userOff = true; radioStop(); } else { RADIO.userOff = false; RADIO.fails = 0; radioPlay(); } radioShowPanel(); }
function radioStep(d) {
  RADIO.i = (RADIO.i + d + RADIO_STATIONS.length) % RADIO_STATIONS.length; settings.station = RADIO.i; saveSettings();
  RADIO.fails = 0; RADIO.userOff = false; radioPopup(); radioShowPanel(); radioPlay();
}
function radioPlay() {
  const s = RADIO_STATIONS[RADIO.i]; RADIO.now = '';
  if (navigator.onLine === false) { RADIO.playing = false; radioMsg('Brak internetu – radio offline. Gra działa normalnie.'); return; }
  if (!RADIO.audio) {
    const a = new Audio(); a.preload = 'none'; a.crossOrigin = null;
    a.addEventListener('playing', () => { RADIO.fails = 0; clearTimeout(RADIO.wd); radioMsg(''); radioNP(); });
    a.addEventListener('waiting', () => { if (RADIO.playing) radioMsg('Buforowanie…'); });
    a.addEventListener('error', () => { if (RADIO.playing && a.getAttribute('src')) radioFail('błąd strumienia'); });
    RADIO.audio = a;
  }
  const a = RADIO.audio; a.volume = settings.radioVol; a.src = s.url + (s.url.includes('?') ? '&' : '?') + 't=' + Date.now();
  RADIO.playing = true; radioMsg('Łączenie: ' + s.name + '…');
  const p = a.play(); const myI = RADIO.i;
  if (p && p.catch) p.catch((err) => { if (RADIO.i !== myI || !RADIO.playing) return; if (err && err.name === 'NotAllowedError') { RADIO.playing = false; radioMsg('Przeglądarka zablokowała dźwięk – dotknij ⏻ Włącz.'); } else radioFail('brak odpowiedzi'); });
  clearTimeout(RADIO.wd); RADIO.wd = setTimeout(() => { if (RADIO.playing && RADIO.i === myI && a.readyState < 3) radioFail('przekroczony czas'); }, 8000);
  clearInterval(RADIO.npTimer); RADIO.npTimer = setInterval(radioNP, 20000);
}
function radioFail(why) {
  RADIO.fails++; const s = RADIO_STATIONS[RADIO.i];
  if (RADIO.fails >= RADIO_STATIONS.length) { radioStop(); radioMsg('Radio offline – żadna stacja nie odpowiada. Gra działa normalnie.'); return; }
  RADIO.i = (RADIO.i + 1) % RADIO_STATIONS.length; radioMsg(s.name + ': ' + why + ' – przełączam dalej…'); radioPopup(); radioPlay();
}
function radioStop() {
  RADIO.playing = false; RADIO.now = ''; clearTimeout(RADIO.wd); clearInterval(RADIO.npTimer); RADIO.npTimer = 0;
  if (RADIO.audio) { RADIO.audio.pause(); RADIO.audio.removeAttribute('src'); RADIO.audio.load(); }
  radioMsg('');
}
const stopRadio = radioStop;
async function radioNP() {
  const s = RADIO_STATIONS[RADIO.i]; const myI = RADIO.i; if (!RADIO.playing) return;
  if (!s.np) { RADIO.now = ''; radioUI(); return; }
  try {
    if (s.np.type === 'soma') {
      const r = await fetch('https://somafm.com/songs/' + s.np.id + '.json', { cache: 'no-store' }); const j = await r.json(); const t = j.songs && j.songs[0];
      if (RADIO.i === myI) RADIO.now = t ? [t.artist, t.title].filter(Boolean).join(' – ') : '';
    } else if (s.np.type === 'leliwa') {
      const r = await fetch(s.np.url, { cache: 'no-store' }); const j = await r.json(); const t = j && j.now_playing && j.now_playing.song;
      if (RADIO.i === myI) RADIO.now = t ? (t.text || [t.artist, t.title].filter(Boolean).join(' – ')) : '';
    }
  } catch (e) { RADIO.now = ''; }
  radioUI();
}
function updateRadio() {
  // GTA-style: radio turns on when you get into a car (with station popup) and off when you get out
  if (!G.started) return;
  if (G.mode !== RADIO.lastMode) {
    RADIO.lastMode = G.mode;
    if (G.mode === 'car') { if (settings.radioAuto && !RADIO.userOff && !RADIO.playing) { RADIO.fails = 0; RADIO.auto = true; radioPlay(); } if (RADIO.playing || settings.radioAuto) radioPopup(); }
    else if (RADIO.auto) { RADIO.auto = false; if (RADIO.playing) radioStop(); }
  }
}
