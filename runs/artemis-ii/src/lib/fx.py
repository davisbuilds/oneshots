"""Launch effects: deterministic geometry-node particles, plumes, shaders.

Particles are analytic: every point stores its birth frame, lifetime,
initial velocity, drag, vertical acceleration and growth. Position at age a:
    p = p0 + v0 (1 - e^(-k a)) / k + 0.5 g a^2 z + wind a
so any frame renders independently (no cache, resumable, editable).
"""
import math
import random

import bmesh
import bpy
from mathutils import Vector

from . import common as C
from .materials import NB, _new_material

FPS = 24


# ----------------------------------------------------------------------------- GN group

def _gn_group(name, streak=False):
    if name in bpy.data.node_groups:
        return bpy.data.node_groups[name]
    ng = bpy.data.node_groups.new(name, "GeometryNodeTree")
    ng.interface.new_socket("Geometry", in_out="INPUT", socket_type="NodeSocketGeometry")
    ng.interface.new_socket("Instance", in_out="INPUT", socket_type="NodeSocketObject")
    ng.interface.new_socket("Scale Mult", in_out="INPUT", socket_type="NodeSocketFloat").default_value = 1.0
    ng.interface.new_socket("Geometry", in_out="OUTPUT", socket_type="NodeSocketGeometry")
    N, Lk = ng.nodes, ng.links
    gi = N.new("NodeGroupInput")
    go = N.new("NodeGroupOutput")

    def attr(nm, vec=False):
        a = N.new("GeometryNodeInputNamedAttribute")
        a.data_type = "FLOAT_VECTOR" if vec else "FLOAT"
        a.inputs["Name"].default_value = nm
        return a.outputs["Attribute"]

    def m(op, a, b=None, c=None):
        n = N.new("ShaderNodeMath")
        n.operation = op
        for i, v in enumerate((a, b, c)):
            if v is None:
                continue
            if isinstance(v, (int, float)):
                n.inputs[i].default_value = v
            else:
                Lk.new(v, n.inputs[i])
        return n.outputs[0]

    def vm(op, a, b=None, scale=None):
        n = N.new("ShaderNodeVectorMath")
        n.operation = op
        if isinstance(a, (tuple, list)):
            n.inputs[0].default_value = a
        else:
            Lk.new(a, n.inputs[0])
        if b is not None:
            if isinstance(b, (tuple, list)):
                n.inputs[1].default_value = b
            else:
                Lk.new(b, n.inputs[1])
        if scale is not None:
            if isinstance(scale, (int, float)):
                n.inputs["Scale"].default_value = scale
            else:
                Lk.new(scale, n.inputs["Scale"])
        return n.outputs["Vector"] if op != "LENGTH" else n.outputs["Value"]

    st = N.new("GeometryNodeInputSceneTime")
    birth, life = attr("birth"), attr("life")
    age = m("DIVIDE", m("SUBTRACT", st.outputs["Frame"], birth), float(FPS))
    dead = N.new("FunctionNodeBooleanMath")
    dead.operation = "OR"
    Lk.new(m("LESS_THAN", age, 0.0), dead.inputs[0])
    Lk.new(m("GREATER_THAN", age, life), dead.inputs[1])
    dele = N.new("GeometryNodeDeleteGeometry")
    dele.domain = "POINT"
    Lk.new(gi.outputs["Geometry"], dele.inputs["Geometry"])
    Lk.new(dead.outputs[0], dele.inputs["Selection"])

    k = m("MAXIMUM", attr("drag"), 0.001)
    ek = m("EXPONENT", m("MULTIPLY", m("MULTIPLY", k, age), -1.0))
    fdrag = m("DIVIDE", m("SUBTRACT", 1.0, ek), k)
    v0 = attr("v0", vec=True)
    wind = attr("wind", vec=True)
    grav = attr("grav")
    d1 = vm("SCALE", v0, scale=fdrag)
    gz = N.new("ShaderNodeCombineXYZ")
    Lk.new(m("MULTIPLY", m("MULTIPLY", grav, 0.5), m("MULTIPLY", age, age)), gz.inputs["Z"])
    d2 = vm("SCALE", wind, scale=age)
    disp = vm("ADD", vm("ADD", d1, gz.outputs["Vector"]), d2)
    sp = N.new("GeometryNodeSetPosition")
    Lk.new(dele.outputs["Geometry"], sp.inputs["Geometry"])
    Lk.new(disp, sp.inputs["Offset"])

    s0, s1, tau = attr("s0"), attr("s1"), attr("tau")
    grow = m("SUBTRACT", 1.0, m("EXPONENT", m("MULTIPLY", m("DIVIDE", age, m("MAXIMUM", tau, 0.01)), -1.0)))
    s = m("MULTIPLY", m("ADD", s0, m("MULTIPLY", m("SUBTRACT", s1, s0), grow)), gi.outputs["Scale Mult"])

    iop = N.new("GeometryNodeInstanceOnPoints")
    Lk.new(sp.outputs["Geometry"], iop.inputs["Points"])
    oi = N.new("GeometryNodeObjectInfo")
    oi.inputs["As Instance"].default_value = True
    Lk.new(gi.outputs["Instance"], oi.inputs["Object"])
    Lk.new(oi.outputs["Geometry"], iop.inputs["Instance"])
    if streak:
        # velocity at age: v0 e^-ka + g a z + wind
        vz = N.new("ShaderNodeCombineXYZ")
        Lk.new(m("MULTIPLY", grav, age), vz.inputs["Z"])
        vel = vm("ADD", vm("ADD", vm("SCALE", v0, scale=ek), vz.outputs["Vector"]), wind)
        al = N.new("FunctionNodeAlignRotationToVector")
        al.axis = "Z"
        Lk.new(vel, al.inputs["Vector"])
        Lk.new(al.outputs["Rotation"], iop.inputs["Rotation"])
        speed = vm("LENGTH", vel)
        sc = N.new("ShaderNodeCombineXYZ")
        Lk.new(s, sc.inputs["X"])
        Lk.new(s, sc.inputs["Y"])
        Lk.new(m("MULTIPLY", s, m("MULTIPLY_ADD", speed, attr("stretch"), 1.0)), sc.inputs["Z"])
        Lk.new(sc.outputs["Vector"], iop.inputs["Scale"])
    else:
        er = N.new("FunctionNodeEulerToRotation")
        Lk.new(attr("rot", vec=True), er.inputs["Euler"])
        Lk.new(er.outputs["Rotation"], iop.inputs["Rotation"])
        sv = N.new("ShaderNodeCombineXYZ")
        for ax in "XYZ":
            Lk.new(s, sv.inputs[ax])
        Lk.new(sv.outputs["Vector"], iop.inputs["Scale"])
    # per-instance shading attributes
    agen = m("DIVIDE", age, m("MAXIMUM", life, 0.01))
    stn = N.new("GeometryNodeStoreNamedAttribute")
    stn.data_type = "FLOAT"
    stn.domain = "INSTANCE"
    stn.inputs["Name"].default_value = "fx_age"
    Lk.new(iop.outputs["Instances"], stn.inputs["Geometry"])
    Lk.new(agen, stn.inputs["Value"])
    st2 = N.new("GeometryNodeStoreNamedAttribute")
    st2.data_type = "FLOAT"
    st2.domain = "INSTANCE"
    st2.inputs["Name"].default_value = "fx_heat"
    Lk.new(stn.outputs["Geometry"], st2.inputs["Geometry"])
    heat = m("MULTIPLY", attr("heat"), m("EXPONENT", m("MULTIPLY", age, -0.9)))
    Lk.new(heat, st2.inputs["Value"])
    st3 = N.new("GeometryNodeStoreNamedAttribute")
    st3.data_type = "FLOAT"
    st3.domain = "INSTANCE"
    st3.inputs["Name"].default_value = "fx_seed"
    Lk.new(st2.outputs["Geometry"], st3.inputs["Geometry"])
    Lk.new(attr("seed"), st3.inputs["Value"])
    Lk.new(st3.outputs["Geometry"], go.inputs["Geometry"])
    return ng


