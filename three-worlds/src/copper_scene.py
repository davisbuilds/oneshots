"""MATTER — the Lorenz trajectory as a copper filament over a stone plinth.

Builds the whole gallery procedurally with bpy (no external assets) and renders
with Cycles.  Works both as a standalone script with the `bpy` wheel

    python3 src/copper_scene.py --out out/copper.png --res 1920 1080 --samples 128

and inside a Blender install:

    blender -b -P src/copper_scene.py -- --save-blend out/copper_sculpture.blend
"""
import sys, json, math, argparse, pathlib, time
import numpy as np

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import bpy
import common as C

WIRE_R = 0.00135      # nominal filament radius (m) ~2.7 mm wire
RING = 10             # vertices around the tube


# ----------------------------------------------------------------------------- utils
def node(nt, kind, loc=(0, 0), **inputs):
    n = nt.nodes.new(kind)
    n.location = loc
    for k, v in inputs.items():
        n.inputs[k].default_value = v
    return n


def new_material(name):
    m = bpy.data.materials.new(name)
    try:
        m.use_nodes = True
    except Exception:
        pass
    return m, m.node_tree


def link(nt, a, b):
    nt.links.new(a, b)


def sock(sockets, name, kind="RGBA"):
    """Mix nodes expose several sockets with the same name (float/vector/colour)."""
    return next(x for x in sockets if x.name == name and x.type == kind)


# ----------------------------------------------------------------------------- geometry
def tube_frames(Q):
    T = np.gradient(Q, axis=0)
    T /= np.linalg.norm(T, axis=1, keepdims=True)
    N = np.zeros_like(Q)
    ref = np.array([0.0, 0.0, 1.0])
    n0 = np.cross(T[0], ref); n0 /= np.linalg.norm(n0)
    N[0] = n0
    for i in range(1, len(Q)):              # parallel transport (no twisting)
        n = N[i - 1] - np.dot(N[i - 1], T[i]) * T[i]
        N[i] = n / np.linalg.norm(n)
    B = np.cross(T, N)
    return T, N, B


def filament_radius(speed_s, s_norm):
    """Slow passages are drawn thicker (the same rule the ink uses for pressure),
    ends taper slightly like a hand-cut wire."""
    rk = np.argsort(np.argsort(speed_s)) / (len(speed_s) - 1)   # speed rank 0..1
    r = WIRE_R * (1.18 - 0.36 * rk)
    taper = np.clip(np.minimum(s_norm, 1 - s_norm) / 0.004, 0, 1)
    return r * (0.55 + 0.45 * np.sqrt(taper))


def build_filament(step=0.0022):
    t, Q, sp = C.world_curve()
    Qr, (tr, spr), u = C.resample(Q, step=step, extra=(t, sp))
    s_norm = u / u[-1]
    R = filament_radius(spr, s_norm)
    T, N, B = tube_frames(Qr)
    ang = np.linspace(0, 2 * np.pi, RING, endpoint=False)
    ring = (np.cos(ang)[None, :, None] * N[:, None, :] + np.sin(ang)[None, :, None] * B[:, None, :])
    V = (Qr[:, None, :] + R[:, None, None] * ring).reshape(-1, 3)
    n = len(Qr)
    faces = []
    i = np.arange(n - 1)[:, None] * RING
    j = np.arange(RING)[None, :]
    a = i + j; b = i + (j + 1) % RING; c = b + RING; d = a + RING
    F = np.stack([a, b, c, d], axis=-1).reshape(-1, 4)
    # end caps
    capA = [list(range(RING))[::-1]]
    capB = [list(range((n - 1) * RING, n * RING))]
    mesh = bpy.data.meshes.new("lorenz_filament")
    mesh.from_pydata(V.tolist(), [], F.tolist() + capA + capB)
    mesh.update()
    # per-corner attribute: trajectory time (drives patina so it follows the path)
    attr = mesh.attributes.new("traj_t", "FLOAT", "POINT")
    attr.data.foreach_set("value", np.repeat(tr, RING).astype(np.float32))
    for p in mesh.polygons:
        p.use_smooth = True
    ob = bpy.data.objects.new("LorenzFilament", mesh)
    bpy.context.collection.objects.link(ob)
    print(f"filament: {n} rings, {len(V)} verts, wire length {u[-1]:.2f} m")
    return ob, Qr, R


