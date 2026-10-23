#!/usr/bin/env python3
"""Check the rendered demo film: it decodes, and it is the length of the tour.

    python3 tools/check_film.py [output/tideline_demo.mp4]
"""
import sys
from pathlib import Path

import imageio_ffmpeg

path = Path(sys.argv[1] if len(sys.argv) > 1 else Path(__file__).parent.parent / "output" / "tideline_demo.mp4")
frames, secs = imageio_ffmpeg.count_frames_and_secs(str(path))
reader = imageio_ffmpeg.read_frames(str(path))
meta = next(reader)
reader.close()
print(f"{path.name}: {frames} frames, {secs:.1f} s, {meta['size'][0]} x {meta['size'][1]}")
assert meta["size"] == (1920, 1080), meta["size"]
assert 30 <= secs <= 60, secs
assert frames >= 30 * 30, frames