# ----------------------------------------------------------------------------- emitters

FIELDS_F = ["birth", "life", "drag", "grav", "s0", "s1", "tau", "stretch", "heat", "seed"]
FIELDS_V = ["v0", "wind", "rot"]


def emitter(name, coll, particles, instance, material=None, streak=False, scale_mult=1.0):
    """particles: list of dicts with p0 + FIELDS. Creates a point mesh + GN modifier."""
    me = bpy.data.meshes.new(name)
    me.vertices.add(len(particles))
    co = []
    for p in particles:
        co.extend(p["p0"])
    me.vertices.foreach_set("co", co)
    for f in FIELDS_F:
        a = me.attributes.new(f, "FLOAT", "POINT")
        a.data.foreach_set("value", [float(p.get(f, 0.0)) for p in particles])
    for f in FIELDS_V:
        a = me.attributes.new(f, "FLOAT_VECTOR", "POINT")
        flat = []
        for p in particles:
            flat.extend(p.get(f, (0.0, 0.0, 0.0)))
        a.data.foreach_set("vector", flat)
    me.update()
    ob = bpy.data.objects.new(name, me)
    C.link(ob, coll)
    mod = ob.modifiers.new("FX", "NODES")
    mod.node_group = _gn_group("FX_Streaks" if streak else "FX_Puffs", streak=streak)
    ident = {s.name: s.identifier for s in mod.node_group.interface.items_tree if getattr(s, "in_out", "") == "INPUT"}
    mod[ident["Instance"]] = instance
    mod[ident["Scale Mult"]] = scale_mult
    if material is not None and instance.data.materials:
        pass
    return ob