# ----------------------------------------------------------------------------- materials
def copper_material(patina=1.0):
    m, nt = new_material("Copper")
    nt.nodes.clear()
    out = node(nt, "ShaderNodeOutputMaterial", (900, 0))
    bsdf = node(nt, "ShaderNodeBsdfPrincipled", (600, 0))
    bsdf.inputs["Metallic"].default_value = 1.0
    tc = node(nt, "ShaderNodeTexCoord", (-900, 0))
    # large-scale tarnish field
    n1 = node(nt, "ShaderNodeTexNoise", (-650, 200), Scale=9.0, Detail=6.0, Roughness=0.62)
    link(nt, tc.outputs["Object"], n1.inputs["Vector"])
    # fine hand-work field
    n2 = node(nt, "ShaderNodeTexNoise", (-650, -200), Scale=260.0, Detail=4.0, Roughness=0.55)
    link(nt, tc.outputs["Object"], n2.inputs["Vector"])
    ramp = node(nt, "ShaderNodeValToRGB", (-380, 200))
    ramp.color_ramp.elements[0].position = 0.40
    ramp.color_ramp.elements[1].position = 0.66
    # polished copper F0 -> warm tarnish -> dark oxidised
    cr = node(nt, "ShaderNodeValToRGB", (-120, 250))
    els = cr.color_ramp.elements
    els[0].position, els[0].color = 0.0, (0.94, 0.46, 0.26, 1)
    els[1].position, els[1].color = 1.0, (0.30, 0.12, 0.07, 1)
    e = els.new(0.5); e.color = (0.62, 0.27, 0.14, 1)
    mixf = node(nt, "ShaderNodeMath", (-250, 350)); mixf.operation = "MULTIPLY"
    mixf.inputs[1].default_value = patina
    link(nt, n1.outputs["Fac"], ramp.inputs["Fac"])
    link(nt, ramp.outputs["Color"], mixf.inputs[0])
    link(nt, mixf.outputs[0], cr.inputs["Fac"])
    link(nt, cr.outputs["Color"], bsdf.inputs["Base Color"])
    # edge tint toward a brighter peach (F82-ish)
    try:
        bsdf.inputs["Specular Tint"].default_value = (1.0, 0.86, 0.74, 1)
    except Exception:
        pass
    # roughness: polished where bright, satin where tarnished, plus fine variation
    rr = node(nt, "ShaderNodeMapRange", (-120, -50))
    rr.inputs["To Min"].default_value = 0.09
    rr.inputs["To Max"].default_value = 0.30
    link(nt, mixf.outputs[0], rr.inputs["Value"])
    radd = node(nt, "ShaderNodeMath", (120, -80)); radd.operation = "MULTIPLY_ADD"
    radd.inputs[1].default_value = 0.10
    link(nt, n2.outputs["Fac"], radd.inputs[0])
    link(nt, rr.outputs["Result"], radd.inputs[2])
    sub = node(nt, "ShaderNodeMath", (300, -80)); sub.operation = "SUBTRACT"
    sub.inputs[1].default_value = 0.05
    link(nt, radd.outputs[0], sub.inputs[0])
    link(nt, sub.outputs[0], bsdf.inputs["Roughness"])
    # faint hammer/draw marks
    bump = node(nt, "ShaderNodeBump", (300, -300))
    bump.inputs["Strength"].default_value = 0.07
    bump.inputs["Distance"].default_value = 0.0003
    link(nt, n2.outputs["Fac"], bump.inputs["Height"])
    link(nt, bump.outputs["Normal"], bsdf.inputs["Normal"])
    # sparse verdigris flecks (dielectric, matte)
    vg = node(nt, "ShaderNodeTexNoise", (-650, -500), Scale=55.0, Detail=3.0, Roughness=0.7)
    link(nt, tc.outputs["Object"], vg.inputs["Vector"])
    vr = node(nt, "ShaderNodeValToRGB", (-380, -500))
    vr.color_ramp.elements[0].position = 0.66
    vr.color_ramp.elements[1].position = 0.78
    link(nt, vg.outputs["Fac"], vr.inputs["Fac"])
    vmul = node(nt, "ShaderNodeMath", (-120, -500)); vmul.operation = "MULTIPLY"
    vmul.inputs[1].default_value = 0.55 * patina
    link(nt, vr.outputs["Color"], vmul.inputs[0])
    verd = node(nt, "ShaderNodeBsdfPrincipled", (600, -450))
    verd.inputs["Base Color"].default_value = (0.20, 0.36, 0.30, 1)
    verd.inputs["Roughness"].default_value = 0.75
    mix = node(nt, "ShaderNodeMixShader", (780, 0))
    link(nt, vmul.outputs[0], mix.inputs["Fac"])
    link(nt, bsdf.outputs["BSDF"], mix.inputs[1])
    link(nt, verd.outputs["BSDF"], mix.inputs[2])
    link(nt, mix.outputs["Shader"], out.inputs["Surface"])
    return m


