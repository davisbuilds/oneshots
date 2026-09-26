"""Hand-built paint engine for "Two Kinds of Fire".

Only NumPy (array math) and Pillow (resampling / file I/O) are used.  Every
mark on the canvas comes from `Canvas.stroke`, which models a flat/filbert
bristle brush dragged along a path:

* each stroke is a smoothed centre-line with a pressure/taper profile;
* the brush is a row of bristles, each with its own paint load, run-out
  length and slight colour offset, which gives streaks and broken colour;
* paint meets a woven canvas "tooth": thin, dry paint only catches the weave
  peaks (scumble / dry brush), loaded paint covers solidly;
* the brush drags wet paint already on the canvas along with it (smear);
* thick strokes deposit height (impasto) that is lit at the very end.

Colours are working-space sRGB floats in 0..1.
"""

from __future__ import annotations

import numpy as np
from PIL import Image


# ----------------------------------------------------------------------------
# small numeric helpers
# ----------------------------------------------------------------------------

def smoothstep(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0.0, 1.0)
    return t * t * (3.0 - 2.0 * t)


def box_blur(a: np.ndarray, r: int, axis: int) -> np.ndarray:
    if r <= 0:
        return a
    pad = [(0, 0)] * a.ndim
    pad[axis] = (r + 1, r)
    p = np.pad(a, pad, mode="edge")
    n = a.shape[axis]
    if r <= 4:
        # small radius: sum of shifted views is cheaper than a cumulative sum
        out = np.zeros(a.shape, np.float32)
        for k in range(1, 2 * r + 2):
            out += np.take(p, np.arange(k, k + n), axis=axis)
        return out / (2 * r + 1)
    c = np.cumsum(p, axis=axis, dtype=np.float64)
    hi = np.take(c, np.arange(2 * r + 1, 2 * r + 1 + n), axis=axis)
    lo = np.take(c, np.arange(0, n), axis=axis)
    return ((hi - lo) / (2 * r + 1)).astype(np.float32)


def blur(a: np.ndarray, sigma: float) -> np.ndarray:
    """Approximate gaussian by three box passes per axis."""
    if sigma < 0.5:
        return a
    r = max(1, int(round(sigma * 0.95)))
    out = a
    for _ in range(3):
        out = box_blur(out, r, 0)
        out = box_blur(out, r, 1)
    return out


def resize_f(a: np.ndarray, w: int, h: int, resample=Image.BICUBIC) -> np.ndarray:
    return np.asarray(Image.fromarray(a.astype(np.float32), "F").resize((w, h), resample))


def value_noise(rng, h, w, cell, octaves=1, persistence=0.5):
    """Smooth fBm noise in roughly 0..1, built from bicubic-upsampled lattices."""
    out = np.zeros((h, w), np.float32)
    amp, tot = 1.0, 0.0
    c = float(cell)
    for _ in range(octaves):
        gh, gw = max(2, int(h / c) + 3), max(2, int(w / c) + 3)
        g = rng.random((gh, gw)).astype(np.float32)
        big = resize_f(g, int(gw * c), int(gh * c))
        oy, ox = rng.integers(0, max(1, int(c))), rng.integers(0, max(1, int(c)))
        out += amp * big[oy:oy + h, ox:ox + w]
        tot += amp
        amp *= persistence
        c = max(1.0, c / 2.0)
    return out / tot


def lum(c):
    c = np.asarray(c, np.float32)
    return c[..., 0] * 0.2126 + c[..., 1] * 0.7152 + c[..., 2] * 0.0722


NOISE_N = 512
NOISE = value_noise(np.random.default_rng(1234), NOISE_N, NOISE_N, 24, 4, 0.55)
NOISE = (NOISE - NOISE.min()) / (NOISE.max() - NOISE.min())


# ----------------------------------------------------------------------------
# path utilities
# ----------------------------------------------------------------------------

def catmull(points: np.ndarray, samples_per_seg: int = 8) -> np.ndarray:
    p = np.asarray(points, np.float32)
    if len(p) < 3:
        if len(p) == 1:
            p = np.vstack([p, p + 0.01])
        t = np.linspace(0, 1, samples_per_seg + 1)[:, None]
        return p[0] * (1 - t) + p[-1] * t
    ext = np.vstack([2 * p[0] - p[1], p, 2 * p[-1] - p[-2]])
    out = []
    t = np.linspace(0, 1, samples_per_seg, endpoint=False)[:, None]
    for i in range(1, len(ext) - 2):
        p0, p1, p2, p3 = ext[i - 1], ext[i], ext[i + 1], ext[i + 2]
        out.append(0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t
                          + (-p0 + 3 * p1 - 3 * p2 + p3) * t * t * t))
    out.append(p[-1:])
    return np.vstack(out).astype(np.float32)


