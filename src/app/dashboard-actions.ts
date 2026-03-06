"use server";

import { revalidatePath } from "next/cache";
import { syncMaterials } from "@/lib/sync";

export async function syncClassroomDataAction() {
  await syncMaterials();
  revalidatePath("/");
  revalidatePath("/materials");
  revalidatePath("/schedule");
}
