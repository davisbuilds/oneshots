"""Check a finished build (exits non-zero on any failure).

    python3 src/verify.py

* the rebuilt canonical dataset equals the committed one, array for array
  (the integration is deterministic, so this is a reproducibility check);
* every declared asset exists; stills are 2400 x 3000; both films are
  1920 x 1080, 24 fps, 720 frames.
"""
import io, json, pathlib, subprocess, sys, tomllib
import numpy as np
from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parents[1]
OUT = ROOT / "output"
problems = []

rel = "data/lorenz_canonical.npz"
try:
    committed = subprocess.check_output(["git", "show", f"HEAD:./{rel}"], cwd=ROOT)
    a, b = np.load(io.BytesIO(committed)), np.load(ROOT / rel)
    for k in a.files:
        if not np.array_equal(a[k], b[k]):
            problems.append(f"{rel}: array `{k}` differs from the committed dataset")
except subprocess.CalledProcessError:
    problems.append(f"{rel}: not found in HEAD, cannot compare")

assets = [x["file"] for x in tomllib.loads((ROOT / "run.toml").read_text())["assets"]]
for name in assets:
    p = OUT / name
    if not p.exists() or p.stat().st_size == 0:
        problems.append(f"output/{name}: missing or empty")
        continue
    if name.endswith(".png"):
        if Image.open(p).size != (2400, 3000):
            problems.append(f"output/{name}: expected 2400 x 3000, got {Image.open(p).size}")
    if name.endswith(".mp4"):
        info = json.loads(subprocess.check_output(
            ["ffprobe", "-v", "error", "-select_streams", "v:0", "-count_frames", "-show_entries",
             "stream=width,height,r_frame_rate,nb_read_frames", "-of", "json", str(p)]))["streams"][0]
        got = (info["width"], info["height"], info["r_frame_rate"], int(info["nb_read_frames"]))
        if got != (1920, 1080, "24/1", 720):
            problems.append(f"output/{name}: expected 1920x1080, 24 fps, 720 frames; got {got}")

if problems:
    print("verify failed:\n  - " + "\n  - ".join(problems))
    sys.exit(1)
print(f"verify passed: dataset reproduced; {len(assets)} assets checked")
