"""SLS core stage: engine section, LH2 tank, intertank, LOX tank, forward skirt.

Each structure's origin is at its lower interface ring, so an exploded offset
is a pure +Z translation of that object.
"""
import math

import bmesh
import bpy
from mathutils import Matrix, Vector

from . import common as C
from . import config as K

R = K.CORE_R


def dome_profile(r, h, z_base, up=True, n=18, start_axis=False):
    """Elliptical dome from the equator (r, z_base) to the pole."""
    pts = []
    for k in range(n + 1):
        a = (math.pi / 2) * k / n
        rr = r * math.cos(a)
        zz = z_base + (h * math.sin(a) if up else -h * math.sin(a))
        pts.append((max(rr, 0.0), zz))
    if start_axis:
        pts = pts[::-1]
    return pts


def _boolean_holes(ob, holes, z, depth=0.4):
    """Cut vertical cylindrical holes (x, y, r) through ob with a boolean."""
    cutters = []
    for i, (x, y, r) in enumerate(holes):
        bm = bmesh.new()
        C.cylinder(bm, r, z - depth, z + depth, segs=64)
        me = bpy.data.meshes.new(f"_cut{i}")
        bm.to_mesh(me)
        bm.free()
        cut = bpy.data.objects.new(f"_cut{i}", me)
        cut.location = (x, y, 0)
        bpy.context.scene.collection.objects.link(cut)
        cutters.append(cut)
    for cut in cutters:
        mod = ob.modifiers.new("hole", "BOOLEAN")
        mod.operation = "DIFFERENCE"
        mod.object = cut
        mod.solver = "EXACT"
    dg = bpy.context.evaluated_depsgraph_get()
    ev = ob.evaluated_get(dg)
    new_me = bpy.data.meshes.new_from_object(ev)
    old = ob.data
    ob.modifiers.clear()
    ob.data = new_me
    bpy.data.meshes.remove(old)
    for cut in cutters:
        me = cut.data
        bpy.data.objects.remove(cut)
        bpy.data.meshes.remove(me)


