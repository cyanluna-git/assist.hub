"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ExternalLink, Minus, Plus, RotateCcw } from "lucide-react";
import styles from "./document-viewer.module.css";

type PDFDocumentProxy = import("pdfjs-dist/types/src/pdf").PDFDocumentProxy;
type PDFPageProxy = import("pdfjs-dist/types/src/pdf").PDFPageProxy;

type PdfReaderProps = {
  src: string;
  title: string;
  storageKey: string;
};

type ReaderPersistedState = {
  page: number;
  offsetRatio: number;
  fitMode: "fit-width";
  zoomScale: number;
  fingerprint: string | null;
};

type PageMetric = {
  width: number;
  height: number;
};

const STORAGE_PREFIX = "assist-hub:pdf-reader:";
const PAGE_BUFFER = 2;
const DEVICE_SCALE_CAP = 2;
const ZOOM_MIN = 0.75;
const ZOOM_MAX = 2;
const ZOOM_STEP = 0.1;

function getStorageKey(storageKey: string) {
  return `${STORAGE_PREFIX}${storageKey}`;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function buildPageWindow(centerPage: number, totalPages: number) {
  const pages = new Set<number>();

  for (let page = centerPage - PAGE_BUFFER; page <= centerPage + PAGE_BUFFER; page += 1) {
    if (page >= 1 && page <= totalPages) {
      pages.add(page);
    }
  }

  return pages;
}

function readPersistedState(storageKey: string): ReaderPersistedState {
  if (typeof window === "undefined") {
    return { page: 1, offsetRatio: 0, fitMode: "fit-width", zoomScale: 1, fingerprint: null };
  }

  const raw = window.localStorage.getItem(getStorageKey(storageKey));
  if (!raw) {
    return { page: 1, offsetRatio: 0, fitMode: "fit-width", zoomScale: 1, fingerprint: null };
  }

  try {
    const parsed = JSON.parse(raw) as Partial<ReaderPersistedState>;
    return {
      page: Number.isFinite(parsed.page) && parsed.page ? Number(parsed.page) : 1,
      offsetRatio: Number.isFinite(parsed.offsetRatio) ? clamp(Number(parsed.offsetRatio), 0, 1) : 0,
      fitMode: "fit-width",
      zoomScale: Number.isFinite(parsed.zoomScale) ? clamp(Number(parsed.zoomScale), ZOOM_MIN, ZOOM_MAX) : 1,
      fingerprint: typeof parsed.fingerprint === "string" ? parsed.fingerprint : null,
    };
  } catch {
    return { page: 1, offsetRatio: 0, fitMode: "fit-width", zoomScale: 1, fingerprint: null };
  }
}

function writePersistedState(storageKey: string, value: ReaderPersistedState) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(getStorageKey(storageKey), JSON.stringify(value));
}

type PdfCanvasPageProps = {
  pageNumber: number;
  pdfDocument: PDFDocumentProxy | null;
  renderWidth: number;
  estimatedHeight: number;
  shouldRender: boolean;
  getPage: (pageNumber: number) => Promise<PDFPageProxy>;
  onMetric: (pageNumber: number, metric: PageMetric) => void;
};

