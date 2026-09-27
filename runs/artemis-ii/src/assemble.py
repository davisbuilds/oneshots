"""Edit, typography and encode.

Composites the rendered studio/pad sequences into the 1920x1080 master:
match dissolve, upscale (Lanczos + light unsharp), title, 3D-tracked labels
with leader lines, captions, mission clock, end card, fades, dither; pipes
frames to ffmpeg (H.264) and muxes the sound track.

python src/assemble.py --studio output/frames_studio --pad output/frames_pad \
    --tracks output/label_tracks.json --audio output/artemis_ii_soundtrack.wav --out output/film.mp4
Missing frames fall back to --fallback dirs (animatic) or black.
"""
import argparse
import glob
import json
import math
import os
import re
import subprocess
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from lib import timeline as TL  # noqa: E402

FONTS = os.path.join(HERE, "..", "assets", "fonts")
W, H = 1920, 1080
K = 1.0          # typography scale (2.0 for 3840x2160 stills)


def font(name, size):
    return ImageFont.truetype(os.path.join(FONTS, name), int(round(size * K)))


def set_scale(k):
    """Rescale typography for high-resolution stills (layout stays in 1080p units)."""
    global K, F_TITLE, F_SUB, F_LABEL, F_LSUB, F_CAP, F_CAP2, F_CLOCK, F_EVENT, F_DISC
    K = k
    F_TITLE = font("IBMPlexSans-Light.ttf", 76)
    F_SUB = font("IBMPlexSans-ExtraLight.ttf", 38)
    F_LABEL = font("IBMPlexSansCondensed-Medium.ttf", 26)
    F_LSUB = font("IBMPlexSans-Light.ttf", 19)
    F_CAP = font("IBMPlexSansCondensed-Medium.ttf", 24)
    F_CAP2 = font("IBMPlexSans-Light.ttf", 21)
    F_CLOCK = font("IBMPlexMono-Regular.ttf", 30)
    F_EVENT = font("IBMPlexSansCondensed-Regular.ttf", 20)
    F_DISC = font("IBMPlexSans-Light.ttf", 17)


class ScaledDraw:
    """ImageDraw proxy: callers work in 1920x1080 units, output at K x."""

    def __init__(self, d, k):
        self.d, self.k = d, k

    def text(self, xy, s, font, fill):
        self.d.text((xy[0] * self.k, xy[1] * self.k), s, font=font, fill=fill)

    def textlength(self, s, font):
        return self.d.textlength(s, font=font) / self.k

    def line(self, pts, fill, width=1, joint=None):
        self.d.line([(x * self.k, y * self.k) for x, y in pts], fill=fill, width=max(1, int(round(width * self.k))), joint=joint)

    def ellipse(self, box, outline=None, width=1):
        self.d.ellipse([v * self.k for v in box], outline=outline, width=max(1, int(round(width * self.k))))


F_TITLE = font("IBMPlexSans-Light.ttf", 76)
F_SUB = font("IBMPlexSans-ExtraLight.ttf", 38)
F_LABEL = font("IBMPlexSansCondensed-Medium.ttf", 26)
F_LSUB = font("IBMPlexSans-Light.ttf", 19)
F_CAP = font("IBMPlexSansCondensed-Medium.ttf", 24)
F_CAP2 = font("IBMPlexSans-Light.ttf", 21)
F_CLOCK = font("IBMPlexMono-Regular.ttf", 30)
F_EVENT = font("IBMPlexSansCondensed-Regular.ttf", 20)
F_DISC = font("IBMPlexSans-Light.ttf", 17)


def smooth(e0, e1, x):
    t = min(1.0, max(0.0, (x - e0) / (e1 - e0)))
    return t * t * (3 - 2 * t)


def env(t, t_in, t_out, fade=0.6):
    return smooth(t_in, t_in + fade, t) * (1.0 - smooth(t_out - fade, t_out, t))


def spaced_text(d, xy, text, fnt, fill, spacing=0.0, anchor="l"):
    """Letter-spaced text. anchor: l, r or c (x), baseline-ish top y."""
    widths = [d.textlength(ch, font=fnt) for ch in text]
    total = sum(widths) + spacing * (len(text) - 1)
    x, y = xy
    if anchor == "r":
        x -= total
    elif anchor == "c":
        x -= total / 2
    for ch, w in zip(text, widths):
        d.text((x, y), ch, font=fnt, fill=fill)
        x += w + spacing
    return total


