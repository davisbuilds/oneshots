"""Draw the film's tracked labels onto a high-resolution still in place.

python src/label_still.py output/02_exploded_assembly.png 1064 output/label_tracks.json
"""
import json
import os
import sys

from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import assemble  # noqa: E402

path, frame, tracks = sys.argv[1], int(sys.argv[2]), sys.argv[3]
img = Image.open(path)
mode16 = img.mode.startswith("I")
rgb = Image.open(path).convert("RGB")
k = rgb.size[0] / 1920
assemble.set_scale(k)
ov = assemble.Overlay(json.load(open(tracks)))
out = ov.draw(rgb, frame)
out.save(path)
print("LABELS", path)
