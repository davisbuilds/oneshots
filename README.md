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
| [**One Equation, Three Worlds**](runs/three-worlds/) | One Lorenz trajectory, integrated once, rendered as a copper sculpture, an ink painting and a travelling light, joined by a 30 s film. | Claude Opus 5.5 | 2 | [brief](runs/three-worlds/brief.md) · [log](runs/three-worlds/process/PROGRESS.md) · [snapshots](runs/three-worlds/process/snapshots) · [outputs](https://github.com/davisbuilds/oneshots/releases/tag/run-three-worlds) |
| [**ARTEMIS II — Built for the Journey**](runs/artemis-ii/) | An 89-second Blender film: the Artemis II SLS Block 1 and Orion resolve from their components into the full stack, then launch from Pad 39B. | unrecorded | 3 | [brief](runs/artemis-ii/brief.md) · [log](runs/artemis-ii/process/PROGRESS.md) · [snapshots](runs/artemis-ii/process/snapshots) · [outputs](https://github.com/davisbuilds/oneshots/releases/tag/run-artemis-ii) |
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

## Running them

- **Single-file runs:** `open runs/<slug>/index.html`. There is no install and
  no server. `ai-constellation` loads D3 and its fonts from a CDN; the rest
  depend on nothing.
- **Long-horizon runs:** see the run's README. It has a one-command
  reproduction and the dependencies it was run with.

Several single-file runs include a headless `verify.mjs` smoke test that uses
`@playwright/test` from this repository's `node_modules`. With Node 22+ and npm,
run `npm ci` and `npx playwright install chromium`, then
`node runs/<slug>/verify.mjs` or `npm run verify:browser` for all four existing
verifiers. The locked tooling is optional; the HTML runs still open without it.
Screenshots from the verifiers stay in their run directories and are ignored.

Collection scripts need only Python 3.11+; they have no third-party dependencies.
The Python renderers keep separate requirements and environments, documented in
their READMEs. There is no root Python package or shared renderer lockfile.

## Checks

CI runs `scripts/check_publication_hygiene.py` (no personal paths or emails),
`scripts/validate_runs.py`, and the fast Three Worlds build-recovery tests.
The validator checks manifests, size caps on
committed files, that release assets stay out of git, and that the index above
is current. Workflow changes also run a pinned, offline zizmor security audit.
Actions and the optional browser dependency receive weekly Dependabot updates.

```bash
python3 scripts/build_index.py        # after changing run metadata
npm run check                        # manifests and publication hygiene
npm test                             # fast build-recovery regression tests
```

Publication hygiene reads staged/tracked Git blobs; stage intended edits before
the final pre-commit check. Agent guidance is in [AGENTS.md](AGENTS.md), also
available through `CLAUDE.md`.
