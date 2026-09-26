"""High-resolution finished stills (4:5 portrait) and the composed triptych.

All three use the canonical camera K (same position and aim), in portrait with
a slightly wider vertical field of view for breathing room.

    python3 src/stills.py ink
    python3 src/stills.py light
    python3 src/stills.py copper [--samples 128]    (Cycles; slow)
    python3 src/stills.py triptych
"""
import sys, json, argparse, pathlib, subprocess
import numpy as np
from PIL import Image, ImageDraw, ImageFont

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import common as C
import timeline as T

SW, SH = 2400, 3000
WIDEN = 1.10


def still_camera(W=SW, H=SH, widen=WIDEN):
    K = T.canonical_camera()
    sensor_v = K.sensor * K.H / K.W * widen          # vertical sensor extent of K, widened
    c = C.Camera(K.pos, K.target, K.lens, sensor_v, "VERTICAL", W, H, K.fstop, K.focus)
    return c


def ink_still(out):
    import ink as INK
    cam = still_camera()
    ip = INK.InkPainting(cam)
    ip.paint_until(1e9)
    rgb = ip.image()
    rgb = INK.draw_seal(rgb, cam.W * 0.79, cam.H * 0.855, 60 * cam.H / 1080, np.random.default_rng(21))
    Image.fromarray((np.clip(rgb, 0, 1) * 255 + 0.5).astype(np.uint8)).save(out)


def light_still(out, sec=22.6, lx=0.12, exposure=1.6):
    import light as L
    cam = still_camera()
    R = L.LightRenderer()
    im = R.frame(sec, cam, head_fade=1.0, long_exposure=lx, exposure=exposure)
    Image.fromarray((im * 255 + 0.5).astype(np.uint8)).save(out)


def copper_still(out, samples):
    cam = still_camera()
    p = C.DATA / "_still_camera.json"
    p.write_text(json.dumps(cam.to_dict()))
    subprocess.run([sys.executable, str(C.ROOT / "src/copper_scene.py"), "--camera-json-exact", str(p),
                    "--out", str(out), "--res", str(SW), str(SH), "--samples", str(samples),
                    "--save-blend", str(C.OUT / "copper_sculpture.blend")], check=True)


def triptych(paths, out, scale=1.0):
    ims = [Image.open(p).convert("RGB") for p in paths]
    w, h = ims[0].size
    w, h = int(w * scale), int(h * scale)
    ims = [im.resize((w, h), Image.LANCZOS) for im in ims]
    gap, margin, foot = int(0.035 * w), int(0.09 * w), int(0.20 * h)
    Wt = 3 * w + 2 * gap + 2 * margin
    Ht = h + margin + foot
    canvas = Image.new("RGB", (Wt, Ht), (14, 13, 12))
    for i, im in enumerate(ims):
        canvas.paste(im, (margin + i * (w + gap), margin))
    d = ImageDraw.Draw(canvas)
    fd = pathlib.Path("/usr/share/fonts/opentype/ebgaramond")
    f1 = ImageFont.truetype(str(fd / "EBGaramond12-Regular.otf"), int(0.030 * h))
    f2 = ImageFont.truetype(str(fd / "EBGaramond12-Italic.otf"), int(0.020 * h))

    def spaced(text, font, y, track, fill):
        widths = [d.textlength(ch, font=font) for ch in text]
        x = (Wt - sum(widths) - track * (len(text) - 1)) / 2
        for ch, wd in zip(text, widths):
            d.text((x, y), ch, font=font, fill=fill); x += wd + track

    y = margin + h + int(0.055 * h)
    spaced("ONE EQUATION, THREE WORLDS", f1, y, int(0.010 * h), (222, 212, 196))
    spaced("Matter  ·  Trace  ·  Energy", f2, y + int(0.055 * h), int(0.002 * h), (190, 180, 166))
    spaced("dx/dt = σ(y − x),  dy/dt = x(ρ − z) − y,  dz/dt = xy − βz   ·   σ = 10, ρ = 28, β = 8/3   ·   "
           "from (1, 1, 1), t = 8 → 27", f2, y + int(0.095 * h), int(0.001 * h), (150, 142, 132))
    canvas.save(out)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("what")
    ap.add_argument("--samples", type=int, default=128)
    ap.add_argument("--sec", type=float, default=22.6)
    ap.add_argument("--lx", type=float, default=0.12)
    ap.add_argument("--exposure", type=float, default=1.6)
    ap.add_argument("--out", default=None)
    a = ap.parse_args()
    O = C.OUT
    if a.what == "ink":
        ink_still(a.out or O / "trace_ink.png")
    elif a.what == "light":
        light_still(a.out or O / "energy_light.png", a.sec, a.lx, a.exposure)
    elif a.what == "copper":
        copper_still(a.out or O / "matter_copper.png", a.samples)
    elif a.what == "triptych":
        triptych([O / "matter_copper.png", O / "trace_ink.png", O / "energy_light.png"],
                 O / "triptych.png")
        triptych([O / "matter_copper.png", O / "trace_ink.png", O / "energy_light.png"],
                 O / "triptych_web.jpg", scale=0.45)
