#!/bin/bash
# Builds the macOS window helper for Intel and Apple silicon (run on a Mac; CI does it before
# packaging). Output: build/mac-helper/presenter-window-helper, packed into the app's Resources.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
out="$here/../../build/mac-helper"
mkdir -p "$out"
swiftc -O -target arm64-apple-macos13 "$here/main.swift" -o "$out/helper-arm64"
swiftc -O -target x86_64-apple-macos13 "$here/main.swift" -o "$out/helper-x64"
lipo -create "$out/helper-arm64" "$out/helper-x64" -output "$out/presenter-window-helper"
rm -f "$out/helper-arm64" "$out/helper-x64"
# A quick run: it must start and answer (without permissions the list may be short).
printf 'list\nstates 1\n' | "$out/presenter-window-helper" | head -c 400
echo
