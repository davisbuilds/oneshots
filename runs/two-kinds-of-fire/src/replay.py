"""Replay the recorded stroke log onto a blank canvas.

    python3 src/replay.py output/stroke_log.jsonl.gz --width 3000 --out replay.png
    python3 src/replay.py output/stroke_log.jsonl.gz --upto 1200 --width 1500 --out partial.png

The log is the complete list of draw operations (one JSON object per stroke:
stage, path, width, colour, brush parameters and per-stroke seed).  Replaying
it at the logged size reproduces the final painting exactly; `--upto N` stops
after N strokes to show the canvas as it stood at that moment.
"""

from __future__ import annotations

import argparse
import gzip
import json
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from brush import to_image  # noqa: E402
from paint import render  # noqa: E402


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("log")
    ap.add_argument("--width", type=int, default=None)
    ap.add_argument("--upto", type=int, default=None)
    ap.add_argument("--out", default="replay.png")
    ap.add_argument("--check", default=None, help="PNG to compare against; exit 1 unless identical")
    a = ap.parse_args()
    with gzip.open(a.log, "rt") as f:
        head = json.loads(f.readline())
        ops = [json.loads(line) for line in f]
    if a.upto:
        ops = ops[:a.upto]
    W = a.width or head["width"]
    H = int(round(W * head["height"] / head["width"]))
    cv = render(ops, W, H, head["seed"])
    to_image(cv.lit()).save(a.out)
    print(f"replayed {len(ops)} strokes at {W}x{H} -> {a.out}")
    if a.check:
        from PIL import Image
        ref = np.asarray(Image.open(a.check).convert("RGB")).astype(np.int16)
        got = np.asarray(Image.open(a.out).convert("RGB")).astype(np.int16)
        diff = int(np.abs(ref - got).max()) if ref.shape == got.shape else -1
        print(f"max pixel difference vs {a.check}: {diff}")
        sys.exit(0 if diff == 0 else 1)


if __name__ == "__main__":
    main()
