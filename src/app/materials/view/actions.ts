"use server";

import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import prisma from "@/lib/prisma";
import {
  deleteMaterialArtifactRecord,
  isSupportedArtifactType,
  removeArtifactFile,
  saveMaterialArtifactFile,
  upsertMaterialArtifact,
} from "@/lib/material-artifact-storage";

const execFileAsync = promisify(execFile);

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

export async function saveMaterialNote(materialId: string, content: string) {
  const note = await upsertNote(materialId, { content });
  return {
    updatedAt: note.updatedAt.toISOString(),
  };
}

export async function generateMaterialSummary(materialId: string) {
  const scriptPath = path.join(process.cwd(), "scripts", "summarize-material.mjs");
  const { stdout } = await execFileAsync("node", [scriptPath, "--id", materialId, "--json"], {
    cwd: process.cwd(),
    maxBuffer: 1024 * 1024 * 4,
    timeout: 1000 * 60 * 10,
  });

  const parsed = JSON.parse(stdout) as {
    aiSummary: string;
    updatedAt: string;
    model: string;
    reasoningEffort: string;
  };

  return parsed;
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
