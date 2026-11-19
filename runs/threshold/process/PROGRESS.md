# Progress log

Times in UTC on 2026-11-19 unless noted. Snapshots referenced here are in
`snapshots/`, numbered in the order they were made.

## 12:36 Inspecting the environment

Read `AGENTS.md`, `RUNS.md`, the README, the CI workflow, the PR template and
two recent WebGL runs (Tideline, Luminal) for conventions. Findings that shaped
the plan:

- The container has **no GPU**: 4 vCPU Xeon, 15 GB RAM. Every browser check
  here renders with SwiftShader (software). Frame rates measured here say
  nothing about a desktop GPU; I will record CPU-side costs (draw calls,
  world renders, JavaScript time) and leave a benchmark mode for real hardware.
- The repository's browser launcher refuses Chrome older than 156.0.8078.79.
  The preinstalled Chrome for Testing is 153, so I installed Playwright's
  locked Chromium (158.0.8127.18) into the session scratchpad with
  `pnpm exec playwright install chromium` and point `CHROMIUM_PATH` at it,
  exactly as CI does. Node here is 22; I downloaded Node 24.22.3 (the
  repository's `.nvmrc`), checking its SHA-256 against nodejs.org.
- three.js 0.187.0 is the current release (2026-10-30). It no longer ships a
  minified build. I vendored `three.module.js` and `three.core.js`
  byte-for-byte from the npm tarball (sha512 integrity checked against the
  registry): 2.1 MB, inside the 8 MiB per-run cap, and the page then needs no
  install, only a static server for ES modules.

## 12:45 Technical approach

- **Portal rendering: recursive stencil, not render-to-texture.** One
  half-float depth-stencil target; the stencil value of a pixel is the
  recursion level visible there. Each portal is marked (depth-tested, so
  occluders in front win), its depth is reset to far, the destination world
  is drawn from the transformed camera with a clip plane at the destination
  portal and a scissor at the portal's screen rectangle, then the portal's
  depth is restored and the stencil decremented. No per-portal render
  targets, exact resolution at every depth, and cycles terminate by an
  explicit depth and render budget.
- **Core math without three.js.** Rigid transforms, the portal pair
  transform `M_AB = B ∘ FLIP ∘ A⁻¹`, crossing detection and ray casting are
  pure JavaScript in `src/core/`, so Node's test runner can prove them (and CI
  can run them without a browser or a dependency install).
- **Half-open crossing rule.** Front is `z >= 0`, back is `z < 0`; a crossing
  maps the end point to `z_B = -z_A > 0`, strictly in front of the exit, so the
  exit portal cannot re-trigger. The remainder of a step continues from just
  in front of the exit plane, which also makes coplanar back-to-back portals
  safe.
- **Near-plane slicing.** When the eye is within 0.35 m of a portal plane
  and inside its opening, the portal surface is drawn as an open box reaching
  0.6 m *behind* the plane. I first sketched it reaching towards the camera,
  then realised its side walls would mark rays that never pass through the
  opening; behind the plane, only rays through the opening can reach it, so it
  can be drawn without a depth test.

## 12:50 Portal math proven first

`tests/portal.test.js`: the pair transform maps the region behind A to the
region in front of B (200 random portals, arbitrary orientation including
roll); `M_BA ∘ M_AB = I` (500 pairs); walking in and straight back restores
position, orientation and velocity (300 random approaches, speeds up to 30
m/s); a single 5 km step crosses exactly once; creeping and dithering around
the plane never leaves the traveller behind the current portal; edges and
corners are inclusive; back-to-back portals route by direction; a looping
corridor stops at the crossing cap; rays continue through portals. Two of my
own test cases were wrong at first (an "outside" edge case that was exactly
on the edge, and a dither loop whose symmetric steps never reached the
plane); fixed the tests, not the code.

## 13:00 First light: the stencil renderer works

Two prototype worlds (`src/core/proto.js`, kept as `?world=proto`): a
grey-blue plain and a warm dusk world with two moons, joined by a doorway, plus
a pair of facing gates linked to each other and a back-to-back gate.

- **Snapshot 01:** the warm world through the doorway, and the facing gates'
  regress (4 world renders, depth 3, one terminal fill).
- **Snapshot 02:** eye 3 cm in front of the plane looking sideways at the
  jamb, then 3 cm past it after crossing into world B. The two frames match;
  the jamb is lit by world A on one half and by world B on the other, which is
  physically what a doorway between differently lit worlds should look like.
- **Snapshot 03:** after crossing, turning round shows world A through the
  doorway.

