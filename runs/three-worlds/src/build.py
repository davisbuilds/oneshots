"""Build every declared output into output/, in dependency order (resumable).

    python3 src/build.py

Needs the Python requirements plus ffmpeg and the EB Garamond font
(`apt-get install ffmpeg fonts-ebgaramond`).  About four hours on 4 CPU cores,
most of it the 150 Cycles frames of the Matter act.  Every step skips work
whose output already exists, so an interrupted build picks up where it stopped.
"""
import hashlib, pathlib, subprocess, sys, tomllib

ROOT = pathlib.Path(__file__).resolve().parents[1]
OUT = ROOT / "output"
PY = sys.executable


def step(label, args, done=None):
    if done is not None and done.exists():
        print(f"[skip] {label}: {done.relative_to(ROOT)} exists", flush=True)
        return
    print(f"[run ] {label}", flush=True)
    subprocess.run([PY, *args], cwd=ROOT, check=True)


def main():
    OUT.mkdir(exist_ok=True)
    step("canonical trajectory", ["src/lorenz.py", "--select", "8", "27"])
    step("Matter act frames (Cycles)", ["src/render_copper_frames.py"])
    step("copper still + .blend", ["src/stills.py", "copper", "--samples", "128"], OUT / "matter_copper.png")
    step("ink still", ["src/stills.py", "ink"], OUT / "trace_ink.png")
    step("light still", ["src/stills.py", "light"], OUT / "energy_light.png")
    step("film frames + encodes", ["src/film.py", "--encode"], OUT / "one_equation_three_worlds_web.mp4")
    step("triptych", ["src/stills.py", "triptych"], OUT / "triptych.jpg")
    assets = [a["file"] for a in tomllib.loads((ROOT / "run.toml").read_text())["assets"]]
    lines = []
    for name in assets:
        h = hashlib.sha256((OUT / name).read_bytes()).hexdigest()
        lines.append(f"{h}  {name}")
    (OUT / "SHA256SUMS").write_text("\n".join(lines) + "\n")
    print("\n".join(lines))


if __name__ == "__main__":
    main()
