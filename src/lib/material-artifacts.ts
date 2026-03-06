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
