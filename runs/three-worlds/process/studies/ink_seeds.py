# Run from runs/three-worlds/. Writes into output/studies/ (git-ignored); the committed
# WebP copies of its results are in process/snapshots/ and process/studies/.
import os; os.makedirs("output/studies", exist_ok=True)
import sys; sys.path.insert(0, "src")
import numpy as np, ink, timeline as T
from PIL import Image
cam = T.canonical_camera(1920, 1080)
tiles = []
for sd in [11, 23, 37, 41]:
    ink.render_still(cam, f"output/studies/ink_seed{sd}.png", stroke_seed=sd)
    tiles.append(Image.open(f"output/studies/ink_seed{sd}.png").crop((560, 40, 1360, 780)).resize((400, 370)))
S = Image.new("RGB", (800, 740))
for i, t in enumerate(tiles): S.paste(t, ((i % 2) * 400, (i // 2) * 370))
S.save("output/studies/03_ink_seeds.png")
