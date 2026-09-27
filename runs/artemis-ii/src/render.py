"""Final render driver: shot by shot, resumable image sequences.

python src/render.py -- --blend output/artemis_ii.blend --scene SC_Studio --out output/frames_studio [--shots S01,S02] [--threads 2]

Existing frames are skipped (use_overwrite=False, placeholders on), so an
interrupted render resumes where it stopped. Per-shot overrides live in
OVERRIDES (motion blur is disabled where nothing moves fast enough to need it).
"""
import argparse
import os
import sys
import time

import bpy

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import timeline as TL  # noqa: E402

OVERRIDES = {
    "S14": {"use_motion_blur": False},
    "S15": {"use_motion_blur": False},
    "S13": {"use_motion_blur": False},
}


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[1:]
    ap = argparse.ArgumentParser()
    ap.add_argument("--blend", required=True)
    ap.add_argument("--scene", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--shots", default=None)
    ap.add_argument("--threads", type=int, default=0)
    ap.add_argument("--reverse", action="store_true")
    a = ap.parse_args(argv)
    bpy.ops.wm.open_mainfile(filepath=os.path.abspath(a.blend))
    sc = bpy.data.scenes[a.scene]
    if bpy.context.window:
        bpy.context.window.scene = sc
    r = sc.render
    if a.threads:
        r.threads_mode = "FIXED"
        r.threads = a.threads
    r.use_overwrite = False
    r.use_placeholder = True
    os.makedirs(a.out, exist_ok=True)
    r.filepath = os.path.join(os.path.abspath(a.out), "f_####")
    shots = [s for s in TL.SHOTS if s[2] == a.scene]
    if a.shots:
        keep = set(a.shots.split(","))
        shots = [s for s in shots if s[0] in keep]
    if a.reverse:
        shots = shots[::-1]
    base_mb = r.use_motion_blur
    for sid, name, _, t0, t1 in shots:
        f0, f1 = TL.fr(t0), TL.fr(t1) - (0 if sid in ("S12", "S20") else 1)
        if sid == "S12":
            f1 = TL.fr(TL.DISSOLVE[1])
        sc.frame_start, sc.frame_end = f0, f1
        r.use_motion_blur = OVERRIDES.get(sid, {}).get("use_motion_blur", base_mb)
        t = time.time()
        print(f"SHOT_START {sid} {name} frames {f0}-{f1}", flush=True)
        bpy.ops.render.render(animation=True, scene=sc.name)
        print(f"SHOT_DONE {sid} {time.time() - t:.0f}s", flush=True)
    print("RENDER_ALL_DONE", flush=True)


if __name__ == "__main__":
    main()
