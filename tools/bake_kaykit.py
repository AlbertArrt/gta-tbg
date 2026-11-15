#!/usr/bin/env python3
"""Bake three KayKit City Builder Bits shops (CC0) into src/02b_shops.js.

Source: https://github.com/KayKit-Game-Assets/KayKit-City-Builder-Bits-1.0
Uses the withoutBase meshes and a shared atlas downscaled to 512.
Expects the glTF next to this script's download dir /tmp/kaykit.
"""
import array
import base64
import io
import json
import pathlib

from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parents[1]
SRC = pathlib.Path("/tmp/kaykit")
OUT = ROOT / "src" / "02b_shops.js"
# OSM building index -> KayKit mesh. A = clothes shop, E = Rynek kiosk, G = kebab.
MODELS = [("A", "building_A_withoutBase"), ("E", "building_E_withoutBase"), ("G", "building_G_withoutBase")]


def load(name):
    g = json.loads((SRC / f"{name}.gltf").read_text())
    blob = (SRC / f"{name}.bin").read_bytes()

    def acc(i):
        a = g["accessors"][i]
        bv = g["bufferViews"][a["bufferView"]]
        start = bv.get("byteOffset", 0) + a.get("byteOffset", 0)
        comp = {5123: "H", 5125: "I", 5126: "f"}[a["componentType"]]
        n = {"SCALAR": 1, "VEC2": 2, "VEC3": 3}[a["type"]]
        arr = array.array(comp)
        count = a["count"]
        arr.frombytes(blob[start:start + count * n * arr.itemsize])
        return [tuple(arr[k * n:(k + 1) * n]) for k in range(count)]

    prim = g["meshes"][0]["primitives"][0]
    pos = acc(prim["attributes"]["POSITION"])
    nrm = acc(prim["attributes"]["NORMAL"])
    uv = acc(prim["attributes"]["TEXCOORD_0"])
    idx = [i[0] for i in acc(prim["indices"])]
    return pos, nrm, uv, idx


def bake_mesh(name, file):
    pos, nrm, uv, idx = load(file)
    xs = [p[0] for p in pos]
    ys = [p[1] for p in pos]
    zs = [p[2] for p in pos]
    cx = (min(xs) + max(xs)) * 0.5
    cz = (min(zs) + max(zs)) * 0.5
    miny = min(ys)
    spanx = max(xs) - min(xs)
    spanz = max(zs) - min(zs)
    # centre XZ on the footprint and sit the base on y = 0
    P = [(p[0] - cx, p[1] - miny, p[2] - cz) for p in pos]
    xs = [p[0] for p in P]
    ys = [p[1] for p in P]
    zs = [p[2] for p in P]
    minx, maxx = min(xs), max(xs)
    miny, maxy = min(ys), max(ys)
    minz, maxz = min(zs), max(zs)
    span = max(maxx - minx, maxy - miny, maxz - minz, 1e-4)
    qscale = span / 65534
    qp = array.array("H")
    qn = array.array("b")
    qu = array.array("H")
    for (x, y, z), (nx, ny, nz), (u, v) in zip(P, nrm, uv):
        qp.extend((
            int(round((x - minx) / qscale)),
            int(round((y - miny) / qscale)),
            int(round((z - minz) / qscale)),
        ))
        ln = (nx * nx + ny * ny + nz * nz) ** 0.5 or 1
        qn.extend((int(round(nx / ln * 127)), int(round(ny / ln * 127)), int(round(nz / ln * 127))))
        qu.extend((int(round(min(1, max(0, u)) * 65535)), int(round(min(1, max(0, v)) * 65535))))
    qi = array.array("H", idx)
    print(f"{name} tris {len(idx)//3} span {spanx:.3f} x {spanz:.3f} h {maxy:.3f}")
    return {
        "name": name,
        "n": len(P),
        "ni": len(idx),
        "min": [round(minx, 5), round(miny, 5), round(minz, 5)],
        "qs": round(qscale, 7),
        "spanX": round(spanx, 4),
        "spanZ": round(spanz, 4),
        "p": base64.b64encode(qp.tobytes()).decode(),
        "nr": base64.b64encode(qn.tobytes()).decode(),
        "uv": base64.b64encode(qu.tobytes()).decode(),
        "ix": base64.b64encode(qi.tobytes()).decode(),
    }


