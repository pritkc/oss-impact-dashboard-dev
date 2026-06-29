#!/usr/bin/env bash
# Publish sanitized Read the Docs cache files to the gh-pages branch.
set -euo pipefail

CACHE_DIR="${1:?usage: publish-rtd-cache.sh <cache-dir> <project-id>}"
PROJECT_ID="${2:?usage: publish-rtd-cache.sh <cache-dir> <project-id>}"

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

git config user.name "github-actions[bot]"
git config user.email "41898282+github-actions[bot]@users.noreply.github.com"

worktree="$(mktemp -d)"
git fetch origin gh-pages --depth=1
git worktree add --detach "$worktree" origin/gh-pages

target_dir="${worktree}/rtd-cache/${PROJECT_ID}"
mkdir -p "$target_dir"
for file in latest.json history.json collection-state.json; do
  if [ -s "${CACHE_DIR}/${file}" ]; then
    cp "${CACHE_DIR}/${file}" "${target_dir}/${file}"
  fi
done

cd "$worktree"
git add "rtd-cache/${PROJECT_ID}"
if git diff --cached --quiet; then
  echo "No RTD cache changes to publish."
  git worktree remove --force "$worktree"
  exit 0
fi

git commit -m "Update Read the Docs cache for ${PROJECT_ID}"
for attempt in 1 2 3; do
  if git push origin HEAD:gh-pages; then
    break
  fi
  git fetch origin gh-pages --depth=1
  git reset --hard origin/gh-pages
  mkdir -p "$target_dir"
  for file in latest.json history.json collection-state.json; do
    if [ -s "${ROOT_DIR}/${CACHE_DIR}/${file}" ]; then
      cp "${ROOT_DIR}/${CACHE_DIR}/${file}" "${target_dir}/${file}"
    fi
  done
  git add "rtd-cache/${PROJECT_ID}"
  git commit -m "Update Read the Docs cache for ${PROJECT_ID}" || true
done

git worktree remove --force "$worktree"