def stone_material():
    m, nt = new_material("Basalt")
    nt.nodes.clear()
    out = node(nt, "ShaderNodeOutputMaterial", (900, 0))
    bsdf = node(nt, "ShaderNodeBsdfPrincipled", (600, 0))
    tc = node(nt, "ShaderNodeTexCoord", (-900, 0))
    n1 = node(nt, "ShaderNodeTexNoise", (-650, 250), Scale=3.0, Detail=8.0, Roughness=0.6)
    n2 = node(nt, "ShaderNodeTexNoise", (-650, -50), Scale=180.0, Detail=2.0, Roughness=0.5)
    vor = node(nt, "ShaderNodeTexVoronoi", (-650, -350)); vor.inputs["Scale"].default_value = 420.0
    for n_ in (n1, n2, vor):
        link(nt, tc.outputs["Object"], n_.inputs["Vector"])
    cr = node(nt, "ShaderNodeValToRGB", (-350, 250))
    cr.color_ramp.elements[0].color = (0.0045, 0.0045, 0.005, 1)
    cr.color_ramp.elements[1].color = (0.014, 0.0135, 0.0135, 1)
    link(nt, n1.outputs["Fac"], cr.inputs["Fac"])
    # sparse pale mineral specks
    sp = node(nt, "ShaderNodeValToRGB", (-350, -350))
    sp.color_ramp.elements[0].position = 0.0; sp.color_ramp.elements[0].color = (1, 1, 1, 1)
    sp.color_ramp.elements[1].position = 0.07; sp.color_ramp.elements[1].color = (0, 0, 0, 1)
    link(nt, vor.outputs["Distance"], sp.inputs["Fac"])
    mixc = node(nt, "ShaderNodeMix", (0, 200)); mixc.data_type = "RGBA"
    sock(mixc.inputs, "B").default_value = (0.05, 0.05, 0.05, 1)
    link(nt, sp.outputs["Color"], sock(mixc.inputs, "Factor", "VALUE"))
    link(nt, cr.outputs["Color"], sock(mixc.inputs, "A"))
    link(nt, sock(mixc.outputs, "Result"), bsdf.inputs["Base Color"])
    rr = node(nt, "ShaderNodeMapRange", (0, -100))
    rr.inputs["To Min"].default_value = 0.45; rr.inputs["To Max"].default_value = 0.75
    bsdf.inputs["Specular IOR Level"].default_value = 0.12   # honed, not polished
    link(nt, n1.outputs["Fac"], rr.inputs["Value"])
    link(nt, rr.outputs["Result"], bsdf.inputs["Roughness"])
    bump = node(nt, "ShaderNodeBump", (300, -300))
    bump.inputs["Strength"].default_value = 0.12
    bump.inputs["Distance"].default_value = 0.0005
    link(nt, n2.outputs["Fac"], bump.inputs["Height"])
    link(nt, bump.outputs["Normal"], bsdf.inputs["Normal"])
    link(nt, bsdf.outputs["BSDF"], out.inputs["Surface"])
    return m


