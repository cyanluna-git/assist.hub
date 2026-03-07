# assist-hub

`assist-hub` is a local-first academic workspace for running an MBA study workflow from one place.

The app brings together:

- Google Classroom source materials
- Gmail notices from `assist.ac.kr`
- manual academic schedules
- per-document summaries and notes
- manually uploaded study artifacts such as slides, infographics, audio, and mindmaps

The goal is practical: stop hunting across Classroom, Gmail, SMS, PDFs, and cloud folders, and instead work from one interface that is optimized for reading, triage, and review.

## What the Platform Does

### Dashboard

- shows upcoming deadlines and action items
- surfaces unread materials and documents without summaries
- exposes sync state for Classroom and Gmail

### Materials

- indexes local Classroom files and markdown notes
- opens PDF and markdown materials in a focused reader
- remembers PDF reading position
- supports manual summary paste/save with optional Markdown polishing
- supports manual artifact upload, preview, replace, and delete

### Bulletin

- aggregates manual SMS notices and Gmail notices from `assist.ac.kr`
- stores Gmail attachments locally
- supports pin, archive, unread/read, search, and filtering

### Schedule

- shows synced assignments and manual academic events together
- supports manual schedule create/edit/delete
- supports pinning and monthly chronology view
- can export schedule items to Google Calendar with duplicate protection

### Search

- global command palette via `Cmd+K`
- searches across materials, bulletin items, and schedule entries

## Product Shape

This app is intentionally optimized for a single-user localhost workflow.

That means:

- SQLite is used for local state
- files are served from `public/*`
- large files can be moved out of the repo into cloud-backed folders
- some Google-connected workflows depend on local auth files in `../ops`

It is not currently designed as a multi-user SaaS deployment.

## Stack

- Next.js 16 App Router
- React 19
- TypeScript
- Prisma + SQLite
- Google APIs:
  - Classroom
  - Gmail
  - Calendar
- `pdfjs-dist` for the in-app PDF reader

## Project Layout

```text
assist.ai.mba/
  assist-hub/         # main app
  ops/                # local Google auth + Classroom download scripts
```

Inside `assist-hub/`:

```text
src/app/              # pages and UI
src/lib/              # Prisma, sync, storage, search, Google helpers
prisma/schema.prisma  # SQLite schema
public/               # app-served files or symlink mounts
docs/                 # operational docs
```

## Installation

### Prerequisites

- macOS or another Unix-like shell environment
- Node.js 20+
- npm
- Python 3
- Google account access if you want Classroom/Gmail sync
- optional: Google Drive desktop sync if you want cloud-backed file storage
- optional: Codex CLI if you want `Summary > MD로 폴리싱`

### 1. Clone the repo

```bash
git clone https://github.com/cyanluna-git/assist.hub.git
cd assist.hub
```

If you are working from the monorepo layout used by the author, the app lives in:

```bash
cd assist.ai.mba/assist-hub
```

### 2. Recommended: guided first-time setup

```bash
./init.sh
```

or:

```bash
npm run setup:init
```

The init flow does the following:

- prompts for your display name and student ID
- asks which storage mode you want:
  - `local`: keep files inside the repo
  - `drive`: keep files in a Google Drive-backed folder
  - `custom`: provide three custom roots manually
- checks required local tools before changing files
- creates or updates a local `.env`
- creates the local `assist.db`
- runs Prisma setup
- seeds your personal workspace profile into the DB
- applies storage mounts automatically when external roots are configured
- reports Google sync readiness by checking `../ops` setup files
- reports whether Codex CLI is available for Markdown polishing
- stops with contextual error messages if install / Prisma / seeding fails

This is the intended setup path for classmates cloning the repo for the first time.

If you want to automate onboarding without prompts, provide the setup values through environment variables:

```bash
ASSIST_SETUP_NAME="홍길동" \
ASSIST_SETUP_STUDENT_ID="20260001" \
ASSIST_SETUP_STORAGE_MODE="local" \
ASSIST_SETUP_FORCE=1 \
ASSIST_SETUP_NONINTERACTIVE=1 \
./init.sh
```

