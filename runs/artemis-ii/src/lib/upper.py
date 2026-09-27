"""Upper stack: LVSA, ICPS (with RL10B-2) and Orion Stage Adapter.

ICPS internal layout follows the Delta Cryogenic Second Stage arrangement
(5.1 m LH2 tank forward, 3.2 m LOX tank aft, RL10B-2 below). The RL10B-2
nozzle extension is shown stowed (inferred: the 45 ft ICPS length only fits
the 322 ft stack with the extension stowed on the pad).
"""
import math

import bmesh
import bpy
from mathutils import Matrix, Vector

from . import common as C
from . import config as K
from .srb import _decal_panel


def build(coll, parent, P, flag_mat):
    parts = {}
    # --------------------------------------------------------------- LVSA
    bm = bmesh.new()
    H, R0, R1 = K.LVSA_H, K.CORE_R, K.LVSA_R1
    rz = lambda z: R0 + (R1 - R0) * z / H
    outer = [(R0, 0.0), (rz(H * 0.5), H * 0.5), (R1, H)]
    inner = [(R1 - 0.05, H), (rz(H * 0.5) - 0.05, H * 0.5), (R0 - 0.05, 0.0)]
    C.lathe(bm, outer + inner + [outer[0]], segs=192, mats=[0, 0, 2, 3, 3, 2])
    C.lathe(bm, [(R0 - 0.02, 0.0), (R0 + 0.05, 0.0), (R0 + 0.05, 0.22), (rz(0.3) - 0.01, 0.3)], segs=192, mat=1)
    C.lathe(bm, [(rz(H - 0.55) - 0.01, H - 0.55), (rz(H - 0.5) + 0.05, H - 0.5), (R1 + 0.06, H - 0.12),
                 (R1 + 0.06, H), (R1 - 0.02, H)], segs=192, mat=1)            # frangible separation joint
    for k in range(16):                                                        # panel seams / splice straps
        a = C.TAU * (k + 0.5) / 16
        pts = []
        for zz in (0.3, H - 0.55):
            r = rz(zz) + 0.012
            pts.append((r * math.cos(a), r * math.sin(a), zz))
        C.sweep(bm, pts, section=[(-0.004, -0.06), (0.012, -0.06), (0.012, 0.06), (-0.004, 0.06)], mat=1,
                twist_up=(math.cos(a), math.sin(a), 0))
    lvsa = C.mesh_object("LVSA", bm, coll, mats=[P["white_warm"], P["alu"], P["steel_dark"], P["dark"]],
                         parent=parent, loc=(0, 0, K.Z_CORE_TOP))
    parts["LVSA"] = lvsa

    # --------------------------------------------------------------- ICPS
    icps = C.empty("ICPS", coll, parent=parent, loc=(0, 0, K.Z_ICPS_BOTTOM), size=2.0, kind="ARROWS")
    parts["ICPS"] = icps
    Ri = K.ICPS_R
    L = K.ICPS_LEN_STOWED
    z_fs0 = L - 1.0            # forward skirt 10.6 .. 11.6
    z_lh2_0 = 6.6
    # LH2 tank + forward skirt (single object: stage structure)
    bm = bmesh.new()
    prof = [(0.0, z_lh2_0 - 1.3)]
    for k in range(1, 13):
        a = (math.pi / 2) * k / 12
        prof.append((Ri * math.sin(a), z_lh2_0 - 1.3 * math.cos(a)))
    prof += [(Ri, z_fs0), (Ri, L), (Ri - 0.06, L), (Ri - 0.06, z_fs0 + 0.2), (0.0, z_fs0 + 0.55)]
    mats = [0] * 12 + [0, 1, 2, 3, 3]
    C.lathe(bm, prof, segs=160, mats=mats)
    C.ring_band(bm, Ri, z_fs0 - 0.06, z_fs0 + 0.06, t=0.02, segs=160, mat=2)
    C.ring_band(bm, Ri, L - 0.12, L, t=0.03, segs=160, mat=2)
    for k in range(3):
        z = z_lh2_0 + 1.35 * k + 0.6
        C.ring_band(bm, Ri, z - 0.03, z + 0.03, t=0.005, segs=160, mat=1)
    _decal_panel(bm, Ri + 0.002, math.pi, 2.6, 9.75, 1.37, 4, segs=16)     # US flag, front (-X)
    # umbilical plate (+X) and vent fairing
    C.box(bm, (0.12, 0.8, 0.9), center=(Ri + 0.05, 0, 9.8), mat=2)
    C.box(bm, (0.2, 0.35, 1.3), center=(Ri * math.cos(2.4) * 1.02, Ri * math.sin(2.4) * 1.02, 10.1), mat=1)
    st = C.mesh_object("ICPS_LH2Tank_FwdSkirt", bm, coll, mats=[P["white_warm"], P["white"], P["steel_dark"], P["dark"], flag_mat],
                       parent=icps)
    parts["ICPS_LH2"] = st

    # LOX tank, truss, bottles
    bm = bmesh.new()
    zc, rl, hl = 3.55, 1.60, 1.10
    prof = [(0.0, zc - hl)]
    for k in range(1, 24):
        a = math.pi * k / 24
        prof.append((rl * math.sin(a), zc - hl * math.cos(a)))
    prof.append((0.0, zc + hl))
    C.lathe(bm, prof, segs=96, mat=0)
    C.ring_band(bm, rl, zc - 0.07, zc + 0.07, t=0.03, segs=96, mat=2)
    for k in range(8):                                                     # conical truss
        a0 = C.TAU * k / 8
        for da in (-0.28, 0.28):
            p0 = (rl * math.cos(a0), rl * math.sin(a0), zc)
            p1 = ((Ri - 0.25) * math.cos(a0 + da), (Ri - 0.25) * math.sin(a0 + da), z_lh2_0 - 0.35)
            C.sweep(bm, [p0, p1], radius=0.035, segs=8, mat=2)
    C.torus(bm, Ri - 0.25, 0.06, z_lh2_0 - 0.35, segs=96, rsegs=8, mat=2)
    for k, (r_s, mat) in enumerate(((0.33, 3), (0.33, 3), (0.28, 1), (0.28, 1))):   # He / N2H4 bottles
        a = math.radians(30 + 90 * k)
        C.lathe(bm, [(0.0, -r_s)] + [(r_s * math.sin(math.pi * j / 12), -r_s * math.cos(math.pi * j / 12)) for j in range(1, 12)] + [(0.0, r_s)],
                segs=24, mat=mat, xform=Matrix.Translation((2.05 * math.cos(a), 2.05 * math.sin(a), 5.2)))
    lox = C.mesh_object("ICPS_LOXTank_Truss", bm, coll, mats=[P["mli"], P["white"], P["steel_dark"], P["carbon"]], parent=icps)
    parts["ICPS_LOX"] = lox

    # RL10B-2 with stowed carbon-carbon nozzle extension
    bm = bmesh.new()
    zg = 2.40                                           # gimbal
    zj = 1.55                                           # fixed nozzle joint
    fixed = lambda z: 0.13 + (0.50 - 0.13) * ((zj - z) / (zj - 0.12)) ** 0.75
    zs = [zj - (zj - 0.12) * k / 24 for k in range(25)]
    outer = [(fixed(z) + 0.02, z) for z in reversed(zs)]
    inner = [(fixed(z), z) for z in zs]
    C.lathe(bm, outer + inner + [outer[0]], segs=96, mats=[0] * 24 + [2] + [1] * 24 + [2])
    # stowed extension: large carbon-carbon cone nested around the fixed nozzle
    ext = [(1.075, 0.0), (0.93, 0.55), (0.72, 1.35), (0.66, 1.62)]
    ext_in = [(r - 0.018, z) for r, z in reversed(ext)]
    C.lathe(bm, ext + ext_in + [ext[0]], segs=128, mats=[3, 3, 3, 2, 3, 3, 3, 2])
    C.torus(bm, 1.08, 0.03, 0.02, segs=128, rsegs=6, mat=2)
    for k in range(3):                                   # extension deployment ball screws
        a = C.TAU * k / 3 + 0.4
        C.sweep(bm, [(0.95 * math.cos(a), 0.95 * math.sin(a), 0.15), (0.58 * math.cos(a), 0.58 * math.sin(a), 2.0)],
                radius=0.03, segs=8, mat=2)
    # chamber, turbopump, gimbal
    C.lathe(bm, [(0.0, zj), (0.20, zj), (0.19, zj + 0.25), (0.23, zj + 0.55), (0.18, zg - 0.08), (0.0, zg)], segs=48, mat=4)
    C.lathe(bm, [(0.0, 1.75), (0.15, 1.75), (0.15, 2.25), (0.0, 2.25)], segs=24, mat=4,
            xform=Matrix.Translation((0.38, 0.05, 0.0)))
    C.sweep(bm, C.bend_path([(0.38, 0.05, 2.25), (0.3, 0.1, 2.5), (0.0, 0.25, 2.55), (-0.1, 0.2, 2.3)], 0.12), radius=0.05, segs=10, mat=2)
    rl10 = C.mesh_object("ICPS_RL10B2", bm, coll, mats=[P["inconel"], P["nozzle_in"], P["steel_dark"], P["cc_ext"], P["steel"]], parent=icps)
    parts["ICPS_RL10"] = rl10

    # --------------------------------------------------------------- OSA
    bm = bmesh.new()
    Ro, Ho = K.OSA_R, K.OSA_H
    C.lathe(bm, [(Ro - 0.05, 0.0), (Ro, 0.0), (Ro, Ho), (Ro - 0.05, Ho), (Ro - 0.05, 0.0)], segs=192, mats=[1, 0, 1, 2])
    for z0, z1 in ((0.0, 0.12), (Ho - 0.12, Ho)):
        C.ring_band(bm, Ro, z0, z1, t=0.03, segs=192, mat=1)
    for k in range(24):                                                   # external stiffeners (subtle)
        a = C.TAU * k / 24
        C.box(bm, (0.02, 0.04, Ho - 0.24), center=(0, 0, Ho / 2), mat=0,
              xform=C.rot_z(a) @ Matrix.Translation((Ro + 0.008, 0, 0)))
    # diaphragm (dome inside, seen from above when Orion is lifted)
    C.lathe(bm, [(Ro - 0.05, Ho * 0.35)] + [((Ro - 0.05) * math.cos(math.pi / 2 * k / 10), Ho * 0.35 + 0.6 * math.sin(math.pi / 2 * k / 10)) for k in range(1, 11)],
            segs=96, mat=3)
    osa = C.mesh_object("OSA", bm, coll, mats=[P["white_warm"], P["alu"], P["dark"], P["mli_white"]],
                        parent=parent, loc=(0, 0, K.Z_ICPS_TOP))
    parts["OSA"] = osa
    return parts
