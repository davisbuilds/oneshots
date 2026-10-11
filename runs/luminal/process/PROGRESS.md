# Progress log

Times in UTC, 2026-10-11. Snapshots referenced here are in `snapshots/`,
numbered in the order they were made.

## 1. Survey and plan (02:20 to 02:30)

Read CLAUDE.md, RUNS.md, the README and two earlier game runs (Borrowed
Seconds, From Gate to Game) for layout, manifest and verifier conventions.

Decisions made before writing code:

- **One simulation, shared by everything.** `src/physics.js` steps the game at
  a fixed 1/240 s. The browser game, a solver and the tests all call the same
  `step()`, so a route the solver proves is a route a player can take.
- **x is a function of time.** Horizontal speed only changes at known beats,
  so the player's x is computed from the song clock, never integrated. The
  world cannot drift off the music, and a practice checkpoint is a song
  position.
- **The level is written in beats.** `b.spikes(24.5)` is a spike the player
  passes half a beat after pressing on beat 24, whatever the speed. A ground
  jump lasts exactly one beat, so holding the button bounces on every beat.
- **The song is pre-rendered.** The soundtrack is note events (`song.js`),
  synthesized with an OfflineAudioContext into one buffer before the first
  click. Playback is a buffer source started at an exact offset: restarts
  and practice respawns seek sample-accurately, and the visuals read the same
  event list for their beat reactions.
- **Classic scripts, no build.** The page opens from disk; Node loads the same
  files for the tests (the From Gate to Game pattern).
- **WebGL2 with a bloom chain** for the luminous look, all geometry generated
  in code; DOM for menus and HUD text.

## 2. Physics, builder, solver, first full level (02:30 to 02:45)

- Constants: 128 BPM; a cube jump peaks at 2.2 blocks and lasts one beat;
  normal speed is five blocks a beat. Hitboxes follow the genre's forgiving
  convention: the player is a 1 x 1 box, a spike's hitbox is a 0.3 x 0.5
  rectangle low in the triangle, and a block only kills when the player's
  inner box (30%) enters it; shallower contact snaps onto the surface.
- Modes: cube (with jump buffering and 50 ms of coyote time), ship, wave;
  gravity portals, yellow/blue orbs and pads; speed portals.
- **Wrong at first:** standing on a platform flickered between grounded and
  airborne every other step (no gravity at rest, so no overlap, so not
  grounded). Gravity now applies at rest and the surface check re-lands the
  cube each step.
- `tools/solver.js`: breadth-first search over button states, branching every
  two steps and merging states in the same (y, vy, grounded, held, ...) cell.
  The first draft of all seven sections (244 beats) solved on the second try;
  the first failure was the drop's wave corridor starting below the player.
  Wave corridors now open with a wide funnel.
- **Slow:** 230 s for the level. Coarser merging and a smaller frontier cap
  brought it to about 80 s, which is fine for a tool. The tests will replay a
  stored route (`src/route.js`) instead of searching.

## 3. Renderer, scene, song, game shell (02:45 to 02:55)

- `render.js`: one batched triangle stream with per-vertex "kind" for soft
  glows, discs and rings; scene to texture, bright pass, three blur levels,
  composite with vignette, flash, chromatic aberration and grain.
- `scene.js`: eight themes (one per section), parallax ridges, stars, a
  per-theme sky object, wireframe polyhedra in depth, a perspective floor,
  and the level geometry. Hazards keep one colour everywhere (white core, red
  edge) and no theme uses that red.
- `song.js`: "Heliotrope", 64 bars in D minor with an eight-bar hook, lifting
  to E minor for the finale and ending on E major.
- `game.js`: input events are timestamped and applied at the simulation step
  they belong to, not at the next frame.
- First screenshots (headless Chromium, SwiftShader): everything draws, no
  console errors. **Wrong:** the parallax ridges were several screens tall
  and covered the sky objects; fixed by normalising their heights.

## 4. The soundtrack, measured (02:55 to 03:15)

- `tools/audio.mjs` renders the song in headless Chromium, writes a WAV and
  prints loudness per four bars. **Wrong:** the first render took **30 s**
  before Play could enable, and every section sat on the limiter (-11 dBFS
  RMS from the first bar to the last: no arc).
- Profiling with single instruments showed a fixed cost per chunk (the
  convolution reverb) plus the notes. Restructured: each eight-bar chunk now
  renders a dry mix and a reverb send as four channels; reverb and limiting
  run live, and chunks play as scheduled buffer sources, so playback starts
  after the first chunk (**0.55 s** here) while the rest render in order.
  Chunks are linear sums, so overlapping their tails is exact. Panners per
  oscillator became one channel merger per voice.
- **Wrong:** still -10 dBFS everywhere. The synthetic reverb impulse was not
  normalised: its energy made the send about 15 dB louder than the dry
  signal. Normalised it to unit energy.
- Balanced by stem measurement (each instrument solo, RMS per section): the
  kick was 10 dB too loud, pads, stabs, leads and plucks 6 to 9 dB too quiet.
  Final arc: opening -21 dBFS, Pulse -12.5, drop -11.3, bridge -17, peak
  below full scale (snapshot of the spectrogram not kept; the verifier
  asserts the arc).
