"""Studio choreography: components -> subassemblies -> integration -> hero.

The whole exploded "component field" exists from frame 1. Offsets are
expressed relative to each part's assembled (rest) location so that every
part ends exactly on its real interface. Two levels:
  * part offsets inside a subassembly (close during Act II), and
  * subassembly root offsets (the exploded view; close during Act III).
"""
import math

import bpy
from mathutils import Vector

from . import common as C
from . import config as K
from . import timeline as TL
from .keys import Track, key_constant, write_all
from .timeline import fr

LIFT = 7.0
BOOSTER_OUT = 15.0
UPPER_LIFT_A, UPPER_LIFT_B = 29.0, 19.0       # Act I-II vs Act III exploded view
ORION_LIFT_A, ORION_LIFT_B = 47.0, 36.0

CORE_OFF = {"CS_LH2Tank": 4.0, "CS_Intertank": 8.0, "CS_LOXTank": 12.0, "CS_ForwardSkirt": 16.0}
ENGINE_SPREAD, ENGINE_DROP = 1.5, 6.2
SRB_PARTS = ["Seg_Aft", "Seg_CenterAft", "Seg_Center", "Seg_CenterFwd", "Seg_Fwd", "FwdSkirt", "Frustum", "NoseCap"]
SRB_GAP = 2.2
UP_OFF = {"ICPS": 12.0, "OSA": 15.0}
OR_OFF = {"Orion_ESM": 3.0, "Orion_CMA": 5.0, "Orion_CM": 10.0, "Orion_LAS": 16.0}
SAJ_OUT, SAJ_UP = 4.6, 2.5


def _z(ob):
    return Track(ob, "location", 2)


def choreograph(H):
    """Keyframe all vehicle motion for the studio acts."""
    # ------------------------------------------------------------ subassembly roots
    core = _z(H["CoreStage"])
    core.set(0, LIFT).move(46.0, 47.2, 0.0)
    for tag, s in (("SRBN", 1), ("SRBS", -1)):
        ob = H[tag]
        y0 = ob.location.y
        ty = Track(ob, "location", 1)
        tz = _z(ob)
        tz.set(0, ob.location.z + LIFT).move(46.0, 47.2, ob.location.z)
        ty.set(0, y0 + s * BOOSTER_OUT).move(47.0, 48.4, y0, ease_out=0.38, ease_in=0.5)
    up = _z(H["UpperStack"])
    up.set(0, UPPER_LIFT_A).move(21.2, 24.0, UPPER_LIFT_B).move(46.0, 47.2, UPPER_LIFT_B - LIFT).move(47.8, 49.0, 0.0, ease_in=0.5)
    orz = _z(H["Orion"])
    z0 = H["Orion"].location.z
    orz.set(0, z0 + ORION_LIFT_A).move(21.2, 24.0, z0 + ORION_LIFT_B).move(46.0, 47.2, z0 + ORION_LIFT_B - LIFT)
    orz.move(47.9, 50.0, z0, ease_in=0.5)

    # ------------------------------------------------------------ core stage, top-down joins
    rest = {k: H[k].location.z for k in CORE_OFF}
    tr = {k: _z(H[k]).set(0, rest[k] + v) for k, v in CORE_OFF.items()}
    steps = [(16.3, 17.3, ["CS_ForwardSkirt"]),
             (17.4, 18.4, ["CS_LOXTank", "CS_ForwardSkirt"]),
             (18.5, 19.5, ["CS_Intertank", "CS_LOXTank", "CS_ForwardSkirt"]),
             (19.6, 20.6, ["CS_LH2Tank", "CS_Intertank", "CS_LOXTank", "CS_ForwardSkirt"])]
    for t0, t1, names in steps:
        for n in names:
            cur = tr[n].value_before(fr(t0))
            tr[n].move(t0, t1, cur - 4.0)

    # ------------------------------------------------------------ RS-25 engines seat in ignition order 3-1-4-2
    for i, n in enumerate(K.RS25_ORDER):
        ob = H[f"RS25_E{n}"]
        x, y, z = ob.location
        t0 = 21.4 + 0.6 * i
        Track(ob, "location", 0).set(0, x * ENGINE_SPREAD).move(t0, t0 + 1.6, x, ease_out=0.35, ease_in=0.55)
        Track(ob, "location", 1).set(0, y * ENGINE_SPREAD).move(t0, t0 + 1.6, y, ease_out=0.35, ease_in=0.55)
        Track(ob, "location", 2).set(0, z - ENGINE_DROP).move(t0, t0 + 1.6, z, ease_out=0.35, ease_in=0.55)

    # ------------------------------------------------------------ boosters, bottom-up stacking
    for tag, dt in (("SRBN", 0.0), ("SRBS", 0.18)):
        noz = H[f"{tag}_Nozzle"]
        _z(noz).set(0, noz.location.z - SRB_GAP).move(25.7 + dt, 26.7 + dt, noz.location.z)
        for i, p in enumerate(SRB_PARTS):
            ob = H[f"{tag}_{p}"]
            travel = SRB_GAP * (i + 1)
            t0 = 25.8 + dt + 0.42 * i
            _z(ob).set(0, ob.location.z + travel).move(t0, t0 + 1.0 + 0.045 * travel, ob.location.z, ease_in=0.5)

    # ------------------------------------------------------------ upper stack
    for n, (t0, t1) in (("ICPS", (31.3, 32.8)), ("OSA", (32.0, 33.5))):
        ob = H[n]
        _z(ob).set(0, ob.location.z + UP_OFF[n]).move(t0, t1, ob.location.z, ease_in=0.5)

    # ------------------------------------------------------------ Orion
    for n, (t0, t1) in (("Orion_ESM", (34.2, 35.2)), ("Orion_CMA", (34.5, 35.6)), ("Orion_CM", (35.5, 36.7)),
                        ("Orion_LAS", (36.0, 37.5))):
        ob = H[n]
        _z(ob).set(0, ob.location.z + OR_OFF[n]).move(t0, t1, ob.location.z, ease_in=0.5)
    for k in range(1, 4):
        ob = H[f"Orion_SAJ_{k}"]
        a = ob["hinge_azimuth"]
        x0, y0, zz = ob.location
        Track(ob, "location", 0).set(0, x0 + SAJ_OUT * math.cos(a)).move(35.0, 36.4, x0)
        Track(ob, "location", 1).set(0, y0 + SAJ_OUT * math.sin(a)).move(35.0, 36.4, y0)
        _z(ob).set(0, zz + SAJ_UP).move(35.0, 36.4, zz)
    write_all()