Discovered along the way: three.js resolves a multisampled render target and
then *invalidates its colour attachment* after every `render()` call, which
would break multi-call stencil compositing. The scene target is therefore
single-sampled and anti-aliased with FXAA in post. `PCFSoftShadowMap` was
removed in r187; using `PCFShadowMap`.

## 13:05 Physics: a body that straddles worlds

`src/core/physics.js`: a capsule controller (radius 0.32 m, eye 1.62 m) with
step-up, ground snapping, substepping (no step longer than 0.15 m, so falls
cannot tunnel through floors) and an explicit `up` axis, so a portal that
rotates the traveller (a window that opens through a ceiling) can be followed
by a smooth re-alignment to the new world's gravity.

The important part is **portal-aware collision**. While the capsule overlaps
a portal's opening, contacts with its own world's geometry *beyond* the plane
inside the opening are discarded, and the linked world's geometry in front
of the exit portal is mapped back through the portal and used instead. A test
builds a doorway whose own world has a wall 0.4 m behind the plane (like the
inside of a small hut) while the far world has a post 0.5 m beyond it: the
walker passes the wall's position and stops at the post, at exactly
`0.5 - radius` beyond the plane.

Failures on the way: the monolith frame's base blocks stuck 0.2 m into the
opening (a real geometry bug, found by a test that strafes into the jambs from
both sides of the plane and expects to stop at `hw - radius`); and three test
construction mistakes (wrong facing in the back-to-back test, a reversal loop
that never reached the plane, a high-speed start too far away). The suite now
covers walking through and back, standing halfway, consistent jamb collisions
on both sides, 60 approaches into edges and corners (asserting the eye is never
behind a portal of its own world), a 300 m/s crossing, 400 rapid reversals, and
the back-to-back gate.

## 13:15 The multiverse: lattice addressing

Worlds live on an unbounded integer lattice, key `"i,j"`. Every lattice edge
that exists is one portal pair, decided by a hash of one canonical endpoint
(E/W always, N/S at 42 %, four long "wormhole" offsets at 7 % each), so both
ends agree without storing anything and every link is reversible by
construction. Pocket worlds (`"i,j/name"`) hang off a host for the impossible
architecture. Archetypes are hashed per cell, with E/W neighbours steered apart
so a doorway usually shows a contrasting world; (0,0) to (3,0) are curated
(the Threshold, the desert, the forest, the glacier). A quick check over twelve
worlds, including far ones such as (-12, 9), found every link resolving back
to its source with matching size; generating all of them took 39 ms.

## 13:20 Rendering a world from its descriptor

`src/render/`: a shared 256² tileable noise texture drives triplanar detail on
every PBR surface by kind (paving with per-slab tint and grooves, sand ripples
with glints, banded rock, glowing moss, bark, snow, cracked ice, board-marked
concrete with snow on its upper faces); quadtree terrain with skirts, a bounded
tile cache and a per-frame build budget that never shows holes; instanced
props from the same chunked placements physics uses; an analytic sky with sun,
moons (with phases, maria and craters), stars, aurora and clouds, also used for
the ocean's reflections; height fog with sun inscattering; and per-world
environment maps made from the sky.

## 13:30 The first full app, and what was wrong with it

