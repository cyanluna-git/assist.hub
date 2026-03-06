import path from "node:path";
import { access, lstat, mkdir, realpath, rm, writeFile } from "node:fs/promises";
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

const ARTIFACT_PUBLIC_SEGMENT = "material-artifacts";

type ArtifactStorageConfig = {
  publicMountPath: string;
  backingRoot: string;
  usesExternalRoot: boolean;
};

function getArtifactPublicMountPath() {
  return path.join(process.cwd(), "public", ARTIFACT_PUBLIC_SEGMENT);
}

function getConfiguredArtifactStorageRoot() {
  const configuredRoot = process.env.ARTIFACT_STORAGE_ROOT?.trim();

  if (!configuredRoot) {
    return getArtifactPublicMountPath();
  }

  return path.isAbsolute(configuredRoot) ? configuredRoot : path.resolve(process.cwd(), configuredRoot);
}

async function ensureArtifactStorageRootExists(backingRoot: string, usesExternalRoot: boolean) {
  if (!usesExternalRoot) {
    await mkdir(backingRoot, { recursive: true });
    return;
  }

  try {
    await access(backingRoot);
  } catch {
    throw new Error(
      [
        "외부 artifact 저장 루트를 찾을 수 없습니다.",
        `ARTIFACT_STORAGE_ROOT=${backingRoot}`,
        "Google Drive 폴더를 먼저 만들고 symlink를 연결하세요.",
      ].join(" "),
    );
  }
}

async function ensurePublicMountMatchesBackingRoot(publicMountPath: string, backingRoot: string) {
  try {
    await access(publicMountPath);
  } catch {
    throw new Error(
      [
        "public/material-artifacts 경로를 찾을 수 없습니다.",
        "외부 저장소를 사용할 때는 public/material-artifacts를 backing folder로 연결한 symlink가 필요합니다.",
      ].join(" "),
    );
  }

  const [mountRealPath, backingRealPath] = await Promise.all([
    realpath(publicMountPath),
    realpath(backingRoot),
  ]);

  if (mountRealPath !== backingRealPath) {
    let mountType = "directory";

    try {
      const stat = await lstat(publicMountPath);
      mountType = stat.isSymbolicLink() ? "symlink" : "directory";
    } catch {
      mountType = "missing";
    }

    throw new Error(
      [
        "public/material-artifacts와 ARTIFACT_STORAGE_ROOT가 같은 위치를 가리켜야 합니다.",
        `현재 mount=${mountRealPath} (${mountType}), root=${backingRealPath}`,
        "권장: public/material-artifacts를 외부 저장 폴더로 symlink 연결하세요.",
      ].join(" "),
    );
  }
}

async function resolveArtifactStorageConfig(): Promise<ArtifactStorageConfig> {
  const publicMountPath = getArtifactPublicMountPath();
  const backingRoot = getConfiguredArtifactStorageRoot();
  const usesExternalRoot = backingRoot !== publicMountPath;

  await ensureArtifactStorageRootExists(backingRoot, usesExternalRoot);

  if (usesExternalRoot) {
    await ensurePublicMountMatchesBackingRoot(publicMountPath, backingRoot);
  }

  return {
    publicMountPath,
    backingRoot,
    usesExternalRoot,
  };
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
  return `/${ARTIFACT_PUBLIC_SEGMENT}/${materialSlug}/${artifactType.toLowerCase()}/${fileName}`;
}

export async function saveMaterialArtifactFile(input: {
  materialId: string;
  artifactType: MaterialArtifactType;
  originalName: string;
  buffer: Buffer;
}) {
  const storage = await resolveArtifactStorageConfig();
  const publicPath = buildArtifactPublicPath(input.materialId, input.artifactType, input.originalName);
  const absolutePath = path.join(storage.backingRoot, publicPath.replace(`/${ARTIFACT_PUBLIC_SEGMENT}/`, ""));

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
