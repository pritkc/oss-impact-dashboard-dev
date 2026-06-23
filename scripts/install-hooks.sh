#!/usr/bin/env bash
# Install repository-managed hooks into Git's real shared hooks directory.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT_DIR"

HOOKS_DIR="$(git rev-parse --git-path hooks)"
mkdir -p "$HOOKS_DIR"

for hook in pre-commit pre-push; do
  source_path="$ROOT_DIR/scripts/$hook.sh"
  target_path="$HOOKS_DIR/$hook"

  is_managed=false
  if [ -f "$target_path" ] && {
    grep -q "OSS Impact Dashboard managed hook" "$target_path" ||
      grep -q "Pre-push hook: runs the same checks as CI" "$target_path"
  }; then
    is_managed=true
  fi

  if [ -f "$target_path" ] && [ "$is_managed" = false ]; then
    backup_path="$target_path.local"
    if [ -e "$backup_path" ]; then
      echo "error: refusing to overwrite existing $target_path and $backup_path" >&2
      exit 1
    fi
    mv "$target_path" "$backup_path"
    echo "Preserved existing $hook hook as $backup_path"
  fi

  cp "$source_path" "$target_path"
  chmod +x "$target_path"
  echo "Installed $hook hook at $target_path"
done