# ----------------------------------------------------------------------------
# canvas
# ----------------------------------------------------------------------------

class Canvas:
    def __init__(self, width: int, height: int, seed: int = 7, ground=(0.93, 0.91, 0.86)):
        self.w, self.h = width, height
        self.rng = np.random.default_rng(seed)
        self.rgb = np.empty((height, width, 3), np.float32)
        self.rgb[:] = np.asarray(ground, np.float32)
        self.height = np.zeros((height, width), np.float32)
        self.tooth = self._make_tooth()
        self.n_strokes = 0
        self.hooks = []          # called after every stroke (recording)
        self.stage = "blank"

    # canvas tooth, 0..1: a soft, irregular linen weave under a gesso grain.
    # Kept deliberately impure so dry paint breaks up organically, not as a grid.
    def _make_tooth(self):
        h, w = self.h, self.w
        sc = w / 3000.0
        period = max(2.5, 4.6 * sc)
        rng = self.rng
        yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
        wob = value_noise(rng, h, w, 30 * sc + 4, 3) - 0.5
        thread_x = 0.5 + 0.5 * np.cos(2 * np.pi * (xx / period + 0.9 * wob))
        thread_y = 0.5 + 0.5 * np.cos(2 * np.pi * (yy / period - 0.9 * wob))
        weave = 0.5 * (thread_x + thread_y) * (0.6 + 0.4 * value_noise(rng, h, w, 12 * sc + 2, 1))
        gesso = value_noise(rng, h, w, 11 * sc + 2, 3, 0.6)
        clumps = value_noise(rng, h, w, 60 * sc + 4, 2)
        grain = blur(rng.random((h, w)).astype(np.float32), 0.6 * sc + 0.3)
        t = 0.25 * weave + 0.35 * gesso + 0.3 * clumps + 0.1 * grain
        # equalise to a uniform distribution so thresholds behave predictably
        order = np.argsort(t, axis=None)
        ranks = np.empty(t.size, np.float32)
        ranks[order] = np.linspace(0, 1, t.size, dtype=np.float32)
        return ranks.reshape(h, w)

    # ------------------------------------------------------------------
    def stroke(self, pts, width, color, *, alpha=1.0, load=1.0, dry=0.0,
               color2=None, c2frac=0.0, jitter=0.03, smear=0.0, smear_len=None,
               impasto=0.0, taper=(0.12, 0.3), deplete=1.6, soft=0.18,
               bristle_contrast=0.3, rough=0.35, load_dry=1.0, glaze=False, seed=None, flat_end=False,
               tip=(0.72, 0.55)):
        """Drag a loaded bristle brush along `pts` (N x 2 pixel coords)."""
        rng = self.rng if seed is None else np.random.default_rng(seed)
        pts = np.asarray(pts, np.float32)
        path = catmull(pts, 10) if len(pts) > 2 else catmull(pts, max(2, int(np.hypot(*(pts[-1] - pts[0])) / 6) + 2))
        seg = np.diff(path, axis=0)
        seglen = np.hypot(seg[:, 0], seg[:, 1])
        keep = seglen > 1e-4
        if not keep.any():
            path = np.vstack([path[:1], path[:1] + [0.5, 0]])
            seg = np.diff(path, axis=0)
            seglen = np.hypot(seg[:, 0], seg[:, 1])
        else:
            path = np.vstack([path[:1], path[1:][keep]])
            seg = np.diff(path, axis=0)
            seglen = np.hypot(seg[:, 0], seg[:, 1])
        # limit number of segments for speed
        if len(seg) > 48:
            idx = np.linspace(0, len(path) - 1, 49).round().astype(int)
            path = path[idx]
            seg = np.diff(path, axis=0)
            seglen = np.hypot(seg[:, 0], seg[:, 1])
        cum = np.concatenate([[0], np.cumsum(seglen)]).astype(np.float32)
        L = float(cum[-1]) + 1e-3
        hw_max = width * 0.5
        pad = hw_max * (1.25 + rough * 0.3) + 2
        x0 = int(max(0, np.floor(path[:, 0].min() - pad)))
        x1 = int(min(self.w, np.ceil(path[:, 0].max() + pad)))
        y0 = int(max(0, np.floor(path[:, 1].min() - pad)))
        y1 = int(min(self.h, np.ceil(path[:, 1].max() + pad)))
        if x1 <= x0 or y1 <= y0:
            return
        bh, bw = y1 - y0, x1 - x0
        ys = np.arange(y0, y1, dtype=np.float32) + 0.5
        xs = np.arange(x0, x1, dtype=np.float32) + 0.5
        X = np.broadcast_to(xs[None, :], (bh, bw)).ravel()
        Y = np.broadcast_to(ys[:, None], (bh, bw)).ravel()
        P = X.size
        best_d = np.full(P, np.inf, np.float32)
        best_u = np.zeros(P, np.float32)
        best_v = np.zeros(P, np.float32)
        best_tx = np.zeros(P, np.float32)
        best_ty = np.zeros(P, np.float32)
        ax, ay = path[:-1, 0], path[:-1, 1]
        dx, dy = seg[:, 0], seg[:, 1]
        inv = 1.0 / np.maximum(seglen * seglen, 1e-8)
        K = len(seg)
        chunk = max(1, 4_000_000 // max(K, 1))
        for s in range(0, P, chunk):
            px = X[s:s + chunk, None]
            py = Y[s:s + chunk, None]
            rx, ry = px - ax[None], py - ay[None]
            t = np.clip((rx * dx + ry * dy) * inv, 0, 1)
            qx, qy = rx - t * dx, ry - t * dy
            d2 = qx * qx + qy * qy
            k = np.argmin(d2, axis=1)
            r = np.arange(len(k))
            best_d[s:s + chunk] = np.sqrt(d2[r, k])
            tk = t[r, k]
            best_u[s:s + chunk] = cum[k] + tk * seglen[k]
            cross = (dx[k] * ry[r, k] - dy[k] * rx[r, k]) / np.maximum(seglen[k], 1e-6)
            best_v[s:s + chunk] = cross
            best_tx[s:s + chunk] = dx[k] / np.maximum(seglen[k], 1e-6)
            best_ty[s:s + chunk] = dy[k] / np.maximum(seglen[k], 1e-6)
        un = best_u / L
        # pressure / taper profile along stroke
        t0, t1 = taper
        prof = np.ones_like(un)
        if t0 > 0:
            prof *= tip[0] + (1 - tip[0]) * smoothstep(0, t0, un)
        if t1 > 0 and not flat_end:
            prof *= tip[1] + (1 - tip[1]) * smoothstep(1.0, 1.0 - t1, un)
        wob_n = 6
        wob = rng.normal(0, 0.035, wob_n + 1).astype(np.float32)
        prof *= 1.0 + np.interp(un, np.linspace(0, 1, wob_n + 1), wob)
        hw = np.maximum(hw_max * prof, 0.35)
        sign = np.where(best_v >= 0, 1.0, -1.0)
        vn = sign * best_d / hw               # radial: -1..1 across the brush (round caps)
        vl = np.clip(best_v / hw, -1.0, 1.0)  # lateral position -> which bristle
        # bristles
        nb = int(np.clip(width / 1.6, 6, 160))
        b_str = np.clip(1.0 - bristle_contrast * rng.random(nb + 2) ** 1.5, 0.05, 1).astype(np.float32)
        b_run = (0.45 + 1.1 * rng.random(nb + 2)).astype(np.float32)
        b_jit = rng.normal(0, 1, (nb + 2, 3)).astype(np.float32)
        b_c2 = (rng.random(nb + 2) < c2frac).astype(np.float32)
        # smooth the colour-2 selection a little so it comes in clumps
        b_c2 = np.convolve(b_c2, [0.25, 0.5, 0.25], mode="same")
        bi = np.clip((vl + 1.0) * 0.5, 0, 1) * (nb + 1)
        i0 = np.clip(np.floor(bi).astype(np.int32), 0, nb + 1)
        i1 = np.clip(i0 + 1, 0, nb + 1)
        f = (bi - i0).astype(np.float32)
        strength = b_str[i0] * (1 - f) + b_str[i1] * f
        run = b_run[i0] * (1 - f) + b_run[i1] * f
        # along-stroke irregularity (paint skipping)
        an = 12
        along = np.interp(un, np.linspace(0, 1, an + 1),
                          (1.0 + rng.normal(0, 0.18, an + 1)).astype(np.float32))
        dep = np.exp(-un * deplete / run) if deplete > 0 else np.ones_like(un)
        # mottled paint body: sample a shared noise texture in brush space
        nu = (best_u / max(width, 1.0)) * 0.9 * NOISE_N / 8.0
        nv = (vl + 1.0) * 0.5 * NOISE_N / 16.0 + (rng.random() * NOISE_N)
        mott = NOISE[(nv.astype(np.int32)) % NOISE_N, (nu.astype(np.int32) + int(rng.random() * NOISE_N)) % NOISE_N]
        amt = load * strength * (0.35 + 0.65 * dep) * along * (0.75 + 0.5 * mott)
        # ragged edge: the side bristles splay
        edge_n = rough * 0.18 * (b_str[i0] - 0.5)
        edge = smoothstep(1.0 + edge_n, 1.0 - soft + edge_n, np.abs(vn))
        # canvas tooth
        tooth = self.tooth[y0:y1, x0:x1].ravel()
        # dry paint also breaks along the direction of travel (bristle drag)
        su = (best_u / max(width, 2.0)) * 6.0 + rng.random() * NOISE_N
        sv = (vl + 1.0) * 0.5 * min(nb, 60) * 2.2 + rng.random() * NOISE_N
        streak = NOISE[sv.astype(np.int32) % NOISE_N, su.astype(np.int32) % NOISE_N]
        T = 0.5 * tooth + 0.5 * streak
        # as the brush runs dry the paint breaks up on the weave instead of fading
        dry_eff = np.clip(dry + (1.0 - dep) * 0.55 * load_dry, 0, 1.2)
        thr = dry_eff * (0.15 + 0.95 * (1.0 - T))
        cover = smoothstep(thr - 0.1, thr + 0.1, amt * (0.8 + 0.4 * mott))
        opac = np.clip(amt * 2.5, 0, 1)
        a = (alpha * edge * cover * opac).astype(np.float32)
        m = a > 0.002
        if not m.any():
            return
        idx = np.nonzero(m)[0]
        a = a[idx]
        py = (idx // bw)
        px = (idx % bw)
        region = self.rgb[y0:y1, x0:x1]
        under = region[py, px]
        col = np.asarray(color, np.float32)[None, :]
        jit = (b_jit[i0[idx]] * (1 - f[idx, None]) + b_jit[i1[idx]] * f[idx, None])
        # jitter mostly in value, a little in hue
        jv = jit[:, :1] * jitter
        jh = jit * jitter * 0.35
        c = col * (1.0 + jv) + jh
        if color2 is not None and c2frac > 0:
            w2 = (b_c2[i0[idx]] * (1 - f[idx]) + b_c2[i1[idx]] * f[idx])[:, None]
            c2 = np.asarray(color2, np.float32)[None, :] * (1.0 + jv) + jh
            c = c * (1 - w2) + c2 * w2
        if smear > 0:
            sl = smear_len if smear_len is not None else width * 0.8
            sx = np.clip((X[idx] - best_tx[idx] * sl).astype(np.int32), 0, self.w - 1)
            sy = np.clip((Y[idx] - best_ty[idx] * sl).astype(np.int32), 0, self.h - 1)
            picked = self.rgb[sy, sx]
            s_amt = (smear * (1.0 - 0.6 * np.exp(-un[idx] * 2.5)))[:, None]
            c = c * (1 - s_amt) + picked * s_amt
        c = np.clip(c, 0, 1.2)
        if glaze:
            # transparent film: tints what is below, cannot lighten beyond it
            new = under * (1 - a[:, None]) + under * c * a[:, None] * 1.0
        else:
            new = under * (1 - a[:, None]) + c * a[:, None]
        region[py, px] = new
        if impasto > 0 or True:
            hreg = self.height[y0:y1, x0:x1]
            ridge = 1.0 + 0.35 * smoothstep(0.6, 0.95, np.abs(vn[idx]))
            groove = 0.8 + 0.12 * strength[idx] + 0.25 * mott[idx]
            add = impasto * a * np.clip(amt[idx], 0, 1.5) * ridge * groove
            flatten = 0.35 * a * min(1.0, load)
            hreg[py, px] = hreg[py, px] * (1 - flatten) + add
        self.n_strokes += 1
        area = float(len(idx))
        for hook in self.hooks:
            hook(self, area)

    # ------------------------------------------------------------------
    def lit(self, rgb=None, height=None, tooth=None, strength=1.0):
        """Rake light across the paint surface (impasto + weave)."""
        rgb = self.rgb if rgb is None else rgb
        height = self.height if height is None else height
        tooth = self.tooth if tooth is None else tooth
        scale = rgb.shape[1] / 3000.0
        hsurf = blur(height, 1.2 * scale) * 1.0 + tooth * 0.05
        gy, gx = np.gradient(hsurf)
        gx /= max(scale, 0.2)
        gy /= max(scale, 0.2)
        # light from upper left
        lx, ly, lz = -0.55, -0.6, 0.58
        nz = 1.0 / np.sqrt(1 + (gx * 4) ** 2 + (gy * 4) ** 2)
        nx, ny = -gx * 4 * nz, -gy * 4 * nz
        ndl = nx * lx + ny * ly + nz * lz
        base = lz
        shade = 1.0 + strength * 0.5 * (ndl - base)
        # tiny gloss on ridges of thick paint
        spec = np.clip(ndl - 0.8, 0, 1) ** 2 * 1.2 * np.clip(height * 3, 0, 1)
        l = lum(rgb)[..., None]
        out = rgb * shade[..., None] + spec[..., None] * (0.25 + 0.75 * l)
        return np.clip(out, 0, 1)


def to_image(a: np.ndarray) -> Image.Image:
    return Image.fromarray((np.clip(a, 0, 1) * 255 + 0.5).astype(np.uint8), "RGB")
