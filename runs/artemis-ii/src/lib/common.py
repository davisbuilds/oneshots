"""Shared geometry helpers for the Artemis II build.

Everything is in meters. Surfaces of revolution are described by (r, z)
profiles. Traverse a closed cross-section counter-clockwise in the (r, z)
plane (outer wall upward, top inward, inner wall downward) and the faces come
out facing away from the material.
"""
from __future__ import annotations

import math

import bmesh
import bpy
from mathutils import Matrix, Vector

TAU = math.tau


# ----------------------------------------------------------------------------
# Scene graph
# ----------------------------------------------------------------------------

def get_coll(name: str, parent: bpy.types.Collection | None = None) -> bpy.types.Collection:
    coll = bpy.data.collections.get(name)
    if coll is None:
        coll = bpy.data.collections.new(name)
        (parent or bpy.context.scene.collection).children.link(coll)
    return coll


def link(ob: bpy.types.Object, coll: bpy.types.Collection) -> bpy.types.Object:
    if ob.name not in coll.objects:
        coll.objects.link(ob)
    return ob


def empty(name: str, coll, parent=None, loc=(0, 0, 0), size=1.0, kind="PLAIN_AXES"):
    ob = bpy.data.objects.new(name, None)
    ob.empty_display_type = kind
    ob.empty_display_size = size
    link(ob, coll)
    if parent is not None:
        ob.parent = parent
    ob.location = loc
    return ob


def set_parent(child, parent, loc=None):
    child.parent = parent
    child.matrix_parent_inverse = Matrix.Identity(4)
    if loc is not None:
        child.location = loc
    return child


def mesh_object(name, bm, coll, mats=(), parent=None, loc=(0, 0, 0), smooth=35.0):
    me = bpy.data.meshes.new(name)
    bm.normal_update()
    bm.to_mesh(me)
    bm.free()
    for m in mats:
        me.materials.append(m)
    if smooth:
        me.shade_smooth()
        me.set_sharp_from_angle(angle=math.radians(smooth))
    ob = bpy.data.objects.new(name, me)
    link(ob, coll)
    if parent is not None:
        set_parent(ob, parent)
    ob.location = loc
    return ob


# ----------------------------------------------------------------------------
# bmesh builders (all append into an existing bmesh so details can be merged)
# ----------------------------------------------------------------------------

def lathe(bm, profile, segs=64, a0=0.0, a1=TAU, mat=0, mats=None, xform=None,
          uv=True):
    """Revolve an (r, z) profile around +Z.

    profile: list of (r, z). r == 0 endpoints collapse to a pole.
    mats: optional per-span material indices (len(profile) - 1).
    Returns the list of vertex rings.
    """
    full = abs((a1 - a0) - TAU) < 1e-6
    n = segs if full else segs + 1
    rings = []
    for (r, z) in profile:
        ring = []
        if r < 1e-7:
            v = bm.verts.new(_xf(xform, (0.0, 0.0, z)))
            ring = [v] * n
        else:
            for j in range(n):
                a = a0 + (a1 - a0) * j / segs
                ring.append(bm.verts.new(_xf(xform, (r * math.cos(a), r * math.sin(a), z))))
        rings.append(ring)
    uv_layer = bm.loops.layers.uv.verify() if uv else None
    # cumulative profile length for v coordinate
    plen = [0.0]
    for i in range(1, len(profile)):
        (r0, z0), (r1, z1) = profile[i - 1], profile[i]
        plen.append(plen[-1] + math.hypot(r1 - r0, z1 - z0))
    total = plen[-1] or 1.0
    for i in range(len(rings) - 1):
        m = mats[i] if mats else mat
        ra, rb = rings[i], rings[i + 1]
        for j in range(segs):
            j2 = (j + 1) % n if full else j + 1
            quad = [ra[j], ra[j2], rb[j2], rb[j]]
            uniq = []
            for v in quad:
                if v not in uniq:
                    uniq.append(v)
            if len(uniq) < 3:
                continue
            try:
                f = bm.faces.new(uniq)
            except ValueError:
                continue
            f.material_index = m
            f.smooth = True
            if uv_layer is not None:
                us = [j / segs, (j + 1) / segs, (j + 1) / segs, j / segs]
                vs = [plen[i] / total, plen[i] / total, plen[i + 1] / total, plen[i + 1] / total]
                for loop in f.loops:
                    k = quad.index(loop.vert)
                    loop[uv_layer].uv = (us[k], vs[k])
    return rings


def _xf(xform, co):
    if xform is None:
        return co
    return xform @ Vector(co)


def tube_profile(r_out, r_in, z0, z1):
    """Closed CCW cross-section of a thick-walled cylinder."""
    return [(r_in, z0), (r_out, z0), (r_out, z1), (r_in, z1), (r_in, z0)]


