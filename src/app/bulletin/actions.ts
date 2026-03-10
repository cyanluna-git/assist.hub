"use server";

import { revalidatePath } from "next/cache";
import {
  createManualBulletin,
  setBulletinArchived,
  setBulletinPinned,
  setBulletinRead,
  syncAssistGmailBulletins,
} from "@/lib/bulletin";
import { syncExternalRssFeeds } from "@/lib/rss-feeds";

export async function addManualBulletinAction(formData: FormData) {
  const title = String(formData.get("title") || "").trim();
  const content = String(formData.get("content") || "").trim();

  if (!title || !content) {
    return;
  }

  await createManualBulletin(title, content);
  revalidatePath("/bulletin");
}

export async function syncGmailBulletinsAction() {
  await syncAssistGmailBulletins();
  revalidatePath("/");
  revalidatePath("/bulletin");
}

export async function syncExternalFeedsAction() {
  await syncExternalRssFeeds();
  revalidatePath("/");
  revalidatePath("/bulletin");
}

export async function toggleBulletinPinAction(formData: FormData) {
  const id = String(formData.get("id") || "").trim();
  const nextPinned = String(formData.get("nextPinned") || "") === "true";

  if (!id) {
    return;
  }

  await setBulletinPinned(id, nextPinned);
  revalidatePath("/bulletin");
}

export async function toggleBulletinArchiveAction(formData: FormData) {
  const id = String(formData.get("id") || "").trim();
  const nextArchived = String(formData.get("nextArchived") || "") === "true";

  if (!id) {
    return;
  }

  await setBulletinArchived(id, nextArchived);
  revalidatePath("/bulletin");
}

export async function toggleBulletinReadAction(formData: FormData) {
  const id = String(formData.get("id") || "").trim();
  const nextRead = String(formData.get("nextRead") || "") === "true";

  if (!id) {
    return;
  }

  await setBulletinRead(id, nextRead);
  revalidatePath("/bulletin");
}
