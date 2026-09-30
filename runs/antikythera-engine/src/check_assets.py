#!/usr/bin/env python3
"""Check the rendered outputs in output/ before they are published.

    python3 src/check_assets.py

Every declared asset exists; the stills have their intended sizes and are not
blank; the films have the tour's length and frame size; the cut sheets are
well-formed SVG with one path per wheel of data/design.json.
"""

from __future__ import annotations

import json
import struct
import sys
import tomllib
import xml.etree.ElementTree as ET
import zlib
from pathlib import Path

import imageio_ffmpeg

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "output"


def png_size_and_spread(path: Path) -> tuple[int, int, int]:
    """Width, height and a crude measure of variety in the first rows (0 = flat)."""
    data = path.read_bytes()
    assert data[:8] == b"\x89PNG\r\n\x1a\n", f"{path.name}: not a PNG"
    w, h = struct.unpack(">II", data[16:24])
    idat, pos = b"", 8
    while pos < len(data):
        n, kind = struct.unpack(">I4s", data[pos:pos + 8])
        if kind == b"IDAT":
            idat += data[pos + 8:pos + 8 + n]
        pos += 12 + n
    raw = zlib.decompress(idat)
    sample = raw[len(raw) // 2: len(raw) // 2 + 200_000]
    return w, h, len(set(sample))


def main() -> int:
    m = tomllib.loads((ROOT / "run.toml").read_text())
    design = json.loads((ROOT / "data" / "design.json").read_text())
    errs = []
    for a in m["assets"]:
        if not (OUT / a["file"]).is_file():
            errs.append(f"missing output/{a['file']}")
    if errs:
        print("\n".join(errs))
        return 1

    for name, size in (("antikythera_engine_hero.png", (3200, 2000)),
                       ("antikythera_engine_movement.png", (2400, 1600)),
                       ("antikythera_engine_earth_moon.png", (2400, 1600))):
        w, h, spread = png_size_and_spread(OUT / name)
        if (w, h) != size:
            errs.append(f"{name}: {w}x{h}, expected {size[0]}x{size[1]}")
        if spread < 40:
            errs.append(f"{name}: looks blank ({spread} distinct byte values mid-image)")

    tour_seconds = 78.0
    for name, size in (("antikythera_engine_tour.mp4", (1280, 720)), ("antikythera_engine_tour_web.mp4", (960, 540))):
        reader = imageio_ffmpeg.read_frames(str(OUT / name))
        meta = next(reader)
        reader.close()
        frames, secs = imageio_ffmpeg.count_frames_and_secs(str(OUT / name))
        if tuple(meta["size"]) != size:
            errs.append(f"{name}: frame size {meta['size']}, expected {size}")
        if abs(secs - tour_seconds) > 1.0:
            errs.append(f"{name}: {secs:.2f} s, expected about {tour_seconds} s")

    wheels = sum(2 * len(t["meshes"]) for t in design["trains"]) + design["moon"]["idlers"] + 2
    root = ET.parse(OUT / "antikythera_engine_wheels.svg").getroot()
    paths = root.findall(".//{http://www.w3.org/2000/svg}path")
    if len(paths) != wheels or root.get("data-wheels") != str(wheels):
        errs.append(f"wheels.svg: {len(paths)} paths, data-wheels={root.get('data-wheels')}, expected {wheels}")

    if errs:
        print("Asset check failed:\n  " + "\n  ".join(errs))
        return 1
    print(f"Asset check passed: {len(m['assets'])} files, {wheels} wheels on the cut sheets")
    return 0


if __name__ == "__main__":
    sys.exit(main())
