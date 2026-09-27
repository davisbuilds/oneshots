"""Render the four deliverable stills natively at 3840x2160.

python src/stills.py -- --blend output/artemis_ii.blend --out output [--only engine,exploded] [--samples 40]
The exploded-assembly still gets the film's tracked labels, drawn at 2x. 8-bit RGB PNG.
"""
import argparse
import json
import os
import subprocess
import sys
import time

import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

STILLS = {
    # name: (scene, frame, samples multiplier, labels)
    "01_engine_detail": ("SC_Studio", 118, 1.0, False),
    "02_exploded_assembly": ("SC_Studio", 1064, 1.0, True),
    "03_complete_vehicle": ("SC_Studio", 1296, 1.0, False),
    "04_launch": ("SC_Pad", 1812, 1.0, False),
}


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[1:]
    ap = argparse.ArgumentParser()
    ap.add_argument("--blend", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--only", default=None)
    ap.add_argument("--samples", type=int, default=40)
    ap.add_argument("--tracks", default=os.path.join(HERE, "..", "output", "label_tracks.json"))
    ap.add_argument("--frame-override", default=None, help="name=frame,...")
    a = ap.parse_args(argv)
    bpy.ops.wm.open_mainfile(filepath=os.path.abspath(a.blend))
    os.makedirs(a.out, exist_ok=True)
    over = dict(kv.split("=") for kv in a.frame_override.split(",")) if a.frame_override else {}
    for name, (scene, frame, smul, labels) in STILLS.items():
        if a.only and not any(k in name for k in a.only.split(",")):
            continue
        frame = int(over.get(name, frame))
        sc = bpy.data.scenes[scene]
        if bpy.context.window:
            bpy.context.window.scene = sc      # frame_set must evaluate the scene being rendered
        r = sc.render
        r.resolution_x, r.resolution_y, r.resolution_percentage = 3840, 2160, 100
        r.use_overwrite, r.use_placeholder = True, False
        r.image_settings.file_format = "PNG"
        r.image_settings.color_mode = "RGB"
        r.image_settings.color_depth = "8"      # Blender dithers on 8-bit output; 16-bit masters were ~40 MB each
        sc.cycles.samples = int(a.samples * smul)
        sc.cycles.adaptive_threshold = 0.02
        sc.cycles.denoising_quality = "HIGH"
        sc.frame_set(frame)
        path = os.path.join(os.path.abspath(a.out), f"{name}.png")
        r.filepath = path
        t = time.time()
        bpy.ops.render.render(write_still=True, scene=sc.name)
        print(f"STILL {name} frame {frame} {time.time() - t:.0f}s", flush=True)
        if labels and os.path.exists(a.tracks):
            # draw the film's labels at 2x on top (separate process: Pillow typography)
            subprocess.run([sys.executable, os.path.join(HERE, "label_still.py"), path, str(frame), a.tracks], check=True)


if __name__ == "__main__":
    main()
