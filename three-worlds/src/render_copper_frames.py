"""Render the MATTER act frames (resumable: existing frames are skipped).

python3 src/render_copper_frames.py --outdir frames/copper --samples 24
"""
import sys, argparse, pathlib, time
import numpy as np
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import bpy, mathutils
import copper_scene as S, timeline as T, common as C

ap = argparse.ArgumentParser()
ap.add_argument("--outdir", default=str(C.ROOT / "frames/copper"))
ap.add_argument("--res", nargs=2, type=int, default=[T.W, T.H])
ap.add_argument("--samples", type=int, default=24)
ap.add_argument("--frames", nargs="*", type=int, default=None)
a = ap.parse_args(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[1:])
out = pathlib.Path(a.outdir); out.mkdir(parents=True, exist_ok=True)
f0, f1 = int(round(T.ORBIT[0] * T.FPS)), int(round(T.ORBIT[1] * T.FPS))
frames = a.frames if a.frames else list(range(f0, f1 + 1))
W, H = a.res
sc = S.build_scene(dict(camera=T.matter_camera(T.ORBIT[0], W, H), samples=a.samples))
cam_ob = sc.camera
for f in frames:
    p = out / f"copper_{f:04d}.png"
    if p.exists():
        continue
    k = T.matter_camera(f / T.FPS, W, H)
    cam_ob.matrix_world = mathutils.Matrix(k.matrix_world().tolist())
    cam_ob.data.dof.focus_distance = k.focus
    sc.render.filepath = str(p)
    t0 = time.time()
    bpy.ops.render.render(write_still=True)
    print(f"frame {f} {time.time() - t0:.1f}s", flush=True)
