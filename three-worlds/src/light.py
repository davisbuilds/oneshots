"""ENERGY — a luminous head travelling the trajectory through a dark, hazy room.

A small spectral renderer in numpy/numba:
  * the trail is the trajectory already travelled; each point fades with the
    *film* time elapsed since the head passed it (phosphor-like persistence)
  * colour cools with age: amber-white head -> amber -> blue-green
  * depth of field (circle of confusion from the same camera) and distance falloff
  * the head and recent trail illuminate the plinth and floor (inverse-square,
    Lambert + a soft sheen) and scatter in a thin haze (analytic single-scatter
    integral per light sample, occluded by the plinth)
"""
import sys, math, pathlib
import numpy as np
from numba import njit, prange
from scipy import ndimage as ndi

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import common as C
import timeline as T

AMBER = np.array([1.00, 0.40, 0.09])
HOT = np.array([1.00, 0.86, 0.62])
TEAL = np.array([0.06, 0.56, 0.52])
DEEP = np.array([0.05, 0.28, 0.36])


# ----------------------------------------------------------------------------- time map
def _speed_profile(u):
    # slow ignition in the spiral eye, brisk through the chaos, easing to rest at t=27
    return 0.30 + np.sin(np.pi * np.clip(u, 0, 1)) ** 0.7 + 0.25 * u


_U = np.linspace(0, 1, 4001)
_G = np.concatenate([[0], np.cumsum(0.5 * (_speed_profile(_U[1:]) + _speed_profile(_U[:-1])) * np.diff(_U))])
_G /= _G[-1]


def traj_time(sec):
    """Film seconds -> trajectory time (monotonic).  Before TRAVEL the head waits
    at t=8; afterwards it rests at t=27."""
    u = np.clip((np.asarray(sec, float) - T.TRAVEL[0]) / (T.TRAVEL[1] - T.TRAVEL[0]), 0, 1)
    return 8.0 + 19.0 * np.interp(u, _U, _G)


def film_time_of(ttraj):
    """Inverse map: when (film seconds) did the head pass trajectory time t."""
    g = (np.asarray(ttraj) - 8.0) / 19.0
    u = np.interp(g, _G, _U)
    return T.TRAVEL[0] + u * (T.TRAVEL[1] - T.TRAVEL[0])


# ----------------------------------------------------------------------------- splatting
@njit(parallel=True, cache=True)
def _splat(img, xy, sig, rgb, H, W):
    """Energy-conserving gaussian splats; rows are split into bands for thread safety."""
    nb = 64
    band = (H + nb - 1) // nb
    for bnd in prange(nb):
        y_lo, y_hi = bnd * band, min(H, (bnd + 1) * band)
        for i in range(xy.shape[0]):
            s = sig[i]
            R = int(3 * s + 1)
            x, y = xy[i, 0], xy[i, 1]
            if y + R < y_lo or y - R >= y_hi:
                continue
            norm = 1.0 / (2 * math.pi * s * s)
            for py in range(max(y_lo, int(y) - R), min(y_hi, int(y) + R + 1)):
                dy = py + 0.5 - y
                for px in range(max(0, int(x) - R), min(W, int(x) + R + 1)):
                    dx = px + 0.5 - x
                    w = math.exp(-(dx * dx + dy * dy) / (2 * s * s)) * norm
                    img[py, px, 0] += w * rgb[i, 0]
                    img[py, px, 1] += w * rgb[i, 1]
                    img[py, px, 2] += w * rgb[i, 2]


