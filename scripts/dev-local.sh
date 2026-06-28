#!/usr/bin/env bash
# Local dev: install deps, build dataset, start Vite (root base path).
#
# Usage:
#   bash scripts/dev-local.sh [project_config]
#
# Or after setup:
#   PROJECT_CONFIG=projects/my-project.yml VITE_BASE_PATH=/ npm run build:site
#   npm run dev

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT_DIR"

PROJECT_CONFIG="${1:-projects/example.yml}"

echo "=== OSS Impact Dashboard — local dev ==="

if ! python -c "import oss_impact_dashboard" 2>/dev/null; then
  echo "→ Installing Python package..."
  python -m pip install -e ".[dev]" -q
else
  echo "✓ Python package installed"
fi

if [ ! -d node_modules ]; then
  echo "→ Installing npm dependencies..."
  npm ci
else
  echo "✓ npm dependencies present"
fi

if [ ! -f "$ROOT_DIR/.env" ]; then
  cp "$ROOT_DIR/.env.example" "$ROOT_DIR/.env"
  echo "✓ Created .env from .env.example — add tokens for live data sources"
else
  echo "✓ .env exists"
fi

if [ -f "$ROOT_DIR/.env" ]; then
  set -a
  # shellcheck disable=SC1091
  source "$ROOT_DIR/.env"
  set +a
fi

export PROJECT_CONFIG
export VITE_BASE_PATH="${VITE_BASE_PATH:-/}"
export GITHUB_ACTIONS=false

echo ""
echo "→ Building dataset from $PROJECT_CONFIG..."
CI_MODE=build bash scripts/ci-check.sh

echo ""
echo "=== Ready ==="
echo "  Dashboard: http://127.0.0.1:5173/"
echo "  Settings:  http://127.0.0.1:5173/settings.html"
echo "  Report:    http://127.0.0.1:5173/report.html"
echo ""
echo "  Press Ctrl+C to stop."
exec npm run dev
