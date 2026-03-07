#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${ASSIST_SETUP_ENV_FILE:-$ROOT_DIR/.env}"
EXAMPLE_ENV="$ROOT_DIR/.env.example"
DEFAULT_DATABASE_URL="${ASSIST_SETUP_DATABASE_URL:-file:./assist.db}"
DISPLAY_NAME="${ASSIST_SETUP_NAME:-}"
STUDENT_ID="${ASSIST_SETUP_STUDENT_ID:-}"
AVATAR_LABEL="${ASSIST_SETUP_AVATAR_LABEL:-}"
MATERIALS_ROOT="${ASSIST_SETUP_MATERIALS_ROOT:-}"
ARTIFACT_ROOT="${ASSIST_SETUP_ARTIFACT_ROOT:-}"
GMAIL_ROOT="${ASSIST_SETUP_GMAIL_ROOT:-}"
FORCE_OVERWRITE="${ASSIST_SETUP_FORCE:-0}"
SKIP_INSTALL="${ASSIST_SETUP_SKIP_INSTALL:-0}"

prompt_required() {
  local label="$1"
  local value="$2"

  if [ -n "$value" ]; then
    printf '%s' "$value"
    return
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

  local answer=""
  printf "%s (optional): " "$label"
  IFS= read -r answer
  printf '%s' "$answer"
}

ensure_safe_env_write() {
  if [ -f "$ENV_FILE" ] && [ "$FORCE_OVERWRITE" != "1" ]; then
    printf ".env already exists at %s. Overwrite it? [y/N]: " "$ENV_FILE"
    local reply=""
    IFS= read -r reply
    if [ "$reply" != "y" ] && [ "$reply" != "Y" ]; then
      echo "Aborted to avoid overwriting existing .env."
      exit 1
    fi
  fi
}

write_env_file() {
  local database_url="$1"
  local materials_root="$2"
  local artifact_root="$3"
  local gmail_root="$4"

  cat > "$ENV_FILE" <<EOF
DATABASE_URL="$database_url"

# Optional: use external backing folders while keeping the same public URLs.
# Each public/* mount should point at the same real path, typically via symlink.
MATERIALS_STORAGE_ROOT="$materials_root"
ARTIFACT_STORAGE_ROOT="$artifact_root"
GMAIL_ATTACHMENT_STORAGE_ROOT="$gmail_root"
EOF
}

maybe_install_dependencies() {
  if [ "$SKIP_INSTALL" = "1" ]; then
    return
  fi

  if [ ! -d "$ROOT_DIR/node_modules" ]; then
    echo "Installing npm dependencies..."
    (cd "$ROOT_DIR" && npm install)
  fi
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
    echo "Applying local storage mounts..."
    (cd "$ROOT_DIR" && npm run storage:apply-local)
  fi
}

main() {
  if [ ! -f "$EXAMPLE_ENV" ]; then
    echo "Missing .env.example at $EXAMPLE_ENV"
    exit 1
  fi

  echo "== assist-hub local setup =="
  echo "This will create/update your local .env and seed your personal profile into assist.db."
  echo

  DISPLAY_NAME="$(prompt_required "Display name" "$DISPLAY_NAME")"
  STUDENT_ID="$(prompt_required "Student ID" "$STUDENT_ID")"
  AVATAR_LABEL="$(prompt_optional "Avatar label (default: first character of your name)" "$AVATAR_LABEL")"
  MATERIALS_ROOT="$(prompt_optional "External materials storage root" "$MATERIALS_ROOT")"
  ARTIFACT_ROOT="$(prompt_optional "External artifact storage root" "$ARTIFACT_ROOT")"
  GMAIL_ROOT="$(prompt_optional "External Gmail attachment storage root" "$GMAIL_ROOT")"

  ensure_safe_env_write
  write_env_file "$DEFAULT_DATABASE_URL" "$MATERIALS_ROOT" "$ARTIFACT_ROOT" "$GMAIL_ROOT"

  maybe_install_dependencies

  echo "Generating Prisma client..."
  (cd "$ROOT_DIR" && npm run prisma:generate)

  echo "Creating/updating local database schema..."
  (cd "$ROOT_DIR" && DATABASE_URL="$DEFAULT_DATABASE_URL" npx prisma db push)

  echo "Seeding workspace profile..."
  local seed_args=(
    --display-name "$DISPLAY_NAME"
    --student-id "$STUDENT_ID"
    --database-url "$DEFAULT_DATABASE_URL"
  )

  if [ -n "$AVATAR_LABEL" ]; then
    seed_args+=(--avatar-label "$AVATAR_LABEL")
  fi

  (cd "$ROOT_DIR" && DATABASE_URL="$DEFAULT_DATABASE_URL" node ./scripts/seed-profile.mjs "${seed_args[@]}")

  maybe_apply_storage_mounts

  echo
  echo "Setup complete."
  echo
  echo "Next steps:"
  echo "1. Put Google auth files in ../ops if you need Classroom/Gmail sync."
  echo "2. Run: python3 ../ops/setup_classroom.py"
  echo "3. Run: npm run dev"
}

main "$@"
