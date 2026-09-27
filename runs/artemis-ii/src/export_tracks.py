"""Project label anchors (LBL_* empties) to screen space for every frame of
the labeled shot and save JSON for src/assemble.py.

python src/export_tracks.py -- --blend output/artemis_ii.blend --out output/label_tracks.json
"""
import argparse
import json
import os
import sys

import bpy
from bpy_extras.object_utils import world_to_camera_view

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import timeline as TL  # noqa: E402


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[1:]
    ap = argparse.ArgumentParser()
    ap.add_argument("--blend", required=True)
    ap.add_argument("--out", required=True)
    a = ap.parse_args(argv)
    bpy.ops.wm.open_mainfile(filepath=os.path.abspath(a.blend))
    sc = bpy.data.scenes["SC_Studio"]
    labels = [o for o in sc.objects if o.name.startswith("LBL_")]
    data = {"labels": {}, "frames": {}}
    for o in labels:
        data["labels"][o.name] = {"title": o["label"], "sub": o["sub"], "side": o["side"], "shot": o["shot"]}
    shots = {s[0]: s for s in TL.SHOTS}
    for sid in sorted({o["shot"] for o in labels}):
        _, _, _, t0, t1 = shots[sid]
        for f in range(TL.fr(t0), TL.fr(t1) + 1):
            sc.frame_set(f)
            cam = sc.camera
            row = {}
            for o in labels:
                if o["shot"] != sid:
                    continue
                co = world_to_camera_view(sc, cam, o.matrix_world.translation)
                row[o.name] = [co.x, 1.0 - co.y, co.z]
            data["frames"][str(f)] = row
    os.makedirs(os.path.dirname(os.path.abspath(a.out)), exist_ok=True)
    with open(a.out, "w") as fh:
        json.dump(data, fh)
    print("TRACKS_OK", len(data["frames"]), "frames")


if __name__ == "__main__":
    main()
