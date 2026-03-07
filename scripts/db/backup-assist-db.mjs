#!/usr/bin/env node

import Database from "better-sqlite3";
import { mkdir, readdir, rm, stat } from "node:fs/promises";
import path from "node:path";

const DEFAULT_DATABASE_URL = process.env.DATABASE_URL || "file:./assist.db";
const DEFAULT_BACKUP_ROOT = process.env.DB_BACKUP_ROOT || "";
const DEFAULT_KEEP_COUNT = Number.parseInt(process.env.DB_BACKUP_KEEP_COUNT || "30", 10);
const BACKUP_PREFIX = "assist";

function parseArgs(argv) {
  const args = {
    databaseUrl: DEFAULT_DATABASE_URL,
    backupRoot: DEFAULT_BACKUP_ROOT,
    keepCount: Number.isFinite(DEFAULT_KEEP_COUNT) ? DEFAULT_KEEP_COUNT : 30,
    json: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];

    if (current === "--help" || current === "-h") {
      printHelp();
      process.exit(0);
    }

    if (current === "--json") {
      args.json = true;
      continue;
    }

    if (current === "--database-url") {
      args.databaseUrl = argv[index + 1] || "";
      index += 1;
      continue;
    }

    if (current === "--root") {
      args.backupRoot = argv[index + 1] || "";
      index += 1;
      continue;
    }

    if (current === "--keep-count") {
      args.keepCount = Number.parseInt(argv[index + 1] || "", 10);
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${current}`);
  }

  return args;
}

function printHelp() {
  console.log(`assist-hub SQLite backup

Usage:
  npm run db:backup
  node ./scripts/db/backup-assist-db.mjs --root /path/to/backups

Options:
  --database-url <sqlite file url>   Override DATABASE_URL
  --root <directory>                 Override DB_BACKUP_ROOT
  --keep-count <number>              Keep only the newest N backups (default: 30)
  --json                             Print machine-readable output
  --help                             Show this help
`);
}

function resolveSqlitePath(databaseUrl) {
  if (!databaseUrl.startsWith("file:")) {
    throw new Error(`Unsupported DATABASE_URL: ${databaseUrl}. Use a SQLite file URL such as file:./assist.db`);
  }

  const rawPath = databaseUrl.slice("file:".length);

  if (rawPath.startsWith("./")) {
    return path.resolve(process.cwd(), rawPath.slice(2));
  }

  if (rawPath.startsWith("/")) {
    return rawPath;
  }

  throw new Error(`Unsupported DATABASE_URL path: ${databaseUrl}. Use file:./name.db or file:/absolute/path.db`);
}

function resolveRoot(root) {
  if (!root?.trim()) {
    throw new Error("DB_BACKUP_ROOT is not configured. Set it in .env or pass --root.");
  }

  if (path.isAbsolute(root)) {
    return root;
  }

  return path.resolve(process.cwd(), root);
}

function formatTimestamp(date) {
  const parts = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(date);

  const value = (type) => parts.find((part) => part.type === type)?.value || "";
  return `${value("year")}${value("month")}${value("day")}-${value("hour")}${value("minute")}${value("second")}`;
}

async function pruneOldBackups(backupRoot, keepCount) {
  if (!Number.isFinite(keepCount) || keepCount < 1) {
    return [];
  }

  const entries = await readdir(backupRoot, { withFileTypes: true });
  const backupFiles = await Promise.all(
    entries
      .filter((entry) => entry.isFile() && entry.name.startsWith(`${BACKUP_PREFIX}-`) && entry.name.endsWith(".db"))
      .map(async (entry) => {
        const targetPath = path.join(backupRoot, entry.name);
        const fileStat = await stat(targetPath);
        return {
          name: entry.name,
          targetPath,
          modifiedAt: fileStat.mtimeMs,
        };
      }),
  );

  backupFiles.sort((left, right) => right.modifiedAt - left.modifiedAt);
  const stale = backupFiles.slice(keepCount);
  await Promise.all(stale.map((file) => rm(file.targetPath, { force: true })));
  return stale.map((file) => file.targetPath);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const databasePath = resolveSqlitePath(options.databaseUrl);
  const backupRoot = resolveRoot(options.backupRoot);

  await mkdir(backupRoot, { recursive: true });

  const timestamp = formatTimestamp(new Date());
  const backupFilename = `${BACKUP_PREFIX}-${timestamp}.db`;
  const backupPath = path.join(backupRoot, backupFilename);

  const database = new Database(databasePath, { readonly: true, fileMustExist: true });

  try {
    await database.backup(backupPath);
  } finally {
    database.close();
  }

  const backupStat = await stat(backupPath);
  const prunedPaths = await pruneOldBackups(backupRoot, options.keepCount);

  const result = {
    databasePath,
    backupRoot,
    backupPath,
    backupSizeBytes: backupStat.size,
    prunedPaths,
    keepCount: options.keepCount,
  };

  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log(`Backup created: ${backupPath}`);
  console.log(`Size: ${backupStat.size} bytes`);
  if (prunedPaths.length > 0) {
    console.log(`Pruned ${prunedPaths.length} older backup(s).`);
  }
}

main().catch((error) => {
  console.error(`[db:backup] ${error.message}`);
  process.exit(1);
});
