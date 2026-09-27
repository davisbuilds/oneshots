"""Procedural materials for the Artemis II vehicle, studio and pad.

Colors are linear-light RGB. Patterns use Object coordinates in meters so
textures stay locked to parts while they move through the assembly.
"""
from __future__ import annotations

import math
import os

import bpy

_CACHE: dict[str, bpy.types.Material] = {}


class NB:
    """Tiny node-graph builder."""

    def __init__(self, tree):
        self.t = tree
        self.nodes = tree.nodes
        self.links = tree.links

    def n(self, kind, x=0, y=0, **kw):
        node = self.nodes.new(kind)
        node.location = (x, y)
        socket_names = {s.name for s in node.inputs}
        # node properties first (they can enable/disable sockets)
        for k, v in kw.items():
            if k not in socket_names:
                setattr(node, k, v)
        for k, v in kw.items():
            if k in socket_names:
                sock = self.inp(node, k) or next(s for s in node.inputs if s.name == k)
                sock.default_value = v
        return node

    @staticmethod
    def inp(node, name):
        if isinstance(name, int):
            return node.inputs[name]
        for s in node.inputs:
            if s.name == name and getattr(s, "enabled", True):
                return s
        return None

    @staticmethod
    def out(node, name=0):
        if isinstance(name, int):
            outs = [s for s in node.outputs if getattr(s, "enabled", True)]
            return outs[name]
        for s in node.outputs:
            if s.name == name and getattr(s, "enabled", True):
                return s
        raise KeyError(name)

    def l(self, a, b, a_sock=0, b_sock=0):
        src = a if isinstance(a, bpy.types.NodeSocket) else self.out(a, a_sock)
        dst = b if isinstance(b, bpy.types.NodeSocket) else self.inp(b, b_sock)
        self.links.new(src, dst)
        return b

    # common helpers -------------------------------------------------------
    def math(self, op, a=None, b=None, c=None, x=0, y=0, clamp=False):
        m = self.n("ShaderNodeMath", x, y, operation=op)
        m.use_clamp = clamp
        for i, v in enumerate((a, b, c)):
            if v is None:
                continue
            if isinstance(v, (int, float)):
                m.inputs[i].default_value = v
            else:
                self.l(v, m.inputs[i])
        return m

    def mix_rgb(self, fac, a, b, x=0, y=0, blend="MIX"):
        m = self.n("ShaderNodeMix", x, y, data_type="RGBA", blend_type=blend)
        for sock_name, v in (("Factor", fac), ("A", a), ("B", b)):
            s = self.inp(m, sock_name)
            if isinstance(v, (int, float)):
                s.default_value = v
            elif isinstance(v, tuple):
                s.default_value = (*v, 1.0) if len(v) == 3 else v
            else:
                self.l(v, s)
        return m

    def ramp(self, fac, stops, x=0, y=0):
        r = self.n("ShaderNodeValToRGB", x, y)
        cr = r.color_ramp
        while len(cr.elements) > len(stops):
            cr.elements.remove(cr.elements[-1])
        while len(cr.elements) < len(stops):
            cr.elements.new(0.5)
        for el, (pos, col) in zip(cr.elements, stops):
            el.position = pos
            el.color = (*col, 1.0) if len(col) == 3 else col
        self.l(fac, r.inputs[0])
        return r


def _new_material(name):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    for node in list(nt.nodes):
        nt.nodes.remove(node)
    nb = NB(nt)
    out = nb.n("ShaderNodeOutputMaterial", 900, 0)
    return m, nb, out


def cached(fn):
    def wrap(name, *a, **kw):
        if name in _CACHE and _CACHE[name].name in bpy.data.materials:
            return _CACHE[name]
        m = fn(name, *a, **kw)
        _CACHE[name] = m
        return m
    wrap.__name__ = fn.__name__
    return wrap


