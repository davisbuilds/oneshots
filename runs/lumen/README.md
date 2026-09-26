# Lumen.

**A physically based, progressive path tracer in a single HTML file.** Zero
dependencies, zero build step — `open index.html` and every pixel on screen is
Monte Carlo light transport, converging live at millions of samples per second.

**Model:** Fable 5 (xhigh reasoning)

Built by Claude as an unconstrained capabilities demo (the sequel to the
17-minute speedrun in `../seventeen/`).

## The physics

This is not a rasterizer with tricks — it is an unbiased(*) unidirectional path
tracer implementing the rendering equation:

- **Next-event estimation + multiple importance sampling.** Every diffuse/glossy
  vertex samples the area light directly *and* continues by BRDF sampling; the
  two estimators are combined with the power heuristic, so both soft penumbrae
  and sharp glossy highlights converge fast.
- **GGX microfacet BRDF** for metals — Trowbridge-Reitz NDF sampling, Smith
  shadowing-masking, Schlick Fresnel. Roughness is the real thing, not a blur.
- **Dielectric glass** — Fresnel-weighted reflection/refraction with total
  internal reflection, plus **Beer–Lambert volumetric absorption** through the
  interior (tinted glass darkens with thickness, as it should).
- **Spectral dispersion** — each light path samples one wavelength bucket with
  its own index of refraction, so glass splits white light into real rainbow
  caustics (scene 02, toggleable everywhere).
- **Thin-lens camera** — true depth of field from aperture disk sampling;
  click anywhere to pull focus.
- Cosine-weighted hemisphere sampling, Russian roulette path termination,
  PCG-style RNG, firefly clamping(*the one pragmatic bias), ACES tonemapping.

## The product

- **4 scenes**: Cornell box (color bleeding, the classic proof), Dispersion
  (rainbow caustics), Studio (product-shot DOF across five materials), Noir
  (emissive spheres between parallel mirrors).
- **Live material editor** — click any sphere: change its type
  (matte/metal/glass/glow), color, roughness, IOR, and emission while the
  render restarts in place. Shift-drag to move spheres around the floor.
- **Orbit/dolly camera**, exposure/aperture/focus/bounce controls,
  half-res toggle, PNG export of the converged frame.
- **Adaptive sampling rate** — samples-per-frame scales with GPU headroom.

## Controls

| Input | Action |
| :---- | :----- |
| drag | orbit camera |
| wheel | dolly |
| click | pull focus; select sphere (opens material editor) |
| ⇧ drag | move selected sphere |
| 1–4 | switch scene |
| space | pause/resume tracing |
| s | save PNG |

## Verification

`verify.mjs` runs the tracer in headless Chromium (SwiftShader software GL),
accumulates hundreds of samples per scene, screenshots all four scenes, tests
sphere-picking and the material panel, and checks for console/shader errors.
Wall colors in the Cornell screenshot were pixel-sampled to confirm correct
scene orientation. Last run: 4/4 scenes clean, zero errors.

## Architecture notes

The scene intersector (spheres, boxes, area-light rect) exists twice: once in
GLSL for rendering, once in ~40 lines of JavaScript for mouse picking and
focus pulls — the same CPU-mirror trick used for the autopilot in
`../seventeen/`. Accumulation is ping-ponged between two RGBA32F framebuffers;
a separate display pass divides by sample count and tonemaps, so the radiance
estimate itself is never quantized.
