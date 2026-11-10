// Same three street cameras, before and after. node tools/shot_streets.mjs before|after
import pw from "/tmp/pw/node_modules/playwright-core/index.js";
import fs from "fs";

const tag = process.argv[2] || "before";
const outDir = `/tmp/street-shots-${tag}`;
fs.mkdirSync(outDir, { recursive: true });
const raw = await (await fetch("http://127.0.0.1:8765/data/tarnobrzeg.json")).json();
const Q = raw.q, RT = raw.roadTypes;
const KEEP = new Set(["residential", "tertiary", "secondary", "primary", "living_street", "unclassified"]);
function heading(x, z) {
  let best = 1e12, h = 0;
  for (const r of raw.roads) {
    if (!KEEP.has(RT[r[0]])) continue;
    const pts = r[5];
    for (let i = 0; i < pts.length - 2; i += 2) {
      const x1 = pts[i] / Q, z1 = pts[i + 1] / Q, x2 = pts[i + 2] / Q, z2 = pts[i + 3] / Q;
      const dx = x2 - x1, dz = z2 - z1, L = dx * dx + dz * dz;
      let t = L > 0 ? ((x - x1) * dx + (z - z1) * dz) / L : 0;
      t = Math.max(0, Math.min(1, t));
      const px = x1 + dx * t, pz = z1 + dz * t, d = (px - x) ** 2 + (pz - z) ** 2;
      if (d < best) { best = d; h = Math.atan2(dx, dz); }
    }
  }
  return h;
}
const views = [
  { name: "rynek", x: -66.2, z: 38.3, w: 1280, h: 720 },
  { name: "serbinow", x: 1207.5, z: -135.5, w: 1280, h: 720 },
  { name: "phone", x: -66.2, z: 38.3, w: 844, h: 390 },
];
for (const v of views) v.hdg = heading(v.x, v.z);

const { chromium } = pw;
const browser = await chromium.launch({
  executablePath: "/usr/bin/google-chrome",
  headless: true,
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist", "--disable-dev-shm-usage"],
});
const errors = [];
const stats = {};
for (const v of views) {
  const page = await (await browser.newContext({ viewport: { width: v.w, height: v.h } })).newPage();
  page.on("pageerror", (e) => errors.push(String(e.message || e)));
  await page.addInitScript(() => {
    localStorage.setItem("tb3d-settings", JSON.stringify({ quality: "med", style: "lite", time: "day", fps: false, radioAuto: false }));
    localStorage.setItem("gtatbg_save", JSON.stringify({ v: 3, money: 100, done: {}, best: {}, claimed: {}, tut: 1, garage: { cars: [{ uid: 1, model: "hatch", color: 0xf6c431, up: { engine: 0, brakes: 0, grip: 0, armor: 0, nitro: 0 } }], sel: 1, next: 2 } }));
  });
  await page.goto("http://127.0.0.1:8765/?shot=" + tag + v.name + Date.now(), { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window.__tb && window.__tb.ready, null, { timeout: 180000 });
  const info = await page.evaluate(async ({ x, z, hdg }) => {
    const sleep = (n) => new Promise((r) => { let i = 0; const s = () => { if (++i >= n) r(); else requestAnimationFrame(s); }; requestAnimationFrame(s); });
    const G = window.__tb;
    G.startGame();
    await sleep(12);
    if (G.dialogOpen && G.dialogClose) G.dialogClose();
    const fx = Math.sin(hdg), fz = Math.cos(hdg);
    G.camOverride = [x - fx * 1.2, 1.65, z - fz * 1.2, x + fx * 26, 1.35, z + fz * 26];
    G.paused = true;
    const hud = document.getElementById("hud");
    if (hud) hud.classList.add("hidden");
    await sleep(6);
    return { stats: G.stats ? G.stats() : null, err: null };
  }, { x: v.x, z: v.z, hdg: v.hdg });
  const file = `${outDir}/${v.name}.png`;
  await page.screenshot({ path: file });
  stats[v.name] = info.stats;
  await page.context().close();
  console.log(tag, v.name, file);
}
await browser.close();
fs.writeFileSync(`${outDir}/stats.json`, JSON.stringify({ tag, stats, errors }, null, 2));
console.log(JSON.stringify(stats, null, 2));
if (errors.length) console.log("pageerrors", errors.slice(0, 5));
