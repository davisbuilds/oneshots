#!/usr/bin/env python3
"""Design the Antikythera Engine's gear trains: tooth counts, modules, levels.

    python3 src/design.py            # writes data/design.json and prints the ledger

The machine
-----------
Four vertical axes stand in a line, spaced `SPACING` millimetres apart:

    C  the centre: a fixed sun rod inside nine nested tubes, one per arm
    N  a dead (fixed) arbor carrying loose compound pipes
    M  a second dead arbor carrying loose compound pipes
    L  the live driving arbor; the crank turns it once per sidereal year

Every train starts with a wheel fixed to L and ends with a wheel on a tube at C.
In between it hops between M and N on loose pipes (a pinion and a wheel made
fast together, riding a fixed arbor). A train of n meshes follows

    L-M, M-N, N-M, ..., M-N, N-C        (n odd, n >= 3)

Each mesh reverses the sense of rotation, so all trains use an odd number of
meshes: the crank turns L clockwise (seen from above) and every body goes
round anticlockwise, as the sky does.

Constraints (all enforced here, re-checked by test_design.py)
-------------------------------------------------------------
* A meshing pair shares a module m, and its pitch radii add up to the axis
  spacing: m (z1 + z2) / 2 = spacing. So each module fixes the tooth sum.
* Modules are ISO 54 values; only those giving an integer tooth sum are used.
* 25 degree involute teeth, no fewer than 12 (no undercut at 25 degrees).
* Every wheel's root circle clears its bore: dead-arbor pipes, the L arbor,
  or the tube it is fixed to.
* A wheel on N that does not mesh with C must clear the column of tubes at C;
  the column's radius depends on the level (inner tubes reach lower).
* Pipes on the same dead arbor must not overlap in height.
* Accuracy rule: a train may drift from the true mean motion by at most
  `MAX_DRIFT` degrees per century (one degree per thousand years). Among trains
  that meet it, the fewest meshes win, then the smallest total of teeth.

The ratio a train must make is exact arithmetic on integers (fractions), so the
drift figures below are exact consequences of the tooth counts.
"""

from __future__ import annotations

import json
import math
import sys
from dataclasses import dataclass, field
from fractions import Fraction
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import ephemeris as eph  # noqa: E402

OUT = HERE.parent / "data" / "design.json"

SPACING = {"LM": 48.0, "MN": 48.0, "NC": 48.0}     # mm between adjacent axes
MODULES = (0.8, 1.0, 1.25, 1.5, 2.0)                # ISO 54, first choice
PRESSURE_ANGLE = 25.0
TMIN = 12
MAX_DRIFT = 0.1                                     # degrees per century

# Bores and wall thicknesses (mm).
SUN_ROD_R = 2.0
TUBE_WALL = 0.8
TUBE_GAP = 0.25
DEAD_ARBOR_R = 1.5      # M and N
PIPE_R = 2.3            # outer radius of a loose pipe riding M or N
L_ARBOR_R = 2.5
HUB_WEB = 0.6           # metal between a bore and a tooth root
CLEARANCE = 1.0         # air between a tooth tip and anything it must miss

# Order of the tubes at C from the inside out. Inner tubes reach higher (their
# arms are higher) and lower (their wheels are lower).
TUBES = ("mercury", "venus", "moon", "emb", "mars", "jupiter", "saturn", "uranus", "neptune")

# Mean motions (degrees per Julian century, fixed J2000 frame).
# Planets: Standish Table 2a. Moon: Meeus (1998) eq. 47.1 mean longitude rate,
# 481267.88123421 deg/cy of date, less general precession in longitude,
# 5028.796195 arcsec/cy (IAU 2006), giving the sidereal rate.
PRECESSION_DEG_CY = 5028.796195 / 3600.0
RATE = {b: eph.TABLE_2A[b][1][3] for b in eph.BODIES}
RATE["moon"] = 481267.88123421 - PRECESSION_DEG_CY


def tube_outer_r(i: int) -> float:
    return SUN_ROD_R + TUBE_GAP + (i + 1) * (TUBE_WALL + TUBE_GAP)


def tooth_sum(pair: str, m: float) -> int | None:
    s = 2.0 * SPACING[pair] / m
    return round(s) if abs(s - round(s)) < 1e-9 else None


def root_r(m: float, z: int) -> float:
    return m * (z / 2.0 - 1.25)


