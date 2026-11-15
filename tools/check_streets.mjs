// Sweep built-up streets and count sky in the wall band.
// Usage: node tools/check_streets.mjs before|after
import pw from "/tmp/pw/node_modules/playwright-core/index.js";
import fs from "fs";
import { execFileSync } from "child_process";

const tag = process.argv[2] || "before";
const outDir = `/tmp/street-sweep-${tag}`;
const shotDir = `${outDir}/frames`;
fs.mkdirSync(shotDir, { recursive: true });

const raw = await (await fetch("http://127.0.0.1:8765/data/tarnobrzeg.json")).json();
const Q = raw.q;
const RT = raw.roadTypes;
const KEEP = new Set(["residential", "tertiary", "secondary", "primary", "living_street", "unclassified"]);
const boxes = raw.buildings.map((b) => {
  const ring = b[3];
  let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
  for (let i = 0; i < ring.length; i += 2) {
    const x = ring[i] / Q, z = ring[i + 1] / Q;
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (z < z0) z0 = z; if (z > z1) z1 = z;
  }
  return [x0, z0, x1, z1];
});
function nearBuilding(x, z, r) {
  const r2 = r * r;
  for (let i = 0; i < boxes.length; i++) {
    const b = boxes[i];
    if (x < b[0] - r || x > b[2] + r || z < b[1] - r || z > b[3] + r) continue;
    const cx = x < b[0] ? b[0] : x > b[2] ? b[2] : x;
    const cz = z < b[1] ? b[1] : z > b[3] ? b[3] : z;
    if ((cx - x) ** 2 + (cz - z) ** 2 <= r2) return true;
  }
  return false;
}
const samples = [];
for (const r of raw.roads) {
  const type = RT[r[0]];
  if (!KEEP.has(type)) continue;
  const pts = r[5];
  let acc = 0;
  for (let i = 0; i < pts.length - 2; i += 2) {
    const x1 = pts[i] / Q, z1 = pts[i + 1] / Q, x2 = pts[i + 2] / Q, z2 = pts[i + 3] / Q;
    const len = Math.hypot(x2 - x1, z2 - z1);
    if (len < 1) continue;
    const dx = (x2 - x1) / len, dz = (z2 - z1) / len;
    let s = acc === 0 ? 8 : 75 - (acc % 75);
    while (s < len) {
      const x = x1 + dx * s, z = z1 + dz * s;
      if (nearBuilding(x, z, 28)) samples.push({ x, z, h: Math.atan2(dx, dz) });
      s += 75;
    }
    acc += len;
  }
}
function pickSpread(list, n, pred) {
  const pool = list.filter(pred);
  const out = [];
  const step = Math.max(1, Math.floor(pool.length / n));
  for (let i = 0; i < pool.length && out.length < n; i += step) out.push(pool[i]);
  return out;
}
const ry = (p) => Math.hypot(p.x + 7, p.z - 10) < 800;
const se = (p) => Math.hypot(p.x - 1216, p.z + 49) < 550;
const seen = new Set();
const stations = [...pickSpread(samples, 16, ry), ...pickSpread(samples, 8, se), ...pickSpread(samples, 8, (p) => !ry(p) && !se(p))].filter((p) => {
  const k = Math.round(p.x / 40) + "," + Math.round(p.z / 40);
  if (seen.has(k)) return false;
  seen.add(k);
  return true;
});
console.log(tag, "stations", stations.length, "candidates", samples.length);

