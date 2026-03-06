import fs from "node:fs";
import path from "node:path";
import prisma from "./prisma";
import { google } from "googleapis";

const TOKEN_PATH = path.join(process.cwd(), "..", "ops", "token.json");
const CREDENTIALS_PATH = path.join(process.cwd(), "..", "ops", "credentials.json");

type GmailPayloadNode = {
  mimeType?: string | null;
  body?: { data?: string | null } | null;
  parts?: GmailPayloadNode[] | null;
};

type RawBulletinItem = {
  id: string;
  sourceType: string;
  externalId: string | null;
  title: string;
  content: string;
  sender: string | null;
  isRead: number | boolean | null;
  isPinned: number | boolean | null;
  isArchived: number | boolean | null;
  receivedAt: string | Date;
  createdAt: string | Date;
  updatedAt: string | Date;
};

type LatestGmailSyncRow = {
  receivedAt: string | Date | null;
};

function normalizeBoolean(value: number | boolean | null | undefined) {
  return value === true || value === 1;
}

function decodeBase64Url(input?: string | null) {
  if (!input) return "";
  return Buffer.from(input.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf-8");
}

function extractPlainText(payload?: GmailPayloadNode | null): string {
  if (!payload) return "";

  if (payload.mimeType === "text/plain" && payload.body?.data) {
    return decodeBase64Url(payload.body.data);
  }

  for (const part of payload.parts || []) {
    const text = extractPlainText(part);
    if (text.trim()) {
      return text;
    }
  }

  return decodeBase64Url(payload.body?.data);
}

function getHeaderValue(
  headers: Array<{ name?: string | null; value?: string | null }> | undefined,
  targetName: string,
) {
  return headers?.find((header) => header.name?.toLowerCase() === targetName.toLowerCase())?.value ?? "";
}

function buildOAuthClient() {
  if (!fs.existsSync(TOKEN_PATH)) {
    throw new Error("ops/token.json이 없습니다. Gmail 연동을 위해 인증을 먼저 갱신하세요.");
  }

  const token = JSON.parse(fs.readFileSync(TOKEN_PATH, "utf-8"));
  const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, "utf-8"));
  const { client_secret, client_id, redirect_uris } = credentials.installed;
  const client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);
  client.setCredentials(token);
  return client;
}

export async function createManualBulletin(title: string, content: string) {
  return prisma.bulletinItem.create({
    data: {
      sourceType: "SMS",
      title,
      content,
      sender: "Manual SMS",
      isRead: false,
      receivedAt: new Date(),
    },
  });
}

export async function syncAssistGmailBulletins() {
  const auth = buildOAuthClient();
  const gmail = google.gmail({ version: "v1", auth });

  const latestSyncedRows = await prisma.$queryRaw<LatestGmailSyncRow[]>`
    SELECT MAX("receivedAt") AS "receivedAt"
    FROM "BulletinItem"
    WHERE "sourceType" = 'GMAIL'
  `;

  const latestSyncedAt = latestSyncedRows[0]?.receivedAt ? new Date(latestSyncedRows[0].receivedAt) : null;
  const overlapSeconds = 120;
  const afterEpochSeconds = latestSyncedAt
    ? Math.max(0, Math.floor(latestSyncedAt.getTime() / 1000) - overlapSeconds)
    : null;
  const query = afterEpochSeconds
    ? `from:assist.ac.kr after:${afterEpochSeconds}`
    : "from:assist.ac.kr";

  const messages: Array<{ id?: string | null }> = [];
  let nextPageToken: string | undefined;

  do {
    const listResponse = await gmail.users.messages.list({
      userId: "me",
      q: query,
      maxResults: 100,
      pageToken: nextPageToken,
    });

    messages.push(...(listResponse.data.messages || []));
    nextPageToken = listResponse.data.nextPageToken || undefined;
  } while (nextPageToken);

  let syncedCount = 0;

  for (const message of messages) {
    if (!message.id) continue;

    const detail = await gmail.users.messages.get({
      userId: "me",
      id: message.id,
      format: "full",
    });

    const payload = detail.data.payload;
    const headers = payload?.headers;
    const subject = getHeaderValue(headers, "Subject") || "제목 없음";
    const from = getHeaderValue(headers, "From") || "assist.ac.kr";
    const dateHeader = getHeaderValue(headers, "Date");
    const content = extractPlainText(payload).trim() || detail.data.snippet || "";
    const receivedAt = dateHeader ? new Date(dateHeader) : new Date();

    await prisma.bulletinItem.upsert({
      where: { externalId: message.id },
      update: {
        title: subject,
        content,
        sender: from,
        receivedAt,
      },
      create: {
        sourceType: "GMAIL",
        externalId: message.id,
        title: subject,
        content,
        sender: from,
        isRead: false,
        receivedAt,
      },
    });

    syncedCount += 1;
  }

  return syncedCount;
}

export async function fetchBulletins() {
  const rows = await prisma.$queryRaw<RawBulletinItem[]>`
    SELECT
      "id",
      "sourceType",
      "externalId",
      "title",
      "content",
      "sender",
      COALESCE("isRead", 0) AS "isRead",
      COALESCE("isPinned", 0) AS "isPinned",
      COALESCE("isArchived", 0) AS "isArchived",
      "receivedAt",
      "createdAt",
      "updatedAt"
    FROM "BulletinItem"
    ORDER BY COALESCE("isPinned", 0) DESC, "receivedAt" DESC
  `;

  return rows.map((row) => ({
    ...row,
    isRead: normalizeBoolean(row.isRead),
    isPinned: normalizeBoolean(row.isPinned),
    isArchived: normalizeBoolean(row.isArchived),
    receivedAt: new Date(row.receivedAt),
    createdAt: new Date(row.createdAt),
    updatedAt: new Date(row.updatedAt),
  }));
}

export async function setBulletinPinned(id: string, isPinned: boolean) {
  await prisma.$executeRaw`
    UPDATE "BulletinItem"
    SET "isPinned" = ${isPinned ? 1 : 0}
    WHERE "id" = ${id}
  `;
}

export async function setBulletinRead(id: string, isRead: boolean) {
  await prisma.$executeRaw`
    UPDATE "BulletinItem"
    SET "isRead" = ${isRead ? 1 : 0}
    WHERE "id" = ${id}
  `;
}

export async function setBulletinArchived(id: string, isArchived: boolean) {
  await prisma.$executeRaw`
    UPDATE "BulletinItem"
    SET
      "isArchived" = ${isArchived ? 1 : 0},
      "isPinned" = CASE WHEN ${isArchived ? 1 : 0} = 1 THEN 0 ELSE "isPinned" END
    WHERE "id" = ${id}
  `;
}