# ----------------------------------------------------------------------------
# Cameras and per-shot lighting
# ----------------------------------------------------------------------------

def sph(target, az, el, dist):
    a, e = math.radians(az), math.radians(el)
    return Vector(target) + dist * Vector((math.cos(e) * math.cos(a), math.cos(e) * math.sin(a), math.sin(e)))


# shot id -> (camera keys [(t, target, az, el, dist)], lens, fstop)
# targets are world points (vehicle frame) in the state at that time.
def camera_specs(H):
    E1 = Vector((K.RS25_POS[1][0] * ENGINE_SPREAD, K.RS25_POS[1][1] * ENGINE_SPREAD, K.RS25_GIMBAL_Z + LIFT - ENGINE_DROP))
    yN = K.SRB_Y + BOOSTER_OUT
    zN = K.SRB_BASE_Z + LIFT
    ca_top = zN + K.SRB_AFTSKIRT_H + 2 * K.SRB_SEG_H + 2 * SRB_GAP           # top face of Seg_CenterAft
    lox_ring = K.Z_IT_TOP + CORE_OFF["CS_LOXTank"] + LIFT
    icps_b = K.Z_ICPS_BOTTOM + UP_OFF["ICPS"] + UPPER_LIFT_A
    cm_apex = K.Z_CM + OR_OFF["Orion_CM"] + ORION_LIFT_A
    esm_mid = K.Z_ESM + OR_OFF["Orion_ESM"] + ORION_LIFT_A + 2.0
    return {
        "S01": ([(0.0, (E1.x, E1.y, 2.35), 206, 4, 3.3, 1.10), (5.5, (E1.x, E1.y, E1.z - 1.05), 238, 12, 4.4, 0.45)], 60, 2.4),
        "S02": ([(5.5, (0.0, yN, ca_top - 0.4), 200, 34, 8.2, 1.1), (8.5, (0.0, yN, ca_top + 0.1), 222, 24, 6.6, 0.9)], 45, 4.0),
        "S03": ([(8.5, (0.0, 0.0, lox_ring - 1.2), 228, -20, 17.0), (11.2, (0.0, 0.0, lox_ring - 0.4), 243, -11, 14.5)], 28, 5.0),
        "S04": ([(11.2, (0.0, 0.0, icps_b + 2.0), 198, -14, 9.5, 1.0), (13.5, (0.0, 0.0, icps_b + 3.0), 224, -5, 8.4, 1.5)], 32, 4.0),
        "S05": ([(13.5, (0.0, 0.0, cm_apex + 0.2), 252, -24, 12.5, 0.0), (16.0, (0.0, 0.0, esm_mid + 1.2), 268, -3, 15.0, 1.2)], 35, 5.6),
        "S06": ([(16.0, (0.0, 0.0, 56.0), 214, 3, 106.0), (21.0, (0.0, 0.0, 48.0), 224, 4, 96.0)], 35, 11.0),
        "S07": ([(21.0, (0.0, 0.0, 7.0), 222, -9, 23.0), (25.5, (0.0, 0.0, 9.0), 247, -12, 19.0)], 26, 8.0),
        "S08": ([(25.5, (0.0, yN, zN + 8.0), 150, 6, 30.0), (31.0, (0.0, yN, zN + 44.0), 158, 4, 34.0)], 30, 8.0),
        "S09": ([(31.0, (0.0, 0.0, K.Z_LVSA_TOP + UPPER_LIFT_B + 3.0), 215, 6, 30.0), (34.0, (0.0, 0.0, K.Z_LVSA_TOP + UPPER_LIFT_B + 5.0), 230, 8, 27.0)], 38, 8.0),
        "S10": ([(34.0, (0.0, 0.0, K.Z_ESM + ORION_LIFT_B + 3.5), 205, 5, 34.0), (38.0, (0.0, 0.0, K.Z_CM + ORION_LIFT_B + 4.5), 228, 7, 38.0)], 40, 8.0),
        "S11": ([(38.0, (0.0, 0.0, 70.0), 216, 4, 372.0), (46.0, (0.0, 0.0, 67.0), 206, 3.5, 366.0), (50.5, (0.0, 0.0, 52.0), 200, 3.0, 300.0)], 50, 16.0),
        "S12": ([(50.5, (0.0, 0.0, 40.0), 197, -20.5, 104.0), (59.0, (0.0, 0.0, 43.0), 206, -22.0, 98.0)], 20, 16.0),
    }


