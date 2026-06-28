#!/usr/bin/env bash
# Build dist/ like GitHub Pages, then serve it locally.
#
# Usage:
#   bash scripts/local-preview.sh [project_config] [port]
#
# Defaults: projects/example.yml, port 4173

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT_DIR"

PORT="${2:-4173}"
export PROJECT_CONFIG="${1:-projects/example.yml}"

if [ -f "$ROOT_DIR/.env" ]; then
  set -a
  # shellcheck disable=SC1091
  source "$ROOT_DIR/.env"
  set +a
  echo "✓ Loaded .env"
fi

if [ -z "${VITE_BASE_PATH:-}" ]; then
  REPO_NAME=$(basename "$(git -C "$ROOT_DIR" remote get-url origin 2>/dev/null)" .git 2>/dev/null || echo "oss-impact-dashboard")
  export VITE_BASE_PATH="/${REPO_NAME}/"
fi

echo "→ PROJECT_CONFIG=$PROJECT_CONFIG"
echo "→ VITE_BASE_PATH=$VITE_BASE_PATH"
npm run build:site
echo ""
echo "  Dashboard: http://127.0.0.1:${PORT}${VITE_BASE_PATH}index.html"
echo "  Press Ctrl+C to stop."
exec env PORT="$PORT" npm run preview:pages -- "$PORT"
