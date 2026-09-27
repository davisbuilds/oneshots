"""Launch act at Pad 39B: countdown events, liftoff physics, FX and cameras.

Mission-time events (docs/REFERENCE.md): water T-20 s, hydrogen burn-off
igniters ~T-12.36 s, RS-25 start T-6.36 s (order 3-1-4-2, 120 ms stagger),
booster ignition and liftoff T-0. Ascent is integrated from thrust and mass:
2 x 14.7 MN boosters (rising over 0.3 s) + 4 x 1.86 MN RS-25, 2.61e6 kg at
liftoff, 14 t/s propellant flow. Tower clear falls near T+7 s.
"""
import math
import random

import bpy
from mathutils import Matrix, Quaternion, Vector

from . import common as C
from . import config as K
from . import fx
from . import timeline as TL
from .keys import Track, key_constant, write_all, find_fcurve
from .timeline import fr, sec, film_time

HEADING = math.radians(70.0)      # downrange heading (ENE) used for the pitch program (artistic)
G = 9.81


def ascent(T_end=22.0, dt=1.0 / 480.0):
    """Returns list of (T, pos Vector, pitch rad) sampled at 1/24 s from T=0."""
    m0, mdot = 2.61e6, 14000.0
    z = v = 0.0
    horiz = 0.0
    T = 0.0
    out = []
    next_s = 0.0
    while T <= T_end + 1e-9:
        pitch = math.radians(0.12 * max(0.0, T - 9.0) ** 1.6)
        if T >= next_s - 1e-9:
            h = Vector((math.sin(HEADING), math.cos(HEADING), 0.0))
            out.append((round(T, 5), Vector((0, 0, z)) + h * horiz, pitch))
            next_s += 1.0 / TL.FPS
        f_srb = 2 * 14.7e6 * min(1.0, T / 0.3) * (1 + 0.012 * T)
        f = f_srb + 4 * 1.86e6
        m = m0 - mdot * T
        a = f / m - G
        if z <= 0.0 and a < 0.0:
            a = 0.0
        v += a * dt
        z += v * math.cos(pitch) * dt
        horiz += v * math.sin(pitch) * dt
        T += dt
    return out


def vehicle_matrix(pos, pitch):
    axis = Vector((0, 0, 1)).cross(Vector((math.sin(HEADING), math.cos(HEADING), 0))).normalized()
    return Matrix.Translation(pos) @ Matrix.Rotation(pitch, 4, axis)


