import fs from "fs";
import path from "path";
import prisma from "./prisma";
import { google } from "googleapis";

const MATERIALS_DIR = path.join(process.cwd(), "public", "materials");
const COURSE_ID = "841669156744";
const COURSE_TITLE = "[2026-1 AI·전략경영] AI개론";

// Root 디렉토리의 인증 정보 참조
const TOKEN_PATH = path.join(process.cwd(), "..", "ops", "token.json");
const CREDENTIALS_PATH = path.join(process.cwd(), "..", "ops", "credentials.json");

export async function syncMaterials() {
  console.log("--- 자료 및 과제 동기화 시작 ---");

  // 1. 코스 생성 (없을 경우)
  await prisma.course.upsert({
    where: { id: COURSE_ID },
    update: {},
    create: { id: COURSE_ID, title: COURSE_TITLE },
  });

  // 2. 파일 동기화 (announcements, assignments, obsidian_notes 폴더)
  const categories = ["announcements", "assignments", "obsidian_notes"];
  for (const cat of categories) {
    const catPath = path.join(MATERIALS_DIR, cat);
    if (!fs.existsSync(catPath)) continue;
    const files = getAllFiles(catPath);
    for (const f of files) {
      if (f.endsWith(".pdf") || f.endsWith(".md")) {
        const relativeUrl = f.replace(path.join(process.cwd(), "public"), "");
        await prisma.material.upsert({
          where: { id: relativeUrl },
          update: {},
          create: {
            id: relativeUrl,
            courseId: COURSE_ID,
            title: path.basename(f),
            type: f.endsWith(".pdf") ? "pdf" : "md",
            localUrl: relativeUrl,
          },
        });
      }
    }
  }

  // 3. 구글 클래스룸 과제(CourseWork) 동기화
  await syncAssignmentsFromAPI();

  console.log("--- 동기화 완료 ---");
}

async function syncAssignmentsFromAPI() {
  if (!fs.existsSync(TOKEN_PATH)) {
    console.warn("token.json이 없어 과제 API 동기화를 건너뜁니다.");
    return;
  }

  const token = JSON.parse(fs.readFileSync(TOKEN_PATH, "utf-8"));
  const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, "utf-8"));
  
  const { client_secret, client_id, redirect_uris } = credentials.installed;
  const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);
  oAuth2Client.setCredentials(token);

  const classroom = google.classroom({ version: "v1", auth: oAuth2Client });

  try {
    const res = await classroom.courses.courseWork.list({ courseId: COURSE_ID });
    const coursework = res.data.courseWork || [];

    for (const work of coursework) {
      if (!work.id || !work.title) continue;

      let dueDate: Date | null = null;
      if (work.dueDate) {
        const { year, month, day } = work.dueDate;
        const hours = work.dueTime?.hours ?? 0;
        const minutes = work.dueTime?.minutes ?? 0;

        if (year && month && day) {
          dueDate = new Date(year, month - 1, day, hours, minutes);
        }
      }

      await prisma.assignment.upsert({
        where: { id: work.id },
        update: {
          title: work.title,
          dueDate: dueDate,
        },
        create: {
          id: work.id,
          courseId: COURSE_ID,
          title: work.title,
          dueDate: dueDate,
          status: "TODO",
        },
      });
    }
    console.log(`${coursework.length}개 과제 API 동기화 완료`);
  } catch (error) {
    console.error("클래스룸 과제 동기화 중 오류:", error);
  }
}

function getAllFiles(dirPath: string, arrayOfFiles: string[] = []) {
  if (!fs.existsSync(dirPath)) return arrayOfFiles;
  const files = fs.readdirSync(dirPath);
  files.forEach(function (file) {
    if (fs.statSync(dirPath + "/" + file).isDirectory()) {
      arrayOfFiles = getAllFiles(dirPath + "/" + file, arrayOfFiles);
    } else {
      arrayOfFiles.push(path.join(dirPath, "/", file));
    }
  });
  return arrayOfFiles;
}
