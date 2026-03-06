"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import type { Material, MaterialArtifact, Note } from "@prisma/client";
import { Download, Edit3, FileUp, Focus, Maximize2, Minimize2, Sparkles, X } from "lucide-react";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import { generateMaterialSummary, saveMaterialNote, uploadMaterialArtifact } from "./actions";
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
  const [isFocusMode, setIsFocusMode] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [summary, setSummary] = useState(material.notes?.[0]?.aiSummary || "");
  const [noteContent, setNoteContent] = useState(material.notes?.[0]?.content || "");
  const [persistedNoteContent, setPersistedNoteContent] = useState(material.notes?.[0]?.content || "");
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [summaryMeta, setSummaryMeta] = useState<{ model: string; reasoningEffort: string } | null>(null);
  const [isSummaryPending, startSummaryTransition] = useTransition();
  const [artifacts, setArtifacts] = useState(material.artifacts || []);
  const [artifactType, setArtifactType] = useState<"NOTEBOOKLM_SUMMARY" | "SLIDES" | "INFOGRAPHIC">("NOTEBOOKLM_SUMMARY");
  const [artifactError, setArtifactError] = useState<string | null>(null);
  const [artifactNotice, setArtifactNotice] = useState<string | null>(null);
  const [isArtifactPending, startArtifactTransition] = useTransition();
  const isDirty = noteContent !== persistedNoteContent;

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

  function renderSaveState() {
    if (isDirty && saveState !== "saving") return "입력 중...";
    if (saveState === "saving") return "저장 중...";
    if (saveState === "saved" && lastSavedAt) {
      return `저장됨 · ${new Date(lastSavedAt).toLocaleTimeString()}`;
    }
    if (saveState === "error") return "저장 실패";
    return "자동 저장";
  }

  function getArtifactLabel(type: string) {
    switch (type) {
      case "NOTEBOOKLM_SUMMARY":
        return "요약";
      case "SLIDES":
        return "슬라이드";
      case "INFOGRAPHIC":
        return "인포그래픽";
      default:
        return type;
    }
  }

  function getArtifactAccept(type: string) {
    switch (type) {
      case "NOTEBOOKLM_SUMMARY":
        return ".md,.txt,.pdf";
      case "SLIDES":
        return ".pdf,.ppt,.pptx,.key";
      case "INFOGRAPHIC":
        return ".png,.jpg,.jpeg,.webp,.svg,.pdf";
      default:
        return undefined;
    }
  }

  return (
    <div ref={rootRef} className={`${styles.layout} ${isFocusMode ? styles.focusLayout : ""}`}>
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
            aria-pressed={isFocusMode}
            onClick={() => setIsFocusMode((prev) => !prev)}
          >
            <Focus size={16} />
            <span>{isFocusMode ? "집중 모드 해제" : "집중 모드"}</span>
          </button>

          <Link href="/materials" className={styles.close} aria-label="Close viewer">
            <X size={18} />
          </Link>
        </div>
      </header>

      <div className={styles.split}>
        <div className={styles.docPane}>
          {material.type === "pdf" ? (
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
              {artifacts.length ? (
                artifacts.map((artifact) => (
                  <div key={artifact.id} className={styles.artifactRow}>
                    <div className={styles.artifactMeta}>
                      <div className={styles.artifactBadges}>
                        <span className={styles.artifactTypeBadge}>{getArtifactLabel(artifact.artifactType)}</span>
                        <span className={styles.artifactStatusBadge}>{artifact.status}</span>
                      </div>
                      <p className={styles.artifactPath}>
                        {artifact.generatedAt ? `업데이트 ${new Date(artifact.generatedAt).toLocaleString()}` : "업로드됨"}
                      </p>
                    </div>
                    {artifact.publicUrl ? (
                      <div className={styles.artifactActions}>
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
                      </div>
                    ) : null}
                  </div>
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
                    setArtifactNotice(`${getArtifactLabel(result.artifactType)} 첨부가 저장되었습니다.`);
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
                  onChange={(event) =>
                    setArtifactType(event.target.value as "NOTEBOOKLM_SUMMARY" | "SLIDES" | "INFOGRAPHIC")
                  }
                >
                  <option value="NOTEBOOKLM_SUMMARY">요약</option>
                  <option value="SLIDES">슬라이드</option>
                  <option value="INFOGRAPHIC">인포그래픽</option>
                </select>
              </label>
              <label className={styles.fieldLabel}>
                File
                <input name="file" type="file" className={styles.fileInput} accept={getArtifactAccept(artifactType)} />
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
                <span>AI Summary</span>
              </div>
              <button
                type="button"
                className={styles.secondaryAction}
                disabled={isSummaryPending}
                onClick={() => {
                  setSummaryError(null);
                  startSummaryTransition(async () => {
                    try {
                      const result = await generateMaterialSummary(material.id);
                      setSummary(result.aiSummary);
                      setSummaryMeta({
                        model: result.model,
                        reasoningEffort: result.reasoningEffort,
                      });
                    } catch {
                      setSummaryError("Codex CLI 요약 생성에 실패했습니다.");
                    }
                  });
                }}
              >
                {isSummaryPending ? "생성 중..." : summary ? "요약 다시 생성" : "요약 생성"}
              </button>
            </div>
            <div className={styles.summary}>
              {summary ? (
                <ReactMarkdown>{summary}</ReactMarkdown>
              ) : (
                <p className={styles.empty}>아직 요약이 없습니다. 버튼을 누르면 Codex CLI가 한국어 요약을 생성합니다.</p>
              )}
              {summaryMeta ? (
                <p className={styles.metaText}>
                  {summaryMeta.model} · {summaryMeta.reasoningEffort}
                </p>
              ) : null}
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
