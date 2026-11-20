#!/usr/bin/env python3
"""Check the recorded demo film: it exists, is H.264, 45 to 75 seconds long."""
import os, re, subprocess, sys
import imageio_ffmpeg

path = os.path.join(os.path.dirname(__file__), '..', 'output', 'threshold_demo.mp4')
if not os.path.exists(path):
    sys.exit('output/threshold_demo.mp4 is missing')
info = subprocess.run([imageio_ffmpeg.get_ffmpeg_exe(), '-i', path], capture_output=True, text=True).stderr
m = re.search(r'Duration: (\d+):(\d+):([\d.]+)', info)
seconds = int(m.group(1)) * 3600 + int(m.group(2)) * 60 + float(m.group(3)) if m else 0
ok = 'h264' in info and 45 <= seconds <= 75 and os.path.getsize(path) > 1_000_000
print(f'threshold_demo.mp4: {seconds:.1f} s, {os.path.getsize(path) / 1e6:.1f} MB, h264={"h264" in info}')
sys.exit(0 if ok else 1)
