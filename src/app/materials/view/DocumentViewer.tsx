"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import type { Material, MaterialArtifact, Note } from "@prisma/client";
import { ChevronDown, ChevronUp, Download, Edit3, FileUp, Focus, Headphones, ImageIcon, Maximize2, Minimize2, Sparkles, Trash2, X } from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import ReactMarkdown from "react-markdown";
import PdfReader from "./PdfReader";
import {
  MATERIAL_ARTIFACT_UPLOAD_DEFINITIONS,
  canPreviewMaterialArtifact,
  getMaterialArtifactDefinition,
  inferArtifactTypeFromFilename,
  isArtifactFileSupported,
  getMaterialArtifactLabel,
  getMaterialArtifactPreviewKind,
  type MaterialArtifactType,
} from "@/lib/material-artifacts";
import { upsertRecentMaterial, type RecentMaterialResumeView } from "@/lib/recent-materials";
import { deleteMaterialArtifact, polishMaterialSummary, saveMaterialNote, saveMaterialSummary, uploadMaterialArtifact } from "./actions";
import styles from "./document-viewer.module.css";

type ViewerMaterial = Material & { notes: Note[]; artifacts: MaterialArtifact[] };

interface DocumentViewerProps {
  material: ViewerMaterial;
  mdContent?: string;
  initialResumeView?: RecentMaterialResumeView;
  initialResumeArtifactId?: string | null;
  initialSummaryEditing?: boolean;
}

function resolveInitialFocusTarget(
  resumeView: RecentMaterialResumeView,
  artifactId: string | null | undefined,
  artifacts: MaterialArtifact[],
) {
  if (resumeView === "document") {
    return "document" as const;
  }

  if (resumeView === "summary") {
    return "summary" as const;
  }

  if (resumeView === "artifact" && artifactId && artifacts.some((artifact) => artifact.id === artifactId)) {
    return `artifact:${artifactId}` as const;
  }

  return null;
}

