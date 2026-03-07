#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OPS_DIR="$(cd "$ROOT_DIR/.." && pwd)/ops"
ENV_FILE="${ASSIST_SETUP_ENV_FILE:-$ROOT_DIR/.env}"
EXAMPLE_ENV="$ROOT_DIR/.env.example"
DEFAULT_DATABASE_URL="${ASSIST_SETUP_DATABASE_URL:-file:./assist.db}"
DISPLAY_NAME="${ASSIST_SETUP_NAME:-}"
STUDENT_ID="${ASSIST_SETUP_STUDENT_ID:-}"
AVATAR_LABEL="${ASSIST_SETUP_AVATAR_LABEL:-}"
STORAGE_MODE="${ASSIST_SETUP_STORAGE_MODE:-}"
DRIVE_BASE_ROOT="${ASSIST_SETUP_DRIVE_BASE_ROOT:-}"
MATERIALS_ROOT="${ASSIST_SETUP_MATERIALS_ROOT:-}"
ARTIFACT_ROOT="${ASSIST_SETUP_ARTIFACT_ROOT:-}"
GMAIL_ROOT="${ASSIST_SETUP_GMAIL_ROOT:-}"
DB_BACKUP_ROOT="${ASSIST_SETUP_DB_BACKUP_ROOT:-}"
FORCE_OVERWRITE="${ASSIST_SETUP_FORCE:-0}"
SKIP_INSTALL="${ASSIST_SETUP_SKIP_INSTALL:-0}"
NONINTERACTIVE="${ASSIST_SETUP_NONINTERACTIVE:-0}"

CURRENT_STEP=""

usage() {
  cat <<'EOF'
assist-hub init

Usage:
  ./init.sh

Environment overrides:
  ASSIST_SETUP_NAME
  ASSIST_SETUP_STUDENT_ID
  ASSIST_SETUP_AVATAR_LABEL
  ASSIST_SETUP_STORAGE_MODE=local|drive|custom
  ASSIST_SETUP_DRIVE_BASE_ROOT
  ASSIST_SETUP_MATERIALS_ROOT
  ASSIST_SETUP_ARTIFACT_ROOT
  ASSIST_SETUP_GMAIL_ROOT
  ASSIST_SETUP_DB_BACKUP_ROOT
  ASSIST_SETUP_DATABASE_URL
  ASSIST_SETUP_ENV_FILE
  ASSIST_SETUP_FORCE=1
  ASSIST_SETUP_SKIP_INSTALL=1
  ASSIST_SETUP_NONINTERACTIVE=1

Notes:
  - This script writes a local .env and seeds WorkspaceProfile into assist.db.
  - If DB_BACKUP_ROOT is configured, `npm run db:backup` will write timestamped SQLite snapshots there.
  - Google Classroom / Gmail sync is optional and depends on ../ops credentials.
EOF
}

info() {
  echo "[init] $*"
}

warn() {
  echo "[init][warn] $*" >&2
}

fail() {
  echo "[init][error] $*" >&2
  exit 1
}

on_error() {
  local line="$1"
  local code="$2"
  if [ -n "$CURRENT_STEP" ]; then
    echo "[init][error] Failed during: $CURRENT_STEP (line $line, exit $code)" >&2
  else
    echo "[init][error] Setup failed at line $line (exit $code)" >&2
  fi
  echo "[init][error] Nothing is wrong with your secrets yet. Fix the reported prerequisite and run ./init.sh again." >&2
}

trap 'on_error "${LINENO}" "$?"' ERR

run_step() {
  local label="$1"
  shift
  CURRENT_STEP="$label"
  "$@"
  CURRENT_STEP=""
}

require_command() {
  local command_name="$1"
  local hint="$2"
  if ! command -v "$command_name" >/dev/null 2>&1; then
    fail "Missing required command: $command_name. $hint"
  fi
}

ensure_parent_dir() {
  local target_path="$1"
  local parent_dir
  parent_dir="$(dirname "$target_path")"
  mkdir -p "$parent_dir"
  if [ ! -w "$parent_dir" ]; then
    fail "Directory is not writable: $parent_dir"
  fi
}