def _coords(nb, x=-900, y=0, scale=(1, 1, 1), space="Object"):
    tc = nb.n("ShaderNodeTexCoord", x, y)
    mp = nb.n("ShaderNodeMapping", x + 180, y)
    mp.inputs["Scale"].default_value = scale
    nb.l(nb.out(tc, space), mp.inputs["Vector"])
    return mp


def _bump(nb, height, strength=0.2, distance=0.01, x=400, y=-300, normal=None):
    b = nb.n("ShaderNodeBump", x, y, Strength=strength, Distance=distance)
    nb.l(height, b.inputs["Height"])
    if normal is not None:
        nb.l(normal, b.inputs["Normal"])
    return b


# ----------------------------------------------------------------------------
# Vehicle materials
# ----------------------------------------------------------------------------

@cached
def sofi(name, base=(0.50, 0.125, 0.026), dark=(0.36, 0.085, 0.018), rough=0.8,
         mottle_scale=0.35, seed=0.0):
    """Spray-on foam insulation: broad mottling, spray-pass bands, fine popcorn."""
    m, nb, out = _new_material(name)
    co = _coords(nb)
    # broad mottling
    n1 = nb.n("ShaderNodeTexNoise", -500, 300, noise_dimensions="4D", Scale=mottle_scale, Detail=2.0, Roughness=0.55, W=seed)
    nb.l(co, n1.inputs["Vector"])
    # spray passes: noise stretched around circumference (varies mostly along z)
    co2 = _coords(nb, -900, -250, scale=(0.08, 0.08, 1.6))
    n2 = nb.n("ShaderNodeTexNoise", -500, 50, noise_dimensions="4D", Scale=1.0, Detail=2.0, W=seed + 3)
    nb.l(co2, n2.inputs["Vector"])
    mix_fac = nb.math("MULTIPLY", n1, 1.2, x=-300, y=300)
    fac = nb.math("ADD", mix_fac, n2, x=-150, y=300)
    fac = nb.math("MULTIPLY", fac, 0.5, x=-50, y=300)
    col = nb.ramp(fac, [(0.30, dark), (0.72, base)], x=50, y=300)
    # fine popcorn texture
    n3 = nb.n("ShaderNodeTexNoise", -500, -350, Scale=38.0, Detail=2.0, Roughness=0.6)
    nb.l(co, n3.inputs["Vector"])
    bump = _bump(nb, n3, strength=0.18, distance=0.006)
    speck = nb.mix_rgb(nb.math("MULTIPLY", n3, 0.18, x=150, y=100), nb.out(col, "Color"), (0.25, 0.06, 0.012), x=300, y=250)
    bsdf = nb.n("ShaderNodeBsdfPrincipled", 600, 100, Roughness=rough)
    nb.l(nb.out(speck, "Result"), bsdf.inputs["Base Color"])
    rr = nb.math("MULTIPLY_ADD", n3, 0.15, x=350, y=-50)
    rr.inputs[2].default_value = rough - 0.07
    nb.l(rr, bsdf.inputs["Roughness"])
    nb.l(bump, bsdf.inputs["Normal"])
    nb.l(bsdf, out.inputs["Surface"])
    return m


@cached
def paint(name, base=(0.78, 0.78, 0.76), rough=0.42, var=0.03, bump=0.05, metallic=0.0):
    m, nb, out = _new_material(name)
    co = _coords(nb)
    n1 = nb.n("ShaderNodeTexNoise", -500, 200, Scale=0.6, Detail=2.0)
    nb.l(co, n1.inputs["Vector"])
    b0 = tuple(c * (1 - var) for c in base)
    col = nb.ramp(n1, [(0.35, b0), (0.65, base)], x=-200, y=200)
    n2 = nb.n("ShaderNodeTexNoise", -500, -200, Scale=30.0, Detail=2.0)
    nb.l(co, n2.inputs["Vector"])
    bsdf = nb.n("ShaderNodeBsdfPrincipled", 400, 100, Metallic=metallic)
    nb.l(nb.out(col, "Color"), bsdf.inputs["Base Color"])
    r = nb.math("MULTIPLY_ADD", n2, 0.12, x=0, y=-100)
    r.inputs[2].default_value = rough - 0.06
    nb.l(r, bsdf.inputs["Roughness"])
    if bump:
        nb.l(_bump(nb, n2, strength=bump, distance=0.003), bsdf.inputs["Normal"])
    nb.l(bsdf, out.inputs["Surface"])
    return m


