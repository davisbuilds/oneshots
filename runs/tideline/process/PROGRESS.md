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

## 3. First light (04:55 to 05:10, then a pause)

- `src/gl.js`, `src/render.js`, `src/models.js`: WebGL2, everything drawn as
  instances of four tiny meshes (box, prism, cylinder, faceted ball) with a
  per-instance matrix and a material code; hulls meshed from the same hull
  form the stability model integrates; ground markings painted analytically
  in a shader; cut-paper water; a 4096 shadow map with 3x3 PCF.
- The run was interrupted from about 05:10 to 07:41 UTC (the human's usage
  limit); work resumed where it stopped, with no change of direction.
- **Snapshot 01** (first frame): the pipeline works, but the paper is
  overexposed to white, the camera shows the whole terminal so the ship is a
  sliver, and the water is small blotches rather than long strips. Rebalanced
  the light so a fully lit top face equals its paper colour (sky 0.56 +
  sun 0.66 x 0.72), stretched the water noise along the quay, moved in.
  **Snapshot 02**: reads as a paper diorama for the first time.

## 4. The console (07:41 to 07:55)

- `index.html` (tokens from the art bible), `src/icons.js` (every icon is
  path data written in code; the logo is painted on a canvas), `src/ui.js`
  (top bar, rail, KPI cards with context lines, callouts with leader lines,
  camera, picking, search, toasts), `src/panel.js` (vessel, yard, equipment,
  gate), `src/schedule.js` (berth schedule).
- Player actions in the simulation, each with a reason when refused:
  `replan` (drag a planned box), `moveCall` (berth schedule: quay length,
  water under the keel at the deeper of arrival and departure drafts, later
  calls pushed back), `assignCrane` (cranes share a rail and cannot pass).
