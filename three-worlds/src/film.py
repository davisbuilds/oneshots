"""Compose the film from the three worlds (resumable; frames/film/*.png).

    python3 src/film.py            # render all missing frames
    python3 src/film.py --encode   # + encode out/one_equation_three_worlds.mp4
"""
import sys, argparse, pathlib, subprocess
import numpy as np
from PIL import Image, ImageDraw, ImageFont
from scipy import ndimage as ndi

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import common as C
import timeline as T
import ink as INK
import light as LIGHT

W, H, FPS = T.W, T.H, T.FPS
FR = C.ROOT / "frames"
FONT_DIR = pathlib.Path("/usr/share/fonts/opentype/ebgaramond")


def font(size, italic=False):
    name = "EBGaramond12-Italic.otf" if italic else "EBGaramond12-Regular.otf"
    try:
        return ImageFont.truetype(str(FONT_DIR / name), size)
    except OSError:
        return ImageFont.truetype("DejaVuSerif.ttf", size)


def ramp(sec, a, b):
    return float(T.smooth((sec - a) / (b - a)))


def window(sec, a, b, fade=0.5):
    return ramp(sec, a, a + fade) * (1 - ramp(sec, b - fade, b))


def text_layer(lines, color, alpha):
    """lines: list of (text, size, italic, y, tracking)."""
    im = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    for text, size, italic, y, track, x in lines:
        f = font(size, italic)
        widths = [d.textlength(ch, font=f) for ch in text]
        total = sum(widths) + track * (len(text) - 1)
        cx = (W - total) / 2 if x is None else x
        for ch, w in zip(text, widths):
            d.text((cx, y), ch, font=f, fill=tuple(int(c * 255) for c in color) + (255,))
            cx += w + track
    a = np.asarray(im, np.float32) / 255.0
    return a[..., :3], a[..., 3:] * alpha


def over(base, layer):
    rgb, a = layer
    return base * (1 - a) + rgb * a


def load_rgb(p):
    return np.asarray(Image.open(p).convert("RGB"), np.float32) / 255.0


