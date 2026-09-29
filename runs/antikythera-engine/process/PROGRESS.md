# Progress log

Times in UTC, 2026-09-29, anchored to commit times where I have them.
Snapshots referenced here are in `snapshots/`, numbered in the order they were
made.

## 1. Survey and proposal (18:55 to about 19:05)

Read the collection (ten runs, RUNS.md, the three long-horizon briefs) and
proposed seven ideas. The gap I pointed to: nothing in the collection can be
*wrong* in a checkable way. The human picked the orrery and asked for a better
branch name: `claude/tender-pasteur-rajemm` became `claude/antikythera-engine`
(the old name had never been pushed, so there was nothing to delete remotely).

## 2. Ground truth first (19:10 to 19:18)

Before designing anything I wanted the thing the brass will be judged against.

- JPL Horizons answers through the session proxy. `src/fetch_reference.py`
  pulled DE441 heliocentric positions (mean ecliptic and equinox J2000) for the
  eight bodies Standish fits (Mercury, Venus, Earth-Moon barycentre, Mars, and
  the four giant-planet system barycentres) every 20 years from 3000 BC to AD
  3000, 300 rows each, plus the geocentric Moon every 97 days, AD 1800 to 2200.
  Committed as `data/*.csv` (197 kB) so the tests need no network.
- The old `txt/p_elem_t2.txt` URL for Standish's elements now returns a 404
  page. The current page, `planets/approx_pos.html`, carries Tables 2a/2b and
  the error table as HTML. I transcribed Table 2a/2b into `src/ephemeris.py`
  and checked the transcription the only way that matters, against Horizons:

  | body | max error | RMS | JPL nominal |
  | :-- | --: | --: | --: |
  | Mercury | 30″ | 10″ | 20″ |
  | Venus | 46″ | 18″ | 40″ |
  | EM barycentre | 65″ | 21″ | 40″ |
  | Mars | 149″ | 54″ | 100″ |
  | Jupiter | 777″ | 290″ | 600″ |
  | Saturn | 1309″ | 609″ | 1000″ |
  | Uranus | 1429″ | 685″ | 2000″ |
  | Neptune | 591″ | 213″ | 400″ |

  RMS is inside JPL's nominal figure for every body; the worst single sample
  (Saturn, 22′) is 1.3 times nominal, so "nominal" reads as typical, not
  maximum. The test encodes exactly that: RMS ≤ nominal, max ≤ 2 × nominal.
  A typo in any element would miss by orders of magnitude.

## 3. How good can integer teeth be? (19:18 to 19:30)

First probe, with no physical constraints (teeth 12 to 160, any pairing):
two compound stages already match every period to about 1e-7, three stages to
1e-9, far beyond the ephemeris. So accuracy is not the problem; building it is.

Architecture chosen: the reverted layout clockmakers use for motion work.
Four parallel axes in a line: the centre C (nested planet tubes), two *dead*
arbors N and M carrying loose compound pipes, and the live driving arbor L,
which the crank turns once per sidereal year. Because the axes are fixed, each
meshing pair's tooth sum is fixed by its module and the axis spacing. Measured
costs, before settling the rules:

- Two meshes (L → M → C) are hopeless: tens of degrees per century.
- Three meshes, 48 mm spacing, ISO modules: Saturn and Neptune fine; Mercury,
  Venus and the Moon near 0.5 °/century.
- Direction. Each mesh reverses rotation, so every train needs the same
  parity. A train may bounce between the dead arbors (L → M → N → M → N → C),
  which gives any odd number of meshes on the same four axes.

The design rule I adopted: **no train may drift from the true mean motion by
more than 0.1° per century (1° per thousand years); among trains that meet it,
the fewest meshes, then the fewest teeth** (coarse teeth are what a builder
wants, and with fixed centres fewer teeth means a coarser module, not a
smaller wheel).

Constraints enforced in the search, then re-checked independently by
`test_design.py`: pitch radii of every pair sum to the axis spacing; ISO 54
modules 0.8, 1, 1.5 and 2 mm (1.25 gives a non-integer tooth sum at 48 mm and
drops out); 25° involute teeth, at least 12; every root clears its bore; a
wheel on N must clear the column of tubes at C, whose radius depends on the
level. The first search was a pure-Python meet-in-the-middle and blew up on
five-mesh trains (12 million heads); NumPy made it exhaustive in about ten
seconds. I also relaxed one rule I had set too hard: pinions are cut on their
arbor, as clockmakers cut pinion leaves, so a pinion's root only has to clear
the arbor, not a separate hub.

Result: 70 wheels, 2,472 teeth, 35 mesh levels.

