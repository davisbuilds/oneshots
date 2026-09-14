# Echo Atlas

**An instrument for invisible architecture.** Ring a tone into darkness and
watch the room draw itself in returning sound. Then change the room and discover
what it wants to become.

**Model:** GPT-5.6 Sol

One HTML file. No dependencies, network requests, external assets, or build
step.

```bash
open echo-atlas/index.html
```

Run that from the repository root, or open `index.html` directly in a browser.

## Inside

- A three-channel, two-dimensional wave simulation. Blue, gold, and violet
  pulses spread, reflect, diffract through openings, and interfere. The solver
  uses a damped finite-difference wave equation with softened reflective
  boundaries.
- **The Nave**, **The Well**, and **The Fold**: three hidden chambers whose
  architecture appears only after sound reaches it.
- A phosphor-like acoustic memory. The live pressure field burns colored traces
  into the dark; the **Afterglow** control decides how long the room remembers.
- Editable geometry. Draw reflective walls, erase passages, ring tones from any
  point, and move the listening point through the field.
- Procedural Web Audio. Each strike is synthesized in the file, while three
  quiet oscillators let the pressure at the listening point become audible.
- Keyboard and pointer controls, touch-friendly narrow-screen layout, a reduced
  motion path, hidden-tab audio suspension, and illustrated PNG atlas export.

This is an expressive acoustic sketch rather than an engineering simulator.
Its rooms are two-dimensional and its boundaries are tuned for visible,
musical echoes.

## Controls

| Input | Action |
| :---- | :----- |
| tap / drag with Ring | send a colored wave through the room |
| Wall / Erase | draw reflective stone or open a passage |
| Listen | move the listening point |
| tone dots / Q W E | choose low blue, middle gold, or high violet |
| 1–3 | choose The Nave, The Well, or The Fold |
| R | ring the center of the room |
| Space | pause / resume the field |
| M | toggle sound |
| C | clear the phosphor afterglow |
| S / Keep atlas | save the discovered room as a PNG |
| ? | open the field notes |

## Verification

Checked in Chromium through Playwright against the self-contained artifact:

- All three chambers rendered and revealed their distinct hidden geometry.
- Blue, gold, and violet strikes propagated independently and mixed visibly.
- A new wall changed the illuminated field; erase, listener placement, pause,
  sound activation, field notes, and keyboard controls responded correctly.
- PNG export produced an illustrated atlas image.
- Desktop at 1440 × 900 and phone at 390 × 844 were visually inspected. The
  portrait simulation preserved circular geometry and had no page overflow.
- Reduced-motion preference started the field still. The console stayed clear
  of errors and warnings throughout the interaction pass.

To repeat the most revealing check, ring the left side of The Nave and watch its
pillars appear as the gold wave returns. Draw a wall across the center and ring
again; the wave will reflect from the new line and bend around its ends. Move
the listening point, turn on sound, and compare the three tone colors.
