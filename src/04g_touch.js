
// ======================= DOTYK – wielodotyk na Pointer Events =======================
// Każdy palec (pointerId) śledzony osobno: pływający joystick + przyciski (przytrzymanie z przesuwaniem palca
// między GAZ/HAM.) + kamera jednocześnie. Brak opóźnień (pointerdown), brak przewijania/zoomu (touch-action:none).
const TP = { ptrs: new Map(), joy: null, look: null, btns: [], held: {}, pads: 14, stats: { down: 0, up: 0, cancel: 0, reset: 0 } };
function initTouch() {
  const root = $('touch');
  TP.btns = [...root.querySelectorAll('.tb')].map((el) => ({ el, kind: el.dataset.kind || 'tap', key: el.dataset.key || el.id }));
  root.addEventListener('pointerdown', tDown, { passive: false });
  addEventListener('pointermove', tMove, { passive: false });
  addEventListener('pointerup', tUp, { passive: false }); addEventListener('pointercancel', (e) => { TP.stats.cancel++; tUp(e); });
  root.addEventListener('lostpointercapture', (e) => { if (TP.ptrs.has(e.pointerId)) tUp(e); });
  // klasyczne zdarzenia touch: tylko blokujemy domyślne zachowania (przewijanie, zoom, menu przytrzymania)
  for (const ev of ['touchstart', 'touchmove', 'touchend']) root.addEventListener(ev, (e) => { if (e.cancelable) e.preventDefault(); }, { passive: false });
  root.addEventListener('contextmenu', (e) => e.preventDefault());
  root.addEventListener('selectstart', (e) => e.preventDefault());
  addEventListener('blur', touchReset); addEventListener('pagehide', touchReset);
  document.addEventListener('visibilitychange', () => { if (document.hidden) touchReset(); });
  applyTouchLayout();
}
function applyTouchLayout() {
  const r = document.documentElement.style; r.setProperty('--bs', settings.btnScale || 1);
  $('touch').classList.toggle('lefty', !!settings.leftHanded);
  TP.pads = Math.round(16 * (settings.btnScale || 1));
}
function buzz(ms = 10) { if (settings.vibrate && navigator.vibrate) { try { navigator.vibrate(ms); } catch (e) { /* ignore */ } } }
function btnAt(x, y, holdOnly) {
  let best = null, bd = 1e9;
  for (const b of TP.btns) {
    if (holdOnly && b.kind !== 'hold') continue;
    const r = b.el.getBoundingClientRect(); if (!r.width || !r.height) continue; // ukryty (display:none)
    const p = TP.pads; if (x < r.left - p || x > r.right + p || y < r.top - p || y > r.bottom + p) continue;
    const d = Math.hypot(x - (r.left + r.right) / 2, y - (r.top + r.bottom) / 2); if (d < bd) { bd = d; best = b; }
  }
  return best;
}
function bPress(b) {
  b.el.classList.add('active'); buzz(b.kind === 'hold' ? 8 : 12);
  if (b.kind === 'hold') { TP.held[b.key] = (TP.held[b.key] || 0) + 1; G.touch[b.key] = true; return; }
  if (b.key === 'jump') G.touch.jump = true; else if (b.key === 'enter') actionE(); else if (b.key === 'radio') radioStep(1);
}
function bRelease(b) {
  if (!b) return; if (b.kind === 'hold') { TP.held[b.key] = Math.max(0, (TP.held[b.key] || 0) - 1); if (!TP.held[b.key]) { G.touch[b.key] = false; b.el.classList.remove('active'); } }
  else b.el.classList.remove('active');
}
function joyLeftSide(x) { return settings.leftHanded ? x > innerWidth * 0.5 : x < innerWidth * 0.5; }
function joyR() { return Math.max(48, Math.min(innerWidth, innerHeight) * 0.13) * (settings.btnScale || 1); }
function tDown(e) {
  if (e.cancelable) e.preventDefault(); TP.stats.down++;
  const x = e.clientX, y = e.clientY, id = e.pointerId;
  try { $('touch').setPointerCapture(id); } catch (err) { /* ignore */ }
  const b = btnAt(x, y);
  if (b) { TP.ptrs.set(id, { t: 'btn', b }); bPress(b); return; }
  if (!TP.joy && joyLeftSide(x) && y > innerHeight * 0.25) {
    TP.joy = { id, ox: x, oy: y }; TP.ptrs.set(id, { t: 'joy' });
    const base = $('joy'); base.classList.add('on'); base.style.left = x + 'px'; base.style.top = y + 'px'; base.style.right = 'auto'; base.style.bottom = 'auto';
    joySet(x, y); return;
  }
  if (!TP.look) { TP.look = { id, x, y }; TP.ptrs.set(id, { t: 'look' }); G.mouseLooking = true; return; }
  TP.ptrs.set(id, { t: 'none' });
}
function joySet(x, y) {
  const j = TP.joy, R = joyR(); let dx = x - j.ox, dy = y - j.oy; const l = Math.hypot(dx, dy);
  if (l > R) { // pływający środek: podąża za palcem, gdy wyjedzie poza zasięg
    const k = (l - R) / l; j.ox += dx * k; j.oy += dy * k; dx = x - j.ox; dy = y - j.oy;
    const base = $('joy'); base.style.left = j.ox + 'px'; base.style.top = j.oy + 'px';
  }
  $('joyKnob').style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
  let nx = dx / R, ny = dy / R; const m = Math.hypot(nx, ny), DZ = 0.07;
  if (m < DZ) { nx = ny = 0; } else { const s = Math.min(1, (m - DZ) / (1 - DZ)) / m; nx *= s; ny *= s; }
  G.touch.jx = nx; G.touch.jy = ny; G.touch.jon = true;
}
function tMove(e) {
  const p = TP.ptrs.get(e.pointerId); if (!p) return; if (e.cancelable) e.preventDefault();
  const x = e.clientX, y = e.clientY;
  if (p.t === 'joy') joySet(x, y);
  else if (p.t === 'look') {
    const L = TP.look; const dx = x - L.x, dy = y - L.y; L.x = x; L.y = y;
    const acc = 1 + Math.min(1, Math.hypot(dx, dy) / 30) * 0.6; // delikatne przyspieszenie przy szybkich ruchach
    look(dx * 1.35 * acc, dy * 1.1 * acc);
  } else if (p.t === 'btn' && p.b.kind === 'hold') { // przesuwanie palca między GAZ / HAM. / RĘCZNY
    const nb = btnAt(x, y, true);
    if (nb && nb !== p.b) { bRelease(p.b); p.b = nb; bPress(nb); }
  }
}
function tUp(e) {
  const p = TP.ptrs.get(e.pointerId); if (!p) return; TP.ptrs.delete(e.pointerId); TP.stats.up++;
  if (p.t === 'btn') bRelease(p.b);
  else if (p.t === 'joy') joyEnd();
  else if (p.t === 'look') { TP.look = null; G.mouseLooking = false; }
}
function joyEnd() { TP.joy = null; G.touch.jx = G.touch.jy = 0; G.touch.jon = false; const base = $('joy'); base.classList.remove('on'); base.style.left = base.style.top = base.style.right = base.style.bottom = ''; $('joyKnob').style.transform = ''; }
function touchReset() {
  TP.stats.reset++; TP.ptrs.clear(); TP.look = null; TP.held = {}; joyEnd(); G.mouseLooking = false;
  for (const k of ['gas', 'brake', 'hand', 'run', 'jump']) G.touch[k] = false;
  for (const b of TP.btns) b.el.classList.remove('active');
  if (G.keys) G.keys.clear();
}
// krzywa skrętu: precyzyjnie przy środku, pełny skręt na krawędzi; czułość z ustawień
function steerCurve(v) { const a = Math.abs(v); const c = 0.4 * a + 0.6 * a * a * a; return Math.sign(v) * Math.min(1, c * (settings.steerSens || 1)); }
