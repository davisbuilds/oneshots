# Progress log — "Two Kinds of Fire"

Times are UTC on 2026-09-25 (approximate). Session start 18:59. Renders referenced here are
kept in `renders/` (numbered in the order they were made).

## 1. Setup and brush engine (≈18:59 – 19:05)

- Environment: Python 3.11.15, NumPy 2.4.6, Pillow 12.3.0; no system FFmpeg, so
  `imageio-ffmpeg` 0.6.0 is used only for its bundled FFmpeg 7.0.2 binary.
- Pillow cannot Gaussian-blur float images, so blur is a NumPy three-pass box blur.
- `001_brush_test.png` — first brush sheet looked like hair and leaves: pointed
  tapers, and depletion turned into transparency. Changes: blunt brush ends,
  paint that runs out breaks up on the canvas weave (dry brush) instead of fading,
  mottled paint body from a shared noise texture sampled in brush space, weaker
  impasto relief. A second defect — bristle streaks wrapping concentrically
  around the stroke caps — was fixed by indexing bristles by lateral offset
  instead of radial distance.

## 2. Composition studies, round 1 (≈19:05 – 19:12)

`002_studies_round1.jpg` (900 px wide each, same painting program, four
compositions A–D, ~2,950 strokes each, ~23 s each).

- A: diagonal, kayak low left, launch right third.
- B: low horizon (70%), immense sky, tall leaning trail at left, kayak lower right.
- C: high horizon, water dominant. Plume cramped against the top edge — weakest.
- D: kayak placed inside the reflected path of the launch.

Problems shared by all four: the launch halo is a blotchy disc (reads as a moon
or firework, not a rising rocket); dry scumbles plus smear leave a dark
dithered "spider" where the flame should be; the kayak is invisible (dark on
dark, too small); the night drifts purple. Decision: B's sky/trail and D's idea
(the kayak silhouetted where warm reflection and blue-green water meet) are
the strongest; next round fixes the shared defects and tests B/D hybrids.

## 3. Studies, round 2 (≈19:12 – 19:18)

`003_studies_round2.jpg` — D plus three hybrids E, F, G after fixing: tighter
glow field, halo built from arcs only slightly lighter than the paint beneath
(no smear into the core), a real flame (tapered white-gold strokes with a
little impasto), less purple night palette, softer dry-brush threshold.

It now reads as a launch. E (horizon 64%, trail at right, kayak heading toward
the reflected path) has the most immensity and the clearest reading order.
**Chosen: E, modified so the kayak's bow enters the warm reflected path while
its wake trails back through blue-green water** — the human is literally
between the two kinds of light. Still wrong: circular halo, flat cream ground
cloud, teal "slab" under the kayak, swirls reading as eyes, kayak illegible.

## 4. First full-resolution renders and redesign passes (≈19:18 – 19:45)

- `004_full_v1*` — first 3000×2000 render (~3,000 strokes, ~4.9 min). The
  full-res crops exposed an engine defect invisible at study size: dry paint
  broke up in a regular herringbone pattern (the weave texture was too pure).
  Also: halo made of "popcorn" dabs, trail a string of beads, bio underlayer a
  soft digital blur, kayak short of the reflected path.
- `005_brush_test_tooth_v2.png` — canvas tooth rebuilt as an irregular mix
  (soft weave 25%, gesso fBm, clumps, blurred grain), rank-equalised; dry
  breakup also follows a streak texture along the stroke direction. Dry
  brush now looks dragged, not stamped.
- `006`/`007` — kayak moved so its bow sits in the reflected path; trail
  painted as long continuous strokes; ground cloud as billows lit from above.
  Crops of `007` showed: comb of feathered strokes at the halo edge (sky
  strokes coloured by their midpoint across a steep light gradient), towers
  reading as an industrial skyline, pill-shaped sparkles, drip "ticks", a
  rim light that read as a zipper.
- `008` — sky strokes shortened and colour-averaged where the light changes;
  horizon haze band and a low dark cloud bank added for large-mass structure.
  Result: the halo became a smooth airbrushed ellipse — the thing to avoid.
- `009` — criss-cross second sky pass (removes uniform wood-grain striation);
  visible dry scumbles and cool breaking strokes in the halo. Halo still
  formed concentric "vortex" rings because every scumble was tangential.
- `010` — **halo redesigned**: strokes in varied, mostly upright directions
  following the rising light; bright core made smaller. The launch now reads as
  a lit, rising plume built of paint. Next weakness: the living water is too
  faint to be the counterpart "fire".

## 5. Living water, legibility, film (≈19:45 – 20:25)

- `011_full_v3*` — bioluminescence given a glow pass (light thrown into the
  surrounding water), brighter broken structure strokes and 160 single-cell
  flecks along the disturbed water. Crops showed a halftone-dot look in partial
  dry-brush coverage; the tooth mix was shifted from fine grain toward larger
  clumps and the streak share raised to 50%. Dark X-shaped halo scratches,
  hat brim reading as a crossbar, pill-shaped shore lights fixed.
- `012_full_v4*` — first complete run with film. Painting good; the film spent
  ~60% of its time on the sky/water lay-in (frames were spread by stroke
  effort alone, and big strokes dominate). The kayak hull was invisible
  (dark on dark), so the figure could read as a stand-up paddleboarder.
- `013` — taller hull, warm deck-edge highlight on the launch side, full-length
  glowing waterline, irregular accent flecks. Film now budgets screen time per
  stage (`film.STAGE_TIME`), with effort-pacing inside each stage.
- `014_final_*` — final run: 4,511 strokes, 3000×2000, 11 min 52 s wall
  clock including the film (809 frames, 27.0 s). `replay.py` re-rendered the
  painting from `stroke_log.jsonl.gz` onto a blank canvas and the result was
  bit-identical to the final PNG (max pixel difference 0).

Note: section times are approximate, reconstructed afterwards from command
timestamps. The whole session ran 18:59 – ~20:25 UTC (about 1 h 25 min),
well under the several hours the brief allowed.

## Summary of iterations

7 composition studies in 2 rounds; 3 brush-engine test sheets; 9 whole-image
renders of the chosen composition (3 at 1500 px, 6 at 3000 px including the
two complete runs with film). Major redesigns (not parameter tweaks): canvas
tooth, halo construction (twice), trail construction, bioluminescent wake
structure, kayak hull legibility, film pacing.

## Known weaknesses left in the final

- The kayak and paddler remain small, dark and simplified; at thumbnail
  size the figure is carried by its glowing waterline.
- The wake patches far to the left are somewhat evenly spaced, a little
  regular for water.
- The far-left half of the picture is intentionally quiet; some viewers may
  find it too empty.
