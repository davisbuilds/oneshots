# GASKET∞

A realtime ray-marched flythrough of an infinite Apollonian gasket — built by Claude
in under 17 minutes (the time remaining before a weekly usage reset), as a
capabilities demo.

**One HTML file. Zero dependencies. Open `index.html` in any browser.**

**Model:** Fable 5 (xhigh reasoning)

## What's inside the single file

- **WebGL2 ray marcher** — infinite Apollonian gasket distance field (7-iteration
  sphere-inversion IFS) with orbit-trap palette coloring, soft shadows, ambient
  occlusion, rim/spec lighting, depth fog, march-density light shafts, ACES
  tonemapping, dithered marching, film grain, and vignette.
- **Collision-aware autopilot** — the same distance field is mirrored in plain
  JavaScript on the CPU; each frame the camera wanders along a slowly-evolving
  heading while gradient-based steering and lookahead sampling keep it from
  flying into geometry. It slows near walls, so close passes feel cinematic.
- **Generative soundtrack** — WebAudio pad (detuned saw/triangle voices through
  an LFO-swept lowpass) drifting through a 4-chord progression, plus pentatonic
  plucks into a feedback delay. An analyser feeds audio energy back into the
  shader: the glowing seams between spheres pulse with the music.
- **Adaptive resolution** — render scale auto-adjusts to hold ~50+ fps.
- **CRT-phosphor HUD** — fps / render-scale / velocity / odometer readouts.

## Controls

| Input | Action |
| :---- | :----- |
| drag  | look around |
| wheel | speed up / slow down |
| space | freeze the autopilot |
| `m`   | toggle sound |
| `f`   | fullscreen |

## Verification

`verify.mjs` loads the page in headless Chromium (reusing the Playwright install
from a sibling project), captures console/shader errors, and screenshots two
moments a few seconds apart to confirm the renderer and autopilot are alive.
Last run: zero errors, ~120 fps headless.

## Bonus round

A second single-file artifact was built in the final 7 minutes: **NEON SWARM**,
a Geometry-Wars-style arcade survival game. It now lives in its own repo at
[`../neon-swarm/`](../neon-swarm/).