const { chromium } = pw;
const browser = await chromium.launch({
  executablePath: "/usr/bin/google-chrome",
  headless: true,
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist", "--disable-dev-shm-usage"],
});
const page = await (await browser.newContext({ viewport: { width: 480, height: 270 } })).newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e.message || e)));
await page.addInitScript(() => {
  localStorage.setItem("tb3d-settings", JSON.stringify({ quality: "med", style: "lite", time: "day", fps: false, radioAuto: false }));
  localStorage.setItem("gtatbg_save", JSON.stringify({ v: 3, money: 100, done: {}, best: {}, claimed: {}, tut: 1, garage: { cars: [{ uid: 1, model: "hatch", color: 0xf6c431, up: { engine: 0, brakes: 0, grip: 0, armor: 0, nitro: 0 } }], sel: 1, next: 2 } }));
});
await page.goto("http://127.0.0.1:8765/?sweep=" + tag + Date.now(), { waitUntil: "domcontentloaded" });
await page.waitForFunction(() => window.__tb && window.__tb.ready, null, { timeout: 180000 });
await page.evaluate(async () => {
  const sleep = (n) => new Promise((r) => { let i = 0; const s = () => { if (++i >= n) r(); else requestAnimationFrame(s); }; requestAnimationFrame(s); });
  const G = window.__tb;
  G.startGame();
  await sleep(8);
  if (G.dialogOpen && G.dialogClose) G.dialogClose();
  G.paused = true;
  const hud = document.getElementById("hud");
  if (hud) hud.classList.add("hidden");
});

const rows = [];
let n = 0;
for (const p of stations) {
  for (const turn of [0, Math.PI / 6, -Math.PI / 6]) {
    const name = "s" + String(n).padStart(3, "0");
    const h = p.h + turn;
    const fx = Math.sin(h), fz = Math.cos(h);
    const c = [p.x - fx * 1.2, 1.65, p.z - fz * 1.2, p.x + fx * 26, 1.35, p.z + fz * 26];
    await page.evaluate((cam) => { window.__tb.camOverride = cam; window.__tb.paused = true; }, c);
    await page.evaluate(() => new Promise((r) => { let i = 0; const s = () => { if (++i >= 2) r(); else requestAnimationFrame(s); }; requestAnimationFrame(s); }));
    const file = `${shotDir}/${name}.png`;
    await page.screenshot({ path: file });
    rows.push({ name, x: +p.x.toFixed(1), z: +p.z.toFixed(1), turn: +turn.toFixed(3), file });
    n++;
  }
}
await browser.close();
fs.writeFileSync(`${outDir}/rows-in.json`, JSON.stringify(rows));
const summary = execFileSync("python3", ["-", outDir, tag], {
  input: `
import json, sys
from PIL import Image
out_dir, tag = sys.argv[1], sys.argv[2]
rows = json.load(open(out_dir + "/rows-in.json"))
for r in rows:
    im = Image.open(r["file"]).convert("RGB")
    w, h = im.size
    px = im.load()
    sky = tot = 0
    # Left and right wall bands, around the horizon. The centre of the frame
    # is the open end of the street and stays sky even when the walls are sealed.
    for xa, xb, ya, yb in ((0.04, 0.36, 0.18, 0.52), (0.64, 0.96, 0.18, 0.52)):
        for y in range(int(h * ya), int(h * yb)):
            for x in range(int(w * xa), int(w * xb)):
                R, G, B = px[x, y]
                tot += 1
                if B > 145 and B > R + 18 and B > G + 8:
                    sky += 1
    r["sky"] = round(100 * sky / max(1, tot), 2)
sk = sorted(r["sky"] for r in rows)
rows.sort(key=lambda r: -r["sky"])
rep = {
    "tag": tag,
    "frames": len(rows),
    "mean": round(sum(sk) / len(sk), 2),
    "median": sk[len(sk) // 2],
    "p90": sk[min(len(sk) - 1, int(len(sk) * 0.9))],
    "max": sk[-1],
    "worst": [{"name": r["name"], "sky": r["sky"], "x": r["x"], "z": r["z"], "file": r["file"]} for r in rows[:8]],
}
json.dump(rep, open(out_dir + "/report.json", "w"), indent=2)
print(json.dumps({k: rep[k] for k in ("tag", "frames", "mean", "median", "p90", "max")}))
`,
}).toString();
console.log(summary.trim());
if (errors.length) console.log("pageerrors", errors.slice(0, 3));
console.log("REPORT", `${outDir}/report.json`);
