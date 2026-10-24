#!/usr/bin/env bash
# compare.sh: a mockup and a live screenshot side by side, same height, WebP.
#   tools/compare.sh mockup.webp live.png out.webp [height]
# Needs ffmpeg (to decode and stack) and cwebp (to encode).
set -euo pipefail
H="${4:-720}"
tmp="$(mktemp -t compare).png"
ffmpeg -loglevel error -y -i "$1" -i "$2" -filter_complex "[0]scale=-2:${H}[a];[1]scale=-2:${H}[b];[a][b]hstack=inputs=2" -frames:v 1 "$tmp"
cwebp -quiet -q 80 "$tmp" -o "$3"
rm -f "$tmp"
