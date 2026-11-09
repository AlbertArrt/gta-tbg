import pw from "/tmp/pw/node_modules/playwright-core/index.js";
const { chromium } = pw;
const browser = await chromium.launch({
  executablePath: "/usr/bin/google-chrome",
  headless: true,
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist", "--disable-dev-shm-usage"],
});
const errors = [];
const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
page.on("pageerror", (e) => errors.push(e.message));
await page.addInitScript(() => {
  localStorage.setItem("tb3d-settings", JSON.stringify({ quality: "med", style: "lite", time: "day", fps: true, radioAuto: false }));
  localStorage.setItem("gtatbg_save", JSON.stringify({ v: 3, money: 321, done: { taxi: true }, best: { kursy: 90 }, claimed: { kursy: true }, tut: 1, garage: { cars: [{ uid: 4, model: "sedan", color: 0x336699, up: { engine: 1, brakes: 0, grip: 0, armor: 0, nitro: 0 } }], sel: 4, next: 5 } }));
});
await page.goto("http://127.0.0.1:8765/?bldgtest=1", { waitUntil: "domcontentloaded" });
await page.waitForFunction(() => window.__tb && window.__tb.ready, null, { timeout: 120000 });
const result = await page.evaluate(async () => {
  const sleep = (n) => new Promise((r) => { let i = 0; const s = () => { if (++i >= n) r(); else requestAnimationFrame(s); }; requestAnimationFrame(s); });
  const b = window.__tb.world.buildings.find((x) => x.kind === "house") || window.__tb.world.buildings[0];
  window.__tb.teleport(b.cx, b.cz);
  const pushed = Math.hypot(window.__tb.player.x - b.cx, window.__tb.player.z - b.cz);
  window.__tb.startGame();
  window.__tb.teleport(210, 20);
  window.__tb.missionStart("taxi");
  window.__tb.navSet(300, -575, "Zamek");
  window.__tb.camOverride = [210, 7.2, 20, 205, 6, 130];
  const countDetail = () => window.__tb.world && window.__tb.renderer && [...document.querySelectorAll("canvas")].length && window.__tb.scene.children && (window.__tb.world.detailTris || 0);
  const vis = () => {
    let n = 0;
    const root = window.__tb.world;
    return root.detailTris || 0;
  };
  await sleep(6);
  window.__tb.setQuality("low");
  await sleep(4);
  const lowCalls = window.__tb.renderer.info.render.calls;
  window.__tb.setQuality("med");
  await sleep(4);
  const med = { calls: window.__tb.renderer.info.render.calls, tris: window.__tb.renderer.info.render.triangles, detail: window.__tb.world.detailTris || 0 };
  window.__tb.toggleNight();
  await sleep(3);
  const night = window.__tb.renderer.info.render.calls;
  window.__tb.toggleNight();
  const save = window.__tb.save();
  return { pushed, med, lowCalls, night, money: save.money, claimed: !!save.claimed.kursy, v: save.v, garage: save.garage.cars[0].model, gps: window.__tb.navState().on, mission: window.__tb.mis.active && window.__tb.mis.active.id, detail: vis() };
});
console.log(JSON.stringify(result, null, 2));
if (errors.length) throw new Error(errors.join("\n"));
if (result.pushed < 0.4) throw new Error("player stayed inside a building");
if (result.money !== 321 || !result.claimed || result.v !== 3 || result.garage !== "sedan") throw new Error("save changed");
if (!result.gps || result.mission !== "taxi") throw new Error("gps or mission lost");
if (!result.detail) throw new Error("no balcony geometry");
console.log("BUILDINGS_OK");
await browser.close();