def disc(bm, r, z, segs=64, mat=0, r_in=0.0, down=False, xform=None):
    prof = [(r_in, z), (r, z)] if down else [(r, z), (r_in, z)]
    return lathe(bm, prof, segs, mat=mat, xform=xform)


def cylinder(bm, r, z0, z1, segs=48, mat=0, caps=True, xform=None):
    prof = [(0.0, z0), (r, z0), (r, z1), (0.0, z1)] if caps else [(r, z0), (r, z1)]
    return lathe(bm, prof, segs, mat=mat, xform=xform)


def box(bm, size, center=(0, 0, 0), mat=0, xform=None):
    sx, sy, sz = (s * 0.5 for s in size)
    cx, cy, cz = center
    pts = [(-sx, -sy, -sz), (sx, -sy, -sz), (sx, sy, -sz), (-sx, sy, -sz),
           (-sx, -sy, sz), (sx, -sy, sz), (sx, sy, sz), (-sx, sy, sz)]
    vs = [bm.verts.new(_xf(xform, (cx + x, cy + y, cz + z))) for x, y, z in pts]
    faces = [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)]
    out = []
    for f in faces:
        face = bm.faces.new([vs[i] for i in f])
        face.material_index = mat
        face.smooth = False
        out.append(face)
    return out


def rounded_box_profile(w, h, r, n=4):
    """2D rounded rectangle outline (CCW) centered at origin."""
    pts = []
    r = min(r, w / 2, h / 2)
    corners = [(w / 2 - r, h / 2 - r, 0), (-w / 2 + r, h / 2 - r, 90),
               (-w / 2 + r, -h / 2 + r, 180), (w / 2 - r, -h / 2 + r, 270)]
    for cx, cy, a0 in corners:
        for k in range(n + 1):
            a = math.radians(a0 + 90 * k / n)
            pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    return pts


def sweep(bm, path, radius=None, section=None, segs=16, mat=0, cap=True, xform=None,
          twist_up=(0, 0, 1)):
    """Sweep a circular (or custom 2D) section along a polyline path.

    path: list of 3D points. section: list of (x, y) in the local frame.
    Uses parallel transport frames so bends do not twist.
    """
    pts = [Vector(p) for p in path]
    if section is None:
        section = [(radius * math.cos(TAU * k / segs), radius * math.sin(TAU * k / segs))
                   for k in range(segs)]
    ns = len(section)
    # tangents
    tans = []
    for i in range(len(pts)):
        if i == 0:
            t = pts[1] - pts[0]
        elif i == len(pts) - 1:
            t = pts[-1] - pts[-2]
        else:
            t = (pts[i + 1] - pts[i]).normalized() + (pts[i] - pts[i - 1]).normalized()
        tans.append(t.normalized())
    up = Vector(twist_up)
    if abs(up.dot(tans[0])) > 0.95:
        up = Vector((1, 0, 0)) if abs(tans[0].x) < 0.9 else Vector((0, 1, 0))
    nrm = (up - tans[0] * up.dot(tans[0])).normalized()
    rings = []
    for i, p in enumerate(pts):
        t = tans[i]
        if i > 0:
            # parallel transport
            prev = tans[i - 1]
            axis = prev.cross(t)
            if axis.length > 1e-8:
                ang = prev.angle(t)
                nrm = (Matrix.Rotation(ang, 3, axis.normalized()) @ nrm)
            nrm = (nrm - t * nrm.dot(t)).normalized()
        bin_ = t.cross(nrm)
        # miter scale at bends
        scale = 1.0
        if 0 < i < len(pts) - 1:
            a = (pts[i] - pts[i - 1]).normalized()
            b = (pts[i + 1] - pts[i]).normalized()
            c = max(0.3, math.cos(a.angle(b) / 2))
            scale = 1.0 / c
        ring = []
        for (sx, sy) in section:
            co = p + nrm * sx * scale + bin_ * sy
            ring.append(bm.verts.new(_xf(xform, co)))
        rings.append(ring)
    for i in range(len(rings) - 1):
        for k in range(ns):
            k2 = (k + 1) % ns
            f = bm.faces.new([rings[i][k], rings[i][k2], rings[i + 1][k2], rings[i + 1][k]])
            f.material_index = mat
            f.smooth = True
    if cap:
        for ring, rev in ((rings[0], True), (rings[-1], False)):
            vs = list(reversed(ring)) if rev else list(ring)
            f = bm.faces.new(vs)
            f.material_index = mat
            f.smooth = False
    return rings


def arc_path(center, radius, a0, a1, n=12, axis="z", z=0.0):
    pts = []
    for k in range(n + 1):
        a = a0 + (a1 - a0) * k / n
        if axis == "z":
            pts.append((center[0] + radius * math.cos(a), center[1] + radius * math.sin(a), z))
    return pts