- **Snapshot 03, wrong:** the stowage canvases shrank on every redraw (I
  read the canvas's own height attribute back as the design height); the
  crane KPI read 5.8 moves/hr because the history began when the page
  opened; the projected ETD was two days out for the same reason; the heel
  sat at exactly 0.00 because the anti-heel model levelled perfectly every
  second. Fixed: a fixed design height; the shift's earlier moves are
  backfilled across the time each ship has been alongside, and the warm
  start does only as many moves as its cranes could have made in that time;
  the ETD blends the last hour with the planning norm; the anti-heel pumps
  now start at 0.35 deg and stop near upright, as real systems do, so the
  ship rocks slightly as boxes land.
- **Wrong (mid-call plans):** once loading had started, the plan functions
  counted loaded boxes twice (once as "remaining on board", once as planned).
  Remaining-on-board is now "not for this port and not loaded here".

## 5. The checker (07:55 to 08:05)

`tools/check.js` reruns the terminal headless over many seeds, optionally
with random player actions (re-plans, schedule moves, crane reassignments
every ten minutes), and judges it from what the vehicles actually drove: all
carriers and trucks rebuilt as real rectangles every 0.25 s and tested
pairwise (separating axes), carriers against crane legs, and carriers under
any spreader below carrier height. It found real faults:

1. **Spreaders crossed the apron at 12 m**, below the 15.3 m straddle
   carriers. The trolley now travels with the spreader (and its box) at
   16.8 m or more over the apron.
2. **An idle crane left its spreader on the ground** until its next cycle,
   and a carrier drove under it. Every cycle now ends with an empty climb to
   park height; one function evaluates the spreader for the sim, the
   renderer and the checker.
3. The spreader's reservation of the buffer lane was shorter than the time
   it actually spends below carrier height; widened to 16 s before and 24 s
   after touchdown.
4. With random actions over 14 hours, **no ship finished and cranes idled
   for up to five hours**: a reassigned crane re-picked its bay while export
   boxes already sat in its buffers for the old one; cranes waited for ever
   behind an idle neighbour on the rail; a ship stripped of its cranes was
   never worked again. A crane's bay is now locked while boxes are inbound,
   idle cranes yield along the rail, and an idle crane is assigned to any
   ship alongside that has none.
5. The feeder drifted past 2 m of trim during discharge: added trim
   ballasting between the peak tanks (300 t/h), and larger peak tanks.

Two things the checker reported were not faults, and I changed the checker
rather than the sim, narrowly: a carrier straddling a trailer is allowed
only while the truck stands still in its dock pose and the carrier is lined
up over that bay; a spreader may be low over a carrier only if that carrier
is taking or delivering the very box (this cycle's or the one just let go).

Result: **6 seeds x 14 h with random actions, all clean**: 9,667 crane
moves, 17,730 carrier jobs, 4,046 truck visits, 453 million pair tests,
0 overlaps, 0 planner fallbacks, heel never above 0.47 deg, GM never below
1.66 m; departures checked against limits as they sail.

## 6. Demo tour, lettering, checkpoint against the references (08:05 to 08:10)

- `src/demo.js`: six shots in 45 s, chosen from the live simulation when a
  shot begins (the carrier that will be waiting when a box lands), so a
  frame-by-frame render is deterministic. `tools/film.mjs` renders it.
- `src/decals.js`: one atlas of lettering painted in code (ship names, crane
  and carrier numbers, block letters, berth numbers, bay numbers).
- **Checkpoint, snapshots 05 (beside Nexus Port and HarborView):**
  - Information architecture matches HarborView: rail, KPI cards with a
    context line, callouts with status chips, tabbed vessel panel, a berth
    schedule with dates, now line and TEU. Better than the reference where
    it was wrong: one axis, one berth per call, moves/hr, limits on gauges.
  - Art direction falls short of Nexus Port: ours is a wide, busy view of
    the whole yard where Nexus is a close diorama of one berth; our water is
    darker and finer-grained; our containers more saturated (mustard
    dominated the yard); cranes thinner than its chunky ones.
  - Changed: softer container palette (and the Alder line's boxes sage, not
    mustard), lighter teal water layers with crisper cut edges and pale torn
    strips, cranes about 1.3x thicker, two cells of gap between yard blocks,
    and a closer default camera on the working ship. **Snapshot 06** and
    `06-compare-nexus-port.webp`: much closer in mood and scale. Still
    behind the reference: its water shapes are bolder, and its ground is
    calmer (fewer markings).

## 7. Verification, tests, polish (08:10 to 08:30)

- `verify.mjs` drives the page with real pointer events. **Wrong, found by
  it:** crane pins could sit under the KPI cards and could not be clicked;
  callouts now live below the cards. The screenshot step also hung
  intermittently: stepping 120 frames inside one call queued 120 full
  renders on the software GPU. Tests now advance time without drawing and
  draw the last frame only.
- Unit tests (16): hydrostatics against the box barge, free intervals,
  well-formedness, planned carriers never sharing an instant, a plan from a
  pocket existing even when the exit is blocked for 500 s, stowage refusals
  naming their rule, an accepted re-plan moving G by exactly the box's
  moment, determinism, crane cycle time, an hour of operation, every
  generated plan legal. **Two real bugs they caught:** the auto planner
  checked the bridge's line of sight at arrival drafts, not departure drafts
  (now re-checked and the offending boxes shut out); arrival stacks could
  exceed their 100 t lashing limit.
- **Close-up angle.** From the water side the line of sight to the apron
  always crosses the ship's deck stacks or the crane's upper works
  (`studies/` keeps none of these trials; four were tried). From the land
  side it passes between the crane's landside legs, under its portal beam
  and machinery house: the carrier waiting with its spreader up, the box
  coming down, the ship's hull behind. The tour's close shots use that angle
  and fade the panels away; the camera's azimuth and elevation now blend
  between shots like position and zoom.
- Idle cranes raise their booms (about 80°) and lower them over a minute and
  a half when they get a ship; forestays follow the boom. Tugs push ships
  that are berthing or sailing.
- After an accepted re-plan, a callout marks where that box waits in the
  yard and follows it to the crane: the consequence of a drag is visible in
  the yard, not only in the stability readout.
- The profile became a cutaway (paper hull, navy outline, a thin antifouling
  band): the red hull bottom had been the same terracotta as the high-cube
  boxes drawn over it. The bay section draws its coaming and hatch cover, or
  "hatch open" while a crane works the hold.
