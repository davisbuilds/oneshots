"""Original procedural sound design (no samples, no third-party audio).

Synthesized with numpy/scipy at 48 kHz stereo and timed to the edit in
src/lib/timeline.py and the join times of src/lib/anim_studio.py:
  * tonal bed (Acts I-III): composed drones/chord swells, rising to the hero
  * mechanical textures: servo whirs during moves, clunks/rings at contacts
  * label ticks, pad ambience (wind), sound-suppression water rush,
    igniter crackle, four staggered RS-25 starts, booster ignition crackle
    and sub-boom, ascent roar with distance filtering, resolving end chord.

python src/sound.py --out output/artemis_ii_soundtrack.wav
"""
import argparse
import os
import sys
import wave

import numpy as np
from scipy import signal

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from lib import timeline as TL  # noqa: E402

SR = 48000
DUR = TL.FILM_END + 0.5
N = int(DUR * SR)
t = np.arange(N) / SR
rng = np.random.default_rng(39)


def sos(kind, f, order=2):
    return signal.butter(order, f, btype=kind, fs=SR, output="sos")


def filt(x, kind, f, order=2):
    return signal.sosfilt(sos(kind, f, order), x)


def noise(n=N, color="white"):
    w = rng.standard_normal(n)
    if color == "pink":
        b = [0.049922035, -0.095993537, 0.050612699, -0.004408786]
        a = [1, -2.494956002, 2.017265875, -0.522189400]
        w = signal.lfilter(b, a, w) * 8
    elif color == "brown":
        w = np.cumsum(w)
        w = filt(w, "highpass", 12)
        w /= (np.abs(w).max() + 1e-9)
    return w


def envelope(points):
    """Piecewise-smooth envelope from [(time, value), ...]."""
    ts = np.array([p[0] for p in points])
    vs = np.array([p[1] for p in points])
    e = np.interp(t, ts, vs)
    return filt(e, "lowpass", 8)


def seg(t0, t1):
    return slice(max(0, int(t0 * SR)), min(N, int(t1 * SR)))


def add(buf, x, t0, gain=1.0, pan=0.0):
    i0 = int(t0 * SR)
    if i0 >= N:
        return
    n = min(len(x), N - i0)
    l = np.cos((pan + 1) * np.pi / 4)
    r = np.sin((pan + 1) * np.pi / 4)
    buf[0, i0:i0 + n] += x[:n] * gain * l * 1.414
    buf[1, i0:i0 + n] += x[:n] * gain * r * 1.414


def clunk(weight=1.0, ring=True, dur=1.6):
    n = int(dur * SR)
    tt = np.arange(n) / SR
    thump = np.sin(2 * np.pi * (55 + 30 * np.exp(-tt * 30)) * tt) * np.exp(-tt * (9 / weight))
    click = filt(rng.standard_normal(n) * np.exp(-tt * 120), "bandpass", [900, 5000])
    x = thump * 0.9 + click * 0.25
    if ring:
        for fr, dec, amp in ((423.0, 2.6, 0.10), (1187.0, 3.5, 0.06), (2311.0, 5.0, 0.035), (3527.0, 7.0, 0.02)):
            x += amp * np.sin(2 * np.pi * fr * tt + rng.uniform(0, 6)) * np.exp(-tt * dec) * (1 - np.exp(-tt * 400))
    return x * weight


def whir(dur, f0=180, f1=420):
    n = int(dur * SR)
    tt = np.arange(n) / SR
    base = rng.standard_normal(n)
    # sweep a band-pass by crossfading three bands
    lo = filt(base, "bandpass", [f0 * 0.7, f0 * 1.4])
    hi = filt(base, "bandpass", [f1 * 0.7, f1 * 1.4])
    s = np.sin(np.pi * np.clip(tt / dur, 0, 1)) ** 1.5
    motor = 0.25 * np.sin(2 * np.pi * np.cumsum(np.interp(tt, [0, dur], [f0 * 0.5, f1 * 0.5])) / SR)
    return (lo * (1 - tt / dur) + hi * (tt / dur) + motor) * s


