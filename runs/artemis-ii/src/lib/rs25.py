"""RS-25 engine (engine frame: origin at gimbal, engine hangs along -Z).

Envelope from NASA fact sheets: 4.27 m long, nozzle 3.07 m long, 0.262 m
throat, 2.304 m exit. The nozzle contour is a Rao-style bell approximated with
a quadratic Bezier (35 deg initial, 5 deg exit). Powerhead, pumps and ducts
are simplified shapes arranged after the familiar SSME layout (disclosed).
"""
import math

import bmesh
import bpy
from mathutils import Matrix, Vector

from . import common as C
from . import config as K

Z_JOINT = -1.20                    # nozzle/MCC joint
Z_NEXIT = -K.RS25_LEN              # -4.27
WALL = 0.035


def bell_r(z):
    """Inner radius of the nozzle at engine-frame z (Z_JOINT >= z >= Z_NEXIT)."""
    L = K.RS25_NOZ_LEN
    r0, re = K.RS25_JOINT_R, K.RS25_EXIT_R
    t35, t5 = math.tan(math.radians(35)), math.tan(math.radians(5))
    xs = (re - r0 - t5 * L) / (t35 - t5)
    rs = r0 + t35 * xs
    x = min(L, max(0.0, Z_JOINT - z))
    # solve bezier parameter for axial position x (monotone)
    lo, hi = 0.0, 1.0
    for _ in range(40):
        t = (lo + hi) / 2
        xt = 2 * (1 - t) * t * xs + t * t * L
        if xt < x:
            lo = t
        else:
            hi = t
    t = (lo + hi) / 2
    return (1 - t) ** 2 * r0 + 2 * (1 - t) * t * rs + t * t * re


def outer_r(z):
    return bell_r(z) + WALL


def _nozzle_z_samples(n=90):
    # denser near the joint where curvature is high
    return [Z_JOINT - K.RS25_NOZ_LEN * (k / n) ** 1.35 for k in range(n + 1)]


