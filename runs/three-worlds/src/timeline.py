"""Film timeline (24 fps) and camera paths shared by every renderer."""
import json, numpy as np
import common as C

FPS = 24
W, H = 1920, 1080

# act boundaries in seconds
T_TITLE = (0.0, 2.6)
T_MATTER = (2.2, 9.2)        # copper; orbit ends on the canonical view K at ORBIT_END
ORBIT = (2.2, 8.4)
T_M2T = (8.9, 10.6)          # matched dissolve copper -> paper (same camera K)
T_TRACE = (10.2, 17.4)       # brush paints the trajectory in temporal order
PAINT = (10.9, 16.2)
T_T2E = (17.0, 18.6)         # paper darkens, ink hands over to light (camera K)
T_ENERGY = (18.2, 26.0)      # luminous head follows the trajectory
TRAVEL = (18.6, 25.4)
T_FINAL = (25.8, 30.0)       # triptych + title, fade out
DURATION = 30.0
N_FRAMES = int(DURATION * FPS)


def canonical_camera(W=W, H=H):
    k = C.Camera.from_dict(json.loads((C.DATA / "camera_canonical.json").read_text()))
    return k.with_res(W, H, fit="HORIZONTAL" if W >= H else "VERTICAL")


def smooth(x):
    x = np.clip(x, 0, 1)
    return x * x * x * (x * (6 * x - 15) + 10)


def _orbit_params(K):
    d = K.pos - K.target
    dist = np.linalg.norm(d)
    el = np.degrees(np.arcsin(d[2] / dist))
    az = np.degrees(np.arctan2(d[0], -d[1]))
    return az, el, dist


def matter_camera(sec, W=W, H=H):
    """Orbit from a near edge-on view (wings folded into a V) to K, where the
    butterfly opens.  Ends exactly on the canonical camera."""
    K = canonical_camera(W, H)
    az1, el1, d1 = _orbit_params(K)
    u = smooth((sec - ORBIT[0]) / (ORBIT[1] - ORBIT[0]))
    az = az1 + (-62.0 - az1) * (1 - u)
    el = el1 + (12.0 - el1) * (1 - u)
    dist = d1 * (1 + 0.16 * (1 - u))
    tgt = K.target + np.array([0, 0, 0.03]) * (1 - u)
    k = C.orbit_camera(az, el, dist, tgt, lens=K.lens, W=W, H=H, fit=K.fit, fstop=K.fstop)
    k.focus = dist
    return k


def energy_camera(sec, W=W, H=H):
    """Starts on K (matched with the ink), then drifts around to reveal depth."""
    K = canonical_camera(W, H)
    az1, el1, d1 = _orbit_params(K)
    u = smooth((sec - (TRAVEL[0] + 0.6)) / (TRAVEL[1] - TRAVEL[0] - 0.2))
    az = az1 + 38.0 * u
    el = el1 + 6.0 * u
    dist = d1 * (1 - 0.06 * u)
    k = C.orbit_camera(az, el, dist, K.target, lens=K.lens, W=W, H=H, fit=K.fit, fstop=K.fstop)
    k.focus = dist
    return k
