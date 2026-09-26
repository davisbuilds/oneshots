# NEON SWARM

A Geometry-Wars-style arcade survival game in a single HTML file. Built by
Claude in the final 7 minutes before a weekly usage reset; originally lived in
`../seventeen/` and was later split into its own folder.

**One HTML file. Zero dependencies. `open index.html` to play.**

**Model:** Fable 5 (xhigh reasoning)

## The game

Your ship chases the mouse with real inertia and auto-fires at the nearest
enemy. Survive as the spawn rate ramps up. Kills chain into a combo multiplier
(up to ×20) that resets after 2 seconds without a kill.

- **Three enemy types** — magenta chasers that home in, cyan drifters that
  ricochet off walls, amber splitters that take 3 hits and burst into three
  fast minis.
- **Game feel** — additive-blend neon glow, motion trails, particle bursts,
  screen shake scaled to the chaos, engine exhaust, a "SIGNAL LOST" death
  screen, and a localStorage high score.
- **Procedural sound** — every shot, hit, kill, and death is synthesized live
  in WebAudio (pitch-sweep blips + filtered noise explosions). First click
  arms the audio.

## Controls

| Input | Action |
| :---- | :----- |
| mouse | steer the ship |
| click | start audio / restart after death |

## Verification

`verify.mjs` runs a headless Chromium playtest: 4 seconds of simulated mouse
movement, console error capture, and a screenshot. Last run: zero errors, the
auto-fire scored 280 with an ×8 multiplier on its own.
