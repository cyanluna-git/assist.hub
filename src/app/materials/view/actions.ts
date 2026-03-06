"use server";

import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import prisma from "@/lib/prisma";

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
