"""Build every output of the run into output/, in order, resumably.

    python3 src/build_all.py [--threads N] [--skip-animatic]

Run from the run directory with the Python that has `bpy` (Blender 5.0 as a
module; see requirements.txt), with ffmpeg on PATH. Each step is skipped when
all of its outputs already exist and are non-empty, so an interrupted build can
simply be started again. The two Cycles renders are the long steps (about 13 h
of wall-clock time on 4 CPU cores in the original run).

Steps:
  1. build.py          -> output/artemis_ii.blend
  2. render.py studio  -> output/frames_studio/f_0001..1345.png
  3. render.py pad     -> output/frames_pad/f_1321..2137.png
  4. export_tracks.py  -> output/label_tracks.json      (2-D label anchors)
  5. sound.py          -> output/artemis_ii_soundtrack.wav
  6. assemble.py       -> output/artemis_ii_built_for_the_journey_1080p.mp4
  7. ffmpeg two-pass   -> output/artemis_ii_built_for_the_journey_web.mp4
  8. animatic.py x2 + assemble.py -> output/artemis_ii_animatic_540p.mp4
  9. stills.py         -> output/01_engine_detail.png .. 04_launch.png (3840 x 2160)
 10. SHA256SUMS over the declared assets (run.toml [[assets]])
"""
import argparse
import hashlib
import os
import subprocess
import sys
import tomllib

RUN = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
OUT = os.path.join(RUN, "output")
PY = sys.executable
sys.path.insert(0, os.path.join(RUN, "src"))
from lib import timeline as TL  # noqa: E402

BLEND = os.path.join(OUT, "artemis_ii.blend")
STUDIO_FRAMES = range(1, TL.fr(TL.DISSOLVE[1]) + 1)                    # 1..1345
PAD_FRAMES = range(TL.fr(TL.DISSOLVE[0]), TL.fr(TL.FILM_END) + 1)        # 1321..2137
FILM = "artemis_ii_built_for_the_journey_1080p.mp4"
WEB = "artemis_ii_built_for_the_journey_web.mp4"
ANIMATIC = "artemis_ii_animatic_540p.mp4"
SOUND = "artemis_ii_soundtrack.wav"
STILLS = ["01_engine_detail.png", "02_exploded_assembly.png", "03_complete_vehicle.png", "04_launch.png"]


def o(*p):
    return os.path.join(OUT, *p)


def ready(paths):
    """A step is done only when every one of its outputs exists and is non-empty."""
    return all(os.path.isfile(p) and os.path.getsize(p) > 0 for p in paths)


def frames(d, rng):
    return [o(d, f"f_{f:04d}.png") for f in rng]


def run(cmd, **kw):
    print("+", " ".join(os.path.relpath(c, RUN) if os.path.isabs(c) else c for c in cmd), flush=True)
    subprocess.run(cmd, check=True, cwd=RUN, **kw)


def clear_placeholders(d):
    """render.py writes a zero-byte placeholder before each frame; after an
    interruption the one in flight stays empty and must go before resuming."""
    if os.path.isdir(d):
        for n in os.listdir(d):
            p = os.path.join(d, n)
            if n.endswith(".png") and os.path.getsize(p) == 0:
                os.remove(p)


def step(name, outputs, fn):
    if ready(outputs):
        print(f"[skip] {name}", flush=True)
        return
    print(f"[run ] {name}", flush=True)
    fn()
    if not ready(outputs):
        sys.exit(f"step {name!r} did not produce all of its outputs")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--threads", type=int, default=0, help="Cycles threads (0 = all cores)")
    ap.add_argument("--skip-animatic", action="store_true", help="the animatic is a review artifact; skip it")
    a = ap.parse_args()
    os.makedirs(OUT, exist_ok=True)
    src = lambda n: os.path.join(RUN, "src", n)  # noqa: E731
    thr = ["--threads", str(a.threads)] if a.threads else []

    step("scene", [BLEND], lambda: run([PY, src("build.py"), "--", "--out", BLEND]))

    def render(scene, d):
        clear_placeholders(o(d))
        run([PY, src("render.py"), "--", "--blend", BLEND, "--scene", scene, "--out", o(d)] + thr)
    step("studio frames", frames("frames_studio", STUDIO_FRAMES), lambda: render("SC_Studio", "frames_studio"))
    step("pad frames", frames("frames_pad", PAD_FRAMES), lambda: render("SC_Pad", "frames_pad"))

    step("label tracks", [o("label_tracks.json")],
         lambda: run([PY, src("export_tracks.py"), "--", "--blend", BLEND, "--out", o("label_tracks.json")]))
    step("soundtrack", [o(SOUND)], lambda: run([PY, src("sound.py"), "--out", o(SOUND)]))
    step("film", [o(FILM)], lambda: run([PY, src("assemble.py"), "--studio", o("frames_studio"), "--pad", o("frames_pad"),
                                          "--tracks", o("label_tracks.json"), "--audio", o(SOUND), "--out", o(FILM), "--crf", "18"]))

    def web():
        log = o("logs", "ffmpeg2pass")
        os.makedirs(o("logs"), exist_ok=True)
        base = ["ffmpeg", "-y", "-loglevel", "error", "-i", o(FILM), "-c:v", "libx264", "-preset", "slow", "-b:v", "2350k",
                "-passlogfile", log]
        run(base + ["-pass", "1", "-an", "-f", "null", os.devnull])
        run(base + ["-pass", "2", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", o(WEB)])
    step("web copy", [o(WEB)], web)

    if not a.skip_animatic:
        def animatic():
            run([PY, src("animatic.py"), "--", "--blend", BLEND, "--scene", "SC_Studio", "--out", o("animatic", "studio"), "--step", "2"])
            run([PY, src("animatic.py"), "--", "--blend", BLEND, "--scene", "SC_Pad", "--out", o("animatic", "pad"), "--step", "4"])
            run([PY, src("assemble.py"), "--studio", o("animatic", "studio"), "--pad", o("animatic", "pad"), "--allow-nearest",
                 "--tracks", o("label_tracks.json"), "--audio", o(SOUND), "--scale", "0.5", "--crf", "23", "--out", o(ANIMATIC)])
        step("animatic", [o(ANIMATIC)], animatic)

    step("stills", [o(n) for n in STILLS],
         lambda: run([PY, src("stills.py"), "--", "--blend", BLEND, "--out", OUT, "--tracks", o("label_tracks.json")]))

    manifest = tomllib.load(open(os.path.join(RUN, "run.toml"), "rb"))
    files = [x["file"] for x in manifest.get("assets", [])]
    missing = [f for f in files if not ready([o(f)])]
    if missing:
        sys.exit(f"declared assets missing from output/: {missing}")
    with open(o("SHA256SUMS"), "w") as fh:
        for f in files:
            h = hashlib.sha256()
            with open(o(f), "rb") as src_f:
                for chunk in iter(lambda: src_f.read(1 << 20), b""):
                    h.update(chunk)
            fh.write(f"{h.hexdigest()}  {f}\n")
    print(f"BUILD_ALL_OK {len(files)} assets, SHA256SUMS written", flush=True)


if __name__ == "__main__":
    main()