def puff_mesh(coll, name="FX_Puff", seed=1, subdiv=3):
    """Cumulus-like puff: icosphere with low-frequency noise displacement."""
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=subdiv, radius=1.0)
    rng = random.Random(seed)
    lobes = [(Vector((rng.uniform(-1, 1), rng.uniform(-1, 1), rng.uniform(-0.6, 1))).normalized(), rng.uniform(0.25, 0.5), rng.uniform(0.35, 0.7)) for _ in range(9)]
    lobes += [(Vector((rng.uniform(-1, 1), rng.uniform(-1, 1), rng.uniform(-0.4, 1))).normalized(), rng.uniform(0.08, 0.16), rng.uniform(0.12, 0.22)) for _ in range(40)]
    for v in bm.verts:
        n = v.co.normalized()
        d = 0.0
        for dirv, amp, width in lobes:
            t = max(0.0, n.dot(dirv) - (1 - width)) / width
            d += amp * (t * t * (3 - 2 * t))
        d += 0.05 * math.sin(9 * n.x + 3 * n.y) * math.cos(7 * n.z + 2 * n.x) + 0.03 * math.sin(17 * n.y + 5 * n.z)
        v.co = n * (1.0 + d)
        if v.co.z < -0.55:
            v.co.z = -0.55 + (v.co.z + 0.55) * 0.35   # flatter, denser underside
    ob = C.mesh_object(name, bm, coll, smooth=180)
    ob.hide_render = True
    ob.hide_viewport = True
    ob.location = (0, 0, -2000)
    return ob


def streak_mesh(coll, name="FX_Streak"):
    bm = bmesh.new()
    C.lathe(bm, [(0.0, -1.0), (0.6, -0.6), (1.0, 0.0), (0.6, 0.6), (0.0, 1.0)], segs=8)
    ob = C.mesh_object(name, bm, coll, smooth=180)
    ob.hide_render = True
    ob.hide_viewport = True
    ob.location = (0, 0, -2000)
    return ob


