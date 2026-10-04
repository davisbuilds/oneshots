# Repository import — 30 September 2026

This document records the later repository adaptation. `PROGRESS.md` and
`ORIGINAL-README.md` preserve the original agent's account unchanged; their old
paths describe the delivered source bundle, not today's layout.

## Lineage

- The run was created in ChatGPT Work on 26 September 2026 from one creative
  brief. The second human turn requested this repository import.
- Exact model name/identifier, reasoning setting, and wall-clock duration were
  not reliably recorded. The manifest deliberately does not infer them.
- The sibling `three-worlds` directory belongs to Claude's independent response
  to the same brief. It is not modified by this import.
- No curator verdict has been invented.

## Adaptation

- Renamed `source/` to `src/`; added a run-local build entry, output paths, release
  command, verifier, and manifest. Generated data and all full-size files now
  stay under ignored `output/`; the committed canonical inputs remain immutable.
- Renamed the historical `select.py` entry to `select_segment.py` so it cannot
  shadow Python's standard-library `select` module during subprocess imports.
- Normalized the projection CSV line endings to LF without changing its values.
- Included the original font binaries with their applicable copyright notices
  and full license text. Font-specific license extracts omit unrelated Debian
  packaging/AppStream sections. No broad publication-hygiene exemption added.
- Downsized decodable originals into numbered WebP studies and snapshots,
  added a 1200-pixel hero and three native-resolution detail crops.
- Archived `03-ink-2.png` is truncated. It was not repaired or represented as a
  valid image; the surviving contact sheet records that variant. The original
  source archive remains unchanged in ignored recovery storage.
- Preserved the original film, stills, scene, and trajectory exports outside Git.
  `ORIGINAL-SHA256SUMS` records the eight original release assets. No full-size
  PNG, MP4, scene, or source ZIP is committed.

## Verification boundary

The import rechecks all original image dimensions and full decoding, canonical
CSV/NPZ agreement, open endpoints, projected bounds, Blender file header, the
entire H.264 stream (672 frames / 28 seconds / 1080p), and asset hashes.
The adapted Python ink, light still and triptych are rerendered and checked
against those same original checksums. All active Python files are compiled.
The collection's two existing renderer test suites are run.

A new complete copper render and full film rebuild are not claimed. Blender is
not installed in the import session. The original executed scene is preserved;
its adapted builder now has an explicit local import path and output-local save
paths. The release workflow is configured but has not been dispatched. No
release is published by the import PR.

Original source ZIP SHA-256:

```text
88a6ea5d7db94415dc06aa30ddc259c47edb22f99125254fb55d1348c9bec71a  One-Equation-Three-Worlds-Source.zip
```

## Owner confirmation — 4 October 2026

The owner subsequently confirmed that the artwork was created by **GPT 6 Astra**
with **medium** reasoning in ChatGPT Work. The manifest and current README now
record that attribution. The exact API model identifier remains unrecorded; the
original agent account and import-time uncertainty above remain historical evidence.
