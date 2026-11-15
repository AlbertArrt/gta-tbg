#!/usr/bin/env python3
"""Build Fredoka WOFF subsets (OFL 1.1) with Polish precomposed letters.

The upstream variable font ships base letters plus combining marks, but not
the precomposed Polish characters (ą, ć, ę, …). Each weight is instantiated,
those letters are drawn from the font's own base glyph and mark anchors,
then subset. Output: fonts/fredoka-400.woff, fredoka-600.woff, fredoka-700.woff.
"""
import pathlib
import urllib.request

from fontTools.pens.recordingPen import DecomposingRecordingPen
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

ROOT = pathlib.Path(__file__).resolve().parents[1]
SRC = pathlib.Path("/tmp/Fredoka-variable.ttf")
OUT_DIR = ROOT / "fonts"
URL = "https://github.com/google/fonts/raw/main/ofl/fredoka/Fredoka%5Bwdth%2Cwght%5D.ttf"

# (codepoint, glyph name, base glyph, mark glyph, mark class)
COMPOSED = [
    (0x0105, "aogonek", "a", "uni0328", 5),
    (0x0107, "cacute", "c", "acutecomb", 4),
    (0x0119, "eogonek", "e", "uni0328", 5),
    (0x0144, "nacute", "n", "acutecomb", 4),
    (0x015B, "sacute", "s", "acutecomb", 4),
    (0x017A, "zacute", "z", "acutecomb", 4),
    (0x017C, "zdotaccent", "z", "uni0307", 4),
    (0x0104, "Aogonek", "A", "uni0328", 5),
    (0x0106, "Cacute", "C", "acutecomb.case", 4),
    (0x0118, "Eogonek", "E", "uni0328", 5),
    (0x0143, "Nacute", "N", "acutecomb.case", 4),
    (0x015A, "Sacute", "S", "acutecomb.case", 4),
    (0x0179, "Zacute", "Z", "acutecomb.case", 4),
    (0x017B, "Zdotaccent", "Z", "uni0307.case", 4),
]

UNICODES = ",".join([
    "U+0000-007E",
    "U+00A0-00FF",
    "U+0104-0107",
    "U+0118-0119",
    "U+0141-0144",
    "U+015A-015B",
    "U+0179-017C",
    "U+2013-2014",
    "U+201C-201E",
    "U+2026",
    "U+2212",
])


def ensure_source():
    if SRC.exists() and SRC.stat().st_size > 10000:
        return
    print("downloading Fredoka variable")
    urllib.request.urlretrieve(URL, SRC)


def mark_lookup(font):
    gpos = font["GPOS"].table
    for lu in gpos.LookupList.Lookup:
        if lu.LookupType != 4:
            continue
        st = lu.SubTable[0]
        marks = list(st.MarkCoverage.glyphs)
        if "acutecomb" in marks and "uni0328" in marks:
            return st
    raise SystemExit("no mark-to-base lookup")


def anchor_delta(st, base, mark, cls):
    marks = list(st.MarkCoverage.glyphs)
    bases = list(st.BaseCoverage.glyphs)
    mi = marks.index(mark)
    bi = bases.index(base)
    mrec = st.MarkArray.MarkRecord[mi]
    if mrec.Class != cls:
        raise SystemExit(f"{mark} class {mrec.Class} != {cls}")
    ba = st.BaseArray.BaseRecord[bi].BaseAnchor[cls]
    ma = mrec.MarkAnchor
    if ba is None:
        raise SystemExit(f"no class {cls} anchor on {base}")
    return ba.XCoordinate - ma.XCoordinate, ba.YCoordinate - ma.YCoordinate


def add_composed(font):
    st = mark_lookup(font)
    glyf = font["glyf"]
    hmtx = font["hmtx"]
    order = list(font.getGlyphOrder())
    for cp, name, base, mark, cls in COMPOSED:
        dx, dy = anchor_delta(st, base, mark, cls)
        gs = font.getGlyphSet()
        pen = TTGlyphPen(None)
        base_rec = DecomposingRecordingPen(gs)
        gs[base].draw(base_rec)
        base_rec.replay(pen)
        mark_rec = DecomposingRecordingPen(gs)
        gs[mark].draw(mark_rec)
        mark_rec.replay(TransformPen(pen, (1, 0, 0, 1, dx, dy)))
        glyf[name] = pen.glyph()
        hmtx[name] = hmtx[base]
        order.append(name)
        for table in font["cmap"].tables:
            table.cmap[cp] = name
    font.setGlyphOrder(order)
    font["maxp"].numGlyphs = len(order)


def build_weight(weight):
    font = TTFont(SRC)
    instantiateVariableFont(font, {"wght": weight, "wdth": 100}, inplace=True, updateFontNames=True)
    add_composed(font)
    tmp = OUT_DIR / f".fredoka-{weight}.ttf"
    font.save(tmp)
    out = OUT_DIR / f"fredoka-{weight}.woff"
    # subset via pyftsubset CLI so the woff is packed the same way as before
    import subprocess
    subprocess.check_call([
        "pyftsubset", str(tmp),
        f"--unicodes={UNICODES}",
        "--layout-features=kern,liga,calt",
        "--flavor=woff",
        "--desubroutinize",
        f"--output-file={out}",
    ])
    tmp.unlink()
    check = TTFont(out)
    cmap = check.getBestCmap()
    missing = [hex(cp) for cp, *_ in COMPOSED if cp not in cmap]
    if missing:
        raise SystemExit(f"weight {weight} missing {missing}")
    print(f"fredoka-{weight}.woff  {out.stat().st_size} bytes  glyphs {len(cmap)}")


def main():
    ensure_source()
    for w in (400, 600, 700):
        build_weight(w)


if __name__ == "__main__":
    main()