# ----------------------------------------------------------------------------- shaders

def smoke_material(name, base=(0.80, 0.80, 0.80), shadow=(0.30, 0.33, 0.40), translucency=0.35, soot=0.0):
    m, nb, out = _new_material(name)
    at_age = nb.n("ShaderNodeAttribute", -900, 200, attribute_type="INSTANCER", attribute_name="fx_age")
    at_heat = nb.n("ShaderNodeAttribute", -900, 0, attribute_type="INSTANCER", attribute_name="fx_heat")
    at_seed = nb.n("ShaderNodeAttribute", -900, -200, attribute_type="INSTANCER", attribute_name="fx_seed")
    tc = nb.n("ShaderNodeTexCoord", -900, -400)
    n1 = nb.n("ShaderNodeTexNoise", -650, -350, noise_dimensions="4D", Scale=2.2, Detail=2.0, Roughness=0.55)
    nb.l(nb.out(tc, "Object"), n1.inputs["Vector"])
    nb.l(nb.out(at_seed, "Factor"), n1.inputs["W"])
    col = nb.ramp(n1, [(0.3, tuple(c * (1 - soot) * 0.82 for c in base)), (0.7, tuple(c * (1 - soot * 0.5) for c in base))], x=-400, y=-300)
    dif = nb.n("ShaderNodeBsdfDiffuse", -100, 150, Roughness=1.0)
    nb.l(nb.out(col, "Color"), dif.inputs["Color"])
    # small-scale billows as shading detail (instance-local coords scale with the puff)
    n2 = nb.n("ShaderNodeTexNoise", -650, -700, Scale=3.2, Detail=2.0, Roughness=0.6)
    nb.l(nb.out(tc, "Object"), n2.inputs["Vector"])
    bmp = nb.n("ShaderNodeBump", -300, -650, Strength=0.18, Distance=0.10)
    nb.l(n2, bmp.inputs["Height"])
    nb.l(bmp, dif.inputs["Normal"])
    # light bleeding through thin, backlit edges
    trl = nb.n("ShaderNodeBsdfTranslucent", -100, 0)
    nb.l(nb.out(col, "Color"), trl.inputs["Color"])
    mix = nb.n("ShaderNodeMixShader", 100, 100)
    mix.inputs[0].default_value = translucency
    nb.l(dif, mix.inputs[1])
    nb.l(trl, mix.inputs[2])
    # heat glow (near the plumes; lights do the real illumination)
    em = nb.n("ShaderNodeEmission", 120, -150, Color=(1.0, 0.55, 0.22, 1))
    hs = nb.math("MULTIPLY", nb.out(at_heat, "Factor"), 6.0, x=-100, y=-250)
    nb.l(hs, em.inputs["Strength"])
    add = nb.n("ShaderNodeAddShader", 320, 50)
    nb.l(mix, add.inputs[0])
    nb.l(em, add.inputs[1])
    # soft silhouette and age fade
    lw = nb.n("ShaderNodeLayerWeight", -400, 400, Blend=0.45)
    facing = nb.math("POWER", nb.out(lw, "Facing"), 1.2, x=-200, y=400)
    # silhouette eroded by the puff's own noise: wispy edges instead of a hard outline
    nmix = nb.math("MULTIPLY_ADD", nb.out(n1, "Factor"), 0.55, nb.math("MULTIPLY", nb.out(n2, "Factor"), 0.45, x=-350, y=560), x=-280, y=520)
    erode = nb.math("MULTIPLY_ADD", nmix, 0.9, -0.7, x=-200, y=500)
    edge = nb.math("ADD", nb.math("SUBTRACT", 1.0, facing, x=-50, y=400), erode, x=40, y=450)
    edge = nb.math("MULTIPLY", edge, 2.2, x=120, y=400, clamp=True)
    fade_in = nb.math("MULTIPLY", nb.out(at_age, "Factor"), 25.0, x=-200, y=250, clamp=True)
    fade_out = nb.math("SUBTRACT", 1.0, nb.math("POWER", nb.out(at_age, "Factor"), 3.0, x=-200, y=180), x=-50, y=200)
    alpha = nb.math("MULTIPLY", nb.math("MULTIPLY", edge, fade_in, x=200, y=350), fade_out, x=330, y=330)
    tr = nb.n("ShaderNodeBsdfTransparent", 320, 250)
    mixa = nb.n("ShaderNodeMixShader", 600, 100)
    nb.l(alpha, mixa.inputs[0])
    nb.l(tr, mixa.inputs[1])
    nb.l(add, mixa.inputs[2])
    nb.l(mixa, out.inputs["Surface"])
    return m


