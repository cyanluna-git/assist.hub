"use server";

import { exportAssignmentsToCalendar } from "@/lib/calendar";
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
