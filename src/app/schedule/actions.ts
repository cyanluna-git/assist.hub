"use server";

import { exportAssignmentsToCalendar } from "@/lib/calendar";
import {
  createManualScheduleItem,
  deleteManualScheduleItem,
  setManualSchedulePinned,
  updateUnifiedScheduleStatus,
  updateManualScheduleItem,
} from "@/lib/schedule";
import { revalidatePath } from "next/cache";

export async function handleExport() {
  try {
    await exportAssignmentsToCalendar();
    revalidatePath("/schedule");
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Schedule export failed:", message);
  }
}

export async function addManualScheduleAction(formData: FormData) {
  const title = String(formData.get("title") || "").trim();
  const description = String(formData.get("description") || "").trim();
  const startAtValue = String(formData.get("startAt") || "").trim();
  const endAtValue = String(formData.get("endAt") || "").trim();
  const status = String(formData.get("status") || "TODO").trim().toUpperCase();

  if (!title || !startAtValue) {
    return;
  }

  const startAt = new Date(startAtValue);
  const endAt = endAtValue ? new Date(endAtValue) : null;

  if (Number.isNaN(startAt.getTime()) || (endAt && Number.isNaN(endAt.getTime()))) {
    return;
  }

  if (endAt && endAt.getTime() < startAt.getTime()) {
    return;
  }

  await createManualScheduleItem({
    title,
    description,
    startAt,
    endAt,
    status: ["TODO", "IN_PROGRESS", "DONE"].includes(status) ? status : "TODO",
  });

  revalidatePath("/schedule");
}

export async function updateManualScheduleAction(formData: FormData) {
  const id = String(formData.get("id") || "").trim();
  const title = String(formData.get("title") || "").trim();
  const description = String(formData.get("description") || "").trim();
  const startAtValue = String(formData.get("startAt") || "").trim();
  const endAtValue = String(formData.get("endAt") || "").trim();
  const status = String(formData.get("status") || "TODO").trim().toUpperCase();

  if (!id || !title || !startAtValue) {
    return;
  }

  const startAt = new Date(startAtValue);
  const endAt = endAtValue ? new Date(endAtValue) : null;

  if (Number.isNaN(startAt.getTime()) || (endAt && Number.isNaN(endAt.getTime()))) {
    return;
  }

  if (endAt && endAt.getTime() < startAt.getTime()) {
    return;
  }

  await updateManualScheduleItem({
    id,
    title,
    description,
    startAt,
    endAt,
    status: ["TODO", "IN_PROGRESS", "DONE"].includes(status) ? status : "TODO",
  });

  revalidatePath("/schedule");
}

export async function deleteManualScheduleAction(formData: FormData) {
  const id = String(formData.get("id") || "").trim();

  if (!id) {
    return;
  }

  await deleteManualScheduleItem(id);
  revalidatePath("/schedule");
}

export async function toggleManualSchedulePinnedAction(formData: FormData) {
  const id = String(formData.get("id") || "").trim();
  const nextPinned = String(formData.get("nextPinned") || "") === "true";

  if (!id) {
    return;
  }

  await setManualSchedulePinned(id, nextPinned);
  revalidatePath("/schedule");
}

export async function updateScheduleStatusAction(formData: FormData) {
  const id = String(formData.get("id") || "").trim();
  const source = String(formData.get("source") || "").trim().toUpperCase();
  const status = String(formData.get("status") || "TODO").trim().toUpperCase();

  if (!id || !["CLASSROOM", "MANUAL"].includes(source)) {
    return;
  }

  await updateUnifiedScheduleStatus({
    id,
    source: source as "CLASSROOM" | "MANUAL",
    status,
  });

  revalidatePath("/schedule");
}