def bend_path(points, radius=0.3, n=6):
    """Round the corners of a polyline with circular fillets."""
    pts = [Vector(p) for p in points]
    if len(pts) < 3:
        return [tuple(p) for p in pts]
    out = [pts[0]]
    for i in range(1, len(pts) - 1):
        a, b, c = pts[i - 1], pts[i], pts[i + 1]
        d1 = (a - b).normalized()
        d2 = (c - b).normalized()
        ang = d1.angle(d2)
        if ang > math.pi - 1e-3 or ang < 1e-3:
            out.append(b)
            continue
        t = radius / math.tan(ang / 2)
        t = min(t, (a - b).length * 0.45, (c - b).length * 0.45)
        p1 = b + d1 * t
        p2 = b + d2 * t
        for k in range(n + 1):
            s = k / n
            # quadratic bezier approximation of the fillet
            q = (1 - s) ** 2 * p1 + 2 * (1 - s) * s * b + s ** 2 * p2
            out.append(q)
    out.append(pts[-1])
    return [tuple(p) for p in out]


def torus(bm, R, r, z=0.0, segs=64, rsegs=12, mat=0, xform=None):
    prof = []
    for k in range(rsegs + 1):
        a = TAU * k / rsegs
        prof.append((R + r * math.cos(a), z + r * math.sin(a)))
    return lathe(bm, prof, segs, mat=mat, xform=xform)


def ring_band(bm, r, z0, z1, t=0.02, segs=96, mat=0, a0=0.0, a1=TAU):
    """A slightly proud band on a cylinder of radius r."""
    prof = [(r - 0.002, z0), (r + t, z0), (r + t, z1), (r - 0.002, z1)]
    return lathe(bm, prof, segs, mat=mat, a0=a0, a1=a1)


def ribbed_cylinder(bm, r, z0, z1, n_ribs, rib_w, rib_h, mat=0, xform=None,
                    cap=False):
    """Cylinder with n external stringers (hat-section ribs)."""
    ring_pts = []
    for i in range(n_ribs):
        a_c = TAU * i / n_ribs
        half = rib_w / (2 * r)
        pitch = TAU / n_ribs
        for a, rr in ((a_c - pitch / 2, r), (a_c - half * 1.4, r), (a_c - half, r + rib_h),
                      (a_c + half, r + rib_h), (a_c + half * 1.4, r)):
            ring_pts.append((a, rr))
    rings = []
    for z in (z0, z1):
        ring = [bm.verts.new(_xf(xform, (rr * math.cos(a), rr * math.sin(a), z))) for a, rr in ring_pts]
        rings.append(ring)
    n = len(ring_pts)
    for k in range(n):
        k2 = (k + 1) % n
        f = bm.faces.new([rings[0][k], rings[0][k2], rings[1][k2], rings[1][k]])
        f.material_index = mat
        f.smooth = False
    return rings


def curved_panel(bm, r, a0, a1, z0, z1, thickness=0.0, segs=16, mat=0, uv=True):
    """A patch on a cylinder surface (for decals/doors). UV spans 0..1."""
    uv_layer = bm.loops.layers.uv.verify() if uv else None
    rows = []
    for zi, z in enumerate((z0, z1)):
        row = []
        for j in range(segs + 1):
            a = a0 + (a1 - a0) * j / segs
            row.append(bm.verts.new((r * math.cos(a), r * math.sin(a), z)))
        rows.append(row)
    for j in range(segs):
        f = bm.faces.new([rows[0][j], rows[0][j + 1], rows[1][j + 1], rows[1][j]])
        f.material_index = mat
        f.smooth = True
        if uv_layer is not None:
            uvs = [(j / segs, 0), ((j + 1) / segs, 0), ((j + 1) / segs, 1), (j / segs, 1)]
            for loop, co in zip(f.loops, uvs):
                loop[uv_layer].uv = co
    return rows


def rot_z(a):
    return Matrix.Rotation(a, 4, "Z")


def trs(loc=(0, 0, 0), rot=(0, 0, 0), scale=1.0):
    from mathutils import Euler
    m = Euler(rot, "XYZ").to_matrix().to_4x4()
    if not isinstance(scale, (tuple, list)):
        scale = (scale, scale, scale)
    s = Matrix.Diagonal((*scale, 1.0))
    return Matrix.Translation(loc) @ m @ s


def polar(r, a, z):
    return (r * math.cos(a), r * math.sin(a), z)


def smoothstep(e0, e1, x):
    t = min(1.0, max(0.0, (x - e0) / (e1 - e0)))
    return t * t * (3 - 2 * t)