database_path_from_url() {
  local database_url="$1"
  case "$database_url" in
    file:./*)
      printf '%s/%s' "$ROOT_DIR" "${database_url#file:./}"
      ;;
    file:/*)
      printf '%s' "${database_url#file:}"
      ;;
    *)
      fail "Unsupported DATABASE_URL for init.sh: $database_url. Use a SQLite file URL such as file:./assist.db"
      ;;
  esac
}

confirm_continue() {
  local prompt="$1"

  if [ "$NONINTERACTIVE" = "1" ] || [ "$FORCE_OVERWRITE" = "1" ]; then
    return
  fi

  printf "%s [y/N]: " "$prompt"
  local reply=""
  IFS= read -r reply
  if [ "$reply" != "y" ] && [ "$reply" != "Y" ]; then
    fail "Aborted by user."
  fi
}

prompt_required() {
  local label="$1"
  local value="$2"

  if [ -n "$value" ]; then
    printf '%s' "$value"
    return
  fi

  if [ "$NONINTERACTIVE" = "1" ]; then
    fail "Missing required setup value: $label. Provide it through ASSIST_SETUP_* environment variables in non-interactive mode."
  fi

  local answer=""
  while [ -z "$answer" ]; do
    printf "%s: " "$label"
    IFS= read -r answer
  done
  printf '%s' "$answer"
}

prompt_optional() {
  local label="$1"
  local value="$2"

  if [ -n "$value" ]; then
    printf '%s' "$value"
    return
  fi

  if [ "$NONINTERACTIVE" = "1" ]; then
    printf '%s' ""
    return
  fi

  local answer=""
  printf "%s (optional): " "$label"
  IFS= read -r answer
  printf '%s' "$answer"
}

prompt_choice() {
  local label="$1"
  local current="$2"
  shift 2
  local options=("$@")

  if [ -n "$current" ]; then
    printf '%s' "$current"
    return
  fi

  if [ "$NONINTERACTIVE" = "1" ]; then
    fail "Missing required setup choice: $label. Provide it through ASSIST_SETUP_* environment variables in non-interactive mode."
  fi

  local answer=""
  while :; do
    printf "%s [%s]: " "$label" "$(IFS=/; echo "${options[*]}")"
    IFS= read -r answer
    for option in "${options[@]}"; do
      if [ "$answer" = "$option" ]; then
        printf '%s' "$answer"
        return
      fi
    done
    echo "Choose one of: ${options[*]}"
  done
}

ensure_safe_env_write() {
  if [ -f "$ENV_FILE" ] && [ "$FORCE_OVERWRITE" != "1" ]; then
    if [ "$NONINTERACTIVE" = "1" ]; then
      fail ".env already exists at $ENV_FILE. Re-run with ASSIST_SETUP_FORCE=1 if overwrite is intended."
    fi
    printf ".env already exists at %s. Overwrite it? [y/N]: " "$ENV_FILE"
    local reply=""
    IFS= read -r reply
    if [ "$reply" != "y" ] && [ "$reply" != "Y" ]; then
      echo "Aborted to avoid overwriting existing .env."
      exit 1
    fi
  fi
}

normalize_avatar_label() {
  local display_name="$1"
  local avatar_label="$2"

  if [ -n "$avatar_label" ]; then
    printf '%s' "$avatar_label"
    return
  fi

  printf '%s' "${display_name:0:1}"
}

normalize_storage_root() {
  local label="$1"
  local input_value="$2"

  if [ -z "$input_value" ]; then
    printf '%s' ""
    return
  fi

  local expanded="${input_value/#\~/$HOME}"
  mkdir -p "$expanded"
  if [ ! -d "$expanded" ]; then
    fail "$label directory could not be created: $expanded"
  fi
  if [ ! -w "$expanded" ]; then
    fail "$label directory is not writable: $expanded"
  fi
  printf '%s' "$expanded"
}

resolve_storage_roots() {
  case "$STORAGE_MODE" in
    local)
      MATERIALS_ROOT=""
      ARTIFACT_ROOT=""
      GMAIL_ROOT=""
      ;;
    drive)
      DRIVE_BASE_ROOT="$(prompt_required "Google Drive base folder (example: $HOME/Library/CloudStorage/GoogleDrive-your-account/My Drive/01_Project/dev_blob)" "$DRIVE_BASE_ROOT")"
      DRIVE_BASE_ROOT="$(normalize_storage_root "Google Drive base folder" "$DRIVE_BASE_ROOT")"
      MATERIALS_ROOT="$DRIVE_BASE_ROOT/assist_hub_classroom_materials"
      ARTIFACT_ROOT="$DRIVE_BASE_ROOT/assist_hub_artifacts"
      GMAIL_ROOT="$DRIVE_BASE_ROOT/assist_hub_gmail_attachments"
      ;;
    custom)
      MATERIALS_ROOT="$(prompt_optional "Custom materials storage root" "$MATERIALS_ROOT")"
      ARTIFACT_ROOT="$(prompt_optional "Custom artifact storage root" "$ARTIFACT_ROOT")"
      GMAIL_ROOT="$(prompt_optional "Custom Gmail attachment storage root" "$GMAIL_ROOT")"
      MATERIALS_ROOT="$(normalize_storage_root "Materials storage root" "$MATERIALS_ROOT")"
      ARTIFACT_ROOT="$(normalize_storage_root "Artifact storage root" "$ARTIFACT_ROOT")"
      GMAIL_ROOT="$(normalize_storage_root "Gmail attachment storage root" "$GMAIL_ROOT")"
      ;;
    *)
      fail "Unsupported storage mode: $STORAGE_MODE. Use local, drive, or custom."
      ;;
  esac

  if [ -z "$DB_BACKUP_ROOT" ] && [ "$STORAGE_MODE" = "drive" ]; then
    DB_BACKUP_ROOT="$DRIVE_BASE_ROOT/assist_hub_db_backups"
  fi

  DB_BACKUP_ROOT="$(normalize_storage_root "SQLite backup root" "$DB_BACKUP_ROOT")"
}

codex_cli_readiness() {
  if command -v codex >/dev/null 2>&1; then
    echo "Codex CLI: ready"
  else
    echo "Codex CLI: missing (required only for Summary > MD로 폴리싱)"
  fi
}

google_sync_readiness() {
  local setup_script="$OPS_DIR/setup_classroom.py"
  local credentials_path="$OPS_DIR/credentials.json"
  local token_path="$OPS_DIR/token.json"

  if [ ! -d "$OPS_DIR" ]; then
    echo "Google sync: ops directory missing at $OPS_DIR"
    return
  fi

  echo "Google sync readiness:"
  if [ -f "$setup_script" ]; then
    echo "  - setup script: ready"
  else
    echo "  - setup script: missing ($setup_script)"
  fi

  if [ -f "$credentials_path" ]; then
    echo "  - credentials.json: present"
  else
    echo "  - credentials.json: missing"
  fi

  if [ -f "$token_path" ]; then
    echo "  - token.json: present"
  else
    echo "  - token.json: missing"
  fi
}

show_setup_summary() {
  local database_url="$1"
  local materials_root="$2"
  local artifact_root="$3"
  local gmail_root="$4"
  local db_backup_root="$5"

  echo
  echo "Setup summary:"
  echo "  - display name: $DISPLAY_NAME"
  echo "  - student ID: $STUDENT_ID"
  echo "  - avatar label: $AVATAR_LABEL"
  echo "  - storage mode: $STORAGE_MODE"
  echo "  - env file: $ENV_FILE"
  echo "  - database URL: $database_url"
  echo "  - database backup root: ${db_backup_root:-disabled}"
  echo "  - materials root: ${materials_root:-repo-local public/materials}"
  echo "  - artifacts root: ${artifact_root:-repo-local public/material-artifacts}"
  echo "  - Gmail attachments root: ${gmail_root:-repo-local public/gmail-attachments}"
  google_sync_readiness
  codex_cli_readiness
  echo
}

preflight_checks() {
  require_command "node" "Install Node.js 20+ first."
  require_command "npm" "Install npm with Node.js first."
  require_command "npx" "Install npm with Node.js first."
  require_command "python3" "Install Python 3 first."

  [ -f "$EXAMPLE_ENV" ] || fail "Missing .env.example at $EXAMPLE_ENV"
  [ -f "$ROOT_DIR/package.json" ] || fail "Missing package.json in $ROOT_DIR"
  [ -f "$ROOT_DIR/prisma/schema.prisma" ] || fail "Missing prisma/schema.prisma"
  [ -f "$ROOT_DIR/scripts/seed-profile.mjs" ] || fail "Missing scripts/seed-profile.mjs"

  ensure_parent_dir "$ENV_FILE"
  ensure_parent_dir "$(database_path_from_url "$DEFAULT_DATABASE_URL")"
}

write_env_file() {
  local database_url="$1"
  local db_backup_root="$2"
  local materials_root="$3"
  local artifact_root="$4"
  local gmail_root="$5"

  cat > "$ENV_FILE" <<EOF
DATABASE_URL="$database_url"
DB_BACKUP_ROOT="$db_backup_root"

# Optional: use external backing folders while keeping the same public URLs.
# Each public/* mount should point at the same real path, typically via symlink.
MATERIALS_STORAGE_ROOT="$materials_root"
ARTIFACT_STORAGE_ROOT="$artifact_root"
GMAIL_ATTACHMENT_STORAGE_ROOT="$gmail_root"
EOF
}

maybe_install_dependencies() {
  if [ "$SKIP_INSTALL" = "1" ]; then
    info "Skipping npm install because ASSIST_SETUP_SKIP_INSTALL=1"
    return
  fi

  if [ ! -d "$ROOT_DIR/node_modules" ]; then
    info "Installing npm dependencies..."
    (cd "$ROOT_DIR" && npm install)
  else
    info "node_modules already present. Skipping npm install."
  fi
}

generate_prisma_client() {
  cd "$ROOT_DIR"
  npm run prisma:generate
}

push_database_schema() {
  cd "$ROOT_DIR"
  DATABASE_URL="$DEFAULT_DATABASE_URL" npx prisma db push
}

seed_workspace_profile() {
  local seed_args=(
    --display-name "$DISPLAY_NAME"
    --student-id "$STUDENT_ID"
    --database-url "$DEFAULT_DATABASE_URL"
  )

  if [ -n "$AVATAR_LABEL" ]; then
    seed_args+=(--avatar-label "$AVATAR_LABEL")
  fi

  cd "$ROOT_DIR"
  DATABASE_URL="$DEFAULT_DATABASE_URL" node ./scripts/seed-profile.mjs "${seed_args[@]}"
}

maybe_apply_storage_mounts() {
  if [ "$ENV_FILE" != "$ROOT_DIR/.env" ]; then
    echo "Skipping local storage mount apply because ENV_FILE is not the default .env."
    return
  fi

  local has_roots=0
  if [ -n "$MATERIALS_ROOT" ] || [ -n "$ARTIFACT_ROOT" ] || [ -n "$GMAIL_ROOT" ]; then
    has_roots=1
  fi

  if [ "$has_roots" -eq 1 ]; then
    require_command "git" "Git is required to apply local storage mounts."
    info "Applying local storage mounts..."
    (cd "$ROOT_DIR" && npm run storage:apply-local)
  else
    info "No external storage roots provided. Keeping repo-local public/* directories."
  fi
}

main() {
  if [ "${1:-}" = "--help" ] || [ "${1:-}" = "-h" ]; then
    usage
    exit 0
  fi

  run_step "preflight checks" preflight_checks

  echo "== assist-hub local setup =="
  echo "This will create/update your local .env and seed your personal profile into assist.db."
  echo "Google sync is optional. Missing auth files will be reported as follow-up work, not as a blocker."
  echo

  DISPLAY_NAME="$(prompt_required "Display name" "$DISPLAY_NAME")"
  STUDENT_ID="$(prompt_required "Student ID" "$STUDENT_ID")"
  AVATAR_LABEL="$(prompt_optional "Avatar label (default: first character of your name)" "$AVATAR_LABEL")"
  STORAGE_MODE="$(prompt_choice "Storage mode" "$STORAGE_MODE" local drive custom)"

  AVATAR_LABEL="$(normalize_avatar_label "$DISPLAY_NAME" "$AVATAR_LABEL")"
  resolve_storage_roots
  if [ "$NONINTERACTIVE" != "1" ] && [ -z "${ASSIST_SETUP_DB_BACKUP_ROOT:-}" ]; then
    DB_BACKUP_ROOT="$(prompt_optional "SQLite backup root (optional; leave blank to disable)" "$DB_BACKUP_ROOT")"
    DB_BACKUP_ROOT="$(normalize_storage_root "SQLite backup root" "$DB_BACKUP_ROOT")"
  fi

  ensure_safe_env_write
  show_setup_summary "$DEFAULT_DATABASE_URL" "$MATERIALS_ROOT" "$ARTIFACT_ROOT" "$GMAIL_ROOT" "$DB_BACKUP_ROOT"
  confirm_continue "Continue with this setup?"
  write_env_file "$DEFAULT_DATABASE_URL" "$DB_BACKUP_ROOT" "$MATERIALS_ROOT" "$ARTIFACT_ROOT" "$GMAIL_ROOT"

  run_step "dependency install" maybe_install_dependencies

  info "Generating Prisma client..."
  run_step "Prisma client generation" generate_prisma_client

  info "Creating/updating local database schema..."
  run_step "database schema push" push_database_schema

  info "Seeding workspace profile..."
  run_step "workspace profile seed" seed_workspace_profile

  run_step "local storage mount apply" maybe_apply_storage_mounts

  echo
  echo "Setup complete."
  echo
  echo "Next steps:"
  echo "1. Run: npm run dev"
  echo "2. If you need Classroom/Gmail sync, put credentials.json in ../ops and run: python3 ../ops/setup_classroom.py"
  echo "3. If DB_BACKUP_ROOT is configured, create a SQLite snapshot any time with: npm run db:backup"
  echo "4. If you use external storage roots, verify them with: npm run storage:status"
  echo "5. If you want Summary > MD로 폴리싱, make sure Codex CLI is installed and logged in: codex login"
}

main "$@"