| body | meshes | ratio (turns per year) | drift | 1° every |
| :-- | --: | :-- | --: | --: |
| Mercury | 5 | 797181/191995 | +0.052 °/cy | 1,919 yr |
| Venus | 5 | 83391/51301 | +0.025 °/cy | 4,069 yr |
| Moon | 5 | 1417475/106029 | +0.069 °/cy | 1,460 yr |
| Earth | 3 | 1/1 | 0 | exact |
| Mars | 3 | 495/931 | +0.076 °/cy | 1,312 yr |
| Jupiter | 3 | 2491/29547 | +0.072 °/cy | 1,382 yr |
| Saturn | 3 | 875/25773 | +0.073 °/cy | 1,369 yr |
| Uranus | 3 | 3185/267607 | −0.038 °/cy | 2,600 yr |
| Neptune | 5 | 105/17303 | −0.010 °/cy | 10,277 yr |

Neptune needed five meshes although an unconstrained three-mesh train exists:
its level is the highest, where the column of tubes is widest, and every
three-mesh candidate put a wheel on N into the Earth's tube. The collision
check caught a hand-made version of exactly that (0.05 mm gap) when I mutated
the design to make sure the test could fail.

The Moon's continued fraction, 13.36875 sidereal months per sidereal year,
runs 13, 27/2, 40/3, 107/8, **254/19**, 2139/160, ... 254/19 is the ratio the
Antikythera mechanism's builders geared (their famous 127-tooth wheel is half
of 254). It drifts 11.7° per century against the modern mean motion; the train
the search found drifts 0.07°.

## 4. The Moon's truth and the Moon's transfer (19:30 to 19:35)

The Moon needed its own ground truth. I wrote the principal ELP-2000/82 terms
from Meeus (ch. 47) into `ephemeris.py` from memory and checked them against
the Horizons Moon: RMS 7″, worst 27″ in longitude over AD 1800 to 2200 (the
latitude is about an arcminute off, because it stays on the ecliptic of date;
only longitude is compared). A wrong coefficient would have shown up as tens
of arcseconds at a characteristic period; nothing did.

Getting the Moon's motion out to the Earth: the Moon's tube (inside the
Earth's) ends just above the Earth arm and carries a 21-tooth wheel. Three 38
idlers ride the arm and drive another 21 at the Earth. Equal end wheels and an
even number of meshes make it exactly 1:1 in the arm's frame, so the Moon's arm
at the Earth turns exactly as the Moon's tube. 10.5 + 3 × 38 + 10.5 = 135 mm,
the Earth arm's length.

## 5. The page (19:35 to 19:47)

One HTML file, no dependencies, WebGL 2. Everything the page draws comes from
`data/design.json`, embedded by `src/embed.py`; the page never picks a tooth.

- Wheels are true 25° involute outlines generated per tooth count and module,
  extruded, spoked when there is room. Each wheel's tooth phase is solved from
  its mesh so the teeth interlock; its rate is the product of the train's
  ratios (anticlockwise positive), so the tube angle is exactly the train's
  fraction times the crank turns.
- Materials are a small PBR shader lit by an analytic studio (soft boxes as
  functions of direction) plus one shadowed key light. Finishes are procedural:
  circular graining on wheel faces, perlage on the plates, straight brushing on
  the arms, a lacquered walnut plinth, a zodiac ring engraved from a canvas
  texture.
- The ledger compares brass and sky for every body, and splits the gear part
  (drift × centuries) from the rest.
- `verify.mjs` checks, in headless Chromium, that the JavaScript ephemeris
  agrees with the Python one (worst 1e-13°) and that every brass angle agrees
  with exact rational arithmetic on the tooth counts (worst 1e-9°) at nine
  dates from 3000 BC to AD 3000; that the 70 wheels on stage are exactly the
  design's; that the calendar handles the 1582 switch; that the canvas is not
  blank; and that the cut sheets are an SVG with every wheel.

First light (snapshot 01): it rendered on the first attempt after one GLSL
fix (`half` is a reserved word), and the numbers were physically plausible at
once: Mars −10.3°, Jupiter −5.0°, Saturn +6.3°, all inside the size of their
equations of centre. But the brass was brown-black: a metal only shows what it
reflects, and my studio was too dark. The zodiac lettering was mirrored.

## 6. Looking hard at it (19:47 to 19:52)

- Brighter room, larger soft boxes (02). The movement close-up (03) now reads
  as a skeleton tower of wheels.
- The crank was assembled with a design-space matrix applied in world space:
  the shaft pointed the wrong way (05). Rebuilt with explicit world rotations;
  the bevel pair, shaft, bearing standards and ebony grip now sit where they
  should (06).
- The "true sky" markers were glass spheres that swallowed a planet whenever
  brass and sky nearly agreed (Venus at +0.5°, 04). They are now thin rings of
  light lying level around the true position (06).
- Focusing a train was supposed to dim every other wheel; it did, but only in
  the base colour, and ACES tone mapping flattened the difference. Dimming now
  scales the final colour, and the tone map works on luminance and keeps hue,
  so a highlight on brass stays gold instead of bleaching to white (07).
EOF
