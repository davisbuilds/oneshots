"""Render an audio inspection image: RMS loudness (dBFS) and spectrogram with shot boundaries."""
import sys, os, wave
import numpy as np
from PIL import Image, ImageDraw, ImageFont
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import timeline as TL
from scipy import signal

path, out = sys.argv[1], sys.argv[2]
w = wave.open(path); sr = w.getframerate(); n = w.getnframes()
x = np.frombuffer(w.readframes(n), dtype=np.int16).reshape(-1, 2).astype(np.float32) / 32768
m = x.mean(1)
W, H = 1800, 700
img = Image.new('RGB', (W, H), (18, 18, 20)); d = ImageDraw.Draw(img)
f, tt, S = signal.spectrogram(m, sr, nperseg=4096, noverlap=2048)
S = 10 * np.log10(S + 1e-12); fmask = f < 8000
S = S[fmask]; S = np.clip((S + 110) / 80, 0, 1)
spec = Image.fromarray((S[::-1] * 255).astype(np.uint8)).resize((W, 350))
img.paste(Image.merge('RGB', (spec, spec.point(lambda v: v * 0.7), spec.point(lambda v: v * 0.4))), (0, 350))
hop = int(0.25 * sr); rms = [20 * np.log10(np.sqrt((x[i:i + hop] ** 2).mean()) + 1e-9) for i in range(0, len(x) - hop, hop)]
pk = [20 * np.log10(np.abs(x[i:i + hop]).max() + 1e-9) for i in range(0, len(x) - hop, hop)]
dur = len(x) / sr
def X(tsec): return int(tsec / dur * W)
def Y(db): return int(20 + (-db) / 60 * 310)
for db in (0, -12, -24, -36, -48):
    d.line([(0, Y(db)), (W, Y(db))], fill=(50, 50, 55)); d.text((4, Y(db) - 12), f'{db} dB', fill=(120, 120, 130))
for s in TL.SHOTS:
    d.line([(X(s[3]), 0), (X(s[3]), H)], fill=(70, 70, 90)); d.text((X(s[3]) + 2, 2), s[0], fill=(160, 160, 190))
d.line([(X(i * 0.25), Y(v)) for i, v in enumerate(pk)], fill=(200, 90, 70), width=1)
d.line([(X(i * 0.25), Y(v)) for i, v in enumerate(rms)], fill=(240, 220, 120), width=2)
img.save(out); print('peak dBFS', round(max(pk), 2), 'max RMS', round(max(rms), 1), 'min RMS(2-86s)', round(min(rms[8:344]), 1))
