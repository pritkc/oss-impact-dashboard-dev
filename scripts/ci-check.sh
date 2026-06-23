#!/usr/bin/env bash
# Canonical deterministic CI checks. GitHub Actions and pre-push both call this.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT_DIR"

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "error: required command '$1' was not found." >&2
    echo "Install the prerequisites from README.md, then run npm ci and python -m pip install -e '.[dev]'." >&2
    exit 1
  fi
}

require_command python
require_command node
require_command npm

python - <<'PY'
import sys

if sys.version_info < (3, 11):
    raise SystemExit(
        f"error: Python 3.11+ is required; found {sys.version.split()[0]} at {sys.executable}"
    )
PY

node - <<'JS'
const [major, minor] = process.versions.node.split('.').map(Number);
if (major < 22 || (major === 22 && minor < 12)) {
  console.error(`error: Node.js 22.12+ is required; found ${process.versions.node}`);
  process.exit(1);
}
JS

if ! python -m ruff --version >/dev/null 2>&1 || ! python -m pytest --version >/dev/null 2>&1; then
  echo "error: Python development dependencies are missing." >&2
  echo "Run: python -m pip install -e '.[dev]'" >&2
  exit 1
fi

if [ ! -d node_modules ]; then
  echo "error: Node.js dependencies are missing." >&2
  echo "Run: npm ci" >&2
  exit 1
fi

GITHUB_REPOSITORY_VALUE="${GITHUB_REPOSITORY:-}"
REPOSITORY_NAME="${GITHUB_REPOSITORY_VALUE##*/}"
if [ -z "$REPOSITORY_NAME" ] || [ "$REPOSITORY_NAME" = "$GITHUB_REPOSITORY_VALUE" ]; then
  REMOTE_URL="$(git config --get remote.origin.url 2>/dev/null || true)"
  REPOSITORY_NAME="${REMOTE_URL##*/}"
  REPOSITORY_NAME="${REPOSITORY_NAME%.git}"
fi
REPOSITORY_NAME="${REPOSITORY_NAME:-$(basename "$ROOT_DIR")}"

export GITHUB_ACTIONS="${GITHUB_ACTIONS:-true}"
export GITHUB_REPOSITORY="${GITHUB_REPOSITORY:-local/$REPOSITORY_NAME}"
export VITE_BASE_PATH="${VITE_BASE_PATH:-/$REPOSITORY_NAME/}"

echo "CI environment:"
echo "  Python: $(python --version 2>&1)"
echo "  Node:   $(node --version)"
echo "  Base:   $VITE_BASE_PATH"

echo
echo "[1/8] Validate shell scripts"
bash -n scripts/*.sh

echo
echo "[2/8] Validate GitHub Actions workflows"
bash scripts/validate-workflows.sh

echo
echo "[3/8] Validate project configurations"
for project_config in projects/*.yml; do
  python -m oss_impact_dashboard.cli validate-project --project "$project_config"
done

echo
echo "[4/8] Ruff"
python -m ruff check .

echo
echo "[5/8] Pytest"
python -m pytest tests/ -q

echo
echo "[6/8] Frontend and workflow contract tests"
npm run test:frontend

echo
echo "[7/8] GitHub Pages build"
npm run build

echo
echo "[8/8] Post-build verification"
npm run test:build

echo
echo "All deterministic CI checks passed."
