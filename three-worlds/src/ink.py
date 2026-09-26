"""TRACE — the Lorenz trajectory as brush and ink on handmade paper.

Everything is procedural: paper tooth, fibres and sizing are synthesised noise;
the brush is a bristle model whose ink load depletes along each stroke.

    python3 src/ink.py --res 1920 1080 --out out/ink_test.png
"""
import sys, math, argparse, pathlib
import numpy as np
from numba import njit, prange
from scipy import ndimage as ndi
from PIL import Image

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import common as C
import timeline as T

PAPER_RGB = np.array([0.905, 0.862, 0.772])       # warm, unbleached (linear-ish display values)
INK_ABS = np.array([2.55, 2.62, 2.58])            # carbon ink, very slightly warm when thin


# ----------------------------------------------------------------------------- noise
def fnoise(shape, sigma, rng, aniso=(1.0, 1.0)):
    """Band-limited gaussian noise normalised to zero mean, unit std."""
    n = rng.standard_normal(shape).astype(np.float32)
    n = ndi.gaussian_filter(n, (sigma * aniso[0], sigma * aniso[1]), mode="wrap")
    n -= n.mean(); n /= n.std() + 1e-9
    return n


@njit(cache=True)
def _draw_fibres(img, xs, ys, angs, lens, curls, vals, width):
    H, W = img.shape
    for k in range(xs.size):
        x, y, a = xs[k], ys[k], angs[k]
        n = int(lens[k])
        for i in range(n):
            a += curls[k] * (0.5 - ((i * 7919 + k * 104729) % 1000) / 1000.0) * 0.6
            x += math.cos(a); y += math.sin(a)
            fade = math.sin(math.pi * i / n)
            ix, iy = int(x), int(y)
            for dy in range(-1, 2):
                for dx in range(-1, 2):
                    px, py = ix + dx, iy + dy
                    if 0 <= px < W and 0 <= py < H:
                        d2 = (px + 0.5 - x) ** 2 + (py + 0.5 - y) ** 2
                        img[py, px] += vals[k] * fade * math.exp(-d2 / (width * width))


def make_paper(W, H, seed=3):
    """Returns (rgb float32 HxWx3, height field h in ~[0,1], fibre field)."""
    rng = np.random.default_rng(seed)
    u = H / 1080.0
    grain = fnoise((H, W), 0.7 * u, rng)
    tooth = fnoise((H, W), 2.2 * u, rng)
    cloud = fnoise((H, W), 22 * u, rng, aniso=(1.0, 1.4))       # fibre clumping ("cloudiness")
    broad = fnoise((H, W), 160 * u, rng)
    fib = np.zeros((H, W), np.float32)
    nf = int(2600 * (W * H) / (1920 * 1080))
    _draw_fibres(fib, rng.uniform(0, W, nf), rng.uniform(0, H, nf), rng.uniform(0, 2 * np.pi, nf),
                 rng.uniform(25, 140, nf) * u, rng.uniform(0.02, 0.12, nf),
                 rng.choice([-1.0, 1.0], nf) * rng.uniform(0.3, 1.0, nf) / u, 0.65 * u)
    h = 0.5 + 0.16 * grain + 0.20 * tooth + 0.12 * cloud + 0.10 * np.clip(fib, -2, 2)
    h = np.clip(h, 0, 1).astype(np.float32)
    # raking light from upper-left -> subtle emboss
    gy, gx = np.gradient(ndi.gaussian_filter(h, 0.8 * u))
    shade = 1.0 + (-gx * 0.9 - gy * 0.6) * 0.16 / u
    tint = 1.0 + 0.009 * broad + 0.007 * cloud + 0.006 * tooth
    rgb = PAPER_RGB[None, None, :] * (tint * shade)[..., None]
    rgb[..., 2] -= 0.010 * np.clip(cloud, 0, None)                # warmer where fibres clump
    rgb += 0.020 * np.clip(fib, 0, 2)[..., None]                   # pale visible fibres
    # rare inclusions (bark specks)
    ns = int(60 * (W * H) / (1920 * 1080))
    spk = np.zeros((H, W), np.float32)
    iy, ix = rng.integers(0, H, ns), rng.integers(0, W, ns)
    spk[iy, ix] = rng.uniform(0.3, 1.0, ns)
    spk = ndi.gaussian_filter(spk, 0.7 * u) * (4 * u * u)
    rgb *= (1 - 0.35 * np.clip(spk, 0, 1))[..., None] * np.array([1.0, 0.97, 0.93])[None, None] ** np.clip(spk, 0, 1)[..., None]
    # gentle vignette of handling / light falloff
    yy, xx = np.mgrid[0:H, 0:W]
    r = np.sqrt(((xx - W / 2) / (W / 2)) ** 2 + ((yy - H / 2) / (H / 2)) ** 2)
    rgb *= (1 - 0.06 * np.clip(r - 0.55, 0, None) ** 2)[..., None]
    return rgb.astype(np.float32), h, fib


