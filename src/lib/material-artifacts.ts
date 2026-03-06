// Persistence contract for NotebookLM-backed material attachments.
// Keep these literals in sync with prisma/schema.prisma until the runtime paths use them directly.

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