def build_meshes(P):
    """Create shared RS-25 meshes. Returns dict name -> (mesh, [materials])."""
    meshes = {}

    # --- nozzle ------------------------------------------------------------
    bm = bmesh.new()
    zs = _nozzle_z_samples()
    outer = [(outer_r(z), z) for z in reversed(zs)]          # exit -> joint (upward)
    inner = [(bell_r(z), z) for z in zs]                      # joint -> exit (downward)
    prof = outer + inner + [outer[0]]
    mats = [0] * (len(outer) - 1) + [2] + [1] * (len(inner) - 1) + [2]
    C.lathe(bm, prof, segs=144, mats=mats)
    # hatbands (stiffener rings)
    for s in (0.10, 0.22, 0.34, 0.46, 0.58, 0.70, 0.82, 0.93):
        zc = Z_JOINT - K.RS25_NOZ_LEN * s
        z0, z1 = zc - 0.025, zc + 0.025
        C.lathe(bm, [(outer_r(z0) - 0.004, z0), (outer_r(z0) + 0.016, z0),
                     (outer_r(z1) + 0.016, z1), (outer_r(z1) - 0.004, z1)], segs=144, mat=2)
    # aft (exit) manifold and forward manifold
    C.torus(bm, outer_r(Z_NEXIT + 0.06) + 0.035, 0.05, Z_NEXIT + 0.07, segs=144, rsegs=10, mat=2)
    C.torus(bm, outer_r(Z_JOINT - 0.12) + 0.05, 0.075, Z_JOINT - 0.12, segs=96, rsegs=10, mat=2)
    # three coolant feed ducts running down the nozzle to the aft manifold
    for a in (math.radians(40), math.radians(160), math.radians(280)):
        path = []
        for z in [Z_JOINT - 0.15 - (K.RS25_NOZ_LEN - 0.3) * k / 24 for k in range(25)]:
            r = outer_r(z) + 0.07
            path.append((r * math.cos(a), r * math.sin(a), z))
        zb = Z_NEXIT + 0.07
        rb = outer_r(zb) + 0.035
        path.append((rb * math.cos(a), rb * math.sin(a), zb))
        C.sweep(bm, path, radius=0.042, segs=12, mat=3)
        # brackets tying duct to the hatbands
        for s in (0.34, 0.58, 0.82):
            zc = Z_JOINT - K.RS25_NOZ_LEN * s
            r = outer_r(zc)
            C.box(bm, (0.08, 0.05, 0.05), center=(0, 0, 0), mat=2,
                  xform=Matrix.Translation(((r + 0.04) * math.cos(a), (r + 0.04) * math.sin(a), zc)) @ C.rot_z(a))
    meshes["Nozzle"] = (bm, [P["nozzle_out"], P["nozzle_in"], P["steel_dark"], P["inconel"]])

    # --- steerhorn: big duct from the main fuel valve down to the nozzle -----
    bm = bmesh.new()
    a = math.radians(-18)
    pts = [(0.62, -0.30, -0.98), (0.78, -0.32, -1.18)]
    for k in range(8):
        z = -1.40 - 0.12 * k
        r = outer_r(z) + 0.16 - 0.012 * k
        pts.append((r * math.cos(a), r * math.sin(a), z))
    pts.append(((outer_r(-2.45) + 0.05) * math.cos(a), (outer_r(-2.45) + 0.05) * math.sin(a), -2.45))
    C.sweep(bm, C.bend_path(pts, 0.15), radius=0.085, segs=16, mat=0)
    C.torus(bm, 0.095, 0.02, 0, segs=16, rsegs=6, mat=1,
            xform=Matrix.Translation((0.70, -0.31, -1.08)) @ Matrix.Rotation(math.radians(70), 4, "Y"))
    meshes["Steerhorn"] = (bm, [P["inconel"], P["steel_dark"]])

    # --- main combustion chamber -------------------------------------------
    bm = bmesh.new()
    prof = [(0.0, Z_JOINT - 0.02), (0.34, Z_JOINT - 0.02), (0.345, Z_JOINT + 0.05), (0.27, Z_JOINT + 0.10),
            (0.235, Z_JOINT + 0.16), (0.25, -1.00), (0.31, -0.97), (0.33, -0.93), (0.0, -0.93)]
    C.lathe(bm, prof, segs=64, mat=0)
    C.torus(bm, 0.345, 0.03, Z_JOINT + 0.01, segs=64, rsegs=8, mat=1)
    for k in range(24):  # flange bolts
        ang = C.TAU * k / 24
        C.cylinder(bm, 0.012, Z_JOINT + 0.03, Z_JOINT + 0.06, segs=6, mat=1,
                   xform=Matrix.Translation((0.37 * math.cos(ang), 0.37 * math.sin(ang), 0)))
    meshes["MCC"] = (bm, [P["inconel"], P["steel_dark"]])

    # --- powerhead (hot-gas manifold / injector), gimbal, preburners --------
    bm = bmesh.new()
    prof = [(0.0, -1.0), (0.30, -1.02), (0.44, -0.96), (0.48, -0.86), (0.48, -0.63), (0.43, -0.55),
            (0.31, -0.47), (0.21, -0.32), (0.17, -0.20), (0.0, -0.20)]
    C.lathe(bm, prof, segs=72, mat=0)
    for zb in (-0.62, -0.86):
        C.torus(bm, 0.485, 0.018, zb, segs=72, rsegs=6, mat=1)
    # preburners (fuel +x, oxidizer -x)
    for sx, rad in ((0.52, 0.20), (-0.52, 0.18)):
        C.lathe(bm, [(0.0, -1.0), (rad, -1.0), (rad + 0.01, -0.90), (rad + 0.01, -0.58), (rad * 0.75, -0.46), (0.0, -0.41)],
                segs=40, mat=0, xform=Matrix.Translation((sx, 0.0, 0.0)))
        C.torus(bm, rad + 0.01, 0.02, -0.90, segs=40, rsegs=6, mat=1, xform=Matrix.Translation((sx, 0, 0)))
    # gimbal bearing block and thrust cone
    C.box(bm, (0.34, 0.34, 0.18), center=(0, 0, -0.10), mat=1)
    C.cylinder(bm, 0.12, -0.02, 0.05, segs=24, mat=1)
    meshes["Powerhead"] = (bm, [P["steel"], P["steel_dark"]])

    # --- high-pressure turbopumps (wrapped in thermal blankets) -------------
    def pump(bm, x, y, z0, z1, r, tilt, blanket_mat=0, metal_mat=1):
        xf = Matrix.Translation((x, y, 0)) @ Matrix.Rotation(tilt, 4, "Y")
        span = z0 - z1
        prof = [(0.0, z1), (r * 0.8, z1), (r, z1 + 0.06)]
        for k in range(1, 4):
            zk = z1 + span * k / 4
            prof += [(r, zk - 0.05), (r + 0.025, zk - 0.03), (r + 0.025, zk + 0.03), (r, zk + 0.05)]
        prof += [(r, z0 - 0.05), (r * 1.1, z0), (0.0, z0 + 0.02)]
        mats = []
        for i in range(len(prof) - 1):
            ra, rb = prof[i][0], prof[i + 1][0]
            mats.append(metal_mat if (ra > r + 0.01 or rb > r + 0.01) else blanket_mat)
        C.lathe(bm, prof, segs=40, mats=mats, xform=xf)

    bm = bmesh.new()
    pump(bm, 0.60, -0.08, -0.98, -1.98, 0.22, math.radians(-5))
    meshes["HPFTP"] = (bm, [P["mli_white"], P["steel_dark"]])
    bm = bmesh.new()
    pump(bm, -0.60, -0.06, -0.98, -1.86, 0.21, math.radians(5))
    meshes["HPOTP"] = (bm, [P["mli_white"], P["steel_dark"]])

    # --- low-pressure pumps, ducts, controller ------------------------------
    bm = bmesh.new()
    for x, r, h in ((0.46, 0.17, 0.46), (-0.46, 0.19, 0.50)):
        C.lathe(bm, [(0.0, -0.55), (r, -0.55), (r + 0.02, -0.50), (r + 0.02, -0.55 + h - 0.05), (r, -0.55 + h), (0.0, -0.55 + h)],
                segs=32, mat=0, xform=Matrix.Translation((x, 0.50, 0)))
    ducts = [
        ([(0.46, 0.50, -0.55), (0.52, 0.42, -0.80), (0.70, 0.20, -1.10), (0.82, 0.02, -1.55), (0.72, -0.05, -1.92)], 0.075),
        ([(-0.46, 0.50, -0.55), (-0.54, 0.40, -0.82), (-0.72, 0.18, -1.08), (-0.80, 0.02, -1.45), (-0.70, -0.04, -1.80)], 0.09),
        ([(-0.60, -0.28, -1.30), (-0.52, -0.46, -1.10), (-0.30, -0.52, -0.80), (-0.12, -0.44, -0.55)], 0.07),
        ([(0.60, -0.30, -1.35), (0.40, -0.48, -1.15), (0.18, -0.50, -0.92)], 0.055),
        ([(0.2, 0.46, -0.30), (0.0, 0.52, -0.55), (-0.2, 0.46, -0.30)], 0.045),
    ]
    for path, r in ducts:
        C.sweep(bm, C.bend_path(path, 0.18), radius=r, segs=14, mat=1)
    # partial fuel ring around the MCC neck
    ring = C.arc_path((0, 0), 0.44, math.radians(-150), math.radians(150), n=24, z=-1.12)
    C.sweep(bm, ring, radius=0.035, segs=10, mat=1)
    meshes["Pumps_Ducts"] = (bm, [P["steel"], P["inconel"]])

    bm = bmesh.new()
    C.box(bm, (0.52, 0.26, 0.40), center=(0.0, -0.64, -0.72), mat=0)
    for k in range(6):
        C.box(bm, (0.50, 0.03, 0.02), center=(0.0, -0.78, -0.58 - 0.055 * k), mat=0)
    C.box(bm, (0.30, 0.08, 0.10), center=(0.0, -0.52, -0.95), mat=1)
    meshes["Controller"] = (bm, [P["steel_dark"], P["gold"]])
    return meshes


def make_engine(num, meshes_bm, coll, parent, P, shared):
    """Instantiate engine `num` (1..4) using shared mesh data."""
    root = C.empty(f"RS25_E{num}", coll, parent=parent, size=0.6, kind="SINGLE_ARROW")
    for part, (bm, mats) in meshes_bm.items():
        key = f"RS25_{part}"
        if key not in shared:
            me = bpy.data.meshes.new(key)
            bm.normal_update()
            bm.to_mesh(me)
            for m in mats:
                me.materials.append(m)
            me.shade_smooth()
            me.set_sharp_from_angle(angle=math.radians(35))
            shared[key] = me
        ob = bpy.data.objects.new(f"RS25_E{num}_{part}", shared[key])
        C.link(ob, coll)
        C.set_parent(ob, root)
    return root
