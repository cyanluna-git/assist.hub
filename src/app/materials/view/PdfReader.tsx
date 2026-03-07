"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import styles from "./document-viewer.module.css";

type PdfPageState = {
  pageNumber: number;
  width: number;
  height: number;
  imageDataUrl: string;
};

type PdfReaderProps = {
  src: string;
  title: string;
  storageKey: string;
};

const STORAGE_PREFIX = "assist-hub:pdf-last-page:";

function getStorageKey(storageKey: string) {
  return `${STORAGE_PREFIX}${storageKey}`;
}

export default function PdfReader({ src, title, storageKey }: PdfReaderProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const pageRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const [pages, setPages] = useState<PdfPageState[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const persistedPage = useMemo(() => {
    if (typeof window === "undefined") {
      return 1;
    }

    const raw = window.localStorage.getItem(getStorageKey(storageKey));
    const parsed = raw ? Number(raw) : 1;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
  }, [storageKey]);

  useEffect(() => {
    let cancelled = false;

    async function loadPdf() {
      try {
        setIsLoading(true);
        setError(null);

        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();

        const loadingTask = pdfjs.getDocument(src);
        const pdf = await loadingTask.promise;
        const nextPages: PdfPageState[] = [];
        const deviceScale = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
        const containerWidth = Math.max((containerRef.current?.clientWidth ?? 880) - 40, 320);

        for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
          const page = await pdf.getPage(pageNumber);
          const baseViewport = page.getViewport({ scale: 1 });
          const scale = containerWidth / baseViewport.width;
          const viewport = page.getViewport({ scale });
          const renderViewport = page.getViewport({ scale: scale * deviceScale });

          const canvas = document.createElement("canvas");
          const context = canvas.getContext("2d");

          if (!context) {
            throw new Error("PDF canvas context를 만들 수 없습니다.");
          }

          canvas.width = Math.ceil(renderViewport.width);
          canvas.height = Math.ceil(renderViewport.height);
          canvas.style.width = `${Math.ceil(viewport.width)}px`;
          canvas.style.height = `${Math.ceil(viewport.height)}px`;

          await page.render({
            canvas,
            canvasContext: context,
            viewport: renderViewport,
          }).promise;

          nextPages.push({
            pageNumber,
            width: Math.ceil(viewport.width),
            height: Math.ceil(viewport.height),
            imageDataUrl: canvas.toDataURL("image/png"),
          });
        }

        if (cancelled) {
          return;
        }

        setPages(nextPages);
        setCurrentPage(Math.min(persistedPage, nextPages.length || 1));
      } catch (loadError) {
        if (cancelled) {
          return;
        }

        setError(loadError instanceof Error ? loadError.message : "PDF를 불러오지 못했습니다.");
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
  }, [persistedPage, src]);

  useEffect(() => {
    if (!pages.length) {
      return;
    }

    const target = pageRefs.current[currentPage];
    if (!target) {
      return;
    }

    target.scrollIntoView({ block: "start", inline: "nearest" });
  }, [currentPage, pages]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !pages.length) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((left, right) => right.intersectionRatio - left.intersectionRatio)[0];

        if (!visible) {
          return;
        }

        const pageNumber = Number(visible.target.getAttribute("data-page-number"));
        if (!Number.isFinite(pageNumber)) {
          return;
        }

        setCurrentPage(pageNumber);
        window.localStorage.setItem(getStorageKey(storageKey), String(pageNumber));
      },
      {
        root: container,
        threshold: [0.55, 0.7, 0.85],
      },
    );

    for (const page of pages) {
      const node = pageRefs.current[page.pageNumber];
      if (node) {
        observer.observe(node);
      }
    }

    return () => {
      observer.disconnect();
    };
  }, [pages, storageKey]);

  if (error) {
    return (
      <div className={styles.pdfReaderShell}>
        <div className={styles.pdfReaderState}>
          <p className={styles.previewFallbackTitle}>PDF를 불러오지 못했습니다.</p>
          <p className={styles.previewFallbackText}>{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className={styles.pdfReaderShell}>
      <div className={styles.pdfReaderHeader}>
        <span>{title}</span>
        <span>{pages.length ? `${currentPage} / ${pages.length} 페이지` : "PDF 준비 중"}</span>
      </div>
      {isLoading ? (
        <div className={styles.pdfReaderState}>
          <p className={styles.previewLoading}>PDF 페이지를 렌더링하는 중...</p>
        </div>
      ) : (
        <div className={styles.pdfReaderPages}>
          {pages.map((page) => (
            <div
              key={page.pageNumber}
              ref={(node) => {
                pageRefs.current[page.pageNumber] = node;
              }}
              data-page-number={page.pageNumber}
              className={styles.pdfPage}
            >
              <div className={styles.pdfPageLabel}>Page {page.pageNumber}</div>
              <Image
                src={page.imageDataUrl}
                alt={`${title} page ${page.pageNumber}`}
                width={page.width}
                height={page.height}
                className={styles.pdfPageImage}
                unoptimized
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
