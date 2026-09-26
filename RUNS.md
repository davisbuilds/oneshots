# The run standard

A **run** is one brief given to an agent and everything it produced in
response. The point of the collection is the result *and* how it got there,
so a run keeps its lineage, not just its output.

## Directory

```
runs/<slug>/
  README.md          required
  run.toml           required — the manifest below
  brief.md           the prompt, verbatim; later human messages appended with times
  process/
    PROGRESS.md      the agent's log: what it tried, what it saw, what it changed
    snapshots/       numbered renders/screenshots in the order they were made
    studies/         explorations that were not chosen
  preview/           small committed images: hero, full-resolution details, stages
  src/ or index.html the thing itself
  requirements.txt   (or package.json, etc.) pinned or at least recorded versions
  output/            git-ignored; where the build writes full-size outputs
```

A single-file run can be just `README.md`, `run.toml` and `index.html`.

## What goes in git and what doesn't

Git holds source, text and small images. History never shrinks, so:

- No committed file over **2 MiB**, and no more than **8 MiB** per run.
  `scripts/validate_runs.py` enforces this.
- Snapshots and previews are WebP (or JPG), downsized. Use about 1200 px for
  whole-image snapshots, and keep crops at native resolution so detail
  can be judged.
- Full-size outputs (the final image, video, `.blend` files, large data) are
  declared as `[[assets]]` and published to a release. They are never
  committed.

Assets are built by the **Run assets** workflow (`workflow_dispatch`, input:
the slug). It installs the run's requirements, runs `build.command`, runs
`build.verify` if set, and uploads the declared files plus `SHA256SUMS` to the
release `run-<slug>`. Because the assets come from the committed source, a
green run of the workflow is also a reproducibility check. If a run cannot be
rebuilt on a CI machine (GPU renders, hours-long jobs), upload its assets to
the same release by hand and include a `SHA256SUMS` file; say so in the README.

## Manifest (`run.toml`)

```toml
schema = 1
slug = "two-kinds-of-fire"              # = directory name, lowercase-hyphenated
title = "Two Kinds of Fire"
summary = "One sentence for the index."
date = 2026-09-25                       # date the run happened (or first published)
kind = "long-horizon"                   # or "single-file"
medium = ["painting", "python"]         # free tags, used for filtering
hero = "preview/hero.webp"              # required for long-horizon runs
entry = "src/paint.py"                  # what to open or run
curator_note = ""                       # the human's verdict, in their words

[agent]
model = "Claude Opus 5.5"               # display name
model_id = "claude-opus-5-5"            # exact identifier, if known
harness = "Claude Code (cloud session)" # the tool the agent ran in
reasoning = "xhigh"                     # effort setting, if known (optional)

[run]
brief = "brief.md"                      # or "unrecorded"
human_turns = 1                         # messages from a person during the run, brief included
wall_clock_minutes = 85                 # optional
log = "process/PROGRESS.md"             # required for long-horizon runs
snapshots = "process/snapshots"         # optional

[build]                                 # optional for single-file runs
requirements = "requirements.txt"
command = "python3 src/paint.py"        # writes output/
verify = "python3 src/replay.py ..."    # optional; must exit 0
timeout_minutes = 50

[[assets]]                              # files in output/ to publish
file = "two_kinds_of_fire.png"
description = "Final painting, 3000 x 2000 PNG"
```

Use `"unrecorded"` rather than guessing. An honest gap is worth more than a
plausible number.

## Two voices

- **The agent's account** lives in `process/PROGRESS.md` and the README's
  "process notes and limitations". It is self-reported: what it tried, what
  failed, what it could not verify.
- **The curator's note** (`curator_note`, optionally repeated in the README)
  is the human's verdict. Keep the two apart; the lineage is only
  trustworthy if the agent's claims can be read against someone else's.

## Brief for the agent

Paste this at the end of a long-horizon brief so the run arrives in shape:

> Work in `runs/<slug>/` following `RUNS.md`. Save the brief verbatim to
> `brief.md`. Keep `process/PROGRESS.md` as you go, with times, what you
> inspected, what was wrong, and what you changed. Save numbered snapshots to
> `process/snapshots/` at each checkpoint, WebP, about 1200 px, plus crops at
> native resolution. Write full-size outputs to `output/` only, and declare
> them as `[[assets]]`. Fill in `run.toml` (use "unrecorded" rather than
> guessing), then run `python3 scripts/build_index.py` and
> `python3 scripts/validate_runs.py` before you finish.

## Before merging a run

1. `python3 scripts/build_index.py`
2. `python3 scripts/validate_runs.py` and `python3 scripts/check_publication_hygiene.py`
3. After merge, if the run declares assets, run the **Run assets** workflow for
   its slug.
