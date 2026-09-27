"""Launch Complex 39B with Mobile Launcher 1 (world frame = vehicle frame).

ML deck at z = 0; ML base 48.2 x 40.5 x 7.6 m on 6.7 m mount pedestals;
pad hardstand at z = -14.3; surrounding terrain at z = -28.0. The flame
trench runs north from under the ML (single-sided deflector facing north).
Tower 12.2 m square, 108.2 m above the deck, east of the vehicle.
Umbilical arm levels follow the NASA ML umbilical fact sheet.
Simplified: lattice members, exhaust openings, perimeter structures.
"""
import math
import random

import bmesh
import bpy
from mathutils import Matrix, Vector

from . import common as C
from . import config as K
from .materials import NB, _new_material, paint, rough_dielectric, metal

FT = 0.3048
Z_PAD = -14.3
Z_GROUND = -28.0
S20_CAM = (-2300.0, -1500.0)     # wide ascent camera (anim_pad): no scrub in its foreground
TRENCH_W = 58 * FT
TRENCH_FLOOR = Z_GROUND + 0.9
TOWER_X0, TOWER_X1 = 17.4, 29.6
TOWER_H = 355 * FT
ML_X0, ML_X1, ML_Y = -18.0, 30.2, 20.25
SUN_ELEV, SUN_AZ = 13.5, 268.1       # computed for LC-39B at 18:35 EDT, 1 Apr 2026


# ----------------------------------------------------------------------------- materials

def ground_material():
    m, nb, out = _new_material("Pad_Ground_Scrub")
    tc = nb.n("ShaderNodeTexCoord", -900, 0)
    n1 = nb.n("ShaderNodeTexNoise", -650, 200, Scale=0.012, Detail=2.0, Roughness=0.6)
    n2 = nb.n("ShaderNodeTexNoise", -650, -100, Scale=0.09, Detail=2.0, Roughness=0.7)
    for n in (n1, n2):
        nb.l(nb.out(tc, "Object"), n.inputs["Vector"])
    f = nb.math("MULTIPLY_ADD", n1, 0.7, x=-400, y=100)
    nb.l(n2, f.inputs[2])
    f = nb.math("MULTIPLY_ADD", f, 0.8, 0.0, x=-250, y=100)
    col = nb.ramp(f, [(0.35, (0.030, 0.042, 0.016)), (0.55, (0.060, 0.066, 0.028)), (0.72, (0.13, 0.11, 0.07)), (0.9, (0.20, 0.18, 0.13))], x=-50, y=100)
    bsdf = nb.n("ShaderNodeBsdfPrincipled", 300, 0, Roughness=0.95)
    nb.l(nb.out(col, "Color"), bsdf.inputs["Base Color"])
    b = nb.n("ShaderNodeBump", 100, -250, Strength=0.3, Distance=0.1)
    nb.l(n2, b.inputs["Height"])
    nb.l(b, bsdf.inputs["Normal"])
    nb.l(bsdf, out.inputs["Surface"])
    return m


def ocean_material():
    m, nb, out = _new_material("Pad_Ocean")
    tc = nb.n("ShaderNodeTexCoord", -900, 0)
    mp = nb.n("ShaderNodeMapping", -700, 0)
    mp.inputs["Scale"].default_value = (0.08, 0.02, 1.0)
    nb.l(nb.out(tc, "Object"), mp.inputs["Vector"])
    n1 = nb.n("ShaderNodeTexNoise", -450, 0, Scale=3.0, Detail=2.0)
    nb.l(mp, n1.inputs["Vector"])
    b = nb.n("ShaderNodeBump", -150, -150, Strength=0.25, Distance=0.3)
    nb.l(n1, b.inputs["Height"])
    bsdf = nb.n("ShaderNodeBsdfPrincipled", 250, 0, Roughness=0.08, **{"Base Color": (0.010, 0.025, 0.035, 1)})
    nb.l(b, bsdf.inputs["Normal"])
    nb.l(bsdf, out.inputs["Surface"])
    return m


def concrete(name, base=(0.36, 0.35, 0.33), scorch=0.0):
    m = rough_dielectric(name, base=base, rough=0.9, noise=0.35, scale=0.6, bump=0.08)
    return m


