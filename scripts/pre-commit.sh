#!/usr/bin/env bash
# OSS Impact Dashboard managed hook
# Fast checks for commit-time feedback; the full suite runs before push.
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

if [ ! -f pyproject.toml ] || [ ! -d tests ]; then
  echo "Pre-commit checks skipped: source files are not present in this worktree."
  exit 0
fi

echo "Running fast pre-commit checks..."
npm run check:fast
echo "Pre-commit checks passed."
