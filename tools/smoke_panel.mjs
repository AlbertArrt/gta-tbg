import pw from "/tmp/pw/node_modules/playwright-core/index.js";
const { chromium } = pw;
import fs from "fs";
const out = "/tmp/tbg-shots";
fs.mkdirSync(out, { recursive: true });
const errors = [];
function watch(page, tag) {
  page.on("pageerror", (e) => errors.push(tag + " " + e.message));
  page.on("console", (msg) => { if (msg.type() === "error") errors.push(tag + " console " + msg.text()); });
}
async function boot(page) {
  await page.addInitScript(() => {
    localStorage.setItem("tb3d-settings", JSON.stringify({ quality: "low", style: "lite", fps: true, radioAuto: false }));
    localStorage.setItem("gtatbg_save", JSON.stringify({ v: 3, money: 128, done: {}, best: {}, claimed: {}, tut: 1, garage: { cars: [{ uid: 1, model: "hatch", color: 0xf6c431, up: { engine: 0, brakes: 0, grip: 0, armor: 0, nitro: 0 } }], sel: 1, next: 2 } }));
  });
  await page.goto("http://127.0.0.1:8765/?panel=1", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window.__tb && window.__tb.ready, null, { timeout: 120000 });
}
async function begin(page) {
  await page.evaluate(() => {
    window.__tb.startGame();
    if (window.__tb.mis.dlg) window.__tb.dialogClose();
    window.__tb.teleport(200, 400);
    window.__tb.missionStart("taxi");
    const m = window.__tb.mis.active;
    m.stage = 1; m.t = 150; m.obj = "Zawieź pasażera do Zamku w Dzikowie. Opis jest długi, żeby karta musiała się przewijać na niskim ekranie w poziomie, a nie zasłaniać całej jezdni i joysticka.";
    m.target = { x: 300, z: -575 };
    window.__tb.navSet(300, -575, "Zamek w Dzikowie", { src: "mission" });
  });
}
function overlap(a, b) {
  const w = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
  const h = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
  return w * h;
}
const browser = await chromium.launch({
  executablePath: "/usr/bin/google-chrome",
  headless: true,
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist", "--disable-dev-shm-usage"],
});

async function phoneCase(w, h, name) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  watch(page, name);
  await boot(page);
  await begin(page);
  await page.waitForTimeout(400);
  const early = await page.evaluate(() => ({
    collapsed: document.getElementById("mhud").classList.contains("collapsed"),
    paused: window.__tb.paused, id: window.__tb.mis.active && window.__tb.mis.active.id,
  }));
  if (early.collapsed) throw new Error(name + " collapsed before the intro");
  if (early.paused || early.id !== "taxi") throw new Error(name + " mission interrupted " + JSON.stringify(early));
  await page.screenshot({ path: `${out}/after-open-${name}.png` });
  const t0 = await page.evaluate(() => window.__tb.mis.active.t);
  await page.waitForTimeout(5200);
  const mid = await page.evaluate(() => {
    const el = document.getElementById("mhud");
    const tab = document.getElementById("objTab").getBoundingClientRect();
    const map = document.getElementById("minimapWrap").getBoundingClientRect();
    const joy = document.getElementById("joy").getBoundingClientRect();
    return {
      collapsed: el.classList.contains("collapsed"),
      t: window.__tb.mis.active.t,
      paused: window.__tb.paused,
      gps: window.__tb.navState().on,
      tab: { x: tab.x, y: tab.y, width: tab.width, height: tab.height },
      map: { x: map.x, y: map.y, width: map.width, height: map.height },
      joy: { x: joy.x, y: joy.y, width: joy.width, height: joy.height },
      cardW: document.getElementById("objCard").getBoundingClientRect().width,
      time: document.getElementById("objTabTime").textContent,
      dir: document.getElementById("objTabDir").textContent,
    };
  });
  console.log(name, "MID", JSON.stringify(mid));
  if (!mid.collapsed) throw new Error(name + " did not auto-collapse");
  if (!(mid.t < t0 - 0.3)) throw new Error(name + " timer stalled " + t0 + " -> " + mid.t);
  if (mid.paused) throw new Error(name + " paused");
  if (!mid.gps) throw new Error(name + " GPS stopped");
  if (mid.tab.width < 44 || mid.tab.height < 44) throw new Error(name + " tab too small");
  if (mid.tab.height > 88) throw new Error(name + " tab not compact " + mid.tab.height);
  if (!mid.time.includes("⏱")) throw new Error(name + " compact timer missing");
  if (!mid.dir) throw new Error(name + " compact direction missing");
  if (overlap(mid.tab, mid.map) > 8) throw new Error(name + " tab covers minimap");
  if (overlap(mid.tab, mid.joy) > 8) throw new Error(name + " tab covers joystick");
  await page.screenshot({ path: `${out}/after-collapsed-${name}.png` });
  await page.evaluate(() => {
    const m = window.__tb.mis.active;
    const prev = m.update;
    m.update = function (mm, dt) { const r = prev.call(this, mm, dt); mm.obj = "ETAP-NOWY bez ponownego otwarcia panelu"; return r; };
  });
  await page.waitForTimeout(500);
  const afterStage = await page.evaluate(() => ({
    collapsed: document.getElementById("mhud").classList.contains("collapsed"),
    text: document.getElementById("objText").textContent,
    t: window.__tb.mis.active.t,
  }));
  if (!afterStage.collapsed || !afterStage.text.includes("ETAP-NOWY")) throw new Error(name + " stage reopened panel " + JSON.stringify(afterStage));
  await page.tap("#objTab");
  await page.waitForTimeout(400);
  const opened = await page.evaluate(() => !document.getElementById("mhud").classList.contains("collapsed"));
  if (!opened) throw new Error(name + " tap did not reopen");
  await page.screenshot({ path: `${out}/after-reopen-${name}.png` });
  await page.waitForTimeout(2000);
  const stayed = await page.evaluate(() => !document.getElementById("mhud").classList.contains("collapsed"));
  if (!stayed) throw new Error(name + " manual open was auto-collapsed");
  await page.tap("#objTab");
  await page.waitForTimeout(350);
  const closed = await page.evaluate(() => document.getElementById("mhud").classList.contains("collapsed"));
  if (!closed) throw new Error(name + " tap did not close");
  await ctx.close();
}

