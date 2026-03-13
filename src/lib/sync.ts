import fs from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import prisma from "./prisma";
import { google } from "googleapis";
import { buildGoogleOAuthClient } from "./google-auth";
import { resolvePublicBackedStorage } from "./public-storage";
import { runTrackedSync } from "./sync-state";

export const COURSE_ID = "841669156744";
export const COURSE_TITLE = "[2026-1 AI·전략경영] AI개론";
const VIDEO_EXTENSIONS = new Set([".mp4", ".mov", ".m4v", ".avi", ".wmv", ".mkv", ".webm"]);
const COURSE_MATERIALS_SCOPE = "https://www.googleapis.com/auth/classroom.courseworkmaterials.readonly";

export async function syncMaterials() {
  return runTrackedSync("CLASSROOM", async () => {
    await prisma.course.upsert({
      where: { id: COURSE_ID },
      update: { title: COURSE_TITLE },
        create: { id: COURSE_ID, title: COURSE_TITLE },
    });

    await downloadClassroomMaterialsToLocal();
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

function sanitizeFilename(name: string) {
  return name.replace(/[\\/*?:"<>|]/g, "_");
}

function buildAnnouncementFolderName(announcement: { updateTime?: string | null; text?: string | null }) {
  const date = announcement.updateTime?.slice(0, 10) || "0000-00-00";
  const snippet = (announcement.text || "내용없음").slice(0, 20).trim().replace(/\n/g, " ");
  return sanitizeFilename(`${date}_${snippet}`);
}

function isVideoFile(fileName: string, mimeType?: string | null) {
  const suffix = path.extname(fileName).toLowerCase();
  return Boolean(mimeType?.startsWith("video/")) || VIDEO_EXTENSIONS.has(suffix);
}

async function ensureDir(dirPath: string) {
  await fs.promises.mkdir(dirPath, { recursive: true });
}

async function writeMarkdownStub(filePath: string, content: string) {
  await ensureDir(path.dirname(filePath));
  await fs.promises.writeFile(filePath, content, "utf-8");
}

async function saveExternalLinkNote(
  folderPath: string,
  title: string,
  url: string,
  kind: "video" | "link",
  mimeType?: string | null,
) {
  const suffix = kind === "video" ? "video-link" : "external-link";
  const fileName = `${sanitizeFilename(path.parse(title).name || title)} [${suffix}].md`;
  const filePath = path.join(folderPath, fileName);
  const content = [
    `# ${title}`,
    "",
    `- Type: Classroom ${kind} link`,
    mimeType ? `- MIME Type: ${mimeType}` : null,
    "",
    `[Open Link](${url})`,
    "",
    kind === "video"
      ? "> Video lecture files are intentionally not downloaded locally."
      : "> This material is stored as a link note instead of a downloaded file.",
    "",
  ]
    .filter(Boolean)
    .join("\n");
  await writeMarkdownStub(filePath, content);
}

async function downloadDriveFile(
  drive: ReturnType<typeof google.drive>,
  fileId: string,
  fileName: string,
  folderPath: string,
) {
  await ensureDir(folderPath);
  const metadata = await drive.files.get({
    fileId,
    fields: "id,name,mimeType,webViewLink,webContentLink",
  });
  const mimeType = metadata.data.mimeType;
  const webLink = metadata.data.webViewLink || metadata.data.webContentLink;

  if (isVideoFile(fileName, mimeType)) {
    if (webLink) {
      await saveExternalLinkNote(folderPath, fileName, webLink, "video", mimeType);
    }
    return;
  }

  const filePath = path.join(folderPath, sanitizeFilename(fileName));
  if (fs.existsSync(filePath)) {
    return;
  }

  const response = await drive.files.get(
    { fileId, alt: "media" },
    { responseType: "stream" },
  );
  await pipeline(response.data, fs.createWriteStream(filePath));
}

async function syncDriveMaterials(
  materials: Array<{ driveFile?: { driveFile?: { id?: string | null; title?: string | null } | null } | null; link?: { title?: string | null; url?: string | null } | null }> | undefined | null,
  drive: ReturnType<typeof google.drive>,
  folderPath: string,
) {
  if (!materials?.length) {
    return;
  }

  for (const material of materials) {
    const driveFile = material.driveFile?.driveFile;
    if (driveFile?.id && driveFile.title) {
      await downloadDriveFile(drive, driveFile.id, driveFile.title, folderPath);
      continue;
    }

    const link = material.link;
    if (link?.url && link.title) {
      await saveExternalLinkNote(folderPath, link.title, link.url, "link");
    }
  }
}

async function downloadClassroomMaterialsToLocal() {
  const auth = buildGoogleOAuthClient();
  const classroom = google.classroom({ version: "v1", auth });
  const drive = google.drive({ version: "v3", auth });
  const storage = await resolvePublicBackedStorage({
    envVar: "MATERIALS_STORAGE_ROOT",
    publicSegment: "materials",
    label: "Classroom 자료",
  });

  const courseWorkRes = await classroom.courses.courseWork.list({ courseId: COURSE_ID });
  const courseWork = courseWorkRes.data.courseWork || [];
  for (const work of courseWork) {
    const title = work.title?.trim();
    if (!title) continue;
    const folderPath = path.join(storage.backingRoot, "assignments", sanitizeFilename(title));
    await syncDriveMaterials(work.materials, drive, folderPath);
  }

  const announcementRes = await classroom.courses.announcements.list({ courseId: COURSE_ID });
  const announcements = announcementRes.data.announcements || [];
  for (const announcement of announcements) {
    const folderPath = path.join(storage.backingRoot, "announcements", buildAnnouncementFolderName(announcement));
    await syncDriveMaterials(announcement.materials, drive, folderPath);
  }

  const tokenScopes = new Set((auth.credentials.scope || "").split(" ").filter(Boolean));
  if (!tokenScopes.has(COURSE_MATERIALS_SCOPE)) {
    return;
  }

  const courseMaterialRes = await classroom.courses.courseWorkMaterials.list({ courseId: COURSE_ID });
  const courseMaterials = courseMaterialRes.data.courseWorkMaterial || [];
  for (const material of courseMaterials) {
    const title = material.title?.trim();
    if (!title) continue;
    const folderPath = path.join(storage.backingRoot, "assignments", sanitizeFilename(title));
    await syncDriveMaterials(material.materials, drive, folderPath);
  }
}

async function syncLocalMaterials() {
  let syncedCount = 0;
  const categories = ["announcements", "assignments", "obsidian_notes"];
  const storage = await resolvePublicBackedStorage({
    envVar: "MATERIALS_STORAGE_ROOT",
    publicSegment: "materials",
    label: "Classroom 자료",
  });

  for (const category of categories) {
    const categoryPath = path.join(storage.backingRoot, category);
    if (!fs.existsSync(categoryPath)) continue;

    const files = getAllFiles(categoryPath);
    for (const file of files) {
      if (!file.endsWith(".pdf") && !file.endsWith(".md")) {
        continue;
      }

      const relativePath = path.relative(storage.backingRoot, file).split(path.sep).join("/");
      const relativeUrl = `/materials/${relativePath}`;
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
