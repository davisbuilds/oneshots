# Progress log

Times in UTC, 2026-10-23. Snapshots referenced here are in `snapshots/`,
numbered in the order they were made; studies are in `studies/`.

## 1. Survey, references, art bible (04:16 to 04:40)

- Read the repository's `AGENTS.md`, `RUNS.md` and two earlier interactive runs
  (Luminal, From Gate to Game) for layout, manifest, verifier and film
  conventions. Created branch `run/tideline` from `main` and the run directory
  `runs/tideline/`.
- **The four mockups were provided by the human** with the brief (they were
  made with an image model). Saved, converted to WebP at native size, as
  `studies/01-supplied-nexus-port-art-direction.webp`,
  `02-supplied-harborview-information-architecture.webp`,
  `03-supplied-crane-closeup-motion.webp` and
  `04-supplied-vessel-panel-component.webp`. They are references, not my work.
- Read the mockups for errors beyond the ones the brief lists: HarborView's
  "Vessels at Berth 2 / 5 ... 2 in yard" (vessels are not in the yard), legend
  colours in the vessel panel that match none of its boxes, Nexus Port's
  gauges with no limits drawn, and a crane spreader in Nexus Port hanging
  from a boom with no trolley.
- Wrote [`ART-BIBLE.md`](ART-BIBLE.md): which mockup leads which aspect, a
  table of corrections, palette tokens, light, geometry, type, layout, motion
  and the demo tour. The rule that matters most: **vessel particulars are
  derived, never typed**. One hull form feeds the hydrostatics, the bay grid
  and the rendered mesh, so LOA, beam, capacity and displacement cannot
  contradict each other.

### Technical decisions before code

- **Classic scripts on one global (`TL`)**, as in the earlier runs: the page
  opens from disk, and Node loads the same simulation files for tests and the
  headless checker.
- **Stability** from first principles on a generated hull: waterplane and
  sectional integrals by Simpson's rule give displacement, KB, BM, LCB, LCF,
  TPC and MCTC per draft; trim from MCTC, list from tan(theta) = TCG / GM,
  free-surface correction for slack tanks, and IMO IS Code 2008 criteria with
  the wall-sided GZ formula. Tested against the closed-form box barge.
- **Vehicles** run on a grid of 6.5 m cells with footprints (sets of cells
  per pose) and a space-time reservation table. Plans follow Token Passing
  (Ma, Li, Kumar and Koenig, 2017): one vehicle plans at a time against
  everyone else's reserved paths, every path ends in a parking pocket that no
  route passes through (a *well-formed* infrastructure in the sense of Čáp,
  Vokřínek and Kleiner, 2015), so a plan always exists. Collision-freedom is
  by construction; the checker verifies it independently from the vehicles'
  actual rectangles, not from the reservation table.
- **WebGL2**, all geometry instanced boxes plus generated hulls; DOM for the
  UI; canvases for the stowage plan, gauges and schedule.

## 2. Simulation core (04:40 to 04:55)

- `src/hull.js`: parametric hull, hydrostatic table by Simpson's rule.
  **Checked first against a box barge**, where displacement, KB = T/2,
  BM = B²/12T, BML, LCF and MCTC are known exactly; all agree within 1%
  (`tests/hull.test.js`). A lateral shift lists the barge by
  atan(w d / W GM) and a longitudinal one trims it by w d / MCTC.
- **Wrong at first:** the generated hull came out with Cb 0.75 and Cw 0.73:
  sections too boxy, waterplane too fine. Separated the section-fullness
  range from the waterline taper and allowed hollow end sections; it now
  gives Cb 0.68, Cw 0.80 and KM 13.5 m at a 12 m draft, in the range of real
  Panamax container ships.
- `src/vessel.js`: three classes from principal dimensions only. The bay
  plan is what fits inside the hull (wing tanks, double bottom, hatch
  coaming). Derived: feeder 158.5 m, 1,088 TEU; intermediate 211.5 m,
  2,088 TEU; Panamax 294.0 x 32.2 m, 4,242 TEU, 56,900 t deadweight.
  These match real ships of those sizes, unlike the mockup's 366 m / 8,492 TEU.
- `src/stability.js`: cross curves (KN) by integrating the heeled hull;
  GZ, list, trim, free-surface correction and the IS Code 2008 criteria.
- `src/stowage.js`: arrival conditions (boxes for this port always on top,
  so no restows), ballast trimmed for GM and trim, the anti-heeling pair,
  SOLAS V/22 visibility limits on deck stacks forward of the bridge, an
  auto load planner, and the rules a re-planned box must pass.
  **Wrong at first:** cargo was too light (Panamax arrived at 8.7 m) and the
  generator ignored the visibility line; fixed weights (mean about 19 t per
  40 ft) and trimmed deck stacks to the line. Departure lists of 0.8-1.6°
  came from alternating sides blindly; the planner now balances the running
  moment, and the departure condition applies the anti-heel tanks as a
  loading computer would.
- `src/mapf.js`, `src/layout.js`: footprint-based reservation table and
  Token Passing. The first planner (space-time A*) hit its search budget on
  31% of plans in a stress test; replaced it with **SIPP** (Phillips and
  Likhachev, 2011), which searches safe intervals: 8 ms per plan, no
  fallbacks, no collisions in a geometric check of 200 plans.
- `src/crane.js`, `src/sim.js`: cranes with trapezoidal trolley and hoist
  profiles, buffers under the portal, straddle carriers, trucks through the
  gate, the yard, berth calls.
- **Bugs the first long runs exposed** (all in control logic, not paths):
  1. a crane prefetched export boxes into both buffers while two hold boxes
     still had to come off: nowhere to land them, crane and carriers waiting
     for each other for ever. A crane now keeps one buffer free while its
     bay still has discharge.
  2. a carrier tried to lift a yard box that another carrier had just
     buried. Stacks with a pending pick now take nothing new on top, a box
     has at most one pending move, and rehandles leave a stack top first.
- 8 simulated hours now run clean: about 27 moves per crane-hour, 465
  rehandles, no stability violations, about 12 ms of compute per real
  second at 60x.
