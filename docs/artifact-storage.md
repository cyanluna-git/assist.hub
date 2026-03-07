## External Storage Layout

The app can keep browser URLs stable while moving the real files out of the repo into a cloud-backed folder.

### Supported storage roots

- `MATERIALS_STORAGE_ROOT`
  - public URL: `/materials/...`
  - purpose: Google Classroom source files
- `ARTIFACT_STORAGE_ROOT`
  - public URL: `/material-artifacts/...`
  - purpose: manually uploaded summaries, slides, infographics, audio, mindmaps
- `GMAIL_ATTACHMENT_STORAGE_ROOT`
  - public URL: `/gmail-attachments/...`
  - purpose: attachments downloaded from synced `assist.ac.kr` Gmail notices

### Recommended localhost setup

Use one cloud-synced parent folder and keep each file family in its own child directory.

Example:

```bash
mkdir -p "$HOME/Library/CloudStorage/GoogleDrive-your-account/My Drive/01_Project/dev_blob/assist_hub_classroom_materials"
mkdir -p "$HOME/Library/CloudStorage/GoogleDrive-your-account/My Drive/01_Project/dev_blob/assist_hub_artifacts"
mkdir -p "$HOME/Library/CloudStorage/GoogleDrive-your-account/My Drive/01_Project/dev_blob/assist_hub_gmail_attachments"
```

Set the roots in `.env`:

```bash
MATERIALS_STORAGE_ROOT="$HOME/Library/CloudStorage/GoogleDrive-your-account/My Drive/01_Project/dev_blob/assist_hub_classroom_materials"
ARTIFACT_STORAGE_ROOT="$HOME/Library/CloudStorage/GoogleDrive-your-account/My Drive/01_Project/dev_blob/assist_hub_artifacts"
GMAIL_ATTACHMENT_STORAGE_ROOT="$HOME/Library/CloudStorage/GoogleDrive-your-account/My Drive/01_Project/dev_blob/assist_hub_gmail_attachments"
```

Replace the public mounts with symlinks to the same real locations:

```bash
cd /Users/cyanluna-pro16/dev/assist.ai.mba/assist-hub
rm -rf public/materials public/material-artifacts public/gmail-attachments
ln -s "$MATERIALS_STORAGE_ROOT" public/materials
ln -s "$ARTIFACT_STORAGE_ROOT" public/material-artifacts
ln -s "$GMAIL_ATTACHMENT_STORAGE_ROOT" public/gmail-attachments
```

Restart the dev server:

```bash
npm run dev
```

Or use the helper script once `.env` is filled:

```bash
npm run storage:apply-local
```

### Why this shape

- The app still serves stable URLs from `public/*`.
- Google Drive owns the real bytes and sync lifecycle.
- Classroom source files, generated artifacts, and Gmail attachments keep separate retention boundaries.
- The app validates that each configured storage root and matching `public/*` mount resolve to the same real path.

### Migration

If files already exist inside the repo, copy them first and then replace the mount:

```bash
cd /Users/cyanluna-pro16/dev/assist.ai.mba/assist-hub
rsync -av public/materials/ "$MATERIALS_STORAGE_ROOT"/
rsync -av public/material-artifacts/ "$ARTIFACT_STORAGE_ROOT"/
rm -rf public/materials public/material-artifacts
ln -s "$MATERIALS_STORAGE_ROOT" public/materials
ln -s "$ARTIFACT_STORAGE_ROOT" public/material-artifacts
mkdir -p "$GMAIL_ATTACHMENT_STORAGE_ROOT"
ln -s "$GMAIL_ATTACHMENT_STORAGE_ROOT" public/gmail-attachments
```

`/gmail-attachments/...` only starts filling after the next Gmail sync pulls attachment-bearing emails.

### Repo cleanliness workflow

When local symlink mounts are active, use the helper scripts instead of manually moving paths around:

- `npm run storage:apply-local`
  - creates the three symlink mounts
  - updates `.git/info/exclude` for local-only mount paths
  - marks tracked `public/materials` files as `skip-worktree`
- `npm run storage:status`
  - prints env roots, symlink targets, and local exclude block
- `npm run storage:clear-local`
  - removes local mount handling
  - restores tracked `public/materials` from `HEAD`
  - recreates local directories for the untracked mount points

This keeps normal feature commits focused on code instead of local storage mount churn.

### Operational notes

- If a storage root env var is set but the target folder does not exist, file writes fail with an explicit error.
- If a `public/*` mount does not point to the same real path as the configured root, file writes fail with an explicit error.
- If Google Drive sync is delayed, the file may exist locally before it is visible on another machine.
- Classroom auth/download/markdown conversion scripts are documented in [`ops/README.md`](/Users/cyanluna-pro16/dev/assist.ai.mba/ops/README.md).