def build(scene, H, E):
    rng = random.Random(2026)
    coll = C.get_coll("Launch_FX", scene.collection)
    root = H["root"]
    prof = ascent()
    f_t0 = fr(film_time(0.0))

    # ------------------------------------------------ vehicle: liftoff and early ascent
    for T, pos, pitch in prof:
        f = f_t0 + int(round(T * TL.FPS))
        M = vehicle_matrix(pos, pitch)
        root.location = M.to_translation()
        root.rotation_euler = M.to_euler("XYZ")
        root.keyframe_insert("location", frame=f)
        root.keyframe_insert("rotation_euler", frame=f)
    root.location = (0, 0, 0)
    root.rotation_euler = (0, 0, 0)
    root.keyframe_insert("location", frame=f_t0 - 1)
    root.keyframe_insert("rotation_euler", frame=f_t0 - 1)
    from .keys import fcurves
    for fc in fcurves(root):
        for p in fc.keyframe_points:
            p.interpolation = "LINEAR"

    def veh_point(T, local):
        if T <= 0:
            return Vector(local)
        i = min(len(prof) - 1, int(T * TL.FPS))
        _, pos, pitch = prof[i]
        return vehicle_matrix(pos, pitch) @ Vector(local)

    # ------------------------------------------------ umbilical release at T-0
    tt = lambda T: film_time(T)
    for s in (1, -1):
        tsmu, car, bon = E[f"tsmu_{s}"]
        Track(car, "location", 0).set(0, car.location.x).move(tt(0.0), tt(0.35), car.location.x + 2.6, ease_out=0.1)
        Track(car, "location", 2).set(0, car.location.z).move(tt(0.0), tt(0.35), car.location.z - 0.4, ease_out=0.1)
        Track(bon, "rotation_euler", 1).set(0, bon.rotation_euler.y).move(tt(0.35), tt(1.1), 0.0, ease_out=0.2)
    for key, t0, ang in (("CSITU", 0.0, 78), ("CSFSU", 0.1, 78), ("ICPSU", 0.2, 80)):
        ob = E[key]
        Track(ob, "rotation_euler", 2).set(0, 0.0).move(tt(t0), tt(t0 + 2.4), math.radians(ang), ease_out=0.25, ease_in=0.5)
    Track(E["VSS"], "rotation_euler", 1).set(0, 0.0).move(tt(-0.4), tt(1.4), math.radians(35), ease_out=0.2)
    Track(E["OSMU"], "rotation_euler", 1).set(0, 0.0).move(tt(0.0), tt(1.6), math.radians(-24), ease_out=0.25)

    # ------------------------------------------------ plumes
    m_rs = fx.plume_material("FX_Plume_RS25", "rs25")
    m_srb = fx.plume_material("FX_Plume_SRB", "srb")
    plumes = []
    for n in K.RS25_ORDER:
        eng = H[f"RS25_E{n}"]
        p = fx.plume_mesh(f"FX_Plume_RS25_E{n}", coll, K.RS25_EXIT_R * 0.97, 42.0, 0.03, 0.0009)
        p.data.materials.append(m_rs)
        C.set_parent(p, eng, loc=(0, 0, -K.RS25_LEN + 0.02))
        plumes.append((n, p))
    for i, n in enumerate(K.RS25_ORDER):
        p = dict(plumes)[n]
        t_ig = tt(TL.T_RS25 + TL.RS25_STAGGER * i)
        p["throttle"] = 0.0
        tr = Track(p, '["throttle"]', rest=0.0)
        tr.set(0, 0.0).move(t_ig, t_ig + 0.18, 1.6, ease_out=0.05, ease_in=0.2).move(t_ig + 0.18, t_ig + 1.4, 0.75, ease_out=0.3)
        tr.move(t_ig + 1.4, t_ig + 3.2, 1.0)
    srb_plumes = []
    for tag in ("SRBN", "SRBS"):
        p = fx.plume_mesh(f"FX_Plume_{tag}", coll, K.SRB_NOZ_EXIT_R * 0.98, 130.0, 0.085, 0.0005, segs=64, rings=50)
        p.data.materials.append(m_srb)
        C.set_parent(p, H[tag], loc=(0, 0, -K.SRB_NOZ_BELOW + 0.02))
        p["throttle"] = 0.0
        tr = Track(p, '["throttle"]', rest=0.0)
        tr.set(0, 0.0).move(tt(0.0), tt(0.25), 1.35, ease_out=0.05).move(tt(0.25), tt(1.2), 1.0)
        srb_plumes.append(p)
    # trench flame (exhaust deflected north along the trench)
    tf = fx.plume_mesh("FX_Trench_Flame", coll, 5.0, 90.0, 0.06, 0.0, segs=32, rings=24)
    tf.data.materials.append(m_srb)
    tf.location = (0, -2.0, -20.5)
    tf.rotation_euler = (math.radians(-90), 0, 0)
    tf.scale = (1.0, 0.45, 1.0)
    tf["throttle"] = 0.0
    Track(tf, '["throttle"]', rest=0.0).set(0, 0.0).move(tt(TL.T_RS25 + 0.3), tt(TL.T_RS25 + 1.5), 0.12).move(tt(0.0), tt(0.4), 0.9).move(tt(9.0), tt(16.0), 0.25)
    # animate plume turbulence (4D noise W)
    for mat in (m_rs, m_srb):
        node = mat.node_tree.nodes[mat["noise_node"]]
        w = node.inputs["W"]
        w.default_value = 0.0
        w.keyframe_insert("default_value", frame=1)
        w.default_value = 2200 / TL.FPS * 3.0
        w.keyframe_insert("default_value", frame=2201)
        from .keys import fcurves as _fcs
        for fc in _fcs(mat.node_tree):
            for kp in fc.keyframe_points:
                kp.interpolation = "LINEAR"

    # ------------------------------------------------ glow lights
    def point(name, parent, loc, color, radius):
        Ld = bpy.data.lights.new(name, "POINT")
        Ld.color = color
        Ld.shadow_soft_size = radius
        Ld.energy = 0.0
        ob = bpy.data.objects.new(name, Ld)
        C.link(ob, coll)
        if parent is not None:
            C.set_parent(ob, parent, loc=loc)
        else:
            ob.location = loc
        return ob

    def flicker(light, strength=0.18, scale=2.0, seed=0):
        fc = find_fcurve(light.data, "energy", 0)
        if fc is None:
            return
        mod = fc.modifiers.new("NOISE")
        mod.scale = scale
        mod.strength = strength
        mod.blend_type = "MULTIPLY" if hasattr(mod, "blend_type") else None
        mod.phase = seed

    g_rs = point("L_RS25_Glow", H["CS_EngineSection"], (0, 0, K.Z_EXIT - K.Z_HEATSHIELD - 0.8), (1.0, 0.72, 0.5), 2.5)
    Track(g_rs.data, "energy", rest=0.0).set(0, 0.0).move(tt(TL.T_RS25), tt(TL.T_RS25 + 0.3), 5e4, ease_out=0.05).move(tt(TL.T_RS25 + 0.3), tt(TL.T_RS25 + 1.5), 2.2e4)
    srb_lights = []
    for tag in ("SRBN", "SRBS"):
        g = point(f"L_{tag}_Glow", H[tag], (0, 0, -5.0), (1.0, 0.74, 0.45), 3.5)
        Track(g.data, "energy", rest=0.0).set(0, 0.0).move(tt(0.0), tt(0.25), 9e6, ease_out=0.05).move(tt(0.25), tt(1.0), 6e6)
        srb_lights.append(g)
        g2 = point(f"L_{tag}_Glow_Plume", H[tag], (0, 0, -30.0), (1.0, 0.68, 0.40), 12.0)
        Track(g2.data, "energy", rest=0.0).set(0, 0.0).move(tt(0.0), tt(0.4), 1.6e7, ease_out=0.05)
        srb_lights.append(g2)
    trench = point("L_Trench_Glow", None, (0.0, 30.0, -20.0), (1.0, 0.66, 0.40), 8.0)
    Track(trench.data, "energy", rest=0.0).set(0, 0.0).move(tt(TL.T_RS25 + 0.3), tt(TL.T_RS25 + 1.5), 2e5).move(tt(0.0), tt(0.4), 2.5e7).move(tt(8.0), tt(16.0), 5e6)
    deck = point("L_Deck_Impingement", None, (0.0, 0.0, 4.0), (1.0, 0.70, 0.42), 10.0)
    Track(deck.data, "energy", rest=0.0).set(0, 0.0).move(tt(0.6), tt(2.0), 3e7).move(tt(6.0), tt(14.0), 1.2e7)
    write_all()
    for lo, sd in ((g_rs, 1), (srb_lights[0], 2), (srb_lights[1], 3), (srb_lights[2], 4), (srb_lights[3], 5), (trench, 6), (deck, 7)):
        flicker(lo, strength=0.22, scale=1.5, seed=sd * 13.7)

    # ------------------------------------------------ particles
    puffs = [fx.puff_mesh(coll, f"FX_Puff_{i}", seed=i + 3) for i in range(3)]
    streak = fx.streak_mesh(coll)
    m_steam = fx.smoke_material("FX_Steam", base=(0.82, 0.82, 0.83), translucency=0.4)
    m_smoke = fx.smoke_material("FX_SRB_Smoke", base=(0.76, 0.74, 0.71), translucency=0.3, soot=0.08)
    m_water = fx.water_material()
    m_spark = fx.spark_material()
    for pm in puffs:
        pm.data.materials.clear()
    puffs[0].data.materials.append(m_steam)
    puffs[1].data.materials.append(m_smoke)
    puffs[2].data.materials.append(m_smoke)
    streak_w = fx.streak_mesh(coll, "FX_Streak_Water")
    streak_w.data.materials.append(m_water)
    streak.data.materials.append(m_spark)

    def births(t0, t1, rate):
        n = int((t1 - t0) * rate)
        return [t0 + (t1 - t0) * (i + rng.random()) / max(1, n) for i in range(n)]

    def P(p0, t_birth, life, v0, drag, grav, s0, s1, tau, wind=(1.5, 0.8, 0.0), heat=0.0, stretch=0.0):
        return {"p0": tuple(p0), "birth": (t_birth * TL.FPS) + 1, "life": life, "v0": tuple(v0), "drag": drag,
                "grav": grav, "s0": s0, "s1": s1, "tau": tau, "wind": wind, "heat": heat, "stretch": stretch,
                "rot": (rng.uniform(0, 6.28), rng.uniform(0, 6.28), rng.uniform(0, 6.28)), "seed": rng.random() * 100}

    t_rs = tt(TL.T_RS25)
    t0 = tt(0.0)
    t_end = TL.FILM_END

    # water from the rainbirds (continuous from T-20)
    water = []
    for k, (pos, d) in enumerate(E["rainbirds"]):
        if k == 0:
            continue          # nozzle beside the S14 deck camera: kept dry so its jet does not cross the lens
        for tb in births(55.0, t_end, 150.0):
            # fire-hose arc (~30 deg elevation, 9-12 m throw) breaking up into droplet streaks
            dd = (d + Vector((rng.gauss(0, 0.045), rng.gauss(0, 0.045), rng.gauss(0, 0.03)))).normalized()
            water.append(P(pos, tb, 1.25, dd * rng.uniform(10.0, 12.5), 0.3, -G, 0.06, rng.uniform(0.09, 0.14), 0.6,
                           wind=(0, 0, 0), stretch=0.09))
    fx.emitter("FX_Water_Rainbirds", coll, water, streak_w, streak=True)
    # hydrogen burn-off igniter sparks (T-12.36 .. engine start + 0.8 s)
    sparks = []
    for (x, y) in ((-3.3, -2.2), (-3.3, 2.2), (3.3, -2.2), (3.3, 2.2)):
        for tb in births(TL.TIME_CUT, t_rs + 0.8, 40.0):
            aim_v = Vector((-x, -y, 3.0)).normalized()
            dd = (aim_v + Vector((rng.gauss(0, 0.25), rng.gauss(0, 0.25), rng.gauss(0, 0.15)))).normalized()
            sparks.append(P((x, y, 0.35), tb, rng.uniform(0.35, 0.8), dd * rng.uniform(9, 16), 0.6, -G, 0.016, 0.012, 0.2, wind=(0, 0, 0), stretch=0.12))
    fx.emitter("FX_HBOI_Sparks", coll, sparks, streak, streak=True)

    # steam from the RS-25 start: under/around the ML base
    steam = []
    for tb in births(t_rs + 0.4, t_end, 24.0):
        # vents from under the ML edges (not through the deck), away from camera sightlines
        ang = math.radians(rng.uniform(-60, 115))
        p0 = (5.0 + 26.0 * math.cos(ang), 23.0 * math.sin(ang), rng.uniform(-13.0, -9.0))
        v = Vector((math.cos(ang), math.sin(ang), 0)) * rng.uniform(3, 8) + Vector((0, 0, rng.uniform(1, 3)))
        steam.append(P(p0, tb, rng.uniform(10, 16), v, 0.25, 0.9, 1.2, rng.uniform(5, 9), 2.5))
    fx.emitter("FX_Steam_ML_Base", coll, steam, puffs[0])
    # steam boiling up through the core opening around the running RS-25s
    hole = []
    for tb in births(t_rs + 0.6, t0 + 1.0, 15.0):
        p0 = (rng.uniform(-3.0, 3.0), rng.choice((-1, 1)) * rng.uniform(2.2, 3.2), rng.uniform(-3.0, -1.0))
        v = Vector((rng.gauss(0, 1.5), rng.gauss(0, 1.5), rng.uniform(4, 8)))
        hole.append(P(p0, tb, rng.uniform(2.2, 3.2), v, 0.8, 1.0, 0.3, rng.uniform(0.55, 1.05), 0.8, heat=0.06))
    fx.emitter("FX_Steam_Core_Opening", coll, hole, puffs[0])
    # trench exit billows: RS-25 steam then booster exhaust, rolling north
    tre = []
    for tb in births(t_rs + 0.9, t0, 9.0) + births(t0, t_end, 34.0):
        srb = tb >= t0
        p0 = (rng.uniform(-6, 6), rng.uniform(30, 70) if srb else rng.uniform(25, 55), rng.uniform(-24, -18))
        v = Vector((rng.gauss(0, 3 if not srb else 7), rng.uniform(18, 34) if not srb else rng.uniform(35, 75), rng.uniform(2, 7)))
        s1 = rng.uniform(10, 18) if not srb else rng.uniform(16, 34)
        tre.append(P(p0, tb, rng.uniform(14, 22), v, 0.32, 1.6, 2.5, s1, 3.0, heat=0.0 if not srb else 0.35))
    fx.emitter("FX_Trench_Billows", coll, tre, puffs[1])
    # ML perimeter burst at booster ignition
    per = []
    for tb in births(t0 + 0.15, t0 + 9.0, 60.0):
        ang = math.radians(rng.uniform(-60, 125))
        p0 = (5.0 + 24 * math.cos(ang), 22 * math.sin(ang), rng.uniform(-13, -6))
        v = Vector((math.cos(ang), math.sin(ang), 0)) * rng.uniform(8, 20) + Vector((0, 0, rng.uniform(1.5, 5)))
        per.append(P(p0, tb, rng.uniform(12, 18), v, 0.35, 0.7, 2.0, rng.uniform(5.5, 10.5), 2.5, heat=0.2))
    fx.emitter("FX_ML_Perimeter", coll, per, puffs[2])
    # deck impingement: exhaust spreading across the deck once the nozzles clear the openings
    dk = []
    for tb in births(t0 + 1.1, t0 + 10.0, 95.0):
        s = rng.choice((1, -1))
        ang = math.radians(rng.uniform(-70, 160))
        p0 = (rng.gauss(0, 2.0), s * K.SRB_Y + rng.gauss(0, 2.0), rng.uniform(0.5, 3.0))
        spd = rng.uniform(18, 40) * (0.6 if 150 < math.degrees(ang) % 360 < 200 else 1.0)
        v = Vector((math.cos(ang), math.sin(ang), 0)) * spd + Vector((0, 0, rng.uniform(2, 6)))
        dk.append(P(p0, tb, rng.uniform(12, 18), v, 0.42, 0.8, 1.8, rng.uniform(6, 12), 2.2, heat=0.55))
    fx.emitter("FX_Deck_Impingement", coll, dk, puffs[1])
    # booster exhaust trail following the vehicle
    trail = []
    for tb in births(t0 + 0.6, t_end, 30.0):
        T = tb - 69.0
        s = rng.choice((1, -1))
        local = (rng.gauss(0, 1.5), s * K.SRB_Y + rng.gauss(0, 1.5), K.Z_EXIT - rng.uniform(14, 34))
        p0 = veh_point(T, local)
        v = Vector((rng.gauss(0, 2), rng.gauss(0, 2), -rng.uniform(8, 18)))
        trail.append(P(p0, tb, 60.0, v, 0.55, 0.7, 4.5, rng.uniform(14, 24), 5.0, wind=(2.2, 1.0, 0.0), heat=0.25))
    fx.emitter("FX_Booster_Trail", coll, trail, puffs[2])
    return {"prof": prof, "veh_point": veh_point}


