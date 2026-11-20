# What was measured

## Spatial behavior

The Node suite exercises rigid portal frames and their inverses, numerical round trips of position, orientation and velocity, arched edges, destination-side collisions, high-speed motion and immediate reversal. The known-answer case started red with identity transport. A fixture with two mouths 5 cm apart sends one movement segment through both before it hits a receiving wall. Another performs 1,000 consecutive crossings starting exactly at a segment endpoint.

The graph checks include 1,500 address constructions along five deep branches, named return edges, equal regenerated descriptors, and equivalent terrain buffers for a given seed. Shared tile edges agree in height, colour and lighting normals at both levels of detail. A separate 48-seed walk exercises 49,152 swept portal transitions while retaining at most eight descriptors. Individual transform checks use tolerances of roughly 10⁻⁸ metres. The crossing test allows 2 × 10⁻⁶ metres to include the intentional separation from a crossed plane.

The Chrome fixture samples the actual WebGL framebuffer. The source and destination have distinct flat colours. A green witness moves from pixel 150 to 131 to 112 as the observer moves sideways. The fixture also puts an occluder in front of the opening, puts a second object on the clipped side of the destination, and rolls and tilts the exit frame. Looking along the doorway at ±2 mm from its plane, four sample positions read blue, blue, red, red on both sides. The same split survives the exact eye-plane case. These are selected witnesses under controlled geometry. The numbered world screenshots provide separate visual evidence.

Two GPU load/evict circuits rendered a dozen addresses each. The renderer reached 126 geometries and 19 textures in each circuit. Clearing the worlds returned both runs to 31 geometries and 3 textures with the portal renderer and shared library still alive. The CPU tests also observe disposal events from terrain geometry and instanced batches. Three.js reports allocation counts here. GPU byte usage, browser process memory and driver caches were not measured.

Playwright walks with the real input handlers, sounds a station, reads its journal entry, turns around in the desert, crosses home and reloads. It exercises a limited pass budget, the complete guided route, post-eviction instrument state, journal recall and narrow layout. A separate browser context disables networking, opens the portable HTML from disk and crosses into world 2. The capture script records an independent out-and-back walk.

## Frame and GPU timings

Hardware was an Apple M4 Mac mini with a 10-core GPU and 32 GB unified memory. Chrome 157.0.8103.79 ran headless through ANGLE Metal on macOS 26.5.2. The browser viewport and drawing buffer were 1920 × 1080 at device scale 1. Node was 24.22.1, the collection’s Playwright was 1.65.0, Python was 3.14.9 and FFmpeg was 8.1.2.

The benchmark samples 2.5 seconds at each of seven viewpoints. It measures elapsed wall time with `performance.now()` between animation callbacks. Disjoint-checked WebGL timer queries measure one rendered frame in twelve, including recursive destination passes. Counters summarize the last frame of each interval. The opening uses fixed native resolution. Adaptive resolution is enabled for the moving samples and stayed at native resolution in this run. [Machine-readable samples](benchmark.json)

| View | Median frame | P95 frame | Median GPU | Scene views | Draw calls | Triangles |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Opening | 16.7 ms | 18.7 ms | 4.35 ms | 4 | 188 | 803,630 |
| Approach | 16.7 ms | 18.7 ms | 4.42 ms | 4 | 178 | 787,594 |
| Saffron Sea | 16.7 ms | 18.6 ms | 4.99 ms | 3 | 132 | 680,464 |
| Vesper Canopy | 16.7 ms | 18.4 ms | 5.11 ms | 4 | 146 | 796,990 |
| Glass Meridian | 16.7 ms | 18.9 ms | 5.12 ms | 5 | 177 | 679,510 |
| Folded Archive | 16.7 ms | 18.4 ms | 5.45 ms | 6 | 150 | 843,752 |
| Returning aisle | 16.6 ms | 18.5 ms | 5.58 ms | 6 | 160 | 853,512 |

The most expensive sampled GPU view was the returning aisle, where nested doors retained six scene passes. Scissoring bounds fragment work. An instanced batch can still submit distant geometry outside the narrow visible opening. First entry also builds geometry and may compile a shader or allocate a shadow target. The sampling windows cover warm movement and return views. They do not characterize cold-start stalls, display latency, every possible seed, software rendering, mobile GPUs or other browser engines.

## Reproduction

Run the commands in the run README. The verifier writes full-resolution screenshots, the sampled pixel values, disposal counts and the observed cinematic wall time under `output/playwright/`. The guide ran for 52.1 wall-clock seconds in the recorded end-to-end pass. The benchmark writes a fresh `performance.json`. A system without the timer-query extension reports a null GPU measurement. [Run instructions](../README.md)