def plain_material(name, color, rough, noise_scale=2.0, var=0.25, bump=0.05):
    m, nt = new_material(name)
    nt.nodes.clear()
    out = node(nt, "ShaderNodeOutputMaterial", (700, 0))
    bsdf = node(nt, "ShaderNodeBsdfPrincipled", (400, 0))
    tc = node(nt, "ShaderNodeTexCoord", (-700, 0))
    n1 = node(nt, "ShaderNodeTexNoise", (-450, 100), Scale=noise_scale, Detail=10.0, Roughness=0.65)
    link(nt, tc.outputs["Object"], n1.inputs["Vector"])
    cr = node(nt, "ShaderNodeValToRGB", (-150, 100))
    cr.color_ramp.elements[0].color = tuple(c * (1 - var) for c in color) + (1,)
    cr.color_ramp.elements[1].color = tuple(c * (1 + var) for c in color) + (1,)
    link(nt, n1.outputs["Fac"], cr.inputs["Fac"])
    link(nt, cr.outputs["Color"], bsdf.inputs["Base Color"])
    rr = node(nt, "ShaderNodeMapRange", (-150, -150))
    rr.inputs["To Min"].default_value = rough * 0.8; rr.inputs["To Max"].default_value = rough * 1.2
    link(nt, n1.outputs["Fac"], rr.inputs["Value"])
    link(nt, rr.outputs["Result"], bsdf.inputs["Roughness"])
    if bump:
        b = node(nt, "ShaderNodeBump", (150, -300))
        b.inputs["Strength"].default_value = bump
        n2 = node(nt, "ShaderNodeTexNoise", (-450, -300), Scale=90.0, Detail=4.0)
        link(nt, tc.outputs["Object"], n2.inputs["Vector"])
        link(nt, n2.outputs["Fac"], b.inputs["Height"])
        link(nt, b.outputs["Normal"], bsdf.inputs["Normal"])
    link(nt, bsdf.outputs["BSDF"], out.inputs["Surface"])
    return m


# ----------------------------------------------------------------------------- staging
def add_box(name, size, loc, mat, bevel=0.0):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    ob = bpy.context.object
    ob.name = name
    ob.scale = size
    bpy.ops.object.transform_apply(scale=True)
    if bevel:
        mod = ob.modifiers.new("bevel", "BEVEL")
        mod.width = bevel; mod.segments = 3
    for p in ob.data.polygons:
        p.use_smooth = False
    ob.data.materials.append(mat)
    return ob


def add_rod(Qr, R, mat):
    """Blackened steel support: rises from the plinth top to the filament's
    lowest point, where it is 'soldered' with a small collar."""
    i = int(np.argmin(Qr[:, 2]))
    top = Qr[i].copy(); top[2] -= R[i] * 0.4
    bottom = np.array([top[0], top[1], C.PLINTH_H])
    h = top[2] - bottom[2]
    bpy.ops.mesh.primitive_cylinder_add(radius=0.0024, depth=h, vertices=24,
                                        location=(top[0], top[1], bottom[2] + h / 2))
    rod = bpy.context.object; rod.name = "SupportRod"; rod.data.materials.append(mat)
    for p in rod.data.polygons: p.use_smooth = True
    bpy.ops.mesh.primitive_cylinder_add(radius=0.022, depth=0.006, vertices=48,
                                        location=(bottom[0], bottom[1], C.PLINTH_H + 0.003))
    base = bpy.context.object; base.name = "RodBase"; base.data.materials.append(mat)
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.0036, location=tuple(top), segments=24, ring_count=12)
    col = bpy.context.object; col.name = "Collar"; col.data.materials.append(mat)
    for p in col.data.polygons: p.use_smooth = True
    return rod, bottom


def aim(ob, target):
    d = np.asarray(target) - np.asarray(ob.location)
    import mathutils
    ob.rotation_euler = mathutils.Vector(d).to_track_quat("-Z", "Y").to_euler()


def add_light(kind, loc, target, energy, name, size=0.1, size_y=None, spot=None, blend=0.3,
              color=(1, 1, 1), camera_visible=False):
    data = bpy.data.lights.new(name, kind)
    data.energy = energy
    data.color = color
    if kind == "AREA":
        data.shape = "RECTANGLE"
        data.size = size; data.size_y = size_y or size
    elif kind in ("SPOT", "POINT"):
        data.shadow_soft_size = size
    if kind == "SPOT":
        data.spot_size = math.radians(spot); data.spot_blend = blend
    ob = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(ob)
    ob.location = loc
    aim(ob, target)
    try:
        ob.visible_camera = camera_visible
    except Exception:
        pass
    return ob


def setup_camera(cam: C.Camera, dof=True):
    import mathutils
    data = bpy.data.cameras.new("Camera")
    data.lens = cam.lens
    data.sensor_width = cam.sensor
    data.sensor_fit = cam.fit
    data.clip_start = 0.05; data.clip_end = 60
    if dof and cam.fstop:
        data.dof.use_dof = True
        data.dof.focus_distance = cam.focus
        data.dof.aperture_fstop = cam.fstop
    ob = bpy.data.objects.new("Camera", data)
    bpy.context.collection.objects.link(ob)
    ob.matrix_world = mathutils.Matrix(cam.matrix_world().tolist())
    bpy.context.scene.camera = ob
    return ob


