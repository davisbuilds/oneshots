#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
if ! command -v blender >/dev/null || ! command -v ffmpeg >/dev/null; then
  if [[ "${GITHUB_ACTIONS:-}" == "true" ]]; then
    sudo apt-get update
    sudo apt-get install -y blender ffmpeg
  else
    echo "Install Blender 4.0.2-compatible Blender and FFmpeg and add them to PATH." >&2
    exit 1
  fi
fi
python3 src/build.py
