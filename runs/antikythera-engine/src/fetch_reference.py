#!/usr/bin/env python3
"""Fetch the ground truth the orrery is checked against, from JPL Horizons.

    python3 src/fetch_reference.py        # writes data/horizons_*.csv

Horizons (https://ssd.jpl.nasa.gov/horizons/) is JPL's online ephemeris
service; with these settings it serves DE441 positions. This script was run
once during the session and its output is committed, so the tests need no
network. It is kept so the data can be re-derived and audited.

Planets: heliocentric (Sun body centre), geometric, mean ecliptic and equinox
of J2000, every 7305 days (20 Julian years) from 3000 BC to AD 3000, the
interval over which Standish's approximate elements are fitted.
Moon: geocentric, same frame, every 97 days from AD 1800 to 2200.
"""

from __future__ import annotations

import csv
import math
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
DATA = HERE.parent / "data"
API = "https://ssd.jpl.nasa.gov/api/horizons.api"

# Horizons IDs. Standish's elements are for the Earth-Moon barycentre (3) and,
# for the giant planets, the planet-system barycentres.
PLANETS = {"mercury": "199", "venus": "299", "emb": "3", "mars": "4",
           "jupiter": "5", "saturn": "6", "uranus": "7", "neptune": "8"}

JD_START = 625673.5     # 3000 BC (astronomical year -2999) Jan 1, Julian calendar
JD_STOP = 2817152.5     # AD 3000 Jan 1, Gregorian


def horizons(command: str, center: str, start: str, stop: str, step: str) -> list[tuple[float, float, float, float]]:
    params = {
        "format": "text", "COMMAND": f"'{command}'", "EPHEM_TYPE": "'VECTORS'",
        "CENTER": f"'{center}'", "START_TIME": f"'{start}'", "STOP_TIME": f"'{stop}'",
        "STEP_SIZE": f"'{step}'", "OUT_UNITS": "'AU-D'", "REF_PLANE": "'ECLIPTIC'",
        "REF_SYSTEM": "'ICRF'", "VEC_TABLE": "'1'", "VEC_CORR": "'NONE'", "CSV_FORMAT": "'YES'",
    }
    url = API + "?" + urllib.parse.urlencode(params)
    for attempt in range(4):
        try:
            with urllib.request.urlopen(url, timeout=60) as r:
                text = r.read().decode()
            break
        except OSError:
            if attempt == 3:
                raise
            time.sleep(2 ** (attempt + 1))
    if "$$SOE" not in text:
        raise RuntimeError(f"Horizons returned no ephemeris for {command}:\n{text[:2000]}")
    body = text.split("$$SOE")[1].split("$$EOE")[0]
    rows = []
    for line in body.strip().splitlines():
        f = [x.strip() for x in line.split(",")]
        rows.append((float(f[0]), float(f[2]), float(f[3]), float(f[4])))
    return rows


def spherical(x: float, y: float, z: float) -> tuple[float, float, float]:
    r = math.sqrt(x * x + y * y + z * z)
    lon = math.degrees(math.atan2(y, x)) % 360.0
    lat = math.degrees(math.asin(z / r))
    return lon, lat, r


def write(path: Path, header: str, rows: list[list]):
    with open(path, "w", newline="") as f:
        f.write(header)
        w = csv.writer(f, lineterminator="\n")
        w.writerow(["body", "jd_tdb", "lon_deg", "lat_deg", "r_au"])
        w.writerows(rows)


def main() -> int:
    DATA.mkdir(exist_ok=True)
    rows = []
    for name, cmd in PLANETS.items():
        got = horizons(cmd, "500@10", f"JD {JD_START}", f"JD {JD_STOP}", "7305d")
        print(f"{name}: {len(got)} rows", file=sys.stderr)
        for jd, x, y, z in got:
            lon, lat, r = spherical(x, y, z)
            rows.append([name, f"{jd:.1f}", f"{lon:.7f}", f"{lat:.7f}", f"{r:.9f}"])
    write(DATA / "horizons_planets.csv",
          "# JPL Horizons (DE441) heliocentric geometric positions, mean ecliptic and equinox J2000.\n"
          "# Fetched by src/fetch_reference.py; every 7305 d from JD 625673.5 (3000 BC) to 2817152.5 (AD 3000).\n",
          rows)
    got = horizons("301", "500@399", "JD 2378496.5", "JD 2524593.5", "97d")
    print(f"moon: {len(got)} rows", file=sys.stderr)
    rows = []
    for jd, x, y, z in got:
        lon, lat, r = spherical(x, y, z)
        rows.append(["moon", f"{jd:.1f}", f"{lon:.7f}", f"{lat:.7f}", f"{r:.9f}"])
    write(DATA / "horizons_moon.csv",
          "# JPL Horizons (DE441) geocentric geometric Moon, mean ecliptic and equinox J2000.\n"
          "# Fetched by src/fetch_reference.py; every 97 d from JD 2378496.5 (AD 1800) to 2524593.5 (AD 2200).\n",
          rows)
    return 0


if __name__ == "__main__":
    sys.exit(main())