def build_scene(cfg):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    copper = copper_material(cfg.get("patina", 1.0))
    stone = stone_material()
    steel = plain_material("BlackSteel", (0.018, 0.017, 0.016), 0.38, noise_scale=40, var=0.3, bump=0.02)
    floor_m = plain_material("Floor", (0.030, 0.029, 0.028), 0.55, noise_scale=1.5, var=0.35, bump=0.03)
    wall_m = plain_material("Wall", (0.060, 0.058, 0.055), 0.9, noise_scale=0.8, var=0.12, bump=0.0)

    fil, Qr, R = build_filament(cfg.get("step", 0.0022))
    fil.data.materials.append(copper)
    # terminal beads mark the first and last instant of the segment
    for k, nm in ((0, "BeadStart"), (-1, "BeadEnd")):
        bpy.ops.mesh.primitive_uv_sphere_add(radius=WIRE_R * 1.9, location=tuple(Qr[k]),
                                             segments=24, ring_count=12)
        b = bpy.context.object; b.name = nm; b.data.materials.append(copper)
        for p in b.data.polygons: p.use_smooth = True

    rod, rod_base = add_rod(Qr, R, steel)
    # plinth centred under the rod
    px, py = rod_base[0], rod_base[1]
    add_box("Plinth", (C.PLINTH_W, C.PLINTH_W, C.PLINTH_H), (px, py, C.PLINTH_H / 2), stone, bevel=0.002)
    bpy.ops.mesh.primitive_plane_add(size=30, location=(0, 0, 0))
    fl = bpy.context.object; fl.name = "Floor"; fl.data.materials.append(floor_m)
    bpy.ops.mesh.primitive_plane_add(size=30, location=(0, cfg.get("wall_y", 3.2), 15),
                                     rotation=(math.radians(90), 0, 0))
    wl = bpy.context.object; wl.name = "Wall"; wl.data.materials.append(wall_m)

    tgt = C.sculpture_center()
    k = cfg.get("light_scale", 1.0)
    # key: crisp spot almost straight overhead -> the filament draws its own x-y
    # shadow on the plinth top; a weaker front key gives the copper a face
    add_light("SPOT", (px + 0.12, py - 0.30, 3.35), (px, py, C.PLINTH_H), cfg.get("key", 380) * k,
              "KeyOverhead", size=0.012, spot=17, blend=0.35, color=(1.0, 0.94, 0.86))
    add_light("SPOT", (-1.05, -1.25, 2.7), tgt, cfg.get("front", 120) * k, "KeyFront",
              size=0.08, spot=16, blend=0.6, color=(1.0, 0.93, 0.84))
    # tall strip softboxes (only seen in reflections) sculpt the metal
    add_light("AREA", (1.25, -0.45, 1.75), tgt, cfg.get("strip", 160) * k, "StripRight", size=0.18, size_y=1.5,
              color=(1.0, 0.96, 0.92))
    add_light("AREA", (-1.3, 0.55, 1.9), tgt, cfg.get("strip", 160) * 0.65 * k, "StripLeftRear", size=0.18, size_y=1.3,
              color=(0.93, 0.97, 1.0))
    # rim from behind-above
    add_light("SPOT", (0.35, 1.6, 2.6), tgt, 420 * k, "Rim", size=0.06, spot=22, blend=0.6,
              color=(1.0, 0.9, 0.8))
    # soft overhead fill
    add_light("AREA", (0.0, 0.2, 3.4), tgt, 7 * k, "Top", size=1.0, color=(1.0, 0.97, 0.94))
    # wall wash: a soft pool of light behind the piece for separation
    add_light("SPOT", (0.2, -0.8, 3.2), (tgt[0] + 0.3, cfg.get("wall_y", 3.2), 1.7), cfg.get("wash_e", 260) * k,
              "WallWash", size=0.3, spot=42, blend=1.0, color=(1.0, 0.92, 0.82)) if cfg.get("wash", True) else None

    world = bpy.data.worlds.new("World")
    sc.world = world
    try:
        world.use_nodes = True
    except Exception:
        pass
    bg = world.node_tree.nodes.get("Background")
    bg.inputs["Color"].default_value = (0.0035, 0.0034, 0.0033, 1)
    bg.inputs["Strength"].default_value = 1.0

    cam = cfg["camera"]
    setup_camera(cam, dof=cfg.get("dof", True))

    sc.render.engine = "CYCLES"
    sc.cycles.device = "CPU"
    sc.cycles.samples = cfg.get("samples", 64)
    sc.cycles.use_adaptive_sampling = True
    sc.cycles.adaptive_threshold = cfg.get("adaptive", 0.02)
    sc.cycles.use_denoising = True
    try:
        sc.cycles.denoiser = "OPENIMAGEDENOISE"
    except Exception:
        pass
    sc.cycles.max_bounces = 6
    sc.cycles.glossy_bounces = 4
    sc.cycles.diffuse_bounces = 2
    sc.cycles.transmission_bounces = 0
    sc.cycles.volume_bounces = 0
    sc.cycles.caustics_reflective = False
    sc.cycles.caustics_refractive = False
    sc.cycles.blur_glossy = 1.0
    sc.cycles.seed = cfg.get("seed", 7)
    sc.render.resolution_x, sc.render.resolution_y = cam.W, cam.H
    sc.render.resolution_percentage = 100
    sc.render.use_persistent_data = True
    sc.render.film_transparent = False
    sc.render.image_settings.file_format = "PNG"
    sc.render.image_settings.color_depth = "16"
    sc.view_settings.view_transform = "AgX"
    try:
        sc.view_settings.look = cfg.get("look", "AgX - Medium High Contrast")
    except Exception:
        pass
    sc.view_settings.exposure = cfg.get("exposure", 0.0)
    return sc


