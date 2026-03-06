import fs from "node:fs";
import path from "node:path";
import prisma from "./prisma";
import { google } from "googleapis";
import { buildGoogleOAuthClient } from "./google-auth";
import { runTrackedSync } from "./sync-state";

const MATERIALS_DIR = path.join(process.cwd(), "public", "materials");
export const COURSE_ID = "841669156744";
export const COURSE_TITLE = "[2026-1 AI·전략경영] AI개론";

export async function syncMaterials() {
  return runTrackedSync("CLASSROOM", async () => {
    await prisma.course.upsert({
      where: { id: COURSE_ID },
      update: { title: COURSE_TITLE },
      create: { id: COURSE_ID, title: COURSE_TITLE },
    });

    const materialCount = await syncLocalMaterials();
    const assignmentCount = await syncAssignmentsFromAPI();

    return {
      count: materialCount + assignmentCount,
      message: `자료 ${materialCount}개, 과제 ${assignmentCount}개를 확인했습니다.`,
    };
  });
}

async function syncAssignmentsFromAPI() {
  const oAuth2Client = buildGoogleOAuthClient();
  const classroom = google.classroom({ version: "v1", auth: oAuth2Client });
  let syncedCount = 0;

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
        dueDate,
      },
      create: {
        id: work.id,
        courseId: COURSE_ID,
        title: work.title,
        dueDate,
        status: "TODO",
      },
    });

    syncedCount += 1;
  }

  return syncedCount;
}

async function syncLocalMaterials() {
  let syncedCount = 0;
  const categories = ["announcements", "assignments", "obsidian_notes"];

  for (const category of categories) {
    const categoryPath = path.join(MATERIALS_DIR, category);
    if (!fs.existsSync(categoryPath)) continue;

    const files = getAllFiles(categoryPath);
    for (const file of files) {
      if (!file.endsWith(".pdf") && !file.endsWith(".md")) {
        continue;
      }

      const relativeUrl = file.replace(path.join(process.cwd(), "public"), "");
      await prisma.material.upsert({
        where: { id: relativeUrl },
        update: {
          title: path.basename(file),
          type: file.endsWith(".pdf") ? "pdf" : "md",
          localUrl: relativeUrl,
        },
        create: {
          id: relativeUrl,
          courseId: COURSE_ID,
          title: path.basename(file),
          type: file.endsWith(".pdf") ? "pdf" : "md",
          localUrl: relativeUrl,
        },
      });
      syncedCount += 1;
    }
  }

  return syncedCount;
}

function getAllFiles(dirPath: string, arrayOfFiles: string[] = []) {
  if (!fs.existsSync(dirPath)) return arrayOfFiles;
  const files = fs.readdirSync(dirPath);
  files.forEach(function (file) {
    const nextPath = path.join(dirPath, file);
    if (fs.statSync(nextPath).isDirectory()) {
      arrayOfFiles = getAllFiles(nextPath, arrayOfFiles);
    } else {
      arrayOfFiles.push(nextPath);
    }
  });
  return arrayOfFiles;
}
