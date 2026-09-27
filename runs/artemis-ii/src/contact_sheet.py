"""Contact sheets of rendered frames annotated with frame number and shot id."""
import argparse
import glob
import os
import re
import sys

from PIL import Image, ImageDraw, ImageFont

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import timeline as TL  # noqa: E402

FONT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "assets", "fonts", "IBMPlexMono-Regular.ttf")


def shot_of(f):
    t = TL.sec(f)
    for s in TL.SHOTS:
        if s[3] <= t < s[4]:
            return s[0] + " " + s[1]
    return "-"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("dir")
    ap.add_argument("--out", required=True)
    ap.add_argument("--cols", type=int, default=6)
    ap.add_argument("--w", type=int, default=320)
    ap.add_argument("--frames", default=None, help="comma list or a:b")
    ap.add_argument("--per", type=int, default=36)
    a = ap.parse_args()
    files = sorted(glob.glob(os.path.join(a.dir, "*.jpg")) + glob.glob(os.path.join(a.dir, "*.png")))
    items = []
    for p in files:
        m = re.search(r"(\d+)\.(jpg|png)$", p)
        if m:
            items.append((int(m.group(1)), p))
    if a.frames:
        if ":" in a.frames:
            lo, hi = map(int, a.frames.split(":"))
            items = [it for it in items if lo <= it[0] <= hi]
        else:
            keep = set(map(int, a.frames.split(",")))
            items = [it for it in items if it[0] in keep]
    font = ImageFont.truetype(FONT, 13)
    pages = [items[i:i + a.per] for i in range(0, len(items), a.per)]
    for pi, page in enumerate(pages):
        h = a.w * 9 // 16
        rows = (len(page) + a.cols - 1) // a.cols
        sheet = Image.new("RGB", (a.cols * a.w, rows * (h + 18)), (20, 20, 20))
        d = ImageDraw.Draw(sheet)
        for i, (f, p) in enumerate(page):
            im = Image.open(p).convert("RGB").resize((a.w, h))
            x, y = (i % a.cols) * a.w, (i // a.cols) * (h + 18)
            sheet.paste(im, (x, y + 18))
            d.text((x + 4, y + 2), f"{f:04d} {TL.sec(f):5.1f}s {shot_of(f)}", fill=(230, 230, 230), font=font)
        out = a.out.replace(".jpg", f"_{pi}.jpg") if len(pages) > 1 else a.out
        sheet.save(out, quality=88)
        print(out)


if __name__ == "__main__":
    main()
