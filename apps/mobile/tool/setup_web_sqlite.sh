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
url="https://github.com/simolus3/sqlite3.dart/releases/download/sqlite3-${version}/sqlite3.wasm"
# The release CDN intermittently answers 503, so retry before giving up.
for attempt in 1 2 3; do
  if curl --fail --location --show-error --retry 2 --retry-delay 2 "$url" --output "$temporary"; then
    mv "$temporary" web/sqlite3.wasm
    exit 0
  fi
  echo "Attempt $attempt to download $url failed." >&2
  sleep $((attempt * 3))
done
# The wasm matching the pinned sqlite3 version is committed to the repository,
# so a failed refresh must not break the build.
if [[ -s web/sqlite3.wasm ]]; then
  echo "Keeping the committed web/sqlite3.wasm (sqlite3 ${version})." >&2
  exit 0
fi
echo "Failed to download $url and no committed web/sqlite3.wasm to fall back on." >&2
exit 1
