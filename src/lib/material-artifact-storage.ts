import path from "node:path";
import { mkdir, rm, writeFile } from "node:fs/promises";
import prisma from "./prisma";
import {
  MATERIAL_ARTIFACT_TYPES,
  getMaterialArtifactExtensions,
  type MaterialArtifactType,
} from "./material-artifacts";

function sanitizeSegment(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[^\w.-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
}

function getArtifactExtension(filename: string) {
  const extension = path.extname(filename).trim().toLowerCase();
  return extension || ".bin";
}

function buildArtifactFileName(materialId: string, artifactType: MaterialArtifactType, originalName: string) {
  const extension = getArtifactExtension(originalName);
  const materialSlug = sanitizeSegment(path.basename(materialId, path.extname(materialId)) || "material");
  const artifactSlug = sanitizeSegment(artifactType);
  return `${materialSlug}-${artifactSlug}${extension}`;
}

export function isSupportedArtifactType(value: string): value is MaterialArtifactType {
  return MATERIAL_ARTIFACT_TYPES.includes(value as MaterialArtifactType);
}

export function validateMaterialArtifactFilename(artifactType: MaterialArtifactType, filename: string) {
  const extension = getArtifactExtension(filename);
  const allowedExtensions = getMaterialArtifactExtensions(artifactType);

  if (!allowedExtensions.includes(extension)) {
    throw new Error(
      `이 artifact type은 ${allowedExtensions.join(", ")} 형식만 업로드할 수 있습니다.`,
    );
  }
}

export function buildArtifactPublicPath(materialId: string, artifactType: MaterialArtifactType, originalName: string) {
  const fileName = buildArtifactFileName(materialId, artifactType, originalName);
  const materialSlug = sanitizeSegment(path.basename(materialId, path.extname(materialId)) || "material");
  return `/material-artifacts/${materialSlug}/${artifactType.toLowerCase()}/${fileName}`;
}

export async function saveMaterialArtifactFile(input: {
  materialId: string;
  artifactType: MaterialArtifactType;
  originalName: string;
  buffer: Buffer;
}) {
  const publicPath = buildArtifactPublicPath(input.materialId, input.artifactType, input.originalName);
  const absolutePath = path.join(process.cwd(), "public", publicPath.replace(/^\//, ""));

  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, input.buffer);

  return {
    absolutePath,
    publicPath,
  };
}

export async function upsertMaterialArtifact(input: {
  materialId: string;
  artifactType: MaterialArtifactType;
  localPath: string;
  publicUrl: string;
}) {
  const now = new Date();

  return prisma.materialArtifact.upsert({
    where: {
      materialId_artifactType: {
        materialId: input.materialId,
        artifactType: input.artifactType,
      },
    },
    update: {
      status: "SUCCESS",
      localPath: input.localPath,
      publicUrl: input.publicUrl,
      errorMessage: null,
      generatedAt: now,
      updatedAt: now,
    },
    create: {
      materialId: input.materialId,
      artifactType: input.artifactType,
      status: "SUCCESS",
      localPath: input.localPath,
      publicUrl: input.publicUrl,
      errorMessage: null,
      generatedAt: now,
    },
  });
}

export async function removeArtifactFile(localPath: string | null | undefined) {
  if (!localPath) {
    return;
  }

  try {
    await rm(localPath, { force: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`artifact 파일 정리에 실패했습니다: ${message}`);
  }
}

export async function deleteMaterialArtifactRecord(artifactId: string) {
  const artifact = await prisma.materialArtifact.findUnique({
    where: { id: artifactId },
  });

  if (!artifact) {
    return null;
  }

  await removeArtifactFile(artifact.localPath);
  await prisma.materialArtifact.delete({
    where: { id: artifactId },
  });

  return artifact;
}