def palette():
    P = {}
    P["ground"] = ground_material()
    P["ocean"] = ocean_material()
    P["sand"] = rough_dielectric("Pad_Sand", base=(0.42, 0.37, 0.28), rough=0.95, noise=0.2, scale=0.05, bump=0.02)
    P["concrete"] = concrete("Pad_Concrete")
    P["concrete_dark"] = concrete("Pad_Concrete_Scorched", base=(0.16, 0.15, 0.14))
    P["gravel"] = rough_dielectric("Pad_Gravel", base=(0.30, 0.29, 0.27), rough=0.95, noise=0.4, scale=3.0, bump=0.2)
    P["ml_steel"] = paint("ML_Steel_Grey", base=(0.26, 0.27, 0.28), rough=0.55, var=0.12, bump=0.03)
    P["ml_deck"] = paint("ML_Deck", base=(0.20, 0.20, 0.20), rough=0.7, var=0.2, bump=0.05)
    P["tower"] = paint("ML_Tower_Steel", base=(0.40, 0.41, 0.42), rough=0.5, var=0.1, bump=0.02)
    P["arm"] = paint("ML_Umbilical_Arm", base=(0.55, 0.56, 0.57), rough=0.45, var=0.08)
    P["white"] = paint("Pad_White", base=(0.72, 0.72, 0.70), rough=0.45)
    P["yellow"] = paint("Pad_Safety_Yellow", base=(0.60, 0.42, 0.03), rough=0.5)
    P["pipe"] = metal("Pad_Pipe", base=(0.5, 0.5, 0.5), rough=0.4)
    P["dark"] = paint("Pad_Dark", base=(0.03, 0.03, 0.03), rough=0.6)
    return P


# ----------------------------------------------------------------------------- helpers

def lattice_mast(bm, x, y, z0, z1, w0, w1, bay=6.0, r_chord=0.25, r_brace=0.1, mat=0):
    """Square lattice tower from z0 to z1 with width w0 -> w1."""
    n = max(1, int((z1 - z0) / bay))
    def corner(i, z):
        t = (z - z0) / (z1 - z0)
        w = (w0 + (w1 - w0) * t) / 2
        sx, sy = ((1, 1), (-1, 1), (-1, -1), (1, -1))[i]
        return (x + sx * w, y + sy * w, z)
    for i in range(4):
        C.sweep(bm, [corner(i, z0), corner(i, z1)], radius=r_chord, segs=6, mat=mat)
    for k in range(n + 1):
        z = z0 + (z1 - z0) * k / n
        for i in range(4):
            C.sweep(bm, [corner(i, z), corner((i + 1) % 4, z)], radius=r_brace * 1.3, segs=5, mat=mat)
        if k < n:
            z2 = z0 + (z1 - z0) * (k + 1) / n
            for i in range(4):
                a, b = corner(i, z), corner((i + 1) % 4, z2)
                C.sweep(bm, [a, b], radius=r_brace, segs=5, mat=mat)


def truss_arm(bm, length, width, height, bay=2.5, r=0.12, mat=0, xform=None):
    """Box truss along -X from the origin (pivot at the tower face)."""
    n = max(1, int(length / bay))
    ys = (-width / 2, width / 2)
    zs = (-height / 2, height / 2)
    def P(x, iy, iz):
        p = Vector((-x, ys[iy], zs[iz]))
        return tuple(xform @ p) if xform else tuple(p)
    for iy in range(2):
        for iz in range(2):
            C.sweep(bm, [P(0, iy, iz), P(length, iy, iz)], radius=r * 1.4, segs=6, mat=mat)
    for k in range(n + 1):
        x = length * k / n
        C.sweep(bm, [P(x, 0, 0), P(x, 1, 0)], radius=r, segs=5, mat=mat)
        C.sweep(bm, [P(x, 0, 1), P(x, 1, 1)], radius=r, segs=5, mat=mat)
        C.sweep(bm, [P(x, 0, 0), P(x, 0, 1)], radius=r, segs=5, mat=mat)
        C.sweep(bm, [P(x, 1, 0), P(x, 1, 1)], radius=r, segs=5, mat=mat)
        if k < n:
            x2 = length * (k + 1) / n
            C.sweep(bm, [P(x, 0, 0), P(x2, 0, 1)], radius=r * 0.8, segs=5, mat=mat)
            C.sweep(bm, [P(x, 1, 1), P(x2, 1, 0)], radius=r * 0.8, segs=5, mat=mat)
            C.sweep(bm, [P(x, 0, 1), P(x2, 1, 1)], radius=r * 0.8, segs=5, mat=mat)


def boolean_diff(ob, cutter_boxes):
    cutters = []
    for i, (mn, mx) in enumerate(cutter_boxes):
        bm = bmesh.new()
        C.box(bm, tuple(b - a for a, b in zip(mn, mx)), center=tuple((a + b) / 2 for a, b in zip(mn, mx)))
        me = bpy.data.meshes.new(f"_bc{i}")
        bm.to_mesh(me)
        bm.free()
        cut = bpy.data.objects.new(f"_bc{i}", me)
        ob.users_scene[0].collection.objects.link(cut)
        cutters.append(cut)
    for cut in cutters:
        mod = ob.modifiers.new("cut", "BOOLEAN")
        mod.operation = "DIFFERENCE"
        mod.object = cut
        mod.solver = "EXACT"
    sc = ob.users_scene[0]
    with bpy.context.temp_override(scene=sc, view_layer=sc.view_layers[0]):
        dg = bpy.context.evaluated_depsgraph_get()
        dg.update()
        new_me = bpy.data.meshes.new_from_object(ob.evaluated_get(dg))
    old = ob.data
    ob.modifiers.clear()
    ob.data = new_me
    bpy.data.meshes.remove(old)
    for cut in cutters:
        me = cut.data
        bpy.data.objects.remove(cut)
        bpy.data.meshes.remove(me)