def tone(freqs, dur, attack=2.0, release=3.0, trem=0.15, detune=0.003):
    n = int(dur * SR)
    tt = np.arange(n) / SR
    x = np.zeros(n)
    for i, (fq, amp) in enumerate(freqs):
        for dd in (-detune, detune):
            x += amp * np.sin(2 * np.pi * fq * (1 + dd) * tt + rng.uniform(0, 6))
    x *= 1 + trem * np.sin(2 * np.pi * 0.13 * tt + rng.uniform(0, 6))
    e = np.minimum(1, tt / attack) * np.minimum(1, np.maximum(0, (dur - tt) / release))
    return x * e


def crackle(n, density=900, hp=1800):
    x = np.zeros(n)
    k = int(n / SR * density)
    idx = rng.integers(0, n, k)
    amps = (rng.pareto(2.2, k) + 0.2) * rng.choice([-1, 1], k)
    np.add.at(x, idx, amps)
    ker = np.exp(-np.arange(int(0.004 * SR)) / (0.0006 * SR))
    x = np.convolve(x, ker, mode="same")
    return filt(x, "highpass", hp)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True)
    a = ap.parse_args()
    buf = np.zeros((2, N))

    # ------------------------------------------------------------ tonal bed, Acts I-III
    A1, E2, A2, Cs3, E3, A3, B3 = 55.0, 82.41, 110.0, 138.59, 164.81, 220.0, 246.94
    drone = tone([(A1, 0.5), (E2, 0.28), (A2, 0.22)], 57.0, attack=3.0, release=4.0)
    drone = filt(drone, "lowpass", 600)
    add(buf, drone * envelope([(0, 0), (2, 0.45), (16, 0.55), (38, 0.7), (50, 1.0), (54.5, 0.8), (57, 0)])[:len(drone)], 0.0, 0.34)
    shimmer = tone([(880.0, 0.05), (1318.5, 0.035), (1760.0, 0.02), (2637.0, 0.012)], 18.0, attack=4, release=5, trem=0.4)
    add(buf, shimmer, 0.5, 0.6, pan=-0.3)
    add(buf, tone([(659.25, 0.03), (987.77, 0.025), (1318.5, 0.015)], 16.0, attack=4, release=4, trem=0.35), 3.0, 0.5, pan=0.35)
    pulse_n = int(22 * SR)
    pt = np.arange(pulse_n) / SR
    pulse = np.sin(2 * np.pi * 49 * pt) * (np.exp(-((pt % 1.0) * 14)) + 0.6 * np.exp(-(((pt - 0.28) % 1.0) * 18)))
    add(buf, filt(pulse, "lowpass", 180) * np.minimum(1, pt / 3) * np.minimum(1, (22 - pt) / 3), 16.0, 0.35)
    swell = tone([(A2, 0.25), (Cs3, 0.2), (E3, 0.2), (A3, 0.16), (B3, 0.08), (440.0, 0.07), (554.4, 0.05)], 19.0, attack=9.0, release=4.5, trem=0.08)
    swell = filt(swell, "lowpass", 2200)
    add(buf, swell * np.linspace(0.3, 1.0, len(swell)), 38.0, 0.55)
    hero = tone([(A1, 0.35), (A2, 0.25), (E3, 0.2), (A3, 0.2), (Cs3 * 2, 0.12), (E3 * 2, 0.08), (B3 * 2, 0.05)], 7.5, attack=0.8, release=3.5, trem=0.05)
    add(buf, filt(hero, "lowpass", 3000), 50.4, 0.6)

    # ------------------------------------------------------------ assembly: whirs + contacts
    joins = []
    core_steps = [(16.3, 17.3, 1), (17.4, 18.4, 2), (18.5, 19.5, 3), (19.6, 20.6, 4)]
    for t0, t1, k in core_steps:
        joins.append((t0, t1, 0.7 + 0.12 * k, -0.2))
    for i in range(4):
        t0 = 21.4 + 0.6 * i
        joins.append((t0, t0 + 1.6, 1.0, [-0.5, 0.4, 0.5, -0.4][i]))
    for dt, pan in ((0.0, -0.45), (0.18, 0.45)):
        joins.append((25.7 + dt, 26.7 + dt, 0.6, pan))
        for i in range(8):
            travel = 2.2 * (i + 1)
            t0 = 25.8 + dt + 0.42 * i
            joins.append((t0, t0 + 1.0 + 0.045 * travel, 0.55 + 0.05 * i, pan))
    for t0, t1 in ((31.3, 32.8), (32.0, 33.5)):
        joins.append((t0, t1, 0.8, 0.1))
    for t0, t1, w in ((34.2, 35.2, 0.6), (34.5, 35.6, 0.6), (35.0, 36.4, 0.5), (35.5, 36.7, 0.7), (36.0, 37.5, 0.8)):
        joins.append((t0, t1, w, -0.1))
    for t0, t1, w in ((46.0, 47.2, 1.3), (47.0, 48.4, 1.5), (47.8, 49.0, 1.2), (47.9, 50.0, 1.2)):
        joins.append((t0, t1, w, 0.0))
    for t0, t1, w, pan in joins:
        add(buf, whir(t1 - t0 + 0.1, 150 + 40 * w, 320 + 60 * w), t0, 0.012 * w, pan)
        add(buf, clunk(weight=min(1.6, w)), t1 - 0.02, 0.11, pan)
    # restrained transition air at studio cuts
    for s in TL.SHOTS:
        if s[2] == "SC_Studio" and s[3] > 1.0:
            wh = filt(noise(int(1.2 * SR)), "bandpass", [600, 2500]) * np.hanning(int(1.2 * SR)) ** 3
            add(buf, wh, s[3] - 0.7, 0.004)
    for i in range(7):   # label ticks
        tk = np.sin(2 * np.pi * 2400 * np.arange(int(0.05 * SR)) / SR) * np.exp(-np.arange(int(0.05 * SR)) / SR * 90)
        add(buf, tk, 39.2 + 0.32 * i + 0.35, 0.05, pan=(-0.5 if i % 2 == 0 else 0.5))

    # ------------------------------------------------------------ pad: ambience, water, igniters
    wind = filt(noise(color="pink"), "bandpass", [80, 900])
    add(buf, wind * envelope([(0, 0), (54.8, 0), (56.5, 0.35), (68.8, 0.3), (72, 0.0), (89.5, 0)]), 0.0, 0.10, pan=-0.2)
    wind2 = filt(noise(color="pink"), "bandpass", [80, 900])
    add(buf, wind2 * envelope([(0, 0), (54.8, 0), (56.5, 0.35), (68.8, 0.3), (72, 0.0), (89.5, 0)]), 0.0, 0.10, pan=0.2)
    water = filt(noise(), "bandpass", [250, 5000])
    add(buf, water * envelope([(0, 0), (55.0, 0), (56.3, 0.06), (59.0, 0.08), (59.05, 0.5), (62.5, 0.5), (62.55, 0.3), (69.0, 0.25), (70.0, 0.0), (89.5, 0)]), 0.0, 0.22, pan=-0.15)
    water2 = filt(noise(), "bandpass", [300, 6000])
    add(buf, water2 * envelope([(0, 0), (55.0, 0), (56.3, 0.06), (59.0, 0.08), (59.05, 0.5), (62.5, 0.5), (62.55, 0.3), (69.0, 0.25), (70.0, 0.0), (89.5, 0)]), 0.0, 0.22, pan=0.15)
    ig = crackle(int(5.0 * SR), density=500, hp=2500) * 0.6
    add(buf, ig * np.minimum(1, np.arange(len(ig)) / SR / 0.3), 59.0, 0.08, pan=0.2)

    # ------------------------------------------------------------ RS-25 start (3-1-4-2, 120 ms apart)
    t_rs = TL.film_time(TL.T_RS25)
    roar_rs = np.zeros(N)
    base = noise()
    for i in range(4):
        ti = t_rs + TL.RS25_STAGGER * i
        e = np.clip((t - ti) / 0.35, 0, 1) ** 1.5
        roar_rs += e
        pop = clunk(weight=1.2, ring=False, dur=0.8)
        add(buf, pop, ti, 0.35, pan=[0.3, -0.3, 0.2, -0.2][i])
    roar_rs /= 4.0
    lo = filt(base, "lowpass", 220) * 1.6
    mid = filt(base, "bandpass", [220, 2400])
    hi = filt(base, "highpass", 2400) * 0.5
    persp = envelope([(0, 1), (TL.film_time(0.0), 1), (89.5, 1)])
    rs = (lo * 0.9 + mid * 0.55 + hi * 0.25) * roar_rs * persp
    rs_env = envelope([(0, 1), (65.5, 1), (65.6, 0.8), (69.0, 0.7), (72.4, 0.45), (89.5, 0.2)])
    add(buf, rs * rs_env, 0.0, 1.15, pan=0.0)

    # ------------------------------------------------------------ anticipation riser (pad reveal -> T-0)
    t_z = TL.film_time(0.0)
    rn = int((t_z - 56.0) * SR)
    rt = np.arange(rn) / SR
    riser = np.zeros(rn)
    for fq, amp in ((41.2, 0.5), (61.7, 0.3), (82.4, 0.2)):
        riser += amp * np.sin(2 * np.pi * fq * rt)
    riser += 0.35 * filt(rng.standard_normal(rn), "bandpass", [60, 400])
    riser *= (rt / rt[-1]) ** 2.2
    riser *= np.clip((rt[-1] - rt) / 0.12, 0, 1)          # suck-out just before ignition
    add(buf, riser, 56.0, 0.32)

    # ------------------------------------------------------------ booster ignition, liftoff, ascent
    t0 = TL.film_time(0.0)
    on = np.clip((t - t0) / 0.25, 0, 1)
    boom_n = int(4 * SR)
    bt = np.arange(boom_n) / SR
    boom = np.sin(2 * np.pi * (38 + 25 * np.exp(-bt * 6)) * bt) * np.exp(-bt * 1.2)
    add(buf, boom, t0 - 0.02, 0.9)
    rumble = noise(color="brown")
    rumble2 = noise(color="brown")
    cr1 = crackle(N, density=1400, hp=900)
    cr2 = crackle(N, density=1400, hp=900)
    cr1 /= np.abs(cr1).max()
    cr2 /= np.abs(cr2).max()
    body = filt(noise(), "bandpass", [120, 1800])
    body2 = filt(noise(), "bandpass", [120, 1800])
    # perspective per shot: close (S17), far (S18-S20) = darker and quieter
    close = envelope([(0, 0), (t0, 1.0), (72.4, 1.0), (72.5, 0.55), (77.4, 0.5), (77.5, 0.42), (81.2, 0.38), (81.3, 0.3), (86, 0.18), (89.5, 0.05)])
    hifac = envelope([(0, 0), (t0, 1.0), (72.4, 1.0), (72.5, 0.45), (81.2, 0.35), (81.3, 0.2), (89.5, 0.1)])
    for (rm, cr, bd, pan) in ((rumble, cr1, body, -0.25), (rumble2, cr2, body2, 0.25)):
        x = on * close * (1.3 * filt(rm, "lowpass", 90) + 0.55 * bd + 0.55 * cr * hifac)
        add(buf, x, 0.0, 1.0, pan=pan)

    # ------------------------------------------------------------ end chord
    end = tone([(A1, 0.3), (A2, 0.25), (E3, 0.22), (A3, 0.2), (Cs3 * 2, 0.14), (B3 * 2, 0.08), (E3 * 4, 0.04)], 6.5, attack=2.5, release=3.0, trem=0.06)
    add(buf, filt(end, "lowpass", 3500), 83.6, 0.5)

    # ------------------------------------------------------------ master: fades, gentle limiting
    fade = np.clip(t / 1.0, 0, 1) * np.clip((DUR - 0.3 - t) / 1.6, 0, 1)
    buf *= fade
    peak = np.abs(buf).max()
    buf = np.tanh(buf / peak * 1.25) / np.tanh(1.25) * 0.89
    pcm = (buf.T * 32767).astype(np.int16)
    os.makedirs(os.path.dirname(os.path.abspath(a.out)), exist_ok=True)
    with wave.open(a.out, "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())
    print("SOUND_OK", a.out, f"{DUR:.1f}s")


if __name__ == "__main__":
    main()
