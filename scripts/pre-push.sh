#!/usr/bin/env bash
# OSS Impact Dashboard managed hook
# Pre-push hook: runs the same checks as CI before allowing a push.
# Install: npm run install:hooks
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ "$(basename "$SCRIPT_DIR")" = "hooks" ]; then
  ROOT_DIR="$(git rev-parse --show-toplevel)"
  LOCAL_HOOK="$0.local"
else
  ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
  LOCAL_HOOK=""
fi
cd "$ROOT_DIR"

if [ -n "$LOCAL_HOOK" ] && [ -x "$LOCAL_HOOK" ]; then
  "$LOCAL_HOOK" "$@"
fi

# Skip checks in deployment worktrees (e.g. gh-pages deploy) where source
# files are not present. Only run when pyproject.toml and tests/ exist.
if [ ! -f pyproject.toml ] || [ ! -d tests/ ]; then
  echo "Pre-push checks skipped: source files are not present in this worktree."
  exit 0
fi

echo "Running the same deterministic checks as GitHub Actions..."
npm run ci
echo "Pre-push checks passed."