export default function DocumentViewer({
  material,
  mdContent,
  initialResumeView = "default",
  initialResumeArtifactId = null,
  initialSummaryEditing = false,
}: DocumentViewerProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const saveVersionRef = useRef(0);
  const [focusTarget, setFocusTarget] = useState<"document" | "summary" | `artifact:${string}` | null>(() =>
    resolveInitialFocusTarget(initialResumeView, initialResumeArtifactId, material.artifacts || []),
  );
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [summary, setSummary] = useState(material.notes?.[0]?.aiSummary || "");
  const [persistedSummary, setPersistedSummary] = useState(material.notes?.[0]?.aiSummary || "");
  const [isSummaryEditing, setIsSummaryEditing] = useState(
    () => initialSummaryEditing || !material.notes?.[0]?.aiSummary,
  );
  const [isSummaryExpanded, setIsSummaryExpanded] = useState(true);
  const [noteContent, setNoteContent] = useState(material.notes?.[0]?.content || "");
  const [persistedNoteContent, setPersistedNoteContent] = useState(material.notes?.[0]?.content || "");
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [summarySaveState, setSummarySaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [summarySavedAt, setSummarySavedAt] = useState<string | null>(null);
  const [isSummaryPending, startSummaryTransition] = useTransition();
  const [artifacts, setArtifacts] = useState(material.artifacts || []);
  const [artifactType, setArtifactType] = useState<MaterialArtifactType>("SLIDES");
  const [expandedArtifactTypes, setExpandedArtifactTypes] = useState<Record<string, boolean>>(() =>
    Object.fromEntries((material.artifacts || []).map((artifact) => [artifact.artifactType, true])),
  );
  const [artifactError, setArtifactError] = useState<string | null>(null);
  const [artifactNotice, setArtifactNotice] = useState<string | null>(null);
  const [artifactFileName, setArtifactFileName] = useState("");
  const [artifactPreviewTextById, setArtifactPreviewTextById] = useState<Record<string, string>>({});
  const [artifactPreviewErrorById, setArtifactPreviewErrorById] = useState<Record<string, string>>({});
  const [artifactPreviewLoadingIds, setArtifactPreviewLoadingIds] = useState<Record<string, boolean>>({});
  const [isArtifactPending, startArtifactTransition] = useTransition();
  const isDirty = noteContent !== persistedNoteContent;
  const isSummaryDirty = summary !== persistedSummary;
  const isDocumentFocusMode = focusTarget === "document";
  const isSummaryFocusMode = focusTarget === "summary";
  const focusedArtifactId = focusTarget?.startsWith("artifact:") ? focusTarget.slice("artifact:".length) : null;
  const isArtifactFocusMode = Boolean(focusedArtifactId);
  const isAnyFocusMode = focusTarget !== null;
  const selectedArtifactDefinition = getMaterialArtifactDefinition(artifactType);
  const artifactSections = useMemo(
    () =>
      MATERIAL_ARTIFACT_UPLOAD_DEFINITIONS.map((definition) => ({
        definition,
        artifact: artifacts.find((item) => item.artifactType === definition.type) ?? null,
      })).filter((section) => section.artifact),
    [artifacts],
  );
  const focusedArtifact = useMemo(
    () => artifacts.find((artifact) => artifact.id === focusedArtifactId) ?? null,
    [artifacts, focusedArtifactId],
  );
  const recentResumeContext = useMemo(() => {
    if (focusedArtifactId) {
      return {
        resumeView: "artifact" as const,
        artifactId: focusedArtifactId,
        summaryEditing: false,
      };
    }

    if (focusTarget === "document") {
      return {
        resumeView: "document" as const,
        artifactId: undefined,
        summaryEditing: false,
      };
    }

    if (focusTarget === "summary") {
      return {
        resumeView: "summary" as const,
        artifactId: undefined,
        summaryEditing: isSummaryEditing,
      };
    }

    return {
      resumeView: "default" as const,
      artifactId: undefined,
      summaryEditing: false,
    };
  }, [focusTarget, focusedArtifactId, isSummaryEditing]);

  async function handleFullscreenToggle() {
    const root = rootRef.current;
    if (!root) return;

    if (document.fullscreenElement) {
      await document.exitFullscreen();
      setIsFullscreen(false);
      return;
    }

    await root.requestFullscreen();
    setIsFullscreen(true);
  }

  useEffect(() => {
    function syncFullscreenState() {
      setIsFullscreen(Boolean(document.fullscreenElement));
    }

    document.addEventListener("fullscreenchange", syncFullscreenState);
    return () => {
      document.removeEventListener("fullscreenchange", syncFullscreenState);
    };
  }, []);

  useEffect(() => {
    upsertRecentMaterial({
      materialId: material.id,
      materialPath: material.localUrl,
      materialTitle: material.title,
      materialType: material.type,
      resumeView: recentResumeContext.resumeView,
      artifactId: recentResumeContext.artifactId,
      summaryEditing: recentResumeContext.summaryEditing,
    });
  }, [
    material.id,
    material.localUrl,
    material.title,
    material.type,
    recentResumeContext.artifactId,
    recentResumeContext.resumeView,
    recentResumeContext.summaryEditing,
  ]);

  useEffect(() => {
    if (noteContent === persistedNoteContent) {
      return;
    }

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    const currentVersion = saveVersionRef.current + 1;
    saveVersionRef.current = currentVersion;

    saveTimeoutRef.current = setTimeout(async () => {
      try {
        setSaveState("saving");
        const result = await saveMaterialNote(material.id, noteContent);
        if (saveVersionRef.current === currentVersion) {
          setPersistedNoteContent(noteContent);
          setSaveState("saved");
          setLastSavedAt(result.updatedAt);
        }
      } catch {
        if (saveVersionRef.current === currentVersion) {
          setSaveState("error");
        }
      }
    }, 700);

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [material.id, noteContent, persistedNoteContent]);

  useEffect(() => {
    const activeArtifacts = artifacts.filter((artifact) => {
      const isExpanded = expandedArtifactTypes[artifact.artifactType];
      const isFocused = artifact.id === focusedArtifactId;
      return isExpanded || isFocused;
    });

    const textArtifacts = activeArtifacts.filter((artifact) => {
      return getMaterialArtifactPreviewKind(artifact.artifactType as MaterialArtifactType, artifact.publicUrl) === "text";
    });

    if (!textArtifacts.length) {
      return;
    }

    const controllers: Array<() => void> = [];

    for (const artifact of textArtifacts) {
      if (!artifact.publicUrl || artifactPreviewTextById[artifact.id] || artifactPreviewLoadingIds[artifact.id]) {
        continue;
      }

      let cancelled = false;
      controllers.push(() => {
        cancelled = true;
      });

      setArtifactPreviewLoadingIds((current) => ({ ...current, [artifact.id]: true }));
      setArtifactPreviewErrorById((current) => ({ ...current, [artifact.id]: "" }));

      void fetch(artifact.publicUrl, { cache: "no-store" })
        .then(async (response) => {
          if (!response.ok) {
            throw new Error("텍스트 preview를 불러오지 못했습니다.");
          }

          return response.text();
        })
        .then((text) => {
          if (cancelled) {
            return;
          }

          setArtifactPreviewTextById((current) => ({ ...current, [artifact.id]: text }));
        })
        .catch((error) => {
          if (cancelled) {
            return;
          }

          setArtifactPreviewErrorById((current) => ({
            ...current,
            [artifact.id]: error instanceof Error ? error.message : "텍스트 preview를 불러오지 못했습니다.",
          }));
        })
        .finally(() => {
          if (cancelled) {
            return;
          }

          setArtifactPreviewLoadingIds((current) => ({ ...current, [artifact.id]: false }));
        });
    }

    return () => {
      for (const cancel of controllers) {
        cancel();
      }
    };
  }, [artifacts, artifactPreviewLoadingIds, artifactPreviewTextById, expandedArtifactTypes, focusedArtifactId]);

  function renderSaveState() {
    if (isDirty && saveState !== "saving") return "입력 중...";
    if (saveState === "saving") return "저장 중...";
    if (saveState === "saved" && lastSavedAt) {
      return `저장됨 · ${new Date(lastSavedAt).toLocaleTimeString()}`;
    }
    if (saveState === "error") return "저장 실패";
    return "자동 저장";
  }

  function renderSummaryState() {
    if (isSummaryEditing) return "편집 중";
    if (summarySaveState === "saving") return "저장 중...";
    if (isSummaryDirty) return "변경 있음";
    if (summarySaveState === "saved" && summarySavedAt) {
      return `저장됨 · ${new Date(summarySavedAt).toLocaleTimeString()}`;
    }
    if (summarySaveState === "error") return "저장 실패";
    return persistedSummary ? "저장된 요약" : "아직 저장 전";
  }

  function toggleArtifactAccordion(type: MaterialArtifactType) {
    setExpandedArtifactTypes((current) => ({ ...current, [type]: !current[type] }));
  }

  function toggleArtifactFocus(artifactId: string) {
    setFocusTarget((current) => (current === `artifact:${artifactId}` ? null : `artifact:${artifactId}`));
  }

  function renderArtifactPreview(artifact: MaterialArtifact, variant: "panel" | "full" = "panel") {
    if (!artifact) {
      return (
        <div className={styles.previewEmpty}>
          <p className={styles.empty}>미리볼 artifact를 아직 선택하지 않았습니다.</p>
        </div>
      );
    }

    const label = getMaterialArtifactLabel(artifact.artifactType as MaterialArtifactType);
    const previewKind = getMaterialArtifactPreviewKind(artifact.artifactType as MaterialArtifactType, artifact.publicUrl);
    const previewText = artifactPreviewTextById[artifact.id] ?? "";
    const previewError = artifactPreviewErrorById[artifact.id] ?? null;
    const isPreviewLoading = Boolean(artifactPreviewLoadingIds[artifact.id]);

    if (!artifact.publicUrl) {
      return (
        <div className={styles.previewFallback}>
          <p className={styles.previewFallbackTitle}>{label} 파일 경로를 찾지 못했습니다.</p>
          <p className={styles.previewFallbackText}>이 첨부는 다시 업로드하는 편이 안전합니다.</p>
        </div>
      );
    }

    switch (previewKind) {
      case "image":
        return (
          <div className={`${styles.previewImageWrap} ${variant === "full" ? styles.previewImageWrapFull : ""}`}>
            <Image src={artifact.publicUrl} alt={label} width={1600} height={1200} className={`${styles.previewImage} ${variant === "full" ? styles.previewImageFull : ""}`} />
          </div>
        );
      case "pdf":
        return (
          <iframe
            src={`${artifact.publicUrl}#toolbar=0&navpanes=0`}
            className={`${styles.previewFrame} ${variant === "full" ? styles.previewFrameFull : ""}`}
            title={`${label} preview`}
          />
        );
      case "audio":
        return (
          <div className={styles.previewAudio}>
            <div className={styles.previewAudioHead}>
              <Headphones size={16} />
              <span>{label} 재생</span>
            </div>
            <audio controls className={styles.audioPlayer}>
              <source src={artifact.publicUrl} />
            </audio>
          </div>
        );
      case "text":
        if (isPreviewLoading) {
          return <p className={styles.previewLoading}>문서를 불러오는 중...</p>;
        }

        if (previewError) {
          return (
            <div className={styles.previewFallback}>
              <p className={styles.previewFallbackTitle}>텍스트 preview를 불러오지 못했습니다.</p>
              <p className={styles.previewFallbackText}>{previewError}</p>
            </div>
          );
        }

        return (
          <div className={`${styles.previewMarkdown} ${variant === "full" ? styles.previewMarkdownFull : ""}`}>
            <ReactMarkdown>{previewText}</ReactMarkdown>
          </div>
        );
      case "unsupported":
      default:
        return (
          <div className={styles.previewFallback}>
            <p className={styles.previewFallbackTitle}>브라우저 preview를 지원하지 않는 형식입니다.</p>
            <p className={styles.previewFallbackText}>
              이 첨부는 페이지 안에서 바로 보여줄 수 없어 `열기` 또는 `다운로드`로 접근해야 합니다.
            </p>
            <div className={styles.previewFallbackActions}>
              <a href={artifact.publicUrl} target="_blank" rel="noreferrer" className={styles.secondaryAction}>
                <Download size={14} />
                열기
              </a>
              <a href={artifact.publicUrl} download className={styles.secondaryAction}>
                <Download size={14} />
                다운로드
              </a>
            </div>
          </div>
        );
    }
  }

  return (
    <div
      ref={rootRef}
      className={`${styles.layout} ${isAnyFocusMode ? styles.focusLayout : ""} ${isSummaryFocusMode ? styles.summaryFocusLayout : ""}`}
    >
      <header className={styles.header}>
        <div className={styles.titleWrap}>
          <span className={styles.tag}>{material.type.toUpperCase()}</span>
          <h2 className={styles.title}>{material.title}</h2>
        </div>
        <div className={styles.headerActions}>
          <button
            type="button"
            className={styles.actionButton}
            aria-label={isFullscreen ? "Exit fullscreen mode" : "Enter fullscreen mode"}
            onClick={handleFullscreenToggle}
          >
            {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            <span>{isFullscreen ? "기본 화면" : "전체 모드"}</span>
          </button>

          <button
            type="button"
            className={styles.actionButton}
            aria-label="Toggle focus mode"
            aria-pressed={isDocumentFocusMode}
            onClick={() => setFocusTarget((current) => (current === "document" ? null : "document"))}
          >
            <Focus size={16} />
            <span>{isDocumentFocusMode ? "집중 모드 해제" : "원문 집중 모드"}</span>
          </button>

          <Link href="/materials" className={styles.close} aria-label="Close viewer">
            <X size={18} />
          </Link>
        </div>
      </header>

      <div className={styles.split}>
        <div className={styles.docPane}>
          {isSummaryFocusMode ? (
            <article className={styles.summaryFocusPane}>
              <div className={styles.summaryFocusHead}>
                <span className={styles.tag}>SUMMARY</span>
                <h3 className={styles.summaryFocusTitle}>{material.title}</h3>
              </div>
              <div className={styles.summaryFocusBody}>
                {summary ? (
                  <ReactMarkdown>{summary}</ReactMarkdown>
                ) : (
                  <p className={styles.empty}>저장된 요약이 없습니다. Summary 입력창에 붙여넣고 저장한 뒤 집중 읽기를 사용하세요.</p>
                )}
              </div>
            </article>
          ) : isArtifactFocusMode && focusedArtifact ? (
            <article className={styles.summaryFocusPane}>
              <div className={styles.summaryFocusHead}>
                <span className={styles.tag}>{getMaterialArtifactLabel(focusedArtifact.artifactType as MaterialArtifactType)}</span>
                <h3 className={styles.summaryFocusTitle}>{material.title}</h3>
              </div>
              <div className={styles.artifactFocusBody}>
                {renderArtifactPreview(focusedArtifact, "full")}
              </div>
            </article>
          ) : material.type === "pdf" ? (
            <PdfReader src={material.localUrl} title={material.title} storageKey={material.id} />
          ) : (
            <div className={styles.markdown}>
              <ReactMarkdown>{mdContent || ""}</ReactMarkdown>
            </div>
          )}
        </div>

        <aside className={styles.assistant}>
          <section className={styles.block}>
            <div className={styles.blockHeader}>
              <div className={styles.blockHead}>
                <FileUp size={15} />
                <span>Artifacts</span>
              </div>
              <span className={styles.statusText}>{isArtifactPending ? "업로드 중..." : "수동 첨부"}</span>
            </div>

            <div className={styles.artifactList}>
              {artifactSections.length ? (
                artifactSections.map(({ definition, artifact }) =>
                  artifact ? (
                    <div key={artifact.id} className={styles.accordionSection}>
                      <button
                        type="button"
                        className={styles.accordionHeader}
                        onClick={() => toggleArtifactAccordion(definition.type)}
                        aria-expanded={Boolean(expandedArtifactTypes[definition.type])}
                      >
                        <div className={styles.accordionTitleWrap}>
                          <span className={styles.artifactTypeBadge}>{definition.label}</span>
                          <span className={styles.artifactStatusBadge}>{artifact.status}</span>
                        </div>
                        <div className={styles.accordionMeta}>
                          <span className={styles.accordionDate}>
                            {artifact.generatedAt ? `업데이트 ${new Date(artifact.generatedAt).toLocaleString()}` : "업로드됨"}
                          </span>
                          {expandedArtifactTypes[definition.type] ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                        </div>
                      </button>
                      {expandedArtifactTypes[definition.type] ? (
                        <div className={styles.accordionBody}>
                          <div className={styles.previewPanel}>
                            <div className={styles.previewHeader}>
                              <div className={styles.previewTitleWrap}>
                                {getMaterialArtifactPreviewKind(definition.type, artifact.publicUrl) === "image" ? <ImageIcon size={15} /> : <FileUp size={15} />}
                                <span className={styles.previewTitle}>{definition.label}</span>
                              </div>
                              <span className={styles.previewStatus}>
                                {canPreviewMaterialArtifact(definition.type, artifact.publicUrl) ? "페이지 안에서 미리보기" : "파일로 열기"}
                              </span>
                            </div>
                            <div className={styles.previewStage}>{renderArtifactPreview(artifact)}</div>
                          </div>
                          {artifact.publicUrl ? (
                            <div className={styles.artifactActions}>
                              <button
                                type="button"
                                className={styles.secondaryAction}
                                onClick={() => toggleArtifactFocus(artifact.id)}
                              >
                                <Focus size={14} />
                                {focusedArtifactId === artifact.id ? "전체 보기 해제" : "전체 보기"}
                              </button>
                              <a href={artifact.publicUrl} target="_blank" rel="noreferrer" className={styles.secondaryAction}>
                                <Download size={14} />
                                열기
                              </a>
                              <a href={artifact.publicUrl} download className={styles.secondaryAction}>
                                <Download size={14} />
                                다운로드
                              </a>
                              <button
                                type="button"
                                className={styles.secondaryAction}
                                disabled={isArtifactPending}
                                onClick={() => {
                                  const confirmed = window.confirm(`${definition.label} 첨부를 삭제할까요?`);
                                  if (!confirmed) {
                                    return;
                                  }

                                  setArtifactError(null);
                                  setArtifactNotice(null);
                                  startArtifactTransition(async () => {
                                    try {
                                      await deleteMaterialArtifact(artifact.id);
                                      setArtifacts((current) => current.filter((item) => item.id !== artifact.id));
                                      setExpandedArtifactTypes((current) => ({ ...current, [definition.type]: false }));
                                      if (focusedArtifactId === artifact.id) {
                                        setFocusTarget(null);
                                      }
                                      setArtifactNotice(`${definition.label} 첨부를 삭제했습니다.`);
                                    } catch (error) {
                                      setArtifactError(error instanceof Error ? error.message : "artifact 삭제에 실패했습니다.");
                                    }
                                  });
                                }}
                              >
                                <Trash2 size={14} />
                                삭제
                              </button>
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  ) : null,
                )
              ) : (
                <p className={styles.empty}>아직 첨부된 artifact가 없습니다. 요약, 슬라이드, 인포그래픽 파일을 직접 올릴 수 있습니다.</p>
              )}
              {artifactNotice ? <p className={styles.metaText}>{artifactNotice}</p> : null}
              {artifactError ? <p className={styles.errorText}>{artifactError}</p> : null}
            </div>

            <form
              className={styles.uploadForm}
              onSubmit={(event) => {
                event.preventDefault();
                const form = event.currentTarget;
                const formData = new FormData(form);
                formData.set("materialId", material.id);
                setArtifactError(null);
                setArtifactNotice(null);

                startArtifactTransition(async () => {
                  try {
                    const selectedFile = formData.get("file");
                    if (!(selectedFile instanceof File) || !selectedFile.name) {
                      throw new Error("업로드할 파일을 선택하세요.");
                    }

                    if (!isArtifactFileSupported(artifactType, selectedFile.name)) {
                      const inferredType = inferArtifactTypeFromFilename(selectedFile.name);
                      if (inferredType && inferredType !== artifactType) {
                        setArtifactType(inferredType);
                        throw new Error(
                          `선택한 파일은 ${getMaterialArtifactLabel(inferredType)} 형식에 더 가깝습니다. artifact type을 자동으로 바꿨습니다. 다시 업로드하세요.`,
                        );
                      }

                      throw new Error(
                        `${getMaterialArtifactLabel(artifactType)}은(는) ${selectedArtifactDefinition?.extensions.join(", ")} 형식만 업로드할 수 있습니다.`,
                      );
                    }

                    const result = await uploadMaterialArtifact(formData);
                    setArtifacts((current) => {
                      const next = current.filter((item) => item.artifactType !== result.artifactType);
                      return [
                        {
                          id: result.artifactId,
                          materialId: material.id,
                          artifactType: result.artifactType,
                          status: "SUCCESS",
                          sourceNotebookId: null,
                          sourceArtifactId: null,
                          localPath: null,
                          publicUrl: result.publicUrl,
                          errorMessage: null,
                          generatedAt: new Date(result.updatedAt),
                          createdAt: new Date(result.updatedAt),
                          updatedAt: new Date(result.updatedAt),
                        },
                        ...next,
                      ];
                    });
                    setArtifactNotice(
                      `${getMaterialArtifactLabel(result.artifactType as MaterialArtifactType)} 첨부가 저장되었습니다.`,
                    );
                    setExpandedArtifactTypes((current) => ({ ...current, [result.artifactType]: true }));
                    form.reset();
                    setArtifactFileName("");
                  } catch (error) {
                    setArtifactError(error instanceof Error ? error.message : "artifact 업로드에 실패했습니다.");
                  }
                });
              }}
            >
              <input type="hidden" name="materialId" value={material.id} />
              <label className={styles.fieldLabel}>
                Artifact Type
                <select
                  name="artifactType"
                  className={styles.select}
                  value={artifactType}
                  onChange={(event) => setArtifactType(event.target.value as MaterialArtifactType)}
                >
                  {MATERIAL_ARTIFACT_UPLOAD_DEFINITIONS.map((definition) => (
                    <option key={definition.type} value={definition.type}>
                      {definition.label}
                    </option>
                  ))}
                </select>
              </label>
              {selectedArtifactDefinition ? (
                <div className={styles.artifactGuide}>
                  <p className={styles.guideTitle}>{selectedArtifactDefinition.label}</p>
                  <p className={styles.guideText}>{selectedArtifactDefinition.description}</p>
                  <p className={styles.guideFormats}>
                    허용 형식: {selectedArtifactDefinition.extensions.join(", ")}
                  </p>
                </div>
              ) : null}
              <label className={styles.fieldLabel}>
                File
                <input
                  name="file"
                  type="file"
                  className={styles.fileInput}
                  onChange={(event) => {
                    const nextFile = event.currentTarget.files?.[0] ?? null;
                    const nextName = nextFile?.name ?? "";
                    setArtifactFileName(nextName);
                    setArtifactError(null);

                    if (!nextFile?.name) {
                      return;
                    }

                    const inferredType = inferArtifactTypeFromFilename(nextFile.name);
                    if (inferredType && inferredType !== artifactType) {
                      setArtifactType(inferredType);
                      setArtifactNotice(
                        `${nextFile.name} 파일 형식에 맞춰 artifact type을 ${getMaterialArtifactLabel(inferredType)}으로 바꿨습니다.`,
                      );
                      return;
                    }

                    if (!isArtifactFileSupported(artifactType, nextFile.name)) {
                      setArtifactNotice(null);
                      setArtifactError(
                        `${getMaterialArtifactLabel(artifactType)}은(는) ${selectedArtifactDefinition?.extensions.join(", ")} 형식만 업로드할 수 있습니다.`,
                      );
                    }
                  }}
                />
              </label>
              {artifactFileName ? <p className={styles.metaText}>선택한 파일: {artifactFileName}</p> : null}
              <button type="submit" className={styles.secondaryAction} disabled={isArtifactPending}>
                <FileUp size={14} />
                {isArtifactPending ? "업로드 중..." : "첨부 업로드"}
              </button>
            </form>
          </section>

          <section className={styles.block}>
              <div className={styles.blockHeader}>
                <div className={styles.blockHead}>
                  <Sparkles size={15} />
                  <span>Summary</span>
                </div>
                <div className={styles.blockActions}>
                  <span className={styles.statusText}>{renderSummaryState()}</span>
                  <button
                    type="button"
                    className={styles.secondaryAction}
                    onClick={() => setIsSummaryExpanded((current) => !current)}
                  >
                    {isSummaryExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    {isSummaryExpanded ? "접기" : "펼치기"}
                  </button>
                  <button
                    type="button"
                    className={styles.secondaryAction}
                    onClick={() => {
                      setSummaryError(null);
                      setSummary(persistedSummary);
                      setIsSummaryEditing((current) => !current);
                    }}
                  >
                    <Edit3 size={14} />
                    {isSummaryEditing ? "편집 취소" : summary ? "요약 편집" : "요약 작성"}
                  </button>
                  <button
                    type="button"
                    className={styles.secondaryAction}
                    onClick={() => setFocusTarget((current) => (current === "summary" ? null : "summary"))}
                  >
                    <Focus size={14} />
                    {isSummaryFocusMode ? "전체 보기 해제" : "전체 보기"}
                  </button>
                </div>
              </div>
            {isSummaryExpanded ? (
              <>
                <div className={styles.summaryComposer}>
                  <p className={styles.summaryHelper}>
                    NotebookLM이나 다른 도구에서 만든 plain text를 그대로 붙여넣어도 됩니다. `MD로 폴리싱`은 내용을 줄이지 않고 Markdown 구조만 정리하고, `요약 저장`은 현재 편집기 내용을 그대로 저장합니다.
                  </p>
                  {isSummaryEditing ? (
                    <>
                      <textarea
                        placeholder="논문 요약을 붙여넣으세요..."
                        className={`${styles.textarea} ${styles.summaryTextarea}`}
                        value={summary}
                        onChange={(event) => {
                          setSummary(event.target.value);
                          if (summarySaveState === "saved") {
                            setSummarySaveState("idle");
                          }
                        }}
                      />
                      <div className={styles.summaryActions}>
                        <button
                          type="button"
                          className={styles.secondaryAction}
                          disabled={isSummaryPending || !summary.trim()}
                          onClick={() => {
                            setSummaryError(null);
                            startSummaryTransition(async () => {
                              try {
                                setSummarySaveState("saving");
                                const result = await polishMaterialSummary(summary);
                                setSummary(result.aiSummary);
                                setSummarySaveState("idle");
                              } catch (error) {
                                setSummarySaveState("error");
                                setSummaryError(error instanceof Error ? error.message : "Markdown 정리에 실패했습니다.");
                              }
                            });
                          }}
                        >
                          {isSummaryPending ? "정리 중..." : "MD로 폴리싱"}
                        </button>
                        <button
                          type="button"
                          className={styles.secondaryAction}
                          disabled={isSummaryPending || !summary.trim()}
                          onClick={() => {
                            setSummaryError(null);
                            startSummaryTransition(async () => {
                              try {
                                setSummarySaveState("saving");
                                const result = await saveMaterialSummary(material.id, summary);
                                setSummary(result.aiSummary);
                                setPersistedSummary(result.aiSummary);
                                setSummarySaveState("saved");
                                setSummarySavedAt(result.updatedAt);
                                setIsSummaryEditing(false);
                              } catch (error) {
                                setSummarySaveState("error");
                                setSummaryError(error instanceof Error ? error.message : "요약 저장에 실패했습니다.");
                              }
                            });
                          }}
                        >
                          {isSummaryPending ? "저장 중..." : "요약 저장"}
                        </button>
                      </div>
                    </>
                  ) : null}
                </div>
                <div className={styles.summaryPreview}>
                  {summary ? (
                    <ReactMarkdown>{summary}</ReactMarkdown>
                  ) : (
                    <p className={styles.empty}>아직 저장된 요약이 없습니다. 위 입력창에 붙여넣고 저장하면 이 영역에서 바로 확인할 수 있습니다.</p>
                  )}
                  {summaryError ? <p className={styles.errorText}>{summaryError}</p> : null}
                </div>
              </>
            ) : null}
          </section>

          <section className={`${styles.block} ${styles.notes}`}>
            <div className={styles.blockHeader}>
              <div className={styles.blockHead}>
                <Edit3 size={15} />
                <span>My Notes</span>
              </div>
              <span className={styles.statusText}>{renderSaveState()}</span>
            </div>
            <textarea
              placeholder="여기에 개인적인 생각을 기록하세요..."
              className={styles.textarea}
              value={noteContent}
              onChange={(event) => setNoteContent(event.target.value)}
            />
          </section>
        </aside>
      </div>
    </div>
  );
}