def water_material(name="FX_Water"):
    m, nb, out = _new_material(name)
    at_age = nb.n("ShaderNodeAttribute", -700, 200, attribute_type="INSTANCER", attribute_name="fx_age")
    bsdf = nb.n("ShaderNodeBsdfPrincipled", -200, 0, Roughness=0.35, **{"Base Color": (0.9, 0.92, 0.94, 1)})
    tr = nb.n("ShaderNodeBsdfTransparent", -200, 200)
    a = nb.math("SUBTRACT", 0.6, nb.math("MULTIPLY", nb.out(at_age, "Factor"), 0.35, x=-450, y=200), x=-300, y=250)
    mix = nb.n("ShaderNodeMixShader", 150, 100)
    nb.l(a, mix.inputs[0])
    nb.l(tr, mix.inputs[1])
    nb.l(bsdf, mix.inputs[2])
    nb.l(mix, out.inputs["Surface"])
    return m


def spark_material(name="FX_Spark"):
    m, nb, out = _new_material(name)
    at_age = nb.n("ShaderNodeAttribute", -700, 200, attribute_type="INSTANCER", attribute_name="fx_age")
    s = nb.math("MULTIPLY", nb.math("SUBTRACT", 1.0, nb.out(at_age, "Factor"), x=-450, y=150), 60.0, x=-300, y=150)
    em = nb.n("ShaderNodeEmission", -50, 50, Color=(1.0, 0.55, 0.18, 1))
    nb.l(s, em.inputs["Strength"])
    nb.l(em, out.inputs["Surface"])
    return m


