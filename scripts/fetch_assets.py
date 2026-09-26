#!/usr/bin/env python3
"""Download a run's published outputs from its GitHub release and verify them.

    python3 scripts/fetch_assets.py two-kinds-of-fire

Files land in runs/<slug>/output/ (git-ignored). Each is checked against the
SHA256SUMS file that the `Run assets` workflow publishes with the release.
"""

from __future__ import annotations

import hashlib
import sys
import urllib.error
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import runs_lib as R  # noqa: E402


def get(url: str) -> bytes:
    with urllib.request.urlopen(url, timeout=120) as r:
        return r.read()


def main() -> int:
    if len(sys.argv) != 2:
        print(__doc__)
        return 2
    slug = sys.argv[1]
    d = R.RUNS / slug
    if not (d / "run.toml").exists():
        print(f"no run named {slug!r}")
        return 2
    m = R.load(d)
    assets = [a["file"] for a in m.get("assets", [])]
    if not assets:
        print(f"{slug} has no release assets; everything is in the repository")
        return 0
    base = f"https://github.com/{R.repo_slug()}/releases/download/{R.release_tag(slug)}/"
    try:
        sums_text = get(base + "SHA256SUMS").decode()
    except urllib.error.HTTPError as e:
        print(f"could not fetch {base}SHA256SUMS ({e.code}); has the Run assets workflow "
              f"been run for {slug}?")
        return 1
    sums = {}
    for line in sums_text.splitlines():
        if line.strip():
            h, name = line.split(maxsplit=1)
            sums[name.lstrip("*")] = h
    out = d / "output"
    out.mkdir(exist_ok=True)
    bad = 0
    for name in assets:
        data = get(base + name)
        ok = hashlib.sha256(data).hexdigest() == sums.get(name)
        (out / name).write_bytes(data)
        print(f"{'ok ' if ok else 'BAD'} {name} ({len(data) / 1e6:.1f} MB)")
        bad += not ok
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