@cached
def metal(name, base=(0.62, 0.60, 0.57), rough=0.32, aniso=0.0, var=0.08, scale=3.0):
    m, nb, out = _new_material(name)
    co = _coords(nb)
    n1 = nb.n("ShaderNodeTexNoise", -500, 100, Scale=scale, Detail=2.0, Roughness=0.6)
    nb.l(co, n1.inputs["Vector"])
    bsdf = nb.n("ShaderNodeBsdfPrincipled", 400, 100, Metallic=1.0, Anisotropic=aniso)
    b0 = tuple(c * (1 - var) for c in base)
    col = nb.ramp(n1, [(0.3, b0), (0.7, base)], x=-200, y=250)
    nb.l(nb.out(col, "Color"), bsdf.inputs["Base Color"])
    r = nb.math("MULTIPLY_ADD", n1, 0.16, x=0, y=-50)
    r.inputs[2].default_value = rough - 0.08
    nb.l(r, bsdf.inputs["Roughness"])
    nb.l(bsdf, out.inputs["Surface"])
    return m


@cached
def nozzle_tubes(name, base=(0.30, 0.25, 0.21), rough=0.42, n_tubes=1080, heat=None,
                 depth=0.5):
    """Regeneratively cooled tube-wall nozzle: angular tube ribs as bump,
    optional heat tint gradient along z (object space)."""
    m, nb, out = _new_material(name)
    tc = nb.n("ShaderNodeTexCoord", -1100, 0)
    sep = nb.n("ShaderNodeSeparateXYZ", -900, 0)
    nb.l(nb.out(tc, "Object"), sep.inputs[0])
    ang = nb.math("ARCTAN2", nb.out(sep, "Y"), nb.out(sep, "X"), x=-700, y=100)
    k = nb.math("MULTIPLY", ang, n_tubes / 2.0, x=-550, y=100)
    s = nb.math("SINE", k, x=-400, y=100)
    a = nb.math("ABSOLUTE", s, x=-250, y=100)
    h = nb.math("POWER", a, 0.45, x=-100, y=100)
    bump = _bump(nb, h, strength=depth, distance=0.004, x=150, y=-250)
    co = _coords(nb, -1100, -400)
    n1 = nb.n("ShaderNodeTexNoise", -500, -350, Scale=2.5, Detail=2.0, Roughness=0.62)
    nb.l(co, n1.inputs["Vector"])
    bsdf = nb.n("ShaderNodeBsdfPrincipled", 500, 100, Metallic=1.0)
    if heat:
        # heat tint along the nozzle: z in object space mapped 0..1
        z0, z1, c_top, c_bot = heat
        mr = nb.n("ShaderNodeMapRange", -300, 350)
        nb.l(nb.out(sep, "Z"), mr.inputs["Value"])
        mr.inputs["From Min"].default_value = z1
        mr.inputs["From Max"].default_value = z0
        zn = nb.math("MULTIPLY_ADD", n1, 0.25, x=-150, y=350)
        nb.l(mr, zn.inputs[2])
        col = nb.ramp(zn, [(0.0, c_bot), (0.55, base), (1.0, c_top)], x=0, y=350)
    else:
        col = nb.ramp(n1, [(0.3, tuple(c * 0.85 for c in base)), (0.7, base)], x=0, y=350)
    nb.l(nb.out(col, "Color"), bsdf.inputs["Base Color"])
    r = nb.math("MULTIPLY_ADD", n1, 0.2, x=200, y=-50)
    r.inputs[2].default_value = rough - 0.1
    nb.l(r, bsdf.inputs["Roughness"])
    nb.l(bump, bsdf.inputs["Normal"])
    nb.l(bsdf, out.inputs["Surface"])
    return m