def plume_material(name, kind="rs25"):
    """Additive plume: emission + transparent, brightness from the object
    property 'throttle', Mach diamonds for the RS-25, turbulence for the SRB.
    Local frame: plume axis along -Z from the nozzle exit (z = 0)."""
    m, nb, out = _new_material(name)
    tc = nb.n("ShaderNodeTexCoord", -1200, 0)
    sep = nb.n("ShaderNodeSeparateXYZ", -1000, 0)
    nb.l(nb.out(tc, "Object"), sep.inputs[0])
    d = nb.math("MULTIPLY", nb.out(sep, "Z"), -1.0, x=-850, y=0)
    thr = nb.n("ShaderNodeAttribute", -1000, 300, attribute_type="OBJECT", attribute_name="throttle")
    lw = nb.n("ShaderNodeLayerWeight", -1000, -300, Blend=0.5)
    facing = nb.out(lw, "Facing")
    core = nb.math("POWER", nb.math("SUBTRACT", 1.0, facing, x=-800, y=-300), 1.8, x=-650, y=-300)   # 1 at centre
    noise = nb.n("ShaderNodeTexNoise", -800, -600, noise_dimensions="4D", Scale=0.35 if kind == "srb" else 0.8, Detail=2.0, Roughness=0.6)
    nb.l(nb.out(tc, "Object"), noise.inputs["Vector"])
    noise.inputs["W"].default_value = 0.0
    if kind == "rs25":
        length_fall = nb.math("EXPONENT", nb.math("MULTIPLY", d, -1.0 / 9.0, x=-700, y=100), x=-550, y=100)
        dia = nb.math("POWER", nb.math("MULTIPLY_ADD", nb.math("COSINE", nb.math("MULTIPLY", d, math.tau / 2.4, x=-700, y=250), x=-550, y=250), 0.5, 0.5, x=-420, y=250), 10.0, x=-300, y=250)
        dia = nb.math("MULTIPLY", dia, nb.math("EXPONENT", nb.math("MULTIPLY", d, -1.0 / 7.0, x=-450, y=350), x=-330, y=350), x=-180, y=250)
        base_col = (0.55, 0.62, 1.0)
        dia_col = (1.0, 0.72, 0.42)
        e1 = nb.n("ShaderNodeEmission", -100, 100, Color=(*base_col, 1))
        e2 = nb.n("ShaderNodeEmission", -100, -50, Color=(*dia_col, 1))
        s1 = nb.math("MULTIPLY", nb.math("MULTIPLY", length_fall, core, x=-300, y=100), 7.0, x=-200, y=100)
        s2 = nb.math("MULTIPLY", nb.math("MULTIPLY", dia, core, x=-120, y=200), 140.0, x=-20, y=200)
        nb.l(s1, e1.inputs["Strength"])
        nb.l(s2, e2.inputs["Strength"])
        add = nb.n("ShaderNodeAddShader", 150, 50)
        nb.l(e1, add.inputs[0])
        nb.l(e2, add.inputs[1])
        emit = add
    else:
        length_fall = nb.math("EXPONENT", nb.math("MULTIPLY", d, -1.0 / 38.0, x=-700, y=100), x=-550, y=100)
        turb = nb.math("POWER", nb.math("MULTIPLY_ADD", noise, 1.6, -0.15, x=-650, y=-550, clamp=True), 1.5, x=-560, y=-550)
        turb = nb.math("MULTIPLY_ADD", turb, 1.3, 0.12, x=-470, y=-550)
        cr = nb.ramp(nb.math("MULTIPLY", length_fall, core, x=-400, y=0), [(0.0, (0.95, 0.30, 0.05)), (0.3, (1.0, 0.62, 0.22)), (0.75, (1.0, 0.88, 0.62)), (1.0, (1.0, 0.97, 0.9))], x=-250, y=0)
        e1 = nb.n("ShaderNodeEmission", 50, 50)
        nb.l(nb.out(cr, "Color"), e1.inputs["Color"])
        s1 = nb.math("MULTIPLY", nb.math("MULTIPLY", nb.math("MULTIPLY", length_fall, core, x=-300, y=150), turb, x=-150, y=150), 42.0, x=-20, y=150)
        nb.l(s1, e1.inputs["Strength"])
        emit = e1
    thr_s = nb.n("ShaderNodeMix", 300, 150, data_type="FLOAT")
    # scale emission by throttle via a mix with black emission
    black = nb.n("ShaderNodeEmission", 300, -100, Strength=0.0)
    ms = nb.n("ShaderNodeMixShader", 450, 50)
    nb.l(nb.out(thr, "Factor"), ms.inputs[0])
    nb.l(black, ms.inputs[1])
    nb.l(emit, ms.inputs[2])
    tr = nb.n("ShaderNodeBsdfTransparent", 450, 250)
    add = nb.n("ShaderNodeAddShader", 650, 100)
    nb.l(tr, add.inputs[0])
    nb.l(ms, add.inputs[1])
    nb.l(add, out.inputs["Surface"])
    m.node_tree.nodes.remove(thr_s)
    m["noise_node"] = noise.name
    return m


def plume_mesh(name, coll, r0, length, grow, grow2, segs=48, rings=40):
    bm = bmesh.new()
    prof = []
    for k in range(rings + 1):
        dd = length * (k / rings) ** 1.3
        prof.append((r0 + grow * dd + grow2 * dd * dd, -dd))
    C.lathe(bm, prof[::-1], segs=segs, mat=0)
    return C.mesh_object(name, bm, coll, smooth=180)
