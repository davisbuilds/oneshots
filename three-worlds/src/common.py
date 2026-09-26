"""Shared geometry for all three worlds.

Every renderer (Blender copper, numpy ink, numpy light) loads the same
canonical trajectory and maps it into the same physical "gallery" frame with
`to_world`, then views it through the same pinhole camera model.  That is what
makes the matched compositions in the film exact rather than approximate.
"""
import json, pathlib
import numpy as np

ROOT = pathlib.Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
OUT = ROOT / "out"

# --- physical staging (metres, Blender Z-up) --------------------------------
PLINTH_W = 0.46          # plinth footprint (square)
PLINTH_H = 0.92          # plinth height
GAP = 0.20               # clearance between plinth top and lowest point of the filament
SCALE = 0.0158           # metres per Lorenz unit  (~0.56 m tall, ~0.72 m deep)
YAW_DEG = -28.0          # rotation of the attractor about the vertical axis


def load():
    d = np.load(DATA / "lorenz_canonical.npz")
    return d["t"], d["xyz"], d["speed"]


def _frame(P):
    c = np.array([0.5 * (P[:, 0].min() + P[:, 0].max()),
                  0.5 * (P[:, 1].min() + P[:, 1].max()),
                  P[:, 2].min()])
    return c


def to_world(P, P_ref=None):
    """Lorenz coordinates -> gallery metres. Rigid rotation + uniform scale only,
    so the geometry of the trajectory is preserved exactly."""
    P_ref = P if P_ref is None else P_ref
    c = _frame(P_ref)
    q = (P - c) * SCALE
    a = np.radians(YAW_DEG)
    R = np.array([[np.cos(a), -np.sin(a), 0], [np.sin(a), np.cos(a), 0], [0, 0, 1]])
    q = q @ R.T
    q[:, 2] += PLINTH_H + GAP
    return q


def world_curve():
    t, P, sp = load()
    return t, to_world(P), sp


def arclength(Q):
    seg = np.linalg.norm(np.diff(Q, axis=0), axis=1)
    return np.concatenate([[0], np.cumsum(seg)])


def resample(Q, n=None, step=None, extra=()):
    """Resample a polyline uniformly in arc length. `extra` arrays are
    interpolated the same way (e.g. time, speed)."""
    s = arclength(Q)
    if step is not None:
        n = int(np.ceil(s[-1] / step)) + 1
    u = np.linspace(0, s[-1], n)
    out = np.column_stack([np.interp(u, s, Q[:, k]) for k in range(Q.shape[1])])
    return out, [np.interp(u, s, e) for e in extra], u


# --- camera -----------------------------------------------------------------
class Camera:
    """Pinhole camera matching Blender's conventions (sensor_fit explicit)."""

    def __init__(self, pos, target, lens=85.0, sensor=36.0, fit="HORIZONTAL",
                 W=1920, H=1080, fstop=None, focus=None):
        self.pos = np.asarray(pos, float)
        self.target = np.asarray(target, float)
        self.lens, self.sensor, self.fit = lens, sensor, fit
        self.W, self.H = W, H
        self.fstop = fstop
        self.focus = focus if focus is not None else float(np.linalg.norm(self.target - self.pos))
        f = self.target - self.pos
        self.f = f / np.linalg.norm(f)
        r = np.cross(self.f, [0, 0, 1.0])
        self.r = r / np.linalg.norm(r)
        self.u = np.cross(self.r, self.f)

    def scale_px(self):
        half = self.W / 2 if self.fit == "HORIZONTAL" else self.H / 2
        return self.lens / (self.sensor / 2) * half

    def project(self, Q):
        d = np.asarray(Q) - self.pos
        xc, yc, zc = d @ self.r, d @ self.u, d @ self.f
        k = self.scale_px()
        px = self.W / 2 + k * xc / zc
        py = self.H / 2 - k * yc / zc
        return np.column_stack([px, py]), zc

    def matrix_world(self):
        M = np.eye(4)
        M[:3, 0], M[:3, 1], M[:3, 2], M[:3, 3] = self.r, self.u, -self.f, self.pos
        return M

    def with_res(self, W, H, fit=None):
        c = Camera(self.pos, self.target, self.lens, self.sensor, fit or self.fit, W, H,
                   self.fstop, self.focus)
        return c

    def to_dict(self):
        return dict(pos=self.pos.tolist(), target=self.target.tolist(), lens=self.lens,
                    sensor=self.sensor, fit=self.fit, W=self.W, H=self.H,
                    fstop=self.fstop, focus=self.focus)

    @staticmethod
    def from_dict(d):
        return Camera(d["pos"], d["target"], d["lens"], d["sensor"], d["fit"], d["W"], d["H"],
                      d.get("fstop"), d.get("focus"))


def orbit_camera(az_deg, el_deg, dist, target, **kw):
    """Camera on a sphere around `target`; azimuth measured from -Y toward +X."""
    a, e = np.radians(az_deg), np.radians(el_deg)
    target = np.asarray(target, float)
    pos = target + dist * np.array([np.sin(a) * np.cos(e), -np.cos(a) * np.cos(e), np.sin(e)])
    return Camera(pos, target, **kw)


def sculpture_center():
    _, Q, _ = world_curve()
    return 0.5 * (Q.min(0) + Q.max(0))
