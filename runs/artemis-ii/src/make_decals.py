"""Generate decal textures procedurally (no downloaded artwork).

- NASA "worm" logotype: a hand-built stroke approximation (N, A, S, A with
  uniform stroke width, no A crossbars). Not the official vector artwork.
- United States flag: drawn from the standard proportions (Executive Order
  10834): hoist 1.0, fly 1.9, 13 stripes, 50 stars.
- "esa" plate: a simplified generic lowercase wordmark set in IBM Plex Sans,
  standing in for the ESA insignia (not the official logo artwork).

Run with any Python that has Pillow: python src/make_decals.py
"""
import math
import os

from PIL import Image, ImageDraw, ImageFilter, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.normpath(os.path.join(HERE, "..", "assets", "decals"))
FONTS = os.path.normpath(os.path.join(HERE, "..", "assets", "fonts"))
WORM_RED = (228, 42, 32)  # approximates the worm red used on hardware


def _arc(cx, cy, r, a0, a1, n=24):
    return [(cx + r * math.cos(math.radians(a0 + (a1 - a0) * k / n)),
             cy + r * math.sin(math.radians(a0 + (a1 - a0) * k / n))) for k in range(n + 1)]


def _stroke(draw, pts, w, color):
    draw.line(pts, fill=color, width=int(w), joint="curve")


def _fillet(pts, rad, n=14):
    out = [pts[0]]
    for i in range(1, len(pts) - 1):
        ax, ay = pts[i - 1]; bx, by = pts[i]; cx, cy = pts[i + 1]
        d1 = (ax - bx, ay - by); d2 = (cx - bx, cy - by)
        l1 = math.hypot(*d1); l2 = math.hypot(*d2)
        d1 = (d1[0] / l1, d1[1] / l1); d2 = (d2[0] / l2, d2[1] / l2)
        ang = math.acos(max(-1, min(1, d1[0] * d2[0] + d1[1] * d2[1])))
        t = min(rad / math.tan(ang / 2), l1 * 0.48, l2 * 0.48)
        p1 = (bx + d1[0] * t, by + d1[1] * t); p2 = (bx + d2[0] * t, by + d2[1] * t)
        for k in range(n + 1):
            s = k / n
            out.append(((1 - s) ** 2 * p1[0] + 2 * (1 - s) * s * bx + s * s * p2[0],
                        (1 - s) ** 2 * p1[1] + 2 * (1 - s) * s * by + s * s * p2[1]))
    out.append(pts[-1])
    return out


def _fit_corners(ctrl, targets, rad, iters=6):
    """Shift corner control points so the filleted curve touches target lines."""
    ctrl = [list(p) for p in ctrl]
    for _ in range(iters):
        pts = _fillet([tuple(p) for p in ctrl], rad)
        for idx, (kind, y_t) in targets.items():
            cx = ctrl[idx][0]
            near = [p for p in pts if abs(p[0] - cx) < rad * 1.5]
            ext = min(p[1] for p in near) if kind == "min" else max(p[1] for p in near)
            ctrl[idx][1] += (y_t - ext)
    return _fillet([tuple(p) for p in ctrl], rad)


def _stamp(draw, pts, w):
    r = w / 2
    for i in range(len(pts) - 1):
        (x0, y0), (x1, y1) = pts[i], pts[i + 1]
        n = max(1, int(math.hypot(x1 - x0, y1 - y0) / 1.5))
        for k in range(n + 1):
            x = x0 + (x1 - x0) * k / n; y = y0 + (y1 - y0) * k / n
            draw.ellipse([x - r, y - r, x + r, y + r], fill=255)


