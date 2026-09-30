#!/usr/bin/env python3
"""Independent checks of data/design.json, the machine the page renders.

    python3 src/test_design.py

Nothing here trusts the search in design.py: ratios are recomputed from tooth
counts, centre distances from modules, and every wheel is tested against every
arbor, pipe and tube that passes through its level.
"""

from __future__ import annotations

import json
import math
import sys
import unittest
from fractions import Fraction
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import ephemeris as eph  # noqa: E402

D = json.loads((HERE.parent / "data" / "design.json").read_text())
AX = D["axes"]
RAD = D["radii"]
FACE = D["rules"]["face_mm"]


def dist(a: str, b: str) -> float:
    return math.dist(AX[a], AX[b])


def tip(m, z):
    return m * (z / 2 + 1)


def root(m, z):
    return m * (z / 2 - 1.25)


class Design(unittest.TestCase):
    def test_every_body_has_a_train(self):
        self.assertEqual([t["body"] for t in D["trains"]],
                         ["mercury", "venus", "moon", "emb", "mars", "jupiter", "saturn", "uranus", "neptune"])

    def test_ratios_are_what_the_teeth_say(self):
        for t in D["trains"]:
            r = Fraction(1)
            for m in t["meshes"]:
                r *= Fraction(m["drv"], m["drn"])
            self.assertEqual(r, Fraction(*t["ratio"]), t["body"])

    def test_drift_rule(self):
        rate = D["rate_deg_per_century"]
        for t in D["trains"]:
            drift = (t["ratio"][0] / t["ratio"][1] - rate[t["body"]] / rate["emb"]) * rate["emb"]
            self.assertAlmostEqual(drift, t["drift_deg_per_century"], places=9)
            self.assertLessEqual(abs(drift), D["rules"]["max_drift_deg_per_century"], t["body"])

    def test_rates_match_ephemeris(self):
        for b in eph.BODIES:
            self.assertEqual(D["rate_deg_per_century"][b], eph.TABLE_2A[b][1][3])

    def test_path_and_direction(self):
        # Every train runs L -> ... -> C through alternating dead arbors, and an
        # odd number of meshes turns every arm opposite to L (anticlockwise).
        for t in D["trains"]:
            ms = t["meshes"]
            self.assertEqual(ms[0]["src"], "L")
            self.assertEqual(ms[-1]["dst"], "C")
            for a, b in zip(ms, ms[1:]):
                self.assertEqual(a["dst"], b["src"])
            self.assertEqual(len(ms) % 2, 1, t["body"])
            for m in ms:
                self.assertIn(m["src"] + m["dst"], ("LM", "MN", "NM", "NC"))

    def test_centre_distances_and_modules(self):
        for t in D["trains"]:
            for m in t["meshes"]:
                self.assertIn(m["m"], D["rules"]["modules"])
                self.assertGreaterEqual(min(m["drv"], m["drn"]), D["rules"]["min_teeth"])
                self.assertAlmostEqual(m["m"] * (m["drv"] + m["drn"]) / 2, dist(m["src"], m["dst"]), places=9)

    def test_one_mesh_per_level(self):
        levels = [m["level"] for t in D["trains"] for m in t["meshes"]]
        self.assertEqual(sorted(levels), list(range(D["levels"]["count"])))

    def solids_at(self, level: int):
        """Everything standing at a level, as (axis, radius, owner)."""
        z = D["levels"]["z"][level]
        out = [("L", RAD["l_arbor"], "L"), ("M", RAD["dead_arbor"], "M"), ("N", RAD["dead_arbor"], "N")]
        for t in D["trains"]:
            ms = t["meshes"]
            # pipes: between consecutive meshes on the dead arbor they share
            for a, b in zip(ms, ms[1:]):
                lo, hi = sorted((a["level"], b["level"]))
                if lo <= level <= hi:
                    out.append((a["dst"], RAD["pipe"], f"pipe:{t['body']}:{a['level']}"))
        for tube in D["tubes"]:
            if tube["z0"] - 1e-9 <= z <= tube["z1"]:
                out.append(("C", tube["r_out"], f"tube:{tube['body']}"))
        out.append(("C", RAD["sun_rod"], "sun"))
        return out

    def test_no_collisions(self):
        checked = 0
        for t in D["trains"]:
            ms = t["meshes"]
            for k, m in enumerate(ms):
                lv = m["level"]
                wheels = [(m["src"], m["drv"], "drv"), (m["dst"], m["drn"], "drn")]
                for axis, z, role in wheels:
                    # what this wheel is fastened to
                    if axis == "C":
                        own = f"tube:{t['body']}"
                    elif axis == "L":
                        own = "L"
                    else:
                        own = f"pipe:{t['body']}:{ms[k - 1]['level'] if role == 'drn' else ms[k - 1]['level']}"
                    # its root must clear its own bore
                    bore = {"L": RAD["l_arbor"], "M": RAD["pipe"], "N": RAD["pipe"]}.get(axis)
                    if axis == "C":
                        bore = next(tb["r_out"] for tb in D["tubes"] if tb["body"] == t["body"])
                    self.assertGreaterEqual(root(m["m"], z), bore - 1e-9, (t["body"], lv, axis, z))
                    partner = m["dst"] if axis == m["src"] else m["src"]
                    for ax2, r2, owner in self.solids_at(lv):
                        if ax2 == axis:
                            continue            # coaxial: the wheel's own bore, checked above
                        gap = dist(axis, ax2) - tip(m["m"], z) - r2
                        if ax2 == partner:
                            # the partner's own arbor sits inside the partner wheel
                            continue
                        checked += 1
                        self.assertGreater(gap, 0.5, (t["body"], lv, axis, z, owner, round(gap, 2)))
        self.assertGreater(checked, 100)

    def test_tubes_nest_and_arms_stack(self):
        tubes = D["tubes"]
        for inner, outer in zip(tubes, tubes[1:]):
            self.assertLess(inner["r_out"], outer["r_in"])
            self.assertLess(inner["z0"], outer["z0"])      # inner tubes reach lower
            self.assertGreater(inner["z1"], outer["z1"] - (0 if outer["body"] != "emb" else 0))
        arms = D["arms"]
        order = ["mercury", "venus", "emb", "mars", "jupiter", "saturn", "uranus", "neptune"]
        # An arm must pass under every post of an inner planet: outer arms lower.
        for a, b in zip(order, order[1:]):
            self.assertGreater(arms[a]["z"], arms[b]["z"])
            self.assertLess(arms[a]["r"], arms[b]["r"])
        self.assertGreater(min(a["z"] for a in arms.values()), D["top_plate_z"])

    def test_moon_transfer_is_one_to_one(self):
        mo = D["moon"]
        span = mo["m"] * (mo["end"] + mo["idlers"] * mo["idler"])
        self.assertAlmostEqual(span, D["arms"]["emb"]["r"])
        self.assertEqual((mo["idlers"] + 1) % 2, 0)   # even number of meshes: same sense
        emb = next(t for t in D["tubes"] if t["body"] == "emb")
        moon = next(t for t in D["tubes"] if t["body"] == "moon")
        self.assertGreater(moon["z1"], emb["z1"])

    def test_antikythera_convergent(self):
        conv = [tuple(c) for c in D["history"]["convergents"]]
        self.assertIn((254, 19), conv)


if __name__ == "__main__":
    unittest.main(verbosity=2)