Google Drive-backed storage example:

```bash
ASSIST_SETUP_NAME="홍길동" \
ASSIST_SETUP_STUDENT_ID="20260001" \
ASSIST_SETUP_STORAGE_MODE="drive" \
ASSIST_SETUP_DRIVE_BASE_ROOT="$HOME/Library/CloudStorage/GoogleDrive-your-account/My Drive/01_Project/dev_blob" \
ASSIST_SETUP_FORCE=1 \
ASSIST_SETUP_NONINTERACTIVE=1 \
./init.sh
```

### 3. Start the app

```bash
npm run dev
```

The app runs on:

- `http://localhost:5103`

### 4. Optional: enable Google sync

If you want Classroom and Gmail sync, add your Google auth files in `../ops` and run:

```bash
python3 ../ops/setup_classroom.py
```

Then you can:

- download Classroom files with `python3 ../ops/download_classroom_files.py`
- convert extracted PDFs with `python3 ../ops/convert_to_obsidian.py`
- use Bulletin Gmail sync and Dashboard Classroom sync from the app

`./init.sh` does not create Google OAuth credentials for you. It only tells you whether `../ops/credentials.json`, `../ops/token.json`, and `../ops/setup_classroom.py` are ready.

### 5. Optional: enable Markdown polishing for pasted summaries

`Summary > MD로 폴리싱` uses the local `codex` CLI.

Check that it exists:

```bash
codex --help
```

If needed, authenticate:

```bash
codex login
```

This step is optional. Summary paste/save works without it.

## Manual Installation

Use this only if you do not want to run the guided setup script.

If you need to do the steps yourself:

### 1. Install dependencies

```bash
npm install
```

`postinstall` runs `prisma generate`, so the Prisma client is created automatically.

### 2. Create `.env`

Start from `.env.example`.

Minimum local setup:

```bash
DATABASE_URL="file:./assist.db"
DB_BACKUP_ROOT=""
```

Option A: keep everything inside the repo:

```bash
MATERIALS_STORAGE_ROOT=""
ARTIFACT_STORAGE_ROOT=""
GMAIL_ATTACHMENT_STORAGE_ROOT=""
```

Option B: keep large files in a Google Drive-backed folder:

```bash
DB_BACKUP_ROOT="$HOME/Library/CloudStorage/GoogleDrive-your-account/My Drive/01_Project/dev_blob/assist_hub_db_backups"
MATERIALS_STORAGE_ROOT="$HOME/Library/CloudStorage/GoogleDrive-your-account/My Drive/01_Project/dev_blob/assist_hub_classroom_materials"
ARTIFACT_STORAGE_ROOT="$HOME/Library/CloudStorage/GoogleDrive-your-account/My Drive/01_Project/dev_blob/assist_hub_artifacts"
GMAIL_ATTACHMENT_STORAGE_ROOT="$HOME/Library/CloudStorage/GoogleDrive-your-account/My Drive/01_Project/dev_blob/assist_hub_gmail_attachments"
```

Option C: use any local folder outside the repo:

```bash
DB_BACKUP_ROOT="$HOME/dev_blob/assist_hub_db_backups"
MATERIALS_STORAGE_ROOT="$HOME/dev_blob/assist_hub_classroom_materials"
ARTIFACT_STORAGE_ROOT="$HOME/dev_blob/assist_hub_artifacts"
GMAIL_ATTACHMENT_STORAGE_ROOT="$HOME/dev_blob/assist_hub_gmail_attachments"
```

See [`.env.example`](./.env.example), [`docs/artifact-storage.md`](./docs/artifact-storage.md), and [`docs/db-backups.md`](./docs/db-backups.md).

### 3. Create the local DB schema

```bash
npx prisma db push
node scripts/seed-profile.mjs --display-name "홍길동" --student-id "20260001"
```

### 4. Start the app