def default_camera(W=1920, H=1080, az=-18.0, el=6.0, dist=2.35, lens=70.0, fstop=5.6, dz=0.0):
    tgt = C.sculpture_center() + np.array([0, 0, dz])
    return C.orbit_camera(az, el, dist, tgt, lens=lens, W=W, H=H, fstop=fstop,
                          fit="HORIZONTAL" if W >= H else "VERTICAL")


if __name__ == "__main__":
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[1:]
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=str(C.OUT / "copper_test.png"))
    ap.add_argument("--res", nargs=2, type=int, default=[960, 540])
    ap.add_argument("--samples", type=int, default=48)
    ap.add_argument("--az", type=float, default=-18.0)
    ap.add_argument("--el", type=float, default=6.0)
    ap.add_argument("--dist", type=float, default=2.35)
    ap.add_argument("--lens", type=float, default=70.0)
    ap.add_argument("--fstop", type=float, default=5.6)
    ap.add_argument("--dz", type=float, default=0.0)
    ap.add_argument("--patina", type=float, default=1.0)
    ap.add_argument("--exposure", type=float, default=0.0)
    ap.add_argument("--camera-json", default=None)
    ap.add_argument("--camera-json-exact", default=None, help="camera incl. resolution and sensor fit")
    ap.add_argument("--save-blend", default=None)
    ap.add_argument("--no-render", action="store_true")
    a = ap.parse_args(argv)
    if a.camera_json_exact:
        cam = C.Camera.from_dict(json.loads(pathlib.Path(a.camera_json_exact).read_text()))
    elif a.camera_json:
        cam = C.Camera.from_dict(json.loads(pathlib.Path(a.camera_json).read_text()))
        cam = cam.with_res(*a.res, fit="HORIZONTAL" if a.res[0] >= a.res[1] else "VERTICAL")
    else:
        cam = default_camera(*a.res, az=a.az, el=a.el, dist=a.dist, lens=a.lens, fstop=a.fstop, dz=a.dz)
    sc = build_scene(dict(camera=cam, samples=a.samples, patina=a.patina, exposure=a.exposure))
    if a.save_blend:
        bpy.ops.wm.save_as_mainfile(filepath=str(pathlib.Path(a.save_blend).resolve()))
    if not a.no_render:
        sc.render.filepath = str(pathlib.Path(a.out).resolve())
        t0 = time.time()
        bpy.ops.render.render(write_still=True)
        print(f"render {a.res} {a.samples}spp: {time.time() - t0:.1f}s -> {a.out}")
