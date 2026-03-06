import prisma from "@/lib/prisma";
import { ChevronRight, FileText, Search } from "lucide-react";
import Link from "next/link";
import styles from "./materials.module.css";

export default async function MaterialsPage() {
  const materials = await prisma.material.findMany({
    orderBy: { id: "asc" },
  });

  const categorized = {
    Announcements: materials.filter((m) => m.localUrl.includes("announcements")),
    Assignments: materials.filter((m) => m.localUrl.includes("assignments")),
    "Obsidian Notes": materials.filter((m) => m.localUrl.includes("obsidian_notes")),
  };

  return (
    <>
      <header className="page-hero">
        <p className="page-kicker">Knowledge Archive</p>
        <h1 className="page-title">Materials</h1>
        <p className="page-subtitle">문서, 과제, 노트를 하나의 라이브러리에서 탐색하고 즉시 열람하세요.</p>
      </header>

      <div className={styles.header}>
        <span />
        <label className={styles.search}>
          <Search size={16} />
          <input type="text" placeholder="문서 제목 검색(미구현)" disabled />
        </label>
      </div>

      <div className={styles.stack}>
        {Object.entries(categorized).map(([category, items]) => {
          if (items.length === 0) return null;

          return (
            <section key={category} className={`card ${styles.section}`}>
              <header className={styles.sectionHead}>
                <h2 className={styles.sectionTitle}>{category}</h2>
                <span className={styles.count}>{items.length} files</span>
              </header>

              <ul className={styles.list}>
                {items.map((item) => (
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
            </section>
          );
        })}

        {!materials.length && <p className={styles.empty}>동기화된 자료가 없습니다. 대시보드에서 동기화를 먼저 실행하세요.</p>}
      </div>
    </>
  );
}