await phoneCase(844, 390, "844");
await phoneCase(1024, 471, "1024");

const desk = await browser.newContext({ viewport: { width: 1280, height: 720 } });
const page = await desk.newPage();
watch(page, "desk");
await boot(page);
await begin(page);
await page.waitForTimeout(500);
const startOpen = await page.evaluate(() => !document.getElementById("mhud").classList.contains("collapsed"));
if (!startOpen) throw new Error("desktop started collapsed");
await page.screenshot({ path: `${out}/after-desktop-open.png` });
await page.keyboard.press("h");
await page.waitForTimeout(350);
const closed = await page.evaluate(() => ({
  collapsed: document.getElementById("mhud").classList.contains("collapsed"),
  paused: window.__tb.paused,
  id: window.__tb.mis.active.id,
  held: window.__tb.keys ? [...window.__tb.keys] : null,
}));
console.log("DESK", JSON.stringify(closed));
if (!closed.collapsed || closed.paused || closed.id !== "taxi") throw new Error("H did not collapse cleanly " + JSON.stringify(closed));
const held = await page.evaluate(() => {
  const s = new Set();
  return document.getElementById("mhud").classList.contains("collapsed");
});
if (!held) throw new Error("still open");
await page.keyboard.press("h");
await page.waitForTimeout(300);
if (await page.evaluate(() => document.getElementById("mhud").classList.contains("collapsed"))) throw new Error("H did not reopen");
await page.keyboard.press("j");
await page.waitForTimeout(200);
const beforeModal = await page.evaluate(() => document.getElementById("mhud").classList.contains("collapsed"));
await page.keyboard.press("h");
await page.waitForTimeout(200);
const duringModal = await page.evaluate(() => ({
  journal: !document.getElementById("journal").classList.contains("hidden"),
  collapsed: document.getElementById("mhud").classList.contains("collapsed"),
}));
if (!duringModal.journal || duringModal.collapsed !== beforeModal) throw new Error("H leaked through journal " + JSON.stringify(duringModal));
await page.keyboard.press("Escape");
await page.evaluate(() => {
  const input = document.createElement("input"); input.id = "typeTest"; document.body.appendChild(input); input.focus();
});
const beforeType = await page.evaluate(() => document.getElementById("mhud").classList.contains("collapsed"));
await page.keyboard.press("h");
await page.waitForTimeout(150);
const afterType = await page.evaluate(() => ({
  collapsed: document.getElementById("mhud").classList.contains("collapsed"),
  value: document.getElementById("typeTest").value,
}));
if (afterType.collapsed !== beforeType) throw new Error("H toggled while typing " + JSON.stringify(afterType));
console.log("TYPE", JSON.stringify(afterType));
await page.screenshot({ path: `${out}/after-desktop-key.png` });

if (errors.length) {
  console.log(errors.join("\n"));
  throw new Error(errors[0]);
}
console.log("PANEL_OK");
await browser.close();