function PdfCanvasPage({
  pageNumber,
  pdfDocument,
  renderWidth,
  estimatedHeight,
  shouldRender,
  getPage,
  onMetric,
}: PdfCanvasPageProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [renderError, setRenderError] = useState<string | null>(null);

  useEffect(() => {
    if (!pdfDocument || !shouldRender || !renderWidth) {
      return;
    }

    let cancelled = false;
    let renderTask: { cancel?: () => void; promise: Promise<unknown> } | null = null;

    async function renderPage() {
      try {
        setRenderError(null);

        const page = await getPage(pageNumber);
        if (cancelled) {
          return;
        }

        const baseViewport = page.getViewport({ scale: 1 });
        const scale = renderWidth / baseViewport.width;
        const viewport = page.getViewport({ scale });
        const deviceScale =
          typeof window !== "undefined" ? Math.min(window.devicePixelRatio || 1, DEVICE_SCALE_CAP) : 1;
        const renderViewport = page.getViewport({ scale: scale * deviceScale });

        onMetric(pageNumber, {
          width: Math.ceil(viewport.width),
          height: Math.ceil(viewport.height),
        });

        const canvas = canvasRef.current;
        const context = canvas?.getContext("2d");

        if (!canvas || !context) {
          throw new Error("PDF canvas를 준비하지 못했습니다.");
        }

        canvas.width = Math.ceil(renderViewport.width);
        canvas.height = Math.ceil(renderViewport.height);
        canvas.style.width = `${Math.ceil(viewport.width)}px`;
        canvas.style.height = `${Math.ceil(viewport.height)}px`;

        renderTask = page.render({
          canvas,
          canvasContext: context,
          viewport: renderViewport,
        });
        await renderTask.promise;
      } catch (error) {
        if (!cancelled) {
          setRenderError(error instanceof Error ? error.message : "PDF 페이지 렌더링에 실패했습니다.");
        }
      }
    }

    void renderPage();

    return () => {
      cancelled = true;
      renderTask?.cancel?.();
    };
  }, [getPage, onMetric, pageNumber, pdfDocument, renderWidth, shouldRender]);

  return (
    <div className={styles.pdfPageSurface} style={{ minHeight: `${estimatedHeight}px` }}>
      {shouldRender ? (
        renderError ? (
          <div className={styles.pdfPagePlaceholder}>
            <p className={styles.previewFallbackTitle}>페이지를 렌더링하지 못했습니다.</p>
            <p className={styles.previewFallbackText}>{renderError}</p>
          </div>
        ) : (
          <canvas ref={canvasRef} className={styles.pdfCanvas} />
        )
      ) : (
        <div className={styles.pdfPagePlaceholder}>
          <span>페이지 준비 중...</span>
        </div>
      )}
    </div>
  );
}

