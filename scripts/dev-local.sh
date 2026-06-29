#!/usr/bin/env bash
# Local dev: install deps, build dashboard, start Vite (root base path).
#
# Usage:
#   bash scripts/dev-local.sh [--fetch] [-- --projects projects/mole.yml ...]
#
# Default: build UI from cached JSON (no API calls), then npm run dev.
# --fetch: refresh datasets first (same args as build:data).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT_DIR"

FETCH=false
BUILD_ARGS=()

if [ -f "$ROOT_DIR/.env" ]; then
  set -a
  # shellcheck disable=SC1091
  source "$ROOT_DIR/.env"
  set +a
fi

while [ $# -gt 0 ]; do
  case "$1" in
    --fetch)
      FETCH=true
      shift
      ;;
    --)
      shift
      BUILD_ARGS+=("$@")
      break
      ;;
    *)
      BUILD_ARGS+=("$1")
      shift
      ;;
  esac
done

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

if [ -f "$ROOT_DIR/.env" ]; then
  echo "✓ .env exists"
else
  cp "$ROOT_DIR/.env.example" "$ROOT_DIR/.env"
  echo "✓ Created .env from .env.example — add tokens for live data sources"
fi

export VITE_BASE_PATH="${VITE_BASE_PATH:-/}"
export GITHUB_ACTIONS=false

echo ""
if [ "$FETCH" = true ]; then
  echo "→ Fetching datasets..."
  npm run build:data -- "${BUILD_ARGS[@]}"
else
  echo "→ Building UI from cached datasets..."
  npm run build:ui -- "${BUILD_ARGS[@]}"
fi

echo ""
echo "=== Ready ==="
echo "  Dashboard: http://127.0.0.1:5173/"
echo "  Settings:  http://127.0.0.1:5173/settings.html"
echo "  Report:    http://127.0.0.1:5173/report.html"
echo ""
echo "  Press Ctrl+C to stop."
exec npm run dev