def tip_r(m: float, z: int) -> float:
    return m * (z / 2.0 + 1.0)


def pitch_r(m: float, z: int) -> float:
    return m * z / 2.0


@dataclass(frozen=True)
class Mesh:
    """One meshing pair. `drv` sits on axis `src`, `drn` on axis `dst`."""
    src: str
    dst: str
    m: float
    drv: int
    drn: int

    @property
    def ratio(self) -> Fraction:
        return Fraction(self.drv, self.drn)


def path_axes(n: int) -> list[tuple[str, str]]:
    """Axis pairs for an n-mesh train L -> M -> N -> (M -> N ->)* C."""
    hops = [("L", "M"), ("M", "N")]
    while len(hops) < n - 1:
        hops += [("N", "M"), ("M", "N")]
    hops = hops[: n - 1] + [("N", "C")]
    return hops


def pair_key(a: str, b: str) -> str:
    return "".join(sorted((a, b), key="LMNC".index))


def mesh_options(src: str, dst: str, col_r: float, tube_r: float) -> list[tuple[float, Mesh]]:
    """Every legal single mesh between two axes, as (ratio, Mesh), sorted by ratio."""
    key = pair_key(src, dst)
    # Pinions on L and on the pipes are cut on the arbor itself, as clockmakers
    # cut pinion leaves on the arbor; their roots only have to clear the bore.
    bore = {"L": L_ARBOR_R, "M": PIPE_R, "N": PIPE_R, "C": tube_r + HUB_WEB}
    out = []
    for m in MODULES:
        S = tooth_sum(key, m)
        if S is None:
            continue
        for drv in range(TMIN, S - TMIN + 1):
            drn = S - drv
            ok = True
            for axis, z in ((src, drv), (dst, drn)):
                if root_r(m, z) < bore[axis]:
                    ok = False
                # A wheel on N that is not meshing with C must clear the column.
                if axis == "N" and key != "NC" and tip_r(m, z) > SPACING["NC"] - col_r - CLEARANCE:
                    ok = False
                # Wheels on M must clear the L arbor, and wheels on N the M arbor, etc.:
                # a tip must stay off the neighbouring axis it does not mesh with.
            if ok:
                out.append((drv / drn, Mesh(src, dst, m, drv, drn)))
    out.sort(key=lambda t: t[0])
    return out


def drift_deg_per_century(ratio, body: str) -> float:
    """Mean-motion error of the arm, degrees per century, if L turns at Earth's rate."""
    return (float(ratio) - RATE[body] / RATE["emb"]) * RATE["emb"]


def _arrays(opts):
    x = np.array([o[0] for o in opts])
    t = np.array([o[1].drv + o[1].drn for o in opts], dtype=np.int64)
    return x, t


def search_train(body: str, n: int, col_r: float, tube_r: float):
    """Fewest-teeth n-mesh train for `body` within MAX_DRIFT, or None.

    n = 3: exhaustive (every head of two meshes against every last mesh).
    n = 5: meet in the middle. Heads are meshes 1-2 crossed with mesh 3, tails
    are meshes 4-5 sorted by ratio; for each head the tails inside the drift
    window are scanned. Exhaustive too, within the window.
    """
    target = RATE[body] / RATE["emb"]
    tol = MAX_DRIFT / RATE["emb"]
    hops = path_axes(n)
    opts = [mesh_options(s, d, col_r, tube_r) for s, d in hops]
    if any(not o for o in opts):
        return None
    arr = [_arrays(o) for o in opts]
    k = 2 if n == 3 else 3                 # meshes in the head
    # head products
    hx, ht = arr[0][0], arr[0][1]
    hidx = np.arange(len(hx))[:, None]
    idx = [np.arange(len(hx))]
    for j in range(1, k):
        x, t = arr[j]
        hx = (hx[:, None] * x[None, :]).ravel()
        ht = (ht[:, None] + t[None, :]).ravel()
        idx = [np.repeat(i, len(x)) for i in idx] + [np.tile(np.arange(len(x)), len(idx[0]))]
    # tail products
    tx, tt = arr[k]
    tidx = [np.arange(len(tx))]
    for j in range(k + 1, n):
        x, t = arr[j]
        tx = (tx[:, None] * x[None, :]).ravel()
        tt = (tt[:, None] + t[None, :]).ravel()
        tidx = [np.repeat(i, len(x)) for i in tidx] + [np.tile(np.arange(len(x)), len(tidx[0]))]
    order = np.argsort(tx)
    tx, tt = tx[order], tt[order]
    tidx = [i[order] for i in tidx]
    # window of acceptable tails for each head: |hx*tx - target| <= tol
    lo = np.searchsorted(tx, (target - tol) / hx, side="left")
    hi = np.searchsorted(tx, (target + tol) / hx, side="right")
    has = hi > lo
    if not has.any():
        return None
    best = None
    # Min teeth inside each window: scan heads with a window, cheapest heads first.
    cand = np.nonzero(has)[0]
    cand = cand[np.argsort(ht[cand])]
    # Sparse table would be faster; windows are small enough to scan directly.
    for h in cand:
        if best is not None and ht[h] + tt.min() >= best[0]:
            break
        w = slice(lo[h], hi[h])
        j = lo[h] + int(np.argmin(tt[w]))
        teeth = int(ht[h] + tt[j])
        if best is None or teeth < best[0]:
            best = (teeth, h, j)
    teeth, h, j = best
    meshes = tuple(opts[m][int(idx[m][h])][1] for m in range(k)) + \
        tuple(opts[k + m][int(tidx[m][j])][1] for m in range(n - k))
    r = Fraction(1)
    for mm in meshes:
        r *= mm.ratio
    return teeth, abs(float(r) - target), meshes, r


