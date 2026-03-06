"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import type { Material, Note } from "@prisma/client";
import { Edit3, Focus, Maximize2, Minimize2, Sparkles, X } from "lucide-react";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import { generateMaterialSummary, saveMaterialNote } from "./actions";
import styles from "./document-viewer.module.css";

type ViewerMaterial = Material & { notes: Note[] };

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
