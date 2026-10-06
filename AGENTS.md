# oneshots

A public collection of independent agent runs: capability demos, artwork, and
their recorded lineage. Each directory under `runs/` is an artifact, not a
separate repository or a component of one application.

## Documentation map

- [README.md](README.md): collection index, setup, and viewing the results.
- [RUNS.md](RUNS.md): run layout, lineage, manifests, and release assets.
- `runs/<slug>/README.md`: the run's dependencies, reproduction, and limitations.
- `runs/<slug>/run.toml`: metadata and executable build/verification commands.
- `templates/run/`: starting point for a new run.

Keep guidance here and `CLAUDE.md` as a relative symlink to this file. This
collection does not need separate `docs/project/` or `docs/system/` trees.

## Command quickstart

Collection tooling uses Python 3.11+ and the standard library:

```bash
python3 scripts/build_index.py
python3 scripts/validate_runs.py
python3 scripts/check_publication_hygiene.py
python3 runs/three-worlds/src/test_build.py
python3 runs/artemis-ii/src/test_build_all.py
node --test runs/gate-to-game/tests/*.test.js
```

Open HTML runs directly: `open runs/<slug>/index.html` on macOS. Optional browser
verification uses Node 22+ and the locked npm tooling:

```bash
npm ci
npx playwright install chromium
npm run verify:browser
```

Use each renderer's documented Python version and its own virtual environment
and requirements. There is no shared renderer environment or root Python package.
Fetch published assets with `python3 scripts/fetch_assets.py <slug>`.

## Implementation guardrails

- Keep a change scoped to the requested run or collection tooling. Preserve
  direct HTML execution and each run's established rendering approach.
- Read RUNS.md before adding a run. Regenerate the README index after changing
  manifest metadata; do not edit generated rows by hand.
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
  provenance and verifying downloads before removing temporary storage.
- Pin Actions to full SHAs and keep version comments accurate when updating them.

## Testing and working agreement

- Run the collection checks above for metadata/tooling changes. Publication
  hygiene scans the Git index: stage the intended files before the final check.
- Use real-browser checks for changed HTML/JS behavior. Existing verifiers cover
  seven runs; do not claim they cover the whole collection. Screenshots are local
  evidence, not portable visual baselines.
- For rendering changes, use the run's build/verify commands. A manifest check
  does not prove a render works; state when a costly full build was not rerun.
- Prefer behavioral tests and real dependencies. For substantial changes use
  red/green testing, with a red step that fails for the behavior being fixed.
  Smaller changes need the relevant checks, not a mandatory spec/plan.
- Update the owning docs when a procedure or boundary changes. Clarify material
  ambiguity; reconcile an affected run's lineage or manifest with the result;
  keep commits coherent and preserve unrelated work.
- Intended history policy: PRs into `main`, normally merged with a merge commit;
  rebase is appropriate for focused commits. Request Codex review for PRs, resolve
  review threads, and require green applicable checks before an authorized merge.
  Query GitHub for effective settings rather than assuming they enforce this.
- Push, publish, merge, or remove remote branches only when requested or already
  authorized. After compaction, re-ground in source and recent changes.