# ---------------------------------------------------------------- the machine

FACE = 3.0              # wheel thickness (mm), 3 mm sheet
LEVEL_PITCH = 4.2       # vertical spacing of mesh levels
BASE_TOP = 6.0          # top face of the base plate
ARM_GAP = 11.0          # vertical spacing of the arms above the top plate

# Arm lengths: the orrery's radii, compressed (mm). Angles are what the
# machine computes; distances are only chosen to read well.
ORBIT_R = {"mercury": 70.0, "venus": 100.0, "emb": 135.0, "mars": 170.0,
           "jupiter": 215.0, "saturn": 255.0, "uranus": 288.0, "neptune": 318.0}
MOON_R = 22.0

# The Moon's tube ends just above the Earth arm. A wheel on it drives, through
# three idlers riding the arm, an equal wheel at the Earth: equal wheels and an
# even number of meshes make a 1:1 parallel-motion train, so the Moon's arbor at
# the Earth turns exactly as the Moon's tube does.
MOON_TRANSFER = {"m": 1.0, "end": 21, "idler": 38, "idlers": 3}

J2000_MEAN_LONGITUDE = {b: eph.TABLE_2A[b][0][3] % 360.0 for b in eph.BODIES}
# Meeus eq. 47.1 at J2000 is 218.3164477 deg (equinox of date = J2000 there).
J2000_MEAN_LONGITUDE["moon"] = 218.3164477


def continued_fraction(x: float, n: int = 8) -> list[Fraction]:
    out, a = [], []
    y = x
    for _ in range(n):
        q = math.floor(y)
        a.append(q)
        h0, h1, k0, k1 = 1, a[0], 0, 1
        for t in a[1:]:
            h0, h1 = h1, t * h1 + h0
            k0, k1 = k1, t * k1 + k0
        out.append(Fraction(h1, k1))
        if y - q < 1e-12:
            break
        y = 1.0 / (y - q)
    return out


