"""Render "Two Kinds of Fire".

    python3 src/paint.py                  # final painting + stages + stroke log + video
    python3 src/paint.py --studies        # the four small composition studies
    python3 src/paint.py --no-video       # skip the making-of film

Everything is deterministic for a given --seed.
"""

from __future__ import annotations

import argparse
import gzip
import json
import os
import shutil
import subprocess
import sys
import time

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

from brush import Canvas, to_image, lum  # noqa: E402
import scene  # noqa: E402

ROOT = os.path.dirname(HERE)
SEED = 20260925
PASS = ("stage", "pts", "width", "color")


def apply_op(cv: Canvas, op: dict):
    W = cv.w
    pts = np.asarray(op["pts"], np.float32) * W
    width = max(1.0, op["width"] * W)
    kw = {k: v for k, v in op.items() if k not in PASS}
    cv.stage = op["stage"]
    cv.stroke(pts, width, op["color"], **kw)


def render(ops, width, height, seed, stage_cb=None, frame_cb=None, start_cb=None):
    cv = Canvas(width, height, seed=seed)
    if start_cb:
        start_cb(cv)
    last = None
    for i, op in enumerate(ops):
        if stage_cb and last is not None and op["stage"] != last:
            stage_cb(cv, last)
        apply_op(cv, op)
        last = op["stage"]
        if frame_cb:
            frame_cb(cv, i, op)
    if stage_cb and last is not None:
        stage_cb(cv, last)
    return cv


def studies(seed, keys=None):
    out = os.path.join(ROOT, "studies")
    os.makedirs(out, exist_ok=True)
    tiles = []
    for key, comp in scene.STUDIES.items():
        if keys and key not in keys:
            continue
        t = time.time()
        ops = scene.Painter(comp, seed=seed).paint()
        w = 900
        h = int(round(w / comp.aspect))
        cv = render(ops, w, h, seed)
        im = to_image(cv.lit())
        im.save(os.path.join(out, f"study_{key}.png"))
        tiles.append(im)
        print(f"study {key}: {len(ops)} strokes, {time.time() - t:.1f}s  -- {comp.notes}")
    # contact sheet
    tw, th = tiles[0].size
    rows = (len(tiles) + 1) // 2
    sheet = Image.new("RGB", (tw * 2 + 30, th * rows + 10 * (rows + 1)), (20, 20, 20))
    for i, im in enumerate(tiles):
        sheet.paste(im, (10 + (i % 2) * (tw + 10), 10 + (i // 2) * (th + 10)))
    sheet.save(os.path.join(out, "studies_sheet_" + "".join(keys or []) + ".png"))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--studies", nargs="?", const="ABCD")
    ap.add_argument("--comp", default="final")
    ap.add_argument("--width", type=int, default=3000)
    ap.add_argument("--seed", type=int, default=SEED)
    ap.add_argument("--out", default=os.path.join(ROOT, "output"))
    ap.add_argument("--tag", default="")
    ap.add_argument("--no-video", action="store_true")
    args = ap.parse_args()
    if args.studies:
        studies(args.seed, list(args.studies))
        return
    comp = scene.FINAL if args.comp == "final" else scene.STUDIES[args.comp]
    t0 = time.time()
    ops = scene.Painter(comp, seed=args.seed).paint()
    W = args.width
    H = int(round(W / comp.aspect))
    os.makedirs(args.out, exist_ok=True)
    stage_dir = os.path.join(args.out, "stages")
    os.makedirs(stage_dir, exist_ok=True)
    print(f"{len(ops)} strokes, canvas {W}x{H}")

    def stage_cb(cv, name):
        im = to_image(cv.lit())
        sw = 1500
        im.resize((sw, int(sw * H / W)), Image.LANCZOS).save(
            os.path.join(stage_dir, name.replace(" ", "_") + ".jpg"), quality=90)
        print(f"  stage {name:32s} strokes={cv.n_strokes:6d}  t={time.time() - t0:6.1f}s")

    recorder = None
    if not args.no_video:
        from film import Recorder
        recorder = Recorder(ops, W, H, os.path.join(args.out, "two_kinds_of_fire_making_of.mp4"))
    cv = render(ops, W, H, args.seed, stage_cb=stage_cb, frame_cb=recorder,
                start_cb=recorder.start if recorder else None)
    final = cv.lit()
    to_image(final).save(os.path.join(args.out, f"two_kinds_of_fire{args.tag}.png"), optimize=True)
    with gzip.open(os.path.join(args.out, "stroke_log.jsonl.gz"), "wt") as f:
        f.write(json.dumps({"seed": args.seed, "width": W, "height": H,
                            "composition": scene.asdict(comp)}) + "\n")
        for op in ops:
            f.write(json.dumps(op) + "\n")
    print(f"final written, mean luminance {float(lum(final).mean()):.3f}, {time.time() - t0:.1f}s")
    if recorder:
        dur = recorder.finish(final)
        print(f"video written: {recorder.frames} frames, {dur:.1f}s, total {time.time() - t0:.1f}s")


if __name__ == "__main__":
    main()
