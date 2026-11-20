THE CAMBRIAN ENGINE — Life Without a Script

You are GPT 6.2 Astra. Build an extraordinary artificial-life simulation called The Cambrian Engine.

Create a beautiful, interactive digital ecosystem in which organisms evolve over thousands of generations through mutation, inheritance, natural selection, and ecological competition.

The central challenge: life must actually evolve. Do not script species, predetermine evolutionary milestones, or animate creatures performing hard-coded behaviors. Build the underlying mechanisms from which interesting behaviors, adaptations, and ecological relationships can emerge.

I want to watch a world come alive, discover organisms that the developer never explicitly designed, and understand why they evolved.

The experience

Imagine looking into an alien primordial ocean through an impossibly powerful microscope.

Tiny translucent organisms drift through illuminated water. Some propel themselves using flagella or fins. Others develop sensory structures, pursue nutrients, evade threats, compete for territory, or consume other organisms. Populations expand, diversify, collapse, and occasionally recover.

Over generations, successful adaptations spread. New evolutionary branches emerge. The ecosystem develops a history that was never written in advance.

The experience should be visually mesmerizing, scientifically interesting, and genuinely interactive.

Build five interconnected systems

1. An evolutionary engine

Create organisms with heritable genomes encoding meaningful traits such as morphology, locomotion, sensory capabilities, metabolism, feeding mechanisms, defensive structures, and behavioral control.

Organisms must consume energy, move through their environment, interact, reproduce, mutate, and die.

Evolution must arise from differential survival and reproduction. Do not rely on a designer-authored fitness score that rewards predetermined outcomes.

Make meaningful variation possible in both physical structures and behavior. Consider evolvable neural controllers, sensor configurations, or other mechanisms that allow organisms to develop strategies beyond those explicitly programmed.

Use computationally tractable approximations, but keep the causal relationships consistent and document major biological simplifications.

2. A living ecology

Simulate a spatially continuous environment with environmental gradients, nutrients, resource renewal, energy transfer, and ecological constraints.

Let organisms compete for resources and interact through mechanisms capable of supporting predation, avoidance, cooperation, or specialization.

Environmental changes should exert genuine selection pressure.

The simulation must have an explicit energy budget and resource model. Organisms cannot reproduce indefinitely without paying metabolic and reproductive costs.

Prioritize one coherent, evolving ecosystem over a large collection of disconnected features.

3. An exceptional visual experience

Create a distinctive aesthetic somewhere between high-end scientific visualization, an alien nature documentary, and an interactive digital artwork.

Organisms should have recognizable, procedurally generated bodies that visibly correspond to their inherited traits. Their structures and movements should communicate how they survive.

Use beautiful underwater lighting, translucency, particles, fluid-inspired motion, and carefully designed camera behavior.

The interface should feel like an advanced research instrument: elegant, restrained, information-rich, and highly responsive.

Include an autonomous cinematic observation mode that finds and follows interesting organisms or ecological events.

Do not use AI-generated images or videos as a substitute for rendering the simulated world.

4. An evolutionary observatory

Give the player tools to investigate the world:

* Select an organism to inspect its genome, anatomy, energy balance, behavior, age, and ancestors.
* Explore an evolving phylogenetic tree showing lineages, divergence, and extinction.
* Plot population dynamics, trait distributions, biodiversity, and ecological relationships.
* Accelerate, pause, and inspect evolution over many generations.
* Introduce environmental perturbations and compare evolutionary outcomes.
* Revisit historical states and watch significant evolutionary events unfold.

The visualizations must derive from real simulation state, not decorative or fabricated data.

Provide an especially compelling way to move between the microscopic life of an individual and the macroscopic evolutionary history of its lineage.

5. A scientific verification framework

This is critical.

Make the simulation deterministic under a recorded random seed and fixed simulation parameters. Separate the simulation engine from rendering so that it can run headlessly at accelerated speed.

Build automated tests and experiments that verify:

* Inheritance, mutation, reproduction, and death work correctly.
* Energy and resource accounting obey the documented model.
* Organisms respond to environmental pressures through the implemented mechanisms.
* Evolutionary histories and lineage relationships are internally consistent.
* Identical seeds and actions reproduce identical simulation results.
* Long-running simulations remain numerically stable and within reasonable performance bounds.

Run experiments across multiple seeds and different environmental conditions.

Compare evolutionary outcomes against meaningful controls, including mutation-disabled populations or alternative selection pressures. Look for measurable adaptation, diversification, and changes in ecological relationships.

Do not claim that intelligence, predation, speciation, or complex behaviors emerged unless you can show evidence from the actual simulation. Distinguish observations, interpretations, and mechanisms deliberately implemented by the developer.

If an exciting outcome fails to emerge, investigate why instead of scripting it into existence.

Technical direction

Build this as a self-contained interactive browser experience, runnable locally without network access or a backend.

Choose an appropriate rendering architecture, such as WebGL2, and prioritize a high-performance simulation capable of supporting substantial populations over many generations.

Use TypeScript or JavaScript for the interactive system. Development tools and conventional libraries are permitted where justified.

The simulation must support configurable random seeds, headless execution, reproducible experiments, and data export.

Maintain a clear separation between simulation state, evolutionary mechanisms, rendering, analysis, and user interaction.

Use real profiling and benchmarks to guide performance decisions.

Creative autonomy and execution

You have substantial creative freedom over the creatures, simulation architecture, interface, art direction, and presentation.

Treat this as an ambitious autonomous engineering and scientific-computing project.

Start with a minimal, functioning ecosystem that can sustain reproduction and evolution. Validate its behavior before introducing increasingly complex morphology, ecological relationships, and visuals.

Build early, run experiments, observe failures, inspect actual browser screenshots, and iteratively improve both the simulation and presentation.

Save meaningful intermediate snapshots, experimental results, and design alternatives. Be willing to abandon approaches that produce beautiful but scientifically unconvincing results.

Spend serious effort on the final visual experience. I want something that inspires genuine curiosity and wonder, not an academic simulation wrapped in generic dashboard components.

Prefer one remarkable, deeply integrated experience over numerous shallow features.

Deliverables and repository integration

Work in my davisbuilds/oneshots repository on a dedicated branch, using runs/cambrian-engine/.

Read and follow RUNS.md and AGENTS.md.

Preserve the original brief, an honest development log, numbered screenshots, experimental results, source code, reproduction instructions, and the required run.toml manifest.

Provide:

1. The completed, playable evolutionary ecosystem.
2. An interactive evolutionary observatory and lineage explorer.
3. A headless simulation and automated verification suite.
4. Reproducible evolutionary experiments with documented findings.
5. A cinematic demo mode showcasing genuine simulation events.
6. A concise technical explanation of the evolutionary mechanisms, observed results, limitations, and performance.
7. A polished set of screenshots and a pull request containing the completed run.

Keep changes isolated to this run wherever possible, especially because another agent may be working in the repository concurrently. Do not merge the PR without authorization.

Success means observing something genuinely surprising emerge from mechanisms you designed, then being able to explain and reproduce it.

Build the world. Let evolution do the rest.
