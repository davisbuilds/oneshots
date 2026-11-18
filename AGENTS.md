# oneshots

A public collection of independent agent runs: capability demos, artwork, and
their recorded lineage. Each directory under `runs/` is an artifact, not a
separate repository or a component of one application.

## Documentation map

- [README.md](README.md): collection index, setup, and viewing the results.
- [RUNS.md](RUNS.md): run layout, lineage, manifests, size caps, and release assets.
- `runs/<slug>/README.md`: the run's dependencies, reproduction, and limitations.
- `runs/<slug>/run.toml`: metadata and executable build/verification commands.
- `templates/run/`: starting point for a new run.

Keep guidance here and `CLAUDE.md` as a relative symlink to this file. This
collection does not need separate `docs/project/` or `docs/system/` trees.

## Verification

- **Collection gate** (CI's Validate Runs and Publication Hygiene jobs):
  `pnpm install --frozen-lockfile`, then `pnpm run check && pnpm test`
  (Python 3.11+ standard library and Node 24). CI also runs
  `node runs/luminal/tools/solve.js --check` and a Linux browser route;
  `.github/workflows/runs.yml` owns the full list.
- **Publication hygiene scans the Git index:** stage the intended files before
  the final `python3 scripts/check_publication_hygiene.py`.
- **Browser checks:** `pnpm run verify:browser` (current Google Chrome; see
  README) for changed HTML/JS behavior. It covers only some runs, so don't
  claim it covers the collection. Screenshots are local evidence, not portable
  visual baselines.
- **Rendering changes:** use the run's own build/verify commands and
  environment; there is no shared renderer environment. A manifest check does
  not prove a render works; state when a costly full build was not rerun.

## Implementation guardrails

- Keep a change scoped to the requested run or collection tooling. Preserve
  direct HTML execution and each run's established rendering approach.
- Read RUNS.md before adding a run. Regenerate the README index with
  `python3 scripts/build_index.py` after changing manifest metadata; do not
  edit generated rows by hand.
- Preserve verbatim briefs and the agent's historical account. Record only known
  model/harness metadata; use `unrecorded` for gaps. The curator's verdict comes
  from the human, not the agent.
- Store generated assets in the run's ignored `output/`. Keep committed previews
  within RUNS.md's size caps. Never commit full-size release assets or credentials.
- Keep public source and docs self-contained: no personal paths, private sibling
  dependencies, or unpublished evidence needed to understand them.
- Preserve ignored local files and recovery copies in `work/`. Ignored does not
  mean disposable; confirm preservation before deleting an archive branch.
- Use Run assets only when the build fits its runner, dependencies, and timeout.
  Otherwise upload the original assets and SHA256SUMS manually, documenting their
  provenance and verifying downloads before removing temporary storage. Fetch
  published assets with `python3 scripts/fetch_assets.py <slug>`.
- Pin Actions to full SHAs and keep version comments accurate when updating them.

## Working agreement

- **Clarify before building** when a request is vague, contradictory, or skips a
  key decision; clear, well-scoped requests need no interview.
- **Fix small issues now; record the rest.** Fix simple, quick, or blocking
  issues in this repo as part of the current change and call them out. There
  is no backlog file: note what can't be finished now, or needs the
  maintainer's decision, in the PR or the run's README limitations.
- **Keep docs current** when a change makes a documented contract, boundary,
  procedure, or direction stale, and reconcile an affected run's lineage or
  manifest with the result.
- **Plan and hand off work.** Reuse clear task context. Save planning docs when
  decisions, acceptance, or coordination need persistence. Leave a brief
  handoff only when needed to resume unfinished work. Commit shared docs and
  keep status current. Before archiving, preserve lasting decisions and open
  work in maintained docs and repair links.
- **TDD:** red/green for features, major refactors and large changes; the red
  test must fail on the behavior, not on a missing symbol. For smaller edits, run
  the relevant existing checks.
- **Commit and push.** Commit coherent chunks, staging by explicit path. Push
  your task branch and open a PR once the work is complete and the local gate
  passes; don't push directly to `main`.
- **Merge** only under the standing merge authority in the maintainer's
  workspace instructions, or when the maintainer asks. Without those
  instructions in context, leave the PR for the maintainer. Publish release
  assets or remove remote branches only when requested.
- **Re-ground after compaction** in source, this file, the owning docs, and
  recent commits. A summary and your own earlier proposals are not user approval.

## Git

PRs into `main`, merged by squash or rebase (merge commits are disabled; rebase
keeps a run's coherent commits, squash suits a single change). GitHub deletes
the head branch after merge. `main` is the public collection, so **a merge
publishes**: review the diff and PR text against the self-contained rule above
first. Request Codex review for PRs that change runtime or agent behavior,
including pins, CI and agent instructions (skip only prose docs); resolve
review threads and require green checks before merging. Query GitHub for
effective settings rather than assuming they enforce this.