@njit(parallel=True, cache=True)
def _room(out, orig, dirs, box_lo, box_hi, L_pos, L_rgb, L_haze, haze, alb_stone, alb_floor, sheen):
    """Per-pixel: intersect plinth box and floor, shade by the light samples,
    add analytic single scattering along the ray up to the hit."""
    H, W = dirs.shape[0], dirs.shape[1]
    for py in prange(H):
        for px in range(W):
            dx, dy, dz = dirs[py, px, 0], dirs[py, px, 1], dirs[py, px, 2]
            ox, oy, oz = orig[0], orig[1], orig[2]
            # slab test
            tmin, tmax = -1e9, 1e9
            nrm = 0
            hit_box = True
            for a in range(3):
                d = (dx, dy, dz)[a]
                o = (ox, oy, oz)[a]
                if abs(d) < 1e-9:
                    if o < box_lo[a] or o > box_hi[a]:
                        hit_box = False
                    continue
                t1 = (box_lo[a] - o) / d
                t2 = (box_hi[a] - o) / d
                if t1 > t2:
                    t1, t2 = t2, t1
                if t1 > tmin:
                    tmin = t1; nrm = a if d > 0 else a + 3
                    # nrm encodes which face: axis a, sign by ray dir
                if t2 < tmax:
                    tmax = t2
            if tmax < tmin or tmax < 0:
                hit_box = False
            T_hit = 12.0
            kind = 0
            nx = ny = nz = 0.0
            if hit_box and tmin > 0:
                T_hit = tmin; kind = 1
                a = nrm % 3
                sgn = -1.0 if nrm < 3 else 1.0
                if a == 0: nx = sgn
                elif a == 1: ny = sgn
                else: nz = sgn
            elif dz < -1e-6:
                tf = -oz / dz
                if tf < T_hit:
                    T_hit = tf; kind = 2; nz = 1.0
            hx, hy, hz = ox + dx * T_hit, oy + dy * T_hit, oz + dz * T_hit
            r = 0.0; g = 0.0; b = 0.0
            for k in range(L_pos.shape[0]):
                lx, ly, lz = L_pos[k, 0], L_pos[k, 1], L_pos[k, 2]
                # --- surface
                if kind > 0:
                    vx, vy, vz = lx - hx, ly - hy, lz - hz
                    d2 = vx * vx + vy * vy + vz * vz
                    dd = math.sqrt(d2)
                    ct = (vx * nx + vy * ny + vz * nz) / dd
                    if ct > 0:
                        # the plinth shadows the floor: crude test, light above plinth top
                        vis = 1.0
                        if kind == 2 and hx > box_lo[0] - 0.05 and hx < box_hi[0] + 0.05 and hy > box_lo[1] - 0.05 and hy < box_hi[1] + 0.05:
                            vis = 0.15
                        alb = alb_stone if kind == 1 else alb_floor
                        e = vis * ct / d2
                        # soft sheen toward the viewer (honed stone)
                        hxv, hyv, hzv = vx / dd - dx, vy / dd - dy, vz / dd - dz
                        hn = math.sqrt(hxv * hxv + hyv * hyv + hzv * hzv) + 1e-9
                        ndh = (hxv * nx + hyv * ny + hzv * nz) / hn
                        spec = sheen * (max(ndh, 0.0) ** 90) * 700.0 if kind == 1 else sheen * 0.3 * (max(ndh, 0.0) ** 30) * 10.0
                        f = e * (alb / math.pi + spec * ct)
                        r += f * L_rgb[k, 0]; g += f * L_rgb[k, 1]; b += f * L_rgb[k, 2]
                # --- haze: integral of 1/|x(t)-l|^2 along ray from 0..T_hit
                wx, wy, wz = lx - ox, ly - oy, lz - oz
                t0 = wx * dx + wy * dy + wz * dz
                h2 = wx * wx + wy * wy + wz * wz - t0 * t0
                h = math.sqrt(max(h2, 1e-6))
                T_h = T_hit if kind == 1 else 6.0
                I = (math.atan((T_h - t0) / h) - math.atan(-t0 / h)) / h
                f = haze * I * L_haze[k]
                r += f * L_rgb[k, 0]; g += f * L_rgb[k, 1]; b += f * L_rgb[k, 2]
            out[py, px, 0] = r; out[py, px, 1] = g; out[py, px, 2] = b


