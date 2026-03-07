# Database Backups

Keep the live `assist.db` on your local SSD.

Do not run the live SQLite file directly from Google Drive Desktop or another sync client. SQLite is sensitive to concurrent file syncing, and the failure mode is worse than losing an attachment file.

Instead:

- keep `DATABASE_URL="file:./assist.db"`
- configure `DB_BACKUP_ROOT` to a synced or external folder
- run `npm run db:backup` to create timestamped snapshots

## Environment

Add this to `.env`:

```bash
DATABASE_URL="file:./assist.db"
DB_BACKUP_ROOT="$HOME/Library/CloudStorage/GoogleDrive-your-account/My Drive/01_Project/dev_blob/assist_hub_db_backups"
```

`DB_BACKUP_ROOT` can also point at any other local folder outside the repo:

```bash
DB_BACKUP_ROOT="$HOME/dev_blob/assist_hub_db_backups"
```

## Create a backup

```bash
npm run db:backup
```

What it does:

- opens the live SQLite DB in read-only mode
- uses the SQLite backup API through `better-sqlite3`
- writes a timestamped `.db` snapshot into `DB_BACKUP_ROOT`
- prunes older snapshots beyond the default keep count

Default naming:

- `assist-YYYYMMDD-HHmmss.db`

Default retention:

- newest 30 backups

Override retention for one run:

```bash
npm run db:backup -- --keep-count 60
```

Or through env:

```bash
DB_BACKUP_KEEP_COUNT=60 npm run db:backup
```

## Restore procedure

Do this only while the app is stopped.

1. Stop `npm run dev` and any other process using `assist.db`.
2. Choose the snapshot you want to restore from `DB_BACKUP_ROOT`.
3. Replace the live DB:

```bash
cp "/path/to/assist-20260307-113000.db" "./assist.db"
```

4. Start the app again:

```bash
npm run dev
```

If you want to inspect the backup first, copy it to a temporary path instead of overwriting `assist.db` immediately.

## Automation

This project intentionally keeps automation simple:

- the backup command is safe to run repeatedly
- the output filename is timestamped
- the live DB path is never moved into the sync folder

For single-machine use, the practical automation model is:

- `launchd` on macOS
- `cron` on Linux

Schedule `npm run db:backup` at the interval you want. The command is idempotent in the sense that it creates a fresh snapshot and prunes only older backup files under the same root.
