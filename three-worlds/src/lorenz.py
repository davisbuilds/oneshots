"""Canonical Lorenz trajectory for "One Equation, Three Worlds".

Integrates dx/dt = s(y-x), dy/dt = x(r-z)-y, dz/dt = xy - b z with
sigma=10, rho=28, beta=8/3 from (1,1,1) using SciPy's DOP853 (explicit
Runge-Kutta 8(5,3)) at rtol=atol=1e-12, then samples the dense-output
interpolant on a uniform grid of dt = 1e-3.

Run:  python3 src/lorenz.py            -> writes data/lorenz_full.npz
      python3 src/lorenz.py --select T0 T1  -> writes the canonical segment
"""
import argparse, json, pathlib
import numpy as np
from scipy.integrate import solve_ivp

SIGMA, RHO, BETA = 10.0, 28.0, 8.0 / 3.0
X0 = (1.0, 1.0, 1.0)
T_END = 120.0
DT = 1e-3
RTOL = ATOL = 1e-12
ROOT = pathlib.Path(__file__).resolve().parents[1]


def rhs(t, s):
    x, y, z = s
    return [SIGMA * (y - x), x * (RHO - z) - y, x * y - BETA * z]


def integrate(t_end=T_END, dt=DT):
    sol = solve_ivp(rhs, (0.0, t_end), X0, method="DOP853", rtol=RTOL, atol=ATOL,
                    dense_output=True)
    t = np.round(np.arange(0.0, t_end + dt / 2, dt), 9)
    P = sol.sol(t).T
    return t, P, sol


def derived(P):
    V = np.array([rhs(0, p) for p in P])
    speed = np.linalg.norm(V, axis=1)
    return V, speed


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--select", nargs=2, type=float, metavar=("T0", "T1"))
    a = ap.parse_args()
    t, P, sol = integrate()
    # accuracy check: rerun at a looser tolerance and at LSODA to report divergence time
    alt = solve_ivp(rhs, (0, T_END), X0, method="LSODA", rtol=1e-10, atol=1e-12, dense_output=True)
    dev = np.linalg.norm(alt.sol(t).T - P, axis=1)
    diverge_t = float(t[np.argmax(dev > 1.0)]) if (dev > 1.0).any() else None
    np.savez_compressed(ROOT / "data/lorenz_full.npz", t=t, xyz=P)
    print("steps", sol.t.size, "nfev", sol.nfev, "divergence(>1) vs LSODA at t =", diverge_t)
    if a.select:
        t0, t1 = a.select
        m = (t >= t0 - 1e-9) & (t <= t1 + 1e-9)
        ts, Ps = t[m], P[m]
        V, sp = derived(Ps)
        np.savez_compressed(ROOT / "data/lorenz_canonical.npz", t=ts, xyz=Ps, vel=V, speed=sp)
        hdr = "t,x,y,z,dxdt,dydt,dzdt,speed"
        np.savetxt(ROOT / "data/lorenz_canonical.csv", np.column_stack([ts, Ps, V, sp]),
                   delimiter=",", header=hdr, comments="", fmt="%.10g")
        meta = dict(equations="dx/dt=sigma(y-x); dy/dt=x(rho-z)-y; dz/dt=xy-beta z",
                    sigma=SIGMA, rho=RHO, beta=BETA, initial_condition=X0,
                    solver="scipy.integrate.solve_ivp DOP853 (explicit RK 8(5,3), adaptive)",
                    rtol=RTOL, atol=ATOL, integration_interval=[0.0, T_END],
                    sampling="dense-output interpolant sampled at uniform dt", dt=DT,
                    transient_discarded=[0.0, t0], segment=[t0, t1], samples=int(ts.size),
                    lsoda_crosscheck_divergence_time=diverge_t,
                    bounds=dict(min=Ps.min(0).tolist(), max=Ps.max(0).tolist()))
        (ROOT / "data/lorenz_canonical.json").write_text(json.dumps(meta, indent=2))
        print(json.dumps(meta, indent=2))