def _resolve_key(k):
    """(t, axis_point, az, el, dist[, r_surface]) -> (t, surface_target, az, el, dist)."""
    t, pt, az, el, dist = k[:5]
    r = k[5] if len(k) > 5 else 0.0
    a = math.radians(az)
    tgt = Vector(pt) + r * Vector((math.cos(a), math.sin(a), 0.0))
    return (t, tuple(tgt), az, el, dist)


def make_camera(sid, name, keys, lens, fstop, coll):
    cam = bpy.data.cameras.new(f"CAM_{sid}_{name}")
    cam.lens = lens
    cam.clip_start = 0.05
    cam.clip_end = 3000.0
    cam.dof.use_dof = True
    cam.dof.aperture_fstop = fstop
    cam.dof.aperture_blades = 7
    ob = bpy.data.objects.new(f"CAM_{sid}_{name}", cam)
    C.link(ob, coll)
    tgt = C.empty(f"TGT_{sid}", coll, size=0.5, kind="SPHERE")
    con = ob.constraints.new("TRACK_TO")
    con.target = tgt
    con.track_axis = "TRACK_NEGATIVE_Z"
    con.up_axis = "UP_Y"
    cam.dof.focus_object = tgt
    tx, ty, tz = (Track(tgt, "location", i) for i in range(3))
    cx, cy, cz = (Track(ob, "location", i) for i in range(3))
    keys = [_resolve_key(k) for k in keys]
    for i, (t, target, az, el, dist) in enumerate(keys):
        p = sph(target, az, el, dist)
        if i == 0:
            for tr, v in zip((tx, ty, tz), target):
                tr.set(t, v)
            for tr, v in zip((cx, cy, cz), p):
                tr.set(t, v)
        else:
            t_prev = keys[i - 1][0]
            for tr, v in zip((tx, ty, tz), target):
                tr.move(t_prev, t, v, ease_out=0.3, ease_in=0.3)
            for tr, v in zip((cx, cy, cz), p):
                tr.move(t_prev, t, v, ease_out=0.3, ease_in=0.3)
    ob.location = sph(*keys[0][1:])
    tgt.location = keys[0][1]
    return ob, tgt


def area_light(name, coll, size, color, shape="RECTANGLE", size_y=None):
    L = bpy.data.lights.new(name, "AREA")
    L.shape = shape
    L.size = size
    if size_y:
        L.size_y = size_y
    L.color = color
    L.energy = 0.0
    ob = bpy.data.objects.new(name, L)
    C.link(ob, coll)
    return ob


def aim(ob, target):
    d = Vector(target) - ob.location
    ob.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()