```bash
npm run dev
```

### 5. Optional: enable Google sync

```bash
python3 ../ops/setup_classroom.py
```

## Core Commands

### App CLI

```bash
npm run dev
npm run build
npm run lint
npm run setup:init
npm run db:backup
npm run storage:apply-local
npm run storage:status
npm run storage:clear-local
```

### Google / Ops CLI

Run these from `assist-hub/` or from the repo root.

```bash
python3 ../ops/setup_classroom.py
python3 ../ops/get_class_info.py
python3 ../ops/download_classroom_files.py
python3 ../ops/convert_to_obsidian.py
```

What each one does:

- `setup_classroom.py`
  - refreshes OAuth for Classroom, Drive, Calendar, and Gmail scopes
- `get_class_info.py`
  - checks whether the target course is visible through the current token
- `download_classroom_files.py`
  - downloads source files into the configured materials root
- `convert_to_obsidian.py`
  - converts extracted PDF output into markdown notes under `materials/obsidian_notes`

### Codex CLI

Used only for summary Markdown polishing inside the document viewer:

```bash
codex --help
codex login
```

If `codex` is missing, the app still works. Only the `MD로 폴리싱` button is unavailable in practice.

## Storage Options

There are three valid storage modes.

### 1. Repo-local storage

Use this when:

- you want the simplest setup
- you only use one machine
- you do not care about cloud-synced file bytes

Behavior:

- files stay under `public/materials`, `public/material-artifacts`, and `public/gmail-attachments`
- no symlink mounts are applied

### 2. Google Drive-backed storage

Use this when:

- you want large files outside the repo
- you want Google Drive to sync materials/artifacts/attachments
- you still want stable browser URLs inside the app

Behavior:

- `init.sh` asks for one Google Drive base folder
- the app derives four child folders automatically
- `npm run storage:apply-local` wires `public/*` mounts to those real folders

Recommended base:

```bash
$HOME/Library/CloudStorage/GoogleDrive-your-account/My Drive/01_Project/dev_blob
```

Derived folders:

- `assist_hub_db_backups`
- `assist_hub_classroom_materials`
- `assist_hub_artifacts`
- `assist_hub_gmail_attachments`

### 3. Custom local folders

Use this when:

- you do not want Google Drive
- but you still want files outside the repo

Behavior:

- choose `custom` in `init.sh`
- provide three explicit paths yourself

This is useful for:

- external SSDs
- Dropbox / iCloud / Synology-style sync folders
- any local folder layout you already manage

## CLI Integration Map

Use this table as the operating model for the project.

| Need | Command | Why |
|---|---|---|
| first-time setup | `./init.sh` | creates `.env`, DB, profile, storage config |
| start app | `npm run dev` | launches Next.js on `localhost:5103` |
| validate app | `npm run lint` / `npm run build` | code quality and production build |
| snapshot local DB | `npm run db:backup` | writes timestamped SQLite backups to `DB_BACKUP_ROOT` |
| inspect storage mounts | `npm run storage:status` | checks real paths and symlink state |
| apply external mounts | `npm run storage:apply-local` | links `public/*` to configured roots |
| clear external mounts | `npm run storage:clear-local` | returns to repo-local folders |
| refresh Google auth | `python3 ../ops/setup_classroom.py` | obtains Classroom / Gmail / Calendar token |
| check course access | `python3 ../ops/get_class_info.py` | confirms token/course visibility |
| download Classroom files | `python3 ../ops/download_classroom_files.py` | pulls source materials into the materials root |
| convert extracted PDFs | `python3 ../ops/convert_to_obsidian.py` | generates markdown notes |
| polish pasted summary | `codex login` then app UI | enables `MD로 폴리싱` in Summary |

## Data Model Overview

Main entities:

- `Course`
- `Material`
- `Note`
- `MaterialArtifact`
- `Assignment`
- `ManualScheduleItem`
- `BulletinItem`
- `BulletinAttachment`
- `WorkspaceProfile`
- `SyncState`
- `CalendarExportRecord`

