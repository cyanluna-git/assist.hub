#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

if [ ! -f .env ]; then
  echo ".env not found. Create it before applying local mounts." >&2
  exit 1
fi

set -a
. ./.env
set +a

require_env() {
  local name="$1"
  local value="${!name:-}"
  if [ -z "$value" ]; then
    echo "$name is not set in .env" >&2
    exit 1
  fi
}

append_local_exclude_block() {
  local exclude_file=".git/info/exclude"
  local begin="# assist-hub-local-storage begin"
  local end="# assist-hub-local-storage end"

  touch "$exclude_file"
  python3 - "$exclude_file" <<'PY'
from pathlib import Path
import sys

path = Path(sys.argv[1])
begin = "# assist-hub-local-storage begin"
end = "# assist-hub-local-storage end"
block = "\n".join([
    begin,
    "public/materials",
    "public/material-artifacts",
    "public/gmail-attachments",
    end,
])
content = path.read_text() if path.exists() else ""
if begin in content and end in content:
    start = content.index(begin)
    finish = content.index(end, start) + len(end)
    content = content[:start].rstrip("\n")
else:
    content = content.rstrip("\n")
if content:
    content += "\n"
content += block + "\n"
path.write_text(content)
PY
}

mount_public_path() {
  local public_path="$1"
  local backing_root="$2"

  mkdir -p "$backing_root"

  if [ -L "$public_path" ]; then
    rm "$public_path"
  elif [ -d "$public_path" ]; then
    rsync -a "$public_path"/ "$backing_root"/
    rm -rf "$public_path"
  elif [ -e "$public_path" ]; then
    echo "Unsupported existing path: $public_path" >&2
    exit 1
  fi

  ln -s "$backing_root" "$public_path"
}

mark_materials_skip_worktree() {
  local files
  files=$(git ls-files public/materials)
  if [ -n "$files" ]; then
    git ls-files -z public/materials | xargs -0 git update-index --skip-worktree --
  fi
}

require_env MATERIALS_STORAGE_ROOT
require_env ARTIFACT_STORAGE_ROOT
require_env GMAIL_ATTACHMENT_STORAGE_ROOT

mount_public_path "public/materials" "$MATERIALS_STORAGE_ROOT"
mount_public_path "public/material-artifacts" "$ARTIFACT_STORAGE_ROOT"
mount_public_path "public/gmail-attachments" "$GMAIL_ATTACHMENT_STORAGE_ROOT"

append_local_exclude_block
mark_materials_skip_worktree

echo "Applied local storage mounts:"
echo "  public/materials -> $MATERIALS_STORAGE_ROOT"
echo "  public/material-artifacts -> $ARTIFACT_STORAGE_ROOT"
echo "  public/gmail-attachments -> $GMAIL_ATTACHMENT_STORAGE_ROOT"
echo "Local git exclude rules updated in .git/info/exclude"
