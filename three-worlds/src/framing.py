"""Solve for the canonical 'matched' camera used by all three worlds."""
import json, sys, numpy as np
from scipy.optimize import least_squares
import common as C

def plinth_top_corners():
    _, Q, _ = C.world_curve()
    i = np.argmin(Q[:, 2]); cx, cy = Q[i, 0], Q[i, 1]; h = C.PLINTH_W / 2
    return np.array([[cx + sx * h, cy + sy * h, C.PLINTH_H] for sx in (-1, 1) for sy in (-1, 1)])

def solve(az, el, lens, W, H, top=0.10, bottom=0.90, xshift=0.0):
    _, Q, _ = C.world_curve()
    Qs = Q[::20]; corners = plinth_top_corners()
    c0 = C.sculpture_center()
    def cam(p):
        d, tz, tx = p
        tgt = c0 + np.array([tx * np.cos(np.radians(az)), tx * np.sin(np.radians(az)), tz])
        return C.orbit_camera(az, el, d, tgt, lens=lens, W=W, H=H, fit="HORIZONTAL" if W >= H else "VERTICAL")
    def res(p):
        k = cam(p)
        uv, _ = k.project(Qs); cv, _ = k.project(corners)
        return [uv[:, 1].min() / H - top, cv[:, 1].max() / H - bottom,
                (uv[:, 0].min() + uv[:, 0].max()) / 2 / W - 0.5 - xshift]
    r = least_squares(res, [3.0, -0.2, 0.0])
    k = cam(r.x)
    uv, _ = k.project(Qs)
    return k, r.x, (uv.min(0) / [W, H], uv.max(0) / [W, H])

if __name__ == "__main__":
    az, el, lens = map(float, sys.argv[1:4])
    k, x, bb = solve(az, el, lens, 1920, 1080)
    print(x, bb)
