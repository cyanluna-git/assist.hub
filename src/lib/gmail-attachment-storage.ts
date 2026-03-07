import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { resolvePublicBackedStorage } from "./public-storage";

function sanitizeSegment(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[^\w.-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
}

function truncateSegment(value: string, maxLength: number) {
  return value.length > maxLength ? value.slice(0, maxLength) : value;
}

function getAttachmentExtension(filename: string) {
  const extension = path.extname(filename).trim().toLowerCase();
  return extension || ".bin";
}

function buildAttachmentFileName(messageId: string, attachmentId: string, originalName: string) {
  const extension = getAttachmentExtension(originalName);
  const messageSlug = truncateSegment(sanitizeSegment(messageId || "message"), 24);
  const attachmentSlug = truncateSegment(sanitizeSegment(attachmentId || "attachment"), 36);
  const nameSlug = truncateSegment(sanitizeSegment(path.basename(originalName, extension) || "file"), 48);
  return `${messageSlug}-${attachmentSlug}-${nameSlug}${extension}`;
}

export function buildGmailAttachmentPublicPath(messageId: string, attachmentId: string, originalName: string) {
  const fileName = buildAttachmentFileName(messageId, attachmentId, originalName);
  const messageSlug = truncateSegment(sanitizeSegment(messageId || "message"), 24);
  return `/gmail-attachments/${messageSlug}/${fileName}`;
}

export async function saveGmailAttachmentFile(input: {
  messageId: string;
  attachmentId: string;
  originalName: string;
  buffer: Buffer;
}) {
  const storage = await resolvePublicBackedStorage({
    envVar: "GMAIL_ATTACHMENT_STORAGE_ROOT",
    publicSegment: "gmail-attachments",
    label: "Gmail 첨부 파일",
  });
  const publicPath = buildGmailAttachmentPublicPath(input.messageId, input.attachmentId, input.originalName);
  const absolutePath = path.join(storage.backingRoot, publicPath.replace("/gmail-attachments/", ""));

  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, input.buffer);

  return {
    absolutePath,
    publicPath,
  };
}