export default function PdfReader({ src, title, storageKey }: PdfReaderProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const pageJumpInputRef = useRef<HTMLInputElement>(null);
  const pageRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const pageCacheRef = useRef<Map<number, Promise<PDFPageProxy>>>(new Map());
  const hasRestoredRef = useRef(false);
  const scrollFrameRef = useRef<number | null>(null);
  const latestReaderStateRef = useRef<ReaderPersistedState>({
    page: 1,
    offsetRatio: 0,
    fitMode: "fit-width",
    zoomScale: 1,
    fingerprint: null,
  });
  const containerSizeRef = useRef<{ width: number; height: number }>({ width: 0, height: 0 });
  const pendingLayoutRestoreRef = useRef<{ nonce: number; passesLeft: number } | null>(null);

  const [pdfDocument, setPdfDocument] = useState<PDFDocumentProxy | null>(null);
  const [totalPages, setTotalPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [renderWindow, setRenderWindow] = useState<Set<number>>(() => new Set([1, 2, 3]));
  const [pageMetrics, setPageMetrics] = useState<Record<number, PageMetric>>({});
  const [defaultAspectRatio, setDefaultAspectRatio] = useState(1.414);
  const [readerState, setReaderState] = useState<ReaderPersistedState>({
    page: 1,
    offsetRatio: 0,
    fitMode: "fit-width",
    zoomScale: 1,
    fingerprint: null,
  });
  const [baseContentWidth, setBaseContentWidth] = useState(880);
  const [layoutRestoreNonce, setLayoutRestoreNonce] = useState(0);
  const [pageJumpValue, setPageJumpValue] = useState("1");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const getPage = useCallback(
    async (pageNumber: number) => {
      const cached = pageCacheRef.current.get(pageNumber);
      if (cached) {
        return cached;
      }

      if (!pdfDocument) {
        throw new Error("PDF 문서가 아직 준비되지 않았습니다.");
      }

      const next = pdfDocument.getPage(pageNumber);
      pageCacheRef.current.set(pageNumber, next);
      return next;
    },
    [pdfDocument],
  );

  const persistReaderPosition = useCallback(
    (page: number, offsetRatio: number) => {
      setReaderState((current) => {
        const nextState = {
          ...current,
          page,
          offsetRatio: clamp(offsetRatio, 0, 1),
          fitMode: "fit-width" as const,
        };
        writePersistedState(storageKey, nextState);
        return nextState;
      });
    },
    [storageKey],
  );

  useEffect(() => {
    latestReaderStateRef.current = readerState;
  }, [readerState]);

  useEffect(() => {
    setPageJumpValue(String(currentPage));
  }, [currentPage]);

  const scheduleLayoutRestore = useCallback((passesLeft = 3) => {
    pendingLayoutRestoreRef.current = {
      nonce: Date.now(),
      passesLeft,
    };
    setLayoutRestoreNonce((current) => current + 1);
  }, []);

  const jumpToPage = useCallback(
    (requestedPage: number, offsetRatio = 0) => {
      if (!totalPages) {
        return;
      }

      const nextPage = clamp(Math.round(requestedPage), 1, totalPages);
      const nextOffset = clamp(offsetRatio, 0, 1);
      const container = containerRef.current;
      const targetNode = pageRefs.current[nextPage];

      setCurrentPage(nextPage);
      setRenderWindow(buildPageWindow(nextPage, totalPages));
      persistReaderPosition(nextPage, nextOffset);

      if (container && targetNode) {
        container.scrollTop = targetNode.offsetTop + targetNode.offsetHeight * nextOffset;
      } else {
        scheduleLayoutRestore(2);
      }
    },
    [persistReaderPosition, scheduleLayoutRestore, totalPages],
  );

  const applyZoomScale = useCallback(
    (nextZoomScale: number) => {
      const normalizedZoom = clamp(Number(nextZoomScale.toFixed(2)), ZOOM_MIN, ZOOM_MAX);

      setReaderState((current) => {
        const nextState = {
          ...current,
          zoomScale: normalizedZoom,
          fitMode: "fit-width" as const,
        };
        writePersistedState(storageKey, nextState);
        return nextState;
      });

      scheduleLayoutRestore(4);
    },
    [scheduleLayoutRestore, storageKey],
  );

  const recalculateViewportState = useCallback(() => {
    const container = containerRef.current;
    if (!container || !totalPages) {
      return;
    }

    const viewportTop = container.scrollTop;
    const viewportBottom = viewportTop + container.clientHeight;
    const viewportCenter = viewportTop + container.clientHeight / 2;
    const bufferedTop = viewportTop - container.clientHeight;
    const bufferedBottom = viewportBottom + container.clientHeight;

    let nextCurrentPage = currentPage;
    let bestDistance = Number.POSITIVE_INFINITY;
    const nextWindow = new Set<number>();

    for (let pageNumber = 1; pageNumber <= totalPages; pageNumber += 1) {
      const node = pageRefs.current[pageNumber];
      if (!node) {
        continue;
      }

      const pageTop = node.offsetTop;
      const pageBottom = pageTop + node.offsetHeight;
      const pageCenter = pageTop + node.offsetHeight / 2;

      if (pageBottom >= bufferedTop && pageTop <= bufferedBottom) {
        nextWindow.add(pageNumber);
      }

      const distance = Math.abs(pageCenter - viewportCenter);
      if (distance < bestDistance) {
        bestDistance = distance;
        nextCurrentPage = pageNumber;
      }
    }

    if (!nextWindow.size) {
      for (const pageNumber of buildPageWindow(nextCurrentPage, totalPages)) {
        nextWindow.add(pageNumber);
      }
    } else {
      const bufferedPages = buildPageWindow(nextCurrentPage, totalPages);
      for (const pageNumber of bufferedPages) {
        nextWindow.add(pageNumber);
      }
    }

    setRenderWindow(nextWindow);
    setCurrentPage(nextCurrentPage);

    const currentNode = pageRefs.current[nextCurrentPage];
    if (currentNode) {
      const offsetRatio = (viewportTop - currentNode.offsetTop) / Math.max(currentNode.offsetHeight, 1);
      persistReaderPosition(nextCurrentPage, offsetRatio);
    }
  }, [currentPage, persistReaderPosition, totalPages]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) {
        return;
      }

      const nextWidth = Math.floor(entry.contentRect.width);
      const nextHeight = Math.floor(entry.contentRect.height);
      const previous = containerSizeRef.current;
      const hasSizeChanged = previous.width !== nextWidth || previous.height !== nextHeight;

      containerSizeRef.current = { width: nextWidth, height: nextHeight };
      setBaseContentWidth(Math.max(Math.floor(entry.contentRect.width) - 40, 320));

      if (hasRestoredRef.current && hasSizeChanged) {
        pendingLayoutRestoreRef.current = {
          nonce: Date.now(),
          passesLeft: 3,
        };
        setLayoutRestoreNonce((current) => current + 1);
      }
    });

    observer.observe(container);
    return () => {
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadPdf() {
      try {
        setIsLoading(true);
        setError(null);
        pageCacheRef.current.clear();
        hasRestoredRef.current = false;

        const persisted = readPersistedState(storageKey);
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();

        const loadingTask = pdfjs.getDocument(src);
        const documentProxy = await loadingTask.promise;
        const fingerprint = documentProxy.fingerprints?.[0] ?? null;
        const effectivePersisted =
          persisted.fingerprint && fingerprint && persisted.fingerprint !== fingerprint
            ? { page: 1, offsetRatio: 0, fitMode: "fit-width" as const, zoomScale: 1, fingerprint }
            : { ...persisted, fingerprint };

        const firstPage = await documentProxy.getPage(effectivePersisted.page || 1);
        const firstViewport = firstPage.getViewport({ scale: 1 });

        if (cancelled) {
          return;
        }

        pageCacheRef.current.set(firstPage.pageNumber, Promise.resolve(firstPage));
        setPdfDocument(documentProxy);
        setTotalPages(documentProxy.numPages);
        setDefaultAspectRatio(firstViewport.height / firstViewport.width);
        setReaderState(effectivePersisted);
        setCurrentPage(clamp(effectivePersisted.page, 1, documentProxy.numPages));
        setRenderWindow(buildPageWindow(clamp(effectivePersisted.page, 1, documentProxy.numPages), documentProxy.numPages));
        writePersistedState(storageKey, effectivePersisted);
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "PDF를 불러오지 못했습니다.");
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void loadPdf();

    return () => {
      cancelled = true;
    };
  }, [src, storageKey]);

  useEffect(() => {
    if (!totalPages || hasRestoredRef.current) {
      return;
    }

    const container = containerRef.current;
    const targetNode = pageRefs.current[readerState.page];
    if (!container || !targetNode) {
      return;
    }

    container.scrollTop = targetNode.offsetTop + targetNode.offsetHeight * readerState.offsetRatio;
    hasRestoredRef.current = true;
    recalculateViewportState();
  }, [readerState, recalculateViewportState, totalPages, pageMetrics, baseContentWidth]);

  useEffect(() => {
    if (!totalPages || !hasRestoredRef.current) {
      return;
    }

    const pending = pendingLayoutRestoreRef.current;
    if (!pending || pending.passesLeft <= 0) {
      return;
    }

    const container = containerRef.current;
    const targetState = latestReaderStateRef.current;
    const targetNode = pageRefs.current[targetState.page];

    if (!container || !targetNode) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      const refreshedTargetNode = pageRefs.current[targetState.page];
      if (!refreshedTargetNode) {
        return;
      }

      container.scrollTop =
        refreshedTargetNode.offsetTop + refreshedTargetNode.offsetHeight * targetState.offsetRatio;
      pending.passesLeft -= 1;

      if (pending.passesLeft > 0) {
        setLayoutRestoreNonce((current) => current + 1);
      } else {
        pendingLayoutRestoreRef.current = null;
      }

      recalculateViewportState();
    });

    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [baseContentWidth, layoutRestoreNonce, pageMetrics, recalculateViewportState, totalPages]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !totalPages) {
      return;
    }

    const handleScroll = () => {
      if (scrollFrameRef.current) {
        window.cancelAnimationFrame(scrollFrameRef.current);
      }

      scrollFrameRef.current = window.requestAnimationFrame(() => {
        recalculateViewportState();
      });
    };

    container.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      container.removeEventListener("scroll", handleScroll);
      if (scrollFrameRef.current) {
        window.cancelAnimationFrame(scrollFrameRef.current);
      }
    };
  }, [recalculateViewportState, totalPages]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      ) {
        return;
      }

      if (event.key === "+" || event.key === "=") {
        event.preventDefault();
        applyZoomScale(readerState.zoomScale + ZOOM_STEP);
        return;
      }

      if (event.key === "-") {
        event.preventDefault();
        applyZoomScale(readerState.zoomScale - ZOOM_STEP);
        return;
      }

      if (event.key === "0") {
        event.preventDefault();
        applyZoomScale(1);
        return;
      }

      if (event.key === "PageDown" || event.key.toLowerCase() === "n") {
        event.preventDefault();
        jumpToPage(currentPage + 1, 0);
        return;
      }

      if (event.key === "PageUp" || event.key.toLowerCase() === "p") {
        event.preventDefault();
        jumpToPage(currentPage - 1, 0);
        return;
      }

      if (event.key === "ArrowDown" || event.key.toLowerCase() === "j") {
        event.preventDefault();
        container.scrollBy({ top: 96, behavior: "smooth" });
        return;
      }

      if (event.key === "ArrowUp" || event.key.toLowerCase() === "k") {
        event.preventDefault();
        container.scrollBy({ top: -96, behavior: "smooth" });
        return;
      }
    };

    container.addEventListener("keydown", handleKeyDown);
    return () => {
      container.removeEventListener("keydown", handleKeyDown);
    };
  }, [applyZoomScale, currentPage, jumpToPage, readerState.zoomScale]);

  const pageNumbers = useMemo(
    () => Array.from({ length: totalPages }, (_, index) => index + 1),
    [totalPages],
  );
  const renderWidth = Math.max(Math.round(baseContentWidth * readerState.zoomScale), 320);
  const scrubberValue = totalPages ? currentPage : 1;

  if (error) {
    return (
      <div className={styles.pdfReaderShell}>
        <div className={styles.pdfReaderState}>
          <div className={styles.pdfReaderErrorCard}>
            <p className={styles.previewFallbackTitle}>PDF를 불러오지 못했습니다.</p>
            <p className={styles.previewFallbackText}>{error}</p>
            <a href={src} target="_blank" rel="noreferrer" className={styles.secondaryAction}>
              <ExternalLink size={14} />
              브라우저 PDF로 열기
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={styles.pdfReaderShell}
      tabIndex={0}
      onMouseDown={(event) => {
        const target = event.target as HTMLElement | null;
        if (target?.closest("button, a, input, textarea, select, label")) {
          return;
        }
        containerRef.current?.focus();
      }}
    >
      <div className={styles.pdfReaderHeader}>
        <div className={styles.pdfReaderHeaderMeta}>
          <span className={styles.pdfReaderHeaderTitle}>{title}</span>
          <span>{totalPages ? `${currentPage} / ${totalPages} 페이지` : "PDF 준비 중"}</span>
        </div>
        <div className={styles.pdfReaderHeaderActions}>
          <div className={styles.pdfReaderToolbar}>
            <button
              type="button"
              className={styles.secondaryAction}
              onClick={() => applyZoomScale(readerState.zoomScale - ZOOM_STEP)}
              disabled={isLoading || readerState.zoomScale <= ZOOM_MIN}
              title="축소 (-)"
            >
              <Minus size={14} />
            </button>
            <span className={styles.pdfReaderZoomValue}>{Math.round(readerState.zoomScale * 100)}%</span>
            <button
              type="button"
              className={styles.secondaryAction}
              onClick={() => applyZoomScale(readerState.zoomScale + ZOOM_STEP)}
              disabled={isLoading || readerState.zoomScale >= ZOOM_MAX}
              title="확대 (+)"
            >
              <Plus size={14} />
            </button>
            <button
              type="button"
              className={styles.secondaryAction}
              onClick={() => applyZoomScale(1)}
              disabled={isLoading || Math.abs(readerState.zoomScale - 1) < 0.01}
              title="100%로 재설정 (0)"
            >
              <RotateCcw size={14} />
              100%
            </button>
          </div>
          <form
            className={styles.pdfReaderPageJump}
            onSubmit={(event) => {
              event.preventDefault();
              jumpToPage(Number(pageJumpValue || currentPage), 0);
              pageJumpInputRef.current?.blur();
            }}
          >
            <input
              ref={pageJumpInputRef}
              type="number"
              min={1}
              max={Math.max(totalPages, 1)}
              className={styles.pdfReaderPageInput}
              value={pageJumpValue}
              onChange={(event) => setPageJumpValue(event.target.value)}
              aria-label="페이지 이동"
            />
            <button type="submit" className={styles.secondaryAction} disabled={isLoading || !totalPages}>
              이동
            </button>
          </form>
          <a href={src} target="_blank" rel="noreferrer" className={styles.secondaryAction}>
            <ExternalLink size={14} />
            브라우저로 열기
          </a>
        </div>
      </div>

      {isLoading ? (
        <div className={styles.pdfReaderState}>
          <p className={styles.previewLoading}>PDF를 준비하는 중...</p>
        </div>
      ) : (
        <>
          <div className={styles.pdfReaderScrubber}>
            <input
              type="range"
              min={1}
              max={Math.max(totalPages, 1)}
              step={1}
              value={scrubberValue}
              className={styles.pdfReaderScrubberInput}
              onChange={(event) => jumpToPage(Number(event.target.value), 0)}
              aria-label="페이지 스크러버"
            />
            <div className={styles.pdfReaderShortcutHint}>
              <span>`+ / - / 0` 확대</span>
              <span>`j / k` 스크롤</span>
              <span>`n / p` 페이지 이동</span>
            </div>
          </div>
          <div className={styles.pdfReaderPages}>
            {pageNumbers.map((pageNumber) => {
              const metric = pageMetrics[pageNumber];
              const estimatedHeight = Math.ceil((metric?.height ?? renderWidth * defaultAspectRatio));

              return (
                <div
                  key={pageNumber}
                  ref={(node) => {
                    pageRefs.current[pageNumber] = node;
                  }}
                  data-page-number={pageNumber}
                  className={styles.pdfPage}
                >
                  <div className={styles.pdfPageLabel}>Page {pageNumber}</div>
                  <PdfCanvasPage
                    pageNumber={pageNumber}
                    pdfDocument={pdfDocument}
                    renderWidth={renderWidth}
                    estimatedHeight={estimatedHeight}
                    shouldRender={renderWindow.has(pageNumber)}
                    getPage={getPage}
                    onMetric={(nextPageNumber, nextMetric) => {
                      setPageMetrics((current) => {
                        const existing = current[nextPageNumber];
                        if (
                          existing &&
                          existing.width === nextMetric.width &&
                          existing.height === nextMetric.height
                        ) {
                          return current;
                        }

                        return {
                          ...current,
                          [nextPageNumber]: nextMetric,
                        };
                      });
                    }}
                  />
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
