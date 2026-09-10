# The Rainkeeper

**A little earth, in your care.** An illustrated field notebook that comes alive:
carve a river, bring a shower, and give a seed somewhere to grow. There is no
score, deadline, or winning state. There are a few things buried in the earth.

**Model:** GPT-6 (Codex)

One HTML file. No dependencies, external assets, network requests, or build step.

```bash
open rainkeeper/index.html
```

Run from the repository root, or open the file directly in a browser.

Start by carving a gently descending channel from the pond toward the seed on
the right. Send some rain. Watch the water settle, the soil darken, and roots
branch beneath the surface. Try making a dam, or planting along your new river.

## A small working ecology

- A 300 × 180 cellular world with air, soil, water, and an uncarvable stone base.
  At a fixed 30 Hz, water falls, moves diagonally around obstacles, spreads
  sideways, absorbs into soil, evaporates, or drains off the world boundary.
- Soil stores moisture, which diffuses between neighboring soil cells. Its
  rendering darkens as it becomes wetter.
- Roots branch through soil, favoring moisture and downward growth. Plants
  consume moisture around their base and root tips; hydration controls growth.
  Three botanical forms unfurl leaves and, for two forms, flowers. Removing a
  plant's supporting soil uproots it.
- Four tools: **Carve**, **Water**, **Plant**, and **Build**. Built earth stays
  where it is placed, like clay. Up to 28 plants can inhabit a landscape.
- Passing rain showers, damp-ground grass, drifting pollen, layered soil,
  procedural paper grain, and small buried discoveries.
- New landscapes, pause, keyboard and pointer controls, narrow-screen layout,
  reduced-motion startup, and illustrated PNG keepsakes.

This is an expressive cellular sandbox, not a scientific hydrology or botany
model. Moisture diffusion and surface-water absorption are simplified; the
system does not conserve a single combined water quantity. Sunlight is constant,
plants do not compete for light, and dry plants stop growing rather than die.
The initially established plants are given moisture and developed roots.

## Controls

| Input | Action |
| :---- | :----- |
| Drag / hold on the landscape | Apply the selected tool |
| 1–4 | Carve / Water / Plant / Build |
| Arrow keys | Move the tool cursor |
| Hold Space | Apply the tool at the cursor |
| [ / ] | Decrease / increase tool width |
| R | Start or stop a shower |
| P | Pause / resume the ecosystem |
| New earth | Reset into another landscape |
| Keep a page | Save a PNG |
| ? | Read the field notes |

Shortcuts apply when the page or canvas has focus. Buttons and the size slider
retain native keyboard behavior. You can edit while paused; water movement,
rainfall, and plant growth resume when you press Play. Reduced-motion preference
starts the simulation paused. Hidden tabs suspend simulation.

## Verification

Checked the actual `file://` artifact in Chromium through Playwright:

- Carving removes visible soil; rebuilding restores soil at the same location.
- Water enters a newly carved channel after the simulation resumes.
- Excavating beneath a plant removes it; planting multiple seeds also works
  while paused.
- Two fresh loads of the same landscape, with equal simulated time, produce
  more leaves with rain than without. The dry control also advances.
- A buried discovery changes the field notes.
- Field-guide interaction, PNG download, and reduced-motion startup work.
- Desktop and phone-size screenshots were inspected; the phone layout has no
  horizontal overflow.

To repeat the essential check, pause, carve an empty channel connected to the
pond, and resume. Watch water enter the new space. Then plant in dry soil and
compare its progress before and after watering.

Local screenshots are saved under `output/playwright/`, which is ignored by git.
There is no test runner or dependency installation needed to use the artifact.
