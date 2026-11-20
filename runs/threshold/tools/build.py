#!/usr/bin/env python3
"""Package the exact local ES modules and fonts into a portable, offline HTML."""
import argparse
import base64
import json
import posixpath
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "output" / "threshold.html"


def data(mime, content):
    return f"data:{mime};base64," + base64.b64encode(content).decode("ascii")


def bundle():
    modules = {}
    for folder in ["src", "vendor"]:
        for file in sorted((ROOT / folder).glob("*.js")):
            path = file.relative_to(ROOT).as_posix()

            def specifier(match):
                target = posixpath.normpath(posixpath.join(folder, match[2]))
                if not (ROOT / target).is_file():
                    raise ValueError(f"Missing import {target} in {path}")
                return match[1] + '"atlas/' + target + '"'

            source = re.sub(r"""(\bfrom\s*)['"](\.[^'"\n]+)['"]""", specifier, file.read_text())
            modules["atlas/" + path] = data("text/javascript", source.encode())
    css = (ROOT / "style.css").read_text()
    css = re.sub(r"url\('(fonts/[^']+)'\)", lambda m: "url(" + data("font/ttf", (ROOT / m[1]).read_bytes()) + ")", css)
    html = (ROOT / "index.html").read_text().replace('<link rel="stylesheet" href="style.css">', "<style>" + css + "</style>")
    licenses = (ROOT / "vendor/THREE-LICENSE.txt").read_text() + "\n" + (ROOT / "fonts/OFL.txt").read_text()
    boot = '<script type="importmap">' + json.dumps({"imports": modules}, separators=(",", ":")) + '</script>\n<script type="module">import "atlas/src/main.js";</script>'
    return html.replace('<script type="module" src="src/main.js"></script>', "<!--\n" + licenses + "\n-->\n" + boot)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    expected = bundle()
    if args.check:
        if OUTPUT.read_text() != expected:
            raise SystemExit("Offline HTML differs from its sources")
    else:
        OUTPUT.parent.mkdir(exist_ok=True)
        OUTPUT.write_text(expected)
    print(f"Offline atlas · {OUTPUT.stat().st_size:,} bytes")
