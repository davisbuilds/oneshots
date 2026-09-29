"""Where the planets really are: Standish's approximate Keplerian elements.

E. M. Standish & J. G. Williams (1992), as published by JPL Solar System
Dynamics, "Approximate Positions of the Planets",
https://ssd.jpl.nasa.gov/planets/approx_pos.html, Tables 2a and 2b, valid
3000 BC to AD 3000, mean ecliptic and equinox of J2000. The same numbers and
formulae are ported to JavaScript in index.html; test_ephemeris.py checks the
Python against JPL Horizons and verify.mjs checks the JavaScript against this.

Times are Julian ephemeris dates (TDB). Angles in degrees, distances in au.
"""

from __future__ import annotations

import math

J2000 = 2451545.0

# name: (a, e, I, L, long.peri, long.node) and their rates per Julian century.
TABLE_2A = {
    "mercury": ((0.38709843, 0.20563661, 7.00559432, 252.25166724, 77.45771895, 48.33961819),
                (0.00000000, 0.00002123, -0.00590158, 149472.67486623, 0.15940013, -0.12214182)),
    "venus":   ((0.72332102, 0.00676399, 3.39777545, 181.97970850, 131.76755713, 76.67261496),
                (-0.00000026, -0.00005107, 0.00043494, 58517.81560260, 0.05679648, -0.27274174)),
    "emb":     ((1.00000018, 0.01673163, -0.00054346, 100.46691572, 102.93005885, -5.11260389),
                (-0.00000003, -0.00003661, -0.01337178, 35999.37306329, 0.31795260, -0.24123856)),
    "mars":    ((1.52371243, 0.09336511, 1.85181869, -4.56813164, -23.91744784, 49.71320984),
                (0.00000097, 0.00009149, -0.00724757, 19140.29934243, 0.45223625, -0.26852431)),
    "jupiter": ((5.20248019, 0.04853590, 1.29861416, 34.33479152, 14.27495244, 100.29282654),
                (-0.00002864, 0.00018026, -0.00322699, 3034.90371757, 0.18199196, 0.13024619)),
    "saturn":  ((9.54149883, 0.05550825, 2.49424102, 50.07571329, 92.86136063, 113.63998702),
                (-0.00003065, -0.00032044, 0.00451969, 1222.11494724, 0.54179478, -0.25015002)),
    "uranus":  ((19.18797948, 0.04685740, 0.77298127, 314.20276625, 172.43404441, 73.96250215),
                (-0.00020455, -0.00001550, -0.00180155, 428.49512595, 0.09266985, 0.05739699)),
    "neptune": ((30.06952752, 0.00895439, 1.77005520, 304.22289287, 46.68158724, 131.78635853),
                (0.00006447, 0.00000818, 0.00022400, 218.46515314, 0.01009938, -0.00606302)),
}

# Table 2b: extra terms in the mean anomaly, b T^2 + c cos(fT) + s sin(fT), degrees.
TABLE_2B = {
    "jupiter": (-0.00012452, 0.06064060, -0.35635438, 38.35125000),
    "saturn":  (0.00025899, -0.13434469, 0.87320147, 38.35125000),
    "uranus":  (0.00058331, -0.97731848, 0.17689245, 7.67025000),
    "neptune": (-0.00041348, 0.68346318, -0.10162547, 7.67025000),
}

# Nominal heliocentric-longitude errors of Table 2 over 3000 BC - AD 3000, arcsec (same page).
NOMINAL_ERROR_ARCSEC = {"mercury": 20, "venus": 40, "emb": 40, "mars": 100,
                        "jupiter": 600, "saturn": 1000, "uranus": 2000, "neptune": 400}

BODIES = tuple(TABLE_2A)


def centuries(jd: float) -> float:
    return (jd - J2000) / 36525.0


def mean_longitude(body: str, jd: float) -> float:
    """Mean longitude L in degrees, unwrapped (this is what a uniform gear train shows)."""
    (L0, dL) = TABLE_2A[body][0][3], TABLE_2A[body][1][3]
    return L0 + dL * centuries(jd)


def kepler(M_deg: float, e: float) -> float:
    """Eccentric anomaly (degrees) from mean anomaly, by JPL's recommended iteration."""
    es = math.degrees(e)
    E = M_deg + es * math.sin(math.radians(M_deg))
    for _ in range(50):
        dM = M_deg - (E - es * math.sin(math.radians(E)))
        dE = dM / (1.0 - e * math.cos(math.radians(E)))
        E += dE
        if abs(dE) <= 1e-9:
            break
    return E


def position(body: str, jd: float) -> tuple[float, float, float]:
    """Heliocentric ecliptic J2000 rectangular coordinates (au)."""
    T = centuries(jd)
    el0, rate = TABLE_2A[body]
    a, e, I, L, wbar, node = (x0 + dx * T for x0, dx in zip(el0, rate))
    w = wbar - node
    M = L - wbar
    if body in TABLE_2B:
        b, c, s, f = TABLE_2B[body]
        M += b * T * T + c * math.cos(math.radians(f * T)) + s * math.sin(math.radians(f * T))
    M = (M + 180.0) % 360.0 - 180.0
    E = math.radians(kepler(M, e))
    xp = a * (math.cos(E) - e)
    yp = a * math.sqrt(1.0 - e * e) * math.sin(E)
    cw, sw = math.cos(math.radians(w)), math.sin(math.radians(w))
    cO, sO = math.cos(math.radians(node)), math.sin(math.radians(node))
    cI, sI = math.cos(math.radians(I)), math.sin(math.radians(I))
    x = (cw * cO - sw * sO * cI) * xp + (-sw * cO - cw * sO * cI) * yp
    y = (cw * sO + sw * cO * cI) * xp + (-sw * sO + cw * cO * cI) * yp
    z = (sw * sI) * xp + (cw * sI) * yp
    return x, y, z


def longitude(body: str, jd: float) -> float:
    """True heliocentric ecliptic longitude, degrees in [0, 360)."""
    x, y, _ = position(body, jd)
    return math.degrees(math.atan2(y, x)) % 360.0


def sidereal_period_days(body: str) -> float:
    """Mean sidereal period implied by the mean-longitude rate (J2000 fixed frame)."""
    return 360.0 * 36525.0 / TABLE_2A[body][1][3]


def wrap180(deg: float) -> float:
    return (deg + 180.0) % 360.0 - 180.0
