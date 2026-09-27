"""Orion spacecraft stack (origin at the spacecraft adapter base).

Local z = vehicle z - Z_OSA_TOP. Crew module 5.03 m x 3.35 m with a 0.55 m
deep spherical heat shield (R = 6.05 m, R/D ~ 1.2, Apollo-derived ratio,
disclosed). ESM internals are not modeled; only the exterior envelope.
"""
import math

import bmesh
import bpy
from mathutils import Matrix, Vector

from . import common as C
from . import config as K
from .srb import _decal_panel

Z0 = K.Z_OSA_TOP
L_ESM = K.Z_ESM - Z0          # 1.90
L_CMA = K.Z_CMA - Z0          # 5.90
L_CM = K.Z_CM - Z0            # 6.45 (heat shield apex)
L_SAJ_TOP = K.SAJ_TOP - Z0
HS_R = 6.05


def cm_backshell_profile():
    """(r, z) of the crew module outer mold line, relative to the heat shield apex."""
    Rb = K.CM_R
    prof = [(Rb + 0.015, K.HS_DEPTH + 0.02), (Rb + 0.02, K.HS_DEPTH + 0.08), (Rb, K.HS_DEPTH + 0.16)]
    z_c0, z_c1 = K.HS_DEPTH + 0.16, 3.02
    r_c1 = Rb - (z_c1 - z_c0) * math.tan(math.radians(32.5))
    for k in range(1, 9):
        t = k / 8
        prof.append((Rb + (r_c1 - Rb) * t, z_c0 + (z_c1 - z_c0) * t))
    prof += [(r_c1 - 0.08, 3.14), (r_c1 - 0.22, 3.25), (0.70, K.CM_H - 0.02), (0.62, K.CM_H), (0.0, K.CM_H)]
    return prof


