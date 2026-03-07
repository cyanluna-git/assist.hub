import prisma from "./prisma";
import { buildGoogleOAuthClient } from "./google-auth";
import { saveGmailAttachmentFile } from "./gmail-attachment-storage";
import { runTrackedSync } from "./sync-state";
import { google } from "googleapis";

type GmailPayloadNode = {
  mimeType?: string | null;
  filename?: string | null;
  body?: { data?: string | null; attachmentId?: string | null } | null;
  parts?: GmailPayloadNode[] | null;
};

type GmailAttachmentPart = {
  key: string;
  filename: string;
  mimeType: string | null;
  attachmentId: string | null;
  inlineData: string | null;
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

function decodeBase64UrlToBuffer(input?: string | null) {
  if (!input) return Buffer.alloc(0);
  return Buffer.from(input.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

function decodeBase64Url(input?: string | null) {
  return decodeBase64UrlToBuffer(input).toString("utf-8");
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

function collectAttachmentParts(
  payload?: GmailPayloadNode | null,
  trail: number[] = [],
  acc: GmailAttachmentPart[] = [],
) {
  if (!payload) {
    return acc;
  }

  if (payload.filename?.trim() && (payload.body?.attachmentId || payload.body?.data)) {
    acc.push({
      key: trail.length ? trail.join("-") : "root",
      filename: payload.filename.trim(),
      mimeType: payload.mimeType ?? null,
      attachmentId: payload.body?.attachmentId ?? null,
      inlineData: payload.body?.data ?? null,
    });
  }

  (payload.parts || []).forEach((part, index) => {
    collectAttachmentParts(part, [...trail, index], acc);
  });

  return acc;
}

function getHeaderValue(
  headers: Array<{ name?: string | null; value?: string | null }> | undefined,
  targetName: string,
) {
  return headers?.find((header) => header.name?.toLowerCase() === targetName.toLowerCase())?.value ?? "";
}

async function syncAttachmentsForBulletin(input: {
  bulletinId: string;
  messageId: string;
  payload?: GmailPayloadNode | null;
  gmail: ReturnType<typeof google.gmail>;
}) {
  const attachments = collectAttachmentParts(input.payload);
  let syncedAttachmentCount = 0;

  for (const attachment of attachments) {
    const gmailAttachmentId = attachment.attachmentId ?? `inline-${attachment.key}`;
    const attachmentData = attachment.attachmentId
      ? await input.gmail.users.messages.attachments.get({
          userId: "me",
          messageId: input.messageId,
          id: attachment.attachmentId,
        })
      : null;
    const rawData = attachmentData?.data.data ?? attachment.inlineData;
    const buffer = decodeBase64UrlToBuffer(rawData);

    if (!buffer.length) {
      continue;
    }

    const saved = await saveGmailAttachmentFile({
      messageId: input.messageId,
      attachmentId: gmailAttachmentId,
      originalName: attachment.filename,
      buffer,
    });

    await prisma.bulletinAttachment.upsert({
      where: {
        bulletinId_gmailAttachmentId: {
          bulletinId: input.bulletinId,
          gmailAttachmentId,
        },
      },
      update: {
        filename: attachment.filename,
        mimeType: attachment.mimeType,
        localPath: saved.absolutePath,
        publicUrl: saved.publicPath,
      },
      create: {
        bulletinId: input.bulletinId,
        gmailAttachmentId,
        filename: attachment.filename,
        mimeType: attachment.mimeType,
        localPath: saved.absolutePath,
        publicUrl: saved.publicPath,
      },
    });

    syncedAttachmentCount += 1;
  }

  await prisma.bulletinItem.update({
    where: { id: input.bulletinId },
    data: {
      attachmentsSyncedAt: new Date(),
    },
  });

  return syncedAttachmentCount;
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
  return runTrackedSync("GMAIL", async () => {
    const auth = buildGoogleOAuthClient();
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
    const processedMessageIds = new Set<string>();

    for (const message of messages) {
      if (!message.id) continue;

      const detail = await gmail.users.messages.get({
        userId: "me",
        id: message.id,
        format: "full",
      });

      const payload = detail.data.payload as GmailPayloadNode | undefined;
      const headers = payload?.parts ? detail.data.payload?.headers : detail.data.payload?.headers;
      const subject = getHeaderValue(headers, "Subject") || "제목 없음";
      const from = getHeaderValue(headers, "From") || "assist.ac.kr";
      const dateHeader = getHeaderValue(headers, "Date");
      const content = extractPlainText(payload).trim() || detail.data.snippet || "";
      const receivedAt = dateHeader ? new Date(dateHeader) : new Date();

      const bulletin = await prisma.bulletinItem.upsert({
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

      await syncAttachmentsForBulletin({
        bulletinId: bulletin.id,
        messageId: message.id,
        payload,
        gmail,
      });

      processedMessageIds.add(message.id);
      syncedCount += 1;
    }

    const missingAttachmentSync = await prisma.bulletinItem.findMany({
      where: {
        sourceType: "GMAIL",
        externalId: {
          not: null,
        },
        attachmentsSyncedAt: null,
      },
      select: {
        id: true,
        externalId: true,
      },
    });

    for (const bulletin of missingAttachmentSync) {
      if (!bulletin.externalId || processedMessageIds.has(bulletin.externalId)) {
        continue;
      }

      const detail = await gmail.users.messages.get({
        userId: "me",
        id: bulletin.externalId,
        format: "full",
      });

      await syncAttachmentsForBulletin({
        bulletinId: bulletin.id,
        messageId: bulletin.externalId,
        payload: detail.data.payload as GmailPayloadNode | undefined,
        gmail,
      });
    }

    return {
      count: syncedCount,
      message:
        syncedCount > 0 ? `신규/갱신 Gmail 공지 ${syncedCount}건을 반영했습니다.` : "새로 반영할 Gmail 공지가 없습니다.",
    };
  });
}

export async function fetchBulletins() {
  const [rows, attachments] = await Promise.all([
    prisma.$queryRaw<RawBulletinItem[]>`
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
    `,
    prisma.bulletinAttachment.findMany({
      orderBy: [{ createdAt: "asc" }],
    }),
  ]);

  const attachmentMap = new Map<string, typeof attachments>();
  for (const attachment of attachments) {
    const current = attachmentMap.get(attachment.bulletinId) ?? [];
    current.push(attachment);
    attachmentMap.set(attachment.bulletinId, current);
  }

  return rows.map((row) => ({
    ...row,
    attachments: (attachmentMap.get(row.id) ?? []).map((attachment) => ({
      id: attachment.id,
      filename: attachment.filename,
      mimeType: attachment.mimeType,
      publicUrl: attachment.publicUrl,
    })),
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