def build() -> dict:
    trains = []
    level = 0
    for i, body in enumerate(TUBES):
        col = tube_outer_r(i)
        for n in (3, 5, 7):
            res = search_train(body, n, col, col)
            if res:
                break
        else:
            raise RuntimeError(f"no train for {body}")
        teeth, err, meshes, ratio = res
        rows = []
        for mm in meshes:
            rows.append({"src": mm.src, "dst": mm.dst, "m": mm.m, "drv": mm.drv,
                         "drn": mm.drn, "level": level})
            level += 1
        drift = drift_deg_per_century(ratio, body)
        trains.append({
            "body": body, "tube": i, "meshes": rows,
            "ratio": [ratio.numerator, ratio.denominator],
            "target": RATE[body] / RATE["emb"],
            "drift_deg_per_century": drift,
            "years_per_degree": (100.0 / abs(drift)) if drift else None,
            "teeth": teeth,
        })
    n_levels = level
    z_of = lambda lv: BASE_TOP + 2.0 + lv * LEVEL_PITCH
    top_plate = z_of(n_levels - 1) + FACE + 3.0
    # Arms: outermost tube (Neptune) lowest.
    arm_z = {}
    z = top_plate + 3.0 + ARM_GAP
    for b in reversed(TUBES):
        if b == "moon":
            continue
        arm_z[b] = z
        z += ARM_GAP + (6.0 if b == "emb" else 0.0)
    moon_gear_z = arm_z["emb"] + 3.5
    planet_plane = z + 24.0
    tubes = []
    for i, b in enumerate(TUBES):
        train = trains[i]
        bottom = z_of(train["meshes"][-1]["level"])
        top = moon_gear_z + FACE if b == "moon" else arm_z[b] + 3.0
        tubes.append({"body": b, "r_out": tube_outer_r(i), "r_in": tube_outer_r(i) - TUBE_WALL,
                      "z0": bottom, "z1": top})
    mt = MOON_TRANSFER
    transfer_len = mt["m"] * (mt["end"] + mt["idlers"] * mt["idler"])
    assert abs(transfer_len - ORBIT_R["emb"]) < 1e-9, transfer_len
    moon_target = RATE["moon"] / RATE["emb"]
    return {
        "generated_by": "src/design.py",
        "units": "millimetres, degrees; one crank turn = one sidereal year of the Earth-Moon barycentre",
        "sidereal_year_days": 360.0 * 36525.0 / RATE["emb"],
        "epoch_jd": eph.J2000,
        "rules": {"spacing_mm": SPACING, "modules": MODULES, "pressure_angle": PRESSURE_ANGLE,
                  "min_teeth": TMIN, "max_drift_deg_per_century": MAX_DRIFT,
                  "face_mm": FACE, "level_pitch_mm": LEVEL_PITCH},
        "axes": {"C": [0.0, 0.0], "N": [SPACING["NC"], 0.0],
                 "M": [SPACING["NC"] + SPACING["MN"], 0.0],
                 "L": [SPACING["NC"] + SPACING["MN"] + SPACING["LM"], 0.0]},
        "radii": {"sun_rod": SUN_ROD_R, "dead_arbor": DEAD_ARBOR_R, "pipe": PIPE_R, "l_arbor": L_ARBOR_R},
        "levels": {"count": n_levels, "z": [z_of(k) for k in range(n_levels)]},
        "base_top": BASE_TOP, "top_plate_z": top_plate,
        "trains": trains, "tubes": tubes,
        "arms": {b: {"z": arm_z[b], "r": ORBIT_R[b]} for b in arm_z},
        "moon": {"gear_z": moon_gear_z, "arm_r": MOON_R, **MOON_TRANSFER},
        "planet_plane_z": planet_plane,
        "j2000_mean_longitude": J2000_MEAN_LONGITUDE,
        "rate_deg_per_century": RATE,
        "history": {
            "moon_sidereal_months_per_year": moon_target,
            "convergents": [[f.numerator, f.denominator] for f in continued_fraction(moon_target)],
            "antikythera_254_19_drift_deg_per_century": drift_deg_per_century(Fraction(254, 19), "moon"),
        },
    }


def ledger(d: dict) -> str:
    lines = []
    for t in d["trains"]:
        ms = "  ".join(f"{m['src']}{m['dst']} {m['drv']}:{m['drn']} m{m['m']}" for m in t["meshes"])
        ypd = t["years_per_degree"]
        lines.append(f"{t['body']:8s} {len(t['meshes'])} meshes  ratio {t['ratio'][0]}/{t['ratio'][1]}  "
                     f"drift {t['drift_deg_per_century']:+.5f} deg/cy  "
                     f"({'exact' if ypd is None else f'1 deg per {ypd:,.0f} yr'})  |  {ms}")
    return "\n".join(lines)


if __name__ == "__main__":
    d = build()
    OUT.write_text(json.dumps(d, indent=1) + "\n")
    print(ledger(d))
    print(f"levels: {d['levels']['count']}, top plate at {d['top_plate_z']:.1f} mm, "
          f"planet plane at {d['planet_plane_z']:.1f} mm")
    h = d["history"]
    print("moon convergents:", ", ".join(f"{a}/{b}" for a, b in h["convergents"]))
    print(f"254/19 would drift {h['antikythera_254_19_drift_deg_per_century']:+.2f} deg/cy")
