#!/usr/bin/env bash
# Pre-push hook: runs the same checks as CI before allowing a push.
# Install: npm run install:hooks
set -euo pipefail

echo "▶ Running pre-push checks (same as CI)..."

echo "  [1/5] ruff check ."
ruff check .

echo "  [2/5] pytest"
python -m pytest tests/ -q

echo "  [3/5] npm run build (VITE_BASE_PATH=/oss-impact-dashboard/)"
VITE_BASE_PATH=/oss-impact-dashboard/ npm run build --silent

echo "  [4/5] npm run test:build"
npm run test:build --silent

echo "  [5/5] npm run test:frontend"
npm run test:frontend --silent

echo "✅ All pre-push checks passed. Pushing..."
