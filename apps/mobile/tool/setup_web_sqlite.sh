#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

# Compile against the locked dependencies, then fetch the matching SQLite wasm.
version=$(awk '/^  sqlite3:$/ { found=1; next } found && /version:/ { gsub(/"/, "", $2); print $2; exit }' pubspec.lock)
if [[ -z "$version" ]]; then
  echo 'sqlite3 is missing from pubspec.lock; run flutter pub get first.' >&2
  exit 1
fi
mkdir -p .dart_tool/web-storage
dart compile js -O4 --no-source-maps tool/drift_worker.dart -o .dart_tool/web-storage/drift_worker.js
cp .dart_tool/web-storage/drift_worker.js web/drift_worker.js
temporary=$(mktemp web/sqlite3.wasm.XXXXXX)
trap 'rm -f "$temporary"' EXIT
curl --fail --location --show-error \
  "https://github.com/simolus3/sqlite3.dart/releases/download/sqlite3-${version}/sqlite3.wasm" \
  --output "$temporary"
mv "$temporary" web/sqlite3.wasm