def worm(path, H=900, color=WORM_RED, supersample=2):
    """Stroke approximation of the NASA logotype: circles stamped along
    filleted centerlines, terminals squared at cap height and baseline."""
    H *= supersample
    w = 0.205 * H
    widths = {"N": 0.84, "A": 0.92, "S": 0.78}
    gap = 0.10 * H
    letters = "NASA"
    total = sum(widths[c] * H for c in letters) + gap * (len(letters) - 1)
    m = int(0.05 * H)
    size = (int(total + 2 * m), int(H + 2 * m))
    top, bottom = m, m + H
    tc, bc = top + w / 2, bottom - w / 2
    alpha = Image.new("L", size, 0)
    x = m
    for c in letters:
        W = widths[c] * H
        left, right = x, x + W
        x0, x1 = left + w / 2, right - w / 2
        layer = Image.new("L", size, 0)
        d = ImageDraw.Draw(layer)
        if c == "N":
            ctrl = [(x0, bottom + w), (x0, tc), (x1, bc), (x1, top - w)]
            pts = _fit_corners(ctrl, {1: ("min", tc), 2: ("max", bc)}, 0.24 * H)
        elif c == "A":
            xm = (x0 + x1) / 2
            ctrl = [(x0 - 0.02 * H, bottom + w), (xm, tc), (x1 + 0.02 * H, bottom + w)]
            pts = _fit_corners(ctrl, {1: ("min", tc)}, 0.15 * H)
        else:  # S
            r = (bc - tc) / 4
            mid = tc + 2 * r
            pts = [(x1 + w, tc), (x0 + r, tc)]
            pts += _arc(x0 + r, tc + r, r, -90, -270, 24)
            pts += [(x1 - r, mid)]
            pts += _arc(x1 - r, mid + r, r, -90, 90, 24)
            pts += [(x0 - w, bc)]
        _stamp(d, pts, w)
        clip = Image.new("L", size, 0)
        ImageDraw.Draw(clip).rectangle([left, top, right, bottom], fill=255)
        from PIL import ImageChops
        alpha = ImageChops.lighter(alpha, ImageChops.multiply(layer, clip))
        x += W + gap
    img = Image.new("RGBA", size, color + (0,))
    img.putalpha(alpha)
    img = img.resize((size[0] // supersample, size[1] // supersample), Image.LANCZOS)
    img.save(path)
    return img.size


def _star(cx, cy, R):
    pts = []
    for k in range(10):
        r = R if k % 2 == 0 else R * 0.382
        a = math.radians(-90 + 36 * k)
        pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    return pts


def flag(path, hoist=1000):
    A, B = hoist, int(hoist * 1.9)
    red, white, blue = (178, 34, 52), (238, 238, 236), (60, 59, 110)
    img = Image.new("RGBA", (B, A), white + (255,))
    d = ImageDraw.Draw(img)
    s = A / 13
    for i in range(13):
        if i % 2 == 0:
            d.rectangle([0, i * s, B, (i + 1) * s], fill=red)
    C, D = A * 7 / 13, B * 0.76 / 1.9
    d.rectangle([0, 0, D, C], fill=blue)
    E = F = C / 10
    G = H = D / 12
    K = A * 0.0616
    for row in range(9):
        cols = 6 if row % 2 == 0 else 5
        for col in range(cols):
            cx = G + (2 * col + (0 if row % 2 == 0 else 1)) * H
            cy = E + row * F
            d.polygon(_star(cx, cy, K / 2), fill=white)
    img.save(path)


def esa_plate(path, W=900, H=420):
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    font = ImageFont.truetype(os.path.join(FONTS, "IBMPlexSans-Medium.ttf"), int(H * 0.72))
    bbox = d.textbbox((0, 0), "esa", font=font)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    d.text(((W - tw) / 2 - bbox[0], (H - th) / 2 - bbox[1]), "esa", font=font, fill=(0, 50, 80, 255))
    img.save(path)


if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    print("worm", worm(os.path.join(OUT, "nasa_worm.png")))
    flag(os.path.join(OUT, "us_flag.png"))
    esa_plate(os.path.join(OUT, "esa_plate.png"))
    print("decals written to", OUT)
