import numpy as np, matplotlib; matplotlib.use("Agg")
import matplotlib.pyplot as plt
d = np.load("data/lorenz_full.npz"); t, P = d["t"], d["xyz"]
wins = [(8, 27), (9, 27), (10, 27), (11.5, 27)]
views = [(0, 0), (25, 20), (-35, 15), (60, 30)]  # yaw about z, elevation
def proj(Q, yaw, el):
    c = Q - np.array([0, 0, 25.])
    a, e = np.radians(yaw), np.radians(el)
    x = c[:, 0] * np.cos(a) - c[:, 1] * np.sin(a)
    yv = c[:, 0] * np.sin(a) + c[:, 1] * np.cos(a)
    z = c[:, 2] * np.cos(e) - yv * np.sin(e)
    return x, z, yv
fig, axs = plt.subplots(len(wins), len(views), figsize=(16, 17))
for i, (a, b) in enumerate(wins):
    s = (t >= a) & (t <= b)
    for j, (yw, el) in enumerate(views):
        x, z, dep = proj(P[s], yw, el)
        ax = axs[i, j]; ax.plot(x, z, lw=.45, c="k"); ax.plot(x[:1], z[:1], "go"); ax.plot(x[-1:], z[-1:], "ro")
        ax.set_aspect("equal"); ax.axis("off"); ax.set_title(f"[{a},{b}] yaw{yw} el{el}")
plt.tight_layout(); plt.savefig("studies/01_segment_candidates.png", dpi=70)
