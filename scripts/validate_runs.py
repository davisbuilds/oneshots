#!/usr/bin/env python3
"""Check every run directory against the standard in RUNS.md.

    python3 scripts/validate_runs.py

Checks manifests (required fields and types, paths that exist), keeps heavy
files out of git (per-file and per-run size caps on tracked files, declared
release assets must not be committed), and confirms the README index is up to
date with the manifests. Exits non-zero with a list of problems.
"""

from __future__ import annotations

import datetime as dt
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import runs_lib as R  # noqa: E402
import build_index  # noqa: E402

MAX_FILE = 2 * 1024 * 1024        # any single tracked file under runs/
MAX_RUN = 8 * 1024 * 1024         # all tracked files of one run together


def tracked_files() -> list[Path]:
    out = subprocess.check_output(["git", "ls-files", "-z", "--cached", "--others",
                                   "--exclude-standard", "runs"], cwd=R.ROOT)
    return [R.ROOT / p for p in out.decode().split("\0") if p]


def check_run(d: Path, m: dict, errs: list[str]):
    where = f"runs/{d.name}"

    def need(key, typ, table=None):
        src = m.get(table, {}) if table else m
        name = f"{table}.{key}" if table else key
        if key not in src:
            errs.append(f"{where}: missing `{name}`")
            return None
        if not isinstance(src[key], typ):
            errs.append(f"{where}: `{name}` should be {typ.__name__ if isinstance(typ, type) else typ}")
            return None
        return src[key]

    def path_or_unrecorded(val, name):
        if val is None or val == R.UNRECORDED:
            return
        if not (d / val).exists():
            errs.append(f"{where}: `{name}` points to missing path {val}")

    if m.get("schema") != 1:
        errs.append(f"{where}: `schema` must be 1")
    slug = need("slug", str)
    if slug is not None and slug != d.name:
        errs.append(f"{where}: `slug` ({slug}) must equal the directory name")
    if slug is not None and not R.SLUG_RE.match(slug):
        errs.append(f"{where}: slug must be lowercase words joined by hyphens")
    need("title", str)
    need("summary", str)
    need("date", dt.date)
    kind = need("kind", str)
    if kind is not None and kind not in R.KINDS:
        errs.append(f"{where}: `kind` must be one of {sorted(R.KINDS)}")
    medium = need("medium", list)
    if medium is not None and (not medium or not all(isinstance(x, str) for x in medium)):
        errs.append(f"{where}: `medium` must be a non-empty list of strings")
    entry = need("entry", str)
    path_or_unrecorded(entry, "entry")
    if "hero" in m:
        path_or_unrecorded(m["hero"], "hero")
    if not isinstance(m.get("curator_note", ""), str):
        errs.append(f"{where}: `curator_note` must be a string")
    need("model", str, "agent")
    need("harness", str, "agent")
    brief = need("brief", str, "run")
    path_or_unrecorded(brief, "run.brief")
    turns = m.get("run", {}).get("human_turns")
    if not (turns == R.UNRECORDED or (isinstance(turns, int) and not isinstance(turns, bool) and turns >= 1)):
        errs.append(f"{where}: `run.human_turns` must be an integer >= 1 or \"unrecorded\"")
    for key in ("log", "snapshots"):
        if key in m.get("run", {}):
            path_or_unrecorded(m["run"][key], f"run.{key}")
    if kind == "long-horizon":
        for key in ("brief", "log"):
            if m.get("run", {}).get(key) in (None, R.UNRECORDED):
                errs.append(f"{where}: long-horizon runs must record `run.{key}`")
        if not m.get("hero"):
            errs.append(f"{where}: long-horizon runs need a committed `hero` preview")
    if not (d / "README.md").exists():
        errs.append(f"{where}: missing README.md")
    assets = m.get("assets", [])
    if assets:
        if not m.get("build", {}).get("command"):
            errs.append(f"{where}: runs with release assets need `build.command`")
        for a in assets:
            if not isinstance(a, dict) or not isinstance(a.get("file"), str) or not isinstance(a.get("description"), str):
                errs.append(f"{where}: every [[assets]] entry needs `file` and `description` strings")
                continue
            if "/" in a["file"] or a["file"].startswith("."):
                errs.append(f"{where}: asset `{a['file']}` must be a plain file name inside output/")


def main() -> int:
    errs: list[str] = []
    runs = R.all_runs()
    for d in R.run_dirs():
        if not (d / "run.toml").exists():
            errs.append(f"runs/{d.name}: missing run.toml")
    for d, m in runs:
        check_run(d, m, errs)

    per_run: dict[str, int] = {}
    asset_names = {(d.name, a.get("file")) for d, m in runs for a in m.get("assets", []) if isinstance(a, dict)}
    for f in tracked_files():
        if not f.exists():
            continue
        rel = f.relative_to(R.ROOT)
        size = f.stat().st_size
        slug = rel.parts[1] if len(rel.parts) > 2 else None
        if size > MAX_FILE:
            errs.append(f"{rel}: {size / 1e6:.1f} MB exceeds the {MAX_FILE // 2**20} MiB per-file cap; publish it as a release asset")
        if slug:
            per_run[slug] = per_run.get(slug, 0) + size
            if (slug, f.name) in asset_names:
                errs.append(f"{rel}: declared as a release asset but committed to git")
    for slug, total in per_run.items():
        if total > MAX_RUN:
            errs.append(f"runs/{slug}: {total / 1e6:.1f} MB of tracked files exceeds the {MAX_RUN // 2**20} MiB per-run cap")

    readme = (R.ROOT / "README.md").read_text()
    if build_index.render_into(readme, runs) != readme:
        errs.append("README.md: run index is stale; run `python3 scripts/build_index.py`")

    if errs:
        print("Run validation failed:")
        for e in errs:
            print("  -", e)
        return 1
    print(f"Run validation passed: {len(runs)} runs")
    return 0


if __name__ == "__main__":
    sys.exit(main())
