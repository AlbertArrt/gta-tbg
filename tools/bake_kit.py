#!/usr/bin/env python3
"""Bake a handful of Kenney Car Kit bodies (CC0) into src/03c_kit.js.

Reads GLB files from a local unzip of https://kenney.nl/assets/car-kit
(default /tmp/assets/kit). Wheels are dropped — the game attaches its own.
Body green/orange paint becomes a recolorable vertex tag; everything else is
snapped to the warm comic palette. Geometry is quantized (int16 positions,
int8 normals, uint8 colors).
"""
import array
import base64
import json
import pathlib
import struct

from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parents[1]
GLB_DIR = pathlib.Path("/tmp/assets/kit/Models/GLB format")
TEX = GLB_DIR / "Textures" / "colormap.png"
OUT = ROOT / "src" / "03c_kit.js"

# sedan width in the pack is ~1.5; scale every model so the sedan is ~1.9 m wide
TARGET_SEDAN_WIDTH = 1.92

MODELS = [
    ("khatch", "hatchback-sports.glb"),
    ("ksedan", "sedan.glb"),
    ("kvan", "van.glb"),
    ("kpickup", "truck-flat.glb"),
    ("ktruck", "truck.glb"),
    ("ktaxi", "taxi.glb"),
    ("kpolice", "police.glb"),
    ("kambulance", "ambulance.glb"),
]

INK = (42, 33, 28)
GLASS = (65, 103, 140)
CREAM = (244, 241, 234)
RED = (232, 80, 58)
SUN = (246, 196, 49)
BLUE = (61, 143, 224)


def load_glb(path):
    data = path.read_bytes()
    off = 12
    js = binb = None
    while off < len(data):
        ln, typ = struct.unpack_from("<II", data, off)
        off += 8
        chunk = data[off:off + ln]
        off += ln
        if typ == 0x4E4F534A:
            js = json.loads(chunk)
        elif typ == 0x004E4942:
            binb = chunk
    return js, binb


def read_acc(js, binb, index):
    a = js["accessors"][index]
    bv = js["bufferViews"][a["bufferView"]]
    start = bv.get("byteOffset", 0) + a.get("byteOffset", 0)
    comp = {5123: "H", 5126: "f"}[a["componentType"]]
    n = {"SCALAR": 1, "VEC2": 2, "VEC3": 3}[a["type"]]
    arr = array.array(comp)
    count = a["count"]
    arr.frombytes(binb[start:start + count * n * arr.itemsize])
    if arr.itemsize == 2:
        # glTF indices are little endian; array.array uses native (little on this box)
        pass
    return [tuple(arr[i * n:(i + 1) * n]) for i in range(count)]


def body_mesh(js, binb):
    mesh_i = next(n["mesh"] for n in js["nodes"] if n.get("name") == "body")
    node = next(n for n in js["nodes"] if n.get("name") == "body")
    prim = js["meshes"][mesh_i]["primitives"][0]
    pos = read_acc(js, binb, prim["attributes"]["POSITION"])
    nrm = read_acc(js, binb, prim["attributes"]["NORMAL"])
    uv = read_acc(js, binb, prim["attributes"]["TEXCOORD_0"])
    idx = [i[0] for i in read_acc(js, binb, prim["indices"])]
    t = node.get("translation") or [0, 0, 0]
    return pos, nrm, uv, idx, t


def wheel_info(js):
    wheels = []
    radius = 0.3
    for n in js["nodes"]:
        name = n.get("name") or ""
        if not name.startswith("wheel"):
            continue
        t = n.get("translation") or [0, 0, 0]
        wheels.append((t[0], t[1], t[2]))
    return wheels


def sample(pix, w, h, uv):
    u, v = uv
    x = min(w - 1, max(0, int(u * (w - 1) + 0.5)))
    y = min(h - 1, max(0, int((1 - v) * (h - 1) + 0.5)))
    return pix[x, y]


