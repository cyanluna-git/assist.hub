import fs from "fs";
import path from "path";
import prisma from "./prisma";
import { google } from "googleapis";

const TOKEN_PATH = path.join(process.cwd(), "..", "ops", "token.json");
const CREDENTIALS_PATH = path.join(process.cwd(), "..", "ops", "credentials.json");

export async function exportAssignmentsToCalendar() {
  if (!fs.existsSync(TOKEN_PATH)) {
    throw new Error("token.json이 없습니다.");
  }

  const token = JSON.parse(fs.readFileSync(TOKEN_PATH, "utf-8"));
  const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, "utf-8"));
  
  const { client_secret, client_id, redirect_uris } = credentials.installed;
  const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);
  oAuth2Client.setCredentials(token);

  const calendar = google.calendar({ version: "v3", auth: oAuth2Client });

  // 1. DB에서 마감일이 있는 과제 가져오기
  const assignments = await prisma.assignment.findMany({
    where: {
      dueDate: { not: null }
    }
  });

  let count = 0;
  for (const work of assignments) {
    if (!work.dueDate) continue;

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

    try {
      // 이미 등록된 이벤트인지 확인하는 로직은 여기서는 생략(단순 삽입)
      await calendar.events.insert({
        calendarId: "primary",
        requestBody: event,
      });
      count++;
    } catch (e) {
      console.error(`과제 '${work.title}' 등록 실패:`, e);
    }
  }

  return count;
}
