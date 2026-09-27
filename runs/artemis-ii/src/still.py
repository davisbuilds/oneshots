"""Render individual frames with Cycles (look-dev, stills, benchmarks).

python src/still.py -- --blend output/artemis_ii.blend --scene SC_Studio --frames 100,1000 --out dir [--res 1920] [--samples 64]
"""
import argparse
import os
import sys
import time

import bpy


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[1:]
    ap = argparse.ArgumentParser()
    ap.add_argument("--blend", required=True)
    ap.add_argument("--scene", default="SC_Studio")
    ap.add_argument("--frames", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--res", type=int, default=1920)
    ap.add_argument("--samples", type=int, default=None)
    ap.add_argument("--threshold", type=float, default=None)
    ap.add_argument("--prefix", default="")
    ap.add_argument("--nomb", action="store_true")
    a = ap.parse_args(argv)
    bpy.ops.wm.open_mainfile(filepath=os.path.abspath(a.blend))
    sc = bpy.data.scenes[a.scene]
    if bpy.context.window:
        bpy.context.window.scene = sc
    r = sc.render
    r.resolution_x = a.res
    r.resolution_y = a.res * 9 // 16
    r.resolution_percentage = 100
    r.use_overwrite = True
    r.use_placeholder = False
    if a.nomb:
        r.use_motion_blur = False
    if a.samples:
        sc.cycles.samples = a.samples
    if a.threshold:
        sc.cycles.adaptive_threshold = a.threshold
    os.makedirs(a.out, exist_ok=True)
    for f in [int(x) for x in a.frames.split(",")]:
        sc.frame_set(f)
        r.filepath = os.path.join(os.path.abspath(a.out), f"{a.prefix}{a.scene}_{f:04d}.png")
        t = time.time()
        bpy.ops.render.render(write_still=True, scene=sc.name)
        print(f"STILL {f} {time.time() - t:.1f}s -> {r.filepath}", flush=True)


if __name__ == "__main__":
    main()
