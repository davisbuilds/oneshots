#!/usr/bin/env bash
# Disposable Linux x86_64 CI only. No system-wide browser installation.
set -euo pipefail
if [[ "$(uname -s)" != Linux || "$(uname -m)" != x86_64 ]]; then
  echo 'Use an installed, current Google Chrome on this platform.' >&2
  exit 1
fi
: "${RUNNER_TEMP:?RUNNER_TEMP must name the disposable CI directory}"
version=156.0.8078.80
archive="$RUNNER_TEMP/oneshots-chrome-$version.zip"
curl --fail --location --retry 3 \
  "https://storage.googleapis.com/chrome-for-testing-public/$version/linux64/chrome-linux64.zip" \
  --output "$archive"
printf '%s  %s\n' b711c720f774be355197f32edf37e0651418ba036d92446ee2da19ac017540a7 "$archive" | sha256sum --check
unzip -qo "$archive" -d "$RUNNER_TEMP/oneshots-chrome-$version"
echo "CHROMIUM_PATH=$RUNNER_TEMP/oneshots-chrome-$version/chrome-linux64/chrome" >> "${GITHUB_ENV:?GITHUB_ENV must be set}"
