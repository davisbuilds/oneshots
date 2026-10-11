# oneshots

A public collection of **agent oneshots**: one brief handed to an AI agent,
no hand-holding, and whatever comes back. Some are single HTML files built
in minutes. Others are long-horizon runs where the agent works for hours:
studying, rendering, inspecting its own output, and redesigning before it
delivers.

Every run keeps its lineage alongside the result: the brief, verbatim; the
agent's own progress log; snapshots of the work as it developed; and the code
that reproduces it. Each run also records how many times a human stepped in.

## Runs

<!-- runs:start -->
| Run | What it is | Model | Human turns | Lineage |
| :-- | :--------- | :---- | :---------- | :------ |
| [**Luminal**](runs/luminal/) | A one-button rhythm platformer in luminous geometry: one level, Heliotrope, built on an original synthesized soundtrack, with cube, ship, wave and gravity sections, practice checkpoints and saved bests, and a solver that proves every section can be cleared. | Claude Opus 5.5 | 2 | [brief](runs/luminal/brief.md) · [log](runs/luminal/process/PROGRESS.md) · [snapshots](runs/luminal/process/snapshots) · [outputs](https://github.com/davisbuilds/oneshots/releases/tag/run-luminal) |
| [**A World in a Drop**](runs/a-world-in-a-drop/) | A 62-second procedural Blender film follows rain from a stormy ocean through imagined microscopic worlds and into the iris of an eye watching the sea. | GPT-6 | 3 | [brief](runs/a-world-in-a-drop/brief.md) · [log](runs/a-world-in-a-drop/process/PROGRESS.md) · [snapshots](runs/a-world-in-a-drop/process/snapshots) · [outputs](https://github.com/davisbuilds/oneshots/releases/tag/run-a-world-in-a-drop) |
| [**From Gate to Game**](runs/gate-to-game/) | A CPU of 1,753 NAND gates, an assembler, a compiler and a breakout game it plays in the browser; scroll from one pixel down through the instruction that drew it and the gate that flipped to a single transistor. | Claude Opus 5.5 | 1 | [brief](runs/gate-to-game/brief.md) · [log](runs/gate-to-game/process/PROGRESS.md) · [snapshots](runs/gate-to-game/process/snapshots) · [outputs](https://github.com/davisbuilds/oneshots/releases/tag/run-gate-to-game) |
| [**Borrowed Seconds**](runs/borrowed-seconds/) | A midnight museum heist: record your past selves, coordinate two locks, distract security, and steal three treasures in sixty seconds. | GPT-6.1 Sol (xhigh) | 3 | [brief](runs/borrowed-seconds/brief.md) · [log](runs/borrowed-seconds/process/PROGRESS.md) · [snapshots](runs/borrowed-seconds/process/snapshots) |
| [**The Antikythera Engine**](runs/antikythera-engine/) | A brass orrery whose gear trains were found by search; every wheel turns at its true ratio, and the planets are checked against JPL ephemerides from 3000 BC to AD 3000 (the Moon, AD 1800 to 2200). | Claude Opus 5.5 (high) | 2 | [brief](runs/antikythera-engine/brief.md) · [log](runs/antikythera-engine/process/PROGRESS.md) · [snapshots](runs/antikythera-engine/process/snapshots) · [outputs](https://github.com/davisbuilds/oneshots/releases/tag/run-antikythera-engine) |
| [**One Equation, Three Worlds — ChatGPT Work**](runs/three-worlds-chatgpt/) | A single Lorenz trajectory becomes copper, ink, and moving light in a matched triptych and a 28-second silent film. | GPT-6 Astra (medium) | 2 | [brief](runs/three-worlds-chatgpt/brief.md) · [log](runs/three-worlds-chatgpt/process/PROGRESS.md) · [snapshots](runs/three-worlds-chatgpt/process/snapshots) · [outputs](https://github.com/davisbuilds/oneshots/releases/tag/run-three-worlds-chatgpt) |
| [**One Equation, Three Worlds**](runs/three-worlds/) | One Lorenz trajectory, integrated once, rendered as a copper sculpture, an ink painting and a travelling light, joined by a 30 s film. | Claude Opus 5.5 | 2 | [brief](runs/three-worlds/brief.md) · [log](runs/three-worlds/process/PROGRESS.md) · [snapshots](runs/three-worlds/process/snapshots) · [outputs](https://github.com/davisbuilds/oneshots/releases/tag/run-three-worlds) |
| [**ARTEMIS II — Built for the Journey**](runs/artemis-ii/) | An 89-second Blender film: the Artemis II SLS Block 1 and Orion resolve from their components into the full stack, then launch from Pad 39B. | Claude Opus 5.5 | 3 | [brief](runs/artemis-ii/brief.md) · [log](runs/artemis-ii/process/PROGRESS.md) · [snapshots](runs/artemis-ii/process/snapshots) · [outputs](https://github.com/davisbuilds/oneshots/releases/tag/run-artemis-ii) |
| [**Two Kinds of Fire**](runs/two-kinds-of-fire/) | A nocturne painted entirely by Python code: a kayak stirs bioluminescence while a rocket rises over Cape Canaveral. | Claude Opus 5.5 | 1 | [brief](runs/two-kinds-of-fire/brief.md) · [log](runs/two-kinds-of-fire/process/PROGRESS.md) · [snapshots](runs/two-kinds-of-fire/process/snapshots) · [outputs](https://github.com/davisbuilds/oneshots/releases/tag/run-two-kinds-of-fire) |
| [**Echo Atlas**](runs/echo-atlas/) | Invisible rooms discovered and redrawn through reflected sound. | GPT-5.6 Sol | — | — |
| [**The Stillroom**](runs/stillroom/) | A gravitational music box with a rewindable, branching past. | GPT-6 Astra | — | — |
| [**The Rainkeeper**](runs/rainkeeper/) | A living cutaway garden: carve rivers, bring rain, and grow roots through layered earth. | GPT-6 Astra | — | — |
| [**The AI Constellation**](runs/ai-constellation/) | An interactive, force-directed map of eight decades of AI history. | Claude Sonnet 5 (high) | — | — |
| [**GASKET∞**](runs/seventeen/) | A realtime ray-marched flythrough of an infinite Apollonian gasket, built in under 17 minutes. | Fable 5 (xhigh) | — | — |
| [**NEON SWARM**](runs/neon-swarm/) | A Geometry-Wars-style arcade survival game with procedural audio. | Fable 5 (xhigh) | — | — |
| [**Lumen**](runs/lumen/) | A physically based, progressive Monte Carlo path tracer. | Fable 5 (xhigh) | — | — |
<!-- runs:end -->

The table is generated from each run's `run.toml` by
`python3 scripts/build_index.py`. "Human turns" counts the messages a person
sent during the run, including the brief; "—" means it wasn't recorded (the
earliest runs predate this standard).

## Layout

```
runs/<slug>/
  README.md        what it is, how to run it, the agent's honest account
  run.toml         manifest: model, harness, date, human turns, build, assets
  brief.md         the prompt(s), verbatim
  process/         progress log, numbered snapshots, studies
  preview/         small committed images (hero, details, stages)
  src/ or index.html
```

Full-size outputs (large images, video, logs of draw operations) are not
committed. They are published as a GitHub release named `run-<slug>`, usually
built from source by the [Run assets](.github/workflows/run-assets.yml) workflow.
Runs whose builds exceed the workflow's limits publish their original outputs
manually, with provenance and checksums; see the run's README. Fetch assets with
`python3 scripts/fetch_assets.py <slug>`.

The contract for a run, including what an agent should save as it works, is in
[RUNS.md](RUNS.md). Start a new one from [`templates/run/`](templates/run/).

## Contributing

Focused fixes to a run, its reproduction steps, accessibility, or collection
tooling are welcome. Discuss a new long-horizon run, new shared dependency, or
change to the run/release contract before substantial work. A run's brief and
process record are historical evidence; correct an error transparently rather
than rewriting the agent's account. Follow [RUNS.md](RUNS.md) for the required
manifest, assets, and checks, and describe what the contribution changes and
what was verified. Agent-assisted submissions are welcome; the submitter should
understand the result and its limitations. A prompting diary or human rewrite
is not required.

## Running them

- **Single-file runs:** `open runs/<slug>/index.html`. There is no install and
  no server. `ai-constellation` loads D3 and its fonts from a CDN; the rest
  depend on nothing.
- **Long-horizon runs:** see the run's README. It has a one-command
  reproduction and the dependencies it was run with.

Several runs include a headless `verify.mjs` smoke test that uses
`@playwright/test` from this repository's `node_modules`. With Node 24 (`.nvmrc`) and npm,
run `npm ci` and `npx playwright install chromium`, then
`node runs/<slug>/verify.mjs` or `npm run verify:browser` for all seven existing
verifiers (`antikythera-engine`'s also calls `python3` for its expected values).
The locked tooling is optional; the HTML runs still open without it.
Screenshots from the verifiers stay in their run directories and are ignored.

Collection scripts need only Python 3.11+; they have no third-party dependencies.
The Python renderers keep separate requirements and environments, documented in
their READMEs. There is no root Python package or shared renderer lockfile.

## Checks

CI runs `scripts/check_publication_hygiene.py` (no personal paths or emails),
`scripts/validate_runs.py`, the fast renderer build-recovery tests, and the
`gate-to-game` stack tests (Node's built-in test runner, no dependencies).
The validator checks manifests, size caps on
committed files, that release assets stay out of git, and that the index above
is current. Workflow changes also run a pinned, offline zizmor security audit.
Actions and the optional browser dependency receive weekly Dependabot updates.

```bash
python3 scripts/build_index.py        # after changing run metadata
npm run check                        # manifests and publication hygiene
npm test                             # build-recovery and gate-to-game regression tests
```

Publication hygiene reads staged/tracked Git blobs; stage intended edits before
the final pre-commit check. Agent guidance is in [AGENTS.md](AGENTS.md), also
available through `CLAUDE.md`.

## License

[MIT](LICENSE). Third-party material retains its own notices and license terms.