def atlas_b64():
    im = Image.open(SRC / "citybits_texture.png").convert("RGB")
    im = im.resize((512, 512), Image.Resampling.BOX)
    # a light warm grade so the pack sits next to the comic palette
    px = im.load()
    w, h = im.size
    for y in range(h):
        for x in range(w):
            r, g, b = px[x, y]
            px[x, y] = (min(255, int(r * 1.05 + 6)), min(255, int(g * 1.01 + 2)), int(b * 0.90))
    buf = io.BytesIO()
    im.save(buf, format="PNG", optimize=True)
    data = buf.getvalue()
    print(f"atlas {len(data)} bytes")
    return base64.b64encode(data).decode()


def main():
    specs = [bake_mesh(n, f) for n, f in MODELS]
    atlas = atlas_b64()
    calls = []
    for s in specs:
        calls.append(
            "M({name},{n},{ni},{min0},{min1},{min2},{qs},{sx},{sz},"
            "{p},{nr},{uv},{ix});".format(
                name=json.dumps(s["name"]), n=s["n"], ni=s["ni"],
                min0=s["min"][0], min1=s["min"][1], min2=s["min"][2], qs=s["qs"],
                sx=s["spanX"], sz=s["spanZ"],
                p=json.dumps(s["p"]), nr=json.dumps(s["nr"]), uv=json.dumps(s["uv"]), ix=json.dumps(s["ix"]),
            )
        )
    body = "\n  ".join(calls)
    text = """// KayKit City Builder Bits (CC0, Kay Lousberg) — withoutBase shops, baked by tools/bake_kaykit.py.
// OSM ids: 1069 Ti Sento -> A, 1209 west Rynek -> E, 1117 Istambul kebab -> G.
const KAY_SHOP = {{ 1069: 'A', 1209: 'E', 1117: 'G' }};
const KAY = {{}};
(function () {{
  function b64(s) {{
    const bin = atob(s), n = bin.length, a = new Uint8Array(n);
    for (let i = 0; i < n; i++) a[i] = bin.charCodeAt(i);
    return a;
  }}
  function M(name, n, ni, ax, ay, az, qs, spanX, spanZ, p64, n64, u64, i64) {{
    const pb = b64(p64), nb = b64(n64), ub = b64(u64), ib = b64(i64);
    const pos = new Float32Array(n * 3), nrm = new Float32Array(n * 3), uv = new Float32Array(n * 2);
    const pv = new Uint16Array(pb.buffer, pb.byteOffset, n * 3);
    const nv = new Int8Array(nb.buffer, nb.byteOffset, n * 3);
    const uvb = new Uint16Array(ub.buffer, ub.byteOffset, n * 2);
    for (let i = 0; i < n; i++) {{
      pos[i * 3] = ax + pv[i * 3] * qs; pos[i * 3 + 1] = ay + pv[i * 3 + 1] * qs; pos[i * 3 + 2] = az + pv[i * 3 + 2] * qs;
      nrm[i * 3] = nv[i * 3] / 127; nrm[i * 3 + 1] = nv[i * 3 + 1] / 127; nrm[i * 3 + 2] = nv[i * 3 + 2] / 127;
      uv[i * 2] = uvb[i * 2] / 65535; uv[i * 2 + 1] = uvb[i * 2 + 1] / 65535;
    }}
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setIndex(new THREE.BufferAttribute(new Uint16Array(ib.buffer, ib.byteOffset, ni), 1));
    g.computeBoundingSphere();
    KAY[name] = {{ geo: g, spanX, spanZ }};
  }}
  __BODY__
}})();
let kayMat = null;
function kayMaterial() {{
  if (kayMat) return kayMat;
  const img = new Image();
  const tex = new THREE.Texture(img);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.flipY = false;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.anisotropy = 4;
  img.onload = () => {{ tex.needsUpdate = true; }};
  img.src = 'data:image/png;base64,__ATLAS__';
  kayMat = mkMat({{ map: tex, color: 0xfff1e4 }});
  return kayMat;
}}
function kayFit(b, spec) {{
  const ring = b.ring, n = ring.length / 2, area = ringArea(ring);
  let best = null, bestScore = -1;
  for (let i = 0; i < n; i++) {{
    const j = (i + 1) % n;
    const x1 = ring[i * 2], z1 = ring[i * 2 + 1], x2 = ring[j * 2], z2 = ring[j * 2 + 1];
    const len = Math.hypot(x2 - x1, z2 - z1); if (len < 0.4) continue;
    let nx = (z2 - z1) / len, nz = -(x2 - x1) / len; if (area <= 0) {{ nx = -nx; nz = -nz; }}
    const mx = (x1 + x2) * 0.5, mz = (z1 + z2) * 0.5;
    let road = 0;
    W.roadGrid.query(mx, mz, 22, (ri) => {{
      const roadR = W.roads[W.roadGrid.meta[ri]];
      if (!roadR.drivable || roadR.bridge) return;
      const s = W.roadGrid.s;
      closestOnSeg(mx, mz, s[ri * 4], s[ri * 4 + 1], s[ri * 4 + 2], s[ri * 4 + 3], tmpC);
      const dx = tmpC.x - mx, dz = tmpC.z - mz, d = Math.hypot(dx, dz) || 1;
      if (dx * nx + dz * nz < 0.35 * d) return;
      road = Math.max(road, len / (2 + d));
    }});
    const score = road > 0 ? road + len * 0.02 : len * 0.001;
    if (score > bestScore) {{ bestScore = score; best = {{ nx, nz, len }}; }}
  }}
  const nx = best.nx, nz = best.nz, tx = -nz, tz = nx;
  let minT = 1e9, maxT = -1e9, minN = 1e9, maxN = -1e9;
  for (let i = 0; i < n; i++) {{
    const x = ring[i * 2], z = ring[i * 2 + 1], t = x * tx + z * tz, nn = x * nx + z * nz;
    if (t < minT) minT = t; if (t > maxT) maxT = t; if (nn < minN) minN = nn; if (nn > maxN) maxN = nn;
  }}
  const plotW = (maxT - minT) * 0.96, plotD = (maxN - minN) * 0.96;
  const base = 4.8, mw = spec.spanX, md = spec.spanZ;
  let fit = Math.min(plotW / (mw * base), plotD / (md * base));
  if (fit < 0.95) fit = 0.95; if (fit > 1.2) fit = 1.2;
  let sx = base * fit, sz = base * fit;
  if (mw * sx > plotW || md * sz > plotD) {{
    sx = Math.min(sx, plotW / mw); sz = Math.min(sz, plotD / md);
    if (sx / sz > 1.25) sx = sz * 1.25; else if (sz / sx > 1.25) sz = sx * 1.25;
  }}
  return {{ sx, sz, sy: base * fit, yaw: Math.atan2(nx, nz) }};
}}
function placeKayShops(scene) {{
  const mat = kayMaterial();
  const hull = TOON ? hullMats().norm : null;
  for (const b of W.buildings) {{
    if (!b.kay) continue;
    const spec = KAY[b.kay]; if (!spec) continue;
    const pose = kayFit(b, spec);
    const mesh = new THREE.Mesh(spec.geo, mat);
    mesh.castShadow = true; mesh.receiveShadow = true;
    mesh.position.set(b.cx, 0.02, b.cz);
    mesh.rotation.y = pose.yaw;
    mesh.scale.set(pose.sx, pose.sy, pose.sz);
    if (hull) mesh.add(new THREE.Mesh(spec.geo, hull));
    scene.add(mesh);
    b.kayPose = pose;
  }}
}}
"""
    text = text.replace("__BODY__", body).replace("__ATLAS__", atlas)
    text = text.replace("{{", "{").replace("}}", "}")
    OUT.write_text(text, encoding="utf-8")
    print(f"wrote {OUT} {OUT.stat().st_size} bytes")


if __name__ == "__main__":
    main()