Snapshot 04 is the first frame of the real app. Faults: every object without
a per-vertex colour attribute rendered **black** (the materials asked for
vertex colours; WebGL's default attribute value is zero), the great door was a
small rectangle 80 m away instead of the enormous doorway of the brief, the
light was flat lavender, and the view cache thrashed (nine worlds built, three
disposed in six frames: the recursion reaches about eight worlds from the
spawn). Also `flat` is a reserved word in GLSL ES 3.0.

Recomposed the Threshold (snapshot 05): a long deck in one-point perspective
with a colonnade left and the stoa right, the doorway now 12 × 32 m and 58 m
from the spawn, the sun low at front left so the door is backlit and the
pillars' shadows stripe the deck. The desert became a violet twilight: the sun
just set behind the great door (its afterglow lights the dunes facing you),
and the three moons rise in the east, placed so they sit inside the doorway as
seen from the spawn. View cache raised to ten worlds; deeper recursion levels
use a nearer far plane.

Snapshot 06: forest, glacier, hall and the room that contains itself on first
render. The forest was garish (moss patches and caps too bright), the glacier
was lost in white fog, the hall was lit flat with no sunbeams, and the mirror
room's lodestone stood where the camera spawns. Retuned all four.

## 13:40 The acceptance test, in a browser, with real input

`verify.mjs` drives the page with real keyboard and mouse events (a `?nolock`
test mode replaces pointer lock with drag-to-look; the input path is the same)
and steps frames itself. It walks 58 m to the great door, releases short of it
and eases in with key taps until the eye is 3.3 cm from the plane, looks left,
right and down (snapshot 07: the jamb is lit by dawn on one half and twilight
on the other; looking down, the deck meets the sand exactly at the plane),
compares the frame 5 mm before the plane with the frame after a 1 cm step
across it (mean change 0.24/255; 0.01 % of pixels change by more than 40), walks
out, turns round with the mouse and checks the doorway is brighter than the
desert around it (the dawn platform behind: snapshot 08), walks back, and
asserts exactly two crossings. My first versions of the test were wrong twice:
a stop condition that a 7.7 cm-per-frame walk jumps over, and "reset" mouse
moves that themselves rotated the camera.

## 13:50 The rest of the test categories, in Node

`tests/multiverse.test.js` and `tests/recursion.test.js`. Generation is
fingerprinted (every generated field, numbers rounded to 1e-6) and compared
across repeated runs for three universe seeds and 46 worlds each, including the
height fields and scatter chunks; different universe seeds change 60 of 60
sampled worlds. 1,379 links across 406 worlds resolve back to their source
with the same opening and frame, and each round trip is the identity. A
breadth-first walk from the origin reaches more than 20 lattice rows with
degree at most 12. A save written, then "unloaded" (fresh caches, fresh save
object from the same storage), restores the woken lodestone, the landmarks
and the position, and the regenerated world's fingerprint is unchanged.

The recursion test runs the *real* `PortalRenderer` against a stub WebGL
renderer that only counts calls, in the room that contains itself (two
cycles), along the stoa, up the skylight, and from 120 random poses in many
worlds: depth and render budgets always hold, and cycles end in a terminal
fill. To make this possible every module now imports the vendored three.js by
relative path, so Node loads the renderer code with no install.

The determinism test caught a real bug: a careless edit had deleted the body
of the night-desert branch, so some procedural deserts had no atmosphere.

## 14:00 Walking the impossible spaces

Browser checks (`verify.mjs impossible`, snapshot 09): 25 s north along the
44 m stoa never leaves it (two crossings); the eight-metre cell's door opens
into a hall in which the walker runs 99 m; the room's east door lets you in by
its west door; and walking through its north window drops you in through its
own ceiling, rights you in about half a second and lands you upright.

Two physics bugs surfaced. Walking into the cell door's 0.4 m threshold slab
stopped dead: the step-up probe only moved the per-frame distance (4 mm after
the wall contact had zeroed the velocity), never clearing the edge, and then
dropped the full step height so the capsule sank beside the edge and was
pushed back. Fixed by probing with the intended walk, descending in small
increments, and counting an edge under the bottom of the capsule as ground.
And realigning to gravity rotated the velocity with the body, which turned a
fall into a forward slide; velocity no longer turns with the body.

A black blob with a bright halo in the mirror room was NaN: the procedural bump
normal divides by a surface-gradient determinant that vanishes at grazing
angles. Guarded there, and post-processing now zeroes non-finite pixels before
bloom so a single bad pixel can never spread.

## 14:05 Five more archetypes

Replaced the placeholders with real generators (snapshot 10): floating
islands joined by stone bridges over a sea of cloud; temple ruins on hills in
long light, with peristyles of fluted columns, fallen drums and cypresses; a
cavern kilometres wide with a streamed ceiling (the quadtree terrain, flipped),
stalactites, stalagmites, glowing crystals and black lakes; an endless
brutalist grid of towers and raised beams around one monolith; and a pale
geometric void with floating solids and a mirror sphere. First renders were
over-fogged; retuned.

## 14:10 The cinematic demo, sound

`src/game/demo.js`: six shots, about 55 s, each driving the real controller
(walk, turn, look) through real portals; the cuts between shots are fades.
Stills along it are snapshot 11. It must not write to the journal, and must not
show the "move the mouse" hint (both fixed).

`src/game/sound.js`: procedural WebAudio ambience from each world's
descriptor (surf, wind, sand hiss, drones tuned per world, chimes in forests,
drips in caves). Doorways leak their world's sound, so a place is heard before
it is entered. The context waits for a real gesture.

## 14:15 Discovery and persistence in the browser

`verify.mjs persistence|streaming|budget|demo` (snapshot 12): take the
instrument with E, wake the lodestone behind the great door, cross into the
desert, open the journal (worlds with photographs, the woken lodestone starred),
reload the page: position, lodestone, instrument and visits are restored, and
the regenerated Threshold shows its lodestone lit. Teleporting through 30
worlds built 75 and disposed 65 world views, never holding more than the
cache's 10. Live depth and render budgets hold from (1, 2) to (5, 24). Four
extreme views (grazing the great door's plane, straight up the skylight,
straight down at a threshold from both sides) have no black or NaN pixels.
The demo finishes in 53.4 s with six real crossings through five worlds.

## 14:25 Polishing the first impression

The opening view is the first five minutes, so it got the most attention. The
spawn moved onto a four-metre terrace at the south end of the deck, with a
broad stair down, so the first frame looks over the deck to the sea and the
door. The great door gained a stepped crown and glowing glyph columns on its
jambs. From the deck's edge the ocean showed a regular tiled pattern (one noise
scale at a nine-metre period); it now mixes three rotated scales and drops the
fine detail with distance, and reads as open water with a glitter path. The
sea stacks looked like vases (a lathe profile) and are now jagged rock; the
floating fragments are masonry blocks and column drums; the haze moved from
pink to a cooler grey, with the horizon warmer only on the sun's side.