@cached
def rough_dielectric(name, base=(0.04, 0.04, 0.04), rough=0.75, noise=0.3, scale=6.0, bump=0.15):
    m, nb, out = _new_material(name)
    co = _coords(nb)
    n1 = nb.n("ShaderNodeTexNoise", -500, 100, Scale=scale, Detail=2.0, Roughness=0.65)
    nb.l(co, n1.inputs["Vector"])
    col = nb.ramp(n1, [(0.2, tuple(c * (1 - noise) for c in base)), (0.8, base)], x=-200, y=200)
    bsdf = nb.n("ShaderNodeBsdfPrincipled", 400, 100, Roughness=rough)
    nb.l(nb.out(col, "Color"), bsdf.inputs["Base Color"])
    if bump:
        nb.l(_bump(nb, n1, strength=bump, distance=0.01), bsdf.inputs["Normal"])
    nb.l(bsdf, out.inputs["Surface"])
    return m


@cached
def avcoat(name):
    """Orion heat shield: Avcoat blocks with dark gap filler, matte, fine pitting."""
    m, nb, out = _new_material(name)
    co = _coords(nb, scale=(1, 1, 1))
    br = nb.n("ShaderNodeTexBrick", -400, 200, Scale=1.0, **{"Mortar Size": 0.012, "Brick Width": 0.62, "Row Height": 0.52, "Bias": 0.0, "Mortar Smooth": 0.1})
    br.offset = 0.5
    br.squash = 1.0
    br.inputs["Color1"].default_value = (0.42, 0.33, 0.23, 1)
    br.inputs["Color2"].default_value = (0.36, 0.28, 0.19, 1)
    br.inputs["Mortar"].default_value = (0.10, 0.09, 0.08, 1)
    nb.l(co, br.inputs["Vector"])
    n1 = nb.n("ShaderNodeTexNoise", -400, -200, Scale=60.0, Detail=2.0, Roughness=0.7)
    nb.l(co, n1.inputs["Vector"])
    n2 = nb.n("ShaderNodeTexNoise", -400, -450, Scale=1.4, Detail=2.0)
    nb.l(co, n2.inputs["Vector"])
    tint = nb.mix_rgb(nb.math("MULTIPLY", n2, 0.35, x=-150, y=0), nb.out(br, "Color"), (0.30, 0.24, 0.17), x=100, y=200)
    bsdf = nb.n("ShaderNodeBsdfPrincipled", 500, 100, Roughness=0.88)
    nb.l(nb.out(tint, "Result"), bsdf.inputs["Base Color"])
    h = nb.math("MULTIPLY_ADD", n1, 0.3, x=0, y=-250)
    nb.l(nb.out(br, "Factor"), h.inputs[2])
    nb.l(_bump(nb, h, strength=0.35, distance=0.004, x=250, y=-250), bsdf.inputs["Normal"])
    nb.l(bsdf, out.inputs["Surface"])
    return m


