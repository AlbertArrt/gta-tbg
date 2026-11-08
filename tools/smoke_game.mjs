import pw from "/tmp/pw/node_modules/playwright-core/index.js";
const { chromium } = pw;
import fs from "fs";

const base = process.env.BASE || "http://127.0.0.1:8765";
const outDir = process.env.OUT || "/tmp/tbg-shots";
fs.mkdirSync(outDir, { recursive: true });

const errors = [];
function attach(page, tag) {
  page.on("pageerror", (e) => errors.push(tag + " pageerror: " + e.message));
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(tag + " console: " + msg.text());
  });
}

async function boot(page, save) {
  await page.addInitScript((payload) => {
    localStorage.setItem("tb3d-settings", JSON.stringify({ quality: "low", style: "lite", fps: true, radioAuto: false }));
    if (payload) localStorage.setItem("gtatbg_save", JSON.stringify(payload));
  }, save || null);
  await page.goto(base + "/", { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForFunction(() => window.__tb && window.__tb.ready, null, { timeout: 120000 });
}

const browser = await chromium.launch({
  executablePath: process.env.CHROME || "/usr/bin/google-chrome",
  headless: true,
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist", "--disable-dev-shm-usage"],
});

const desk = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
const page = await desk.newPage();
attach(page, "desk");

const v2 = {
  v: 2, money: 4321, done: { taxi: true, pizza: true }, best: { legacy: 3 },
  garage: { cars: [{ uid: 7, model: "sedan", color: 0x336699, up: { engine: 2, brakes: 1, grip: 0, armor: 0, nitro: 1 } }], sel: 7, next: 8 },
  stats: { driftBest: 12, driftCash: 4, jumps: 1, jumpBest: 0.8, pickups: 2 },
  finalHint: true,
};
await boot(page, v2);
const mig = await page.evaluate(() => {
  const s = window.__tb.save();
  const g = window.__tb.garage();
  return {
    v: s.v, money: s.money, taxi: !!s.done.taxi, pizza: !!s.done.pizza, legacy: s.best.legacy,
    claimed: s.claimed, tut: s.tut, uid: g.cars.map((c) => c.uid), engine: g.cars[0] && g.cars[0].up.engine,
    places: g.places.length, shops: window.__tb.places.shops.length, stars: window.__tb.police().stars,
    stations: document.body.innerText.includes("Leliwa") || true,
  };
});
console.log("MIG", JSON.stringify(mig));
if (mig.v !== 3) throw new Error("save not migrated to v3");
if (mig.money !== 4321) throw new Error("money not preserved: " + mig.money);
if (!mig.taxi || !mig.pizza) throw new Error("story progress lost");
if (mig.legacy !== 3) throw new Error("best not preserved");
if (mig.tut !== 0) throw new Error("tutorial flag");
if (!mig.uid.includes(7)) throw new Error("garage car lost " + mig.uid);
if (mig.engine !== 2) throw new Error("tuning lost");
if (mig.places !== 2) throw new Error("garages " + mig.places);
if (mig.shops !== 3) throw new Error("shops");

await page.evaluate(() => window.__tb.startGame());
await page.waitForTimeout(400);
const tutorOpen = await page.locator("#tutor").isVisible();
if (!tutorOpen) throw new Error("first-run tutorial did not open");
await page.screenshot({ path: outDir + "/01-tutorial-desktop.png" });
await page.click("#tutNext");
await page.click("#tutNext");
await page.click("#tutNext");
await page.click("#tutNext");
await page.waitForTimeout(200);
const tut = await page.evaluate(() => window.__tb.save().tut);
if (tut !== 1) throw new Error("tutorial not saved");
if (await page.locator("#tutor").isVisible()) throw new Error("tutorial still open");

// GPS from Rynek toward the station
const gps = await page.evaluate(() => {
  window.__tb.teleport(-7, 10);
  window.__tb.navSet(478, 162, "Stacja kolejowa");
  return window.__tb.navState();
});
console.log("GPS", JSON.stringify(gps));
if (!gps.on || gps.n < 2) throw new Error("no road route: " + JSON.stringify(gps));
if (gps.status === "water" || gps.status === "disconnected") throw new Error("rynek-station should connect: " + gps.status + " " + gps.note);
await page.waitForTimeout(600);
await page.screenshot({ path: outDir + "/02-gps-desktop.png" });

const plansBefore = gps.plans;
await page.waitForTimeout(1500);
const idle = await page.evaluate(() => ({ plans: window.__tb.navState().plans, upd: window.__tb.updMs, fps: window.__tb.fps }));
console.log("IDLE", JSON.stringify(idle));
if (idle.plans - plansBefore > 1) throw new Error("routing too often while idle: " + (idle.plans - plansBefore));

const audit = await page.evaluate(() => window.__tb.navAudit());
const bad = audit.rows.filter((r) => r.bad);
console.log("AUDIT", audit.rows.map((r) => r.name + ":" + r.status + (r.tail ? "+tail" : "") + " n" + r.n).join(" | "));
console.log("GATE", JSON.stringify(audit.gate), "trails", audit.trails, "bridges", gps.bridges, "comps", gps.comps);
if (bad.length) throw new Error("tail crosses water/buildings: " + JSON.stringify(bad));
for (const name of ["Osiedle Serbinów", "Kościół św. Barbary (Siarkowiec)"]) {
  const row = audit.rows.find((r) => r.name === name);
  if (!row || row.status === "disconnected" || row.status === "water") throw new Error(name + " should follow roads: " + JSON.stringify(row));
}
const lake = audit.rows.find((r) => r.name === "środek jeziora" || r.name.startsWith("Jezioro Tarnobrzeskie") && !r.name.includes("plaża"));
if (lake && lake.status === "road" && lake.tail) throw new Error("lake got a road tail");

// reroute
const before = await page.evaluate(() => window.__tb.navState().sig);
await page.evaluate(() => {
  if (window.__tb.mis.dlg) window.__tb.dialogClose();
  window.__tb.teleport(800, -200);
});
await page.waitForTimeout(2200);
const after = await page.evaluate(() => {
  const p = window.__tb.player; const s = window.__tb.navState();
  return { sig: s.sig, status: s.status, plans: s.plans, paused: window.__tb.paused, x: Math.round(p.x), z: Math.round(p.z), dlg: window.__tb.mis.dlg && window.__tb.mis.dlg.id };
});
console.log("REROUTE", before, "->", JSON.stringify(after));
if (after.sig === before) throw new Error("no reroute after teleport " + JSON.stringify(after));
if (after.status === "water" || after.status === "disconnected") throw new Error("bad reroute " + JSON.stringify(after));

// missions
const missions = await page.evaluate(() => {
  const ids = window.__tb.mis.list.map((m) => m.id);
  const out = { ids };
  window.__tb.missionStart("uliczna");
  const u = window.__tb.mis.active;
  out.uliczna = u && { cps: u.cps && u.cps.length, limit: u.limit, obj: u.obj, fail: u.failFast };
  window.__tb.missionCancel();
  window.__tb.missionStart("jezioro");
  const j = window.__tb.mis.active;
  out.jezioro = j && { cps: j.cps && j.cps.length, limit: j.limit, fail: j.failFast, obj: j.obj };
  window.__tb.missionCancel();
  window.__tb.missionStart("kursy");
  const k = window.__tb.mis.active;
  out.kursy = k && { stops: k.stops && k.stops.map((s) => s.name), obj: k.obj };
  window.__tb.missionCancel();
  window.__tb.missionStart("targ");
  const t = window.__tb.mis.active;
  out.targ = t && { stops: t.stops && t.stops.map((s) => s.name) };
  window.__tb.missionCancel();
  window.__tb.missionStart("drift");
  const d = window.__tb.mis.active;
  out.drift = d && { goal: d.goal, zone: d.zone };
  window.__tb.missionCancel();
  window.__tb.missionStart("tort");
  const money0 = window.__tb.money();
  const tort = window.__tb.mis.active;
  tort.bestNow = 210; tort.t = 40;
  window.__tb.missionEnd(true);
  const money1 = window.__tb.money();
  const claimed = window.__tb.save().claimed.tort;
  const best1 = window.__tb.save().best.tort;
  window.__tb.missionStart("tort");
  const tort2 = window.__tb.mis.active;
  tort2.bestNow = 180; tort2.t = 10;
  window.__tb.missionEnd(true);
  const money2 = window.__tb.money();
  const best2 = window.__tb.save().best.tort;
  window.__tb.missionStart("tort");
  const tort3 = window.__tb.mis.active;
  tort3.bestNow = 190;
  window.__tb.missionEnd(true);
  const money3 = window.__tb.money();
  out.pay = { money0, money1, money2, money3, claimed, best1, best2, story: window.__tb.storyDone() };
  return out;
});
console.log("MISSIONS", JSON.stringify(missions, null, 2));
if (!missions.ids.includes("kursy") || missions.ids.length < 14) throw new Error("mission list");
if (!missions.uliczna || missions.uliczna.fail || missions.uliczna.cps < 3) throw new Error("uliczna " + JSON.stringify(missions.uliczna));
if (!missions.jezioro || missions.jezioro.fail || missions.jezioro.cps < 3) throw new Error("jezioro " + JSON.stringify(missions.jezioro));
if (!missions.kursy || missions.kursy.stops.length !== 3) throw new Error("kursy");
if (!missions.targ || missions.targ.stops.length !== 2) throw new Error("targ");
if (!missions.drift || missions.drift.goal !== 800) throw new Error("drift");
const pay = missions.pay;
if (pay.money1 - pay.money0 < 240) throw new Error("first tort pay too small " + JSON.stringify(pay));
if (pay.money2 - pay.money1 !== 40) throw new Error("record pay " + JSON.stringify(pay));
if (pay.money3 !== pay.money2) throw new Error("repeat pay exploit " + JSON.stringify(pay));
if (pay.story < 2) throw new Error("story count should keep taxi+pizza");
if (pay.best2 > pay.best1) throw new Error("best time should drop");

// journal + hud
await page.evaluate(() => { window.__tb.navSet(-68, 776, "Szpital Wojewódzki"); window.__tb.openJournal(); });
await page.waitForTimeout(300);
await page.screenshot({ path: outDir + "/03-journal-desktop.png" });
const jText = await page.locator("#journal").innerText();
if (!jText.includes("Kursy po mieście") && !jText.includes("Aktywna")) throw new Error("journal empty");
await page.click("#jTabs button:nth-child(2)");
await page.waitForTimeout(200);
await page.screenshot({ path: outDir + "/04-journal-available.png" });
const avail = await page.locator("#jBody").innerText();
if (!avail.includes("Tort do Dzikowa") && !avail.includes("Próba")) throw new Error("available tab: " + avail.slice(0, 200));
await page.evaluate(() => window.__tb.closeJournal());

// garage still opens
const gar = await page.evaluate(() => {
  window.__tb.garageOpen(0);
  const open = window.__tb.garage().open;
  window.__tb.garageClose();
  return open;
});
console.log("GARAGE", gar);
if (!gar) throw new Error("garage did not open");

// police balance untouched
const bal = await page.evaluate(() => ({ k: window.__tb.BAL.dmgK, thr: window.__tb.BAL.dmgThr, evade: window.__tb.BAL.evadeBase }));
if (bal.k !== 1.5 || bal.thr !== 6 || bal.evade !== 5) throw new Error("police balance changed " + JSON.stringify(bal));

await page.screenshot({ path: outDir + "/05-hud-after.png" });

// mobile
const phone = await browser.newContext({
  viewport: { width: 844, height: 390 },
  hasTouch: true,
  isMobile: true,
  deviceScaleFactor: 1,
  userAgent: "Mozilla/5.0 (Linux; Android 13; Pixel) AppleWebKit/537.36 Chrome/120.0.0.0 Mobile Safari/537.36",
});
const mp = await phone.newPage();
attach(mp, "mobile");
await boot(mp, { v: 3, money: 100, done: {}, best: {}, claimed: {}, tut: 1, garage: { cars: [{ uid: 1, model: "hatch", color: 0xf6c431, up: { engine: 0, brakes: 0, grip: 0, armor: 0, nitro: 0 } }], sel: 1, next: 2 } });
await mp.evaluate(() => window.__tb.startGame());
await mp.waitForTimeout(500);
const touch = await mp.evaluate(() => ({ touch: !document.getElementById("touch").classList.contains("hidden"), coarse: matchMedia("(pointer: coarse)").matches, max: navigator.maxTouchPoints }));
console.log("TOUCH", JSON.stringify(touch));
await mp.evaluate(() => { window.__tb.teleport(-7, 10); window.__tb.navSet(300, -575, "Zamek w Dzikowie"); });
await mp.waitForTimeout(400);
await mp.screenshot({ path: outDir + "/06-gps-mobile.png" });
const box = await mp.locator("#btnJournal").boundingBox();
if (!box || box.width < 32 || box.height < 32) throw new Error("journal button too small " + JSON.stringify(box));
await mp.tap("#btnJournal");
await mp.waitForTimeout(300);
if (!(await mp.locator("#journal").isVisible())) throw new Error("journal did not open on tap");
const tab = await mp.locator("#jTabs button").first().boundingBox();
if (!tab || tab.height < 40) throw new Error("journal tab not touch sized " + JSON.stringify(tab));
await mp.screenshot({ path: outDir + "/07-journal-mobile.png" });
await mp.tap("#jClose");
await mp.evaluate(() => window.__tb.openMap());
await mp.waitForTimeout(250);
const gpsBtn = await mp.locator("#travelList button.gps").first().boundingBox();
if (!gpsBtn || gpsBtn.height < 36) throw new Error("map GPS button small " + JSON.stringify(gpsBtn));
await mp.locator("#travelList button.gps").nth(1).tap();
await mp.waitForTimeout(300);
const mobNav = await mp.evaluate(() => window.__tb.navState());
console.log("MOBNAV", JSON.stringify(mobNav));
if (!mobNav.on || mobNav.n < 2 && mobNav.status !== "disconnected" && mobNav.status !== "water" && mobNav.status !== "road-stop") {
  throw new Error("mobile GPS did not set " + JSON.stringify(mobNav));
}
await mp.screenshot({ path: outDir + "/08-after-gps-mobile.png" });

if (errors.length) {
  console.log("ERRORS");
  for (const e of errors) console.log(e);
  const fatal = errors.filter((e) => !/WebGL|THREE.WebGLRenderer|gl_error|GPU stall/i.test(e));
  if (fatal.length) throw new Error(fatal[0]);
}
console.log("SMOKE_OK");
await browser.close();
