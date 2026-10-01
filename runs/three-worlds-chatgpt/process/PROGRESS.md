# Progress / 26 September 2026

1. Inspected environment: Python 3.12.14, NumPy/SciPy/Pillow/FFmpeg; 9 logical CPUs, ~10 GB RAM, no GPU exposed.
2. Pip bpy was unavailable. Installed Blender 4.0.2 using permitted Ubuntu packages; successful CPU Cycles test. Build has no OpenImageDenoiser; disabled it and increased final samples.
3. Numerically integrated the Lorenz system using DOP853, rtol=1e-11, atol=1e-13, max_step=.01, t=0–60. Discarded t<20. Inspected 9 segment compositions and selected t=40–47, stored 3501 samples in the canonical dataset.
4. Built and actually rendered an editable Blender copper sculpture with procedural metal/stone materials, area lighting, plinth, and separate suspension cables. Inspected the small render. Revised gallery to seamless darkness, reduced fill, and moved cables above the lobe apexes. Inspected revised render; selected this direction.
5. Built three ink studies with differing brush pressure/width. Inspected the study sheet, chose intermediate boldness, strengthened dry-brush channels. Created procedural warm fibrous paper, capillary fringe, pigment rim, and bristle gaps.
6. Built three temporal light studies and inspected them. Replaced integer bloom with floating-point bloom; added supersampling and fixed dithering to reduce jagged edges/banding.
7. Final still render: Blender Cycles, CPU, 3200×1800, 256 samples, no denoiser. Ink/light output also 3200×1800. Completed.

8. Opened the final copper composition and 1:1 crossing crop. Opened the final ink composition/crop and light composition/crop. Chose the final 4200×2120 museum-style triptych and opened it.
9. Checked a consecutive 12-frame motion study and representative transition frames. Rendered 287 light frames at 2880×1620, downsampled to 1080p. Three initially incomplete cached PNGs were identified, regenerated, and decoded successfully. Added buffered, verified atomic cache writes and resumable cache validation to the source.
10. Encoded the completed silent film: 28.000 seconds, 672 frames, 1920×1080, 24 fps, H.264/yuv420p. FFmpeg decoded the entire file without error. Opened actual decoded motion and ending frames. The final editorial triptych is a montage, not a periodic trajectory loop.
11. Verified numerical geometry: a tighter local reintegration differed by at most 2.43045e−7 Lorenz units; CSV rounding error below 5e−11; all projected centerline points inside frame; endpoint separation 13.1223 coordinate units. Stored metadata in data/validation.json.
12. Saved finished stills and studies. Packaged executed source, canonical data, editable Blender scene, fonts/licenses, instructions, and preserved studies. Final film and source bundle complete.

Resume / reproduce: see README.md; run source/run.py. No rendering work remains. Regenerate disposable light frames from source/render_energy_frames.py. Preserve canonical data for exact geometry.
