"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ExternalLink } from "lucide-react";
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
  fingerprint: string | null;
};

type PageMetric = {
  width: number;
  height: number;
};

const STORAGE_PREFIX = "assist-hub:pdf-reader:";
const PAGE_BUFFER = 2;
const DEVICE_SCALE_CAP = 2;

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
    return { page: 1, offsetRatio: 0, fitMode: "fit-width", fingerprint: null };
  }

  const raw = window.localStorage.getItem(getStorageKey(storageKey));
  if (!raw) {
    return { page: 1, offsetRatio: 0, fitMode: "fit-width", fingerprint: null };
  }

  try {
    const parsed = JSON.parse(raw) as Partial<ReaderPersistedState>;
    return {
      page: Number.isFinite(parsed.page) && parsed.page ? Number(parsed.page) : 1,
      offsetRatio: Number.isFinite(parsed.offsetRatio) ? clamp(Number(parsed.offsetRatio), 0, 1) : 0,
      fitMode: "fit-width",
      fingerprint: typeof parsed.fingerprint === "string" ? parsed.fingerprint : null,
    };
  } catch {
    return { page: 1, offsetRatio: 0, fitMode: "fit-width", fingerprint: null };
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
  const pageRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const pageCacheRef = useRef<Map<number, Promise<PDFPageProxy>>>(new Map());
  const hasRestoredRef = useRef(false);
  const scrollFrameRef = useRef<number | null>(null);

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
    fingerprint: null,
  });
  const [contentWidth, setContentWidth] = useState(880);
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
      const nextState = {
        page,
        offsetRatio: clamp(offsetRatio, 0, 1),
        fitMode: "fit-width" as const,
        fingerprint: readerState.fingerprint,
      };
      setReaderState(nextState);
      writePersistedState(storageKey, nextState);
    },
    [readerState.fingerprint, storageKey],
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

      setContentWidth(Math.max(Math.floor(entry.contentRect.width) - 40, 320));
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
            ? { page: 1, offsetRatio: 0, fitMode: "fit-width" as const, fingerprint }
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
  }, [readerState, recalculateViewportState, totalPages, pageMetrics, contentWidth]);

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

  const pageNumbers = useMemo(
    () => Array.from({ length: totalPages }, (_, index) => index + 1),
    [totalPages],
  );

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
    <div ref={containerRef} className={styles.pdfReaderShell}>
      <div className={styles.pdfReaderHeader}>
        <div className={styles.pdfReaderHeaderMeta}>
          <span className={styles.pdfReaderHeaderTitle}>{title}</span>
          <span>{totalPages ? `${currentPage} / ${totalPages} 페이지` : "PDF 준비 중"}</span>
        </div>
        <div className={styles.pdfReaderHeaderActions}>
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
        <div className={styles.pdfReaderPages}>
          {pageNumbers.map((pageNumber) => {
            const metric = pageMetrics[pageNumber];
            const estimatedHeight = Math.ceil((metric?.height ?? contentWidth * defaultAspectRatio));

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
                  renderWidth={contentWidth}
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
      )}
    </div>
  );
}
