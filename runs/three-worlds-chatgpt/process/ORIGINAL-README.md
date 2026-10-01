# One Equation, Three Worlds

An original computational triptych and a 28-second silent gallery film. One open Lorenz trajectory becomes a suspended copper filament, an ink trace, and a moving light. Everything visual was made through numerical simulation, code, procedural materials, and conventional rendering. No image/video generation models, downloaded artwork, meshes, or texture images were used.

## The mathematics

```
dx/dt = σ(y − x)
dy/dt = x(ρ − z) − y
dz/dt = xy − βz
σ = 10; ρ = 28; β = 8/3; (x₀, y₀, z₀) = (1, 1, 1)
```

- Solver: SciPy `solve_ivp`, explicit DOP853, dense output.
- Integration: t = 0–60; rtol = 1e−11; atol = 1e−13; maximum internal timestep 0.01.
- Initial transient: t < 20 excluded from artistic selection.
- Selected contiguous segment: **t = 40–47**, inclusive.
- Canonical sampling: Δt = 0.002; **3,501 positions**. The CSV and NPZ contain the same trajectory; NPZ retains full floating-point values, CSV has 12 significant digits.
- Nine segment studies informed the selection. This interval balances open lobe interiors with a strong crossing and deliberately unequal turns.

`data/lorenz-canonical.npz` is authoritative. All three works use its geometry. The sculpture reads its CSV export; ink and light use the exact Blender camera projection recorded in `data/camera-projection.csv`. There are no independently generated approximations of the butterfly shape.

The affine world transform is `(x/10, y/10, (z−6.26469892)/10+1)`. Camera position is `(6, −24, 7.3)`, target `(0, 0, 2.45)`, orthographic scale 10.3. Brush width and light intensity vary, but the stroke centerline remains the projected trajectory. The tube uses an open polygonal spline with capped ends. Its two endpoints are approximately 13.12 Lorenz coordinate units apart. **No closing segment was added.** Separate suspension cables are installation hardware, not part of the trajectory.

## Artistic choices

**Matter.** CPU Cycles rendering of a continuous copper tube, sparse procedural verdigris, fine surface roughness, dark mineral-grain basalt, recessed plinth foot, and thin suspension wires. Large area lights provide warm metal reflections, a cooler rim, and grounded shadows. A brighter, walled gallery study was rejected in favor of a quieter dark setting.

**Trace.** Procedural warm paper combines multiscale variations with fine fibers. The brush uses pressure modulation, variable width, edge deposition, restrained capillary blur, deterministic bristle channels, and changing optical pigment density. These are an artistic model of ink behavior, not a fluid simulation. No paper image was imported.

**Energy.** The same 3D curve is projected through the same camera. Depth attenuates the strokes, a faint guide reveals the installed curve, and an amber head leaves a cooling blue-green trail. Floating-point bloom, exposure roll-off, supersampling, and fixed dithering provide the glow. This is a depth-aware Python emissive composite, not a path-traced volumetric light simulation. There is no particle cloud.

## Film and timing

The film is 1920×1080, 24 fps, 672 frames, H.264/yuv420p, with a deliberate silent-gallery presentation.

- 0–4.7 s: copper, with a restrained opening title.
- 4.7–6.7 s: matched copper-to-ink dissolve.
- 6.7–9.6 s: ink.
- 9.6–11.6 s: matched ink-to-light dissolve.
- 11.6–22.4 s: the head traverses the selected interval in temporal order.
- 22.4–23.4 s: endpoint hold and light decay.
- 23.4–24.7 s: explicit editorial dissolve to the triptych.
- 24.7–28 s: final triptych hold.

During motion, model time is `40 + (7/10.8) × (film_seconds − 11.6)`, clamped to [40,47]. This is a **constant slowdown**: no arc-length reparameterization, reversal, random relocation, or loop. The trail has a 1.7-model-time-unit exponential decay scale and a finite six-unit extent. The standalone light still is an exposure at t=46.5. The final triptych is a montage of the three stills; its light exposure is explicitly editorial, not a continuation back through time.

## Actual tools and reproduction

Executed here: Python 3.12.14, NumPy 2.3.5, SciPy 1.17.0, Pillow 12.3.0, Blender 4.0.2, and system FFmpeg with libx264. About 10 GB of RAM and nine logical CPUs were available; no GPU was exposed. Blender was successfully installed and used. **The `.blend` and scene builder are executed deliverables, not an untested fallback.** This build has no OpenImageDenoiser; the final copper image uses 256 samples with denoising disabled.

From the extracted project root:

```sh
python3 -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
# Put Blender and FFmpeg executables on PATH.
python source/run.py
```

On macOS, if using the Blender app, add its executable directory to PATH before running:

```sh
export PATH="/Applications/Blender.app/Contents/MacOS:$PATH"
```

To rebuild only selected outputs:

```sh
blender -b -t 8 --python source/build_scene.py
python source/paint.py
python source/energy.py
python source/compose.py
python source/render_energy_frames.py
python source/film.py
```

The default pipeline preserves the canonical dataset. `python source/run.py --resimulate` repeats the original integration and segment selection. Chaotic systems amplify tiny numerical differences: preserve the included dataset when exact geometry matters. Random seeds are fixed. Pixel-level rendering may differ across Blender versions and platforms.

The energy renderer caches numbered PNG frames in `checkpoints/energy-frames/` and skips completed frames after interruption. Delete that cache after changing its renderer or timing. Final animation frames are rendered at 2880×1620 and reduced to 1080p; the light still is rendered at 4800×2700 and reduced to 3200×1800. Source fonts and their licenses are included. No network access is needed after dependencies are installed.

## Files

- Three clean 3200×1800 stills and a 4200×2120 composed triptych.
- A finished MP4, supplied separately from the source archive.
- `source/One-Equation-Three-Worlds.blend`: editable copper scene.
- `source/*.py`: complete simulation, materials, ink, light, composition, and film pipeline.
- `data/`: canonical trajectory, projection, transforms, solver metadata, and environment record.
- `studies/`: selected composition, material, and film studies.
- `checkpoints/progress.md`: concise decisions and completion record.

The source archive excludes disposable per-frame caches; rerunning the pipeline recreates them. The stills and MP4 are also supplied separately for direct sharing.

## Verification

All final stills, full-resolution crops, the composed triptych, consecutive motion frames, and representative transition frames were opened for visual inspection. The encoded MP4 was fully decoded without errors; actual decoded motion and final frames were opened. The file contains 672 frames at 24 fps and is exactly 28 seconds long. Numerical checks and encoding metadata are retained in `data/validation.json` and `data/film-verification.json`.

The local, tighter-tolerance reintegration from the selected segment's initial point agrees within 2.43×10⁻⁷ Lorenz units. This is a local consistency check, not a claim of exact long-horizon prediction in a chaotic system. Progress notes preserve the creative decisions and rendering repairs.
