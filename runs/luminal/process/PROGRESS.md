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
