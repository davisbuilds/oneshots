#!/usr/bin/env python3
"""Check src/ephemeris.py against JPL Horizons (DE441), committed in data/.

    python3 src/test_ephemeris.py

For every body, over 3000 BC to AD 3000: the RMS heliocentric-longitude error
must be within JPL's nominal error for the approximation, and the worst single
sample within twice it.
"""

from __future__ import annotations

import csv
import math
import sys
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import ephemeris as eph  # noqa: E402


def rows(name: str):
    with open(HERE.parent / "data" / name) as f:
        yield from csv.DictReader(line for line in f if not line.startswith("#"))


class Ephemeris(unittest.TestCase):
    def test_against_horizons(self):
        errs: dict[str, list[float]] = {}
        for r in rows("horizons_planets.csv"):
            d = eph.wrap180(eph.longitude(r["body"], float(r["jd_tdb"])) - float(r["lon_deg"])) * 3600
            errs.setdefault(r["body"], []).append(d)
        self.assertEqual(set(errs), set(eph.BODIES))
        for body, e in errs.items():
            rms = math.sqrt(sum(x * x for x in e) / len(e))
            worst = max(abs(x) for x in e)
            nominal = eph.NOMINAL_ERROR_ARCSEC[body]
            with self.subTest(body=body, rms=round(rms, 1), worst=round(worst, 1)):
                self.assertEqual(len(e), 300)
                self.assertLessEqual(rms, nominal)
                self.assertLessEqual(worst, 2 * nominal)

    def test_moon_against_horizons(self):
        el, eb = [], []
        for r in rows("horizons_moon.csv"):
            lon, lat = eph.moon_lon_lat(float(r["jd_tdb"]))
            el.append(eph.wrap180(lon - float(r["lon_deg"])) * 3600)
            eb.append((lat - float(r["lat_deg"])) * 3600)
        rms = lambda e: math.sqrt(sum(x * x for x in e) / len(e))
        self.assertGreater(len(el), 1500)
        # 39 principal terms: arcseconds in longitude, about an arcminute in latitude
        # (latitude is referred to the ecliptic of date, not rotated to J2000).
        self.assertLess(rms(el), 15)
        self.assertLess(max(map(abs, el)), 60)
        self.assertLess(rms(eb), 60)

    def test_periods(self):
        # Sidereal periods implied by the mean-longitude rates, against the
        # familiar values (days) to the precision they are usually quoted.
        known = {"mercury": 87.969, "venus": 224.701, "emb": 365.256, "mars": 686.980,
                 "jupiter": 4332.59, "saturn": 10759.2, "uranus": 30686.5, "neptune": 60188.1}
        for body, p in known.items():
            self.assertAlmostEqual(eph.sidereal_period_days(body), p, delta=p * 2e-5)


if __name__ == "__main__":
    unittest.main(verbosity=2)
