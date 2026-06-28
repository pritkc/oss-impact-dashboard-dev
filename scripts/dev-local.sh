#!/usr/bin/env bash
# One-command local dev setup: install deps, build data, start Vite dev server.
#
# Usage:
#   bash scripts/dev-local.sh [project_config]
#
# First run copies .env.example → .env if missing (edit tokens for live data).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT_DIR"

PROJECT_CONFIG="${1:-projects/mole.yml}"

echo "=== OSS Impact Dashboard — local dev setup ==="

# Python package
if ! python -c "import oss_impact_dashboard" 2>/dev/null; then
  echo "→ Installing Python package..."
  python -m pip install -e ".[dev]" -q
else
  echo "✓ Python package installed"
fi

# Node modules
if [ ! -d node_modules ]; then
  echo "→ Installing npm dependencies..."
  npm ci
else
  echo "✓ npm dependencies present"
fi

# .env bootstrap
if [ ! -f "$ROOT_DIR/.env" ]; then
  cp "$ROOT_DIR/.env.example" "$ROOT_DIR/.env"
  echo "✓ Created .env from .env.example — add your GitHub token for live data"
else
  echo "✓ .env exists"
fi

if [ -f "$ROOT_DIR/.env" ]; then
  set -a
  # shellcheck disable=SC1091
  source "$ROOT_DIR/.env"
  set +a
fi

# Local dev uses root base path (not GitHub Pages subpath)
export VITE_BASE_PATH="${VITE_BASE_PATH:-/}"

echo ""
echo "→ Validating project config..."
python -m oss_impact_dashboard.cli validate-project --project "$PROJECT_CONFIG"

echo "→ Building dashboard.json..."
python -m oss_impact_dashboard.cli build \
  --project "$PROJECT_CONFIG" \
  --safe-project \
  --output web/public/data/dashboard.json

echo ""
echo "=== Ready ==="
echo "  Dashboard: http://127.0.0.1:5173/"
echo "  Settings:  http://127.0.0.1:5173/settings.html"
echo "  Report:    http://127.0.0.1:5173/report.html  (print icon in header)"
echo ""
echo "  Press Ctrl+C to stop."
exec npm run dev
