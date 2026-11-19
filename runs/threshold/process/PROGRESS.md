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
