#!/usr/bin/env bash
# Collect Read the Docs analytics. Loads .env like build.sh for local credentials.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
if [ -f "$ROOT_DIR/.env" ]; then
  set -a
  # shellcheck disable=SC1091
  source "$ROOT_DIR/.env"
  set +a
fi

exec node "$ROOT_DIR/scripts/collect-rtd-analytics.mjs" "$@"
