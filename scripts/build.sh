#!/usr/bin/env bash
# Unified build entry point. Forwards args to build-index.
#
# Usage:
#   bash scripts/build.sh data [--projects projects/mole.yml ...]
#   bash scripts/build.sh ui  [--projects projects/mole.yml ...]
#   bash scripts/build.sh site [--projects projects/mole.yml ...]

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
if [ -f "$ROOT_DIR/.env" ]; then
  set -a
  # shellcheck disable=SC1091
  source "$ROOT_DIR/.env"
  set +a
fi

MODE="${1:?usage: build.sh data|ui|site [build-index args...]}"
shift

case "$MODE" in
  data)
    exec python -m oss_impact_dashboard.cli build-index --safe-project "$@"
    ;;
  ui)
    python -m oss_impact_dashboard.cli build-index --from-cache --safe-project "$@"
    exec npm run build
    ;;
  site)
    python -m oss_impact_dashboard.cli build-index --safe-project "$@"
    npm run build
    exec npm run test:build
    ;;
  *)
    echo "error: unknown mode '$MODE' (expected data, ui, or site)" >&2
    exit 1
    ;;
esac
