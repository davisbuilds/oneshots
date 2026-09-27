"""Five-segment solid rocket booster (booster frame: origin at the aft skirt
base, +Z up). `side` = +1 for the north booster (+Y), -1 for the south one.

Segment ends show the case tang/clevis ring, insulation and the propellant
face with its bore (star bore at the forward end of the forward segment). The
internal grain geometry is a simplified, disclosed representation.
"""
import math

import bmesh
import bpy
from mathutils import Matrix, Vector

from . import common as C
from . import config as K

R = K.SRB_R


def _az_world_to_local(az_world, side):
    return az_world  # boosters are not rotated; azimuths are world azimuths


def _decal_panel(bm, r, a_center, width, z_center, height, mat, rotate=False, segs=16):
    """Curved decal patch on a cylinder. If rotate, image u runs down the z axis
    (text reads top-to-bottom when viewed from outside)."""
    uv = bm.loops.layers.uv.verify()
    a0 = a_center - width / (2 * r)
    a1 = a_center + width / (2 * r)
    z0, z1 = z_center - height / 2, z_center + height / 2
    nz = segs if rotate else 1
    na = 2 if rotate else segs
    grid = []
    for i in range(nz + 1):
        z = z0 + (z1 - z0) * i / nz
        row = []
        for j in range(na + 1):
            a = a0 + (a1 - a0) * j / na
            row.append(bm.verts.new(((r + 0.004) * math.cos(a), (r + 0.004) * math.sin(a), z)))
        grid.append(row)
    for i in range(nz):
        for j in range(na):
            f = bm.faces.new([grid[i][j], grid[i][j + 1], grid[i + 1][j + 1], grid[i + 1][j]])
            f.material_index = mat
            f.smooth = True
            for loop in f.loops:
                ii = next(ii for ii in (i, i + 1) if loop.vert in grid[ii])
                jj = grid[ii].index(loop.vert)
                s_a = jj / na      # 0..1 across the circumference (left->right seen from outside)
                s_z = ii / nz      # 0..1 bottom->top
                if rotate:
                    # text baseline along the circumference, reading downward:
                    # u (text direction) from top to bottom, v (letter height) across
                    loop[uv].uv = (1.0 - s_z, s_a)
                else:
                    loop[uv].uv = (s_a, s_z)


def _segment_end(bm, z, facing_up, mats, star=False):
    """Case ring + insulation + propellant face with a bore at height z."""
    m_case, m_ins, m_prop, m_bore = mats
    s = 1 if facing_up else -1
    r_bore = 0.62
    if star:
        n = 11
        ring = []
        for k in range(n * 8):
            a = C.TAU * k / (n * 8)
            ph = (k % 8) / 8.0
            rr = r_bore + (0.45 if ph < 0.25 else 0.45 * max(0.0, 1 - (ph - 0.25) * 4) if ph < 0.5 else 0.0 if ph < 0.75 else 0.45 * (ph - 0.75) * 4)
            ring.append((rr * math.cos(a), rr * math.sin(a)))
    else:
        ring = [(r_bore * math.cos(C.TAU * k / 64), r_bore * math.sin(C.TAU * k / 64)) for k in range(64)]
    # propellant face: annulus between bore outline and insulation radius
    r_prop = R - 0.07
    outer = [(r_prop * math.cos(math.atan2(y, x)), r_prop * math.sin(math.atan2(y, x))) for x, y in ring]
    vi = [bm.verts.new((x, y, z)) for x, y in ring]
    vo = [bm.verts.new((x, y, z)) for x, y in outer]
    n = len(ring)
    for k in range(n):
        k2 = (k + 1) % n
        quad = [vi[k], vo[k], vo[k2], vi[k2]] if facing_up else [vi[k2], vo[k2], vo[k], vi[k]]
        f = bm.faces.new(quad)
        f.material_index = m_prop
    # bore wall going into the segment
    depth = 1.2
    vb = [bm.verts.new((x, y, z - s * depth)) for x, y in ring]
    for k in range(n):
        k2 = (k + 1) % n
        quad = [vi[k], vi[k2], vb[k2], vb[k]] if facing_up else [vi[k2], vi[k], vb[k], vb[k2]]
        f = bm.faces.new(quad)
        f.material_index = m_bore
    cap = bm.faces.new(vb if facing_up else vb[::-1])
    cap.material_index = m_bore
    # insulation ring and case tang/clevis land
    C.lathe(bm, [(R - 0.025, z), (r_prop, z)] if facing_up else [(r_prop, z), (R - 0.025, z)], segs=96, mat=m_ins)
    C.lathe(bm, [(R + 0.01, z - 0.02 * s), (R - 0.025, z)] if facing_up else [(R - 0.025, z), (R + 0.01, z - 0.02 * s)], segs=96, mat=m_case)
    for k in range(36):  # clevis pin heads
        a = C.TAU * k / 36
        C.cylinder(bm, 0.018, z - 0.03 * s - 0.01, z - 0.03 * s + 0.01, segs=6, mat=m_case,
                   xform=Matrix.Translation(((R - 0.012) * math.cos(a), (R - 0.012) * math.sin(a), 0)))


