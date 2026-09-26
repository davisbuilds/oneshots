"""Study: where is the transient, and which contiguous window reads best?"""
import numpy as np, matplotlib; matplotlib.use("Agg")
import matplotlib.pyplot as plt
d = np.load("data/lorenz_full.npz"); t, P = d["t"], d["xyz"]
m = t <= 27.4
fig = plt.figure(figsize=(16, 10), facecolor="w")
ax = fig.add_subplot(3, 1, 1)
ax.plot(t[m], P[m, 0], lw=.6, c="k"); ax.plot(t[m], P[m, 2] - 25, lw=.6, c="r")
ax.set_xticks(np.arange(0, 28, 1)); ax.grid(alpha=.3); ax.set_title("x(t) black, z(t)-25 red")
# loops = local maxima of z
z = P[:, 2]; pk = np.where((z[1:-1] > z[:-2]) & (z[1:-1] > z[2:]))[0] + 1
pk = pk[t[pk] < 27.4]
for i in pk: ax.axvline(t[i], c="b", lw=.3)
wins = [(2, 27.4), (3, 20), (5, 22), (8, 25), (10, 27.4), (4, 16), (12, 24), (6, 26)]
for k, (a, b) in enumerate(wins):
    s = (t >= a) & (t <= b)
    ax2 = fig.add_subplot(3, 4, 5 + k)
    ax2.plot(P[s, 0], P[s, 2], lw=.35, c="k"); ax2.set_aspect("equal"); ax2.axis("off")
    nloops = ((t[pk] >= a) & (t[pk] <= b)).sum()
    sw = (np.diff(np.sign(P[s, 0])) != 0).sum()
    ax2.set_title(f"[{a},{b}] loops={nloops} switches={sw}", fontsize=9)
plt.tight_layout(); plt.savefig("studies/00_segment_study.png", dpi=90)
print([round(float(t[i]),2) for i in pk])
