#!/usr/bin/env python3
"""Render the full-size outputs from the page itself, in headless Chromium.

    python3 -m playwright install --with-deps chromium   # once (or set CHROMIUM_PATH)
    python3 src/render_assets.py                          # writes output/
    python3 src/render_assets.py --film-seconds 3         # a quick trial

Outputs (declared as release assets in run.toml):

  antikythera_engine_tour.mp4       the guided tour, 1280 x 720, 24 fps, H.264 CRF 18
  antikythera_engine_tour_web.mp4   the same, 960 x 540, CRF 25
  antikythera_engine_hero.png       3200 x 2000, the machine on 30 September 2026
  antikythera_engine_movement.png   2400 x 1600, the movement
  antikythera_engine_earth_moon.png 2400 x 1600, the Earth arm and the Moon's train
  antikythera_engine_wheels.svg     every wheel at 1:1, as the page's Cut sheets button makes it

The page runs in capture mode: there is no animation loop, and each call
advances the tour by exactly one frame, so the film does not depend on how fast
the machine renders (software GL manages about one frame a second). FFmpeg
comes from the imageio-ffmpeg wheel, which bundles a build with libx264.
"""

from __future__ import annotations

import argparse
import os
import shutil
import subprocess
import sys
import time
from pathlib import Path

import imageio_ffmpeg
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "output"
PAGE = (ROOT / "index.html").resolve().as_uri()
JD = "2461313.5"          # 30 September 2026 00:00 TT: fixed, so the outputs are reproducible
ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]

STILLS = [
    ("antikythera_engine_hero.png", (3200, 2000), "clean&cam=-0.5,0.30,1050,30,170,0"),
    ("antikythera_engine_movement.png", (2400, 1600), "clean&cam=-0.95,0.14,470,80,110,0"),
    ("antikythera_engine_earth_moon.png", (2400, 1600), "clean&view=earth&focus=moon"),
]


def launch(p):
    kw = {"args": ARGS}
    if os.environ.get("CHROMIUM_PATH"):
        kw["executable_path"] = os.environ["CHROMIUM_PATH"]
    return p.chromium.launch(**kw)


def watch_errors(page, errors: list[str]):
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)


def stills(browser):
    for name, (w, h, ), query in STILLS:
        page = browser.new_page(viewport={"width": w, "height": h})
        errors: list[str] = []
        watch_errors(page, errors)
        page.goto(f"{PAGE}?capture&paused&jd={JD}&{query}")
        page.wait_for_function("window.__engine && window.__engine.frames() >= 1")
        page.evaluate("window.__engine.step(0)")
        page.screenshot(path=str(OUT / name))
        if errors:
            raise SystemExit(f"{name}: page errors: {errors}")
        page.close()
        print(f"wrote {name}", flush=True)


def cut_sheets(browser):
    page = browser.new_page(viewport={"width": 800, "height": 600})
    page.goto(f"{PAGE}?capture&paused&jd={JD}")
    page.wait_for_function("window.__engine")
    (OUT / "antikythera_engine_wheels.svg").write_text(page.evaluate("window.__engine.cutSheets()"))
    page.close()
    print("wrote antikythera_engine_wheels.svg", flush=True)


def film(browser, fps: int, limit: float | None):
    frames = OUT / "frames"
    shutil.rmtree(frames, ignore_errors=True)
    frames.mkdir(parents=True)
    page = browser.new_page(viewport={"width": 1280, "height": 720})
    errors: list[str] = []
    watch_errors(page, errors)
    page.goto(f"{PAGE}?capture&tour&clean&jd={JD}")
    page.wait_for_function("window.__engine")
    n, t0 = 0, time.time()
    while True:
        on = page.evaluate("dt => { window.__engine.step(dt); return window.__engine.tour().on; }", 1 / fps if n else 0)
        page.screenshot(path=str(frames / f"{n:05d}.png"))
        n += 1
        if n % (fps * 10) == 0:
            print(f"  film {n / fps:.0f} s ({time.time() - t0:.0f} s elapsed)", flush=True)
        if not on or (limit is not None and n >= limit * fps):
            break
    page.close()
    if errors:
        raise SystemExit(f"film: page errors: {errors}")
    ff = imageio_ffmpeg.get_ffmpeg_exe()
    src = ["-framerate", str(fps), "-i", str(frames / "%05d.png")]
    enc = ["-c:v", "libx264", "-preset", "slow", "-pix_fmt", "yuv420p", "-movflags", "+faststart"]
    subprocess.run([ff, "-y", "-loglevel", "error", *src, *enc, "-crf", "18",
                    str(OUT / "antikythera_engine_tour.mp4")], check=True)
    subprocess.run([ff, "-y", "-loglevel", "error", *src, "-vf", "scale=960:540", *enc, "-crf", "25",
                    str(OUT / "antikythera_engine_tour_web.mp4")], check=True)
    shutil.rmtree(frames)
    print(f"wrote antikythera_engine_tour.mp4 and _web.mp4 ({n} frames)", flush=True)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--fps", type=int, default=24)
    ap.add_argument("--film-seconds", type=float, default=None, help="stop the film early (for trials)")
    ap.add_argument("--no-film", action="store_true")
    a = ap.parse_args()
    OUT.mkdir(exist_ok=True)
    with sync_playwright() as p:
        browser = launch(p)
        cut_sheets(browser)
        stills(browser)
        if not a.no_film:
            film(browser, a.fps, a.film_seconds)
        browser.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
