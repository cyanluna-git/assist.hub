## Artifact Storage

The app keeps artifact browser URLs under `/material-artifacts/...`, but the backing files can live outside the project directory.

### Recommended Localhost Setup

Use a Google Drive-synced folder as the real storage root, then link `public/material-artifacts` to that folder.

1. Create a backing folder in Google Drive.

```bash
mkdir -p "$HOME/Library/CloudStorage/GoogleDrive-your-account/My Drive/assist-hub-artifacts"
```

2. Point the app at that folder in `.env`.

```bash
ARTIFACT_STORAGE_ROOT="$HOME/Library/CloudStorage/GoogleDrive-your-account/My Drive/assist-hub-artifacts"
```

3. Replace the project-local public mount with a symlink to the same folder.

```bash
cd /Users/cyanluna-pro16/dev/assist.ai.mba/assist-hub
rm -rf public/material-artifacts
ln -s "$ARTIFACT_STORAGE_ROOT" public/material-artifacts
```

4. Restart the dev server.

```bash
npm run dev
```

### Why this shape

- The app still serves files from `/material-artifacts/...`.
- Google Drive owns the real bytes and sync lifecycle.
- The app can validate that `ARTIFACT_STORAGE_ROOT` and `public/material-artifacts` resolve to the same location.

### Migration from current local storage

If you already have artifacts inside the repo:

```bash
cd /Users/cyanluna-pro16/dev/assist.ai.mba/assist-hub
rsync -av public/material-artifacts/ "$ARTIFACT_STORAGE_ROOT"/
rm -rf public/material-artifacts
ln -s "$ARTIFACT_STORAGE_ROOT" public/material-artifacts
```

The DB keeps working because artifact rows already store a stable public URL like `/material-artifacts/...`.

### Operational Notes

- If `ARTIFACT_STORAGE_ROOT` is set but the folder does not exist, uploads fail with an explicit error.
- If `public/material-artifacts` does not point to the same real path, uploads fail with an explicit error.
- If Google Drive sync is delayed, the file may exist locally before it is visible on another machine.
