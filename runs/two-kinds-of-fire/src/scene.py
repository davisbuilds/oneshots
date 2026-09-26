"""The painting program for "Two Kinds of Fire".

The scene is painted the way a painter would work it: toned ground, big value
masses, the light sources, then the figure, then selective detail and a few
thick accents.  Every mark is a brush stroke emitted as an *operation*
(a dict) so the whole painting can be logged and replayed.

Geometry is expressed in normalised picture space: x in 0..1 across the
width, y in 0..1 down the height.  Brush widths are fractions of the width.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field, asdict

import numpy as np


# ----------------------------------------------------------------------------
# composition
# ----------------------------------------------------------------------------

@dataclass
class Comp:
    name: str = "A"
    aspect: float = 1.5          # width / height
    horizon: float = 0.56        # y of far shore
    pad_x: float = 0.70          # launch pad on the far shore
    rocket_alt: float = 0.30     # rocket height above horizon (fraction of H)
    lean: float = 0.025          # downrange drift of the trajectory at the top
    kayak_x: float = 0.30        # kayak centre
    kayak_y: float = 0.80
    kayak_len: float = 0.12      # fraction of width
    heading: int = -1            # -1 travelling left, +1 travelling right
    kayak_tilt: float = -0.035   # slight perspective slope of the hull
    wake_len: float = 0.34       # length of the glowing wake (fraction of W)
    wake_spread: float = 0.10    # angle of the diverging bow wave
    halo: float = 1.0            # strength of the launch glow in the sky
    stars: int = 60
    notes: str = ""


STUDIES = {
    "A": Comp(name="A", notes="diagonal: kayak low-left, launch right third, wake leads to reflection"),
    "B": Comp(name="B", horizon=0.70, pad_x=0.34, rocket_alt=0.36, lean=0.07,
              kayak_x=0.72, kayak_y=0.875, kayak_len=0.10, heading=-1, kayak_tilt=0.02,
              wake_len=0.22, notes="low horizon, immense sky; launch left, kayak small lower right"),
    "C": Comp(name="C", horizon=0.33, pad_x=0.63, rocket_alt=0.22, lean=-0.02,
              kayak_x=0.40, kayak_y=0.70, kayak_len=0.13, heading=1, kayak_tilt=-0.03,
              wake_len=0.40, notes="high horizon, the living water dominates"),
    "D": Comp(name="D", horizon=0.52, pad_x=0.58, rocket_alt=0.27, lean=0.02,
              kayak_x=0.56, kayak_y=0.79, kayak_len=0.11, heading=-1, kayak_tilt=-0.02,
              wake_len=0.30, notes="kayak sits inside the reflected path of the launch"),
    "E": Comp(name="E", horizon=0.64, pad_x=0.64, rocket_alt=0.38, lean=0.05,
              kayak_x=0.44, kayak_y=0.845, kayak_len=0.15, heading=1, kayak_tilt=-0.02,
              wake_len=0.36, notes="B/D hybrid: low horizon, kayak paddles toward the reflected path"),
    "F": Comp(name="F", horizon=0.66, pad_x=0.30, rocket_alt=0.40, lean=-0.06,
              kayak_x=0.52, kayak_y=0.86, kayak_len=0.15, heading=-1, kayak_tilt=0.02,
              wake_len=0.36, notes="mirror of E: launch left, trail arcing out of frame-left"),
    "G": Comp(name="G", horizon=0.60, pad_x=0.72, rocket_alt=0.34, lean=0.03,
              kayak_x=0.66, kayak_y=0.855, kayak_len=0.13, heading=-1, kayak_tilt=0.0,
              wake_len=0.32, notes="kayak crosses the reflected path, wake trailing right"),
}

# The chosen composition: study E, with the kayak's bow pushed into the warm
# reflected path so its wake trails back through the blue-green water.
FINAL = Comp(name="final", horizon=0.64, pad_x=0.665, rocket_alt=0.39, lean=0.045,
             kayak_x=0.585, kayak_y=0.845, kayak_len=0.165, heading=1, kayak_tilt=-0.015,
             wake_len=0.40, wake_spread=0.09, stars=40,
             notes="E refined: bow in the reflected launch light, wake in the living water")


# ----------------------------------------------------------------------------
# palette (restrained: indigo night, one warm family, one blue-green family)
# ----------------------------------------------------------------------------

def mix(a, b, t):
    a = np.asarray(a, np.float32)
    b = np.asarray(b, np.float32)
    return a + (b - a) * float(np.clip(t, 0, 1))


def ramp(stops, t):
    t = float(np.clip(t, 0, 1))
    for (t0, c0), (t1, c1) in zip(stops[:-1], stops[1:]):
        if t <= t1:
            return mix(c0, c1, (t - t0) / max(t1 - t0, 1e-6))
    return np.asarray(stops[-1][1], np.float32)


SKY_TOP = (0.024, 0.030, 0.058)
SKY_MID = (0.045, 0.056, 0.092)
SKY_LOW = (0.085, 0.098, 0.128)
UMBER = (0.36, 0.24, 0.16)
LAND = (0.030, 0.032, 0.040)
WATER_FAR = (0.080, 0.088, 0.112)
HAZE = (0.125, 0.130, 0.150)
WATER_NEAR = (0.018, 0.026, 0.038)

WARM = [(0.00, (0.10, 0.10, 0.14)),
        (0.18, (0.17, 0.145, 0.14)),
        (0.40, (0.36, 0.26, 0.20)),
        (0.65, (0.62, 0.46, 0.29)),
        (0.85, (0.86, 0.72, 0.48)),
        (1.00, (1.00, 0.95, 0.84))]

BIO = [(0.00, (0.020, 0.050, 0.060)),
       (0.25, (0.040, 0.160, 0.170)),
       (0.50, (0.090, 0.370, 0.360)),
       (0.75, (0.260, 0.700, 0.620)),
       (0.92, (0.600, 0.930, 0.820)),
       (1.00, (0.880, 1.000, 0.940))]


# ----------------------------------------------------------------------------
# the painter
# ----------------------------------------------------------------------------

class Painter:
    def __init__(self, comp: Comp, seed: int = 20260925):
        self.c = comp
        self.seed = seed
        self.rng = np.random.default_rng(seed)
        self.ops: list[dict] = []
        self.stage = "ground"
        A = comp.aspect
        self.A = A
        # key points (normalised)
        self.pad = np.array([comp.pad_x, comp.horizon])
        self.rocket = np.array([comp.pad_x + comp.lean, comp.horizon - comp.rocket_alt])

    # --- low level ----------------------------------------------------
    def s(self, pts, width, color, **kw):
        """Emit one brush stroke. pts are normalised (x, y)."""
        p = np.asarray(pts, np.float64).reshape(-1, 2)
        # store in width units so replay can scale uniformly
        q = np.column_stack([p[:, 0], p[:, 1] / self.A])
        op = dict(stage=self.stage, pts=np.round(q, 6).tolist(), width=float(width),
                  color=[float(v) for v in np.clip(color, 0, 1.2)],
                  seed=int(self.rng.integers(0, 2**31 - 1)))
        for k, v in kw.items():
            if isinstance(v, np.ndarray):
                v = v.tolist()
            if isinstance(v, (tuple, list)):
                v = [float(x) for x in v]
            op[k] = v
        self.ops.append(op)

    def r(self, a=0.0, b=1.0):
        return float(self.rng.uniform(a, b))

    def n(self, s=1.0):
        return float(self.rng.normal(0, s))

    def dist(self, x, y, p):
        return math.hypot((x - p[0]) * self.A, y - p[1])

    # --- value/colour fields -----------------------------------------
    def column_d(self, x, y):
        """Distance (in height units) from the exhaust column pad->rocket."""
        a, b = self.pad, self.rocket
        ax, ay = a[0] * self.A, a[1]
        bx, by = b[0] * self.A, b[1]
        px, py = x * self.A, y
        dx, dy = bx - ax, by - ay
        t = np.clip(((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy), 0, 1)
        return math.hypot(px - ax - t * dx, py - ay - t * dy), float(t)

    def glow(self, x, y):
        c = self.c
        d = math.hypot((x - self.rocket[0]) * self.A, (y - self.rocket[1]) / 1.35)
        dc, t = self.column_d(x, y)
        g = 0.40 * math.exp(-d / 0.022) + 0.28 * math.exp(-d / 0.10) + 0.09 * math.exp(-d / 0.32)
        g += 0.30 * math.exp(-dc / 0.025) * (0.3 + 0.7 * t)
        # the ground cloud at the pad
        dp = math.hypot((x - self.pad[0]) * self.A / 2.6, (y - self.pad[1]) * 1.4)
        g += 0.30 * math.exp(-dp / 0.05)
        return float(np.clip(g * c.halo, 0, 1.2))

    def sky(self, x, y):
        c = self.c
        t = np.clip(y / c.horizon, 0, 1)
        base = ramp([(0, SKY_TOP), (0.55, SKY_MID), (1.0, SKY_LOW)], t ** 1.3)
        # humid haze lying on the far shore, faintly lit by distant towns
        base = mix(base, HAZE, float(np.clip((t - 0.82) / 0.18, 0, 1)) ** 1.5 * 0.75)
        # faint cool light pollution band low on the horizon, away from the launch
        g = self.glow(x, y)
        warm = ramp(WARM, min(1.0, g * 0.95))
        w = np.clip(g * 1.6, 0, 1) ** 1.1
        return mix(base, warm, w)

    def water(self, x, y):
        c = self.c
        t = np.clip((y - c.horizon) / (1 - c.horizon), 0, 1)
        base = ramp([(0, WATER_FAR), (0.35, (0.040, 0.050, 0.070)), (1.0, WATER_NEAR)], t ** 0.8)
        # broad reflected glow under the launch (sky halo seen in the water)
        cx = self.pad[0] + self.c.lean * 0.3
        spread = 0.035 + 0.16 * t
        gx = math.exp(-((x - cx) * self.A / (spread * 1.8)) ** 2)
        g = gx * (0.55 * math.exp(-t / 0.35) + 0.12) * c.halo
        return mix(base, ramp(WARM, g * 0.55), np.clip(g * 1.3, 0, 0.8))

    # --- stages ------------------------------------------------------
    def paint(self):
        self.ground()
        self.block_in()
        self.atmosphere()
        self.launch()
        self.far_shore()
        self.reflection()
        self.water_surface()
        self.kayak_glow_underlayer()
        self.kayak()
        self.bioluminescence()
        self.refine()
        self.accents()
        return self.ops

    def ground(self):
        """Warm transparent umber imprimatura rubbed over the white canvas."""
        self.stage = "01 toned ground"
        for i in range(34):
            y = self.r(-0.05, 1.05)
            x = self.r(-0.2, 0.7)
            ln = self.r(0.4, 0.9)
            ang = self.n(0.25)
            pts = [(x, y), (x + ln * 0.5, y + math.sin(ang) * ln * 0.3 + self.n(0.02)),
                   (x + ln, y + math.sin(ang) * ln * 0.6)]
            col = mix(UMBER, (0.22, 0.15, 0.12), self.r()) * (0.85 + 0.3 * self.r())
            self.s(pts, self.r(0.10, 0.2), col, alpha=0.8, load=0.9, dry=0.2, smear=0.4,
                   jitter=0.08, rough=0.8, soft=0.5, deplete=1.0)
        # darker scrub where the night will be deepest
        for i in range(18):
            y = self.r(0.0, 1.0)
            if abs(y - self.c.horizon) < 0.08:
                continue
            x = self.r(-0.2, 0.8)
            pts = [(x, y), (x + 0.3, y + self.n(0.03)), (x + 0.6, y + self.n(0.04))]
            self.s(pts, self.r(0.10, 0.18), (0.13, 0.10, 0.10), alpha=0.7, load=0.8,
                   dry=0.35, smear=0.5, jitter=0.06, rough=0.9, soft=0.5)

    def block_in(self):
        """Big value masses: sky above, water below, in broad loaded strokes."""
        c = self.c
        hz = c.horizon
        self.stage = "02 sky and water masses"
        # sky: rows of broad strokes, curving around the launch glow
        for pass_i, (wmin, wmax, step, sm) in enumerate([(0.07, 0.11, 0.035, 0.25),
                                                          (0.035, 0.06, 0.022, 0.45)]):
            y = -0.02
            while y < hz + 0.01:
                x = -0.1 + self.r(0, 0.1)
                while x < 1.05:
                    ln = self.r(0.12, 0.30) if pass_i == 0 else self.r(0.07, 0.18)
                    yy = min(y + self.n(0.006), hz - 0.004)
                    ga, gb = self.glow(x, yy), self.glow(x + ln, yy)
                    if abs(ga - gb) > 0.03 or max(ga, gb) > 0.08:
                        ln *= 0.35
                    if pass_i == 0:
                        ang = self.n(0.05)
                    else:
                        # criss-cross handling in the second pass knits the sky together
                        ang = (1 if self.r() < 0.5 else -1) * self.r(0.15, 0.55) * (1 - min(1, 3 * max(0, yy - hz + 0.12)))
                        ln *= 0.6
                    pts = self.flow_path(x, yy, ln, hz, ang)
                    col = sum(self.sky(px_, py_) for px_, py_ in pts) / len(pts)
                    col = col * (1 + self.n(0.05 if pass_i == 0 else 0.06))
                    w = self.r(wmin, wmax) * (0.6 + 0.4 * min(1, (hz - yy) / 0.15 + 0.3))
                    self.s(pts, w, col, load=1.1, dry=0.05 + 0.1 * pass_i, smear=sm,
                           jitter=0.05 - 0.02 * pass_i, rough=0.5, soft=0.25 + 0.25 * pass_i,
                           deplete=1.2 + pass_i)
                    x += ln * self.r(0.55, 0.85) * (1.0 if pass_i == 0 else 0.9)
                y += step * self.r(0.8, 1.2)
        # water: flatter, longer, getting broader toward the viewer
        for pass_i in range(2):
            y = hz + 0.004
            while y < 1.03:
                t = (y - hz) / (1 - hz)
                x = -0.1 + self.r(0, 0.1)
                while x < 1.05:
                    ln = self.r(0.18, 0.45) * (1 - 0.35 * pass_i)
                    yy = y + self.n(0.002 + 0.004 * t)
                    pts = [(x, yy), (x + ln * 0.5, yy + self.n(0.002)), (x + ln, yy + self.n(0.003))]
                    col = self.water(x + ln / 2, yy) * (1 + self.n(0.06))
                    w = (0.010 + 0.06 * t ** 1.2) * self.r(0.8, 1.3) * (1 - 0.3 * pass_i)
                    self.s(pts, w, col, load=1.1, dry=0.05 + 0.1 * pass_i, smear=0.4,
                           jitter=0.05, rough=0.4, soft=0.2, deplete=1.0)
                    x += ln * self.r(0.5, 0.8)
                y += (0.004 + 0.03 * t) * self.r(0.8, 1.2)

    def flow_path(self, x, y, ln, hz, angle=0.0):
        """Stroke path (base direction `angle`) that bends tangentially around the glow."""
        pts = [(x, y)]
        n = 4
        step = ln / n
        px, py = x, y
        for i in range(n):
            g = self.glow(px, py)
            dx = (px - self.rocket[0]) * self.A
            dy = py - self.rocket[1]
            d = math.hypot(dx, dy) + 1e-6
            # tangent (clockwise) around the rocket; blend with horizontal
            tx, ty = -dy / d, dx / d
            if tx < 0:
                tx, ty = -tx, -ty
            k = np.clip(g * 0.8, 0, 0.35)
            vx = (1 - k) * math.cos(angle) + k * tx
            vy = (1 - k) * math.sin(angle) + k * ty
            vn = math.hypot(vx, vy)
            px += step * vx / vn / 1.0
            py += step * vy / vn * self.A + self.n(0.0008)
            py = min(py, hz - 0.004)
            pts.append((px, py))
        return pts

    def atmosphere(self):
        """A low, dark cloud bank lying over the far shore on the left, silhouetted
        against the horizon haze and catching a little of the launch at its tip;
        plus a few barely-there high strata."""
        c = self.c
        hz = c.horizon
        self.stage = "03 atmosphere"
        x_end = self.pad[0] - 0.12
        for i in range(60):
            t = self.r() ** 0.8                          # 0 at left edge .. 1 at the tip
            x = -0.05 + t * (x_end + 0.05) * self.r(0.4, 1.0)
            thick = 0.05 * (1 - t) ** 0.7 + 0.008
            y = hz - 0.035 - self.r(0, thick) - 0.03 * (1 - t) ** 2
            ln = self.r(0.06, 0.2)
            pts = [(x, y), (x + ln * 0.5, y + self.n(0.002)), (x + ln, y - 0.004 * self.r())]
            base = self.sky(x + ln / 2, y)
            col = mix(base, (0.045, 0.05, 0.065), 0.55) * self.r(0.9, 1.05)
            self.s(pts, self.r(0.008, 0.02), col, alpha=0.7, load=0.8, dry=0.3, smear=0.45,
                   jitter=0.04, soft=0.7, rough=0.9, deplete=0.9, taper=(0.4, 0.4), tip=(0.2, 0.2))
        # the lower edge of the bank catches the haze, the tip catches the launch
        for i in range(24):
            t = self.r(0.2, 1.0)
            x = -0.05 + t * (x_end + 0.05)
            y = hz - 0.03 - 0.02 * (1 - t) ** 2 + self.n(0.002)
            ln = self.r(0.03, 0.09)
            g = self.glow(x + ln, y)
            col = mix(self.sky(x, y + 0.01) * 1.08, ramp(WARM, min(1, g * 1.4)), min(1, g * 2.5))
            self.s([(x, y), (x + ln, y + self.n(0.001))], self.r(0.002, 0.005), col, alpha=0.6,
                   load=0.7, dry=0.45, smear=0.3, soft=0.6, taper=(0.4, 0.4), tip=(0.1, 0.1))
        for i in range(10):
            y = hz * self.r(0.3, 0.7)
            x = self.r(-0.2, 0.9)
            ln = self.r(0.25, 0.6)
            pts = [(x, y), (x + ln * 0.33, y + self.n(0.004)), (x + ln * 0.66, y + self.n(0.005)),
                   (x + ln, y + self.n(0.006))]
            mx, my = pts[2]
            g = self.glow(mx, my)
            base = self.sky(mx, my)
            col = base * self.r(0.85, 0.94) if g < 0.12 else mix(base, ramp(WARM, min(1, g * 1.2)), 0.3)
            self.s(pts, self.r(0.006, 0.014), col, alpha=0.3, load=0.7, dry=0.35, smear=0.5,
                   jitter=0.04, soft=0.9, rough=0.9, deplete=0.8, taper=(0.45, 0.45), tip=(0.05, 0.05))

    def launch(self):
        """Glow scumbled up in layers, exhaust column, ground cloud, flame."""
        c = self.c
        R, Pd = self.rocket, self.pad
        self.stage = "04 launch light"
        # halo: soft veils then drier scumbles, laid in varied, mostly upright
        # directions (following the rising light, not circling it)
        def halo_pts(rad, ln):
            th = self.r(0, 2 * math.pi)
            cx = R[0] + rad * math.cos(th) / self.A
            cy = R[1] + 0.015 + rad * math.sin(th) * 1.5
            ang = math.pi / 2 + self.n(0.55)
            dx, dy = math.cos(ang) * ln / self.A, math.sin(ang) * ln
            bow = self.n(0.15) * ln / self.A
            return [(cx - dx / 2, min(c.horizon - 0.01, cy - dy / 2)), (cx + bow, min(c.horizon - 0.01, cy)),
                    (cx + dx / 2, min(c.horizon - 0.01, cy + dy / 2))]

        for layer in range(3):
            n = [55, 40, 26][layer]
            rmax = [0.19, 0.10, 0.045][layer]
            for i in range(n):
                rad = rmax * self.r(0.0, 1.0) ** 0.9
                pts = halo_pts(rad, self.r(0.04, 0.12) * (1 - 0.3 * layer))
                col = sum(self.sky(x, y) for x, y in pts) / 3 * self.r(1.0, 1.06)
                self.s(pts, self.r(0.025, 0.05) * (1 - 0.25 * layer), col, alpha=0.35,
                       load=0.9, dry=0.08 + 0.06 * layer, smear=0.0, jitter=0.03,
                       rough=0.8, soft=0.85, deplete=0.8, taper=(0.4, 0.4), tip=(0.3, 0.3))
        for i in range(120):
            rad = 0.2 * self.r(0.05, 1.0) ** 1.1
            pts = halo_pts(rad, self.r(0.02, 0.07))
            x, y = pts[1]
            lighter = self.r() < 0.8
            col = sum(self.sky(px_, py_) for px_, py_ in pts) / 3
            col = col * (self.r(1.05, 1.16) if lighter else self.r(0.9, 0.97))
            if not lighter:
                col = mix(col, SKY_MID, 0.2)
            self.s(pts, self.r(0.006, 0.015), col, alpha=0.6, load=0.75, dry=0.5, smear=0.2,
                   jitter=0.05, rough=0.9, soft=0.5, deplete=1.4, taper=(0.3, 0.4), tip=(0.3, 0.2))
        # exhaust column: long continuous strokes from the pad up toward the rocket,
        # wide and dim at the bottom, narrowing and brightening toward the flame
        self.stage = "05 exhaust column"
        sgn = np.sign(c.lean) if c.lean else 1.0

        def col_pt(t, off=0.0):
            p = Pd + (R - Pd) * t
            return (p[0] + (0.010 * math.sin(math.pi * t) * sgn + 0.005 * math.sin(2.6 * math.pi * t + 0.7) * (1 - t)) + off / self.A,
                    p[1] + 0.012 * t)

        for k in range(26):
            t0 = self.r(0.0, 0.55)
            t1 = min(1.0, t0 + self.r(0.25, 0.5))
            off = self.n(0.003)
            ts = np.linspace(t0, t1, 6)
            pts = [col_pt(t, off * (1 - t) + self.n(0.0012)) for t in ts]
            pts = [(x, min(y, c.horizon - 0.004)) for x, y in pts]
            tm = (t0 + t1) / 2
            wid = (0.004 + 0.022 * (1 - tm) ** 1.8) * self.r(0.6, 1.3)
            lit = 0.2 + 0.64 * tm ** 2.5
            col = mix(ramp(WARM, lit * self.r(0.9, 1.05)), (0.24, 0.22, 0.25), 0.3 * (1 - tm))
            self.s(pts, wid, col, alpha=0.75, load=0.85, dry=0.35 + 0.25 * (1 - tm), smear=0.35,
                   jitter=0.06, rough=0.9, soft=0.6, deplete=1.0, taper=(0.2, 0.5), tip=(0.8, 0.5))
        # billowing edges on the lower column
        for k in range(70):
            t = self.r(0.0, 0.8) ** 1.4
            side = 1 if self.r() < 0.5 else -1
            wid = 0.004 + 0.02 * (1 - t) ** 1.5
            x, y = col_pt(t, side * wid * 0.45)
            ln = wid * self.r(0.4, 0.9)
            col = mix(ramp(WARM, 0.2 + 0.4 * t ** 2), (0.2, 0.19, 0.22), 0.3)
            self.s([(x, y + ln * 0.5), (x + side * ln * 0.25 / self.A, y), (x, y - ln * 0.5)],
                   wid * self.r(0.3, 0.6), col * self.r(0.85, 1.1), alpha=0.6, load=0.7, dry=0.45,
                   smear=0.3, jitter=0.06, rough=0.9, soft=0.7)
        # the upper trail shears in the high wind and spreads, catching the light
        for k in range(30):
            t = self.r(0.45, 0.85)
            x0, y0 = col_pt(t)
            drift = -sgn * self.r(0.01, 0.05) * (t - 0.35)
            pts = [(x0, y0), (x0 + drift * 0.5, y0 - 0.006 * self.r()), (x0 + drift, y0 - 0.012 * self.r())]
            g = 0.28 + 0.4 * t ** 2.5
            col = mix(ramp(WARM, g * self.r(0.85, 1.0)), (0.22, 0.2, 0.23), 0.3)
            self.s(pts, self.r(0.004, 0.01), col, alpha=0.45, load=0.7, dry=0.45, smear=0.4,
                   jitter=0.05, rough=0.9, soft=0.8, taper=(0.2, 0.6), tip=(0.6, 0.1))
        # the incandescent exhaust just below the flame
        for k in range(10):
            t0 = self.r(0.5, 0.88)
            pts = [col_pt(t) for t in np.linspace(t0, 1.0, 5)]
            g = 0.5 + 0.3 * (t0 - 0.5) / 0.38
            self.s(pts, self.r(0.0025, 0.0045), ramp(WARM, g * self.r(0.9, 1.05)), alpha=0.6, load=0.9,
                   dry=0.3, smear=0.15, jitter=0.04, soft=0.7, taper=(0.7, 0.1), tip=(0.1, 0.9))
        # billows at the base: the ground cloud, dark below, lit on top by the flame above
        Pd = self.pad
        billows = []
        for i in range(34):
            x = Pd[0] + self.n(0.03) / self.A * 1.8
            y = c.horizon - abs(self.n(0.006)) - 0.004
            r = self.r(0.008, 0.018) * (1.2 - min(1, abs(x - Pd[0]) * self.A / 0.12))
            billows.append((x, y, max(r, 0.004)))
        for x, y, r in billows:
            near = math.exp(-abs(x - Pd[0]) * self.A / 0.06)
            body = mix((0.16, 0.14, 0.15), ramp(WARM, 0.42), 0.4 + 0.4 * near)
            self.s([(x - r * 0.9 / self.A, y + r * 0.2), (x, y - r * 0.2), (x + r * 0.9 / self.A, y + r * 0.2)],
                   r * 1.3 / self.A, body * self.r(0.8, 1.05), alpha=0.9, load=0.9, dry=0.25, smear=0.25,
                   jitter=0.06, rough=0.9, soft=0.5)
        for x, y, r in billows:
            near = math.exp(-abs(x - Pd[0]) * self.A / 0.06)
            top = ramp(WARM, 0.36 + 0.2 * near)
            self.s([(x - r * 0.6 / self.A, y - r * 0.45), (x, y - r * 0.8), (x + r * 0.6 / self.A, y - r * 0.5)],
                   r * 0.55 / self.A, top * self.r(0.85, 1.0), alpha=0.5, load=0.7, dry=0.5, smear=0.35,
                   jitter=0.06, rough=0.9, soft=0.5)
        # the flame and the tiny rocket
        self.stage = "06 flame"
        for k in range(14):
            a = self.r(0, 2 * math.pi)
            rad = self.r(0.004, 0.014)
            x = R[0] + rad * math.cos(a) / self.A
            y = R[1] + 0.008 + rad * math.sin(a) * 1.3
            self.s([(x, y - 0.004), (x, y + 0.004)], self.r(0.004, 0.008), ramp(WARM, self.r(0.72, 0.85)),
                   alpha=0.8, load=0.9, dry=0.15, soft=0.6, jitter=0.03)
        fl = 0.034
        for k in range(10):
            t = k / 9
            col = ramp(WARM, 0.86 + 0.14 * t)
            w = (0.0065 - 0.0042 * t)
            self.s([(R[0] + self.n(0.0002), R[1] - 0.001 + 0.002 * t), (R[0], R[1] + fl * (1 - 0.55 * t))],
                   w, col, load=1.3, dry=0.0, smear=0.0, jitter=0.02, soft=0.35,
                   taper=(0.1, 0.85), tip=(0.85, 0.12), impasto=0.5 * t)
        # rocket body: a dim sliver catching a little warm light
        body = 0.017
        self.s([(R[0] - c.lean * 0.05, R[1] - 0.002), (R[0] - c.lean * 0.08, R[1] - body)],
               0.0019, (0.26, 0.22, 0.21), load=1.2, soft=0.3, taper=(0.1, 0.4), tip=(1.0, 0.5))
        self.s([(R[0] - c.lean * 0.05 + 0.0005, R[1] - 0.003), (R[0] - c.lean * 0.08 + 0.0005, R[1] - body * 0.9)],
               0.0009, (0.62, 0.52, 0.42), load=1.2, soft=0.3)

    def far_shore(self):
        """The distant barrier island: a low dark band, lost and found."""
        c = self.c
        hz = c.horizon
        self.stage = "07 far shore"
        x = -0.05
        while x < 1.05:
            ln = self.r(0.03, 0.10)
            th = 0.004 + 0.004 * self.r() + 0.004 * max(0, math.sin(x * 23 + 1.3))
            col = mix(LAND, self.sky(x, hz - 0.01), self.r(0.1, 0.35))
            # the band darkens where it silhouettes against the launch
            if abs(x - self.pad[0]) < 0.12:
                col = mix(col, (0.018, 0.018, 0.022), 0.6)
            self.s([(x, hz - th * 0.35), (x + ln / 2, hz - th * 0.35 + self.n(0.0008)), (x + ln, hz - th * 0.3)],
                   th * 1.4 / self.A * 1.0, col, load=1.1, dry=0.1, smear=0.25, jitter=0.05, soft=0.3,
                   rough=0.6, taper=(0.2, 0.2), tip=(0.6, 0.6))
            x += ln * 0.7
        # treeline nubs and the tiny service towers against the ground cloud
        for i in range(120):
            x = self.r(-0.02, 1.02)
            h = self.r(0.002, 0.009) * (1.0 if abs(x - self.pad[0]) < 0.15 else 0.6)
            col = mix(LAND, self.sky(x, hz - 0.01), 0.15 if abs(x - self.pad[0]) < 0.12 else 0.4)
            self.s([(x, hz - 0.002), (x + self.n(0.001), hz - h)], self.r(0.002, 0.005), col,
                   load=1.0, dry=0.1, smear=0.2, soft=0.4, taper=(0.1, 0.6), tip=(1.0, 0.3))
        for dx, h in [(-0.016, 0.011), (0.019, 0.008)]:
            x = self.pad[0] + dx
            self.s([(x, hz - 0.002), (x, hz - h)], 0.0009, (0.05, 0.045, 0.05), load=1.0,
                   soft=0.4, dry=0.2, taper=(0.0, 0.3), tip=(1, 0.6))
        # a handful of very dim shore lights, mostly away from the launch
        for i in range(9):
            x = self.r(0.02, 0.98)
            if abs(x - self.pad[0]) < 0.08:
                continue
            y = hz - self.r(0.0, 0.004)
            col = (0.55, 0.42, 0.28) if self.r() < 0.7 else (0.45, 0.5, 0.55)
            self.s([(x, y), (x + 0.0003, y)], 0.0011, np.asarray(col) * self.r(0.35, 0.6),
                   load=1.2, soft=0.5, taper=(0, 0))

    def reflection(self):
        """Broken warm path on the water from the launch toward the viewer."""
        c = self.c
        hz = c.horizon
        self.stage = "08 reflection"
        cx = self.pad[0] + c.lean * 0.15
        ymir = hz + c.rocket_alt              # mirror position of the flame
        n = 260
        for i in range(n):
            t = self.r() ** 1.35
            y = hz + 0.003 + t * (min(0.995, ymir + 0.07) - hz)
            tt = (y - hz) / (1 - hz)
            spread = 0.004 + 0.05 * tt ** 1.1
            x = cx + self.n(spread) / self.A * 1.2
            # brightness: base reflection near shore + flame reflection around mirror
            near = math.exp(-(y - hz) / 0.03)
            fl = math.exp(-((y - ymir) / (0.10 + 0.1 * tt)) ** 2)
            col_i = np.clip(0.30 + 0.35 * near + 0.5 * fl, 0, 0.95)
            col_i *= math.exp(-abs(x - cx) * self.A / (spread * 2.5 + 0.004)) ** 0.5
            ln = (0.006 + 0.035 * tt) * self.r(0.5, 1.4)
            col = ramp(WARM, col_i * self.r(0.75, 1.0))
            col = mix(col, self.water(x, y), 0.2)
            self.s([(x - ln / 2, y), (x + ln / 2, y + self.n(0.0006))], (0.0015 + 0.006 * tt) * self.r(0.6, 1.2),
                   col, load=self.r(0.6, 1.1), dry=self.r(0.1, 0.5), smear=0.2, jitter=0.06,
                   soft=0.4, rough=0.6, taper=(0.3, 0.4), tip=(0.4, 0.3))

    def water_surface(self):
        """Long thin ripple strokes that knit the water plane together."""
        c = self.c
        hz = c.horizon
        self.stage = "09 water surface"
        # glassy calm near the far shore: long pale streaks holding the sky's light
        for i in range(36):
            t = self.r() ** 2.2 * 0.4
            y = hz + 0.003 + t * (1.0 - hz)
            x = self.r(-0.1, 0.9)
            ln = self.r(0.15, 0.45)
            col = mix(self.sky(x + ln / 2, hz - 0.01), self.water(x + ln / 2, y), 0.35 + t)
            self.s([(x, y), (x + ln / 2, y + self.n(0.0008)), (x + ln, y + self.n(0.001))],
                   (0.0015 + 0.006 * t) * self.r(0.7, 1.3), col, alpha=0.6, load=0.8, dry=0.35,
                   smear=0.35, jitter=0.04, soft=0.6, taper=(0.4, 0.4), tip=(0.2, 0.2))
        for i in range(700):
            t = self.r() ** 1.3
            y = hz + 0.004 + t * (1.0 - hz)
            x = self.r(-0.05, 1.0)
            ln = (0.03 + 0.18 * t) * self.r(0.5, 1.4)
            base = self.water(x + ln / 2, y)
            dark = self.r() < 0.55
            col = base * (self.r(0.55, 0.85) if dark else self.r(1.15, 1.5))
            # cooler, sky-coloured lights on the ripple tops
            if not dark:
                col = mix(col, self.sky(x, c.horizon * (1 - t)), 0.3)
            self.s([(x, y), (x + ln * 0.5, y + self.n(0.0015)), (x + ln, y + self.n(0.002))],
                   (0.0012 + 0.008 * t) * self.r(0.6, 1.3), col, load=0.9, dry=0.3,
                   smear=0.45, jitter=0.05, soft=0.4, rough=0.5)

    # --- the kayak --------------------------------------------------
    def kayak_frame(self):
        c = self.c
        L = c.kayak_len
        hd = c.heading
        ang = c.kayak_tilt
        ca, sa = math.cos(ang), math.sin(ang)

        def K(u, v):
            """kayak-local coords: u along hull (-0.5 stern .. 0.5 bow, in L),
            v up (in L).  Returns normalised picture coords."""
            ux = u * L * hd
            vy = -v * L
            X = ux * ca - vy * sa
            Y = ux * sa + vy * ca
            return (c.kayak_x + X, c.kayak_y + Y * self.A)
        return K

    def wake(self):
        """Disturbed-water structures as (polyline, intensity, width) in picture space.
        Shared by the dim underpainting and the bright bioluminescent strokes."""
        c = self.c
        K = self.kayak_frame()
        L = c.kayak_len
        hd = c.heading
        rng = np.random.default_rng(self.seed + 17)
        out = []
        sx, sy = K(-0.5, 0.0)
        bx, by = K(0.5, 0.0)
        # bow wave: two arms diverging backward; near arm (lower on the picture) opens more
        for side, spread, gain in ((1, 0.13, 1.0), (-1, 0.045, 0.6)):
            pts = []
            for k in range(9):
                t = k / 8
                d = t * c.wake_len * 0.95
                x = bx - hd * d
                y = by + side * (d * spread * self.A + 0.004 * math.sin(t * 7 + side))
                pts.append((x, y))
            for k in range(8):
                seg = pts[k:k + 2]
                t = k / 8
                out.append((seg, gain * 0.95 * math.exp(-t * 2.2), 0.005 + 0.006 * t))
        # stern trail: a band of churned water, a little ragged
        for k in range(34):
            t = rng.random() ** 0.9
            d0 = t * c.wake_len
            d1 = d0 + rng.uniform(0.01, 0.035)
            yoff = rng.normal(0, 0.003 + 0.01 * t)
            out.append(([(sx - hd * d0, sy + yoff), (sx - hd * (d0 + d1) / 2, sy + yoff + rng.normal(0, 0.002)),
                         (sx - hd * d1, sy + yoff + rng.normal(0, 0.003))],
                        0.55 * math.exp(-t * 2.2) * rng.uniform(0.6, 1.0), 0.004 + 0.007 * t))
        # waterline along the hull
        out.append(([K(-0.49, 0.0), K(-0.2, -0.007), K(0.1, -0.008), K(0.49, 0.002)], 0.72, 0.0035))
        out.append(([K(0.30, -0.004), K(0.5, 0.0)], 0.8, 0.004))
        return out

    def swirl_sites(self):
        c = self.c
        K = self.kayak_frame()
        L = c.kayak_len
        hd = c.heading
        sx, sy = K(-0.5, 0.0)
        sites = []
        for j in range(1, 6):
            d = j * c.wake_len / 5.8
            side = 1 if j % 2 else -1
            x = sx - hd * (d - L * 0.45)
            y = sy + side * (0.016 + 0.005 * j) * (1.0 if side > 0 else 0.55)
            age = j / 5.8
            sites.append((x, y, 0.75 * math.exp(-age * 1.7), 0.012 * (1 + 0.5 * age) * L / 0.15))
        return sites

    def kayak_glow_underlayer(self):
        """Dim blue-green light in the water, scumbled wide before the boat and bright marks."""
        c = self.c
        self.stage = "10 living water underlayer"
        for pts, g, w in self.wake():
            for k in range(3):
                q = [(x + self.n(0.004), y + self.n(0.004)) for x, y in pts]
                col = mix(self.water(*q[0]), ramp(BIO, 0.1 + 0.3 * g), 0.7)
                self.s(q, w * self.r(1.3, 2.2), col, alpha=0.4, load=0.7, dry=0.5,
                       smear=0.3, jitter=0.05, soft=0.55, rough=0.9, taper=(0.3, 0.3), tip=(0.4, 0.4))
        for x, y, g, r in self.swirl_sites():
            for k in range(3):
                col = mix(self.water(x, y), ramp(BIO, 0.12 + 0.25 * g), 0.8)
                self.s([(x - r * 1.5 / self.A * 1.6, y + self.n(0.003)), (x + r * 1.5 / self.A * 1.6, y + self.n(0.003))],
                       r * 0.9, col, alpha=0.35, load=0.7, dry=0.5, smear=0.3, soft=0.6, rough=0.9)

    def kayak(self):
        c = self.c
        K = self.kayak_frame()
        L = c.kayak_len
        self.stage = "11 kayak and paddler"
        dark = (0.020, 0.024, 0.030)
        dark2 = (0.028, 0.032, 0.040)
        # hull: built from the waterline up, ends sweeping to points
        def top(u):
            return 0.042 + 0.012 * (abs(u) / 0.5) ** 3

        def bot(u):
            return -0.004 + 0.012 * (abs(u) / 0.5) ** 4
        us = np.linspace(-0.44, 0.44, 12)
        mid = [K(u, (top(u) + bot(u)) / 2) for u in us]
        self.s(mid, (top(0) - bot(0)) * L * 1.05, dark, load=1.4, soft=0.12, taper=(0.12, 0.12),
               tip=(0.55, 0.55), jitter=0.03)
        for end in (-1, 1):
            u0, u1 = 0.36 * end, 0.515 * end
            self.s([K(u0, (top(u0) + bot(u0)) / 2), K((u0 + u1) / 2, 0.028), K(u1, 0.046)],
                   (top(u0) - bot(u0)) * L * 0.95, dark, load=1.4, soft=0.12, taper=(0.0, 0.9),
                   tip=(1.0, 0.08), flat_end=False)
        # deck line and cockpit coaming, barely lighter
        self.s([K(-0.40, 0.045), K(0.0, 0.046), K(0.40, 0.048)], 0.006 * L, dark2,
               load=1.2, soft=0.3, taper=(0.4, 0.4), tip=(0.3, 0.3))
        self.s([K(-0.13, 0.048), K(0.02, 0.051)], 0.014 * L, (0.015, 0.017, 0.02), load=1.3, soft=0.3)
        # paddler: seated torso in a life vest, leaning a little into the stroke
        hip = K(-0.055, 0.04)
        sh = K(-0.035, 0.20)
        self.s([hip, K(-0.05, 0.12), sh], 0.078 * L, dark2, load=1.4, soft=0.15,
               taper=(0.1, 0.3), tip=(1.0, 0.8))
        self.s([K(-0.035, 0.205), K(-0.03, 0.225)], 0.03 * L, dark2, load=1.3, soft=0.2)   # neck
        hx, hy = K(-0.028, 0.255)
        self.s([(hx, hy - 0.004), (hx, hy + 0.006)], 0.042 * L, dark2, load=1.4, soft=0.2,
               taper=(0.3, 0.3), tip=(0.7, 0.7))
        # paddle: far blade high in the air behind, near blade biting the water in front
        top_b = K(-0.30, 0.34)
        low_b = K(0.19, -0.035)
        self.s([top_b, low_b], 0.009 * L, (0.034, 0.036, 0.042), load=1.3, soft=0.2, taper=(0, 0))
        self.s([K(-0.345, 0.37), K(-0.265, 0.315)], 0.030 * L, (0.036, 0.036, 0.042), load=1.3,
               soft=0.2, taper=(0.3, 0.3), tip=(0.5, 0.5))
        self.s([K(0.165, 0.0), K(0.215, -0.055)], 0.028 * L, (0.030, 0.045, 0.050), load=1.3,
               soft=0.3, taper=(0.3, 0.3), tip=(0.5, 0.5))
        # arms reaching to the shaft
        hand_hi = K(-0.155, 0.235)
        hand_lo = K(0.07, 0.10)
        self.s([sh, K(0.03, 0.16), hand_lo], 0.026 * L, dark2, load=1.3, soft=0.2)
        self.s([sh, K(-0.11, 0.20), hand_hi], 0.024 * L, dark2, load=1.3, soft=0.2)
        # warm rim light on the side facing the launch
        face = 1 if (self.rocket[0] - c.kayak_x) * c.heading > 0 else -1
        rim = ramp(WARM, 0.5)
        us_ = 0.034 * face
        self.s([K(-0.05 + us_, 0.07), K(-0.045 + us_, 0.14), K(-0.035 + us_ * 0.8, 0.195)], 0.006 * L, rim,
               alpha=0.6, load=0.7, dry=0.55, soft=0.5, taper=(0.3, 0.4), tip=(0.3, 0.3))
        self.s([K(-0.028 + us_ * 0.55, 0.24), K(-0.026 + us_ * 0.55, 0.268)], 0.006 * L, rim,
               alpha=0.7, load=0.8, dry=0.35, soft=0.4)
        # the deck edge catches the launch light: this line is what lets the hull read
        self.s([K(-0.40, 0.040), K(-0.1, 0.043), K(0.2, 0.045), K(0.47, 0.052)], 0.006 * L,
               mix(rim, dark, 0.35), alpha=0.75, load=0.8, dry=0.35, soft=0.4, taper=(0.5, 0.15),
               tip=(0.05, 0.6))
        self.s([K(0.05, 0.044), K(0.3, 0.047), K(0.48, 0.053)], 0.004 * L, rim,
               alpha=0.8, load=0.9, dry=0.3, soft=0.4, taper=(0.5, 0.2), tip=(0.1, 0.5))
        self.s([K(0.0, 0.31), K(-0.25, 0.33)], 0.004 * L, mix(rim, dark, 0.45),
               alpha=0.6, load=0.8, dry=0.5, soft=0.4)
        # cool light from the glowing water catching the underside of the hull
        self.s([K(-0.40, 0.004), K(0.0, 0.0), K(0.42, 0.006)], 0.008 * L, ramp(BIO, 0.34),
               alpha=0.8, load=0.8, dry=0.35, soft=0.5, taper=(0.3, 0.3), tip=(0.2, 0.2))

    def bioluminescence(self):
        c = self.c
        K = self.kayak_frame()
        L = c.kayak_len
        hd = c.heading
        self.stage = "12 bioluminescence"
        wk = self.wake()
        # first the light the disturbed water throws into the water around it
        for pts, g, w in wk:
            for k in range(2):
                q = [(x + self.n(0.002), y + self.n(0.002)) for x, y in pts]
                gi = min(1.0, 0.18 + 0.5 * g) * self.r(0.8, 1.0)
                self.s(q, w * self.r(1.3, 2.0), ramp(BIO, gi), alpha=0.55, load=0.8, dry=0.45,
                       smear=0.3, jitter=0.06, soft=0.6, rough=0.8, taper=(0.3, 0.3), tip=(0.3, 0.3))
        # then the structures themselves, in brighter, broken strokes
        for pts, g, w in wk:
            for k in range(4):
                q = [(x + self.n(0.0012), y + self.n(0.0012)) for x, y in pts]
                gi = min(1.0, g * 1.2) * self.r(0.65, 1.05)
                self.s(q, w * self.r(0.4, 0.9), ramp(BIO, gi), alpha=0.9, load=0.9,
                       dry=0.3 + 0.35 * (1 - g), smear=0.15, jitter=0.1, soft=0.45,
                       color2=ramp(BIO, gi * 0.55), c2frac=0.35, rough=0.7)
        for x, y, g, r in self.swirl_sites():
            self.swirl(x, y, r, g, hd)
        # sparkle: single dinoflagellate flashes scattered along the disturbed water
        for k in range(160):
            pts, g, w = wk[int(self.r(0, len(wk)))]
            t = self.r()
            i0 = min(int(t * (len(pts) - 1)), len(pts) - 2)
            f = t * (len(pts) - 1) - i0
            x = pts[i0][0] * (1 - f) + pts[i0 + 1][0] * f + self.n(w * 0.5) / self.A
            y = pts[i0][1] * (1 - f) + pts[i0 + 1][1] * f + self.n(w * 0.35)
            gi = min(1.0, g * self.r(0.8, 1.4) + 0.15)
            self.s([(x, y), (x + 0.0004, y)], self.r(0.0008, 0.0018), ramp(BIO, gi), load=1.1,
                   dry=0.15, soft=0.6, taper=(0, 0))
        # the live paddle stroke: a bright torn vortex at the blade
        bx, by = K(0.19, -0.05)
        self.swirl(bx, by, 0.016 * L / 0.15, 1.0, hd, n=8)
        for k in range(10):
            a = self.r(-0.6, 0.6) + (math.pi if self.r() < 0.5 else 0)
            ln = self.r(0.006, 0.02)
            self.s([(bx, by), (bx + ln * math.cos(a) / self.A * 1.5, by + ln * math.sin(a) * 0.4)],
                   self.r(0.0015, 0.003), ramp(BIO, self.r(0.7, 0.95)), load=1.1, dry=0.2, soft=0.4)
        # rings where drips from the raised blade hit the water
        dx, dy = K(-0.30, -0.01)
        for k in range(2):
            rr = self.r(0.003, 0.007)
            a0 = self.r(0, 6.28)
            self.s([(dx + rr * math.cos(a0 + q * 0.7) / self.A * 1.8, dy + rr * math.sin(a0 + q * 0.7) * 0.5)
                    for q in range(5)], 0.0015, ramp(BIO, 0.6), alpha=0.8, load=0.9, dry=0.3, soft=0.4)
        # a few far sparks: fish flicking through the dark water
        for k in range(8):
            x = self.r(0.05, 0.95)
            y = self.r(c.horizon + 0.10, 0.98)
            if abs(x - c.kayak_x) < 0.25 and abs(y - c.kayak_y) < 0.09:
                continue
            ln = self.r(0.008, 0.025)
            ang = self.n(0.3)
            g = self.r(0.3, 0.5) * (0.6 + 0.4 * (y - c.horizon) / (1 - c.horizon))
            self.s([(x, y), (x + ln * math.cos(ang), y + ln * math.sin(ang) * 0.3 * self.A)],
                   self.r(0.0012, 0.0025), ramp(BIO, g), alpha=0.8, load=0.8, dry=0.4, soft=0.4)

    def swirl(self, x, y, r, g, hd, n=5):
        """A paddle vortex: open crescents, never closed rings."""
        for k in range(n):
            a0 = self.r(0, 2 * math.pi)
            rr = r * self.r(0.5, 1.2)
            arc = self.r(0.8, 1.6)
            pts = []
            for q in range(6):
                a = a0 + hd * arc * q / 5
                rq = rr * (1 - 0.1 * q)
                pts.append((x + rq * math.cos(a) / self.A * 1.7, y + rq * math.sin(a) * 0.42))
            col = ramp(BIO, g * self.r(0.55, 1.0))
            self.s(pts, r * self.r(0.10, 0.22), col, alpha=0.9, load=0.9, dry=0.35, smear=0.2,
                   jitter=0.1, soft=0.4, color2=ramp(BIO, g * 0.5), c2frac=0.3, taper=(0.3, 0.7),
                   tip=(0.3, 0.1))
        for k in range(int(n * 1.5)):
            a = self.r(0, 2 * math.pi)
            rr = r * self.r(0.2, 1.5)
            px, py = x + rr * math.cos(a) / self.A * 1.7, y + rr * math.sin(a) * 0.42
            self.s([(px, py), (px + 0.0002, py)], r * self.r(0.04, 0.09), ramp(BIO, g * self.r(0.5, 1.0)),
                   load=1.0, dry=0.2, soft=0.6, taper=(0, 0))

    def refine(self):
        """Stars, lost/found passages of the horizon, darker foreground water."""
        c = self.c
        self.stage = "13 refinement"
        # stars: sparse, veiled near the glow
        for i in range(c.stars):
            x, y = self.r(0, 1), self.r(0, c.horizon * 0.8) ** 1.3
            g = self.glow(x, y)
            if g > 0.25:
                continue
            b = self.r(0.25, 0.6) * (1 - g * 3)
            col = mix(self.sky(x, y), (0.85, 0.87, 0.95), b)
            self.s([(x, y), (x + 0.0006, y)], self.r(0.0008, 0.0018), col, load=1.2, soft=0.5,
                   taper=(0, 0))
        # foreground: deepen the bottom edge so the eye stays inside
        for i in range(40):
            y = self.r(0.93, 1.03)
            x = self.r(-0.1, 0.9)
            ln = self.r(0.2, 0.4)
            if abs(y - c.kayak_y) < 0.06:
                continue
            self.s([(x, y), (x + ln / 2, y + self.n(0.003)), (x + ln, y)], self.r(0.02, 0.05),
                   (0.02, 0.028, 0.04), alpha=0.35, load=0.7, glaze=False, dry=0.3, smear=0.5, soft=0.6)

    def accents(self):
        """The rare brightest notes, laid on thick."""
        c = self.c
        R = self.rocket
        K = self.kayak_frame()
        self.stage = "14 accents"
        self.s([(R[0], R[1] + 0.001), (R[0], R[1] + 0.012)], 0.0038, (1.0, 0.97, 0.9), load=1.4,
               impasto=1.2, soft=0.35, taper=(0.1, 0.8), tip=(0.9, 0.2))
        bx2, by2 = K(0.19, -0.05)
        for k in range(4):
            x = bx2 + self.n(0.004)
            y = by2 + 0.004 + self.n(0.002)
            ln = self.r(0.003, 0.008)
            self.s([(x, y), (x + ln * 0.5, y + self.n(0.0008)), (x + ln, y + self.n(0.001))],
                   self.r(0.0012, 0.002), ramp(BIO, self.r(0.9, 1.0)), load=1.4, impasto=0.9,
                   dry=0.25, soft=0.4, taper=(0.3, 0.6), tip=(0.4, 0.1))

