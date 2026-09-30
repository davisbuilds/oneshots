#!/usr/bin/env python3
"""Expected values for verify.mjs, computed in Python with exact arithmetic.

    python3 src/fixture.py     # prints JSON

For a spread of dates across 3000 BC - AD 3000: the true longitudes from
ephemeris.py (tested against JPL Horizons) and the brass longitudes the
machine must show, from the tooth counts in data/design.json as exact
fractions (turns of the crank since J2000 times the train's rational ratio).
"""

from __future__ import annotations

import json
import sys
from fractions import Fraction
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import ephemeris as eph  # noqa: E402

D = json.loads((HERE.parent / "data" / "design.json").read_text())
BODIES = [t["body"] for t in D["trains"]]
JDS = [625673.5, 1000000.25, 1721423.5, 2299160.5, 2415020.0, 2451545.0, 2461313.5, 2500000.75, 2817152.5]


def brass(body: str, jd: float) -> float:
    t = next(t for t in D["trains"] if t["body"] == body)
    turns = (Fraction(jd) - Fraction(D["epoch_jd"])) / Fraction(D["sidereal_year_days"])
    rot = turns * Fraction(*t["ratio"])
    frac = rot - (rot.numerator // rot.denominator)
    return float((Fraction(D["j2000_mean_longitude"][body]) + 360 * frac) % 360)


def truth(body: str, jd: float) -> float:
    return eph.moon_lon_lat(jd)[0] if body == "moon" else eph.longitude(body, jd)


if __name__ == "__main__":
    out = [{"jd": jd, "body": b, "brass": brass(b, jd), "true": truth(b, jd)} for jd in JDS for b in BODIES]
    print(json.dumps(out))
