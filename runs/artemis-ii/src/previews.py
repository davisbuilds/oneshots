"""Write the small committed previews in preview/ from a finished build in output/.

    python3 src/previews.py [--dir output]

hero + one downsized image per still, detail crops at the stills' native
3840 x 2160 resolution, and a 16-frame strip across the film (needs ffmpeg).
Everything is WebP and sized to stay within RUNS.md's caps.
"""
import argparse
import os
import subprocess
import tempfile

from PIL import Image

RUN = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
PREVIEW = os.path.join(RUN, "preview")

STILLS = {  # preview name: (still, width)
    "hero": ("03_complete_vehicle.png", 1600),
    "engine-detail": ("01_engine_detail.png", 1200),
    "exploded-assembly": ("02_exploded_assembly.png", 1200),
    "launch": ("04_launch.png", 1200),
}
DETAILS = {  # native-resolution crops: (still, box left, top, right, bottom)
    "detail-rs25-powerhead": ("01_engine_detail.png", (1700, 120, 2800, 880)),
    "detail-rs25-nozzle-tubes": ("01_engine_detail.png", (1450, 1380, 2450, 2100)),
    "detail-labels": ("02_exploded_assembly.png", (180, 200, 2060, 900)),
    "detail-orion-las": ("03_complete_vehicle.png", (1660, 60, 2180, 820)),
    "detail-intertank-boosters": ("03_complete_vehicle.png", (1640, 700, 2340, 1300)),
    "detail-liftoff-plume": ("04_launch.png", (1560, 1500, 2360, 2160)),
}
FILM = "artemis_ii_built_for_the_journey_1080p.mp4"


def save(im, name, q=80):
    p = os.path.join(PREVIEW, f"{name}.webp")
    im.save(p, "WEBP", quality=q, method=6)
    print(f"{os.path.relpath(p, RUN)}  {im.size[0]}x{im.size[1]}  {os.path.getsize(p) // 1024} KB")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dir", default=os.path.join(RUN, "output"))
    a = ap.parse_args()
    os.makedirs(PREVIEW, exist_ok=True)
    for name, (f, w) in STILLS.items():
        im = Image.open(os.path.join(a.dir, f)).convert("RGB")
        save(im.resize((w, round(im.size[1] * w / im.size[0])), Image.LANCZOS), name, 82)
    for name, (f, box) in DETAILS.items():
        save(Image.open(os.path.join(a.dir, f)).convert("RGB").crop(box), name, 85)
    # 16 frames spread across the film, 4 x 4
    with tempfile.TemporaryDirectory() as tmp:
        n, dur = 16, 2137 / 24
        tiles = []
        for i in range(n):
            t = 0.8 + (dur - 1.6) * i / (n - 1)
            p = os.path.join(tmp, f"{i:02d}.png")
            subprocess.run(["ffmpeg", "-v", "error", "-ss", f"{t:.2f}", "-i", os.path.join(a.dir, FILM),
                            "-frames:v", "1", "-vf", "scale=400:-2", p], check=True)
            tiles.append(Image.open(p).convert("RGB"))
        tw, th = tiles[0].size
        sheet = Image.new("RGB", (4 * tw + 3 * 4, 4 * th + 3 * 4), (12, 12, 14))
        for i, im in enumerate(tiles):
            sheet.paste(im, ((i % 4) * (tw + 4), (i // 4) * (th + 4)))
        save(sheet, "film-frames", 78)


if __name__ == "__main__":
    main()