Database file:

- `assist.db`

`assist.db` is a local runtime artifact and is no longer intended to be shared through Git. Each user generates and seeds their own DB during setup.

Live DB stays local by default. Large binary assets should live in external storage roots, not in the DB.

If you want cloud-backed DB protection without running the live SQLite file from a sync folder, set:

- `DB_BACKUP_ROOT`

Then run:

```bash
npm run db:backup
```

This creates timestamped snapshots and is the recommended way to keep SQLite backups in Google Drive Desktop or another synced folder.

## External File Storage

The app can keep browser URLs stable while moving real files outside the repo.

Supported file families:

- `/materials/...`
  - Classroom source materials and converted markdown notes
- `/material-artifacts/...`
  - manually uploaded slides, infographics, audio, mindmaps
- `/gmail-attachments/...`
  - Gmail attachment files downloaded from synced notices

Recommended documentation:

- [artifact storage guide](./docs/artifact-storage.md)
- [database backup guide](./docs/db-backups.md)
- [ops workflow](../ops/README.md)

If you are using Google Drive-backed folders locally, use:

```bash
npm run storage:apply-local
```

This keeps repo URLs stable while the real bytes live in Drive-synced folders.

## Google Integrations

### Classroom

Used for:

- reading course metadata
- downloading source files into the materials root
- indexing local files into the app

### Gmail

Used for:

- pulling notices from `assist.ac.kr`
- downloading Gmail attachments into the attachment storage root

### Calendar

Used for:

- exporting assignments and manual schedule items to Google Calendar
- preventing duplicate exports

## Ops Workflow

The app depends on local helper scripts in `../ops` for Google auth and Classroom file ingestion.

Typical workflow:

### 1. Refresh Google auth

```bash
python3 ops/setup_classroom.py
```

### 2. Inspect course metadata

```bash
python3 ops/get_class_info.py
```

### 3. Download Classroom files

```bash
python3 ops/download_classroom_files.py
```

### 4. Convert extracted PDFs to markdown notes

```bash
python3 ops/convert_to_obsidian.py
```

More details:

- [`../ops/README.md`](../ops/README.md)

## Typical Usage Flow

### Read a paper

1. Open `Materials`
2. Open a PDF or markdown note
3. Read in normal mode, full mode, or focus mode
4. Paste a plain-text summary into `Summary`
5. Optionally run `MD로 폴리싱`
6. Save the summary
7. Upload supporting artifacts such as slides or an infographic

### Review school notices

1. Open `Bulletin`
2. Run Gmail sync if needed
3. Read pinned and unread notices first
4. Archive processed notices
5. Open or download attachments directly from the board

### Manage academic schedule

1. Open `Schedule`
2. Add manual class sessions or academic events
3. Pin important events
4. Review monthly chronology
5. Export to Google Calendar

## Current Workflow Assumptions

- local single-user environment
- one primary machine
- per-user profile seeded into local SQLite during setup
- Google auth handled manually
- artifacts and attachments can live in cloud-backed folders
- `assist.db` remains local for live reads/writes unless a future backup workflow is introduced

## Operational Notes

- If a configured storage root does not exist, file writes fail explicitly.
- If a `public/*` mount does not point to the same real path as the configured root, writes fail explicitly.
- Gmail API must be enabled in the Google Cloud project used by `credentials.json`.
- Existing dev servers should be restarted after changing `next.config.ts`, Prisma schema, or storage mount layout.

## Current Scope and Non-Goals

In scope:

- personal academic control center
- local-first document reading and annotation
- Gmail/Classroom aggregation
- manual artifact curation

Out of scope for now:

- multi-user collaboration
- cloud-native database deployment
- fully automated NotebookLM artifact generation

## Documentation References

- [external storage guide](./docs/artifact-storage.md)
- [ops workflow](../ops/README.md)
- [Prisma schema](./prisma/schema.prisma)
- [environment example](./.env.example)
