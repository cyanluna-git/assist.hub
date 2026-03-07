export type RecentMaterialResumeView = "default" | "document" | "summary" | "artifact";

export type RecentMaterialEntry = {
  materialId: string;
  materialPath: string;
  materialTitle: string;
  materialType: string;
  resumeView: RecentMaterialResumeView;
  artifactId?: string;
  summaryEditing?: boolean;
  updatedAt: string;
};

const STORAGE_KEY = "assist-hub-recent-materials";
export const RECENT_MATERIALS_EVENT = "assist-hub:recent-materials-updated";
const MAX_RECENT_MATERIALS = 3;

function normalizeEntry(input: Partial<RecentMaterialEntry>): RecentMaterialEntry | null {
  if (
    typeof input.materialId !== "string" ||
    typeof input.materialPath !== "string" ||
    typeof input.materialTitle !== "string" ||
    typeof input.materialType !== "string"
  ) {
    return null;
  }

  const resumeView: RecentMaterialResumeView =
    input.resumeView === "document" || input.resumeView === "summary" || input.resumeView === "artifact"
      ? input.resumeView
      : "default";

  return {
    materialId: input.materialId,
    materialPath: input.materialPath,
    materialTitle: input.materialTitle,
    materialType: input.materialType,
    resumeView,
    artifactId: typeof input.artifactId === "string" ? input.artifactId : undefined,
    summaryEditing: Boolean(input.summaryEditing),
    updatedAt: typeof input.updatedAt === "string" ? input.updatedAt : new Date().toISOString(),
  };
}

export function readRecentMaterials(): RecentMaterialEntry[] {
  if (typeof window === "undefined") {
    return [];
  }

  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .map((entry) => normalizeEntry(entry))
      .filter((entry): entry is RecentMaterialEntry => Boolean(entry))
      .slice(0, MAX_RECENT_MATERIALS);
  } catch {
    return [];
  }
}

function writeRecentMaterials(entries: RecentMaterialEntry[]) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(0, MAX_RECENT_MATERIALS)));
  window.dispatchEvent(new CustomEvent(RECENT_MATERIALS_EVENT));
}

export function upsertRecentMaterial(entry: Omit<RecentMaterialEntry, "updatedAt"> & { updatedAt?: string }) {
  const normalized = normalizeEntry({
    ...entry,
    updatedAt: entry.updatedAt ?? new Date().toISOString(),
  });

  if (!normalized || typeof window === "undefined") {
    return;
  }

  const nextEntries = [
    normalized,
    ...readRecentMaterials().filter((item) => item.materialId !== normalized.materialId),
  ].slice(0, MAX_RECENT_MATERIALS);

  writeRecentMaterials(nextEntries);
}

export function buildRecentMaterialHref(entry: RecentMaterialEntry) {
  const params = new URLSearchParams({
    path: entry.materialPath,
  });

  if (entry.resumeView !== "default") {
    params.set("resumeView", entry.resumeView);
  }

  if (entry.resumeView === "artifact" && entry.artifactId) {
    params.set("artifactId", entry.artifactId);
  }

  if (entry.summaryEditing) {
    params.set("summaryEdit", "1");
  }

  return `/materials/view?${params.toString()}`;
}

export function getRecentMaterialContextLabel(entry: RecentMaterialEntry) {
  switch (entry.resumeView) {
    case "document":
      return "원문 집중";
    case "summary":
      return entry.summaryEditing ? "요약 편집" : "요약 보기";
    case "artifact":
      return "아티팩트";
    case "default":
    default:
      return "기본 보기";
  }
}
