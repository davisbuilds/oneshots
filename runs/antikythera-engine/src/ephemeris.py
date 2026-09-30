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


# ------------------------------------------------------------------ the Moon
# Geocentric longitude and latitude from the principal terms of the ELP-2000/82
# series as tabulated by J. Meeus, Astronomical Algorithms (2nd ed., 1998),
# chapter 47, tables 47.A and 47.B, truncated to terms of 0.001 degree and
# above. Referred to the mean equinox of date, then rotated to the J2000
# ecliptic by subtracting general precession in longitude (small-angle; good
# to a few arcseconds over the centuries tested). Checked against Horizons in
# test_ephemeris.py. Units of the coefficients: 1e-6 degree.

MOON_LON = (  # D, M, M', F, sin coefficient
    (0, 0, 1, 0, 6288774), (2, 0, -1, 0, 1274027), (2, 0, 0, 0, 658314),
    (0, 0, 2, 0, 213618), (0, 1, 0, 0, -185116), (0, 0, 0, 2, -114332),
    (2, 0, -2, 0, 58793), (2, -1, -1, 0, 57066), (2, 0, 1, 0, 53322),
    (2, -1, 0, 0, 45758), (0, 1, -1, 0, -40923), (1, 0, 0, 0, -34720),
    (0, 1, 1, 0, -30383), (2, 0, 0, -2, 15327), (0, 0, 1, 2, -12528),
    (0, 0, 1, -2, 10980), (4, 0, -1, 0, 10675), (0, 0, 3, 0, 10034),
    (4, 0, -2, 0, 8548), (2, 1, -1, 0, -7888), (2, 1, 0, 0, -6766),
    (1, 0, -1, 0, -5163), (1, 1, 0, 0, 4987), (2, -1, 1, 0, 4036),
    (2, 0, 2, 0, 3994), (4, 0, 0, 0, 3861), (2, 0, -3, 0, 3665),
    (0, 1, -2, 0, -2689), (2, 0, -1, 2, -2602), (2, -1, -2, 0, 2390),
    (1, 0, 1, 0, -2348), (2, -2, 0, 0, 2236), (0, 1, 2, 0, -2120),
    (0, 2, 0, 0, -2069), (2, -2, -1, 0, 2048), (2, 0, 1, -2, -1773),
    (2, 0, 0, 2, -1595), (4, -1, -1, 0, 1215), (0, 0, 2, 2, -1110),
)

MOON_LAT = (  # D, M, M', F, sin coefficient
    (0, 0, 0, 1, 5128122), (0, 0, 1, 1, 280602), (0, 0, 1, -1, 277693),
    (2, 0, 0, -1, 173237), (2, 0, -1, 1, 55413), (2, 0, -1, -1, 46271),
    (2, 0, 0, 1, 32573), (0, 0, 2, 1, 17198), (2, 0, 1, -1, 9266),
    (0, 0, 2, -1, 8822), (2, -1, 0, -1, 8216), (2, 0, -2, -1, 4324),
    (2, 0, 1, 1, 4200), (2, 1, 0, -1, -3359), (2, -1, -1, 1, 2463),
    (2, -1, 0, 1, 2211), (2, -1, -1, -1, 2065), (0, 1, -1, -1, -1870),
    (4, 0, -1, -1, 1828), (0, 1, 0, 1, -1794), (0, 0, 0, 3, -1749),
    (0, 1, -1, 1, -1565), (1, 0, 0, 1, -1491), (0, 1, 1, 1, -1475),
    (0, 1, 1, -1, -1410), (0, 1, 0, -1, -1344), (1, 0, 0, -1, -1335),
    (0, 0, 3, 1, 1107),
)

PRECESSION_DEG_PER_CY = 5028.796195 / 3600.0   # IAU 2006 general precession in longitude


def moon_mean_longitude_j2000(jd: float) -> float:
    """Mean longitude of the Moon (degrees, unwrapped), fixed J2000 frame, no T^2 terms.

    This is what a uniformly geared Moon shows: Meeus's constant and linear rate,
    less precession. The T^2 and higher terms of the true mean longitude (the
    tidal slowing of the Moon) are exactly what gears cannot represent.
    """
    T = centuries(jd)
    return 218.3164477 + (481267.88123421 - PRECESSION_DEG_PER_CY) * T


def moon_lon_lat(jd: float) -> tuple[float, float]:
    """True geocentric ecliptic longitude and latitude of the Moon, J2000 frame, degrees."""
    T = centuries(jd)
    Lp = 218.3164477 + 481267.88123421 * T - 0.0015786 * T**2 + T**3 / 538841 - T**4 / 65194000
    D = 297.8501921 + 445267.1114034 * T - 0.0018819 * T**2 + T**3 / 545868 - T**4 / 113065000
    M = 357.5291092 + 35999.0502909 * T - 0.0001536 * T**2 + T**3 / 24490000
    Mp = 134.9633964 + 477198.8675055 * T + 0.0087414 * T**2 + T**3 / 69699 - T**4 / 14712000
    F = 93.2720950 + 483202.0175233 * T - 0.0036539 * T**2 - T**3 / 3526000 + T**4 / 863310000
    A1 = 119.75 + 131.849 * T
    A2 = 53.09 + 479264.290 * T
    A3 = 313.45 + 481266.484 * T
    E = 1.0 - 0.002516 * T - 0.0000074 * T**2
    r = math.radians
    sl = sb = 0.0
    for d, m, mp, f, c in MOON_LON:
        sl += c * E ** abs(m) * math.sin(r(d * D + m * M + mp * Mp + f * F))
    for d, m, mp, f, c in MOON_LAT:
        sb += c * E ** abs(m) * math.sin(r(d * D + m * M + mp * Mp + f * F))
    sl += 3958 * math.sin(r(A1)) + 1962 * math.sin(r(Lp - F)) + 318 * math.sin(r(A2))
    sb += (-2235 * math.sin(r(Lp)) + 382 * math.sin(r(A3)) + 175 * math.sin(r(A1 - F))
           + 175 * math.sin(r(A1 + F)) + 127 * math.sin(r(Lp - Mp)) - 115 * math.sin(r(Lp + Mp)))
    lon = Lp + sl / 1e6 - PRECESSION_DEG_PER_CY * T
    return lon % 360.0, sb / 1e6
