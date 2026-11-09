
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
const TAXI_STOPS = [
  { name: 'Zamek w Dzikowie', x: 300, z: -575 }, { name: 'Szpital Wojewódzki', x: -68, z: 776 },
  { name: 'Dworzec PKS', x: -365, z: 933 }, { name: 'Stacja kolejowa', x: 478, z: 162 },
  { name: 'Osiedle Serbinów', x: 1216, z: -49 }, { name: 'Kościół św. Barbary', x: 973, z: 880 },
  { name: 'Plac Targowy', x: 1439, z: 240 }, { name: 'Stadion Miejski', x: -290, z: 700 },
  { name: 'Urząd Miasta', x: -87, z: 370 },
];
const DROP_STOPS = [
  { name: 'Muzeum Siarki', x: 789, z: -1258 }, { name: 'Serbinów', x: 1216, z: -49 },
  { name: 'Kościół św. Barbary', x: 973, z: 880 }, { name: 'Stacja kolejowa', x: 478, z: 162 },
  { name: 'Rynek', x: -7, z: 10 }, { name: 'Szpital Wojewódzki', x: -68, z: 776 },
  { name: 'Urząd Miasta', x: -87, z: 370 },
];
function pickNamed(list, n, ax, az) {
  const pool = list.filter((s) => Math.hypot(s.x - ax, s.z - az) > 160);
  for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); const t = pool[i]; pool[i] = pool[j]; pool[j] = t; }
  return pool.slice(0, n);
}
function legBudget(x1, z1, x2, z2) {
  let len = Math.hypot(x2 - x1, z2 - z1) * 1.5;
  const a = nearestNode(x1, z1, 280), b = nearestNode(x2, z2, 280);
  if (a >= 0 && b >= 0) {
    const path = astar(a, b, 12000);
    if (path) {
      const pts = pathPoints(path); let L = 0, lx = TR.nodes[a].x, lz = TR.nodes[a].z;
      for (let i = 0; i < pts.length; i += 2) { L += Math.hypot(pts[i] - lx, pts[i + 1] - lz); lx = pts[i]; lz = pts[i + 1]; }
      if (L > 30) len = L;
    }
  }
  return Math.round(Math.min(340, Math.max(120, len / 8 + 50)));
}
function chainCheckpoints(anchors, spacing) {
  const cps = []; let prev = null;
  for (const a of anchors) {
    const n = nearestNode(a[0], a[1], 380); if (n < 0) continue;
    if (prev == null) { prev = n; cps.push({ x: TR.nodes[n].x, z: TR.nodes[n].z, name: a[2] || '' }); continue; }
    const path = astar(prev, n, 12000);
    if (path) {
      const pts = pathPoints(path); let acc = 999, lx = TR.nodes[prev].x, lz = TR.nodes[prev].z;
      for (let i = 0; i < pts.length; i += 2) {
        acc += Math.hypot(pts[i] - lx, pts[i + 1] - lz); lx = pts[i]; lz = pts[i + 1];
        if (acc >= spacing) { cps.push({ x: lx, z: lz }); acc = 0; }
      }
    }
    cps.push({ x: TR.nodes[n].x, z: TR.nodes[n].z, name: a[2] || '' }); prev = n;
  }
  const out = [];
  for (const c of cps) { if (out.length && Math.hypot(out[out.length - 1].x - c.x, out[out.length - 1].z - c.z) < 28) { if (c.name) out[out.length - 1].name = c.name; continue; } out.push(c); }
  return out;
}
function beginNamedLeg(m) {
  const d = m.stops[m.leg]; m.dest = roadSpot(d.x, d.z, 120);
  const from = m.car || focusXZ(); m.t = legBudget(from.x, from.z, m.dest.x, m.dest.z);
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
    update(m) {
      const r = EGG.race; const cps = W.off && W.off.cpObjs;
      m.target = r.running && cps && cps[r.i] ? cps[r.i] : null;
      m.obj = 'Rajd nad jeziorem – limit 4:00' + (r.running ? ' · punkt ' + (r.i + 1) + '/' + (cps ? cps.length : 7) : '');
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
  { id: 'kursy', name: 'Kursy po mieście', giver: [186, 154], who: 'Pan Rysiek z postoju', where: 'postój przy Banku Pekao', reward: 180, recordPay: 40, side: true, bestKey: 'kursy', bestLow: true, col: '#f6c431',
    steps: ['Wsiądź do żółtej taksówki.', 'Zawieź trzech pasażerów pod prawdziwe adresy w Tarnobrzegu.', 'Każdy kurs ma własny, spokojny limit czasu.', 'Pełna nagroda tylko za pierwszym razem. Nowy rekord czasu daje małą premię.'],
    text: 'Trzy kursy, trzy adresy z miasta. Nie ścigaj się z czasem jak w Dzikowie – tu liczy się, że dowieziesz ludzi. Pierwszy raz płacę normalnie, potem tylko za pobicie rekordu.',
    start(m) { m.car = misCar(0xf6c431, roadSpot(m.gx + 6, m.gz + 3), { kind: 'taxi' }); m.stops = pickNamed(TAXI_STOPS, 3, m.gx, m.gz); m.leg = 0; m.stage = 0; m.bank = 0; m.t0 = performance.now(); },
    update(m) {
      if (!m.stops || m.stops.length < 3) return 'Nie ma wolnych kursów';
      if (m.car.wrecked) return 'Taksówka rozbita';
      if (m.stage === 0) { m.target = m.car; m.obj = 'Wsiądź do żółtej taksówki (kursy po mieście)'; if (inCar(m.car)) { m.stage = 1; beginNamedLeg(m); toast('Pasażer: „Poproszę ' + m.stops[0].name + '”', 2200); } return; }
      const d = m.stops[m.leg]; m.target = m.dest;
      m.obj = 'Kurs ' + (m.leg + 1) + '/3 → ' + d.name + (inCar(m.car) ? '' : ' · wróć do taksówki');
      if (m.t <= 0) return 'Pasażer wysiadł – za długo na kurs';
      if (inCar(m.car) && at(m.dest, 12, 5)) {
        m.bank += Math.max(0, m.t); m.leg++;
        if (m.leg >= 3) { m.bestNow = (performance.now() - m.t0) / 1000; return 'win'; }
        toast(d.name + ' ✓  Następny: ' + m.stops[m.leg].name, 2000); beginNamedLeg(m);
      }
    }, bonus: (m) => Math.round(Math.min(90, (m.bank || 0) / 3)) },
  { id: 'targ', name: 'Dostawa z targowiska', giver: [1439, 240], who: 'Halina z targowiska', where: 'Plac Targowy', reward: 150, recordPay: 40, side: true, bestKey: 'targ', bestLow: true, col: '#45b65a',
    steps: ['Wsiądź do białego auta przy targowisku.', 'Zawieź dwie skrzynki pod wylosowane, prawdziwe adresy.', 'Można delikatnie trącić – to nie jest dostawa szkła.', 'Nagroda za pierwszym razem, potem premia za szybszy rekord.'],
    text: 'Jabłka i ziemniaki same się nie zawiozą. Dwa adresy, spokojny czas na każdy. Pierwszy raz jest wypłata, kolejne jazdy – tylko gdy pobijesz swój czas.',
    start(m) {
      m.car = misCar(0xf4f1ea, roadSpot(m.gx + 8, m.gz + 4)); m.stops = pickNamed(DROP_STOPS, 2, m.gx, m.gz);
      m.goods = ['skrzynka jabłek', 'worek ziemniaków']; m.leg = 0; m.stage = 0; m.bank = 0; m.t0 = performance.now();
    },
    update(m) {
      if (!m.stops || m.stops.length < 2) return 'Targ już zamknięty';
      if (m.car.wrecked) return 'Dostawa się rozsypała';
      if (m.stage === 0) { m.target = m.car; m.obj = 'Wsiądź do auta z towarem'; if (inCar(m.car)) { m.stage = 1; beginNamedLeg(m); } return; }
      const d = m.stops[m.leg]; m.target = m.dest;
      m.obj = (m.goods[m.leg] || 'paczka') + ' → ' + d.name + ' (' + (m.leg + 1) + '/2)' + (inCar(m.car) ? '' : ' · wróć do auta');
      if (m.t <= 0) return 'Towar się zepsuł – za późno';
      if (inCar(m.car) && at(m.dest, 12, 5)) {
        m.bank += Math.max(0, m.t); m.leg++;
        if (m.leg >= 2) { m.bestNow = (performance.now() - m.t0) / 1000; return 'win'; }
        toast('Zostawione. Teraz: ' + m.stops[m.leg].name, 1800); beginNamedLeg(m);
      }
    }, bonus: (m) => Math.round(Math.min(70, (m.bank || 0) / 4)) },
  { id: 'uliczna', name: 'Próba uliczna', giver: [-733, 661], who: 'Kasia z klubu', where: 'Plac Tysiąclecia', reward: 230, recordPay: 40, side: true, bestKey: 'uliczna', bestLow: true, col: '#ff3b3b',
    steps: ['Wsiądź do sportowego auta na starcie.', 'Po odliczeniu jedź przez checkpointy: stadion, szpital, urząd, Rynek.', 'To jazda na czas, bez rywali. Limit jest liczony z długości trasy, z zapasem.', 'Pełna nagroda raz. Szybszy przejazd zapisuje rekord i małą premię.'],
    text: 'Pętla zachodnia: z Placu Tysiąclecia przez stadion i szpital, potem urząd i Rynek. Samochód dam. Bez rywali – liczy się twój czas. Pierwszy ukończony przejazd jest płatny.',
    start(m) {
      const s = roadSpot(m.gx, m.gz, 80); m.car = misCar(0xe8503a, s, { model: 'sport' });
      m.cps = chainCheckpoints([[-733, 661, 'start'], [-290, 700, 'Stadion'], [-68, 776, 'Szpital'], [-87, 370, 'Urząd'], [-7, 10, 'Rynek']], 170);
      m.cps = m.cps.filter((c) => Math.hypot(c.x - s.x, c.z - s.z) > 36);
      if (m.cps.length < 3) { m.failFast = 'Nie udało się ułożyć trasy po ulicach'; return; }
      let len = 0, lx = s.x, lz = s.z; for (const c of m.cps) { len += Math.hypot(c.x - lx, c.z - lz); lx = c.x; lz = c.z; }
      m.limit = Math.round(Math.min(420, Math.max(180, len / 8 + 55))); m.i = 0; m.stage = 0;
    },
    update(m, dt) {
      if (m.failFast) return m.failFast;
      if (m.car.wrecked) return 'Auto próby rozbite';
      if (m.stage === 0) { m.target = m.car; m.obj = 'Wsiądź do czerwonego auta na starcie próby'; if (inCar(m.car)) { m.stage = 1; m.count = 3.4; } return; }
      if (m.stage === 1) { m.count -= dt; m.obj = 'Start za ' + Math.max(1, Math.ceil(m.count - 0.4)); m.target = m.cps[0]; if (m.count <= 0.4) { m.stage = 2; m.t = m.limit; m.t0 = performance.now(); banner('START!', 'go', 900); } return; }
      const c = m.cps[m.i]; m.target = c; m.obj = 'Checkpoint ' + (m.i + 1) + '/' + m.cps.length + (c.name ? ' · ' + c.name : '');
      if (m.t <= 0) return 'Za wolno – limit ' + fmtT(m.limit).slice(0, 5);
      if (inCar(m.car) && at(c, 12, 30)) { m.i++; if (m.i >= m.cps.length) { m.bestNow = (performance.now() - m.t0) / 1000; return 'win'; } }
    } },
  { id: 'jezioro', name: 'Próba nad jeziorem', giver: [-1798, 2363], who: 'Marek, ratownik', where: 'plaża Jeziora Tarnobrzeskiego', reward: 260, recordPay: 40, side: true, bestKey: 'jezioro', bestLow: true, col: '#22e6ff',
    steps: ['Dostań się na ścieżki off-road nad jeziorem (wjazd albo teleport przy pomniku Głowackiego).', 'Musisz być autem na ścieżce – terenówka trzyma się lepiej.', 'Potem 4 checkpointy w odwrotnej kolejności niż tajny rajd.', 'Limit jest luźniejszy niż w misji fabularnej. Nagroda raz, rekord zostaje.'],
    text: 'Inna pętla niż rajd Głowackiego: cztery punkty pod prąd, bez obowiązku zejść poniżej 4 minut. Z miasta nie ma ulicy przez jezioro – albo dojedź na plażę i na ścieżkę, albo użyj teleportu przy pomniku. Teleport przy pomniku włącza też stary przejazd z checkpointami; ta próba liczy własne punkty.',
    start(m) {
      const cps = (W.off && W.off.cps) || []; const idx = [6, 4, 2, 0].filter((i) => cps[i]);
      m.cps = idx.map((i) => ({ x: cps[i][0], z: cps[i][1] }));
      if (m.cps.length < 3) { m.failFast = 'Brak ścieżek off-road'; return; }
      let len = 0; for (let i = 1; i < m.cps.length; i++) len += Math.hypot(m.cps[i].x - m.cps[i - 1].x, m.cps[i].z - m.cps[i - 1].z);
      m.limit = Math.round(Math.min(420, Math.max(240, len * 1.35 / 6 + 70))); m.stage = 0; m.i = 0; m.outT = 0;
    },
    update(m, dt) {
      if (m.failFast) return m.failFast;
      const f = focusXZ();
      if (m.stage === 0) {
        const th = W.off && W.off.th ? W.off.th : { x: -1000, z: 2650 };
        m.target = { x: th.x, z: th.z }; m.obj = 'Wjedź na ścieżkę off-road (plaża albo teleport przy pomniku Głowackiego)';
        const onTrail = typeof nearestTrailPoint === 'function' && nearestTrailPoint(f.x, f.z, 18);
        if (inOffRect(f.x, f.z) && onTrail && G.mode === 'car' && !activeCar.wrecked) { m.stage = 1; m.count = 3.2; m.target = m.cps[0]; toast('Ścieżka złapana. Szykuj się.', 1600); }
        return;
      }
      if (m.stage === 1) { m.count -= dt; m.target = m.cps[0]; m.obj = 'Start za ' + Math.max(1, Math.ceil(m.count)); if (m.count <= 0) { m.stage = 2; m.t = m.limit; m.t0 = performance.now(); banner('START!', 'go', 900); } return; }
      m.target = m.cps[m.i]; m.obj = 'Off-road ' + (m.i + 1) + '/' + m.cps.length;
      if (m.t <= 0) return 'Koniec czasu próby nad jeziorem';
      if (!inOffRect(f.x, f.z)) m.outT += dt; else m.outT = 0;
      if (m.outT > 12) return 'Wyjechałeś ze strefy off-road';
      if (G.mode === 'car' && at(m.target, 14, 40)) { m.i++; if (m.i >= m.cps.length) { m.bestNow = (performance.now() - m.t0) / 1000; return 'win'; } toast('Checkpoint ' + m.i + '/' + m.cps.length, 1000); }
    } },
  { id: 'drift', name: 'Drift pod Lidlem', giver: [514, 320], who: 'Darek od opon', where: 'parking przy Lidlu', reward: 210, recordPay: 40, side: true, bestKey: 'drift', bestLow: false, col: '#ffd21f',
    steps: ['Wjedź w żółte kółko (swoim autem albo czerwonym sportowym).', 'W 75 sekund uzbieraj 800 punktów driftu wewnątrz strefy.', 'Ręczny (spacja / RĘCZNY) i skręt. Poza kółkiem punkty stoją, nie kasują się.', 'Pierwsze zaliczenie płaci. Lepszy wynik daje premię za rekord.'],
    text: 'Pokaż, że umiesz bokiem. Osiemset punktów w półtorej minuty, w żółtym kółku przy Lidlu. Jak rozbijesz serię, punkty z tamtego ślizgu przepadają – jak zwykle – ale to, co już wpadło do licznika misji, zostaje.',
    start(m) {
      const s = roadSpot(514, 320, 80); m.zone = { x: s.x, z: s.z, r: 100 }; m.goal = 800; m.stage = 0; m.score = 0; m._lastSc = null;
      if (G.mode === 'car' && activeCar && !activeCar.wrecked && !activeCar.scooter) { m.keepCar = true; m.car = activeCar; }
      else m.car = misCar(0xe8503a, s, { model: 'sport' });
      if (typeof navZone === 'function') navZone(m.zone.x, m.zone.z, m.zone.r, true);
    },
    update(m) {
      if (typeof navZone === 'function') navZone(m.zone.x, m.zone.z, m.zone.r, true);
      const f = focusXZ(); const inside = Math.hypot(f.x - m.zone.x, f.z - m.zone.z) < m.zone.r && G.mode === 'car' && !activeCar.wrecked;
      if (m.stage === 0) { m.target = m.zone; m.obj = 'Wjedź do żółtej strefy driftu'; if (inside) { m.stage = 1; m.t = 75; m._lastSc = DRV.drift.score || 0; toast('Drift! Cel: 800 pkt', 1600); } return; }
      const sc = DRV.drift.score || 0; if (m._lastSc == null) m._lastSc = sc;
      const dlt = sc - m._lastSc; m._lastSc = sc; if (dlt > 0 && inside) m.score += dlt;
      m.target = m.zone; m.obj = 'Drift ' + Math.round(m.score) + ' / ' + m.goal + (inside ? '' : ' · wróć do kółka');
      if (m.score >= m.goal) { m.bestNow = Math.round(m.score); return 'win'; }
      if (m.t <= 0) {
        const scn = Math.round(m.score); if (scn > (SAVE.best.drift || 0)) { SAVE.best.drift = scn; saveGame(); }
        return 'Za mało punktów (' + scn + '/' + m.goal + ')';
      }
    }, cleanup() { if (typeof navZone === 'function') navZone(0, 0, 0, false); } },
  { id: 'tort', name: 'Tort do Dzikowa', giver: [-237, 770], who: 'Cukiernia Skalski', where: 'piekarnia Skalski', reward: 240, recordPay: 40, side: true, bestKey: 'tort', bestLow: true, col: '#e86fa0',
    steps: ['Wsiądź do auta pod piekarnią.', 'Zawieź tort do Zamku w Dzikowie.', 'Każde prawdziwe uszkodzenie (spadek HP) psuje tort. Lekkie otarcie poniżej progu gry się nie liczy.', 'Masz kilka sekund spokoju na wyjechanie ze stanowiska. Nagroda raz, rekord czasu zostaje.'],
    text: 'Wesele na zamku, tort w aucie. Jedno mocniejsze uderzenie i krem jest na szybie. Czas jest liczony z długości ulic, z zapasem – jedź spokojnie, nie na złamanie karku.',
    start(m) { m.car = misCar(0xfff1f6, roadSpot(m.gx + 6, m.gz + 3), { model: 'hatch' }); m.dest = roadSpot(300, -575, 140); m.stage = 0; m.grace = 0; },
    update(m, dt) {
      if (m.car.wrecked) return 'Tort spłonął razem z autem';
      if (m.stage === 0) { m.target = m.car; m.obj = 'Wsiądź do auta z tortem'; if (inCar(m.car)) { m.stage = 1; m.t = Math.max(220, legBudget(m.car.x, m.car.z, m.dest.x, m.dest.z)); m.grace = 4; m.t0 = performance.now(); toast('Tort na siedzeniu. Bez stłuczek.', 2000); } return; }
      if (m.grace > 0) { m.grace -= dt; if (m.grace <= 0) { m.car.hp = 100; m.car.burn = 0; } }
      else if (m.car.hp < 99.5) return 'Tort się rozmazał – auto uszkodzone';
      m.target = m.dest; m.obj = (inCar(m.car) ? 'Dowieź tort do Zamku w Dzikowie' : 'Wróć do auta z tortem!') + ' · karoseria ' + Math.round(m.car.hp) + '%';
      if (m.t <= 0) return 'Wesele zaczęło się bez tortu';
      if (inCar(m.car) && at(m.dest, 12, 4)) { m.bestNow = (performance.now() - m.t0) / 1000; return 'win'; }
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
    const p = misPlace(gx + (m.id === 'taxi' ? 12 : 0), gz + (m.id === 'taxi' ? 9 : 0), 1.2); m.gx = p.x; m.gz = p.z; m.cool = Math.hypot(player.x - p.x, player.z - p.z) < 12; m.obj3 = makeGiver(p.x, p.z, m.col, m.who, m.id);
  }
  MIS.tgt = makeTarget();
  const hud = $('hud'); const mh = document.createElement('div'); mh.id = 'mhud'; mh.className = 'hidden';
  mh.innerHTML = '<button type="button" id="objTab" aria-expanded="true" title="Pokaż lub schowaj cel (H)"><b id="objTabKey">H</b><em id="objTabTime"></em><small id="objTabDir"></small></button><div id="objSlide"><div id="objCard"><b id="objTitle"></b><span id="objText"></span><em id="objTime"></em><small id="objGps"></small><button type="button" id="gpsX" class="hidden">Anuluj GPS</button></div></div>';
  hud.appendChild(mh);
  const dl = document.createElement('div'); dl.id = 'dialog'; dl.className = 'cdialog hidden';
  dl.innerHTML = '<div class="who" id="dlgWho"></div><h3 id="dlgTitle"></h3><p id="dlgText"></p><div class="reward" id="dlgReward"></div><div class="btns"><button id="dlgYes">Przyjmij (E)</button><button id="dlgNo" class="sec">Nie teraz (Esc)</button></div>';
  document.body.appendChild(dl);
  $('dlgYes').onclick = () => dialogAction(); $('dlgNo').onclick = () => dialogClose();
  for (const id of ['dialog', 'shopMenu']) { $(id).addEventListener('touchstart', (e) => e.stopPropagation(), { passive: true }); $(id).addEventListener('mousedown', (e) => e.stopPropagation()); }
}
const GIVER_LOOK = {
  taxi: { hairStyle: 'cap', cap: 0x2a211c, jacket: 0xf6c431 },
  pizza: { hairStyle: 'short', jacket: 0xff7a2a },
  race: { hairStyle: 'pony', bag: 0x2a211c },
  escape: { hairStyle: 'bun', jacket: 0x5a3d80 },
  steal: { hairStyle: 'cap', cap: 0x6b4a32 },
  offroad: { hairStyle: 'long' },
  courier: { hairStyle: 'bun', skirt: true, bag: 0xf4f1ea },
  final: { hairStyle: 'short', jacket: 0x3a3a3a },
  kursy: { hairStyle: 'cap', cap: 0x2a211c, jacket: 0xf6c431 },
  targ: { hairStyle: 'long', skirt: true },
  uliczna: { hairStyle: 'pony', jacket: 0xff3b3b },
  jezioro: { hairStyle: 'short', bag: 0x1a6a8a },
  drift: { hairStyle: 'cap', cap: 0x222222, jacket: 0x2a211c },
  tort: { hairStyle: 'bun', skirt: true, jacket: 0xffd0e0 },
};
function makeGiver(x, z, col, who, id) {
  const g = new THREE.Group(); g.position.set(x, groundH(x, z), z);
  const c = new THREE.Color(col);
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 26, 16, 1, true), new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending })); beam.position.y = 13; g.add(beam);
  const ring = new THREE.Mesh(new THREE.RingGeometry(1.4, 1.9, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.9, depthWrite: false })); ring.position.y = 0.22; g.add(ring);
  const look = GIVER_LOOK[id] || { hairStyle: 'short' };
  const w = makeWalker({ shirt: c.getHex(), ...look }); g.add(w);
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
function storyDoneCount() { return MIS.list.filter((q) => q.done && !q.side && q.id !== 'final').length; }
function giverOpen(m) { return !MIS.active && !m.busy && (!m.needs || storyDoneCount() >= m.needs); }
function nearGiver() {
  const f = focusXZ(); for (const m of MIS.list) if (!m.range && giverOpen(m) && Math.hypot(f.x - m.gx, f.z - m.gz) < (G.mode === 'car' ? 7 : 3.6)) return m; return null;
}
function missionHint() {
  if (MIS.active) return null; const m = nearGiver(); if (!m) return null;
  return (isTouch ? 'Dotknij AKCJA' : 'E') + ': porozmawiaj – ' + m.who + ' (' + m.name + ')';
}
function missionAction() { const m = nearGiver(); if (!m) return false; dialogOpen(m); return true; }
function dialogOpen(m) {
  MIS.dlg = m; G.paused = true; G.dialogOpen = true; if (document.pointerLockElement) document.exitPointerLock();
  $('dlgWho').textContent = m.who; $('dlgTitle').textContent = (m.done ? '✔ ' : '') + m.name; $('dlgText').textContent = '„' + m.text + '”';
  const rep = m.side ? (SAVE.claimed[m.id] ? ' · nagroda już odebrana – liczy się rekord' : ' · pełna nagroda tylko za pierwszym razem') : (m.done ? ' · już zaliczona – możesz powtórzyć' : '');
  $('dlgReward').textContent = 'Nagroda: ' + m.reward + ' zł' + rep;
  $('dialog').classList.remove('hidden');
}
function dialogClose() { if (!MIS.dlg) return; const m = MIS.dlg; m.cool = true; MIS.dlg = null; G.dialogOpen = false; G.paused = false; clock.getDelta(); $('dialog').classList.add('hidden'); }
function dialogAction() { if (!MIS.dlg) return false; const m = MIS.dlg; dialogClose(); missionStart(m); return true; }
function missionStart(m) {
  if (!m || MIS.active) return; MIS.active = m; m.t = undefined; m.target = null; m.obj = ''; m.stage = 0; m.car = null; m.keepCar = false; m.failFast = null; m.bestNow = null; m.startAt = performance.now();
  if (typeof NAV !== 'undefined') NAV.msig = '';
  m.start(m); MIS.events.push({ id: m.id, ev: 'start', t: performance.now() });
  banner(m.name, 'mstart', 2000); $('mhud').classList.remove('hidden');
}
function settleSide(m) {
  const first = !SAVE.claimed[m.id]; let improved = false;
  if (m.bestKey && typeof m.bestNow === 'number' && isFinite(m.bestNow)) {
    const prev = SAVE.best[m.bestKey]; const now = m.bestLow ? m.bestNow : Math.round(m.bestNow);
    improved = prev == null || (m.bestLow ? now < prev - 0.05 : now > prev + 0.5);
    if (improved) SAVE.best[m.bestKey] = m.bestLow ? +now.toFixed(2) : now;
  }
  let pay = 0;
  if (first) { pay = (m.pay ? m.pay(m) : m.reward) + (m.bonus ? (m.bonus(m) || 0) : 0); SAVE.claimed[m.id] = true; }
  else if (improved) pay = m.recordPay || 40;
  return { pay: Math.max(0, Math.round(pay) || 0), first, improved };
}
function missionEnd(ok, why) {
  const m = MIS.active; if (!m) return; MIS.active = null; MIS.tgt.g.visible = false;
  if (m.cleanup) m.cleanup(m);
  if (m.car && !m.keepCar) misDropCarLater(m.car); else if (m.car) m.car.mission = false;
  m.car = null;
  if (typeof navClear === 'function') { NAV.msig = ''; navClear(); }
  if (typeof navZone === 'function') navZone(0, 0, 0, false);
  MIS.events.push({ id: m.id, ev: ok ? 'pass' : 'fail', why, t: performance.now() });
  if (ok) {
    let pay, note = '';
    if (m.side) {
      const s = settleSide(m); pay = s.pay;
      if (!s.first && s.improved) note = 'NOWY REKORD!\n+' + pay + ' zł';
      else if (!s.first) note = 'UKOŃCZONE PONOWNIE\nbez premii – rekord bez zmian';
    } else pay = m.pay ? m.pay(m) : m.reward + (m.bonus ? (m.bonus(m) || 0) : 0);
    m.done = true; SAVE.done[m.id] = true;
    if (pay) addMoney(pay); else saveGame();
    banner(note || ('MISJA ZALICZONA!\n+' + pay + ' zł'), 'pass', 3600); MIS.lastPay = pay;
    if (!m.side && m.id !== 'final' && storyDoneCount() === 5 && !SAVE.finalHint) { SAVE.finalHint = true; saveGame(); setTimeout(() => toast('Odblokowano finał! Wielki Szef czeka przy Muzeum Siarki', 4000), 3800); }
    if (m.id === 'final') setTimeout(() => banner('LEGENDA TARNOBRZEGA! 🏆', 'pass', 5000), 3800);
  } else { banner('MISJA NIEUDANA\n' + (why || ''), 'fail', 3200); }
  m.cool = true;
  if ($('mhud') && !(typeof NAV !== 'undefined' && NAV.on)) $('mhud').classList.add('hidden');
}
function missionCancel() {
  const m = MIS.active; if (!m) return;
  MIS.active = null; if (MIS.tgt) MIS.tgt.g.visible = false;
  if (m.cleanup) m.cleanup(m);
  if (m.car && !m.keepCar) misDropCarLater(m.car); else if (m.car) m.car.mission = false;
  m.car = null; m.cool = true;
  if (typeof navClear === 'function') { NAV.msig = ''; navClear(); }
  if (typeof navZone === 'function') navZone(0, 0, 0, false);
  MIS.events.push({ id: m.id, ev: 'cancel', t: performance.now() });
  banner('MISJA ANULOWANA', 'fail', 1400);
  if ($('mhud') && !(typeof NAV !== 'undefined' && NAV.on)) $('mhud').classList.add('hidden');
}
function misDropCarLater(c) { if (c === activeCar) { c.mission = false; return; } c.dropAt = performance.now(); MIS.drop = MIS.drop || []; MIS.drop.push(c); }
function missionFail(why) { if (MIS.active) missionEnd(false, why); }
function missionImpact(v) { const m = MIS.active; if (m && m.impact) m.impact(m, v); }
function missionEvent(ev) { /* hook: 'lost' when police chase ends */ MIS.lastEvent = ev; }
function updateMissions(dt) {
  const f = focusXZ(); const tt = performance.now() * 0.003;
  for (const m of MIS.list) {
    const o = m.obj3; if (!o) continue; const show = giverOpen(m); o.g.visible = show; if (!show) continue;
    const d = Math.hypot(f.x - m.gx, f.z - m.gz); o.beam.material.opacity = 0.16 + 0.1 * Math.sin(tt + m.gx); o.ex.position.y = 3.2 + Math.sin(tt * 1.5) * 0.25; o.lab.visible = d < 40;
    o.w.rotation.y = Math.atan2(f.x - m.gx, f.z - m.gz);
    if (d < 80) animateWalker(o.w, 0, dt, false);
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
  if (typeof navOnMission === 'function') navOnMission(m);
}
function drawMissionMinimap(g, sc) {
  g.lineWidth = 2 / sc; g.strokeStyle = '#2a211c';
  for (const m of MIS.list) { if (m.range || !giverOpen(m)) continue; g.fillStyle = m.col; g.beginPath(); g.arc(m.gx, m.gz, 8 / sc, 0, 7); g.fill(); g.stroke(); g.fillStyle = '#2a211c'; g.font = 'bold ' + (11 / sc) + 'px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('!', m.gx, m.gz + 0.5 / sc); }
  if (typeof drawRangeMinimap === 'function') drawRangeMinimap(g, sc);
  const T = MIS.active && MIS.active.target; if (T && T !== activeCar) { g.fillStyle = '#ffd21f'; g.beginPath(); g.moveTo(T.x, T.z - 11 / sc); g.lineTo(T.x + 8 / sc, T.z); g.lineTo(T.x, T.z + 11 / sc); g.lineTo(T.x - 8 / sc, T.z); g.closePath(); g.fill(); g.stroke(); }
  if (MIS.active && MIS.active.cps) { g.fillStyle = '#ff3b3b'; for (const r of MIS.active.rivals || []) { g.beginPath(); g.arc(r.x, r.z, 5 / sc, 0, 7); g.fill(); } }
  for (const c of POL.cars) if (c.g.visible && c !== activeCar && (c.pai || c.block || c.patrol)) { const b = Math.floor(performance.now() / 250) % 2; g.fillStyle = c.patrol ? '#3d6fe0' : (b ? '#ff2a2a' : '#2a5cff'); g.beginPath(); g.arc(c.x, c.z, 6 / sc, 0, 7); g.fill(); g.stroke(); }
  for (const p of POL.foot) if (p.on) { g.fillStyle = '#2a5cff'; g.beginPath(); g.arc(p.x, p.z, 4 / sc, 0, 7); g.fill(); }
  g.fillStyle = '#ff3fa4'; for (const s of PLACES.shops) { g.beginPath(); g.arc(s.x, s.z, 6 / sc, 0, 7); g.fill(); g.stroke(); }
  if (typeof drawGarageMinimap === 'function') { drawGarageMinimap(g, sc); drawPickupMinimap(g, sc); }
}
