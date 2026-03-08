import prisma from "@/lib/prisma";
import { Search } from "lucide-react";
import MaterialsLibrary from "./MaterialsLibrary";
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

      <MaterialsLibrary
        sections={Object.entries(categorized)
          .filter(([, items]) => items.length > 0)
          .map(([name, items]) => ({ name, items }))}
      />
    </>
  );
}