def build(coll, parent, P):
    parts = {}

    # ------------------------------------------------------------------ engine section
    bm = bmesh.new()
    T = 0.08
    outer = [(K.BOATTAIL_R0, 0.0), (R, K.BOATTAIL_H), (R, K.ES_H)]
    inner = [(R - T, K.ES_H), (R - T, K.BOATTAIL_H + 0.05), (K.BOATTAIL_R0 - T, 0.05)]
    C.lathe(bm, outer + inner + [outer[0]], segs=160, mats=[0, 0, 5, 1, 1, 5])
    C.ring_band(bm, R, K.ES_H - 0.12, K.ES_H, t=0.03, segs=160, mat=2)     # top interface ring
    C.ring_band(bm, R, K.BOATTAIL_H - 0.05, K.BOATTAIL_H + 0.05, t=0.012, segs=160, mat=0)
    # TSM umbilical plates (tower side, +X) and access doors
    for a in (math.radians(-24), math.radians(24)):
        xf = C.rot_z(a) @ Matrix.Translation((R + 0.03, 0, 3.7))
        C.box(bm, (0.10, 1.30, 1.70), mat=2, xform=xf)
        C.box(bm, (0.06, 1.05, 1.40), center=(0.07, 0, 0), mat=3, xform=xf)
    for a in (math.radians(140), math.radians(220), math.radians(60), math.radians(300)):
        C.curved_panel(bm, R + 0.012, a - 0.06, a + 0.06, 4.6, 5.9, segs=6, mat=4)
    # aft booster attach fittings (toward +/-Y)
    for s in (1, -1):
        for dz, w in ((4.35, 0.9), (6.35, 0.7)):
            C.box(bm, (0.9, 0.55, w), center=(0, s * (R + 0.2), dz), mat=2)
    # internal thrust structure (visible when the LH2 tank is lifted away)
    C.box(bm, (7.6, 0.45, 0.8), center=(0, 1.45, 3.05), mat=1)
    C.box(bm, (7.6, 0.45, 0.8), center=(0, -1.45, 3.05), mat=1)
    C.box(bm, (0.45, 7.6, 0.8), center=(1.45, 0, 3.55), mat=1)
    C.box(bm, (0.45, 7.6, 0.8), center=(-1.45, 0, 3.55), mat=1)
    for x, y in K.RS25_POS.values():
        C.lathe(bm, [(0.55, 1.07), (0.30, 1.75), (0.30, 2.65), (0.0, 2.65)], segs=24, mat=1,
                xform=Matrix.Translation((x, y, 0)))
    es = C.mesh_object("CS_EngineSection", bm, coll, mats=[P["sofi_es"], P["grey"], P["steel_dark"], P["dark"], P["sofi"], P["black"]],
                       parent=parent, loc=(0, 0, K.Z_HEATSHIELD))
    parts["EngineSection"] = es

    # base heat shield with engine cut-outs, engine boots, CAPU exhaust ports
    bm = bmesh.new()
    C.lathe(bm, [(0.0, -0.06), (K.BOATTAIL_R0 - 0.02, -0.06), (K.BOATTAIL_R0 - 0.02, 0.06), (0.0, 0.06)], segs=160, mat=0)
    hs = C.mesh_object("CS_BaseHeatShield", bm, coll, mats=[P["cork"]], parent=es, smooth=30)
    _boolean_holes(hs, [(x, y, 1.12) for x, y in K.RS25_POS.values()], 0.0)
    bm = bmesh.new()
    for x, y in K.RS25_POS.values():
        xf = Matrix.Translation((x, y, 0))
        prof = [(0.36, -0.46), (0.52, -0.30), (0.90, -0.14), (1.13, -0.05), (1.16, 0.02)]
        C.lathe(bm, prof, segs=96, mat=0, xform=xf)
        C.torus(bm, 1.13, 0.035, -0.04, segs=96, rsegs=8, mat=1, xform=xf)
    for k in range(4):
        a = math.radians(45 + 90 * k) + math.radians(22)
        xf = Matrix.Translation((3.05 * math.cos(a), 3.05 * math.sin(a), 0))
        C.lathe(bm, [(0.09, -0.32), (0.11, -0.32), (0.11, 0.0), (0.09, 0.0), (0.09, -0.32)], segs=20, mat=1, xform=xf)
        C.cylinder(bm, 0.09, -0.31, -0.05, segs=20, mat=2, caps=False, xform=xf)
    C.mesh_object("CS_EngineBoots_CAPU", bm, coll, mats=[P["mli_white"], P["steel_dark"], P["black"]], parent=es)

    # ------------------------------------------------------------------ LH2 tank
    bm = bmesh.new()
    prof = dome_profile(R, K.DOME_H, 0.0, up=False, n=20)[::-1]            # pole -> equator (aft dome)
    prof += [(R, K.LH2_BARREL * k / 10) for k in range(1, 10)]
    prof += dome_profile(R, K.DOME_H, K.LH2_BARREL, up=True, n=20)          # equator -> pole (fwd)
    C.lathe(bm, prof, segs=192, mat=0)
    for k in range(1, 5):                                                     # barrel weld lands
        z = K.LH2_BARREL * k / 5
        C.ring_band(bm, R, z - 0.05, z + 0.05, t=0.006, segs=192, mat=1)
    for z in (0.0, K.LH2_BARREL):
        C.ring_band(bm, R, z - 0.08, z + 0.08, t=0.012, segs=192, mat=1)
    lh2 = C.mesh_object("CS_LH2Tank", bm, coll, mats=[P["sofi"], P["sofi_it"]], parent=parent, loc=(0, 0, K.Z_ES_TOP))
    parts["LH2Tank"] = lh2

    # LOX feedlines ("downcomers"), raceway, repress line (ride with the LH2 tank)
    bm = bmesh.new()
    top = K.LH2_BARREL + 1.35
    for a in K.FEED_AZ:
        rc = R + K.FEED_OFFSET
        pts = [((R - 1.4) * math.cos(a), (R - 1.4) * math.sin(a), top + 0.4),
               ((R + 0.05) * math.cos(a), (R + 0.05) * math.sin(a), top + 0.4),
               (rc * math.cos(a), rc * math.sin(a), top - 0.5),
               (rc * math.cos(a), rc * math.sin(a), -0.3),
               ((R - 0.3) * math.cos(a), (R - 0.3) * math.sin(a), -1.4)]
        C.sweep(bm, C.bend_path(pts, 0.7, n=10), radius=K.FEED_R, segs=24, mat=0)
        for z in [1.5 + 3.2 * i for i in range(11)]:
            if z > top - 1.0:
                continue
            xf = C.rot_z(a) @ Matrix.Translation((R + 0.18, 0, z))
            C.box(bm, (0.34, 0.16, 0.22), mat=0, xform=xf)
            C.box(bm, (0.08, 0.60, 0.10), center=(0.20, 0, 0), mat=0, xform=xf)
        for z in (8.0, 16.5, 25.0):                                           # bellows/flanges
            C.torus(bm, K.FEED_R + 0.01, 0.03, 0, segs=24, rsegs=6, mat=1,
                    xform=Matrix.Translation((rc * math.cos(a), rc * math.sin(a), z)))
    # cable raceway (systems tunnel)
    a = K.RACEWAY_AZ
    sec = C.rounded_box_profile(0.16, 0.34, 0.05)
    path = [((R + 0.07) * math.cos(a), (R + 0.07) * math.sin(a), z) for z in (0.3, K.LH2_BARREL + 1.0)]
    C.sweep(bm, path, section=sec, mat=0, twist_up=(math.cos(a), math.sin(a), 0))
    # repressurization line
    a = K.PRESS_AZ
    path = [((R + 0.12) * math.cos(a), (R + 0.12) * math.sin(a), z) for z in (0.4, K.LH2_BARREL + 0.9)]
    C.sweep(bm, path, radius=0.06, segs=12, mat=0)
    C.mesh_object("CS_LOX_Feedlines_Raceway", bm, coll, mats=[P["sofi"], P["steel_dark"]], parent=lh2)

    # ------------------------------------------------------------------ intertank
    bm = bmesh.new()
    C.ribbed_cylinder(bm, R, 0.0, K.IT_H, n_ribs=216, rib_w=0.07, rib_h=0.055, mat=0)
    C.lathe(bm, [(R - 0.10, K.IT_H), (R - 0.10, 0.0)], segs=96, mat=3)      # inner wall (faces in)
    for z0, z1 in ((0.0, 0.16), (K.IT_H - 0.16, K.IT_H)):
        C.ring_band(bm, R + 0.02, z0, z1, t=0.05, segs=192, mat=0)
    # thrust beam spanning the intertank + forward attach fittings
    C.box(bm, (0.8, 2 * R + 0.3, 1.1), center=(0, 0, 1.25), mat=1)
    for s in (1, -1):
        C.box(bm, (1.1, 0.5, 1.4), center=(0, s * (R + 0.25), 1.25), mat=2)
        C.cylinder(bm, 0.18, -0.1, 0.1, segs=20, mat=2,
                   xform=Matrix.Translation((0, s * (R + 0.55), 1.25)) @ Matrix.Rotation(math.pi / 2, 4, "X"))
    # intertank umbilical plate (+X) and vent/access doors
    C.box(bm, (0.16, 1.4, 1.8), center=(R + 0.1, 0, 3.4), mat=2)
    C.box(bm, (0.08, 1.1, 1.5), center=(R + 0.2, 0, 3.4), mat=3)
    for a in (math.radians(160), math.radians(200)):
        xf = C.rot_z(a) @ Matrix.Translation((R + 0.06, 0, 4.4))
        C.box(bm, (0.05, 0.9, 1.2), mat=4, xform=xf)
    it = C.mesh_object("CS_Intertank", bm, coll, mats=[P["sofi_it"], P["steel"], P["steel_dark"], P["dark"], P["sofi"]],
                       parent=parent, loc=(0, 0, K.Z_LH2_TOP), smooth=0)
    parts["Intertank"] = it

    # ------------------------------------------------------------------ LOX tank
    bm = bmesh.new()
    prof = dome_profile(R, K.DOME_H, 0.0, up=False, n=20)[::-1]
    prof += [(R, K.LOX_BARREL * k / 4) for k in range(1, 4)]
    prof += dome_profile(R, K.DOME_H, K.LOX_BARREL, up=True, n=20)
    C.lathe(bm, prof, segs=192, mat=0)
    C.ring_band(bm, R, K.LOX_BARREL / 2 - 0.05, K.LOX_BARREL / 2 + 0.05, t=0.006, segs=192, mat=1)
    for z in (0.0, K.LOX_BARREL):
        C.ring_band(bm, R, z - 0.08, z + 0.08, t=0.012, segs=192, mat=1)
    # LOX feed outlets on the aft dome (feedlines connect here through the intertank)
    for a in K.FEED_AZ:
        rr = R * 0.62
        C.cylinder(bm, 0.25, -K.DOME_H * 0.78 - 0.4, -K.DOME_H * 0.6, segs=24, mat=2,
                   xform=Matrix.Translation((rr * math.cos(a), rr * math.sin(a), 0)))
    lox = C.mesh_object("CS_LOXTank", bm, coll, mats=[P["sofi_lox"], P["sofi_it"], P["steel_dark"]],
                        parent=parent, loc=(0, 0, K.Z_IT_TOP))
    parts["LOXTank"] = lox

    # ------------------------------------------------------------------ forward skirt
    bm = bmesh.new()
    C.ribbed_cylinder(bm, R, 0.0, K.FS_H, n_ribs=180, rib_w=0.07, rib_h=0.05, mat=0)
    C.lathe(bm, [(R - 0.10, K.FS_H), (R - 0.10, 0.0)], segs=96, mat=3)
    C.ring_band(bm, R + 0.02, 0.0, 0.16, t=0.05, segs=192, mat=0)
    C.lathe(bm, [(R - 0.1, K.FS_H), (R + 0.07, K.FS_H), (R + 0.07, K.FS_H - 0.14), (R + 0.02, K.FS_H - 0.18)], segs=192, mat=1)
    # upper interface flange (lands for the LVSA) and top closure ring
    C.lathe(bm, [(R - 0.10, K.FS_H), (R - 0.55, K.FS_H), (R - 0.55, K.FS_H - 0.1)], segs=96, mat=2)
    C.box(bm, (0.16, 1.2, 1.4), center=(R + 0.1, 0, 2.0), mat=2)             # forward skirt umbilical plate
    C.box(bm, (0.08, 0.9, 1.1), center=(R + 0.2, 0, 2.0), mat=3)
    for a in (math.radians(100), math.radians(250), math.radians(170)):       # antennas
        xf = C.rot_z(a) @ Matrix.Translation((R + 0.08, 0, 2.6))
        C.box(bm, (0.05, 0.06, 0.28), center=(0.05, 0, 0), mat=2, xform=xf)
        C.box(bm, (0.24, 0.02, 0.18), center=(0.18, 0, 0.02), mat=2, xform=xf)
    fs = C.mesh_object("CS_ForwardSkirt", bm, coll, mats=[P["sofi_it"], P["alu"], P["steel_dark"], P["dark"]],
                       parent=parent, loc=(0, 0, K.Z_LOX_TOP), smooth=0)
    parts["ForwardSkirt"] = fs
    return parts
