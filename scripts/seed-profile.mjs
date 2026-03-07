import process from "node:process";
import { PrismaClient } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

const WORKSPACE_PROFILE_ID = "local";

function usage() {
  console.log(`Usage:
  node scripts/seed-profile.mjs --display-name "홍길동" --student-id "20260001" [--avatar-label "H"] [--database-url "file:./assist.db"]`);
}

function readArg(name) {
  const flag = `--${name}`;
  const index = process.argv.indexOf(flag);
  if (index === -1) {
    return "";
  }

  return process.argv[index + 1] ?? "";
}

function deriveAvatarLabel(displayName) {
  const normalized = displayName.trim();
  return normalized ? normalized.slice(0, 1).toUpperCase() : "U";
}

const displayName = readArg("display-name").trim();
const studentId = readArg("student-id").trim();
const avatarLabel = (readArg("avatar-label").trim() || deriveAvatarLabel(displayName)).slice(0, 4);
const databaseUrl = readArg("database-url").trim() || process.env.DATABASE_URL || "file:./assist.db";

if (!displayName || !studentId) {
  usage();
  process.exit(1);
}

const adapter = new PrismaBetterSqlite3({ url: databaseUrl });
const prisma = new PrismaClient({ adapter });

try {
  await prisma.workspaceProfile.upsert({
    where: { id: WORKSPACE_PROFILE_ID },
    update: {
      displayName,
      studentId,
      avatarLabel,
    },
    create: {
      id: WORKSPACE_PROFILE_ID,
      displayName,
      studentId,
      avatarLabel,
    },
  });

  console.log(`Seeded workspace profile for ${displayName} (${studentId})`);
} finally {
  await prisma.$disconnect();
}