def build(side, coll, parent, P, worm_mat, shared=None):
    tag = "SRBN" if side > 0 else "SRBS"
    name = "SRB_North" if side > 0 else "SRB_South"
    root = C.empty(name, coll, parent=parent, loc=(0, side * K.SRB_Y, K.SRB_BASE_Z), size=2.0, kind="ARROWS")
    parts = {"root": root}
    az_out = math.pi / 2 if side > 0 else -math.pi / 2         # systems tunnel (outboard)
    az_in = -az_out                                             # toward the core stage
    az_worm = az_out + (math.pi / 4 if side > 0 else -math.pi / 4)   # rotated 45 deg toward the front (-X)
    mats_common = [P["white"], P["joint"], P["steel_dark"], P["dark"], P["fiducial"], P["ablative"], P["grey"], P["carbon"]]
    # indices: 0 white, 1 joint, 2 steel_dark, 3 dark(insulation), 4 fiducial, 5 propellant, 6 grey, 7 bore/carbon

    # ---------------------------------------------------------------- aft skirt
    bm = bmesh.new()
    H = K.SRB_AFTSKIRT_H
    outer = [(K.SRB_AFTSKIRT_R0, 0.0), (K.SRB_AFTSKIRT_R0 - 0.02, 0.35), (R + 0.03, H - 0.25), (R, H)]
    inner = [(R - 0.06, H), (R - 0.06, H - 0.3), (K.SRB_AFTSKIRT_R0 - 0.08, 0.3), (K.SRB_AFTSKIRT_R0 - 0.08, 0.0)]
    C.lathe(bm, outer + inner + [outer[0]], segs=128, mats=[0, 0, 0, 2, 3, 3, 3, 2])
    C.ring_band(bm, K.SRB_AFTSKIRT_R0 - 0.01, 0.0, 0.3, t=0.04, segs=128, mat=2)       # kick ring
    for k in range(4):                                                               # post shoes
        a = math.radians(45 + 90 * k)
        xf = C.rot_z(a) @ Matrix.Translation((K.SRB_AFTSKIRT_R0 - 0.35, 0, 0.12))
        C.box(bm, (0.75, 0.62, 0.26), mat=2, xform=xf)
        C.box(bm, (0.30, 0.50, 0.9), center=(0.05, 0, 0.55), mat=0, xform=xf)
    for k in range(4):                                                               # aft BSMs, side by side, inboard
        da = math.radians(-13.5 + 9 * k)
        a = az_in + da
        rr = 2.25
        xf = Matrix.Translation((rr * math.cos(a), rr * math.sin(a), 1.25)) @ C.rot_z(a) @ Matrix.Rotation(math.radians(-60), 4, "Y")
        C.lathe(bm, [(0.0, -0.4), (0.13, -0.4), (0.13, 0.25), (0.07, 0.3), (0.16, 0.52), (0.14, 0.52), (0.05, 0.32), (0.0, 0.32)],
                segs=20, mats=[2, 2, 2, 7, 7, 7, 7], xform=xf)
    aft = C.mesh_object(f"{tag}_AftSkirt", bm, coll, mats=mats_common, parent=root)
    parts["AftSkirt"] = aft

    # ---------------------------------------------------------------- nozzle
    bm = bmesh.new()
    zb = -K.SRB_NOZ_BELOW
    ri = lambda z: 0.55 + (K.SRB_NOZ_EXIT_R - 0.06 - 0.55) * (3.1 - z) / (3.1 - zb)
    zs = [zb + (3.1 - zb) * k / 24 for k in range(25)]
    outer = [(ri(z) + 0.07, z) for z in zs]
    inner = [(ri(z), z) for z in reversed(zs)]
    C.lathe(bm, outer + inner + [outer[0]], segs=128, mats=[7] * 24 + [2] + [5] * 24 + [2])
    C.torus(bm, ri(zb) + 0.08, 0.045, zb + 0.05, segs=128, rsegs=8, mat=2)
    C.lathe(bm, [(0.0, 3.0), (0.55, 3.0), (0.55, 3.2), (0.0, 3.2)], segs=48, mat=5)   # throat plug (dark)
    noz = C.mesh_object(f"{tag}_Nozzle", bm, coll, mats=mats_common, parent=root)
    parts["Nozzle"] = noz

    # ---------------------------------------------------------------- segments
    z = K.SRB_AFTSKIRT_H
    fid_rows = {0: (math.pi, 1.2), 1: (0.0, 1.0)}
    for i, sname in enumerate(K.SRB_SEG_NAMES):
        bm = bmesh.new()
        h = K.SRB_SEG_H
        C.lathe(bm, [(R, 0.0), (R, h * 0.5), (R, h)], segs=128, mat=0)
        C.ring_band(bm, R, h * 0.5 - 0.03, h * 0.5 + 0.03, t=0.006, segs=128, mat=1)   # factory joint
        if i < K.SRB_NSEG - 1:
            C.ring_band(bm, R, h - 0.40, h, t=0.030, segs=128, mat=1)                    # field joint band
        C.ring_band(bm, R, 0.0, 0.08, t=0.012, segs=128, mat=1)
        # systems tunnel cover (outboard)
        sec = C.rounded_box_profile(0.14, 0.36, 0.05)
        path = [((R + 0.06) * math.cos(az_out), (R + 0.06) * math.sin(az_out), zz) for zz in (0.02, h - 0.02)]
        C.sweep(bm, path, section=sec, mat=0, twist_up=(math.cos(az_out), math.sin(az_out), 0))
        # fiducial targets
        for key, (az, size) in fid_rows.items():
            _decal_panel(bm, R + 0.002, az, size, h * (0.35 + 0.25 * key), size, 4)
        _decal_panel(bm, R + 0.002, az_out + math.radians(-35 if side > 0 else 35), 0.6, h * 0.72, 1.6, 4)
        # segment end faces (exposed while exploded)
        _segment_end(bm, 0.0, False, (2, 3, 5, 7))
        _segment_end(bm, h, True, (2, 3, 5, 7), star=(i == K.SRB_NSEG - 1))
        if i == 0:                                                                      # aft attach ring + struts
            zr = 9.60 - K.SRB_AFTSKIRT_H
            C.ring_band(bm, R, zr - 0.22, zr + 0.22, t=0.10, segs=128, mat=2)
            gap_y = K.SRB_Y - K.CORE_R - 0.2
            # three struts from the ring to the engine-section fittings (vehicle z 10.32 and 8.32)
            z_ring_v = K.SRB_BASE_Z + K.SRB_AFTSKIRT_H + zr
            for (dz0, z_fit, dx) in ((0.1, 10.32, 0.0), (-0.15, 8.32, 0.32), (-0.2, 8.32, -0.32)):
                p0 = Vector((dx * 0.5, -side * (R + 0.08), zr + dz0))
                p1 = Vector((dx, -side * (gap_y + 0.05), zr + (z_fit - z_ring_v)))
                C.sweep(bm, [p0, p1], radius=0.085, segs=12, mat=2)
                C.box(bm, (0.3, 0.12, 0.3), center=tuple(p1), mat=2)
        if i == K.SRB_NSEG - 1:
            _decal_panel(bm, R + 0.004, az_worm, 2.15, h * 0.52, 7.5, 8, rotate=True, segs=20)
        mats = mats_common + [worm_mat]
        seg = C.mesh_object(f"{tag}_{sname}", bm, coll, mats=mats, parent=root, loc=(0, 0, z))
        parts[sname] = seg
        z += h

    # ---------------------------------------------------------------- forward skirt
    bm = bmesh.new()
    h = K.SRB_FWDSKIRT_H
    C.lathe(bm, [(R - 0.06, 0.0), (R, 0.0), (R, h), (R - 0.06, h), (R - 0.06, 0.0)], segs=128, mats=[1, 0, 1, 3])
    C.ring_band(bm, R, 0.0, 0.14, t=0.02, segs=128, mat=1)
    C.ring_band(bm, R, h - 0.14, h, t=0.02, segs=128, mat=1)
    # forward attach fitting (thrust post) toward the core intertank
    fy = -side * (R + 0.35)
    C.box(bm, (1.0, 0.8, 1.3), center=(0, -side * (R + 0.18), 1.55), mat=2)
    C.cylinder(bm, 0.24, -0.35, 0.35, segs=24, mat=2,
               xform=Matrix.Translation((0, fy - side * 0.2, 1.55)) @ Matrix.Rotation(math.pi / 2, 4, "X"))
    sec = C.rounded_box_profile(0.14, 0.36, 0.05)
    path = [((R + 0.06) * math.cos(az_out), (R + 0.06) * math.sin(az_out), zz) for zz in (0.02, 1.6)]
    C.sweep(bm, path, section=sec, mat=0, twist_up=(math.cos(az_out), math.sin(az_out), 0))
    fwd = C.mesh_object(f"{tag}_FwdSkirt", bm, coll, mats=mats_common, parent=root, loc=(0, 0, z))
    parts["FwdSkirt"] = fwd
    z += h

    # ---------------------------------------------------------------- frustum + BSMs
    bm = bmesh.new()
    h = K.SRB_FRUSTUM_H
    C.lathe(bm, [(R - 0.05, 0.0), (R, 0.0), (K.SRB_FRUSTUM_R1, h), (K.SRB_FRUSTUM_R1 - 0.05, h), (R - 0.05, 0.0)], segs=128, mats=[1, 0, 1, 3])
    for k in range(4):
        da = math.radians(-14 if k % 2 == 0 else 14)
        dz = 1.05 if k < 2 else 1.95
        a = az_in + da
        rr = R - (R - K.SRB_FRUSTUM_R1) * dz / h
        xf = Matrix.Translation((rr * math.cos(a), rr * math.sin(a), dz)) @ C.rot_z(a) @ Matrix.Rotation(math.radians(-110), 4, "Y")
        C.lathe(bm, [(0.0, -0.3), (0.12, -0.3), (0.12, 0.05), (0.14, 0.2), (0.12, 0.2), (0.05, 0.08), (0.0, 0.08)],
                segs=16, mats=[2, 2, 2, 7, 7, 7], xform=xf)
    fr = C.mesh_object(f"{tag}_Frustum", bm, coll, mats=mats_common, parent=root, loc=(0, 0, z))
    parts["Frustum"] = fr
    z += h

    # ---------------------------------------------------------------- nose cap
    bm = bmesh.new()
    h = K.SRB_NOSE_H
    prof = []
    for k in range(21):
        t = k / 20
        # tangent ogive-ish taper with blunt tip
        r = K.SRB_FRUSTUM_R1 * (1 - t ** 1.6) ** 0.62
        prof.append((max(r, 0.0), h * t))
    prof = [(0.0, 0.0)] + prof
    C.lathe(bm, prof, segs=96, mat=0)
    nose = C.mesh_object(f"{tag}_NoseCap", bm, coll, mats=mats_common, parent=root, loc=(0, 0, z))
    parts["NoseCap"] = nose
    return parts
