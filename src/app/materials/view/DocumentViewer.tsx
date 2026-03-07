"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import type { Material, MaterialArtifact, Note } from "@prisma/client";
import { Download, Edit3, FileUp, Focus, Headphones, ImageIcon, Maximize2, Minimize2, Sparkles, Trash2, X } from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import ReactMarkdown from "react-markdown";
import {
  MATERIAL_ARTIFACT_UPLOAD_DEFINITIONS,
  canPreviewMaterialArtifact,
  getMaterialArtifactAccept,
  getMaterialArtifactDefinition,
  getMaterialArtifactLabel,
  getMaterialArtifactPreviewKind,
  type MaterialArtifactType,
} from "@/lib/material-artifacts";
import { deleteMaterialArtifact, saveMaterialNote, saveMaterialSummary, uploadMaterialArtifact } from "./actions";
import styles from "./document-viewer.module.css";

type ViewerMaterial = Material & { notes: Note[]; artifacts: MaterialArtifact[] };

interface DocumentViewerProps {
  material: ViewerMaterial;
  mdContent?: string;
}

export default function DocumentViewer({ material, mdContent }: DocumentViewerProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const saveVersionRef = useRef(0);
  const [focusTarget, setFocusTarget] = useState<"document" | "summary" | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [summary, setSummary] = useState(material.notes?.[0]?.aiSummary || "");
  const [persistedSummary, setPersistedSummary] = useState(material.notes?.[0]?.aiSummary || "");
  const [isSummaryEditing, setIsSummaryEditing] = useState(!material.notes?.[0]?.aiSummary);
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
  const [selectedArtifactId, setSelectedArtifactId] = useState<string | null>(material.artifacts?.[0]?.id ?? null);
  const [artifactError, setArtifactError] = useState<string | null>(null);
  const [artifactNotice, setArtifactNotice] = useState<string | null>(null);
  const [artifactPreviewText, setArtifactPreviewText] = useState("");
  const [artifactPreviewError, setArtifactPreviewError] = useState<string | null>(null);
  const [isArtifactPreviewLoading, setIsArtifactPreviewLoading] = useState(false);
  const [isArtifactPending, startArtifactTransition] = useTransition();
  const isDirty = noteContent !== persistedNoteContent;
  const isSummaryDirty = summary !== persistedSummary;
  const isDocumentFocusMode = focusTarget === "document";
  const isSummaryFocusMode = focusTarget === "summary";
  const isAnyFocusMode = focusTarget !== null;
  const selectedArtifactDefinition = getMaterialArtifactDefinition(artifactType);
  const selectedArtifact = useMemo(
    () => artifacts.find((artifact) => artifact.id === selectedArtifactId) ?? artifacts[0] ?? null,
    [artifacts, selectedArtifactId],
  );
  const selectedPreviewKind = selectedArtifact
    ? getMaterialArtifactPreviewKind(selectedArtifact.artifactType as MaterialArtifactType, selectedArtifact.publicUrl)
    : null;

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
    if (!artifacts.length) {
      setSelectedArtifactId(null);
      return;
    }

    if (!selectedArtifactId || !artifacts.some((artifact) => artifact.id === selectedArtifactId)) {
      setSelectedArtifactId(artifacts[0].id);
    }
  }, [artifacts, selectedArtifactId]);

  useEffect(() => {
    if (!selectedArtifact?.publicUrl || selectedPreviewKind !== "text") {
      setArtifactPreviewText("");
      setArtifactPreviewError(null);
      setIsArtifactPreviewLoading(false);
      return;
    }

    const previewUrl = selectedArtifact.publicUrl;
    let cancelled = false;

    async function loadPreviewText() {
      try {
        setIsArtifactPreviewLoading(true);
        setArtifactPreviewError(null);
        const response = await fetch(previewUrl, { cache: "no-store" });

        if (!response.ok) {
          throw new Error("텍스트 preview를 불러오지 못했습니다.");
        }

        const text = await response.text();
        if (!cancelled) {
          setArtifactPreviewText(text);
        }
      } catch (error) {
        if (!cancelled) {
          setArtifactPreviewError(error instanceof Error ? error.message : "텍스트 preview를 불러오지 못했습니다.");
          setArtifactPreviewText("");
        }
      } finally {
        if (!cancelled) {
          setIsArtifactPreviewLoading(false);
        }
      }
    }

    void loadPreviewText();

    return () => {
      cancelled = true;
    };
  }, [selectedArtifact?.id, selectedArtifact?.publicUrl, selectedPreviewKind]);

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

  function renderArtifactPreview() {
    if (!selectedArtifact) {
      return (
        <div className={styles.previewEmpty}>
          <p className={styles.empty}>미리볼 artifact를 아직 선택하지 않았습니다.</p>
        </div>
      );
    }

    const label = getMaterialArtifactLabel(selectedArtifact.artifactType as MaterialArtifactType);

    if (!selectedArtifact.publicUrl) {
      return (
        <div className={styles.previewFallback}>
          <p className={styles.previewFallbackTitle}>{label} 파일 경로를 찾지 못했습니다.</p>
          <p className={styles.previewFallbackText}>이 첨부는 다시 업로드하는 편이 안전합니다.</p>
        </div>
      );
    }

    switch (selectedPreviewKind) {
      case "image":
        return (
          <div className={styles.previewImageWrap}>
            <Image src={selectedArtifact.publicUrl} alt={label} width={1600} height={1200} className={styles.previewImage} />
          </div>
        );
      case "pdf":
        return (
          <iframe
            src={`${selectedArtifact.publicUrl}#toolbar=0&navpanes=0`}
            className={styles.previewFrame}
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
              <source src={selectedArtifact.publicUrl} />
            </audio>
          </div>
        );
      case "text":
        if (isArtifactPreviewLoading) {
          return <p className={styles.previewLoading}>문서를 불러오는 중...</p>;
        }

        if (artifactPreviewError) {
          return (
            <div className={styles.previewFallback}>
              <p className={styles.previewFallbackTitle}>텍스트 preview를 불러오지 못했습니다.</p>
              <p className={styles.previewFallbackText}>{artifactPreviewError}</p>
            </div>
          );
        }

        return (
          <div className={styles.previewMarkdown}>
            <ReactMarkdown>{artifactPreviewText}</ReactMarkdown>
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
              <a href={selectedArtifact.publicUrl} target="_blank" rel="noreferrer" className={styles.secondaryAction}>
                <Download size={14} />
                열기
              </a>
              <a href={selectedArtifact.publicUrl} download className={styles.secondaryAction}>
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
          ) : material.type === "pdf" ? (
            <iframe src={`${material.localUrl}#toolbar=0`} className={styles.pdf} title={material.title} />
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
              {selectedArtifact ? (
                <div className={styles.previewPanel}>
                  <div className={styles.previewHeader}>
                    <div className={styles.previewTitleWrap}>
                      {selectedPreviewKind === "image" ? <ImageIcon size={15} /> : <FileUp size={15} />}
                      <span className={styles.previewTitle}>
                        {getMaterialArtifactLabel(selectedArtifact.artifactType as MaterialArtifactType)}
                      </span>
                    </div>
                    <span className={styles.previewStatus}>
                      {canPreviewMaterialArtifact(
                        selectedArtifact.artifactType as MaterialArtifactType,
                        selectedArtifact.publicUrl,
                      )
                        ? "페이지 안에서 미리보기"
                        : "파일로 열기"}
                    </span>
                  </div>
                  <div className={styles.previewStage}>{renderArtifactPreview()}</div>
                </div>
              ) : null}
              {artifacts.length ? (
                artifacts.map((artifact) => (
                  <button
                    key={artifact.id}
                    type="button"
                    className={`${styles.artifactRow} ${selectedArtifact?.id === artifact.id ? styles.artifactRowActive : ""}`}
                    onClick={() => setSelectedArtifactId(artifact.id)}
                  >
                    <div className={styles.artifactMeta}>
                      <div className={styles.artifactBadges}>
                        <span className={styles.artifactTypeBadge}>
                          {getMaterialArtifactLabel(artifact.artifactType as MaterialArtifactType)}
                        </span>
                        <span className={styles.artifactStatusBadge}>{artifact.status}</span>
                      </div>
                      <p className={styles.artifactPath}>
                        {artifact.generatedAt ? `업데이트 ${new Date(artifact.generatedAt).toLocaleString()}` : "업로드됨"}
                      </p>
                    </div>
                    {artifact.publicUrl ? (
                      <div
                        className={styles.artifactActions}
                        onClick={(event) => event.stopPropagation()}
                      >
                        <a
                          href={artifact.publicUrl}
                          target="_blank"
                          rel="noreferrer"
                          className={styles.secondaryAction}
                        >
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
                            const confirmed = window.confirm(
                              `${getMaterialArtifactLabel(artifact.artifactType as MaterialArtifactType)} 첨부를 삭제할까요?`,
                            );
                            if (!confirmed) {
                              return;
                            }

                            setArtifactError(null);
                            setArtifactNotice(null);
                            startArtifactTransition(async () => {
                              try {
                                await deleteMaterialArtifact(artifact.id);
                                const nextArtifact = artifacts.find((item) => item.id !== artifact.id) ?? null;
                                setArtifacts((current) => current.filter((item) => item.id !== artifact.id));
                                if (selectedArtifactId === artifact.id) {
                                  setSelectedArtifactId(nextArtifact?.id ?? null);
                                }
                                setArtifactNotice(
                                  `${getMaterialArtifactLabel(artifact.artifactType as MaterialArtifactType)} 첨부를 삭제했습니다.`,
                                );
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
                  </button>
                ))
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
                    setSelectedArtifactId(result.artifactId);
                    setArtifactNotice(
                      `${getMaterialArtifactLabel(result.artifactType as MaterialArtifactType)} 첨부가 저장되었습니다.`,
                    );
                    form.reset();
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
                  accept={getMaterialArtifactAccept(artifactType)}
                />
              </label>
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
                    {isSummaryFocusMode ? "집중 읽기 해제" : "요약 집중 읽기"}
                  </button>
                </div>
              </div>
            <div className={styles.summaryComposer}>
              <p className={styles.summaryHelper}>
                NotebookLM이나 다른 도구에서 만든 요약을 여기 붙여넣고 저장하세요. Markdown 형식으로 정리해 넣으면 아래에서 그대로 렌더링됩니다.
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
                            const result = await saveMaterialSummary(material.id, summary);
                            setPersistedSummary(summary);
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
