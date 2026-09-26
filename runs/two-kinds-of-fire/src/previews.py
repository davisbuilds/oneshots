"""Make the small, git-friendly previews from a full render in output/.

    python3 src/previews.py

Writes preview/hero.webp (1600 px), preview/detail-*.webp (full-resolution
crops) and preview/stages/*.webp (1000 px).  The full-size PNG, the film and
the stroke log are not committed; they are published as release assets.
"""

from __future__ import annotations

import glob
import os

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "output")
PRE = os.path.join(ROOT, "preview")

# (name, box) crops at full 3000 x 2000 resolution
DETAILS = [("detail-kayak", (1150, 1450, 2150, 1850)),
           ("detail-launch", (1800, 250, 2400, 850))]


def webp(im, path, maxw=None, q=84):
    im = im.convert("RGB")
    if maxw and im.width > maxw:
        im = im.resize((maxw, round(im.height * maxw / im.width)), Image.LANCZOS)
    im.save(path, "WEBP", quality=q, method=6)


def main():
    os.makedirs(os.path.join(PRE, "stages"), exist_ok=True)
    final = Image.open(os.path.join(OUT, "two_kinds_of_fire.png"))
    webp(final, os.path.join(PRE, "hero.webp"), 1600, q=88)
    for name, box in DETAILS:
        webp(final.crop(box), os.path.join(PRE, name + ".webp"), q=88)
    for f in sorted(glob.glob(os.path.join(OUT, "stages", "*.jpg"))):
        base = os.path.splitext(os.path.basename(f))[0]
        webp(Image.open(f), os.path.join(PRE, "stages", base + ".webp"), 1000)
    print("previews written to", PRE)


if __name__ == "__main__":
    main()
