"""Making-of film: captures the real canvas while the strokes are being applied.

Frames are taken from the live paint layers (colour + impasto height) during
the full-resolution render, downsampled and lit, and piped straight into
FFmpeg.  Capture points are spread by stroke "effort" (roughly sqrt of the
area a stroke covers), so the broad early lay-in and the thousands of small
late touches both get screen time.  There is no cross-dissolve of the final
image: every frame is the canvas as it actually stood at that moment.
"""

from __future__ import annotations

import math
import subprocess

import numpy as np
from PIL import Image, ImageDraw, ImageFont

from brush import Canvas

FPS = 30
BUILD_SECONDS = 23.0
HOLD_START = 0.8
HOLD_END = 3.2
VW, VH = 1920, 1280
# relative screen time per stage (keyed by stage number)
STAGE_TIME = {"01": 1.6, "02": 5.0, "03": 1.0, "04": 2.4, "05": 1.6, "06": 0.8,
              "07": 1.2, "08": 1.6, "09": 1.4, "10": 1.0, "11": 1.6, "12": 2.6,
              "13": 1.0, "14": 0.8}


def ffmpeg_exe():
    try:
        import imageio_ffmpeg
        return imageio_ffmpeg.get_ffmpeg_exe()
    except ImportError:
        return "ffmpeg"


def op_effort(op):
    p = np.asarray(op["pts"], np.float64)
    ln = float(np.hypot(*np.diff(p, axis=0).T).sum()) if len(p) > 1 else 0.0
    w = op["width"]
    return (max(ln, w) * w) ** 0.42


def shrink(a, w, h):
    if a.ndim == 2:
        return np.asarray(Image.fromarray(a.astype(np.float32), "F").resize((w, h), Image.BOX))
    return np.stack([shrink(a[..., i], w, h) for i in range(a.shape[2])], axis=-1)


class Recorder:
    def __init__(self, ops, W, H, out_mp4, caption=True):
        self.W, self.H = W, H
        self.vw, self.vh = VW, int(round(VW * H / W / 2)) * 2
        eff = np.array([op_effort(o) for o in ops])
        # each stage gets a screen-time budget; inside a stage frames follow effort
        stages = []
        for i, o in enumerate(ops):
            if not stages or stages[-1][0] != o["stage"]:
                stages.append([o["stage"], i, i + 1])
            else:
                stages[-1][2] = i + 1
        weights = np.array([STAGE_TIME.get(st[:2], 1.0) for st, _, _ in stages])
        seconds = weights / weights.sum() * BUILD_SECONDS
        self.grab = {}
        fi = 0
        for (st, a, b), sec in zip(stages, seconds):
            n = max(1, int(round(sec * FPS)))
            cum = np.cumsum(eff[a:b]) / eff[a:b].sum()
            for t in np.linspace(0, 1, n + 1)[1:]:
                i = a + int(np.searchsorted(cum, t - 1e-9))
                self.grab.setdefault(min(i, b - 1), []).append(fi)
                fi += 1
        self.n_ops = len(ops)
        self.caption = caption
        self.stages = [o["stage"] for o in ops]
        self.small_tooth = None
        self.proc = subprocess.Popen(
            [ffmpeg_exe(), "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24",
             "-s", f"{self.vw}x{self.vh}", "-r", str(FPS), "-i", "-",
             "-c:v", "libx264", "-preset", "slow", "-crf", "19", "-pix_fmt", "yuv420p",
             "-movflags", "+faststart", out_mp4],
            stdin=subprocess.PIPE)
        self.frames = 0
        try:
            self.font = ImageFont.load_default(size=22)
        except TypeError:
            self.font = ImageFont.load_default()

    def _frame(self, cv: Canvas, label=None):
        if self.small_tooth is None:
            self.small_tooth = shrink(cv.tooth, self.vw, self.vh)
        rgb = shrink(cv.rgb, self.vw, self.vh)
        hgt = shrink(cv.height, self.vw, self.vh)
        lit = cv.lit(rgb, hgt, self.small_tooth)
        im = Image.fromarray((np.clip(lit, 0, 1) * 255 + 0.5).astype(np.uint8), "RGB")
        if label and self.caption:
            d = ImageDraw.Draw(im, "RGBA")
            d.text((28, self.vh - 44), label, font=self.font, fill=(210, 205, 195, 150))
        return im

    def _write(self, im, n=1):
        b = im.tobytes()
        for _ in range(n):
            self.proc.stdin.write(b)
            self.frames += 1

    def __call__(self, cv: Canvas, i, op):
        if i in self.grab:
            label = f"{op['stage'][3:]}  ·  stroke {i + 1:,} / {self.n_ops:,}"
            im = self._frame(cv, label)
            self._write(im, len(self.grab[i]))

    def start(self, cv: Canvas):
        im = self._frame(cv, "blank canvas")
        self._write(im, int(HOLD_START * FPS))

    def finish(self, final_lit):
        small = np.stack([np.asarray(Image.fromarray(final_lit[..., k].astype(np.float32), "F")
                                     .resize((self.vw, self.vh), Image.BOX)) for k in range(3)], -1)
        im = Image.fromarray((np.clip(small, 0, 1) * 255 + 0.5).astype(np.uint8), "RGB")
        self._write(im, int(HOLD_END * FPS))
        self.proc.stdin.close()
        self.proc.wait()
        return self.frames / FPS
