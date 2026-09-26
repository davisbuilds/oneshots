"""Shared helpers for reading run manifests (runs/<slug>/run.toml).

Standard library only (Python 3.11+ for tomllib).
"""

from __future__ import annotations

import datetime as dt
import re
import subprocess
import tomllib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RUNS = ROOT / "runs"
DEFAULT_REPO = "davisbuilds/oneshots"
KINDS = {"single-file", "long-horizon"}
SLUG_RE = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
UNRECORDED = "unrecorded"


def load(slug_dir: Path) -> dict:
    with open(slug_dir / "run.toml", "rb") as f:
        return tomllib.load(f)


def all_runs() -> list[tuple[Path, dict]]:
    out = []
    for d in sorted(p for p in RUNS.iterdir() if p.is_dir()):
        if (d / "run.toml").exists():
            out.append((d, load(d)))
    return out


def run_dirs() -> list[Path]:
    return sorted(p for p in RUNS.iterdir() if p.is_dir())


def repo_slug() -> str:
    """owner/name of the GitHub repository, from the origin remote if possible."""
    try:
        url = subprocess.check_output(["git", "remote", "get-url", "origin"], cwd=ROOT,
                                      text=True, stderr=subprocess.DEVNULL).strip()
    except (subprocess.CalledProcessError, FileNotFoundError):
        return DEFAULT_REPO
    m = re.search(r"github\.com[:/]([^/]+/[^/.]+?)(?:\.git)?$", url)
    return m.group(1) if m else DEFAULT_REPO


def release_tag(slug: str) -> str:
    return f"run-{slug}"


def sort_key(item: tuple[Path, dict]):
    d = item[1].get("date")
    return (d if isinstance(d, dt.date) else dt.date.min, item[0].name)
