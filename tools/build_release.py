#!/usr/bin/env python3
"""Rebuild main.js, the offline single-file build, and the GitHub Pages zip."""
import base64
import pathlib
import zipfile

ROOT = pathlib.Path(__file__).resolve().parents[1]


def build_main():
    parts = sorted((ROOT / "src").glob("0*.js"), key=lambda p: p.name)
    text = "\n".join(p.read_text(encoding="utf-8") for p in parts)
    if not text.endswith("\n"):
        text += "\n"
    (ROOT / "main.js").write_text(text, encoding="utf-8")
    print(f"main.js  {len(text)} bytes from {len(parts)} files")
    return text


def build_single(main):
    index = (ROOT / "index.html").read_text(encoding="utf-8")
    css = (ROOT / "style.css").read_text(encoding="utf-8")
    font = (ROOT / "fonts" / "fredoka-subset.woff").read_bytes()
    css = css.replace(
        'url("fonts/fredoka-subset.woff") format("woff")',
        'url("data:font/woff;base64,' + base64.b64encode(font).decode("ascii") + '") format("woff")',
    )
    three = (ROOT / "vendor" / "three.module.min.js").read_bytes()
    icon = (ROOT / "icon.svg").read_bytes()
    data = (ROOT / "data" / "tarnobrzeg.json").read_text(encoding="utf-8")
    # drop external assets; the single file carries them inline
    index = index.replace('<link rel="manifest" href="manifest.webmanifest">\n', "")
    index = index.replace('<link rel="icon" href="icon.svg" type="image/svg+xml">\n', "")
    index = index.replace('<link rel="stylesheet" href="style.css">\n', "")
    index = index.replace('<script type="importmap">{ "imports": { "three": "./vendor/three.module.js" } }</script>\n', "")
    icon_tag = '<link rel="icon" href="data:image/svg+xml;base64,' + base64.b64encode(icon).decode("ascii") + '" type="image/svg+xml">\n'
    importmap = '<script type="importmap">{"imports":{"three":"data:text/javascript;base64,' + base64.b64encode(three).decode("ascii") + '"}}</script>\n'
    inject = icon_tag + "<style>\n" + css + "</style>\n" + importmap
    index = index.replace("</head>", inject + "</head>", 1)
    module = '<script id="mapdata" type="application/json">' + data + "</script>\n<script type=\"module\">\n" + main + "</script>\n"
    index = index.replace('<script type="module" src="./main.js"></script>\n', module)
    out = ROOT / "gta-tbg-single.html"
    out.write_text(index, encoding="utf-8")
    print(f"gta-tbg-single.html  {out.stat().st_size} bytes")


def build_zip():
    names = [
        "index.html", "main.js", "style.css", "manifest.webmanifest", "icon.svg",
        "data/tarnobrzeg.json", "fonts/fredoka-subset.woff", "fonts/OFL-Fredoka.txt",
        "vendor/three.module.js",
    ]
    dest = ROOT / "gta-tbg-web.zip"
    with zipfile.ZipFile(dest, "w", compression=zipfile.ZIP_DEFLATED) as z:
        for name in names:
            z.write(ROOT / name, name)
    print(f"gta-tbg-web.zip  {dest.stat().st_size} bytes")
    print("zip root:", ", ".join(names))


if __name__ == "__main__":
    main = build_main()
    build_single(main)
    build_zip()
