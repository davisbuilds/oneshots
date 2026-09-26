#!/usr/bin/env python3
"""Regenerate the run table in README.md from the manifests.

    python3 scripts/build_index.py

The table lives between the `<!-- runs:start -->` and `<!-- runs:end -->`
markers; everything else in the README is left alone.
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import runs_lib as R  # noqa: E402

START = "<!-- runs:start -->"
END = "<!-- runs:end -->"


def lineage(d: Path, m: dict) -> str:
    run = m.get("run", {})
    parts = []
    if run.get("brief") not in (None, R.UNRECORDED):
        parts.append(f"[brief](runs/{d.name}/{run['brief']})")
    if run.get("log") not in (None, R.UNRECORDED):
        parts.append(f"[log](runs/{d.name}/{run['log']})")
    if run.get("snapshots") not in (None, R.UNRECORDED):
        parts.append(f"[snapshots](runs/{d.name}/{run['snapshots']})")
    if m.get("assets"):
        parts.append(f"[outputs](https://github.com/{R.repo_slug()}/releases/tag/{R.release_tag(d.name)})")
    return " · ".join(parts) if parts else "—"


def table(runs) -> str:
    rows = ["| Run | What it is | Model | Human turns | Lineage |",
            "| :-- | :--------- | :---- | :---------- | :------ |"]
    for d, m in sorted(runs, key=R.sort_key, reverse=True):
        agent = m.get("agent", {})
        model = agent.get("model", "?")
        if agent.get("reasoning"):
            model += f" ({agent['reasoning']})"
        turns = m.get("run", {}).get("human_turns", R.UNRECORDED)
        turns = "—" if turns == R.UNRECORDED else str(turns)
        title = f"[**{m.get('title', d.name)}**](runs/{d.name}/)"
        rows.append(f"| {title} | {m.get('summary', '')} | {model} | {turns} | {lineage(d, m)} |")
    return "\n".join(rows)


def render_into(readme: str, runs) -> str:
    if START not in readme or END not in readme:
        raise SystemExit("README.md is missing the run index markers")
    a = readme.index(START) + len(START)
    b = readme.index(END)
    return readme[:a] + "\n" + table(runs) + "\n" + readme[b:]


def main():
    path = R.ROOT / "README.md"
    text = path.read_text()
    new = render_into(text, R.all_runs())
    if new != text:
        path.write_text(new)
        print("README.md index updated")
    else:
        print("README.md index already up to date")


if __name__ == "__main__":
    main()
