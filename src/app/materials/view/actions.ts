"use server";

import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import prisma from "@/lib/prisma";
import {
  deleteMaterialArtifactRecord,
  isSupportedArtifactType,
  removeArtifactFile,
  saveMaterialArtifactFile,
  upsertMaterialArtifact,
  validateMaterialArtifactFilename,
} from "@/lib/material-artifact-storage";

async function upsertNote(materialId: string, data: { content?: string; aiSummary?: string }) {
  const existingNote = await prisma.note.findFirst({
    where: { materialId },
  });

  if (existingNote) {
    return prisma.note.update({
      where: { id: existingNote.id },
      data,
    });
  }

  return prisma.note.create({
    data: {
      materialId,
      content: data.content ?? "",
      aiSummary: data.aiSummary ?? null,
    },
  });
}

async function polishSummaryToMarkdown(input: string) {
  const trimmedInput = input.trim();

  if (!trimmedInput) {
    return "";
  }

  const tempDir = await mkdtemp(path.join(os.tmpdir(), "assist-summary-"));
  const outputPath = path.join(tempDir, "summary.md");

  const prompt = [
    "다음 텍스트를 한국어 Markdown 문서 형태로 정리하라.",
    "규칙:",
    "- 새로운 사실을 추가하지 말 것",
    "- 원문 내용을 삭제하거나 축약하지 말 것",
    "- 원문 문장과 정보량을 최대한 그대로 유지할 것",
    "- Markdown 제목, 목록, 문단 구분만 정리할 것",
    "- 필요하면 제목, 소제목, bullet을 사용할 것",
    "- 최종 출력은 Markdown 본문만 반환할 것",
    "",
    "<INPUT>",
    trimmedInput,
    "</INPUT>",
  ].join("\n");

  try {
    const variants: string[][] = [
      ["exec", "-m", "gpt-5.4", "--skip-git-repo-check", "--sandbox", "read-only", "--output-last-message", outputPath, "-"],
      ["exec", "--skip-git-repo-check", "--sandbox", "read-only", "--output-last-message", outputPath, "-"],
    ];
    let lastError: Error | null = null;

    for (const args of variants) {
      try {
        await new Promise<void>((resolve, reject) => {
          const child = spawn("codex", args, {
            cwd: process.cwd(),
            stdio: ["pipe", "pipe", "pipe"],
          });

          let stderr = "";

          child.stderr.on("data", (chunk) => {
            stderr += chunk.toString();
          });

          child.on("error", (error) => {
            reject(error);
          });

          child.on("close", (code) => {
            if (code === 0) {
              resolve();
              return;
            }

            reject(new Error(stderr.trim() || `Codex CLI exited with code ${code}`));
          });

          child.stdin.write(prompt);
          child.stdin.end();
        });

        lastError = null;
        break;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
      }
    }

    if (lastError) {
      throw lastError;
    }

    const polished = (await readFile(outputPath, "utf-8")).trim();
    return polished || trimmedInput;
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

export async function saveMaterialNote(materialId: string, content: string) {
  const note = await upsertNote(materialId, { content });
  return {
    updatedAt: note.updatedAt.toISOString(),
  };
}

export async function saveMaterialSummary(materialId: string, aiSummary: string) {
  const note = await upsertNote(materialId, { aiSummary });
  return {
    aiSummary: note.aiSummary ?? "",
    updatedAt: note.updatedAt.toISOString(),
  };
}

export async function polishMaterialSummary(aiSummary: string) {
  const polishedSummary = await polishSummaryToMarkdown(aiSummary);
  return {
    aiSummary: polishedSummary,
  };
}

export async function uploadMaterialArtifact(formData: FormData) {
  const materialId = String(formData.get("materialId") || "").trim();
  const artifactType = String(formData.get("artifactType") || "").trim();
  const file = formData.get("file");

  if (!materialId) {
    throw new Error("materialId가 필요합니다.");
  }

  if (!isSupportedArtifactType(artifactType)) {
    throw new Error("지원하지 않는 artifact type입니다.");
  }

  if (!(file instanceof File)) {
    throw new Error("업로드할 파일이 필요합니다.");
  }

  if (file.size === 0) {
    throw new Error("빈 파일은 업로드할 수 없습니다.");
  }

  validateMaterialArtifactFilename(artifactType, file.name || "artifact.bin");

  const material = await prisma.material.findUnique({
    where: { id: materialId },
    select: { id: true },
  });

  if (!material) {
    throw new Error("해당 문서를 찾을 수 없습니다.");
  }

  const existingArtifact = await prisma.materialArtifact.findUnique({
    where: {
      materialId_artifactType: {
        materialId,
        artifactType,
      },
    },
  });

  const buffer = Buffer.from(await file.arrayBuffer());
  const saved = await saveMaterialArtifactFile({
    materialId,
    artifactType,
    originalName: file.name || "artifact.bin",
    buffer,
  });

  const artifact = await upsertMaterialArtifact({
    materialId,
    artifactType,
    localPath: saved.absolutePath,
    publicUrl: saved.publicPath,
  });

  if (existingArtifact?.localPath && existingArtifact.localPath !== saved.absolutePath) {
    await removeArtifactFile(existingArtifact.localPath);
  }

  return {
    artifactId: artifact.id,
    artifactType: artifact.artifactType,
    publicUrl: artifact.publicUrl,
    updatedAt: artifact.updatedAt.toISOString(),
  };
}

export async function deleteMaterialArtifact(artifactId: string) {
  const artifact = await deleteMaterialArtifactRecord(artifactId);

  if (!artifact) {
    throw new Error("삭제할 artifact를 찾을 수 없습니다.");
  }

  return {
    artifactId,
    artifactType: artifact.artifactType,
  };
}