class Overlay:
    def __init__(self, tracks):
        self.tracks = tracks

    def draw(self, img, f):
        t = TL.sec(f)
        layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
        d = ScaledDraw(ImageDraw.Draw(layer), img.size[0] / W)
        self.title(d, t)
        self.labels(d, f, t)
        self.captions(d, t)
        self.clock(d, t)
        self.end_title(d, t)
        # soft shadow from the type's own alpha keeps it legible over bright sky and cloud
        k = img.size[0] / W
        sa = layer.getchannel("A").filter(ImageFilter.GaussianBlur(5 * k)).point(lambda v: int(v * 0.55))
        shadow = Image.new("RGBA", img.size, (0, 0, 0, 0))
        shadow.putalpha(sa)
        out = Image.alpha_composite(Image.alpha_composite(img.convert("RGBA"), shadow), layer)
        return out.convert("RGB")

    # ------------------------------------------------------------ title
    def title(self, d, t):
        a = env(t, TL.TITLE[0], TL.TITLE[1], 0.9)
        if a <= 0:
            return
        drift = 6 * (1 - smooth(TL.TITLE[0], TL.TITLE[1], t))
        c = (242, 240, 236, int(255 * a))
        spaced_text(d, (W / 2, 432 + drift), "ARTEMIS II", F_TITLE, c, spacing=20, anchor="c")
        d.line([(W / 2 - 90, 548 + drift), (W / 2 + 90, 548 + drift)], fill=(242, 240, 236, int(150 * a)), width=1)
        spaced_text(d, (W / 2, 568 + drift), "Built for the Journey", F_SUB, (232, 230, 226, int(235 * a)), spacing=2, anchor="c")

    def end_title(self, d, t):
        a = env(t, TL.END_TITLE[0], TL.END_TITLE[1] + 0.8, 1.0)
        if a <= 0:
            return
        c = (246, 244, 240, int(255 * a))
        spaced_text(d, (W / 2, 250), "ARTEMIS II", F_TITLE, c, spacing=20, anchor="c")
        d.line([(W / 2 - 90, 366), (W / 2 + 90, 366)], fill=(246, 244, 240, int(150 * a)), width=1)
        spaced_text(d, (W / 2, 386), "Built for the Journey", F_SUB, (240, 238, 234, int(235 * a)), spacing=2, anchor="c")
        b = env(t, TL.END_TITLE[0] + 0.8, TL.END_TITLE[1] + 0.8, 0.8)
        spaced_text(d, (W / 2, 1008), "Independent CGI visualization of the Artemis II SLS Block 1 crew vehicle  ·  not produced by or affiliated with NASA or ESA",
                    F_DISC, (235, 233, 229, int(200 * b)), spacing=0.5, anchor="c")

    # ------------------------------------------------------------ labels
    def labels(self, d, f, t):
        fr = self.tracks.get("frames", {}).get(str(f))
        if not fr:
            return
        meta = self.tracks["labels"]
        names = [n for n in ("LBL_LAS", "LBL_Orion", "LBL_ICPS", "LBL_LVSA", "LBL_Core", "LBL_SRB", "LBL_RS25") if n in fr]
        t_start, t_end = 39.2, 45.6
        sides = {"L": [], "R": []}
        for n in names:
            sides[meta[n]["side"]].append(n)
        for side, lst in sides.items():
            lst.sort(key=lambda n: fr[n][1])
            # stable slots: evenly distributed between the extreme anchors
            ys = [fr[n][1] * H for n in lst]
            slots = []
            for i, y in enumerate(ys):
                y = max(y, (slots[-1] + 92) if slots else 120)
                slots.append(min(y, H - 110))
            for i, n in enumerate(lst):
                order = names.index(n)
                t_in = t_start + 0.32 * order
                t_out = t_end + 0.06 * order
                if t < t_in or t > t_out + 0.5:
                    continue
                ax, ay = fr[n][0] * W, fr[n][1] * H
                ly = slots[i]
                line_p = smooth(t_in, t_in + 0.5, t) * (1 - smooth(t_out - 0.3, t_out + 0.2, t))
                text_a = smooth(t_in + 0.35, t_in + 0.8, t) * (1 - smooth(t_out - 0.45, t_out, t))
                xe = 690 if side == "L" else W - 690
                xt = 650 if side == "L" else W - 650
                # draw-on leader: anchor -> elbow -> text
                pts = [(ax, ay), (xe, ly + 16), (xt, ly + 16)]
                seg1 = math.dist(pts[0], pts[1])
                seg2 = math.dist(pts[1], pts[2])
                L = (seg1 + seg2) * line_p
                col = (236, 234, 230, int(200 * min(1.0, line_p * 3)))
                if L > 0:
                    if L <= seg1:
                        p = (ax + (pts[1][0] - ax) * L / seg1, ay + (pts[1][1] - ay) * L / seg1)
                        d.line([pts[0], p], fill=col, width=2)
                    else:
                        r = (L - seg1) / seg2
                        p = (pts[1][0] + (pts[2][0] - pts[1][0]) * r, pts[1][1])
                        d.line([pts[0], pts[1], p], fill=col, width=2, joint="curve")
                    rr = 4
                    d.ellipse([ax - rr, ay - rr, ax + rr, ay + rr], outline=col, width=2)
                if text_a > 0:
                    c1 = (246, 244, 240, int(255 * text_a))
                    c2 = (226, 224, 220, int(205 * text_a))
                    anchor = "r" if side == "L" else "l"
                    x = xt - 14 if side == "L" else xt + 14
                    spaced_text(d, (x, ly), meta[n]["title"], F_LABEL, c1, spacing=1.6, anchor=anchor)
                    if meta[n]["sub"]:
                        spaced_text(d, (x, ly + 34), meta[n]["sub"], F_LSUB, c2, spacing=0.4, anchor=anchor)

    # ------------------------------------------------------------ captions
    def caption(self, d, t, t0, t1, l1, l2):
        a = env(t, t0, t1, 0.6)
        if a <= 0:
            return
        spaced_text(d, (96, 942), l1, F_CAP, (246, 244, 240, int(245 * a)), spacing=2.2)
        spaced_text(d, (96, 978), l2, F_CAP2, (232, 230, 226, int(215 * a)), spacing=0.6)
        d.line([(96, 930), (136, 930)], fill=(246, 244, 240, int(190 * a)), width=2)

    def captions(self, d, t):
        self.caption(d, t, 51.4, 54.9, "SLS BLOCK 1 CREW  ·  ORION", "98.3 m  ·  322 ft  ·  about 2,600 t at liftoff")
        self.caption(d, t, 56.4, 58.9, "LAUNCH COMPLEX 39B", "Kennedy Space Center, Florida  ·  late afternoon")

    def clock(self, d, t):
        a = env(t, 55.6, 84.0, 0.7)
        if a <= 0:
            return
        T = TL.mission_time(t)
        sgn = "–" if T < 0 else "+"
        s = math.ceil(-T - 1e-6) if T < 0 else math.floor(T)     # countdown shows the next whole second
        txt = f"T {sgn} {int(s // 3600):02d}:{int(s % 3600 // 60):02d}:{int(s % 60):02d}"
        spaced_text(d, (W - 96, 70), txt, F_CLOCK, (246, 244, 240, int(235 * a)), spacing=1.5, anchor="r")
        events = [(56.2, 58.8, "SOUND SUPPRESSION WATER"), (59.2, 62.0, "HYDROGEN BURN-OFF IGNITERS"),
                  (TL.film_time(TL.T_RS25), TL.film_time(TL.T_RS25) + 2.8, "RS-25 START  ·  3 – 1 – 4 – 2"),
                  (69.0, 71.8, "BOOSTER IGNITION  ·  LIFTOFF"), (TL.film_time(7.0), TL.film_time(7.0) + 2.6, "TOWER CLEARED")]
        for t0, t1, label in events:
            b = env(t, t0, t1, 0.35) * a
            if b > 0:
                spaced_text(d, (W - 96, 114), label, F_EVENT, (236, 234, 230, int(220 * b)), spacing=1.8, anchor="r")


