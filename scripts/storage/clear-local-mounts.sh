#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

remove_local_exclude_block() {
  local exclude_file=".git/info/exclude"
  local begin="# assist-hub-local-storage begin"
  local end="# assist-hub-local-storage end"

  if [ ! -f "$exclude_file" ]; then
    return
  fi

  python3 - "$exclude_file" <<'PY'
from pathlib import Path
import sys

path = Path(sys.argv[1])
begin = "# assist-hub-local-storage begin"
end = "# assist-hub-local-storage end"
content = path.read_text()
if begin in content and end in content:
    start = content.index(begin)
    finish = content.index(end, start) + len(end)
    head = content[:start].rstrip("\n")
    tail = content[finish:].lstrip("\n")
    combined = "\n".join(part for part in [head, tail] if part)
    path.write_text(combined + ("\n" if combined else ""))
PY
}

clear_public_mount() {
  local public_path="$1"
  local restore_mode="$2"

  if [ -L "$public_path" ]; then
    rm "$public_path"
  fi

  if [ "$restore_mode" = "tracked" ]; then
    git restore --source=HEAD --worktree -- "$public_path"
  else
    mkdir -p "$public_path"
  fi
}

if git ls-files --error-unmatch public/materials >/dev/null 2>&1; then
  git ls-files -z public/materials | xargs -0 git update-index --no-skip-worktree --
fi

remove_local_exclude_block
clear_public_mount "public/materials" "tracked"
clear_public_mount "public/material-artifacts" "directory"
clear_public_mount "public/gmail-attachments" "directory"

echo "Cleared local storage mounts."
echo "Tracked public/materials restored from HEAD."
echo "public/material-artifacts and public/gmail-attachments recreated as local directories."
