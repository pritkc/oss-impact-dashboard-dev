#!/usr/bin/env bash
# Validate GitHub Actions YAML against the published workflow schema.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT_DIR"

if [ ! -x node_modules/.bin/action-validator ]; then
  echo "error: action-validator is not installed; run npm ci." >&2
  exit 1
fi

for workflow in .github/workflows/*.yml; do
  node_modules/.bin/action-validator "$workflow"
done

echo "GitHub Actions workflow validation passed."