def classify(rgb):
    r, g, b = rgb
    lum = (0.3 * r + 0.59 * g + 0.11 * b) / 255
    mx = max(r, g, b)
    mn = min(r, g, b)
    sat = 0 if mx == 0 else (mx - mn) / mx
    # Kenney's default body paint is the saturated green family.
    if g > r + 28 and g > b + 8 and g > 90:
        return 1, (255, 255, 255)
    if lum < 0.16 or (r < 40 and g < 40 and b < 40):
        return 0, INK
    if sat < 0.14 and lum > 0.82:
        return 0, CREAM
    if sat < 0.22 and lum > 0.35:
        return 0, GLASS
    if r > g + 40 and r > b + 20 and r > 140:
        return 2, RED
    if r > 180 and g > 140 and b < 140:
        return 2, SUN
    if b > r + 15 and b > g:
        return 0, BLUE
    if lum > 0.75:
        return 0, CREAM
    return 0, INK


def bake_one(name, filename, scale, pix, tw, th):
    js, binb = load_glb(GLB_DIR / filename)
    pos, nrm, uv, idx, origin = body_mesh(js, binb)
    wheels = wheel_info(js)
    ox, oy, oz = origin
    P, N, C, tags = [], [], [], []
    for i, (x, y, z) in enumerate(pos):
        px, py, pz = (x + ox) * scale, (y + oy) * scale, (z + oz) * scale
        nx, ny, nz = nrm[i]
        ln = (nx * nx + ny * ny + nz * nz) ** 0.5 or 1
        tag, col = classify(sample(pix, tw, th, uv[i]))
        P.append((px, py, pz))
        N.append((nx / ln, ny / ln, nz / ln))
        C.append(col)
        tags.append(tag)
    xs = [p[0] for p in P]
    ys = [p[1] for p in P]
    zs = [p[2] for p in P]
    minx, maxx = min(xs), max(xs)
    miny, maxy = min(ys), max(ys)
    minz, maxz = min(zs), max(zs)
    # pack positions relative to min
    span = max(maxx - minx, maxy - miny, maxz - minz, 1e-4)
    qscale = span / 65534
    qp = array.array("H")
    qn = array.array("b")
    qc = array.array("B")
    for (x, y, z), (nx, ny, nz), col in zip(P, N, C):
        qp.extend((
            int(round((x - minx) / qscale)),
            int(round((y - miny) / qscale)),
            int(round((z - minz) / qscale)),
        ))
        qn.extend((int(round(nx * 127)), int(round(ny * 127)), int(round(nz * 127))))
        qc.extend(col)
    qi = array.array("H", idx)
    bits = bytearray((len(tags) + 7) // 8)
    for i, t in enumerate(tags):
        if t == 1:
            bits[i >> 3] |= 1 << (i & 7)
    accent = bytearray((len(tags) + 7) // 8)
    for i, t in enumerate(tags):
        if t == 2:
            accent[i >> 3] |= 1 << (i & 7)
    wr = 0.3 * scale
    wp = [[round(wx * scale, 3), round(wz * scale, 3)] for wx, wy, wz in wheels]
    length = maxz - minz
    width = maxx - minx
    rad = round(max(0.9, width * 0.48), 3)
    half = round(length * 0.31, 3)
    offs = [-half, 0, half] if length < 5.4 else [-half, -half * 0.38, half * 0.38, half]
    spec = {
        "name": name,
        "n": len(P),
        "ni": len(idx),
        "tris": len(idx) // 3,
        "min": [round(minx, 4), round(miny, 4), round(minz, 4)],
        "qs": round(qscale, 6),
        "wr": round(wr, 3),
        "wp": wp,
        "offs": [round(o, 3) for o in offs],
        "rad": rad,
        "len": round(length, 3),
        "wid": round(width, 3),
        "h": round(maxy, 3),
        "p": base64.b64encode(qp.tobytes()).decode(),
        "nr": base64.b64encode(qn.tobytes()).decode(),
        "c": base64.b64encode(qc.tobytes()).decode(),
        "ix": base64.b64encode(qi.tobytes()).decode(),
        "body": base64.b64encode(bits).decode(),
        "acc": base64.b64encode(accent).decode(),
    }
    print(f"{name:12} tris {spec['tris']:4}  {length:.2f} x {width:.2f} x {maxy:.2f} m  wheels {len(wp)}")
    return spec


def js_string(spec):
    # one compact record, decoded at load
    return (
        f"K({json.dumps(spec['name'])},{spec['n']},{spec['ni']},"
        f"{spec['min'][0]},{spec['min'][1]},{spec['min'][2]},{spec['qs']},"
        f"{spec['wr']},{json.dumps(spec['wp'])},{json.dumps(spec['offs'])},"
        f"{spec['rad']},{spec['len']},{spec['wid']},{spec['h']},"
        f"{json.dumps(spec['p'])},{json.dumps(spec['nr'])},{json.dumps(spec['c'])},"
        f"{json.dumps(spec['ix'])},{json.dumps(spec['body'])},{json.dumps(spec['acc'])});"
    )


def main():
    if not TEX.exists():
        raise SystemExit(f"missing {TEX} — unzip the Kenney Car Kit first")
    im = Image.open(TEX).convert("RGB")
    pix = im.load()
    # scale from the sedan so the whole kit shares one world scale
    js, binb = load_glb(GLB_DIR / "sedan.glb")
    pos, _, _, _, origin = body_mesh(js, binb)
    xs = [(p[0] + origin[0]) for p in pos]
    sedan_w = max(xs) - min(xs)
    scale = TARGET_SEDAN_WIDTH / sedan_w
    print(f"scale {scale:.4f} (sedan width {sedan_w:.3f} -> {TARGET_SEDAN_WIDTH})")
    specs = [bake_one(n, f, scale, pix, im.size[0], im.size[1]) for n, f in MODELS]
    body = "\n".join(js_string(s) for s in specs)
    text = f"""// Kenney Car Kit bodies (CC0, https://kenney.nl/assets/car-kit), baked by tools/bake_kit.py.
// Wheels are the game's own. Vertex tag 1 is paint, tag 2 is a warm accent. Do not edit by hand.
const KIT = {{}};
function kitMesh(name, color) {{
  const src = KIT[name].geo;
  const g = src.clone();
  g.userData.tags = src.userData.tags;
  recolorTag(g, 1, color);
  return g;
}}
(function () {{
  function b64(s) {{
    const bin = atob(s), n = bin.length, a = new Uint8Array(n);
    for (let i = 0; i < n; i++) a[i] = bin.charCodeAt(i);
    return a;
  }}
  function bits(bytes, n) {{
    const t = new Uint8Array(n);
    for (let i = 0; i < n; i++) if (bytes[i >> 3] & (1 << (i & 7))) t[i] = 1;
    return t;
  }}
  function K(name, n, ni, ax, ay, az, qs, wr, wp, offs, rad, len, wid, h, p64, n64, c64, i64, body64, acc64) {{
    const pb = b64(p64), nb = b64(n64), cb = b64(c64), ib = b64(i64);
    const pos = new Float32Array(n * 3), nrm = new Float32Array(n * 3), col = new Float32Array(n * 3);
    const pv = new Uint16Array(pb.buffer, pb.byteOffset, n * 3);
    const nv = new Int8Array(nb.buffer, nb.byteOffset, n * 3);
    for (let i = 0; i < n * 3; i++) {{
      const a = i % 3 === 0 ? ax : i % 3 === 1 ? ay : az;
      pos[i] = a + pv[i] * qs;
      nrm[i] = nv[i] / 127;
    }}
    for (let i = 0; i < n * 3; i++) col[i] = cb[i] / 255;
    const idx = new Uint16Array(ib.buffer, ib.byteOffset, ni);
    const tags = bits(b64(body64), n);
    const acc = bits(b64(acc64), n);
    for (let i = 0; i < n; i++) if (acc[i]) tags[i] = 2;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    g.userData.tags = tags;
    g.computeBoundingSphere();
    KIT[name] = {{ geo: g, wr, wp, offs, rad, len, wid, h }};
  }}
  {body}
}})();
function kitRoster() {{
  const q = settings.quality;
  const few = ['khatch', 'ksedan', 'kvan', 'ktaxi'];
  const mid = ['khatch', 'ksedan', 'kvan', 'kpickup', 'ktaxi', 'kpolice'];
  const all = ['khatch', 'ksedan', 'kvan', 'kpickup', 'ktruck', 'ktaxi', 'kpolice', 'kambulance'];
  if (q === 'low') return {{ models: few, n: 6, parked: 3, buses: 1 }};
  if (q === 'high') return {{ models: all, n: 18, parked: 8, buses: 2 }};
  return {{ models: mid, n: 14, parked: 6, buses: 2 }};
}}
"""
    OUT.write_text(text, encoding="utf-8")
    print(f"wrote {OUT}  {OUT.stat().st_size} bytes")


if __name__ == "__main__":
    main()
