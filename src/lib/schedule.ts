import { randomUUID } from "node:crypto";
import prisma from "./prisma";

type RawManualScheduleItem = {
  id: string;
  title: string;
  description: string | null;
  startAt: string | Date;
  endAt: string | Date | null;
  isPinned: number | boolean | null;
  status: string;
  createdAt: string | Date;
  updatedAt: string | Date;
};

export type UnifiedScheduleItem = {
  id: string;
  source: "CLASSROOM" | "MANUAL";
  title: string;
  description: string | null;
  startAt: Date | null;
  endAt: Date | null;
  isPinned: boolean;
  status: string;
};

function normalizeBoolean(value: number | boolean | null | undefined) {
  return value === true || value === 1;
}

function normalizeManualItem(item: RawManualScheduleItem): UnifiedScheduleItem {
  return {
    id: item.id,
    source: "MANUAL",
    title: item.title,
    description: item.description,
    startAt: new Date(item.startAt),
    endAt: item.endAt ? new Date(item.endAt) : null,
    isPinned: normalizeBoolean(item.isPinned),
    status: item.status,
  };
}

export async function fetchManualScheduleItems() {
  const rows = await prisma.$queryRaw<RawManualScheduleItem[]>`
    SELECT
      "id",
      "title",
      "description",
      "startAt",
      "endAt",
      COALESCE("isPinned", 0) AS "isPinned",
      "status",
      "createdAt",
      "updatedAt"
    FROM "ManualScheduleItem"
    ORDER BY COALESCE("isPinned", 0) DESC, "startAt" ASC
  `;

  return rows.map(normalizeManualItem);
}

export async function fetchUnifiedScheduleItems() {
  const [assignments, manualItems] = await Promise.all([
    prisma.assignment.findMany({
      orderBy: { dueDate: "asc" },
    }),
    fetchManualScheduleItems(),
  ]);

  const normalizedAssignments: UnifiedScheduleItem[] = assignments.map((item) => ({
    id: item.id,
    source: "CLASSROOM",
    title: item.title,
    description: null,
    startAt: item.dueDate,
    endAt: null,
    isPinned: false,
    status: item.status,
  }));

  return [...normalizedAssignments, ...manualItems].sort((a, b) => {
    if (a.isPinned !== b.isPinned) {
      return a.isPinned ? -1 : 1;
    }

    if (!a.startAt && !b.startAt) return 0;
    if (!a.startAt) return 1;
    if (!b.startAt) return -1;
    return a.startAt.getTime() - b.startAt.getTime();
  });
}

export async function createManualScheduleItem(input: {
  title: string;
  description?: string;
  startAt: Date;
  endAt?: Date | null;
  status: string;
}) {
  const id = randomUUID();

  await prisma.$executeRaw`
    INSERT INTO "ManualScheduleItem" (
      "id",
      "title",
      "description",
      "startAt",
      "endAt",
      "isPinned",
      "status",
      "createdAt",
      "updatedAt"
    ) VALUES (
      ${id},
      ${input.title},
      ${input.description?.trim() ? input.description.trim() : null},
      ${input.startAt},
      ${input.endAt ?? null},
      ${0},
      ${input.status},
      ${new Date()},
      ${new Date()}
    )
  `;

  return id;
}

export async function updateManualScheduleItem(input: {
  id: string;
  title: string;
  description?: string;
  startAt: Date;
  endAt?: Date | null;
  status: string;
}) {
  await prisma.$executeRaw`
    UPDATE "ManualScheduleItem"
    SET
      "title" = ${input.title},
      "description" = ${input.description?.trim() ? input.description.trim() : null},
      "startAt" = ${input.startAt},
      "endAt" = ${input.endAt ?? null},
      "status" = ${input.status},
      "updatedAt" = ${new Date()}
    WHERE "id" = ${input.id}
  `;
}

export async function deleteManualScheduleItem(id: string) {
  await prisma.$executeRaw`
    DELETE FROM "ManualScheduleItem"
    WHERE "id" = ${id}
  `;
}

export async function setManualSchedulePinned(id: string, isPinned: boolean) {
  await prisma.$executeRaw`
    UPDATE "ManualScheduleItem"
    SET
      "isPinned" = ${isPinned ? 1 : 0},
      "updatedAt" = ${new Date()}
    WHERE "id" = ${id}
  `;
}