On the other slice worlds: a dune hid the great door when you looked back from
the desert, so the desert's arrival plaza is now 22 m across; the Inner Hall's
two windows doubled in size; the glacier's sun now lights the face of the
Vault (it was lighting its back, leaving a flat grey tower); moons and the
forest's aurora are dimmer; glacier and hall exposure lower.

## 14:40 Measuring performance honestly

`?bench` renders eight fixed scenes and reports draws, triangles, world renders
and timings; `tools/bench.mjs` runs it headless. The first numbers (14 to 33
ms per 1080p frame) were impossible for a software rasteriser: `gl.finish()`
does not block here, so I was timing only JavaScript. Adding a synchronous
1-pixel `readPixels` after each frame gave the truth: SwiftShader takes 1.5 to
3.7 s per 1080p frame on this CPU. The JavaScript share still includes stalls
on the rasteriser, so I report the hardware-independent counts (78 to 323
draws, 0.02 to 2.3 M triangles, up to six world renders) and leave the benchmark
for real hardware. Along the way: every `render()` call made three.js walk and
recompute the whole world's matrix tree, and a world is rendered four to eight
times per frame; matrices now update once per frame. Terrain leaves became
128 m tiles at 64 segments near the viewer and 32 further away, halving the
terrain's draw calls without coarsening the near ground.

## 14:55 The film, and joining the collection

`tools/film.mjs` records the demo frame by frame (the engine advances exactly
1/30 s per frame, so the film is deterministic) and encodes it with the same
pinned FFmpeg wheel Tideline uses; about 1.5 s per 720p frame here. Threshold's
Node tests joined the root `pnpm test` and the Validate Runs workflow, its
verifier joined `verify:browser`, and its name joined the Run assets Chrome
provisioning list, as RUNS.md asks of new browser renderers.

## 15:10 A door with a different down, and a long walk

The brief asks for doorways into spaces with different gravity directions. The
window that opens through a ceiling already did that by pitch; I added *the
Leaning Room*, a pocket of the desert whose doorway is rolled a quarter turn
relative to the desert's free-standing door. From the desert you see the room
on its side (its lamp hangs sideways, its table stands on the wall); walking in
you arrive tilted, and the room's gravity turns you upright onto its floor in
about half a second. Simulated and added to the browser checks.

`tools/stress.mjs` hops through the multiverse with the real controller: pick
a doorway, walk into it, arrive in front of the paired doorway, walk out, check
you are upright and standing, and every fifth hop walk back home. The first
run (120 hops) stuck once: in a generated glacier a concrete wall 120 m long
had been placed by its centre's distance from the doorways alone and ran
straight across a plaza. The same class of bug could affect the glacier's
vault and towers, the forest's eldest tree, the cavern's great column and the
brutalist pillars and beams, so all now keep their whole extent off doorway
plazas. The second run (750 hops) found two wormhole doorways generated 6 m
apart, one in front of the other: doorway bearings are now spread to keep
24 m between doors. It also showed my invariant was wrong: I had flagged the
eye being behind a portal, but portals are one-sided and walking through a
doorway's back is ordinary walking; the invariant is now that no step passes
front to back through an opening without crossing. The third (6,000 hops, six
seeds) failed only at the Inner Hall's windows, whose 0.9 m sills needed a
jump; they are now 0.5 m. Then 6,000 hops with no failures. A 120-hop version
runs in the Node suite.

Note on the film: it was recorded from the code as it stood at 14:57. Since
then the desert gained the sideways door (115 m behind the demo's desert shot)
and one distant glacier structure moved; the release asset, rebuilt by the
Run assets workflow from the committed source, will include those changes.
