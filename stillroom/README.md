# The Stillroom

**An instrument for possible futures.** Move a sun. Disturb an orbit. Listen to
the dust. Rewind, change your mind, and let a different future unfold.

**Model:** GPT-6 (Codex)

One HTML file. No dependencies, network requests, assets, or build step.

```bash
open stillroom/index.html
```

Run that from the repository root, or open `index.html` directly in a browser.
Enable **Sound**, try **Companions**, and drag one of its suns. Hold **Rewind**
to return to the moment before you intervened.

## Inside

- 2,400 particles accelerated by movable gravity sources, with softened forces
  and a fixed 30 Hz semi-implicit Euler integrator. Particles do not attract
  each other; suns remain where you place them. This is an expressive instrument,
  not an astronomical model.
- Three initial arrangements: **Solitude**, **Companions**, and **Unraveling**.
  Their patterns emerge from the same rules, with different initial conditions.
- A tilted Canvas 2D field with luminous trails, star halos, and ripple impulses.
- A circular history buffer with 480 snapshots: about sixteen seconds of particle
  positions, velocities, sun positions, and simulation time. Rewinding restores
  those states. Resuming discards the later history; subsequent input can create
  a different future. Resize does not erase history. Decorative trails and ripple
  rings are cleared on rewind rather than recorded.
- Procedural Web Audio: selected particles crossing a rotating listening line
  trigger pentatonic sine bells, stereo positioning, and feedback delay. Sound
  starts only on request; no samples or recordings are loaded.
- PNG keepsakes with a title, scene, and simulation timestamp.
- Narrow-screen layout, pointer/touch input, keyboard controls, and an initially
  paused experience when reduced motion is requested. Background tabs suspend
  simulation and mute audio.

## Controls

| Input | Action |
| :---- | :----- |
| Drag a sun | Move its gravitational field |
| Tap empty space / Enter | Push nearby dust outward |
| Hold Rewind / R | Travel backward; release to branch |
| Timeline | Choose a remembered moment and branch from it |
| Space | Pause / resume |
| Arrow keys | Move the first sun |
| 1–3 | Reset into a chosen arrangement |
| M | Toggle sound |
| S / Keep a moment | Download a PNG |
| ? | Open the field guide |

Global shortcuts apply when the canvas or page has focus. Buttons and the
slider retain their native keyboard interactions. A focused Rewind button
also supports holding Space or Enter.

## Verification

Checked in Chromium using Playwright against the actual `file://` artifact:
scene selection, dragging, ripple interaction, pause, held-key rewind, timeline
branching, resumption, field guide, and PNG download. A Web Audio analyser
confirmed a nonzero output signal after enabling sound. Desktop and phone-size
screenshots were visually inspected. Reduced-motion startup was checked.

To repeat the core user-flow check: let a scene run, pause it, hold Rewind, and
confirm that its time decreases. Move the timeline to the start, release, and
confirm the discarded future is no longer selectable. Resume and watch time
advance from that point. Enable sound and save a keepsake.

Verification screenshots are local artifacts under `output/playwright/`
(ignored by git). No automated test runner is needed to use the piece.