def cylinder_holes(ob, holes, z0, z1):
    cutters = []
    for i, (x, y, r) in enumerate(holes):
        bm = bmesh.new()
        C.cylinder(bm, r, z0, z1, segs=48)
        me = bpy.data.meshes.new(f"_ch{i}")
        bm.to_mesh(me)
        bm.free()
        cut = bpy.data.objects.new(f"_ch{i}", me)
        cut.location = (x, y, 0)
        ob.users_scene[0].collection.objects.link(cut)
        cutters.append(cut)
    for cut in cutters:
        mod = ob.modifiers.new("hole", "BOOLEAN")
        mod.operation = "DIFFERENCE"
        mod.object = cut
        mod.solver = "EXACT"
    sc = ob.users_scene[0]
    with bpy.context.temp_override(scene=sc, view_layer=sc.view_layers[0]):
        dg = bpy.context.evaluated_depsgraph_get()
        dg.update()
        new_me = bpy.data.meshes.new_from_object(ob.evaluated_get(dg))
    old = ob.data
    ob.modifiers.clear()
    ob.data = new_me
    bpy.data.meshes.remove(old)
    for cut in cutters:
        me = cut.data
        bpy.data.objects.remove(cut)
        bpy.data.meshes.remove(me)


# ----------------------------------------------------------------------------- build

def sky(scene):
    w = bpy.data.worlds.new("W_Pad_Sky")
    scene.world = w
    w.use_nodes = True
    nt = w.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    nb = NB(nt)
    out = nb.n("ShaderNodeOutputWorld", 700, 0)
    sk = nb.n("ShaderNodeTexSky", 0, 0)
    sk.sky_type = "MULTIPLE_SCATTERING"
    sk.sun_disc = False          # the sun lamp provides the direct light
    sk.sun_elevation = math.radians(SUN_ELEV)
    # Blender sky: sun_rotation measured around +Z; verified empirically in pad look-dev
    sk.sun_rotation = math.radians(90.0 - SUN_AZ) + math.pi / 2
    sk.altitude = 10.0
    for attr, v in (("air_density", 1.0), ("aerosol_density", 3.6), ("ozone_density", 1.0)):
        if hasattr(sk, attr):
            setattr(sk, attr, v)
    bg = nb.n("ShaderNodeBackground", 350, 0, Strength=0.05)
    nb.l(sk, bg.inputs["Color"])
    nb.l(bg, out.inputs["Surface"])
    w["sky_node"] = sk.name
    return w


def sun_direction():
    a, e = math.radians(SUN_AZ), math.radians(SUN_ELEV)
    return Vector((math.sin(a) * math.cos(e), math.cos(a) * math.cos(e), math.sin(e)))


