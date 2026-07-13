#!/usr/bin/env bash
set -euo pipefail

project="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
archive="${1:?usage: npm run sites:package -- /absolute/path/to/archive.tgz}"
build_dir="$project/dist"
hosting="$project/.openai/hosting.json"

test -f "$build_dir/server/index.js" || { echo "Missing dist/server/index.js; run npm run build first." >&2; exit 2; }
test -f "$hosting" || { echo "Missing .openai/hosting.json." >&2; exit 2; }

stage="$(mktemp -d)"
trap 'rm -rf "$stage"' EXIT
mkdir -p "$stage/dist/.openai" "$(dirname "$archive")"
cp -R "$build_dir"/. "$stage/dist"/
cp "$hosting" "$stage/dist/.openai/hosting.json"
tar -C "$stage" -czf "$archive" dist

entries="$(tar -tzf "$archive")"
grep -qx 'dist/server/index.js' <<<"$entries"
grep -qx 'dist/.openai/hosting.json' <<<"$entries"
printf '%s\n' "$archive"
