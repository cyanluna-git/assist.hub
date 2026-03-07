export const MATERIAL_ARTIFACT_TYPES = [
  "NOTEBOOKLM_SUMMARY",
  "SLIDES",
  "INFOGRAPHIC",
  "AUDIO_OVERVIEW",
  "MINDMAP",
] as const;

export const MATERIAL_ARTIFACT_STATUSES = ["PENDING", "RUNNING", "SUCCESS", "ERROR"] as const;

export type MaterialArtifactType = (typeof MATERIAL_ARTIFACT_TYPES)[number];
export type MaterialArtifactStatus = (typeof MATERIAL_ARTIFACT_STATUSES)[number];

export type MaterialArtifactDefinition = {
  type: MaterialArtifactType;
  label: string;
  shortLabel: string;
  description: string;
  extensions: readonly string[];
};

export type MaterialArtifactPreviewKind = "image" | "pdf" | "text" | "audio" | "unsupported";

export const MATERIAL_ARTIFACT_DEFINITIONS: readonly MaterialArtifactDefinition[] = [
  {
    type: "NOTEBOOKLM_SUMMARY",
    label: "요약 문서",
    shortLabel: "요약",
    description: "논문 핵심 내용, 섹션별 요점, 발표 준비용 정리본을 올릴 때 사용합니다.",
    extensions: [".md", ".txt", ".pdf"],
  },
  {
    type: "SLIDES",
    label: "슬라이드",
    shortLabel: "슬라이드",
    description: "발표 자료나 강의용 deck 파일을 첨부합니다.",
    extensions: [".pdf", ".ppt", ".pptx", ".key"],
  },
  {
    type: "INFOGRAPHIC",
    label: "인포그래픽",
    shortLabel: "인포그래픽",
    description: "한 장짜리 시각 요약, 포스터형 정리본, 도식 이미지를 첨부합니다.",
    extensions: [".png", ".jpg", ".jpeg", ".webp", ".svg", ".pdf"],
  },
  {
    type: "AUDIO_OVERVIEW",
    label: "오디오 개요",
    shortLabel: "오디오",
    description: "논문 설명 음성, 요약 음성 메모, 오디오 브리핑 파일을 첨부합니다.",
    extensions: [".mp3", ".m4a", ".wav", ".aac"],
  },
  {
    type: "MINDMAP",
    label: "마인드맵",
    shortLabel: "마인드맵",
    description: "논문 구조를 정리한 맵, 개념 연결도, 구조화 노트를 첨부합니다.",
    extensions: [".png", ".jpg", ".jpeg", ".webp", ".svg", ".pdf", ".xmind", ".mm"],
  },
] as const;

export const MATERIAL_ARTIFACT_UPLOAD_DEFINITIONS = MATERIAL_ARTIFACT_DEFINITIONS.filter(
  (definition) => definition.type !== "NOTEBOOKLM_SUMMARY",
);

const MATERIAL_ARTIFACT_DEFINITION_MAP = new Map(
  MATERIAL_ARTIFACT_DEFINITIONS.map((definition) => [definition.type, definition]),
);

export function getMaterialArtifactDefinition(type: MaterialArtifactType) {
  return MATERIAL_ARTIFACT_DEFINITION_MAP.get(type);
}

export function getMaterialArtifactLabel(type: MaterialArtifactType) {
  return getMaterialArtifactDefinition(type)?.shortLabel ?? type;
}

export function getMaterialArtifactAccept(type: MaterialArtifactType) {
  return getMaterialArtifactDefinition(type)?.extensions.join(",");
}

export function getMaterialArtifactExtensions(type: MaterialArtifactType) {
  return getMaterialArtifactDefinition(type)?.extensions ?? [];
}

export function getArtifactExtension(filename: string) {
  const lastDot = filename.lastIndexOf(".");
  if (lastDot === -1) {
    return "";
  }

  return filename.slice(lastDot).toLowerCase();
}

export function isArtifactFileSupported(type: MaterialArtifactType, filename: string) {
  const extension = getArtifactExtension(filename);
  return getMaterialArtifactExtensions(type).includes(extension);
}

export function inferArtifactTypeFromFilename(filename: string): MaterialArtifactType | null {
  const extension = getArtifactExtension(filename);

  if (!extension) {
    return null;
  }

  if ([".png", ".jpg", ".jpeg", ".webp", ".svg"].includes(extension)) {
    return "INFOGRAPHIC";
  }

  if ([".mp3", ".m4a", ".wav", ".aac"].includes(extension)) {
    return "AUDIO_OVERVIEW";
  }

  if ([".ppt", ".pptx", ".key"].includes(extension)) {
    return "SLIDES";
  }

  if ([".xmind", ".mm"].includes(extension)) {
    return "MINDMAP";
  }

  if (extension === ".pdf") {
    return null;
  }

  return null;
}

function getArtifactExtensionFromUrl(url: string | null | undefined) {
  if (!url) {
    return "";
  }

  const cleanUrl = url.split("?")[0] ?? url;
  const lastDot = cleanUrl.lastIndexOf(".");

  if (lastDot === -1) {
    return "";
  }

  return cleanUrl.slice(lastDot).toLowerCase();
}

export function getMaterialArtifactPreviewKind(type: MaterialArtifactType, publicUrl: string | null | undefined) {
  const extension = getArtifactExtensionFromUrl(publicUrl);

  if (type === "AUDIO_OVERVIEW") {
    return "audio" satisfies MaterialArtifactPreviewKind;
  }

  if ([".png", ".jpg", ".jpeg", ".webp", ".svg"].includes(extension)) {
    return "image" satisfies MaterialArtifactPreviewKind;
  }

  if ([".md", ".txt"].includes(extension)) {
    return "text" satisfies MaterialArtifactPreviewKind;
  }

  if (extension === ".pdf") {
    return "pdf";
  }

  return "unsupported" satisfies MaterialArtifactPreviewKind;
}

export function canPreviewMaterialArtifact(type: MaterialArtifactType, publicUrl: string | null | undefined) {
  return getMaterialArtifactPreviewKind(type, publicUrl) !== "unsupported";
}

export function listMaterialArtifactLabels(
  artifacts: Array<{ artifactType: string }>,
): string[] {
  const labels = new Set<string>();

  for (const artifact of artifacts) {
    if (MATERIAL_ARTIFACT_TYPES.includes(artifact.artifactType as MaterialArtifactType)) {
      labels.add(getMaterialArtifactLabel(artifact.artifactType as MaterialArtifactType));
    }
  }

  return Array.from(labels);
}
