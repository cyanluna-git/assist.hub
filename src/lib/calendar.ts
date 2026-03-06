import prisma from "./prisma";
import { fetchManualScheduleItems } from "./schedule";
import { buildGoogleOAuthClient } from "./google-auth";
import { google } from "googleapis";

export async function exportAssignmentsToCalendar() {
  const oAuth2Client = buildGoogleOAuthClient();
  const calendar = google.calendar({ version: "v3", auth: oAuth2Client });
  const calendarId = "primary";

  const assignments = await prisma.assignment.findMany({
    where: {
      dueDate: { not: null },
    },
  });
  const manualItems = await fetchManualScheduleItems();

  let createdCount = 0;
  let skippedCount = 0;

  for (const work of assignments) {
    if (!work.dueDate) continue;
    const existingRecord = await prisma.calendarExportRecord.findUnique({
      where: {
        calendarId_sourceType_sourceId: {
          calendarId,
          sourceType: "ASSIGNMENT",
          sourceId: work.id,
        },
      },
    });

    if (existingRecord) {
      skippedCount += 1;
      continue;
    }

    const event = {
      summary: `[과제 마감] ${work.title}`,
      description: `aSSIST MBA Hub에서 동기화된 과제입니다.`,
      start: {
        dateTime: work.dueDate.toISOString(),
      },
      end: {
        dateTime: new Date(work.dueDate.getTime() + 60 * 60 * 1000).toISOString(), // 1시간 뒤
      },
    };

    const inserted = await calendar.events.insert({
      calendarId,
      requestBody: event,
    });

    if (!inserted.data.id) {
      throw new Error(`과제 '${work.title}' 캘린더 등록 후 event id를 받지 못했습니다.`);
    }

    await prisma.calendarExportRecord.create({
      data: {
        calendarId,
        sourceType: "ASSIGNMENT",
        sourceId: work.id,
        eventId: inserted.data.id,
      },
    });

    createdCount += 1;
  }

  for (const item of manualItems) {
    if (!item.startAt) continue;
    const existingRecord = await prisma.calendarExportRecord.findUnique({
      where: {
        calendarId_sourceType_sourceId: {
          calendarId,
          sourceType: "MANUAL_SCHEDULE",
          sourceId: item.id,
        },
      },
    });

    if (existingRecord) {
      skippedCount += 1;
      continue;
    }

    const event = {
      summary: `[학사 일정] ${item.title}`,
      description: item.description || "aSSIST MBA Hub에서 직접 등록한 일정입니다.",
      start: {
        dateTime: item.startAt.toISOString(),
      },
      end: {
        dateTime: (item.endAt ?? new Date(item.startAt.getTime() + 60 * 60 * 1000)).toISOString(),
      },
    };

    const inserted = await calendar.events.insert({
      calendarId,
      requestBody: event,
    });

    if (!inserted.data.id) {
      throw new Error(`수동 일정 '${item.title}' 캘린더 등록 후 event id를 받지 못했습니다.`);
    }

    await prisma.calendarExportRecord.create({
      data: {
        calendarId,
        sourceType: "MANUAL_SCHEDULE",
        sourceId: item.id,
        eventId: inserted.data.id,
      },
    });

    createdCount += 1;
  }

  return {
    createdCount,
    skippedCount,
  };
}
