#!/usr/bin/env bash
# Replicate the CI pipeline locally to preview the exact dashboard
# that would be published to GitHub Pages after merge.
#
# Prerequisites:
#   1. Copy .env.example to .env and fill in your token + GoatCounter values
#   2. pip install -e ".[report]"
#   3. npm ci
#
# Usage:
#   bash scripts/local-preview.sh [project_config] [port]
#
# Defaults:
#   project_config = projects/mole.yml
#   port           = 4173

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT_DIR"

PROJECT_CONFIG="${1:-projects/mole.yml}"
PORT="${2:-4173}"

# --- Load .env if it exists ---
if [ -f "$ROOT_DIR/.env" ]; then
  set -a
  # shellcheck disable=SC1091
  source "$ROOT_DIR/.env"
  set +a
  echo "✓ Loaded .env"
else
  echo "⚠ No .env file found. Copy .env.example to .env and fill in your token."
  echo "  Continuing without env — some data sources will be unavailable."
fi

# --- Derive VITE_BASE_PATH from repo name if not set ---
if [ -z "${VITE_BASE_PATH:-}" ]; then
  REPO_NAME=$(basename "$(git -C "$ROOT_DIR" remote get-url origin 2>/dev/null)" .git 2>/dev/null || echo "oss-impact-dashboard")
  export VITE_BASE_PATH="/${REPO_NAME}/"
fi
echo "✓ VITE_BASE_PATH=$VITE_BASE_PATH"

# --- Step 1: Validate project config ---
echo ""
echo "=== Step 1/5: Validate project config ==="
python -m oss_impact_dashboard.cli validate-project --project "$PROJECT_CONFIG"

# --- Step 2: Build dashboard JSON (uses tokens from .env) ---
echo ""
echo "=== Step 2/5: Build dashboard JSON ==="
python -m oss_impact_dashboard.cli build \
  --project "$PROJECT_CONFIG" \
  --safe-project \
  --output web/public/data/dashboard.json

# --- Step 3: Build Vite assets (uses VITE_BASE_PATH) ---
echo ""
echo "=== Step 3/5: Build Vite assets ==="
npm run build

# --- Step 4: Post-build tests ---
echo ""
echo "=== Step 4/5: Post-build tests ==="
npm run test:build

# --- Step 5: Preview server (simulates GitHub Pages) ---
echo ""
echo "=== Step 5/5: Start preview server ==="
echo "  Dashboard:  http://127.0.0.1:${PORT}${VITE_BASE_PATH}index.html"
echo "  Report:     http://127.0.0.1:${PORT}${VITE_BASE_PATH}report.html"
echo "  Operations: http://127.0.0.1:${PORT}${VITE_BASE_PATH}operations.html"
echo "  Impact:     http://127.0.0.1:${PORT}${VITE_BASE_PATH}impact.html"
echo ""
echo "  Press Ctrl+C to stop."
exec node scripts/preview-pages.mjs "$PORT"