def build(scene):
    random.seed(39)
    P = palette()
    coll = C.get_coll("Pad_39B", scene.collection)
    c_ml = C.get_coll("Mobile_Launcher_1", coll)
    c_um = C.get_coll("ML_Umbilicals", c_ml)
    c_site = C.get_coll("Pad_Site", coll)
    E = {}
    sky(scene)
    # sun lamp
    L = bpy.data.lights.new("Sun_1835EDT", "SUN")
    L.energy = 7.5
    L.angle = math.radians(0.53)
    L.color = (1.0, 0.71, 0.46)
    sun = bpy.data.objects.new("Sun_1835EDT", L)
    C.link(sun, coll)
    d = sun_direction()
    sun.rotation_euler = (-d).to_track_quat("-Z", "Y").to_euler()
    E["sun"] = sun

    # ------------------------------------------------ terrain, mound, trench
    bm = bmesh.new()
    C.lathe(bm, [(6000.0, Z_GROUND - 0.05), (0.0, Z_GROUND - 0.05)], segs=64, mat=0)
    ground = C.mesh_object("Terrain_Ground", bm, c_site, mats=[P["ground"]], smooth=0)
    bm = bmesh.new()
    top = (-85.0, -95.0, 85.0, 105.0)
    slope = 52.0
    vt = [bm.verts.new((x, y, Z_PAD)) for x, y in ((top[0], top[1]), (top[2], top[1]), (top[2], top[3]), (top[0], top[3]))]
    vb = [bm.verts.new((x, y, Z_GROUND)) for x, y in ((top[0] - slope, top[1] - slope), (top[2] + slope, top[1] - slope),
                                                     (top[2] + slope, top[3] + slope), (top[0] - slope, top[3] + slope))]
    bm.faces.new(vt)
    bm.faces.new(vb[::-1])
    for i in range(4):
        j = (i + 1) % 4
        bm.faces.new([vb[i], vb[j], vt[j], vt[i]])
    mound = C.mesh_object("Pad_Mound", bm, c_site, mats=[P["concrete"]], smooth=0)
    boolean_diff(mound, [((-TRENCH_W / 2, -30.0, TRENCH_FLOOR), (TRENCH_W / 2, 400.0, Z_PAD + 5))])
    mound.data.materials.append(P["ground"])
    mound.data.materials.append(P["concrete_dark"])
    for poly in mound.data.polygons:        # grassy slopes, concrete hardstand, scorched trench walls
        nz = poly.normal.z
        poly.material_index = 0 if nz > 0.95 else (1 if nz > 0.1 else 2)
    # trench floor + flame deflector (58 deg, faces north)
    bm = bmesh.new()
    C.box(bm, (TRENCH_W, 260.0, 0.6), center=(0, 100.0, TRENCH_FLOOR - 0.3), mat=0)
    dz = Z_PAD - TRENCH_FLOOR
    dy = dz / math.tan(math.radians(58))
    v = [bm.verts.new(p) for p in ((-TRENCH_W / 2, -8.0, Z_PAD - 0.5), (TRENCH_W / 2, -8.0, Z_PAD - 0.5),
                                   (TRENCH_W / 2, -8.0 + dy, TRENCH_FLOOR), (-TRENCH_W / 2, -8.0 + dy, TRENCH_FLOOR),
                                   (-TRENCH_W / 2, -30.0, TRENCH_FLOOR), (TRENCH_W / 2, -30.0, TRENCH_FLOOR),
                                   (TRENCH_W / 2, -30.0, Z_PAD - 0.5), (-TRENCH_W / 2, -30.0, Z_PAD - 0.5))]
    for f in ((0, 1, 2, 3), (7, 6, 1, 0), (4, 5, 6, 7), (3, 2, 5, 4), (0, 3, 4, 7), (1, 6, 5, 2)):
        face = bm.faces.new([v[i] for i in f])
        face.material_index = 1
    C.mesh_object("Pad_Trench_Deflector", bm, c_site, mats=[P["concrete_dark"], P["concrete_dark"]], smooth=0)
    # crawlerway and ramp (gravel strip to the southwest)
    bm = bmesh.new()
    a = math.radians(225)
    dirv = Vector((math.cos(a), math.sin(a), 0))
    perp = Vector((-dirv.y, dirv.x, 0))
    p0 = Vector((-60.0, -95.0, Z_PAD + 0.02))
    p1 = p0 + dirv * (slope * 1.45)
    p1.z = Z_GROUND + 0.05
    p2 = p1 + dirv * 2500.0
    for (pa, pb) in ((p0, p1), (p1, p2)):
        vs = [bm.verts.new(q) for q in (pa - perp * 20, pa + perp * 20, pb + perp * 20, pb - perp * 20)]
        bm.faces.new(vs)
    C.mesh_object("Crawlerway", bm, c_site, mats=[P["gravel"]], smooth=0)
    # ocean and beach to the east
    bm = bmesh.new()
    C.box(bm, (4000.0, 8000.0, 0.2), center=(520.0 + 2000.0, 0.0, Z_GROUND - 1.2), mat=0)
    C.mesh_object("Atlantic_Ocean", bm, c_site, mats=[P["ocean"]], smooth=0)
    bm = bmesh.new()
    C.box(bm, (70.0, 8000.0, 0.4), center=(485.0, 0.0, Z_GROUND - 0.3), mat=0)
    C.mesh_object("Beach", bm, c_site, mats=[P["sand"]], smooth=0)
    # service roads
    bm = bmesh.new()
    for (cx, cy, sx, sy) in ((0, -130, 400, 10), (140, 30, 10, 300), (-150, 60, 10, 260)):
        C.box(bm, (sx, sy, 0.3), center=(cx, cy, Z_GROUND + 0.1), mat=0)
    C.mesh_object("Pad_Roads", bm, c_site, mats=[P["concrete"]], smooth=0)

    # ------------------------------------------------ Mobile Launcher base
    bm = bmesh.new()
    C.box(bm, (ML_X1 - ML_X0, 2 * ML_Y, 7.6), center=((ML_X0 + ML_X1) / 2, 0, -3.8), mat=0)
    base = C.mesh_object("ML_Base", bm, c_ml, mats=[P["ml_steel"]], smooth=0)
    cylinder_holes(base, [(0.0, K.SRB_Y, 2.25), (0.0, -K.SRB_Y, 2.25)], -9.0, 1.0)
    boolean_diff(base, [((-3.4, -3.4, -9.0), (3.4, 3.4, 1.0))])
    base.data.materials.append(P["ml_deck"])
    # deck top plate (grating look) with the same openings
    bm = bmesh.new()
    C.box(bm, (ML_X1 - ML_X0 - 0.4, 2 * ML_Y - 0.4, 0.12), center=((ML_X0 + ML_X1) / 2, 0, 0.06), mat=0)
    deck = C.mesh_object("ML_Deck", bm, c_ml, mats=[P["ml_deck"]], smooth=0)
    cylinder_holes(deck, [(0.0, K.SRB_Y, 2.25), (0.0, -K.SRB_Y, 2.25)], -1.0, 1.0)
    boolean_diff(deck, [((-3.4, -3.4, -1.0), (3.4, 3.4, 1.0))])
    # side structure lines (girder flanges) + pedestals
    bm = bmesh.new()
    for x in [ML_X0 + 4.0 * i for i in range(13)]:
        for s in (1, -1):
            C.box(bm, (0.35, 0.25, 7.4), center=(x, s * (ML_Y + 0.1), -3.8), mat=0)
    for y in [-ML_Y + 4.05 * i for i in range(11)]:
        for x in (ML_X0 - 0.1, ML_X1 + 0.1):
            C.box(bm, (0.25, 0.35, 7.4), center=(x, y, -3.8), mat=0)
    for s in (1, -1):
        C.box(bm, (ML_X1 - ML_X0, 0.3, 0.5), center=((ML_X0 + ML_X1) / 2, s * (ML_Y + 0.15), -0.4), mat=0)
    for x in (-14.5, 26.5):
        for y in (-16.0, 0.0, 16.0):
            C.box(bm, (3.2, 3.2, 6.7), center=(x, y, Z_PAD + 3.35), mat=1)
    for z in (-1.6, -3.9, -6.2):
        for s in (1, -1):
            C.box(bm, (ML_X1 - ML_X0 + 0.2, 0.18, 0.22), center=((ML_X0 + ML_X1) / 2, s * (ML_Y + 0.12), z), mat=0)
        C.box(bm, (0.18, 2 * ML_Y + 0.2, 0.22), center=(ML_X0 - 0.12, 0, z), mat=0)
    rngp = random.Random(5)
    for k in range(18):
        x = ML_X0 + 2.0 + k * 2.6
        for s in (1, -1):
            if rngp.random() < 0.55:
                w, h = rngp.uniform(0.8, 1.8), rngp.uniform(1.2, 2.6)
                C.box(bm, (w, 0.14, h), center=(x, s * (ML_Y + 0.08), -rngp.uniform(1.8, 5.5)), mat=2)
    for k in range(4):
        C.sweep(bm, [(ML_X0 - 0.35, -ML_Y + 2, -2.4 - 1.2 * k), (ML_X0 - 0.35, ML_Y - 2, -2.4 - 1.2 * k)], radius=0.18, segs=8, mat=3)
    C.mesh_object("ML_Base_Structure_Pedestals", bm, c_ml, mats=[P["ml_steel"], P["concrete"], P["ml_deck"], P["pipe"]], smooth=0)

    # vehicle support posts (8), tail service masts (2), rainbirds, deck hardware
    bm = bmesh.new()
    for s in (1, -1):
        for k in range(4):
            a = math.radians(45 + 90 * k)
            x, y = 2.32 * math.cos(a), s * K.SRB_Y + 2.32 * math.sin(a)
            C.lathe(bm, [(0.0, 0.0), (0.75, 0.0), (0.75, 0.25), (0.45, 0.45), (0.42, 1.30), (0.55, 1.40), (0.55, 1.52), (0.0, 1.52)],
                    segs=20, mat=0, xform=Matrix.Translation((x, y, 0.0)))
    C.mesh_object("ML_VehicleSupportPosts", bm, c_ml, mats=[P["ml_steel"]])
    tsm = []
    for s in (1, -1):
        bm = bmesh.new()
        C.box(bm, (3.2, 3.0, 10.0), center=(0, 0, 5.0), mat=0)
        for k in range(5):
            C.box(bm, (3.3, 3.1, 0.12), center=(0, 0, 1.0 + 2.0 * k), mat=1)
        ob = C.mesh_object(f"ML_TSMU_{'N' if s > 0 else 'S'}", bm, c_um, mats=[P["arm"], P["ml_steel"]], smooth=0)
        ob.location = (7.4, s * 2.6, 0.0)
        tsm.append(ob)
        # carrier plate (retracts at T-0)
        bm = bmesh.new()
        C.box(bm, (3.4, 1.2, 1.3), center=(-1.7, 0, 0), mat=0)
        C.box(bm, (0.2, 1.4, 1.6), center=(-3.45, 0, 0), mat=1)
        car = C.mesh_object(f"ML_TSMU_Carrier_{'N' if s > 0 else 'S'}", bm, c_um, mats=[P["pipe"], P["dark"]], smooth=0)
        C.set_parent(car, ob, loc=(-1.6, 0.0 - s * 0.55, 7.65))
        # bonnet (closes after release)
        bm = bmesh.new()
        C.box(bm, (0.3, 2.6, 2.4), center=(0, 0, -1.2), mat=0)
        bon = C.mesh_object(f"ML_TSMU_Bonnet_{'N' if s > 0 else 'S'}", bm, c_um, mats=[P["arm"]], smooth=0)
        C.set_parent(bon, ob, loc=(-1.6, 0.0, 10.0))
        bon.rotation_euler = (0, math.radians(-95), 0)
        E[f"tsmu_{s}"] = (ob, car, bon)
    # rainbirds: deck nozzles aimed at the exhaust openings
    bm = bmesh.new()
    rain = []
    for (x, y) in ((-8.5, -10.5), (-8.5, 10.5), (8.5, -10.5), (8.5, 10.5), (-2.5, -16.5), (-2.5, 16.5)):
        C.cylinder(bm, 0.35, 0.0, 2.2, segs=12, mat=0, xform=Matrix.Translation((x, y, 0)))
        tgt = Vector((0.0, (6.85 if y > 3 else -6.85 if y < -3 else 0.0), 0.0))
        d = (tgt - Vector((x, y, 0))).normalized()
        a = math.atan2(d.y, d.x)
        xf = Matrix.Translation((x, y, 2.2)) @ C.rot_z(a) @ Matrix.Rotation(math.radians(60), 4, "Y")
        C.lathe(bm, [(0.0, 0.0), (0.3, 0.0), (0.22, 1.2), (0.28, 1.25), (0.0, 1.25)], segs=12, mat=0, xform=xf)
        rain.append((Vector((x, y, 2.2)) + (xf.to_3x3() @ Vector((0, 0, 1.25))), (xf.to_3x3() @ Vector((0, 0, 1))).normalized()))
    C.mesh_object("ML_Rainbirds", bm, c_ml, mats=[P["pipe"]])
    E["rainbirds"] = rain
    # deck equipment and railings
    bm = bmesh.new()
    for (x, y, sx, sy, sz) in ((-14, 14, 4, 3, 2.5), (-14, -14, 4, 3, 2.5), (-15, 3, 2, 5, 2.0), (12, 16, 5, 2, 2.2), (12, -16, 5, 2, 2.2)):
        C.box(bm, (sx, sy, sz), center=(x, y, sz / 2), mat=0)
    for x in [ML_X0 + 1.5 * i for i in range(33)]:
        for s in (1, -1):
            C.box(bm, (0.06, 0.06, 1.1), center=(x, s * (ML_Y - 0.3), 0.55), mat=1)
    for s in (1, -1):
        C.box(bm, (ML_X1 - ML_X0, 0.06, 0.06), center=((ML_X0 + ML_X1) / 2, s * (ML_Y - 0.3), 1.1), mat=1)
    C.mesh_object("ML_Deck_Equipment", bm, c_ml, mats=[P["ml_steel"], P["yellow"]], smooth=0)

    # ------------------------------------------------ tower
    bm = bmesh.new()
    tx0, tx1, ty = TOWER_X0, TOWER_X1, 6.1
    cols = [(tx0, -ty), (tx1, -ty), (tx1, ty), (tx0, ty)]
    for (x, y) in cols:
        C.box(bm, (0.9, 0.9, TOWER_H), center=(x, y, TOWER_H / 2), mat=0)
    lv = 20 * FT
    nlev = int(TOWER_H / lv)
    for k in range(nlev + 1):
        z = min(TOWER_H, k * lv)
        for i in range(4):
            (xa, ya), (xb, yb) = cols[i], cols[(i + 1) % 4]
            C.box(bm, (abs(xb - xa) + 0.6, abs(yb - ya) + 0.6, 0.55), center=((xa + xb) / 2, (ya + yb) / 2, z), mat=0)
        C.box(bm, (tx1 - tx0, 2 * ty, 0.12), center=((tx0 + tx1) / 2, 0, z - 0.2), mat=1)
        if k < nlev:
            z2 = min(TOWER_H, (k + 1) * lv)
            for i in range(4):
                (xa, ya), (xb, yb) = cols[i], cols[(i + 1) % 4]
                if k % 2 == 0:
                    C.sweep(bm, [(xa, ya, z), (xb, yb, z2)], radius=0.16, segs=5, mat=0)
                else:
                    C.sweep(bm, [(xb, yb, z), (xa, ya, z2)], radius=0.16, segs=5, mat=0)
    # stair/elevator enclosure, top crane and antenna
    C.box(bm, (4.5, 4.0, TOWER_H - 2), center=(tx1 - 3.0, ty - 2.6, TOWER_H / 2), mat=2)
    C.box(bm, (1.2, 1.2, 12.0), center=(tx1 - 2, -ty + 2, TOWER_H + 6), mat=0)
    C.box(bm, (16.0, 0.9, 0.9), center=(tx1 - 9.0, -ty + 2, TOWER_H + 11.5), mat=0)
    C.cylinder(bm, 0.12, TOWER_H, TOWER_H + 9, segs=8, mat=0, xform=Matrix.Translation((tx0 + 1, ty - 1, 0)))
    C.mesh_object("ML_Tower", bm, c_ml, mats=[P["tower"], P["ml_deck"], P["ml_steel"]], smooth=0)

    # ------------------------------------------------ swing-arm umbilicals (pivot at tower face)
    def arm(name, z_c, x_tip, width, height, pivot_y, plate=True):
        bm = bmesh.new()
        length = TOWER_X0 - x_tip
        xf = Matrix.Translation((0, -pivot_y, 0))
        truss_arm(bm, length, width, height, mat=0, xform=xf)
        if plate:
            C.box(bm, (0.5, width + 0.3, height + 0.3), center=(-length - 0.1, -pivot_y, 0), mat=1)
        ob = C.mesh_object(name, bm, c_um, mats=[P["arm"], P["pipe"]], smooth=0)
        ob.location = (TOWER_X0, pivot_y, z_c)
        return ob

    E["CSITU"] = arm("ML_CoreStage_Intertank_Umbilical", K.Z_LH2_TOP + 3.4, K.CORE_R + 0.35, 2.4, 2.6, 1.6)
    E["CSFSU"] = arm("ML_CoreStage_ForwardSkirt_Umbilical", K.Z_LOX_TOP + 2.0, K.CORE_R + 0.35, 2.2, 2.4, 1.4)
    E["ICPSU"] = arm("ML_ICPS_Umbilical", K.Z_ICPS_BOTTOM + 9.8, K.ICPS_R + 0.3, 2.0, 2.2, 1.3)
    E["VSS"] = arm("ML_Vehicle_Stabilizer", K.Z_LOX_TOP + 0.3, K.CORE_R + 0.9, 1.4, 1.2, -1.6, plate=False)
    # Orion service module umbilical: boom from a safe house, tilted down to the SAJ region
    bm = bmesh.new()
    truss_arm(bm, 13.6, 1.6, 1.6, mat=0, xform=Matrix.Rotation(math.radians(-12), 4, "Y"))
    C.box(bm, (0.6, 1.9, 1.9), center=(-13.3, 0, -2.9), mat=1)
    osmu = C.mesh_object("ML_Orion_ServiceModule_Umbilical", bm, c_um, mats=[P["arm"], P["pipe"]], smooth=0)
    osmu.location = (TOWER_X0, -1.8, 85.3)
    E["OSMU"] = osmu
    bm = bmesh.new()
    C.box(bm, (5.0, 4.4, 5.6), center=(-1.0, -1.8, 88.0), mat=0)
    C.mesh_object("ML_OSMU_SafeHouse", bm, c_um, mats=[P["white"]], smooth=0).location = (TOWER_X0, 0, 0)
    # crew access arm, retracted along the tower's north face (white room at the end)
    bm = bmesh.new()
    C.box(bm, (3.0, 18.0, 3.2), center=(0, 9.0, 0), mat=0)
    C.box(bm, (4.2, 3.4, 5.6), center=(0, 19.2, 0.8), mat=0)
    for k in range(10):
        C.box(bm, (3.2, 0.12, 3.3), center=(0, 1.0 + 1.8 * k, 0), mat=1)
    caa = C.mesh_object("ML_Crew_Access_Arm", bm, c_um, mats=[P["white"], P["arm"]], smooth=0)
    caa.location = (TOWER_X0 - 1.5, 6.1, 274 * FT + 1.6)
    E["CAA"] = caa

    # ------------------------------------------------ lightning protection system
    bm = bmesh.new()
    towers = [(-105.0, -110.0), (-105.0, 125.0), (135.0, 10.0)]
    tops = []
    for (x, y) in towers:
        lattice_mast(bm, x, y, Z_GROUND, Z_GROUND + 150.0, 4.2, 2.0, bay=7.5, r_chord=0.22, r_brace=0.08)
        C.cylinder(bm, 0.45, Z_GROUND + 150.0, Z_GROUND + 600 * FT, segs=10, mat=1, xform=Matrix.Translation((x, y, 0)))
        tops.append(Vector((x, y, Z_GROUND + 600 * FT - 1.0)))
    wires = []
    for i in range(3):
        wires.append((tops[i], tops[(i + 1) % 3]))
        out = (tops[i] - Vector((0, 0, tops[i].z))).normalized()
        anchor = Vector((tops[i].x, tops[i].y, Z_GROUND)) + Vector((out.x, out.y, 0)) * 150.0
        wires.append((tops[i], anchor))
    for a_, b_ in wires:
        pts = []
        for k in range(25):
            t = k / 24
            p = a_.lerp(b_, t)
            p.z -= 18.0 * 4 * t * (1 - t) * (1.0 if abs(a_.z - b_.z) < 1 else 0.3)
            pts.append(tuple(p))
        C.sweep(bm, pts, radius=0.06, segs=4, mat=2)
    C.mesh_object("Pad_Lightning_Protection", bm, c_site, mats=[P["tower"], P["white"], P["dark"]], smooth=0)

    # ------------------------------------------------ water tower, propellant spheres, buildings
    bm = bmesh.new()
    wx, wy = -205.0, 170.0
    for k in range(6):
        a = C.TAU * k / 6
        C.sweep(bm, [(wx + 11 * math.cos(a), wy + 11 * math.sin(a), Z_GROUND), (wx + 6 * math.cos(a), wy + 6 * math.sin(a), Z_GROUND + 62)], radius=0.6, segs=8, mat=0)
    C.cylinder(bm, 1.8, Z_GROUND, Z_GROUND + 66, segs=16, mat=0, xform=Matrix.Translation((wx, wy, 0)))
    prof = [(0.0, Z_GROUND + 60.0)] + [(11.5 * math.sin(math.pi * k / 16), Z_GROUND + 71.0 - 11.0 * math.cos(math.pi * k / 16)) for k in range(1, 16)] + [(0.0, Z_GROUND + 82.0)]
    C.lathe(bm, prof, segs=48, mat=0, xform=Matrix.Translation((wx, wy, 0)))
    for (x, y, r) in ((155.0, 150.0, 12.8), (-185.0, -40.0, 11.0)):
        prof = [(0.0, Z_GROUND + 4.0)] + [(r * math.sin(math.pi * k / 20), Z_GROUND + 4.0 + r - r * math.cos(math.pi * k / 20)) for k in range(1, 20)] + [(0.0, Z_GROUND + 4.0 + 2 * r)]
        C.lathe(bm, prof, segs=64, mat=0, xform=Matrix.Translation((x, y, 0)))
        for k in range(8):
            a = C.TAU * k / 8
            C.box(bm, (0.8, 0.8, 4.0 + r * 0.6), center=(x + r * 0.75 * math.cos(a), y + r * 0.75 * math.sin(a), Z_GROUND + (4.0 + r * 0.6) / 2), mat=1)
    for (x, y, sx, sy, sz) in ((70, -140, 30, 18, 8), (-120, -150, 22, 14, 6), (175, 90, 14, 30, 7), (-230, 60, 18, 18, 9), (60, 210, 26, 12, 6)):
        C.box(bm, (sx, sy, sz), center=(x, y, Z_GROUND + sz / 2), mat=2)
    C.mesh_object("Pad_Water_Tower_Spheres_Buildings", bm, c_site, mats=[P["white"], P["ml_steel"], P["concrete"]], smooth=40)
    # distant tree line (dark scrub silhouette) on a ring
    bm = bmesh.new()
    rng = random.Random(7)
    for k in range(260):
        a = C.TAU * k / 260 + rng.uniform(-0.01, 0.01)
        r = rng.uniform(1300, 2600)
        x, y = r * math.cos(a), r * math.sin(a)
        if x > 480:
            continue
        h = rng.uniform(6, 14)
        sx, sy = rng.uniform(40, 120), rng.uniform(20, 60)
        if math.hypot(x - S20_CAM[0], y - S20_CAM[1]) < 1400.0:
            continue          # keep the wide ascent camera's foreground open
        # tree clump: a few overlapping squashed canopy domes along the clump's long axis
        rr = random.Random(k * 31 + 5)
        rot = rr.uniform(0, math.pi)
        for j in range(rr.randint(3, 5)):
            u = rr.uniform(-0.5, 0.5) * sx
            cx, cy = x + u * math.cos(rot), y + u * math.sin(rot)
            rad = rr.uniform(0.35, 0.6) * sy
            hh = h * rr.uniform(0.7, 1.15)
            prof = [(0.0, Z_GROUND - 1.0)] + [(rad * math.cos(t), Z_GROUND - 1.0 + hh * math.sin(t) ** 0.8) for t in (0.0, 0.35, 0.7, 1.05, 1.35)] + [(0.0, Z_GROUND - 1.0 + hh)]
            C.lathe(bm, prof, segs=12, mat=0, xform=Matrix.Translation((cx, cy, 0)) @ C.rot_z(rot) @ Matrix.Diagonal((1.35, 0.85, 1.0, 1.0)))
    C.mesh_object("Distant_Scrub", bm, c_site, mats=[paint("Scrub_Dark", base=(0.025, 0.035, 0.018), rough=0.95, var=0.2, bump=0.0)], smooth=50)
    return E
