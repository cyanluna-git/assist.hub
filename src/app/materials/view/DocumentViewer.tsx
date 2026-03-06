"use client";

import type { Material, Note } from "@prisma/client";
import { Edit3, Sparkles, X } from "lucide-react";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import styles from "./document-viewer.module.css";

type ViewerMaterial = Material & { notes: Note[] };

interface DocumentViewerProps {
  material: ViewerMaterial;
  mdContent?: string;
}

export default function DocumentViewer({ material, mdContent }: DocumentViewerProps) {
  return (
    <div className={styles.layout}>
      <header className={styles.header}>
        <div className={styles.titleWrap}>
          <span className={styles.tag}>{material.type.toUpperCase()}</span>
          <h2 className={styles.title}>{material.title}</h2>
        </div>
        <Link href="/materials" className={styles.close} aria-label="Close viewer">
          <X size={18} />
        </Link>
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
            <div className={styles.blockHead}>
              <Sparkles size={15} />
              <span>AI Summary</span>
            </div>
            <div className={styles.summary}>
              {material.notes?.[0]?.aiSummary ? (
                <ReactMarkdown>{material.notes[0].aiSummary}</ReactMarkdown>
              ) : (
                <p className={styles.empty}>아직 AI 요약이 없습니다. CLI에서 요약을 요청하세요.</p>
              )}
            </div>
          </section>

          <section className={`${styles.block} ${styles.notes}`}>
            <div className={styles.blockHead}>
              <Edit3 size={15} />
              <span>My Notes</span>
            </div>
            <textarea
              placeholder="여기에 개인적인 생각을 기록하세요..."
              className={styles.textarea}
              defaultValue={material.notes?.[0]?.content || ""}
            />
          </section>
        </aside>
      </div>
    </div>
  );
}