# ----------------------------------------------------------------------------- cameras

def cameras(scene, H, info, hero_keys):
    from .anim_studio import make_camera, sph
    coll = C.get_coll("Pad_Cameras", scene.collection)
    veh_point = info["veh_point"]

    def vz(T):
        return veh_point(T, (0, 0, 0)).z

    specs = {
        "S13": (hero_keys, 20, 16.0),
        "S14": ([(59.0, (-1.2, -0.8, 2.6), 218, 2, 14.2), (62.5, (-1.0, -0.6, 2.8), 222, 3, 12.6)], 28, 5.6),
        "S15": ([(62.5, (0.0, 0.0, 2.4), 184, 2, 17.5), (65.5, (0.0, 0.0, 2.2), 188, 3, 15.8)], 35, 6.3),
        "S16": ([(65.5, (0.0, 0.0, 40.0), 138, -22.3, 150.0), (68.8, (0.0, 0.0, 41.0), 142, -22.0, 143.0)], 28, 16.0),
    }
    cams = {}
    for sid in ("S13", "S14", "S15", "S16"):
        keys, lens, fstop = specs[sid]
        cam, tgt = make_camera(sid, TL.shot(sid)[1], keys, lens, fstop, coll)
        cams[sid] = (cam, tgt)
    # tracking shots: keyed per frame from the ascent profile
    trackers = {
        "S17": dict(pos=(-74.0, -58.0, 2.6), lens=24, fstop=11.0, aim=lambda T: Vector((0, 0, 17.0 + max(0.0, vz(T)) * 0.8))),
        "S18": dict(pos=(-900.0, -700.0, -26.0), lens=150, fstop=16.0, aim=lambda T: Vector((0, 0, max(62.0, vz(T) + 52.0)))),
        "S19": dict(pos=(-1450.0, -950.0, -26.0), lens=400, fstop=16.0, aim=lambda T: veh_point(T, (0, 0, -6.0))),
        "S20": dict(pos=(-2300.0, -1500.0, -24.0), lens=70, fstop=16.0, aim=lambda T: Vector((0, 0, 60.0)).lerp(veh_point(T, (0, 0, 20.0)), 0.62)),
    }
    for sid, spec in trackers.items():
        _, name, _, t0, t1 = TL.shot(sid)
        camd = bpy.data.cameras.new(f"CAM_{sid}_{name}")
        camd.lens = spec["lens"]
        camd.clip_start = 0.5
        camd.clip_end = 20000
        camd.dof.use_dof = True
        camd.dof.aperture_fstop = spec["fstop"]
        cam = bpy.data.objects.new(f"CAM_{sid}_{name}", camd)
        C.link(cam, coll)
        tgt = C.empty(f"TGT_{sid}", coll, size=2.0, kind="SPHERE")
        con = cam.constraints.new("TRACK_TO")
        con.target = tgt
        con.track_axis = "TRACK_NEGATIVE_Z"
        con.up_axis = "UP_Y"
        camd.dof.focus_object = tgt
        cam.location = spec["pos"]
        # smooth the aim with a short moving average so tracking has operator-like lag
        hist = []
        for f in range(fr(t0) - 2, fr(t1) + 2):
            T = TL.mission_time(sec(f))
            hist.append(spec["aim"](T))
            if len(hist) > 5:
                hist.pop(0)
            avg = sum(hist, Vector()) / len(hist)
            tgt.location = avg
            tgt.keyframe_insert("location", frame=f)
        cams[sid] = (cam, tgt)
    # gentle camera shake after booster ignition on the close shots
    write_all()
    for sid, amp in (("S17", 0.16), ("S16", 0.35)):
        tgt = cams[sid][1]
        from .keys import fcurves as _fcs
        for fc in _fcs(tgt):
            if fc.data_path == "location":
                mod = fc.modifiers.new("NOISE")
                mod.scale = 3.0
                mod.strength = amp
                mod.phase = fc.array_index * 7.1
                mod.use_restricted_range = True
                mod.frame_start = fr(film_time(0.15))
                mod.frame_end = fr(TL.shot(sid)[4]) + 2
                mod.blend_in = 6
    for sid, name, sc_name, t0, t1 in TL.SHOTS:
        if sc_name == "SC_Pad":
            mk = scene.timeline_markers.new(f"{sid}_{name}", frame=fr(t0))
            mk.camera = cams[sid][0]
    write_all()
    return cams