# ----------------------------------------------------------------------------- strokes
def plan_strokes(t, P, speed, cam, seed=11):
    rng0 = seed
    """Project the trajectory, split it into brush strokes at loop bottoms
    (local minima of z), and assign per-sample width, load and ink concentration."""
    rng = np.random.default_rng(seed)
    Q = C.to_world(P)
    uv, depth = cam.project(Q)
    u = cam.H / 1080.0
    # resample uniformly in screen space
    pts, (tt, sp, dp), s = C.resample(uv, step=0.45 * u, extra=(t, speed, depth))
    z_of = np.interp(tt, t, P[:, 2])
    mins = np.where((z_of[1:-1] < z_of[:-2]) & (z_of[1:-1] <= z_of[2:]))[0] + 1
    # strokes of 1-2 loops, occasionally 3
    cuts = [0]
    i = 0
    loop_len = np.median(np.diff(mins))
    while i < len(mins):
        step = rng.choice([1, 1, 2, 2, 2, 3])
        i += step
        if i - 1 < len(mins):
            c = int(mins[min(i - 1, len(mins) - 1)] + rng.uniform(-0.4, 0.4) * loop_len)
            if c > cuts[-1] + 0.5 * loop_len:
                cuts.append(min(c, len(pts) - 1))
    cuts = sorted(set(cuts + [len(pts) - 1]))
    # merge tiny tail
    if len(cuts) > 2 and cuts[-1] - cuts[-2] < 400:
        cuts.pop(-2)
    # clearance: distance on the page to the nearest *other* passage of the curve;
    # the painter presses boldly where there is room and lightly in the dense spiral
    from scipy.spatial import cKDTree
    tree = cKDTree(pts)
    dd, ii = tree.query(pts, k=96, distance_upper_bound=40 * u)
    far_idx = np.abs(ii - np.arange(len(pts))[:, None]) * 0.45 * u > 60 * u
    dd = np.where(far_idx & np.isfinite(dd), dd, 40 * u)
    clear = ndi.minimum_filter1d(dd.min(1), 9)
    clear = ndi.gaussian_filter1d(clear, 25)
    # dynamics -> pressure: slow passages press harder
    rk = np.argsort(np.argsort(sp)) / (len(sp) - 1)
    near = (dp.max() - dp) / (dp.max() - dp.min())        # 1 = nearest to viewer
    strokes = []
    reload_k = 0
    tone = 1.0
    for a, b in zip(cuts[:-1], cuts[1:]):
        b = min(b + int(rng.integers(0, 10)), len(pts) - 1)   # slight overlap at joins
        n = b - a
        if reload_k == 0 or rng.random() < 0.28:
            L0 = rng.uniform(0.92, 1.0); reload_k = 0
            tone = rng.choice([1.0, 1.0, 0.95, 0.72])
        else:
            L0 = max(0.45, 1.0 - 0.17 * reload_k + rng.uniform(-0.05, 0.05))
        reload_k += 1
        x = np.linspace(0, 1, n + 1)
        load = L0 * np.exp(-x * rng.uniform(0.7, 1.3))
        attack = np.clip(x * n / (18 * u / 0.45), 0, 1) ** 0.5            # brush touch-down
        release = np.clip((1 - x) * n / (60 * u / 0.45), 0, 1) ** 0.8      # lift-off taper
        pressure = (0.45 + 0.85 * (1 - rk[a:b + 1]) ** 1.6) * (0.55 + 0.6 * near[a:b + 1])
        width = u * 10.5 * pressure * (0.35 + 0.65 * attack) * (0.25 + 0.75 * release)
        # a round brush held at a slant: thicker on down-left strokes, thin on the cross
        d = np.gradient(pts[a:b + 1], axis=0)
        th = np.arctan2(d[:, 1], d[:, 0])
        width *= 0.62 + 0.62 * np.abs(np.sin(th - np.radians(35))) ** 1.5
        room = clear[a:b + 1]
        width = np.minimum(width, 0.35 * width + 0.75 * room)
        width *= 1 + 0.08 * np.sin(np.linspace(0, rng.uniform(6, 14), n + 1) + rng.uniform(0, 6))
        # the quiet unfolding spiral is laid in diluted ink; chaos arrives in black
        t_mid = tt[(a + b) // 2]
        phase = np.clip((t_mid - 12.0) / 2.5, 0, 1)
        conc = tone * (0.48 + 0.52 * phase) * (0.32 + 0.68 * near[a:b + 1] ** 1.3)                         # far = diluted ink
        strokes.append(dict(a=a, b=b, load=load.astype(np.float32), width=width.astype(np.float32),
                            conc=conc.astype(np.float32), tt=tt[a:b + 1],
                            bristle=bristles(rng)))
    return pts.astype(np.float32), tt, strokes, u


def bristles(rng, M=64):
    """Across-brush bristle density: a few clumps and gaps, smoothed."""
    b = rng.uniform(0.2, 1.0, M)
    for _ in range(rng.integers(2, 5)):
        c = rng.integers(0, M); wdt = rng.integers(2, 6)
        b[max(0, c - wdt):c + wdt] *= rng.uniform(0.1, 0.5)
    b = np.convolve(b, np.ones(3) / 3, mode="same")
    b[0] *= 0.6; b[-1] *= 0.6
    return b.astype(np.float32)


@njit(cache=True)
def _paint(D, Wt, P, i0, i1, width, load, conc, bristle, h, u, ds):
    H, W = D.shape
    M = bristle.size
    for i in range(i0, i1):
        k = i - i0
        x, y = P[i, 0], P[i, 1]
        j = min(i + 1, P.shape[0] - 1); j0 = max(i - 1, 0)
        tx, ty = P[j, 0] - P[j0, 0], P[j, 1] - P[j0, 1]
        tn = math.sqrt(tx * tx + ty * ty) + 1e-9
        tx /= tn; ty /= tn
        nx, ny = -ty, tx
        r = 0.5 * width[k]
        if r < 0.15:
            continue
        q = load[k]
        R = int(r + 2)
        cx, cy = int(x), int(y)
        for py in range(cy - R, cy + R + 1):
            if py < 0 or py >= H:
                continue
            for px in range(cx - R, cx + R + 1):
                if px < 0 or px >= W:
                    continue
                dx, dy = px + 0.5 - x, py + 0.5 - y
                v = (dx * nx + dy * ny) / r
                a = (dx * tx + dy * ty) / r
                rr = v * v + a * a
                hp = h[py, px]
                # ragged edge: the paper tooth decides where the brush edge catches
                edge = 1.0 + 0.22 * (hp - 0.5) + 0.10 * (q - 0.5)
                if rr > edge * edge:
                    continue
                bi = (v + 1.0) * 0.5 * (M - 1)
                b0 = int(max(0.0, min(M - 2.0, bi)))
                f = bi - b0
                B = bristle[b0] * (1 - f) + bristle[b0 + 1] * f
                # dry-brush gating: as the load drops only dense bristles + paper peaks take ink
                g = (B * 0.7 + (hp - 0.5) * 1.1 + q * 2.0 - 0.58) / 0.20
                if g <= 0.0:
                    continue
                if g > 1.0:
                    g = 1.0
                cov = ds / (2.0 * r)
                D[py, px] += cov * g * conc[k] * (0.55 + 0.6 * q)
                Wt[py, px] += cov * q * q * 1.2


def splat_blob(D, Wt, x, y, rad, amount, h, rng):
    """Touch-down pooling: an irregular pool of extra pigment + water."""
    H, W = D.shape
    R = int(rad * 2 + 3)
    x0, y0 = int(x) - R, int(y) - R
    ys, xs = np.mgrid[max(0, y0):min(H, y0 + 2 * R), max(0, x0):min(W, x0 + 2 * R)]
    if xs.size == 0:
        return
    ang = np.arctan2(ys - y, xs - x)
    wob = 1 + 0.18 * np.sin(3 * ang + rng.uniform(0, 6)) + 0.1 * np.sin(5 * ang + rng.uniform(0, 6))
    d = np.sqrt((xs - x) ** 2 + (ys - y) ** 2) / (rad * wob)
    m = np.clip(1 - d, 0, 1) ** 0.7 * (0.8 + 0.4 * h[ys, xs])
    D[ys, xs] += amount * m
    Wt[ys, xs] += 1.2 * m


# ----------------------------------------------------------------------------- canvas
class InkPainting:
    def __init__(self, cam, seed=5, stroke_seed=23):
        self.cam = cam
        W, H = cam.W, cam.H
        t, P, sp = C.load()
        self.paper, self.h, self.fib = make_paper(W, H, seed)
        self.P, self.tt, self.strokes, self.u = plan_strokes(t, P, sp, cam, seed=stroke_seed)
        self.D = np.zeros((H, W), np.float32)
        self.Wt = np.zeros((H, W), np.float32)
        self.rng = np.random.default_rng(seed + 1)
        self.cursor = 0          # stroke index
        self.pos = 0             # sample index within stroke
        self.ds = 0.45 * self.u
        rng = np.random.default_rng(seed + 9)
        self.cloudn = 0.5 + 0.25 * fnoise((H, W), 14 * self.u, rng)
        self.fiber_noise = 0.5 + 0.5 * np.tanh(fnoise((H, W), 1.2 * self.u, rng, aniso=(1, 2.2)))

    def paint_until(self, t_traj):
        """Advance the brush to trajectory time t_traj (monotonic)."""
        while self.cursor < len(self.strokes):
            s = self.strokes[self.cursor]
            n = s["b"] - s["a"]
            k_end = int(np.searchsorted(s["tt"], t_traj, side="right"))
            k_end = min(k_end, n + 1)
            if self.pos == 0 and k_end > 0:
                x, y = self.P[s["a"]]
                w0 = float(s["width"][min(20, n)])
                splat_blob(self.D, self.Wt, x, y, w0 * 0.72, 0.55 * s["load"][0] * float(s["conc"][0]),
                           self.h, self.rng)
            if k_end > self.pos:
                _paint(self.D, self.Wt, self.P, s["a"] + self.pos, s["a"] + k_end,
                       s["width"][self.pos:], s["load"][self.pos:], s["conc"][self.pos:],
                       s["bristle"], self.h, self.u, self.ds)
                self.pos = k_end
            if self.pos >= n + 1:
                self.cursor += 1; self.pos = 0
            else:
                break

    def develop(self, wet_fraction=0.0):
        """Water physics as a post-process: restrained feathered bleed along the
        fibres, pigment migrating to wet edges, granulation in the paper tooth."""
        u = self.u
        D, Wt = self.D, self.Wt
        wet = np.clip(Wt, 0, 1.6)
        # bleeding: water wicks a short, fibre-guided distance beyond the mark
        reach = ndi.gaussian_filter(wet, 2.2 * u)
        feather = np.clip((reach - 0.12 - 0.35 * (self.fiber_noise - 0.5)) / 0.25, 0, 1)
        halo = ndi.gaussian_filter(D, 2.4 * u) * feather * 0.6
        Db = np.maximum(D, halo)
        # edge darkening: pigment carried to the drying rim
        rim = np.clip(wet - ndi.gaussian_filter(wet, 1.6 * u), 0, None)
        Db = Db + 1.6 * rim * np.clip(Db, 0, 1.0)
        # pooling where much water accumulated (overlaps, touch-downs): darker, with tide line
        pool = np.clip(wet - 0.9, 0, None)
        Db = Db + 0.35 * pool
        # pale wash: where passages gather, diluted ink describes the sheet-like wings
        dens = ndi.gaussian_filter(np.clip(D, 0, 1), 7.0 * u)
        wash = np.clip((dens - 0.10 - 0.08 * (self.cloudn - 0.5)) / 0.22, 0, 1)
        wash = ndi.gaussian_filter(wash, 1.2 * u)
        tide = np.clip(wash - ndi.gaussian_filter(wash, 2.5 * u), 0, None)
        Db = Db + 0.13 * wash + 0.55 * tide
        # granulation: pigment settles into the valleys of the tooth where wet
        gran = 1.0 + 0.35 * (0.5 - self.h) * np.clip(wet, 0, 1)
        Db = Db * gran
        return Db

    def image(self, extra_wet=None):
        Db = self.develop()
        dens = 1.0 - np.exp(-1.25 * Db)                       # saturating optical density
        rgb = self.paper * np.exp(-dens[..., None] * INK_ABS[None, None, :])
        # carbon ink has a faint sheen where heavy: lift the deepest blacks slightly
        rgb += 0.012 * np.clip(dens - 0.85, 0, None)[..., None]
        return np.clip(rgb, 0, 1)


def draw_seal(rgb, cx, cy, size, rng, cam=None):
    """Vermilion seal; its 'carving' is the trajectory itself, tiny, in negative."""
    H, W, _ = rgb.shape
    s = int(size)
    y0, x0 = int(cy - s / 2), int(cx - s / 2)
    yy, xx = np.mgrid[0:s, 0:s].astype(np.float32)
    # slightly irregular square
    edge = np.minimum.reduce([xx, yy, s - 1 - xx, s - 1 - yy]) / s
    wob = fnoise((s, s), s * 0.02, rng) * 0.012
    body = np.clip((edge + wob - 0.0) / 0.012, 0, 1)
    border_gap = np.clip(np.abs(edge + wob - 0.085) / 0.012 - 0.6, 0, 1)
    body *= border_gap
    # carved line = the attractor projected into the seal (xz plane)
    t, P, _ = C.load()
    q = P[:, [0, 2]].copy(); q[:, 1] *= -1
    q -= q.min(0); q /= q.max(0).max()
    q = q * (s * 0.62) + s * 0.19 + np.array([(s * 0.62 - q[:, 0].max() * s * 0.62) / 2, 0])
    carve = np.zeros((s, s), np.float32)
    ix = np.clip(q[:, 0].astype(int), 0, s - 1); iy = np.clip(q[:, 1].astype(int), 0, s - 1)
    carve[iy, ix] = 1
    carve = np.clip(ndi.gaussian_filter(carve, s * 0.004) * s * 0.05, 0, 1)
    body *= 1 - carve
    # uneven stamping pressure / paper tooth
    press = np.clip(0.75 + 0.35 * fnoise((s, s), s * 0.03, rng) + 0.25 * fnoise((s, s), 0.8, rng), 0, 1)
    a = np.clip(body * press, 0, 1) * 0.92
    red = np.array([0.72, 0.16, 0.10])
    sub = rgb[y0:y0 + s, x0:x0 + s]
    sub[:] = sub * (1 - a[..., None]) + (sub * red / 0.9) * a[..., None]
    return rgb


def to_srgb8(rgb):
    return (np.clip(rgb, 0, 1) ** (1 / 1.0) * 255 + 0.5).astype(np.uint8)


def render_still(cam, out, seal=True, seed=5, stroke_seed=23):
    ip = InkPainting(cam, seed, stroke_seed)
    ip.paint_until(1e9)
    rgb = ip.image()
    if seal:
        u = cam.H / 1080.0
        rng = np.random.default_rng(21)
        rgb = draw_seal(rgb, cam.W * 0.5 + 0.30 * cam.H, cam.H * 0.84, 60 * u, rng)
    Image.fromarray(to_srgb8(rgb)).save(out)
    return ip


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--res", nargs=2, type=int, default=[1920, 1080])
    ap.add_argument("--out", default=str(C.OUT / "ink_test.png"))
    a = ap.parse_args()
    import time; t0 = time.time()
    cam = T.canonical_camera(*a.res)
    render_still(cam, a.out)
    print("ink", a.res, f"{time.time() - t0:.1f}s")


# ----------------------------------------------------------------------------- timing
def paint_schedule(ip, t0, t1, pause=0.07):
    """Film seconds -> trajectory time for the painting act.  Strokes are painted
    in temporal order; each takes time ~ (length)^0.8 with an eased hand, and the
    brush lifts for `pause` seconds between strokes.  Monotonic by construction."""
    L = np.array([(s["b"] - s["a"]) for s in ip.strokes], float) ** 0.8
    n = len(L)
    k = (t1 - t0 - pause * (n - 1)) / L.sum()
    secs, taus = [t0], [ip.strokes[0]["tt"][0]]
    cur = t0
    for i, s in enumerate(ip.strokes):
        d = L[i] * k
        x = np.linspace(0, 1, 12)[1:]
        e = 0.65 * x + 0.35 * (0.5 - 0.5 * np.cos(np.pi * x))   # eased hand
        tt = s["tt"]
        ta = max(tt[0], taus[-1])
        for xi, ei in zip(x, e):
            secs.append(cur + xi * d)
            taus.append(max(taus[-1], ta + ei * (tt[-1] - ta)))
        cur += d
        if i < n - 1:
            cur += pause
            secs.append(cur); taus.append(taus[-1])
    return np.array(secs), np.array(taus)
