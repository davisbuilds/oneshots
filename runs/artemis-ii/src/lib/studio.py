"""Dark assembly studio: glossy dark floor, near-black gradient void,
reflection-only light bars. Per-shot key/rim lights live in anim_studio."""
import math

import bmesh
import bpy
from mathutils import Vector

from . import common as C
from .materials import NB, _new_material


def floor_material():
    m, nb, out = _new_material("Studio_Floor")
    tc = nb.n("ShaderNodeTexCoord", -900, 0)
    n1 = nb.n("ShaderNodeTexNoise", -600, 100, Scale=0.035, Detail=1.0, Roughness=0.5)
    nb.l(nb.out(tc, "Object"), n1.inputs["Vector"])
    rough = nb.ramp(n1, [(0.3, (0.20, 0.20, 0.20)), (0.75, (0.34, 0.34, 0.34))], x=-300, y=100)
    bsdf = nb.n("ShaderNodeBsdfPrincipled", 200, 0, **{"Base Color": (0.006, 0.0062, 0.0068, 1), "Specular IOR Level": 0.5})
    nb.l(nb.out(rough, "Color"), bsdf.inputs["Roughness"])
    # soft falloff of the floor into the void far from the set
    geo = nb.n("ShaderNodeNewGeometry", -900, -500)
    ln = nb.n("ShaderNodeVectorMath", -700, -500, operation="LENGTH")
    nb.l(nb.out(geo, "Position"), ln.inputs[0])
    mr = nb.n("ShaderNodeMapRange", -500, -500)
    nb.l(nb.out(ln, "Value"), mr.inputs["Value"])
    mr.inputs["From Min"].default_value = 180.0
    mr.inputs["From Max"].default_value = 900.0
    tr = nb.n("ShaderNodeBsdfTransparent", 200, -300)
    mix = nb.n("ShaderNodeMixShader", 500, 0)
    nb.l(mr, mix.inputs[0])
    nb.l(bsdf, mix.inputs[1])
    nb.l(tr, mix.inputs[2])
    nb.l(mix, out.inputs["Surface"])
    return m


def world(scene):
    w = bpy.data.worlds.new("W_Studio")
    scene.world = w
    w.use_nodes = True
    nt = w.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    nb = NB(nt)
    out = nb.n("ShaderNodeOutputWorld", 600, 0)
    tc = nb.n("ShaderNodeTexCoord", -600, 0)
    sep = nb.n("ShaderNodeSeparateXYZ", -400, 0)
    nb.l(nb.out(tc, "Generated"), sep.inputs[0])
    col = nb.ramp(nb.out(sep, "Z"), [(0.45, (0.0065, 0.0072, 0.0090)), (0.56, (0.0028, 0.0030, 0.0036)), (1.0, (0.0008, 0.0008, 0.0010))], x=-200, y=0)
    bg = nb.n("ShaderNodeBackground", 300, 0, Strength=1.0)
    nb.l(nb.out(col, "Color"), bg.inputs["Color"])
    nb.l(bg, out.inputs["Surface"])
    return w


def build(scene):
    coll = C.get_coll("Studio_Environment", scene.collection)
    world(scene)
    bm = bmesh.new()
    C.lathe(bm, [(0.0, 0.0), (1000.0, 0.0)][::-1], segs=96, mat=0)
    # radial rings so the floor tessellation is not too coarse near the set
    fl = C.mesh_object("Studio_Floor", bm, coll, mats=[floor_material()], smooth=0)
    # reflection-only light bars on a wide arc behind the set
    em = _new_material("Studio_LightBar")[0]
    nt = em.node_tree
    nb = NB(nt)
    e = nb.n("ShaderNodeEmission", 300, 0, Color=(1.0, 0.97, 0.92, 1), Strength=6.0)
    nb.l(e, nt.nodes["Material Output"].inputs["Surface"])
    em.cycles.emission_sampling = "NONE"   # seen in reflections only; never sampled as a light
    for i, (az, h) in enumerate(((140, 160), (165, 160), (195, 160), (220, 160), (60, 120), (-40, 120), (-80, 110))):
        a = math.radians(az)
        bm = bmesh.new()
        C.box(bm, (2.0, 2.0, h), center=(0, 0, h / 2 + 5))
        ob = C.mesh_object(f"Studio_LightBar_{i}", bm, coll, mats=[em], smooth=0)
        ob.location = (260 * math.cos(a), 260 * math.sin(a), 0)
        ob.visible_camera = False
        ob.visible_shadow = False
        ob.visible_diffuse = False
    return coll
