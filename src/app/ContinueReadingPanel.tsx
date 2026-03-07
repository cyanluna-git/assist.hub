"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { FileText, History, PlayCircle } from "lucide-react";
import {
  buildRecentMaterialHref,
  getRecentMaterialContextLabel,
  readRecentMaterials,
  RECENT_MATERIALS_EVENT,
  type RecentMaterialEntry,
} from "@/lib/recent-materials";
import styles from "./layout.module.css";

type ContinueReadingPanelProps = {
  collapsed?: boolean;
};

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

export default function ContinueReadingPanel({ collapsed = false }: ContinueReadingPanelProps) {
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
    <section className={`${styles.continuePanel} ${collapsed ? styles.continuePanelCollapsed : ""}`}>
      <div className={styles.continueHead}>
        <div className={styles.continueHeadLeft}>
          <History size={15} />
          <span className={styles.continueTitle}>이어서 진행하기</span>
        </div>
        {!collapsed ? <span className={styles.continueCount}>{items.length ? `${items.length}개` : "비어 있음"}</span> : null}
      </div>

      {items.length ? (
        <div className={styles.continueList}>
          {items.map((item, index) => (
            <Link
              key={item.materialId}
              href={buildRecentMaterialHref(item)}
              className={`${styles.continueItem} ${collapsed ? styles.continueItemCollapsed : ""}`}
              title={`${item.materialTitle} · ${getRecentMaterialContextLabel(item)}`}
            >
              <span className={styles.continueIndex}>{index + 1}</span>
              <span className={styles.continueIcon}>
                {collapsed ? <PlayCircle size={15} /> : <FileText size={15} />}
              </span>
              <span className={styles.continueBody}>
                <span className={styles.continueItemTitle}>{item.materialTitle}</span>
                <span className={styles.continueItemMeta}>
                  <span className={styles.continueContext}>{getRecentMaterialContextLabel(item)}</span>
                  <span className={styles.continueDot}>·</span>
                  <span className={styles.continueTime}>{formatUpdatedAt(item.updatedAt)}</span>
                </span>
              </span>
            </Link>
          ))}
        </div>
      ) : (
        <p className={styles.continueEmpty}>
          최근에 보던 자료가 아직 없습니다.
        </p>
      )}
    </section>
  );
}
