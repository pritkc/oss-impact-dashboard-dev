#!/usr/bin/env bash
# Restore sanitized Read the Docs cache files from gh-pages.
set -euo pipefail

PROJECT_ID="${1:?usage: restore-rtd-cache.sh <project-id>}"
CACHE_DIR="${2:-data/rtd-cache/${PROJECT_ID}}"

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

mkdir -p "$CACHE_DIR"
git fetch origin gh-pages --depth=1 || true
for file in latest.json history.json collection-state.json; do
  git show "origin/gh-pages:rtd-cache/${PROJECT_ID}/${file}" > "${CACHE_DIR}/${file}" 2>/dev/null || true
done

if [ -f "${CACHE_DIR}/latest.json" ]; then
  echo "Restored Read the Docs cache for ${PROJECT_ID} into ${CACHE_DIR}"
else
  echo "No Read the Docs cache found on gh-pages for ${PROJECT_ID}"
fi
