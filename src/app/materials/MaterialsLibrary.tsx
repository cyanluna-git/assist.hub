"use client";

import { useMemo, useState } from "react";
import { ChevronRight, FileText } from "lucide-react";
import Link from "next/link";
import styles from "./materials.module.css";

type MaterialListItem = {
  id: string;
  title: string;
  type: string;
  localUrl: string;
  isRead: boolean;
};

type MaterialSection = {
  name: string;
  items: MaterialListItem[];
};

type MaterialsLibraryProps = {
  sections: MaterialSection[];
};

const INITIAL_SECTION_COUNT = 24;
const SECTION_INCREMENT = 24;

export default function MaterialsLibrary({ sections }: MaterialsLibraryProps) {
  const [visibleCounts, setVisibleCounts] = useState<Record<string, number>>(() =>
    Object.fromEntries(sections.map((section) => [section.name, INITIAL_SECTION_COUNT])),
  );

  const normalizedSections = useMemo(
    () =>
      sections.map((section) => ({
        ...section,
        visibleItems: section.items.slice(0, visibleCounts[section.name] ?? INITIAL_SECTION_COUNT),
      })),
    [sections, visibleCounts],
  );

  if (!sections.length) {
    return <p className={styles.empty}>동기화된 자료가 없습니다. 대시보드에서 동기화를 먼저 실행하세요.</p>;
  }

  return (
    <div className={styles.stack}>
      {normalizedSections.map((section) => {
        const hasMore = section.visibleItems.length < section.items.length;

        return (
          <section key={section.name} className={`card ${styles.section}`}>
            <header className={styles.sectionHead}>
              <h2 className={styles.sectionTitle}>{section.name}</h2>
              <span className={styles.count}>{section.items.length} files</span>
            </header>

            <ul className={styles.list}>
              {section.visibleItems.map((item) => (
                <li key={item.id}>
                  <Link href={`/materials/view?path=${encodeURIComponent(item.localUrl)}`} className={styles.item}>
                    <FileText size={18} className={styles.icon} />
                    <span>
                      <p className={styles.itemName}>{item.title}</p>
                      <p className={styles.itemMeta}>
                        {item.type.toUpperCase()} • {item.isRead ? "Read" : "Unread"}
                      </p>
                    </span>
                    <ChevronRight size={16} className={styles.arrow} />
                  </Link>
                </li>
              ))}
            </ul>

            {hasMore ? (
              <div className={styles.loadMoreRow}>
                <button
                  type="button"
                  className={styles.loadMoreButton}
                  onClick={() =>
                    setVisibleCounts((current) => ({
                      ...current,
                      [section.name]: (current[section.name] ?? INITIAL_SECTION_COUNT) + SECTION_INCREMENT,
                    }))
                  }
                >
                  더 보기 ({section.items.length - section.visibleItems.length}개 남음)
                </button>
              </div>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}