- A real-time autoplay run (the real loop, audio clock and renderer, 13 to
  17 fps under SwiftShader) finished the level with the simulation within a
  frame of the audio clock.

## 5. Fairness (03:15 to 03:30)

- First timing-window measurement (shift one press, keep the rest of the
  route) was dominated by the solver's jittery taps. Changes: the solver
  keeps, among merged states, the one with the fewest button changes, and
  searches with input changes at most every 50 ms (finer only if needed).
  The route came out human-looking: 24 presses for the whole Ascent instead
  of 359.
- **Wrong:** the Dawn section could be cleared by holding the button
  throughout: every spike was on a half beat, exactly where holding bounces.
  Added hanging spikes over a stretch you must walk under and a syncopated
  jump on an "and".
- Every section is solvable with inputs on a 50 ms grid (now a test).
- The gravity-ring chain in Inversion had 13 to 25 ms windows. Rather than
  guess heights, computed the path a press on each eighth note produces and
  put each ring on it; the drop's and finale's ship tunnels were widened.

## 6. Art direction (03:30 to 03:45)

- `world.js`: a perspective world behind the play plane. Props live at a
  depth and project toward a horizon at 62% of the screen; the far ground
  plane's lines converge on it. Each section brings its own architecture,
  rising in as its theme fades up: crystal spires (Dawn), a corridor of
  arches with a wave of light running down it on every beat (Pulse), floating
  crystals under an aurora (Ascent), spires mirrored on floor and ceiling
  (Inversion), a tunnel of rings rushing at the camera (Supernova), lanterns
  in loose constellations (Echo), beams of light (Ascension).
- **Wrong:** the first pass dropped the level's foreground (only its
  reflections drew), and the bloom blew out the drop and the finale
  (snapshot 03). Restored the draw calls; halved the sky objects, raised the
  bloom threshold, removed the beams' base glows.
- Reflections in a glass floor (the player, blocks and spikes mirrored about
  y = 0), blocks with lit landing surfaces and diagonal light lines, and a
  dark rim around the player so it reads against the brightest skies.

## 7. Tests, verifier, polish (03:45 to 04:00)

- `tests/physics.test.js` caught two real errors: the jump peaked at 2.24
  rather than 2.2 blocks, and held bounces drifted 0.05 beat after four
  bounces. The position update used the end-of-step velocity; it now uses
  the average of the start and end velocities, which is exact under constant
  gravity. The level was re-solved.
- `tests/level.test.js` caught a musical error: the drop's harmony line was a
  fixed fourth under the hook, producing B naturals in D minor. It is now a
  diatonic third.
- `verify.mjs`. **Wrong:** in stepped tests a mouse press was timestamped on
  the real clock, seconds ahead of the simulation, so it never applied; in
  test mode inputs now apply at the next step. Synthetic touch events threw
  in `setPointerCapture`; guarded. The completion screen was a flat grey: the
  camera kept going into a white wall past the finish (snapshot 04). The
  camera now stops at a gate of light and the player flies into it.
- Teaching signs before each new mechanic (until the first clear), section
  cards, a gold line marking your best, an audio offset setting, adaptive
  resolution, and a single-file bundle (155 KiB, 46 KiB gzipped).
- Honest timing windows (`tools/fairness.js`): a press counts as movable by
  d steps if any continuation survives the next 1.5 s. Minimum windows:
  Dawn 154 ms, Pulse 146 ms, Ascent 154 ms, Inversion 79 ms (the ring
  chain), Supernova 129 ms, Echo 221 ms. One Ascension press read 0 ms; probed
  directly, it can move 17 ms earlier but not later: the solver's route
  presses at the last possible moment there, so only the late side is tight.

## 8. Delivery and refinement (04:00 to 04:20)

- Hero montage and full-resolution previews from the stored route; README,
  manifest (the single-file game and the soundtrack WAV as release assets,
  built by the Run assets workflow after merge, not run from this session),
  and the run's tests wired into CI and the npm scripts.
- **Watch** on the title plays the solver's route as a demo and records
  nothing (verified). Touch devices get touch hints on the title.
- A burst of light rings when the drop and the final chord land.
- Re-measured stems after balancing: in the drop the kick sits at -16 dBFS
  RMS, sub -18, bass -20, lead -20 (nudged up 1.5 dB), clap -24, stabs -25,
  pads -27.
- JavaScript cost of building a frame is 1 to 2 ms at 1280 x 720, so the
  renderer has headroom on real GPUs; the 12 to 17 fps seen here is software
  rasterization.
- Fixed: R while paused restarted behind the still-visible pause screen.
- Final checks: `node --test tests/*.test.js` (18 pass), `tools/solve.js
  --check`, `verify.mjs` (ok: first music chunk after about 1.1 s; opening
  -21.2 dB, drop -11.5 dB, peak 0.93), `tools/bundle.mjs --check` (162 KiB).