# ----------------------------------------------------------------------------- renderer
class LightRenderer:
    def __init__(self):
        t, P, sp = C.load()
        self.t = t
        self.Q = C.to_world(P)
        self.tf = film_time_of(t)                 # film second each sample is passed
        i = np.argmin(self.Q[:, 2])
        cx, cy = self.Q[i, 0], self.Q[i, 1]
        h = C.PLINTH_W / 2
        self.box_lo = np.array([cx - h, cy - h, 0.0])
        self.box_hi = np.array([cx + h, cy + h, C.PLINTH_H])

    def color_of_age(self, age):
        """age in film seconds -> (rgb weight). Bright short persistence + long faint memory."""
        a = np.asarray(age)[:, None]
        k_hot = np.exp(-a / 0.05)
        k_amb = np.exp(-a / 0.55)
        k_teal = np.exp(-a / 3.2)
        rgb = HOT * (3.0 * k_hot) + AMBER * (1.6 * k_amb) + TEAL * (0.55 * k_teal * (1 - k_amb)) \
            + DEEP * 0.10 * (1 - k_amb)
        return rgb

    def frame(self, sec, cam, exposure=1.0, long_exposure=0.0, head_fade=1.0, trail_gain=1.0,
              room=True, gradient=0.0):
        W, H = cam.W, cam.H
        u = H / 1080.0
        img = np.zeros((H, W, 3), np.float32)
        tau = float(traj_time(sec))
        m = self.t <= tau + 1e-9
        Qm, tf = self.Q[m], self.tf[m]
        if Qm.shape[0] < 2:
            Qm = self.Q[:2]; tf = self.tf[:2]
        # add the exact head position
        head = np.array([np.interp(tau, self.t, self.Q[:, k]) for k in range(3)])
        Qm = np.vstack([Qm, head]); tf = np.append(tf, sec)
        uv, dep = cam.project(Qm)
        # resample in screen space to <= 0.5 px spacing
        seg = np.linalg.norm(np.diff(uv, axis=0), axis=1)
        n_sub = np.maximum(1, np.ceil(seg / (0.5 * u)).astype(int))
        idx = np.repeat(np.arange(len(seg)), n_sub)
        frac = np.concatenate([np.arange(k) / k for k in n_sub])
        uvs = uv[idx] + (uv[idx + 1] - uv[idx]) * frac[:, None]
        deps = dep[idx] + (dep[idx + 1] - dep[idx]) * frac
        tfs = tf[idx] + (tf[idx + 1] - tf[idx]) * frac
        dsp = np.repeat(seg / n_sub, n_sub)
        age = np.maximum(sec - tfs, 0.0)
        rgb = self.color_of_age(age) * trail_gain * 0.55
        if gradient > 0:               # long exposure: colour records when the head passed
            tq = np.interp(tfs, self.tf, self.t)
            g = ((tq - 8.0) / 19.0)[:, None]
            rgb = rgb + gradient * (TEAL * (1 - g) * 0.55 + AMBER * g * 0.75)
        if long_exposure > 0:          # the whole travelled path, as a long photograph
            rgb = rgb + long_exposure * (0.35 * TEAL + 0.12 * AMBER)[None, :]
        # depth of field + distance falloff
        coc = np.abs(deps - cam.focus) / deps * cam.lens / (cam.fstop or 8.0) / cam.sensor * cam.scale_px() * 0.022 * 1.6
        sig = 0.75 * u + coc * 0.9
        fall = (cam.focus / deps) ** 2
        w = (dsp / (0.5 * u))[:, None] * fall[:, None] * rgb * (0.5 * u)
        keep = (w.max(1) > 1e-5) & (uvs[:, 0] > -20) & (uvs[:, 0] < W + 20) & (uvs[:, 1] > -20) & (uvs[:, 1] < H + 20)
        _splat(img, uvs[keep].astype(np.float32), sig[keep].astype(np.float32),
               (w[keep] * 0.9).astype(np.float32), H, W)
        # soft reflection of the light drawing in the honed plinth top
        mirror = Qm.copy(); mirror[:, 2] = 2 * C.PLINTH_H - mirror[:, 2]
        muv, mdep = cam.project(mirror)
        muvs = muv[idx] + (muv[idx + 1] - muv[idx]) * frac[:, None]
        mdeps = mdep[idx] + (mdep[idx + 1] - mdep[idx]) * frac
        refl = np.zeros_like(img)
        rw = w * (deps / mdeps)[:, None] ** 2 * 0.10
        keep2 = keep & (muvs[:, 1] > 0) & (muvs[:, 1] < H + 40)
        _splat(refl, muvs[keep2].astype(np.float32), (sig[keep2] + 3.5 * u).astype(np.float32),
               rw[keep2].astype(np.float32), H, W)
        img += refl * self._top_mask(cam)[..., None]
        # head: motion-blurred along its path within the shutter (180 deg)
        if head_fade > 0:
            sh = np.linspace(sec - 0.5 / T.FPS, sec, 400)
            tt_sh = traj_time(sh)
            hp = np.column_stack([np.interp(tt_sh, self.t, self.Q[:, k]) for k in range(3)])
            # resample to even screen spacing so the streak is continuous
            huv0, _ = cam.project(hp)
            hp, _, _ = C.resample(hp, n=int(max(40, C.arclength(huv0)[-1] / (0.35 * u))))
            huv, hdep = cam.project(hp)
            hc = np.tile(HOT * 70.0 * head_fade / len(hp) * (cam.focus / hdep.mean()) ** 2, (len(hp), 1))
            _splat(img, huv.astype(np.float32), np.full(len(hp), 1.3 * u, np.float32), hc.astype(np.float32), H, W)
            _splat(img, huv.astype(np.float32), np.full(len(hp), 5.0 * u, np.float32), (hc * 0.8).astype(np.float32), H, W)
            _splat(img, huv.astype(np.float32), np.full(len(hp), 22.0 * u, np.float32), (hc * 3.0).astype(np.float32), H, W)
            # the orb itself: a compact over-exposed core at the current position + warm halo
            c = huv[-1:].astype(np.float32)
            g = (cam.focus / hdep[-1]) ** 2 * head_fade
            _splat(img, c, np.array([1.6 * u], np.float32), (HOT * 90.0 * g)[None].astype(np.float32), H, W)
            _splat(img, c, np.array([7.0 * u], np.float32), (AMBER * 140.0 * g)[None].astype(np.float32), H, W)
            _splat(img, c, np.array([40.0 * u], np.float32), (AMBER * 420.0 * g)[None].astype(np.float32), H, W)
        # room + haze from the light samples (head + recent trail + faint memory)
        if room:
            L_pos, L_rgb, L_hz = self._light_samples(sec, tau, head, head_fade, long_exposure, trail_gain)
            img += self._room_pass(cam, L_pos, L_rgb, L_hz, u)
        # bloom: optical glare of the lens
        bl = np.zeros_like(img)
        for s, k in ((2.5, 0.10), (9, 0.06), (30, 0.04)):
            bl += k * ndi.gaussian_filter(img, (s * u, s * u, 0))
        img = img * 0.82 + bl
        return self.tonemap(img * exposure)

    def _top_mask(self, cam):
        key = (cam.W, cam.H, tuple(np.round(cam.pos, 6)), tuple(np.round(cam.target, 6)))
        if getattr(self, "_mask_key", None) != key:
            from PIL import Image, ImageDraw
            lo, hi = self.box_lo, self.box_hi
            c = np.array([[lo[0], lo[1], hi[2]], [hi[0], lo[1], hi[2]], [hi[0], hi[1], hi[2]], [lo[0], hi[1], hi[2]]])
            uv, _ = cam.project(c)
            ss = 4
            im = Image.new("L", (cam.W * ss // 2, cam.H * ss // 2), 0)
            ImageDraw.Draw(im).polygon([tuple(x * ss / 2) for x in uv], fill=255)
            m = np.asarray(im.resize((cam.W, cam.H), Image.LANCZOS), np.float32) / 255
            self._mask, self._mask_key = m, key
        return self._mask

    def _light_samples(self, sec, tau, head, head_fade, long_exposure, trail_gain):
        m = self.t <= tau
        idx = np.where(m)[0]
        pos, col, hz = [head[None, :]], [HOT[None, :] * 3.2 * head_fade], [np.ones(1)]
        if idx.size > 2:
            ages = sec - self.tf[idx]
            recent = idx[ages < 1.5][::60]
            if recent.size:
                c = self.color_of_age(sec - self.tf[recent]) * 0.02 * trail_gain
                pos.append(self.Q[recent]); col.append(c); hz.append(np.ones(recent.size))
            old = idx[::400]
            c = self.color_of_age(sec - self.tf[old]) * 0.003 * trail_gain + long_exposure * 0.006 * TEAL
            pos.append(self.Q[old]); col.append(c); hz.append(np.full(old.size, 0.15))
        return (np.vstack(pos).astype(np.float64), np.vstack(col).astype(np.float64),
                np.concatenate(hz).astype(np.float64))

    def _room_pass(self, cam, L_pos, L_rgb, L_hz, u):
        s = 1
        w, h = cam.W // s, cam.H // s
        ys, xs = np.mgrid[0:h, 0:w]
        k = cam.scale_px() / s
        xc = (xs + 0.5 - w / 2) / k
        yc = -(ys + 0.5 - h / 2) / k
        d = xc[..., None] * cam.r + yc[..., None] * cam.u + cam.f
        d /= np.linalg.norm(d, axis=-1, keepdims=True)
        out = np.zeros((h, w, 3))
        _room(out, cam.pos, d, self.box_lo, self.box_hi, L_pos, L_rgb, L_hz, 0.00016, 0.018, 0.02, 0.010)
        out = ndi.gaussian_filter(out, (0.6 * u, 0.6 * u, 0))
        return out.astype(np.float32) * 0.022

    @staticmethod
    def tonemap(x):
        # filmic shoulder with gentle desaturation of the hottest core
        lum = x @ np.array([0.2126, 0.7152, 0.0722])
        x = x + np.clip(lum - 1.2, 0, None)[..., None] * 0.35
        y = 1 - np.exp(-x * 1.0)
        return np.clip(y, 0, 1) ** (1 / 2.2)


if __name__ == "__main__":
    import argparse, time
    from PIL import Image
    ap = argparse.ArgumentParser()
    ap.add_argument("--sec", type=float, nargs="+", default=[21.0])
    ap.add_argument("--res", nargs=2, type=int, default=[1920, 1080])
    ap.add_argument("--canonical", action="store_true")
    ap.add_argument("--out", default=str(C.OUT / "light_test"))
    a = ap.parse_args()
    R = LightRenderer()
    for s in a.sec:
        t0 = time.time()
        cam = T.canonical_camera(*a.res) if a.canonical else T.energy_camera(s, *a.res)
        im = R.frame(s, cam)
        Image.fromarray((im * 255 + 0.5).astype(np.uint8)).save(f"{a.out}_{s:.2f}.png")
        print(s, f"tau={traj_time(s):.2f}", f"{time.time() - t0:.1f}s")
