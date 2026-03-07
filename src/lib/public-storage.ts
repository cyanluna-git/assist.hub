import path from "node:path";
import { access, lstat, mkdir, realpath } from "node:fs/promises";

type PublicBackedStorageOptions = {
  envVar: string;
  publicSegment: string;
  label: string;
};

export type PublicBackedStorage = {
  publicBaseUrl: string;
  publicMountPath: string;
  backingRoot: string;
  usesExternalRoot: boolean;
};

function getPublicMountPath(publicSegment: string) {
  return path.join(process.cwd(), "public", publicSegment);
}

function getConfiguredRoot(envVar: string, publicMountPath: string) {
  const configuredRoot = process.env[envVar]?.trim();

  if (!configuredRoot) {
    return publicMountPath;
  }

  return path.isAbsolute(configuredRoot) ? configuredRoot : path.resolve(process.cwd(), configuredRoot);
}

async function ensureBackingRootExists(storage: PublicBackedStorage, label: string, envVar: string) {
  if (!storage.usesExternalRoot) {
    await mkdir(storage.backingRoot, { recursive: true });
    return;
  }

  try {
    await access(storage.backingRoot);
  } catch {
    throw new Error(
      [
        `${label} 저장 루트를 찾을 수 없습니다.`,
        `${envVar}=${storage.backingRoot}`,
        "외부 폴더를 먼저 만들고 public mount와 연결하세요.",
      ].join(" "),
    );
  }
}

async function ensurePublicMountMatchesBackingRoot(storage: PublicBackedStorage, label: string) {
  try {
    await access(storage.publicMountPath);
  } catch {
    throw new Error(
      [
        `public/${storage.publicBaseUrl.replace(/^\//, "")} 경로를 찾을 수 없습니다.`,
        `${label}를 외부 저장소로 분리할 때는 public mount가 같은 실경로를 가리켜야 합니다.`,
      ].join(" "),
    );
  }

  const [mountRealPath, backingRealPath] = await Promise.all([
    realpath(storage.publicMountPath),
    realpath(storage.backingRoot),
  ]);

  if (mountRealPath !== backingRealPath) {
    const stat = await lstat(storage.publicMountPath);
    const mountType = stat.isSymbolicLink() ? "symlink" : "directory";

    throw new Error(
      [
        `${label} public mount와 backing root가 같은 위치를 가리켜야 합니다.`,
        `현재 mount=${mountRealPath} (${mountType}), root=${backingRealPath}`,
        `권장: public/${storage.publicBaseUrl.replace(/^\//, "")}를 외부 저장 폴더로 symlink 연결하세요.`,
      ].join(" "),
    );
  }
}

export async function resolvePublicBackedStorage(options: PublicBackedStorageOptions): Promise<PublicBackedStorage> {
  const publicMountPath = getPublicMountPath(options.publicSegment);
  const backingRoot = getConfiguredRoot(options.envVar, publicMountPath);
  const storage: PublicBackedStorage = {
    publicBaseUrl: `/${options.publicSegment}`,
    publicMountPath,
    backingRoot,
    usesExternalRoot: backingRoot !== publicMountPath,
  };

  await ensureBackingRootExists(storage, options.label, options.envVar);

  if (storage.usesExternalRoot) {
    await ensurePublicMountMatchesBackingRoot(storage, options.label);
  }

  return storage;
}