class Film:
    def __init__(self):
        self.f0 = int(round(T.ORBIT[0] * FPS))
        self.f1 = int(round(T.ORBIT[1] * FPS))
        self.K = T.canonical_camera()
        self.ip = INK.InkPainting(self.K)
        self.sched = INK.paint_schedule(self.ip, *T.PAINT)
        self.LR = LIGHT.LightRenderer()
        # ghost of the filament at K (exactly the projection the copper render used)
        m = np.zeros((H, W), np.float32)
        P = self.ip.P
        ix = np.clip(P[:, 0].astype(int), 0, W - 1); iy = np.clip(P[:, 1].astype(int), 0, H - 1)
        np.add.at(m, (iy, ix), 1.0)
        self.line = np.clip(ndi.gaussian_filter(m, 1.1) * 3.0, 0, 1)
        self.line_wide = np.clip(ndi.gaussian_filter(m, 1.8) * 4.0, 0, 1)
        # wash-front field for the paper reveal: spreads from the curve outward, noisy edge
        rng = np.random.default_rng(4)
        dist = ndi.distance_transform_edt(self.line < 0.05) / H
        self.front = dist + 0.035 * INK.fnoise((H, W), 60, rng) + 0.006 * INK.fnoise((H, W), 4, rng)
        self.seal_img = None
        self._ink_final = None
        self._light_final = None

    # -- worlds ---------------------------------------------------------------
    def copper(self, f):
        f = min(max(f, self.f0), self.f1)
        return load_rgb(FR / "copper" / f"copper_{f:04d}.png")

    def ink(self, sec, develop=True):
        tau = float(np.interp(sec, *self.sched))
        if sec >= T.PAINT[0]:
            self.ip.paint_until(tau)
        if not develop:
            return None
        rgb = self.ip.image()
        a_seal = ramp(sec, 16.45, 16.60)
        if a_seal > 0:
            sealed = INK.draw_seal(rgb.copy(), W * 0.5 + 0.30 * H, H * 0.84, 60, np.random.default_rng(21))
            rgb = rgb * (1 - a_seal) + sealed * a_seal
        return rgb

    def light(self, sec, cam=None):
        cam = cam or T.energy_camera(sec)
        head = 1 - ramp(sec, T.TRAVEL[1], T.TRAVEL[1] + 0.6)
        head *= ramp(sec, 18.0, 18.7)
        lx = 0.6 * ramp(sec, T.TRAVEL[1] - 0.1, T.TRAVEL[1] + 0.9)
        return self.LR.frame(sec, cam, head_fade=head, long_exposure=lx, trail_gain=ramp(sec, 17.9, 18.7))

    # -- finale ---------------------------------------------------------------
    def panels(self):
        if self._light_final is None:
            self._ink_final = INK.draw_seal(self.ip.image(), W * 0.5 + 0.30 * H, H * 0.84, 60,
                                            np.random.default_rng(21))
            self._light_final = self.LR.frame(T.TRAVEL[1] + 1.0, self.K, head_fade=0.0, long_exposure=0.0, gradient=0.9)
            self._copper_final = self.copper(self.f1)
        return self._copper_final, self._ink_final, self._light_final

    def triptych(self, sec, bg):
        cw = 760                                   # crop width from each 16:9 world
        ph = 720; pw = int(round(cw * ph / H))
        gap = 34
        x0 = (W - (3 * pw + 2 * gap)) // 2
        y0 = 96
        out = bg.copy()
        for i, img in enumerate(self.panels()):
            a = ramp(sec, 26.0 + 0.3 * i, 26.7 + 0.3 * i)
            if a <= 0:
                continue
            crop = img[:, (W - cw) // 2:(W + cw) // 2]
            tile = np.asarray(Image.fromarray((crop * 255).astype(np.uint8)).resize((pw, ph), Image.LANCZOS),
                              np.float32) / 255
            x = x0 + i * (pw + gap)
            out[y0:y0 + ph, x:x + pw] = out[y0:y0 + ph, x:x + pw] * (1 - a) + tile * a
        a = window(sec, 27.0, 30.0, 0.7)
        if a > 0:
            y = y0 + ph + 30
            out = over(out, text_layer([
                ("ONE EQUATION, THREE WORLDS", 34, False, y, 7, None),
                ("Matter  ·  Trace  ·  Energy", 25, True, y + 52, 1.5, None),
                ("σ = 10,  ρ = 28,  β = 8/3   ·   from (1, 1, 1)   ·   t = 8 → 27", 21, True, y + 90, 1, None),
            ], (0.86, 0.82, 0.76), a))
        return out

    # -- frame ----------------------------------------------------------------
    def frame(self, f, write=True):
        sec = f / FPS
        black = np.zeros((H, W, 3), np.float32)
        out = black.copy()
        # I. title
        if sec < T.T_TITLE[1]:
            a = window(sec, 0.25, 2.5, 0.6)
            out = over(out, text_layer([
                ("ONE EQUATION, THREE WORLDS", 46, False, 470, 9, None),
                ("dx/dt = σ(y − x)      dy/dt = x(ρ − z) − y      dz/dt = xy − βz", 27, True, 548, 1.5, None),
            ], (0.88, 0.84, 0.78), a))
        # II. matter
        if T.T_MATTER[0] <= sec < 10.7:
            cu = self.copper(f) * ramp(sec, 2.2, 3.1)
            if sec < 8.9:
                out = np.maximum(out, cu) if sec < 2.6 else cu
            else:
                # matched dissolve: paper spreads outward from the filament like a wash,
                # the copper line lingers and leaves a pale ghost to paint over
                paper = self.ip.paper * (1 - 0.20 * self.line)[..., None]
                r = 1.2 * float(T.smooth((sec - 8.9) / 1.4)) - 0.03
                x = r - self.front
                a_bg = np.clip(x / 0.035, 0, 1)
                paper = paper * (1 - 0.05 * np.exp(-(x / 0.012) ** 2) * (x > 0))[..., None]   # wet front
                a_line = ramp(sec, 9.6, 10.6)
                a = a_bg * (1 - self.line_wide) + np.minimum(a_bg, a_line) * self.line_wide
                out = cu * (1 - a[..., None]) + paper * a[..., None]
            lab = window(sec, 3.4, 8.0, 0.6)
            if lab > 0:
                out = over(out, text_layer([("I   ·   MATTER", 24, False, 990, 5, 110)], (0.85, 0.80, 0.72), 0.8 * lab))
        # III. trace
        if 10.7 <= sec < 18.2:
            rgb = self.ink(sec)
            ghost = (1 - ramp(sec, 11.0, 15.5)) * 0.20 * self.line
            rgb = rgb * (1 - ghost)[..., None]
            lab = window(sec, 11.0, 15.9, 0.6)
            if lab > 0:
                rgb = over(rgb, text_layer([("II   ·   TRACE", 24, False, 990, 5, 110)], (0.16, 0.14, 0.13), 0.75 * lab))
            if sec >= 17.0:
                # the room light goes down; the strokes answer with a faint glow
                dim = 1 - ramp(sec, 17.0, 18.0)
                dens = np.clip(self.ip.develop(), 0, 1.5)
                glow = ndi.gaussian_filter(dens, 1.2)[..., None] * LIGHT.TEAL[None, None] * 0.55
                g = window(sec, 17.3, 18.9, 0.5)
                rgb = rgb * dim + glow * g
            out = rgb
        elif sec < 10.7:
            self.ink(sec, develop=False)
        # IV. energy
        if sec >= 18.0 and sec < 26.9:
            li = self.light(sec)
            a = ramp(sec, 18.0, 18.5)
            if sec < 18.9:
                dens = np.clip(self.ip.develop(), 0, 1.5)
                glow = ndi.gaussian_filter(dens, 1.2)[..., None] * LIGHT.TEAL[None, None] * 0.55
                g = window(sec, 17.3, 18.9, 0.5)
                out = np.maximum(li * a, glow * g) if sec >= 18.2 else out * (1 - a) + (li + glow * g) * a
            else:
                out = li
            lab = window(sec, 19.4, 23.8, 0.6)
            if lab > 0:
                out = over(out, text_layer([("III   ·   ENERGY", 24, False, 990, 5, 110)], (0.80, 0.78, 0.72), 0.7 * lab))
        # V. triptych
        if sec >= 25.8:
            bg = np.full((H, W, 3), 0.028, np.float32)
            tri = self.triptych(sec, bg)
            a = ramp(sec, 25.9, 26.8)
            if sec < 26.9:
                out = out * (1 - a) + tri * a
            else:
                out = tri
            out = out * (1 - ramp(sec, 29.2, 29.96))
        # grain (fine, temporal) - unifies the media and prevents banding
        rng = np.random.default_rng(f)
        out = out + rng.normal(0, 0.006, (H, W, 1)).astype(np.float32)
        img = Image.fromarray((np.clip(out, 0, 1) * 255 + 0.5).astype(np.uint8))
        if write:
            img.save(FR / "film" / f"f_{f:04d}.png")
        return img


def encode(out_path):
    cmd = ["ffmpeg", "-y", "-framerate", str(FPS), "-i", str(FR / "film" / "f_%04d.png"),
           "-c:v", "libx264", "-preset", "slow", "-crf", "15", "-pix_fmt", "yuv420p",
           "-tune", "film", "-movflags", "+faststart", str(out_path)]
    subprocess.run(cmd, check=True)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--frames", nargs="*", type=int)
    ap.add_argument("--encode", action="store_true")
    ap.add_argument("--force", action="store_true")
    a = ap.parse_args()
    (FR / "film").mkdir(parents=True, exist_ok=True)
    F = Film()
    todo = sorted(a.frames) if a.frames else list(range(T.N_FRAMES))
    import time
    for f in range(0, max(todo) + 1):
        sec = f / FPS
        p = FR / "film" / f"f_{f:04d}.png"
        if f not in todo or (p.exists() and not a.force):
            if 10.7 <= sec:
                F.ink(sec, develop=False)          # keep the brush state in step
            elif sec < 10.7:
                F.ink(sec, develop=False)
            continue
        t0 = time.time()
        F.frame(f)
        print(f"film frame {f} ({sec:.2f}s) {time.time() - t0:.1f}s", flush=True)
    if a.encode:
        encode(C.OUT / "one_equation_three_worlds.mp4")
