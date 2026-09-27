"""Assemble the SLS Block 1 crew vehicle hierarchy for Artemis II."""
import os

import bpy

from . import common as C
from . import config as K
from . import core, materials as M, orion, rs25, srb, upper

DECALS = os.path.join(M.ASSET_DIR, "decals")


def build(scene_coll=None):
    P = M.palette()
    worm = M.decal_material("NASA_Worm", os.path.join(DECALS, "nasa_worm.png"))
    flag = M.decal_material("US_Flag", os.path.join(DECALS, "us_flag.png"))
    esa = M.decal_material("ESA_Plate", os.path.join(DECALS, "esa_plate.png"))

    top = C.get_coll("SLS_Vehicle", scene_coll)
    c_core = C.get_coll("CoreStage", top)
    c_eng = C.get_coll("RS25_Engines", c_core)
    c_srbn = C.get_coll("SRB_North", top)
    c_srbs = C.get_coll("SRB_South", top)
    c_up = C.get_coll("UpperStack", top)
    c_or = C.get_coll("Orion", top)

    root = C.empty("SLS_Root", top, size=6.0, kind="ARROWS")
    H = {"root": root}

    core_root = C.empty("CoreStage", c_core, parent=root, size=5.0, kind="ARROWS")
    H["CoreStage"] = core_root
    parts = core.build(c_core, core_root, P)
    H.update({f"CS_{k}": v for k, v in parts.items()})

    meshes = rs25.build_meshes(P)
    shared = {}
    for n, (x, y) in K.RS25_POS.items():
        e = rs25.make_engine(n, meshes, c_eng, parts["EngineSection"], P, shared)
        e.location = (x, y, K.RS25_GIMBAL_Z - K.Z_HEATSHIELD)
        H[f"RS25_E{n}"] = e
    for bm, _ in meshes.values():
        bm.free()

    for side, coll in ((1, c_srbn), (-1, c_srbs)):
        p = srb.build(side, coll, root, P, worm)
        tag = "SRBN" if side > 0 else "SRBS"
        H[tag] = p["root"]
        H.update({f"{tag}_{k}": v for k, v in p.items() if k != "root"})

    up_root = C.empty("UpperStack", c_up, parent=root, size=4.0, kind="ARROWS")
    H["UpperStack"] = up_root
    p = upper.build(c_up, up_root, P, flag)
    H.update(p)

    p = orion.build(c_or, root, P, worm, esa)
    H["Orion"] = p["root"]
    H.update({f"Orion_{k}": v for k, v in p.items() if k != "root"})
    return H, P
