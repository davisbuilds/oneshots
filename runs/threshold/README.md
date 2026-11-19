# THRESHOLD — An Infinity of Elsewheres

![The Pelagic Causeway opens onto the three moons of the Saffron Sea](preview/hero.webp)

Walk through the arch ahead of you. Turn around in the desert and the causeway is still there, right down to the tide dial on the paving. The side chapel takes a shorter route to the Folded Archive. Its western aisle is a good place to keep walking straight.

## Play

From this directory, run the following command and open the local address it prints. The source edition uses ES modules and includes every runtime dependency.

```sh
python3 -m http.server 8080 --bind 127.0.0.1
```

For a single file you can open directly or share, run `python3 tools/build.py` and open `output/threshold.html`. Rebuilding it takes Python 3.11+ and the files in this directory. The offline edition also runs with the browser network disabled. Use a desktop browser with WebGL 2 and a keyboard. Chrome is the verified browser.

Choose **Enter the atlas** to walk, or **Guided passage** for a 52-second journey through five worlds. The guide uses the same walker and collision system. Closing the guide returns you to your previous position. The sound button starts an optional synthesized drone. Sounding an instrument adds a bell tone.

| Control | Action |
| --- | --- |
| WASD or ↑ ↓ | Walk. Hold Shift to run. |
| Mouse or ← → | Turn. Drag to look when pointer lock is unavailable. Page Up and Page Down tilt the view. |
| E | Sound a nearby instrument and unfold its chart. Stars point toward the local doors. Recorded passages light up. |
| J | Open the field journal, inspect recorded connections, or recall a previously visited mooring. |
| Esc / G | Pause exploration / start or leave the guide. |
| I | Inspect frame timing, draw calls, geometry, memory and recursion. Adjust the depth, pass budget or adaptive resolution. |

The first moorings are the Pelagic Causeway, Saffron Sea, Vesper Canopy, Glass Meridian and Folded Archive. Look for the tide dial, half-buried orrery, hanging spore lights, ice observatory and archive tablets. Each instrument keeps a field note. The journal saves visits, two-way links and instrument changes in IndexedDB. The last walking pose lives in local storage. Saves belong to the browser origin, so use the same local address and port to resume.

## How the doors work

- **Addressing.** World 1 is the root. The two outward sockets of world *n* connect to *2n* and *2n + 1*. Integer division and parity recover the exact return socket. An archive has a second reciprocal pair inside its own address. World identity uses arbitrary-precision integers. A 32-bit seed drives geography and variation, so individual landscapes and names can repeat. [Atlas](src/atlas.js)
- **Transport.** A gate carries a rigid local frame with its positive Z axis pointing out of the opening. Both cameras and the walker use `exit × halfTurnY × inverse(entry)`. The walker sweeps the entire displacement, compares the earliest aperture and expanded-wall intersections, then rotates orientation, velocity and unspent displacement. A tiny signed separation allows an immediate reversal. [Spatial engine](src/spatial.js)
- **Rendering.** Each virtual camera inherits the viewer’s lens. Projected aperture bounds are clipped in homogeneous coordinates against the parent window, viewport and destination half-space. The renderer budgets visible cameras breadth-first, then draws their scenes deepest-first into pooled, scissored targets. A fragment shader intersects the eye ray with the arched opening and writes the plane’s actual depth. This also draws the sliver between the eye and near plane during a sideways crossing. The exit plane clips destination geometry and particles. Foreground objects still occlude the image. [Portal renderer](src/portals.js)
- **Streaming.** Eight scene slots cover the active camera and the maximum six destination passes. A terrain field draws 25 tiles with fine and coarse resolutions and keeps at most 64 tile variants per resident world. A coarse outer ring carries terrain into the haze. Each scene owns its instances, tile buffers, particles and shadow map. A finite shared library owns reusable stonework, vegetation geometry and materials. [World ownership](src/world.js) · [Terrain](src/terrain.js)
- **Persistence.** Generation has no dependency on visit history. The journal commits both ends of a passage in one transaction, including the two mouths of a self-loop. It pages older records independently of the scene cache. A rebuilt world rehydrates its instrument and map from those records. [Journal](src/journal.js)
- **Art.** The arches are individually cut voussoirs. The tide, celestial bodies, cloud layers and aurora are shaded in the browser. Instanced masonry, fluted fungi, cleaved ice and eroded mesas are generated geometry. Foliage density, terrain and material variation come from coordinate-addressed fields. [Architecture and vegetation](src/places.js) · [Atmosphere](src/atmosphere.js)

The authored doors stand upright and share one metre scale, aperture shape and gravity direction. The render transform handles tilted and rolled rigid frames. Locomotion is a grounded first-person controller with conservative footprint collisions. Small plants, ornamental details and distant silhouettes are scenery. The deck edges are solid. There is no jump, free flight, movable rigid body or gravity-changing passage.

The gate aprons leave room for the walker’s footprint to straddle the seam. Environmental motion uses the session clock and resumes at its current phase on revisit.

The graph can keep allocating addresses subject to ordinary machine limits. Five architectural families recur. Browser storage limits the discovery record. A long address takes proportionally more space to represent. By default a frame can visit three recursive levels and five destination scenes. A terminal opening shows its atmospheric colour when a limit is reached. The planner culls outside the inherited window and half-space. It can still draw a room hidden by opaque foreground geometry within that window.

## Reproduce and verify

From the repository root, install the collection’s locked browser tooling with `pnpm install --frozen-lockfile`. Use Node 24, current Google Chrome, Python 3.11+ and, for the movie, FFmpeg with VP9 decoding and ffprobe. The shared launcher checks the running browser version before opening any content.

```sh
cd runs/threshold
python3 tools/build.py
node --test tests/*.test.mjs
node tools/verify.mjs
node tools/benchmark.mjs
node tools/capture.mjs
python3 tools/build.py --check
node tools/capture.mjs --verify
```

The browser tools start an ephemeral loopback server and close it afterward. Verification includes direct keyboard travel, a look back through the entrance, tuning and persistence, an actual archive loop, narrow journal layout and a disconnected walk inside the packaged HTML. A separate GPU fixture samples portal, foreground and clipped witness pixels. The film records real canvas frames during a keyboard-driven excursion and remuxes them into a seekable WebM. Full-size outputs and machine-generated receipts go into `output/`. The original movie was recorded on the Metal host described in the measurements. The Linux release capture has not been timed. If a hosted software renderer cannot keep up, the original film and HTML can be published manually with their checksums under the collection’s release procedure.

[Watch the out-and-back gameplay preview](preview/passage.webp) · [Verification and measurements](process/MEASUREMENTS.md) · [Chronological field notes](process/PROGRESS.md) · [Numbered visual development](process/snapshots/) · [Original brief](brief.md)

## Dependencies and provenance

The two Three.js distribution modules are unmodified files from the MIT-licensed npm release `three@0.187.0`. The upstream portal example informed the frame conventions. The traversal, planning, clipping shader, resource management and worlds in this run were written for THRESHOLD. [Three.js release](https://github.com/mrdoob/three.js/releases/tag/r187) · [Upstream portal example](https://threejs.org/examples/webgl_portal.html) · [MIT license](vendor/THREE-LICENSE.txt)

The title face is Instrument Serif, bundled in regular and italic under the SIL Open Font License. Every landscape and sound is generated by the run. [Font project](https://github.com/Instrument/instrument-serif) · [Font license](fonts/OFL.txt)