# per-shot light rigs: list of (role, az_offset_from_camera, elevation, dist_factor, size_factor, irradiance, color)
RIG = [
    ("key", 58, 32, 2.2, 1.2, 1.4, (1.0, 0.95, 0.88)),
    ("rimA", 162, 18, 2.4, 0.9, 7.0, (0.80, 0.88, 1.0)),
    ("rimB", -150, 28, 2.4, 0.9, 5.0, (1.0, 0.86, 0.70)),
    ("fill", -60, -8, 2.6, 2.0, 0.25, (0.85, 0.9, 1.0)),
]


def build_lights_and_cameras(scene, H):
    coll = C.get_coll("Studio_Cameras", scene.collection)
    lcoll = C.get_coll("Studio_Lights", scene.collection)
    specs = camera_specs(H)
    cams = {}
    for sid, name, sc_name, t0, t1 in TL.SHOTS:
        if sid not in specs:
            continue
        keys, lens, fstop = specs[sid]
        cam, tgt = make_camera(sid, name, keys, lens, fstop, coll)
        cams[sid] = cam
        m = scene.timeline_markers.new(f"{sid}_{name}", frame=fr(t0))
        m.camera = cam
        # lighting rig anchored at the shot's mid-state
        t_mid = keys[len(keys) // 2][0] if len(keys) > 2 else (keys[0][0] + keys[-1][0]) / 2
        tgt_mid = Vector(keys[0][1]).lerp(Vector(keys[-1][1]), 0.5)
        az_cam = (keys[0][2] + keys[-1][2]) / 2
        subject = {"S11": 70.0, "S12": 60.0, "S06": 45.0, "S08": 20.0, "S10": 12.0, "S09": 12.0}.get(sid, max(4.0, keys[0][4] * 0.6))
        f_on, f_off = fr(t0) - (1 if t0 > 0 else 0), fr(t1) + 1
        boost = {"S01": 2.0, "S11": 2.6, "S12": 2.6, "S06": 2.0, "S05": 2.8, "S08": 1.4, "S09": 1.6, "S10": 1.6, "S02": 1.4}.get(sid, 1.0)
        for role, daz, el, dfac, sfac, irr, col in RIG:
            irr = irr * (boost if role in ("key", "fill") else 1.0 + 0.4 * (boost - 1.0))
            d = subject * dfac
            L = area_light(f"L_{sid}_{role}", lcoll, subject * sfac, col)
            L.location = sph(tgt_mid, az_cam + daz, el, d)
            aim(L, tgt_mid)
            power = irr * math.pi * d * d
            vals = [(1, 0.0)] if f_on > 1 else []
            vals += [(max(1, f_on), power), (f_off, 0.0)]
            key_constant(L.data, "energy", vals)
            key_constant(L, "hide_render", [(v[0], v[1] == 0.0) for v in vals])
    write_all()
    return cams


# ----------------------------------------------------------------------------
# Label anchors (typography drawn by src/overlay.py from projected positions)
# ----------------------------------------------------------------------------

LABELS = [
    # name, parent key, local offset, title, subtitle, side
    ("LAS", "Orion_Tower", (0, 0, 9.5), "LAUNCH ABORT SYSTEM", "abort motor · ogive fairing", "L"),
    ("Orion", "Orion_CM", (0, 0, 1.2), "ORION  “INTEGRITY”", "crew module · ESA European Service Module", "R"),
    ("ICPS", "ICPS_LH2", (0, 0, 9.6), "INTERIM CRYOGENIC PROPULSION STAGE", "one RL10 engine · stage adapters", "L"),
    ("LVSA", "LVSA", (0, 0, 4.0), "LAUNCH VEHICLE STAGE ADAPTER", "", "R"),
    ("Core", "CS_Intertank", (0, 0, 3.0), "CORE STAGE", "LOX tank · intertank · LH2 tank · 64.6 m", "L"),
    ("SRB", "SRBS_Seg_Center", (0, 0, 4.0), "SOLID ROCKET BOOSTERS  ×2", "five segments each · 53.9 m", "R"),
    ("RS25", "CS_EngineSection", (0, 0, -1.2), "RS-25 ENGINES  ×4", "", "L"),
]


def build_labels(scene, H):
    coll = C.get_coll("Labels", scene.collection)
    out = []
    for name, pk, off, title, sub, side in LABELS:
        e = C.empty(f"LBL_{name}", coll, parent=H[pk], loc=off, size=1.0, kind="SPHERE")
        e["label"] = title
        e["sub"] = sub
        e["side"] = side
        e["shot"] = "S11"
        e.hide_render = True
        out.append(e)
    return out
