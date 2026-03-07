#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

if [ -f .env ]; then
  set -a
  . ./.env
  set +a
fi

print_mount() {
  local label="$1"
  local public_path="$2"
  local env_var="$3"
  local configured="${!env_var:-}"

  echo "[$label]"
  echo "  public path : $public_path"
  echo "  env root    : ${configured:-<unset>}"

  if [ -L "$public_path" ]; then
    echo "  mount type  : symlink"
    echo "  link target : $(readlink "$public_path")"
  elif [ -d "$public_path" ]; then
    echo "  mount type  : directory"
  else
    echo "  mount type  : missing"
  fi

  if [ -e "$public_path" ]; then
    local resolved
    resolved="$(python3 - "$public_path" <<'PY'
from pathlib import Path
import sys

print(Path(sys.argv[1]).resolve())
PY
)"
    echo "  real path   : $resolved"
  fi

  echo
}

print_mount "Classroom materials" "public/materials" "MATERIALS_STORAGE_ROOT"
print_mount "Material artifacts" "public/material-artifacts" "ARTIFACT_STORAGE_ROOT"
print_mount "Gmail attachments" "public/gmail-attachments" "GMAIL_ATTACHMENT_STORAGE_ROOT"

echo "[Git]"
if [ -f .git/info/exclude ]; then
  python3 - <<'PY'
from pathlib import Path
path = Path(".git/info/exclude")
content = path.read_text() if path.exists() else ""
begin = "# assist-hub-local-storage begin"
end = "# assist-hub-local-storage end"
if begin in content and end in content:
    start = content.index(begin)
    finish = content.index(end, start) + len(end)
    print(content[start:finish].strip())
else:
    print("no local storage exclude block")
PY
fi
