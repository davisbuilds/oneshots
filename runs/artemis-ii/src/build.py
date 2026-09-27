"""Build the complete Artemis II project and save it as a .blend.

Usage (Blender binary):  blender -b -P src/build.py -- [--out path.blend] [--no-pad]
Usage (bpy module):      python src/build.py [--out path.blend] [--no-pad]
"""
import argparse
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import bpy  # noqa: E402

from lib import anim_studio, render_settings, studio, vehicle  # noqa: E402
from lib import timeline as TL  # noqa: E402


def parse():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[1:]
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=os.path.join(HERE, "..", "output", "artemis_ii.blend"))
    ap.add_argument("--no-pad", action="store_true")
    return ap.parse_args(argv)


def main():
    args = parse()
    t0 = time.time()
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.name = "SC_Studio"
    H, P = vehicle.build(sc.collection)
    studio.build(sc)
    anim_studio.choreograph(H)
    anim_studio.build_lights_and_cameras(sc, H)
    anim_studio.build_labels(sc, H)
    render_settings.apply(sc, kind="studio")
    sc.frame_start = 1
    sc.frame_end = TL.fr(TL.shot("S12")[4])
    if not args.no_pad:
        from lib import pad, anim_pad
        pad_sc = bpy.data.scenes.new("SC_Pad")
        pad_sc.collection.children.link(bpy.data.collections["SLS_Vehicle"])
        penv = pad.build(pad_sc)
        info = anim_pad.build(pad_sc, H, penv)
        anim_pad.cameras(pad_sc, H, info, hero_keys=anim_studio.camera_specs(H)["S12"][0])
        render_settings.apply(pad_sc, kind="pad")
        render_settings.compositor_haze(pad_sc)
        pad_sc.frame_start = TL.fr(TL.shot("S13")[3])
        pad_sc.frame_end = TL.fr(TL.FILM_END)
    bpy.context.window_manager  # noqa: B018 (keep context alive in bpy module)
    sc.frame_set(1)
    out = os.path.abspath(args.out)
    os.makedirs(os.path.dirname(out), exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=out, compress=True)
    print(f"BUILD_OK {out} in {time.time() - t0:.1f}s; objects={len(bpy.data.objects)}")


if __name__ == "__main__":
    main()
