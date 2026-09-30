#!/usr/bin/env python3
"""Assemble index.html from src/page.html and data/design.json.

    python3 src/embed.py           # write index.html
    python3 src/embed.py --check   # exit 1 if index.html is not what this would write

The page is a single file that opens directly from disk, so the design data is
inlined rather than fetched.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MARK = "/*DESIGN*/"


def assemble() -> str:
    page = (ROOT / "src" / "page.html").read_text()
    design = json.loads((ROOT / "data" / "design.json").read_text())
    if page.count(MARK) != 1:
        raise SystemExit(f"src/page.html must contain {MARK} exactly once")
    blob = json.dumps(design, separators=(",", ":")).replace("</", "<\\/")
    return page.replace(MARK, blob)


def main() -> int:
    html = assemble()
    out = ROOT / "index.html"
    if "--check" in sys.argv:
        if not out.exists() or out.read_text() != html:
            print("index.html is stale: run python3 src/embed.py", file=sys.stderr)
            return 1
        print("index.html is current")
        return 0
    out.write_text(html)
    print(f"wrote {out.relative_to(ROOT)} ({len(html) / 1024:.0f} KiB)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
