"""Assembly collision check for the studio choreography.

For every sampled frame, compare each pair of parts' world-space AABB
overlap with the overlap they have when fully assembled (legitimate nesting,
e.g. tank domes inside skirts). Overlap beyond the assembled value means a
part passes through another during a move. Coarse (AABBs), but it catches
real interpenetration of the major pieces.

python src/check_collisions.py -- --blend output/artemis_ii.blend [--step 2]
"""
import argparse
import itertools
import os
import sys

import bpy
from mathutils import Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import timeline as TL  # noqa: E402

PREFIXES = ("CS_", "RS25_E", "SRBN_", "SRBS_", "LVSA", "ICPS_", "OSA", "Orion_", "LAS_")
SKIP = ("_Nozzle_", "Feedlines", "BaseHeatShield", "EngineBoots")


def aabb(ob):
    pts = [ob.matrix_world @ Vector(c) for c in ob.bound_box]
    lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    return lo, hi


def overlap(a, b):
    v = 1.0
    for i in range(3):
        d = min(a[1][i], b[1][i]) - max(a[0][i], b[0][i])
        if d <= 0:
            return 0.0
        v *= d
    return v


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[1:]
    ap = argparse.ArgumentParser()
    ap.add_argument("--blend", required=True)
    ap.add_argument("--step", type=int, default=2)
    a = ap.parse_args(argv)
    bpy.ops.wm.open_mainfile(filepath=os.path.abspath(a.blend))
    sc = bpy.data.scenes["SC_Studio"]
    obs = [o for o in sc.objects if o.type == "MESH" and o.name.startswith(PREFIXES) and not any(s in o.name for s in SKIP)
           and not o.name.startswith("RS25_E") or (o.type == "MESH" and o.name.endswith("_Nozzle"))]
    obs = [o for o in obs if o.type == "MESH"]
    sc.frame_set(TL.fr(TL.shot("S12")[3]) + 10)          # fully assembled
    rest = {o.name: aabb(o) for o in obs}
    pairs = []
    for x, y in itertools.combinations(obs, 2):
        pairs.append((x, y, overlap(rest[x.name], rest[y.name])))
    issues = {}
    for f in range(1, TL.fr(TL.shot("S12")[3]) + 1, a.step):
        sc.frame_set(f)
        boxes = {o.name: aabb(o) for o in obs}
        for x, y, r0 in pairs:
            ov = overlap(boxes[x.name], boxes[y.name])
            vx = (boxes[x.name][1] - boxes[x.name][0])
            vy = (boxes[y.name][1] - boxes[y.name][0])
            vmin = min(vx.x * vx.y * vx.z, vy.x * vy.y * vy.z)
            if ov > r0 + 0.25 and ov > r0 * 1.02 + 0.05 * vmin:
                key = (x.name, y.name)
                issues.setdefault(key, []).append((f, ov - r0))
    print(f"COLLISION_CHECK objects={len(obs)} pairs={len(pairs)} flagged={len(issues)}")
    for (n1, n2), lst in sorted(issues.items(), key=lambda kv: -max(v for _, v in kv[1])):
        fr0, fr1 = lst[0][0], lst[-1][0]
        worst = max(v for _, v in lst)
        print(f"  {n1:32s} x {n2:32s} frames {fr0}-{fr1} ({TL.sec(fr0):.1f}-{TL.sec(fr1):.1f}s) excess {worst:.2f} m3")


if __name__ == "__main__":
    main()
