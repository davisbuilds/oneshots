# Progress log — One Equation, Three Worlds

Resumable: every render step skips outputs that already exist.

1. Environment: Python 3.11, 4 CPU, 15 GB, no GPU. Installed numpy/scipy/numba/pillow/matplotlib,
   `bpy` 5.0.1 wheel (Blender as a Python module; Cycles CPU works, Eevee does not — no GL), ffmpeg 6.1 (apt).
2. Trajectory: DOP853 rtol=atol=1e-12 on [0,120], sampled dt=1e-3. Cross-checks: DOP853 at 1e-13/1e-14
   agree to 1e-3 until t≈27.4; LSODA diverges by >1 at t≈27.4. Segment chosen t∈[8,27]
   (studies/00_, 01_). Written to data/lorenz_canonical.*
3. Copper: studies/copper_s01..s08. Fixed Mix-node socket bug (Blender 5 duplicate socket names)
   and grazing-angle sheen on plinth. Canonical camera K = data/camera_canonical.json (az -20, el 6, 50mm).
4. Film Matter frames rendering: frames/copper (24spp, OIDN), log frames/copper_render.log.