def load(path):
    im = Image.open(path).convert("RGB")
    if im.size != (W, H):
        im = im.resize((W, H), Image.LANCZOS)
        im = im.filter(ImageFilter.UnsharpMask(radius=1.3, percent=38, threshold=2))
    return im


def find(dirs, f):
    for dd in dirs:
        if not dd:
            continue
        for pat in (f"f_{f:04d}.png", f"f_{f:04d}.jpg"):
            p = os.path.join(dd, pat)
            if os.path.exists(p) and os.path.getsize(p) > 0:
                return p
    return None


def nearest(dirs, f, maxgap=3):
    for k in range(maxgap + 1):
        for g in (f - k, f + k):
            p = find(dirs, g)
            if p:
                return p
    return None


def frame_image(f, a):
    t = TL.sec(f)
    s_dirs = [a.studio] + (a.fallback_studio or [])
    p_dirs = [a.pad] + (a.fallback_pad or [])
    in_studio = f <= TL.fr(TL.DISSOLVE[1])
    in_pad = f >= TL.fr(TL.DISSOLVE[0])
    ims = []
    if in_studio:
        p = nearest(s_dirs, f) if a.allow_nearest else find(s_dirs, f)
        ims.append(load(p) if p else None)
    if in_pad:
        p = nearest(p_dirs, f) if a.allow_nearest else find(p_dirs, f)
        ims.append(load(p) if p else None)
    ims = [i if i is not None else Image.new("RGB", (W, H), (0, 0, 0)) for i in ims]
    if len(ims) == 2:
        s = smooth(TL.DISSOLVE[0], TL.DISSOLVE[1], t)
        img = Image.blend(ims[0], ims[1], s)
    else:
        img = ims[0]
    return img


