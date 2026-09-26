# Progress log

Times in UTC, 2026-09-26. During the run the log was kept without times; the
times below are reconstructed from commit times and file modification times
(render outputs, frames, data) and are accurate to a few minutes. Snapshots
referenced here are in `snapshots/`, numbered in the order they were made.

## 1. Environment (13:01–13:04)

Inspected the container before choosing a pipeline: Python 3.11 with no
scientific packages, 4 CPU cores, 15 GB RAM, no GPU, no Blender, no FFmpeg.
Installed numpy, scipy, numba, Pillow and matplotlib with pip; the `bpy` 5.0.1
wheel (Blender as a Python module, 374 MB); FFmpeg 6.1 from apt (the first
attempt failed on stale package indexes; `apt-get update` fixed it). A smoke
test rendered a sphere with Cycles on CPU (480×270, 32 spp, 1.5 s). Eevee
failed (no OpenGL/EGL), so every Blender render is Cycles.

## 2. Trajectory (13:04–13:06) — `snapshots/001_segment_study`

Integrated with DOP853 at rtol = atol = 1e-12 on [0, 120], sampled Δt = 0.001.
Cross-checks showed a limit I had not planned for: LSODA at 1e-10 departs by
a whole unit at t ≈ 27.4, and DOP853 at 1e-13 departs from the 1e-12 solution
by 1e-6 at t ≈ 20.6 and by 1e-3 at t ≈ 27.4. So the segment had to end by
about t = 27 to be the orbit from (1, 1, 1) rather than a shadow of it.

x(t) showed the orbit settling on the left wing within t < 1, spiralling
slowly outward until t ≈ 13, then switching wings chaotically. Compared four
windows from four viewpoints (`studies/segment_candidates`) and chose
**t ∈ [8, 27]**: it opens in the eye of the spiral (order) and breaks into
switching (chaos). Wrote `data/lorenz_canonical.*`.

## 3. Copper studies (13:06–13:19) — `snapshots/002`, `003`

- s01 (960×540, 32 spp, 18 s): pipeline worked; camera too close, plinth out
  of frame, copper pinkish, hammer-mark bump made the wire look wobbly.
- s02 four azimuths (`002_copper_angle_studies`): −45° folds the wings into a
  V (later the film's opening); around −20° the butterfly opens with depth.
- s03–s05: the plinth rendered pale grey whatever its colour. Probes (specular
  off / key off) located two causes: a Blender 5 Mix node exposes float, vector
  and colour sockets all named "A"/"B", and my link had gone to the float one;
  and grazing-angle Fresnel made the stone mirror the lit wall. Fixed the socket
  lookup and cut the stone's specular to a honed 0.12.
- s06–s08 (1080p, 24–32 spp, 54–68 s per frame): moved the key light nearly
  overhead so the filament draws its own x–y shadow on the plinth
  (`003_copper_canonical_view`), lowered copper roughness for crisp highlights,
  darkened the stone. Solved for camera K (az −20°, el 6°, 50 mm) with the curve
  top 7.5 % below the frame edge and the plinth's front edge at the bottom.

## 4. Matter act render launched (13:19) — `snapshots/004_orbit_preview`

Previewed five orbit keyframes at 480×270 (V → butterfly), then started the
150 Cycles frames in the background at 24 spp + OIDN (51–110 s per frame
depending on what else was running). Measured flicker later on frames 70–72:
mean second temporal difference 0.55/255, concentrated on moving highlights.

## 5. Ink (13:20–13:31) — `snapshots/005`, `006`; `studies/ink_stroke_seeds`

- s01 (`005_ink_first_pass`): paper looked like embossed stucco (relief shading
  about 3× too strong); marks read as a scratchy pen.
- s02–s03: toned the paper down, widened strokes, added per-reload ink
  dilution and a slanted round-brush thick/thin by direction; 3× zoom crops
  showed convincing bristle streaks.
- s04: strokes were timid; wider ones would merge the dense spiral. Added
  clearance: each sample's on-page distance to the nearest other passage caps
  its width.
- s05 (`006_ink_all_black_spiral`): offsetting the stroke breaks reshuffled the
  random tones and the left spiral turned solid black. Made tone deliberate:
  diluted ink for the unfolding spiral (t < 12), black for the chaos. Added a
  pale wash where passages gather. Compared four stroke seeds and chose 23.

## 6. Light (13:31–13:35) — `snapshots/007`, `008`

- s01 (`007_light_first_pass_fog`): haze from every old trail sample summed to
  a brown fog; plinth top blown out and aliased.
- s02–s04: haze only from the head and recent trail; room shading at full
  resolution; calibrated room and haze against the trail.
- s05: the head's motion blur broke into beads (24 shutter samples for a
  ~100 px move); a length mismatch in the fix briefly painted a black square
  over the head. Resampled the shutter path evenly in screen space.
- s06 (`008_light_head_orb`): added a compact core and warm halo so the head
  reads as a light, and a mirrored-trail reflection on the plinth top (it is
  physically placed, so from this camera height only a faint glint shows).

## 7. Film compositor and first pass (13:35–13:57)

Rendered copper frame 202 (camera K) out of order so the transitions could be
tested. Test frames across the timeline showed the paper reveal breaking into
blotchy, mould-like patches; replaced it with a smooth wet front spreading
from the filament with a faint tide-line. Launched frames 214–719 (13:39).
Rendered first ink and light stills at 2400×3000 (13:44): paper fibres showed
as bright scratches because their brightness was not normalised for width;
fixed. Committed a checkpoint (13:46).

## 8. Energy re-timing (13:57–14:13)

A strip of consecutive Energy frames showed the head jumping about a quarter
loop per frame: all 19 time units in 6.8 s is ~5 loops per second at peak,
which strobes at 24 fps. The act now joins the light mid-performance: the head
is seen travelling t = 18.5 → 27 in strict order (0.74–1.48 time units per
second), and t = 8 → 18.5 is present as blue-green afterglow, which also
continues the ink's glowing strokes at the matched cut. Re-rendered frames
428–719 (from 14:13) and documented the remapping.

## 9. Stills and triptych (14:10–14:44)

Copper still: Cycles, 128 spp, 2400×3000, 25 min (14:16–14:41); the same run
saved `copper_sculpture.blend`. Full-resolution crops checked the wires and
the shadow arcs on the plinth. Light still: compared six moments at 600×750
and chose t ≈ 24 s (head at the wing crossing); the first full-resolution
render was soft (line width and depth blur scale with resolution), so the
still uses a tighter core and shallower blur, and a higher exposure. Composed
the triptych; the film's finale was switched to use these stills (14:44).

## 10. Finish (14:44–16:10)

Waited for the remaining copper frames (last at 16:02), composited frames
0–213 (16:03), checked the seam between frame 201 and the out-of-order frame
202 (mean difference 0.05/255), encoded the master (CRF 17, 58 MB) and a web
copy (CRF 21, 9 MB), and inspected decoded frames across the whole film for
banding and compression. Final commit 16:10.

## 11. Repository layout (from 22:13)

At the curator's request the run moved to `runs/three-worlds/` under the run
standard in `RUNS.md`: full-size outputs are no longer committed but declared
as release assets; snapshots, studies and previews were converted to
downsized WebP (with native-resolution crops); `src/build.py` and
`src/verify.py` were added so the outputs can be rebuilt and checked. The
artwork was not changed.
