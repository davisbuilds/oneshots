# Brief

The prompt that started this run, verbatim, sent 2026-09-26 19:17 UTC. Later
human messages follow with their times.

> Create a cinematic Blender film titled “ARTEMIS II — Built for the Journey.”
> Show NASA’s Artemis II launch vehicle beginning as individual components and subassemblies, assembling into the complete SLS Block 1 rocket and Orion spacecraft, then launching from Kennedy Space Center’s Launch Complex 39B.
> The creative arc is precision → scale → power. Begin with the intimate beauty of individual engineered parts and end with the overwhelming scale of liftoff.
> I am comfortable with hours of modeling, rendering, and iteration. Take creative ownership, make routine decisions autonomously, and produce the finished film—not just scripts or a proposal.
> Research and configuration
> Before modeling, gather official NASA and ESA diagrams, dimensions, photographs, and launch references. Build a compact reference sheet and component hierarchy. Prioritize Artemis II-specific hardware and markings; check generic SLS references carefully because they may show other configurations.
> Useful starting references:
>
> * https://www.nasa.gov/artemis-ii-press-kit/
> * https://www.nasa.gov/reference/space-launch-system/
> * https://www.nasa.gov/reference/sls-space-launch-system-core-stage/
> * https://www.nasa.gov/reference/european-service-module/
> * https://www.nasa.gov/reference/launch-abort-system/
>
> Use the Artemis II SLS Block 1 crew configuration with ICPS, not the Exploration Upper Stage or Block 1B configuration. Maintain consistent real-world scale throughout the project.
> Create an artistic exploded assembly sequence grounded in actual hardware relationships. It need not reproduce the chronological factory or Vehicle Assembly Building procedure. Make that distinction clear in the accompanying description.
> Model the vehicle as an assembly hierarchy
> Build separate, named, editable objects and collections with useful origins and parent relationships. Include:
>
> * Core stage: engine section, four individually modeled RS-25 engines, liquid hydrogen tank, intertank, liquid oxygen tank, and forward skirt. Include recognizable external feedlines, raceways, attachment structures, and surface details supported by references.
> * Both solid rocket boosters: five motor segments per booster, forward assemblies and nose cones, aft assemblies, nozzles, and attachment hardware.
> * Upper stack: launch vehicle stage adapter, ICPS with its tanks and single RL10 engine, and Orion stage adapter.
> * Orion: spacecraft adapter, European Service Module, crew module adapter, crew module and heat shield, protective spacecraft adapter jettison panels, and launch abort system with its protective fairing.
>
> Resolve exact nesting and interfaces from reference diagrams. Some structures enclose others; do not model the entire rocket as an arbitrary tower of end-to-end cylinders.
> Give featured assemblies meaningful smaller parts: engine bells and visible plumbing, tank sections and domes, booster joints, adapter structures, and spacecraft exterior features. Model detail according to camera distance. Use simplified, disclosed representations wherever public references do not support accurate internal geometry.
> The film should begin with recognizable components and subassemblies, rather than opening with an already completed rocket.
> Film structure
> Target roughly 75–90 seconds at 24 fps, with deliberate pacing:
>
> 1. Components — approximately 0–18 seconds.
> Open on a beautifully lit RS-25 engine detail. Reveal other components through a short sequence of macro and medium shots: booster segments, tank structures, upper-stage hardware, Orion’s heat shield and spacecraft assemblies. Establish distinct materials and impressive physical scale.
> 2. Subassemblies — approximately 18–42 seconds.
> Components move into their respective assemblies. Show the core stage coming together, engines seating into the engine section, booster segments joining, and the upper stage and Orion resolving from their parts. Use clean, understandable motion with controlled acceleration and deceleration. Let important connections register before cutting.
> 3. Full integration — approximately 42–60 seconds.
> Reveal an elegant exploded view of the entire vehicle. Bring the major assemblies into their correct final positions. Use restrained labels and leader lines to identify the principal elements. Hold a striking fully assembled hero shot long enough to appreciate the result.
> 4. Launch — approximately 60–90 seconds.
> Match-cut or transition convincingly from the studio assembly to the same vehicle on its mobile launcher at Pad 39B. Build anticipation, ignite the engines in the correct sequence, and finish with liftoff and early ascent.
>
> Treat these timings as an editorial starting point. Adjust them for a stronger film while preserving the assembly’s clarity.
> Visual direction
> For the assembly sequence, use a dark, spacious studio environment with precise rim lighting, soft reflections, and a restrained technical aesthetic. The orange insulation, white boosters, metallic engine hardware, and spacecraft thermal materials should provide the color.
> Aim for convincing physical materials: subtle foam texture and variation, painted metal, restrained seams and fasteners, realistic nozzle interiors, and reference-grounded thermal coverings. Avoid excessive weathering, random surface noise, or invented sci-fi details.
> Use cinematic lenses, composed camera moves, and selective depth of field. Keep the assembly interfaces readable. Avoid constant spinning, frantic cuts, exaggerated lens effects, and labels too small to read.
> Explore a late-afternoon Florida launch look with warm sunlight and atmospheric depth. This is an independent CGI visualization; if reconstructing the actual mission’s lighting or timing, verify those details first.
> Launch realism
> Include the recognizable mobile launcher, launch tower, relevant umbilicals, flame trench, and pad surroundings at the detail level required by the shots.
> Verify the startup sequence against launch references: the core engines start before booster ignition and liftoff. Show plausible umbilical release, sound-suppression water, steam, exhaust, and pad interaction.
> Distinguish the appearance of the RS-25 exhaust from the much more dominant booster plumes. Exhaust must originate at the nozzles, illuminate nearby surfaces, interact with the ground, and trail consistently as the vehicle rises.
> Keep Orion’s solar arrays stowed and the appropriate protective fairings and launch abort system installed during liftoff. Do not ignite the ICPS on the pad.
> Give the rocket a convincing sense of mass and increasing speed. Finish with tower clearance and early ascent; do not compress an entire flight to space into a few seconds without an explicit editorial time jump.
> Use a few complementary shots—engine detail, a dramatic low-angle pad view, and a wider tracking shot—while preserving continuity. Do not let smoke obscure the rocket for the entire climax.
> Execution and iteration
> Use Blender as the primary modeling, animation, and rendering environment. Inspect the installed version and available render devices, then test the pipeline. Use Python scripting wherever it improves reproducibility.
> Create the visuals through editable 3D geometry, materials, lights, animation, and rendering. Do not substitute generated video for the assembly or launch. Official reference assets may be used where appropriate, provided their provenance is recorded and the required assembly remains editable.
> First produce a low-resolution animatic of the complete film. Check pacing, component visibility, camera paths, assembly collisions, final alignment, and the launch transition before expensive rendering.
> Develop strong stills for the engine close-up, exploded assembly, complete vehicle, and launch. Inspect the actual rendered images and revise them. Then render short motion samples to catch flicker, smoke artifacts, clipping, unstable textures, and unreadable labels.
> Use simulation where practical and procedural effects where they achieve the required quality more reliably. Benchmark representative frames and save resumable image sequences. Preserve project checkpoints, simulations or caches, and a concise progress log.
> If sound tools are available, add restrained original or properly licensed sound design: mechanical assembly textures, a rising atmospheric bed, and a powerful launch climax. Sound should support the images without requiring narration.
> Deliverables
>
> * The finished MP4, targeting a polished 1080p master; render 4K if practical after benchmarking.
> * Four high-resolution stills: engine detail, exploded assembly, complete vehicle, and launch.
> * The editable `.blend` project with organized collections, named components, cameras, materials, and animation.
> * Source scripts, dependencies, required assets or caches, and clear reproduction instructions.
> * A brief source list and disclosure of geometric simplifications, artistic liberties, and unverified details.
>
> Save the final work and source bundle persistently and provide downloadable links. Lead the final response with the film and strongest still.

## Later messages

**2026-09-26 23:44 UTC** — reply when the agent paused to ask permission to
rebuild the project file and replace 121 launch frames rendered with an
earlier water effect (its auto-mode safety check had blocked deleting them):

> Approved

<!-- after delivery -->

**2026-09-27 20:33 UTC** — after delivery; changed only the repository layout:

> Can you rebase the branch or pull in changes from main, and implement the structural outline recently set up by other one shots branches for this effort?