def finish(img, f, overlay):
    t = TL.sec(f)
    img = overlay.draw(img, f)
    arr = np.asarray(img).astype(np.float32)
    k = smooth(0.0, 1.0, t) * (1.0 - smooth(TL.FADE_OUT[0], TL.FADE_OUT[1], t))
    arr *= k
    rng = np.random.default_rng(f)
    arr += rng.normal(0.0, 0.9, arr.shape[:2])[..., None]
    return np.clip(arr + 0.5, 0, 255).astype(np.uint8)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--studio", default=None)
    ap.add_argument("--pad", default=None)
    ap.add_argument("--fallback-studio", nargs="*", default=None)
    ap.add_argument("--fallback-pad", nargs="*", default=None)
    ap.add_argument("--allow-nearest", action="store_true")
    ap.add_argument("--tracks", default=None)
    ap.add_argument("--audio", default=None)
    ap.add_argument("--out", required=True)
    ap.add_argument("--start", type=int, default=1)
    ap.add_argument("--end", type=int, default=TL.fr(TL.FILM_END))
    ap.add_argument("--stills", default=None, help="write selected frames as PNG to this dir instead of video")
    ap.add_argument("--frames", default=None)
    ap.add_argument("--crf", type=int, default=18)
    ap.add_argument("--scale", type=float, default=1.0)
    a = ap.parse_args()
    tracks = json.load(open(a.tracks)) if a.tracks and os.path.exists(a.tracks) else {"frames": {}, "labels": {}}
    ov = Overlay(tracks)
    if a.stills:
        os.makedirs(a.stills, exist_ok=True)
        for f in [int(x) for x in a.frames.split(",")]:
            img = frame_image(f, a)
            arr = finish(img, f, ov)
            Image.fromarray(arr).save(os.path.join(a.stills, f"final_{f:04d}.png"))
            print("STILL", f)
        return
    ffmpeg = "ffmpeg"
    ow, oh = int(W * a.scale) // 2 * 2, int(H * a.scale) // 2 * 2
    cmd = [ffmpeg, "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(TL.FPS), "-i", "-"]
    if a.audio:
        cmd += ["-ss", f"{TL.sec(a.start):.4f}", "-i", a.audio]
    vf = [] if a.scale == 1.0 else ["-vf", f"scale={ow}:{oh}:flags=lanczos"]
    cmd += vf + ["-c:v", "libx264", "-preset", "slow", "-crf", str(a.crf), "-pix_fmt", "yuv420p", "-profile:v", "high",
                 "-tune", "film", "-movflags", "+faststart", "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709"]
    if a.audio:
        cmd += ["-c:a", "aac", "-b:a", "256k", "-shortest"]
    cmd += [a.out]
    os.makedirs(os.path.dirname(os.path.abspath(a.out)), exist_ok=True)
    proc = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    for f in range(a.start, a.end + 1):
        img = frame_image(f, a)
        proc.stdin.write(finish(img, f, ov).tobytes())
        if f % 120 == 0:
            print("frame", f, flush=True)
    proc.stdin.close()
    proc.wait()
    print("ENCODED", a.out, os.path.getsize(a.out) // 1024, "KB")


if __name__ == "__main__":
    main()