@cached
def tiles(name, base=(0.62, 0.62, 0.63), metallic=0.75, rough=0.34, uv_scale=(64.0, 16.0)):
    """Orion backshell: silver-coated tiles, grid of fine gaps (UV: u around, v along profile)."""
    m, nb, out = _new_material(name)
    co = _coords(nb)
    br = nb.n("ShaderNodeTexBrick", -400, 200, Scale=1.0, **{"Mortar Size": 0.03, "Brick Width": 1.0, "Row Height": 1.0, "Mortar Smooth": 0.2})
    br.offset = 0.0
    br.inputs["Color1"].default_value = (*base, 1)
    br.inputs["Color2"].default_value = tuple(c * 0.92 for c in base) + (1,)
    br.inputs["Mortar"].default_value = (0.08, 0.08, 0.085, 1)
    tc = nb.n("ShaderNodeTexCoord", -900, 200)
    mp = nb.n("ShaderNodeMapping", -650, 200)
    mp.inputs["Scale"].default_value = (uv_scale[0], uv_scale[1], 1.0)
    nb.l(nb.out(tc, "UV"), mp.inputs["Vector"])
    nb.l(mp, br.inputs["Vector"])
    n1 = nb.n("ShaderNodeTexNoise", -400, -200, Scale=8.0, Detail=2.0)
    nb.l(co, n1.inputs["Vector"])
    bsdf = nb.n("ShaderNodeBsdfPrincipled", 500, 100, Metallic=metallic)
    nb.l(nb.out(br, "Color"), bsdf.inputs["Base Color"])
    r = nb.math("MULTIPLY_ADD", n1, 0.15, x=100, y=-100)
    r.inputs[2].default_value = rough - 0.07
    nb.l(r, bsdf.inputs["Roughness"])
    nb.l(_bump(nb, nb.out(br, "Factor"), strength=0.3, distance=0.004, x=250, y=-300), bsdf.inputs["Normal"])
    nb.l(bsdf, out.inputs["Surface"])
    return m


@cached
def mli(name, base=(0.78, 0.78, 0.80), rough=0.22, quilt=0.35, metallic=1.0):
    """Multi-layer insulation blanket: foil wrinkles + quilting stitches."""
    m, nb, out = _new_material(name)
    co = _coords(nb)
    co2 = _coords(nb, -900, -300, scale=(1.0, 1.0, 3.0))
    n1 = nb.n("ShaderNodeTexNoise", -500, 100, Scale=6.0, Detail=2.0, Roughness=0.7, Distortion=0.6)
    nb.l(co2, n1.inputs["Vector"])
    vo = nb.n("ShaderNodeTexVoronoi", -500, -250, Scale=1.0 / quilt)
    vo.feature = "DISTANCE_TO_EDGE"
    nb.l(co, vo.inputs["Vector"])
    edge = nb.math("SMOOTH_MIN", nb.out(vo, "Distance"), 0.06, x=-250, y=-250)
    edge.inputs[2].default_value = 0.05
    h = nb.math("MULTIPLY_ADD", n1, 0.5, x=-100, y=0)
    nb.l(edge, h.inputs[2])
    bsdf = nb.n("ShaderNodeBsdfPrincipled", 450, 100, Metallic=metallic, Roughness=rough)
    col = nb.ramp(n1, [(0.3, tuple(c * 0.8 for c in base)), (0.7, base)], x=0, y=300)
    nb.l(nb.out(col, "Color"), bsdf.inputs["Base Color"])
    r = nb.math("MULTIPLY_ADD", n1, 0.2, x=150, y=-100)
    r.inputs[2].default_value = rough - 0.08
    nb.l(r, bsdf.inputs["Roughness"])
    nb.l(_bump(nb, h, strength=0.45, distance=0.01, x=250, y=-300), bsdf.inputs["Normal"])
    nb.l(bsdf, out.inputs["Surface"])
    return m


@cached
def solar_cells(name):
    m, nb, out = _new_material(name)
    tc = nb.n("ShaderNodeTexCoord", -900, 0)
    br = nb.n("ShaderNodeTexBrick", -400, 200, Scale=14.0, **{"Mortar Size": 0.03, "Brick Width": 1.0, "Row Height": 0.5})
    br.offset = 0.0
    br.inputs["Color1"].default_value = (0.012, 0.018, 0.05, 1)
    br.inputs["Color2"].default_value = (0.015, 0.02, 0.06, 1)
    br.inputs["Mortar"].default_value = (0.5, 0.5, 0.52, 1)
    nb.l(nb.out(tc, "UV"), br.inputs["Vector"])
    bsdf = nb.n("ShaderNodeBsdfPrincipled", 400, 100, Roughness=0.12, **{"Coat Weight": 0.6})
    nb.l(nb.out(br, "Color"), bsdf.inputs["Base Color"])
    nb.l(bsdf, out.inputs["Surface"])
    return m


