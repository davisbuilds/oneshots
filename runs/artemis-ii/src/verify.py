"""Check a finished build in output/ (or a downloaded release) against the run's spec.

    python3 src/verify.py [--dir output] [--no-blend]

Checks every declared asset exists; SHA256SUMS, if present, matches; the film
and web copy are 1920 x 1080, 24 fps, 2,137 frames with stereo AAC; the
animatic is 960 x 540 with the same frame count; the four stills are
3840 x 2160; the soundtrack is 48 kHz stereo covering the film; and the
.blend opens with both scenes and the named assembly collections. Needs
ffprobe on PATH; the .blend check needs the `bpy` module. Exits non-zero on
any failure.
"""
import argparse
import hashlib
import json
import os
import subprocess
import sys
import tomllib
import wave

RUN = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
FRAMES = 2137
FPS = 24
COLLECTIONS = ["SLS_Vehicle", "CoreStage", "RS25_Engines", "SRB_North", "SRB_South", "UpperStack", "Orion"]
errors = []


def check(ok, msg):
    print(("ok   " if ok else "FAIL ") + msg, flush=True)
    if not ok:
        errors.append(msg)


def probe(path):
    out = subprocess.check_output(["ffprobe", "-v", "error", "-count_packets", "-show_entries",
                                   "stream=codec_type,codec_name,width,height,r_frame_rate,nb_read_packets,sample_rate,channels",
                                   "-show_entries", "format=duration", "-of", "json", path])
    return json.loads(out)


def check_video(path, w, h, audio=True):
    name = os.path.basename(path)
    j = probe(path)
    v = [s for s in j["streams"] if s["codec_type"] == "video"]
    a = [s for s in j["streams"] if s["codec_type"] == "audio"]
    check(len(v) == 1 and v[0]["codec_name"] == "h264", f"{name}: one H.264 video stream")
    if v:
        s = v[0]
        check((s["width"], s["height"]) == (w, h), f"{name}: {s['width']} x {s['height']} (want {w} x {h})")
        check(s["r_frame_rate"] == f"{FPS}/1", f"{name}: {s['r_frame_rate']} fps")
        check(int(s["nb_read_packets"]) == FRAMES, f"{name}: {s['nb_read_packets']} frames (want {FRAMES})")
    if audio:
        check(len(a) == 1 and a[0]["codec_name"] == "aac" and a[0]["channels"] == 2, f"{name}: stereo AAC audio")
    dur = float(j["format"]["duration"])
    check(abs(dur - FRAMES / FPS) < 0.1, f"{name}: {dur:.2f} s")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dir", default=os.path.join(RUN, "output"))
    ap.add_argument("--no-blend", action="store_true", help="skip the .blend structure check (needs bpy)")
    a = ap.parse_args()
    d = a.dir
    manifest = tomllib.load(open(os.path.join(RUN, "run.toml"), "rb"))
    files = [x["file"] for x in manifest["assets"]]
    for f in files:
        p = os.path.join(d, f)
        check(os.path.isfile(p) and os.path.getsize(p) > 0, f"{f}: present ({os.path.getsize(p) / 1e6:.1f} MB)" if os.path.isfile(p) else f"{f}: present")
    if errors:
        return 1

    sums = os.path.join(d, "SHA256SUMS")
    if os.path.isfile(sums):
        listed = {}
        for line in open(sums):
            digest, name = line.split(None, 1)
            listed[name.strip().lstrip("*")] = digest
        for f in files:
            h = hashlib.sha256()
            with open(os.path.join(d, f), "rb") as fh:
                for chunk in iter(lambda: fh.read(1 << 20), b""):
                    h.update(chunk)
            check(listed.get(f) == h.hexdigest(), f"{f}: SHA256 matches SHA256SUMS")
    else:
        print("note no SHA256SUMS in", d)

    check_video(os.path.join(d, "artemis_ii_built_for_the_journey_1080p.mp4"), 1920, 1080)
    web = os.path.join(d, "artemis_ii_built_for_the_journey_web.mp4")
    check_video(web, 1920, 1080)
    check(os.path.getsize(web) < 30 * 2**20, f"web copy under 30 MiB ({os.path.getsize(web) / 2**20:.1f} MiB)")
    check_video(os.path.join(d, "artemis_ii_animatic_540p.mp4"), 960, 540)

    from PIL import Image
    for f in ("01_engine_detail.png", "02_exploded_assembly.png", "03_complete_vehicle.png", "04_launch.png"):
        with Image.open(os.path.join(d, f)) as im:
            check(im.size == (3840, 2160), f"{f}: {im.size[0]} x {im.size[1]} {im.mode}")

    with wave.open(os.path.join(d, "artemis_ii_soundtrack.wav")) as w:
        dur = w.getnframes() / w.getframerate()
        check(w.getframerate() == 48000 and w.getnchannels() == 2, f"soundtrack: {w.getframerate()} Hz, {w.getnchannels()} ch")
        check(dur >= FRAMES / FPS - 0.05, f"soundtrack: {dur:.2f} s covers the film")

    if not a.no_blend:
        import bpy
        bpy.ops.wm.open_mainfile(filepath=os.path.abspath(os.path.join(d, "artemis_ii.blend")))
        scenes = {s.name: (s.frame_start, s.frame_end) for s in bpy.data.scenes}
        check(scenes.get("SC_Studio") == (1, 1345), f"blend: SC_Studio frames {scenes.get('SC_Studio')}")
        check(scenes.get("SC_Pad") == (1321, 2137), f"blend: SC_Pad frames {scenes.get('SC_Pad')}")
        missing = [c for c in COLLECTIONS if c not in bpy.data.collections]
        check(not missing, f"blend: assembly collections present {'(missing ' + ', '.join(missing) + ')' if missing else ''}")
        rs25 = [o for o in bpy.data.objects if o.name.startswith("RS25_E") and o.parent is not None]
        check(len({o.name.split('_')[1] for o in rs25}) >= 4, "blend: four individually modeled RS-25 engines")
        check("SLS_Root" in bpy.data.objects, "blend: SLS_Root parent empty")

    print("VERIFY_OK" if not errors else f"VERIFY_FAILED ({len(errors)})")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
