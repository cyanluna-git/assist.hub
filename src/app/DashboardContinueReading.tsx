"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, FileText, History, PlayCircle } from "lucide-react";
import {
  buildRecentMaterialHref,
  getRecentMaterialContextLabel,
  readRecentMaterials,
  RECENT_MATERIALS_EVENT,
  type RecentMaterialEntry,
} from "@/lib/recent-materials";
import styles from "./dashboard.module.css";

function formatUpdatedAt(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "최근 작업";
  }

  return new Intl.DateTimeFormat("ko-KR", {
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

export default function DashboardContinueReading() {
  const [items, setItems] = useState<RecentMaterialEntry[]>([]);

  useEffect(() => {
    const sync = () => {
      setItems(readRecentMaterials());
    };

    sync();
    window.addEventListener("storage", sync);
    window.addEventListener(RECENT_MATERIALS_EVENT, sync as EventListener);

    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener(RECENT_MATERIALS_EVENT, sync as EventListener);
    };
  }, []);

  return (
    <article className={`card ${styles.section}`}>
      <div className={styles.sectionHeader}>
        <div>
          <p className={styles.sectionEyebrow}>Continue</p>
          <h3 className={styles.sectionTitle}>이어서 진행하기</h3>
        </div>
        <span className={styles.resumeCount}>{items.length ? `${items.length}개` : "비어 있음"}</span>
      </div>

      <ul className={styles.actionList}>
        {items.length ? (
          items.map((item, index) => (
            <li key={`${item.materialId}-${index}`}>
              <Link href={buildRecentMaterialHref(item)} className={styles.resumeRow}>
                <span className={styles.resumeIndex}>{index + 1}</span>
                <span className={styles.actionIconWrap}>
                  {item.resumeView === "default" ? <FileText size={16} className={styles.materialIcon} /> : <PlayCircle size={16} className={styles.materialIcon} />}
                </span>
                <div className={styles.actionContent}>
                  <p className={styles.materialTitle}>{item.materialTitle}</p>
                  <p className={styles.materialMeta}>
                    {getRecentMaterialContextLabel(item)} · {formatUpdatedAt(item.updatedAt)}
                  </p>
                </div>
                <ArrowRight size={16} className={styles.actionArrow} />
              </Link>
            </li>
          ))
        ) : (
          <li className={styles.emptyCard}>
            <History size={16} />
            아직 이어서 열 자료가 없습니다.
          </li>
        )}
      </ul>
    </article>
  );
}