@cached
def glass_dark(name):
    m, nb, out = _new_material(name)
    bsdf = nb.n("ShaderNodeBsdfPrincipled", 400, 100, Roughness=0.04, **{"Base Color": (0.005, 0.006, 0.008, 1), "Coat Weight": 1.0})
    nb.l(bsdf, out.inputs["Surface"])
    return m


@cached
def decal(name, image_path, rough=0.45, emission=None):
    """Image decal with alpha on a UV-mapped patch."""
    m, nb, out = _new_material(name)
    tc = nb.n("ShaderNodeTexCoord", -700, 0)
    tex = nb.n("ShaderNodeTexImage", -450, 0)
    img = bpy.data.images.load(image_path, check_existing=True)
    img.colorspace_settings.name = "sRGB"
    tex.image = img
    tex.extension = "CLIP"
    tex.interpolation = "Cubic"
    nb.l(nb.out(tc, "UV"), tex.inputs["Vector"])
    bsdf = nb.n("ShaderNodeBsdfPrincipled", 200, 100, Roughness=rough)
    nb.l(nb.out(tex, "Color"), bsdf.inputs["Base Color"])
    nb.l(nb.out(tex, "Alpha"), bsdf.inputs["Alpha"])
    nb.l(bsdf, out.inputs["Surface"])
    m.blend_method = "HASHED" if hasattr(m, "blend_method") else None
    return m


@cached
def fiducial(name):
    """2x2 black/white checkerboard target on a white square (UV 0..1)."""
    m, nb, out = _new_material(name)
    tc = nb.n("ShaderNodeTexCoord", -900, 0)
    ck = nb.n("ShaderNodeTexChecker", -500, 100, Scale=2.0)
    ck.inputs["Color1"].default_value = (0.02, 0.02, 0.02, 1)
    ck.inputs["Color2"].default_value = (0.80, 0.80, 0.78, 1)
    nb.l(nb.out(tc, "UV"), ck.inputs["Vector"])
    bsdf = nb.n("ShaderNodeBsdfPrincipled", 300, 100, Roughness=0.5)
    nb.l(nb.out(ck, "Color"), bsdf.inputs["Base Color"])
    nb.l(bsdf, out.inputs["Surface"])
    return m


@cached
def emission(name, color=(1, 1, 1), strength=5.0):
    m, nb, out = _new_material(name)
    e = nb.n("ShaderNodeEmission", 300, 0, Color=(*color, 1), Strength=strength)
    nb.l(e, out.inputs["Surface"])
    return m


@cached
def holdout_dark(name, color=(0.004, 0.004, 0.005)):
    m, nb, out = _new_material(name)
    bsdf = nb.n("ShaderNodeBsdfPrincipled", 300, 0, Roughness=0.9, **{"Base Color": (*color, 1)})
    nb.l(bsdf, out.inputs["Surface"])
    return m


# ----------------------------------------------------------------------------
# Palette used by the vehicle builders
# ----------------------------------------------------------------------------