def build(coll, parent, P, worm_mat, esa_mat):
    parts = {}
    root = C.empty("Orion", coll, parent=parent, loc=(0, 0, Z0), size=3.0, kind="ARROWS")
    parts["root"] = root
    white = P["white_orion"]

    # ---------------------------------------------------------------- spacecraft adapter
    bm = bmesh.new()
    R0, R1 = K.OSA_R, K.SA_R1
    C.lathe(bm, [(R0 - 0.05, 0.0), (R0, 0.0), (R1, L_ESM), (R1 - 0.05, L_ESM), (R0 - 0.05, 0.0)], segs=192, mats=[1, 0, 1, 2])
    C.ring_band(bm, R0 - 0.005, 0.0, 0.12, t=0.03, segs=192, mat=1)
    C.ring_band(bm, R1 - 0.005, L_ESM - 0.1, L_ESM, t=0.025, segs=192, mat=1)
    sa = C.mesh_object("Orion_SpacecraftAdapter", bm, coll, mats=[white, P["alu"], P["dark"]], parent=root)
    parts["SA"] = sa

    # ---------------------------------------------------------------- European Service Module
    esm = C.empty("Orion_ESM", coll, parent=root, loc=(0, 0, L_ESM), size=2.0, kind="ARROWS")
    parts["ESM"] = esm
    bm = bmesh.new()
    Re, He = K.ESM_R, K.ESM_H
    C.lathe(bm, [(0.0, 0.0), (Re - 0.1, 0.0), (Re, 0.1), (Re, He - 0.15), (Re + 0.06, He - 0.08), (Re + 0.06, He), (0.0, He)],
            segs=128, mats=[2, 1, 0, 1, 1, 1])
    for k in range(4):                                     # radiator panels between the wings
        a = math.radians(90 * k)
        C.curved_panel(bm, Re + 0.012, a - 0.36, a + 0.36, 0.35, He - 0.45, segs=12, mat=3)
    C.ring_band(bm, Re, 0.1, 0.75, t=0.018, segs=128, mat=1)   # gold MLI band over the aft deck
    # six RCS pods (4 thrusters each) on the upper ring
    for k in range(6):
        a = C.TAU * k / 6 + math.radians(15)
        xf = C.rot_z(a) @ Matrix.Translation((Re + 0.13, 0, He - 0.55))
        C.box(bm, (0.26, 0.42, 0.34), mat=4, xform=xf)
        for dy, dz, rx, ry in ((0.17, 0.0, 0, 90), (-0.17, 0.0, 0, -90), (0.0, 0.2, -90, 0), (0.0, -0.2, 90, 0)):
            C.lathe(bm, [(0.02, 0.0), (0.045, 0.0), (0.055, 0.1), (0.04, 0.1), (0.02, 0.0)], segs=10, mat=5,
                    xform=xf @ Matrix.Translation((0.06, dy, dz)) @ Matrix.Rotation(math.radians(rx), 4, "X") @ Matrix.Rotation(math.radians(ry), 4, "X"))
    # eight auxiliary thrusters (canted, around the aft end)
    for k in range(8):
        a = C.TAU * k / 8 + math.radians(22.5)
        xf = Matrix.Translation(((Re - 0.25) * math.cos(a), (Re - 0.25) * math.sin(a), 0.0)) @ C.rot_z(a) @ Matrix.Rotation(math.radians(160), 4, "Y")
        C.lathe(bm, [(0.0, -0.05), (0.07, -0.05), (0.06, 0.1), (0.14, 0.42), (0.12, 0.42), (0.05, 0.12), (0.0, 0.12)],
                segs=16, mats=[4, 4, 5, 5, 5, 5], xform=xf)
    # OMS-E main engine
    oms = [(0.0, 0.0), (0.30, 0.0), (0.26, -0.25), (0.16, -0.40), (0.24, -0.60), (0.58, -1.45), (0.55, -1.45),
           (0.21, -0.62), (0.13, -0.42), (0.0, -0.42)]
    C.lathe(bm, oms[::-1], segs=64, mats=[5, 5, 5, 5, 6, 6, 4, 4, 4])
    body = C.mesh_object("Orion_ESM_Body", bm, coll, mats=[P["mli"], P["mli_gold"], P["dark"], P["white_orion"], P["steel_dark"], P["steel"], P["inconel"]],
                         parent=esm)
    parts["ESM_Body"] = body
    # four stowed solar array wings (folded panel stacks against the body)
    for k in range(4):
        a = math.radians(45 + 90 * k)
        bm = bmesh.new()
        C.box(bm, (0.30, 1.75, 3.15), center=(0, 0, 0), mat=0)
        for dz in (-1.2, 0.0, 1.2):                         # hold-down / release bars
            C.box(bm, (0.06, 1.85, 0.10), center=(0.17, 0, dz), mat=1)
        C.box(bm, (0.02, 1.60, 3.0), center=(0.16, 0, 0), mat=2)
        for dy in (-0.85, 0.85):                            # panel edges show the folded stack
            C.box(bm, (0.30, 0.04, 3.1), center=(0.0, dy, 0), mat=1)
        wing = C.mesh_object(f"Orion_SolarWing_{k + 1}", bm, coll, mats=[P["white_orion"], P["steel_dark"], P["cells"]], parent=esm,
                             smooth=0)
        wing.location = ((Re + 0.17) * math.cos(a), (Re + 0.17) * math.sin(a), He * 0.5 + 0.1)
        wing.rotation_euler = (0, 0, a)
        parts[f"SolarWing_{k + 1}"] = wing

    # ---------------------------------------------------------------- SAJ panels (3)
    saj_h = L_SAJ_TOP - L_ESM
    Rs = K.SA_R1
    for k in range(3):
        bm = bmesh.new()
        a0 = C.TAU * k / 3 + math.radians(0.35) + math.radians(30)
        a1 = C.TAU * (k + 1) / 3 - math.radians(0.35) + math.radians(30)
        prof = [(Rs - 0.04, 0.0), (Rs, 0.0), (Rs, saj_h - 0.45), (Rs - 0.06, saj_h), (Rs - 0.10, saj_h), (Rs - 0.08, saj_h - 0.45), (Rs - 0.04, 0.0)]
        C.lathe(bm, prof, segs=64, a0=a0, a1=a1, mats=[1, 0, 0, 1, 2, 2])
        # panel edge lands
        for a in (a0, a1):
            xf = C.rot_z(a) @ Matrix.Translation((Rs + 0.004, 0, saj_h * 0.47))
            C.box(bm, (0.02, 0.06, saj_h * 0.92), mat=1, xform=xf)
        ob = C.mesh_object(f"Orion_SAJ_Panel_{k + 1}", bm, coll, mats=[white, P["alu"], P["dark"]], parent=root,
                           loc=(0, 0, L_ESM))
        ob["hinge_azimuth"] = (a0 + a1) / 2
        parts[f"SAJ_{k + 1}"] = ob

    # ---------------------------------------------------------------- crew module adapter
    bm = bmesh.new()
    Rc = K.CM_R + 0.005
    C.lathe(bm, [(Re, 0.0), (Rc, 0.25), (Rc, K.CMA_H), (Rc - 0.06, K.CMA_H), (Re - 0.06, 0.0), (Re, 0.0)], segs=160,
            mats=[0, 0, 1, 2, 1])
    C.ring_band(bm, Rc, K.CMA_H - 0.08, K.CMA_H, t=0.02, segs=160, mat=1)
    _decal_panel(bm, Rc + 0.001, math.pi, 1.55, 0.66, 0.44, 3, segs=12)                       # worm (front)
    _decal_panel(bm, Rc + 0.001, math.pi + math.radians(29), 0.85, 0.66, 0.40, 4, segs=8)     # esa plate
    cma = C.mesh_object("Orion_CMA", bm, coll, mats=[white, P["alu"], P["dark"], worm_mat, esa_mat], parent=root,
                        loc=(0, 0, L_CMA))
    parts["CMA"] = cma

    # ---------------------------------------------------------------- crew module
    cm = C.empty("Orion_CM", coll, parent=root, loc=(0, 0, L_CM), size=1.5, kind="ARROWS")
    parts["CM"] = cm
    bm = bmesh.new()
    prof = []
    for k in range(0, 25):
        r = K.CM_R * k / 24
        prof.append((r, HS_R - math.sqrt(HS_R ** 2 - r ** 2)))
    prof += [(K.CM_R + 0.01, K.HS_DEPTH + 0.0), (K.CM_R + 0.015, K.HS_DEPTH + 0.02)]
    mats = [0] * 24 + [1, 1]
    C.lathe(bm, prof, segs=160, mats=mats)
    for k in range(6):                                                    # compression pads at the rim
        a = C.TAU * k / 6 + math.radians(15)
        C.box(bm, (0.22, 0.30, 0.05), center=((K.CM_R - 0.25) * math.cos(a), (K.CM_R - 0.25) * math.sin(a), 0.47), mat=1,
              xform=None)
    hs = C.mesh_object("Orion_CM_HeatShield", bm, coll, mats=[P["avcoat"], P["alu"]], parent=cm)
    parts["HeatShield"] = hs

    bm = bmesh.new()
    prof = cm_backshell_profile()
    C.lathe(bm, prof, segs=160, mats=[1, 1] + [0] * 8 + [1, 1, 1, 1, 1])
    # windows (4 side, dark glass in raised frames) and the side hatch (+X, tower side)
    for az in (math.radians(55), math.radians(125), math.radians(235), math.radians(305)):
        zc = 1.85
        rr = K.CM_R - (zc - K.HS_DEPTH - 0.16) * math.tan(math.radians(32.5))
        xf = C.rot_z(az) @ Matrix.Translation((rr + 0.01, 0, zc)) @ Matrix.Rotation(math.radians(-32.5), 4, "Y")
        C.box(bm, (0.04, 0.42, 0.36), mat=1, xform=xf)
        C.box(bm, (0.03, 0.30, 0.25), center=(0.015, 0, 0), mat=2, xform=xf)
    zc = 1.55
    rr = K.CM_R - (zc - K.HS_DEPTH - 0.16) * math.tan(math.radians(32.5))
    xf = Matrix.Translation((rr + 0.005, 0, zc)) @ Matrix.Rotation(math.radians(-32.5), 4, "Y")
    C.box(bm, (0.03, 1.02, 1.05), mat=1, xform=xf)
    C.box(bm, (0.03, 0.22, 0.20), center=(0.02, 0, 0.18), mat=2, xform=xf)
    # forward bay cover detail / docking interface ring
    C.torus(bm, 0.62, 0.035, K.CM_H + 0.02, segs=64, rsegs=8, mat=1)
    backshell = C.mesh_object("Orion_CM_Backshell", bm, coll, mats=[P["tiles"], P["alu"], P["glass"]], parent=cm)
    parts["Backshell"] = backshell

    # ---------------------------------------------------------------- Launch Abort System
    las = C.empty("LAS", coll, parent=root, loc=(0, 0, L_CM), size=2.0, kind="ARROWS")
    parts["LAS"] = las
    fair = []
    Rb = K.CM_R + 0.11
    fair.append((Rb, L_SAJ_TOP - L_CM))
    fair.append((Rb, K.HS_DEPTH + 0.30))
    z_c0, z_c1 = K.HS_DEPTH + 0.30, 3.10
    r_c1 = Rb - (z_c1 - z_c0) * math.tan(math.radians(32.5))
    fair.append((r_c1, z_c1))
    # ogive from (r_c1, z_c1) to (0.55, 5.80), tangent-continuous
    P0 = Vector((r_c1, z_c1))
    P2 = Vector((0.55, 5.80))
    d0 = Vector((-math.tan(math.radians(32.5)), 1.0)).normalized()
    P1 = P0 + d0 * 1.6
    for k in range(1, 17):
        t = k / 16
        q = (1 - t) ** 2 * P0 + 2 * (1 - t) * t * P1 + t * t * P2
        fair.append((q.x, q.y))
    fair_in = [(r - 0.04, z) for r, z in reversed(fair)]
    for k in range(4):
        bm = bmesh.new()
        a0 = C.TAU * k / 4 + math.radians(0.25)
        a1 = C.TAU * (k + 1) / 4 - math.radians(0.25)
        prof = fair + fair_in + [fair[0]]
        n = len(fair)
        C.lathe(bm, prof, segs=48, a0=a0, a1=a1, mats=[0] * (n - 1) + [1] + [2] * (n - 1) + [1])
        ob = C.mesh_object(f"LAS_OgiveFairing_{k + 1}", bm, coll, mats=[white, P["alu"], P["dark"]], parent=las)
        parts[f"Fairing_{k + 1}"] = ob

    bm = bmesh.new()
    zA = 5.80
    prof = [(0.0, zA - 0.2), (0.55, zA - 0.2), (0.55, zA), (0.48, zA + 1.05), (0.457, zA + 1.1),
            (0.457, zA + 5.1), (0.52, zA + 5.15), (0.52, zA + 6.0), (0.42, zA + 6.05), (0.42, zA + 6.9),
            (0.41, zA + 6.95), (0.41, zA + 7.55)]
    mats = [1, 1, 0, 0, 0, 2, 2, 2, 0, 0, 0]
    for k in range(1, 9):
        t = k / 8
        prof.append((0.41 * (1 - t ** 1.8) ** 0.55 + 0.001, zA + 7.55 + (K.Z_LAS_TIP - K.Z_CM - zA - 7.55) * t))
        mats.append(0)
    prof[-1] = (0.0, K.Z_LAS_TIP - K.Z_CM)
    C.lathe(bm, prof, segs=64, mats=mats)
    # abort motor manifold: four reverse-flow nozzles canted outward
    for k in range(4):
        a = C.TAU * k / 4 + math.radians(45)
        xf = Matrix.Translation((0.50 * math.cos(a), 0.50 * math.sin(a), zA + 5.55)) @ C.rot_z(a) @ Matrix.Rotation(math.radians(155), 4, "Y")
        C.lathe(bm, [(0.0, -0.05), (0.16, -0.05), (0.12, 0.12), (0.25, 0.62), (0.22, 0.62), (0.09, 0.14), (0.0, 0.14)],
                segs=24, mats=[2, 2, 2, 3, 3, 3], xform=xf)
    # jettison motor nozzles (small, canted)
    for k in range(4):
        a = C.TAU * k / 4
        xf = Matrix.Translation((0.42 * math.cos(a), 0.42 * math.sin(a), zA + 6.35)) @ C.rot_z(a) @ Matrix.Rotation(math.radians(135), 4, "Y")
        C.lathe(bm, [(0.0, -0.03), (0.07, -0.03), (0.06, 0.05), (0.10, 0.22), (0.085, 0.22), (0.04, 0.06), (0.0, 0.06)],
                segs=12, mats=[2, 2, 2, 3, 3, 3], xform=xf)
    # attitude control motor: eight ports around the ring
    for k in range(8):
        a = C.TAU * k / 8 + math.radians(22.5)
        xf = C.rot_z(a) @ Matrix.Translation((0.41, 0, zA + 7.25)) @ Matrix.Rotation(math.pi / 2, 4, "Y")
        C.lathe(bm, [(0.0, -0.01), (0.075, -0.01), (0.075, 0.03), (0.0, 0.03)], segs=12, mat=3, xform=xf)
    tower = C.mesh_object("LAS_Tower", bm, coll, mats=[white, P["alu"], P["steel_dark"], P["black"]], parent=las)
    parts["Tower"] = tower
    return parts
