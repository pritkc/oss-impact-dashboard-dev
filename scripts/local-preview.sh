#!/usr/bin/env bash
# Build dist/ like GitHub Pages, then serve it locally.
#
# Usage:
#   bash scripts/local-preview.sh [port]
#   bash scripts/local-preview.sh -- --projects projects/mole.yml projects/mole-local.yml
#
# Defaults: fetch all projects/*.yml, port 4173

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT_DIR"

PORT=4173
BUILD_ARGS=()

if [ -f "$ROOT_DIR/.env" ]; then
  set -a
  # shellcheck disable=SC1091
  source "$ROOT_DIR/.env"
  set +a
  echo "✓ Loaded .env"
fi

while [ $# -gt 0 ]; do
  case "$1" in
    --)
      shift
      BUILD_ARGS+=("$@")
      break
      ;;
    [0-9]*)
      PORT="$1"
      shift
      ;;
    *)
      BUILD_ARGS+=("$1")
      shift
      ;;
  esac
done

if [ -z "${VITE_BASE_PATH:-}" ]; then
  REPO_NAME=$(basename "$(git -C "$ROOT_DIR" remote get-url origin 2>/dev/null)" .git 2>/dev/null || echo "oss-impact-dashboard")
  export VITE_BASE_PATH="/${REPO_NAME}/"
fi

echo "→ VITE_BASE_PATH=$VITE_BASE_PATH"
npm run build:site -- "${BUILD_ARGS[@]}"
echo ""
echo "  Dashboard: http://127.0.0.1:${PORT}${VITE_BASE_PATH}index.html"
echo "  Press Ctrl+C to stop."
exec env PORT="$PORT" npm run preview:pages -- "$PORT"