def palette():
    P = {}
    P["sofi"] = sofi("SOFI_Orange")
    P["sofi_it"] = sofi("SOFI_Orange_Intertank", base=(0.47, 0.115, 0.024), dark=(0.34, 0.08, 0.017), seed=4.0)
    P["sofi_lox"] = sofi("SOFI_Orange_LOX", base=(0.52, 0.13, 0.028), dark=(0.38, 0.09, 0.019), seed=7.0)
    P["sofi_es"] = sofi("SOFI_Orange_EngSec", base=(0.49, 0.12, 0.025), dark=(0.33, 0.078, 0.016), seed=11.0)
    P["white"] = paint("Paint_White_Booster", base=(0.80, 0.80, 0.78), rough=0.40)
    P["white_warm"] = paint("Paint_White_Warm", base=(0.78, 0.76, 0.72), rough=0.45)
    P["white_orion"] = paint("Paint_White_Orion", base=(0.82, 0.82, 0.81), rough=0.35)
    P["joint"] = paint("Booster_FieldJoint", base=(0.66, 0.66, 0.64), rough=0.55, bump=0.1)
    P["grey"] = paint("Paint_Grey", base=(0.30, 0.30, 0.30), rough=0.5)
    P["dark"] = paint("Paint_Dark", base=(0.035, 0.035, 0.037), rough=0.45)
    P["black"] = holdout_dark("Black_Interior")
    P["steel"] = metal("Metal_Steel", base=(0.60, 0.59, 0.56), rough=0.30)
    P["steel_dark"] = metal("Metal_Steel_Dark", base=(0.24, 0.23, 0.22), rough=0.38)
    P["inconel"] = metal("Metal_Inconel", base=(0.52, 0.47, 0.42), rough=0.35)
    P["alu"] = metal("Metal_Aluminum", base=(0.78, 0.78, 0.78), rough=0.26)
    P["gold"] = metal("Metal_Gold", base=(0.85, 0.60, 0.30), rough=0.25)
    P["copper"] = metal("Metal_Copper", base=(0.80, 0.45, 0.30), rough=0.30)
    P["nozzle_out"] = nozzle_tubes("RS25_Nozzle_Tubes_Exterior", base=(0.10, 0.078, 0.060), rough=0.45,
                                   heat=(-1.2, -4.27, (0.15, 0.11, 0.08), (0.07, 0.064, 0.062)), depth=0.3)
    P["nozzle_in"] = nozzle_tubes("RS25_Nozzle_Tubes_Interior", base=(0.62, 0.48, 0.36), rough=0.30,
                                  heat=(-1.2, -4.27, (0.36, 0.22, 0.14), (0.66, 0.58, 0.52)), depth=0.8)
    P["carbon"] = rough_dielectric("Carbon_Composite", base=(0.030, 0.030, 0.032), rough=0.55, noise=0.4, scale=12.0)
    P["ablative"] = rough_dielectric("Carbon_Phenolic", base=(0.020, 0.016, 0.013), rough=0.85, noise=0.5, scale=8.0, bump=0.3)
    P["cc_ext"] = rough_dielectric("RL10_CarbonCarbon", base=(0.045, 0.045, 0.048), rough=0.5, noise=0.35, scale=18.0)
    P["avcoat"] = avcoat("Orion_Avcoat")
    P["tiles"] = tiles("Orion_Backshell_Tiles")
    P["mli"] = mli("MLI_Silver", base=(0.80, 0.80, 0.82), rough=0.26, metallic=0.7, quilt=0.28)
    P["mli_gold"] = mli("MLI_Gold", base=(0.80, 0.55, 0.22), rough=0.25)
    P["mli_white"] = mli("Blanket_White", base=(0.78, 0.77, 0.74), rough=0.6, metallic=0.0, quilt=0.22)
    P["cells"] = solar_cells("Solar_Cells")
    P["glass"] = glass_dark("Window_Glass")
    P["fiducial"] = fiducial("Fiducial_Checker")
    P["cork"] = rough_dielectric("Cork_TPS", base=(0.30, 0.20, 0.12), rough=0.9, noise=0.4, scale=30, bump=0.25)
    return P


def decal_material(key, path):
    return decal(f"Decal_{key}", path)


ASSET_DIR = os.path.normpath(os.path.join(os.path.dirname(__file__), "..", "..", "assets"))
