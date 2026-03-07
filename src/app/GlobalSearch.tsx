"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { FileText, Inbox, Calendar, Search, X } from "lucide-react";
import { useRouter } from "next/navigation";
import type { GlobalSearchItem } from "@/lib/search";
import styles from "./layout.module.css";

type GlobalSearchProps = {
  items: GlobalSearchItem[];
  compact?: boolean;
};

type SearchKind = GlobalSearchItem["kind"];

const kindLabelMap: Record<SearchKind, string> = {
  material: "Material",
  bulletin: "Bulletin",
  schedule: "Schedule",
};

const kindIconMap = {
  material: FileText,
  bulletin: Inbox,
  schedule: Calendar,
};

function scoreItem(item: GlobalSearchItem, query: string) {
  const haystack = `${item.title} ${item.subtitle} ${item.keywords}`.toLowerCase();
  const title = item.title.toLowerCase();

  if (title === query) return 300;
  if (title.startsWith(query)) return 220;
  if (title.includes(query)) return 180;
  if (haystack.includes(query)) return 120;
  return 0;
}

export default function GlobalSearch({ items, compact = false }: GlobalSearchProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);

  const openPalette = useCallback(() => {
    setSelectedIndex(0);
    setOpen(true);
  }, []);

  const closePalette = useCallback(() => {
    setOpen(false);
    setQuery("");
    setSelectedIndex(0);
  }, []);

  const navigateTo = useCallback(
    (item: GlobalSearchItem) => {
      closePalette();
      router.push(item.href);
    },
    [closePalette, router],
  );

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((current) => {
          if (current) {
            setQuery("");
            setSelectedIndex(0);
            return false;
          }

          setSelectedIndex(0);
          return true;
        });
      }

      if (event.key === "Escape") {
        closePalette();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [closePalette]);

  const filteredItems = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    if (!normalizedQuery) {
      return items.slice(0, 12);
    }

    return [...items]
      .map((item) => ({
        item,
        score: scoreItem(item, normalizedQuery),
      }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score || a.item.title.localeCompare(b.item.title))
      .slice(0, 12)
      .map((entry) => entry.item);
  }, [items, query]);

  useEffect(() => {
    function handleListKeys(event: KeyboardEvent) {
      if (!open) return;
      if (!filteredItems.length) return;

      if (event.key === "ArrowDown") {
        event.preventDefault();
        setSelectedIndex((current) => (current + 1) % filteredItems.length);
      }

      if (event.key === "ArrowUp") {
        event.preventDefault();
        setSelectedIndex((current) => (current - 1 + filteredItems.length) % filteredItems.length);
      }

      if (event.key === "Enter") {
        event.preventDefault();
        navigateTo(filteredItems[selectedIndex]);
      }
    }

    window.addEventListener("keydown", handleListKeys);
    return () => window.removeEventListener("keydown", handleListKeys);
  }, [filteredItems, navigateTo, open, selectedIndex]);

  return (
    <>
      <button
        type="button"
        className={`${styles.searchTrigger} ${compact ? styles.searchTriggerCompact : ""}`}
        aria-label="Open command palette"
        onClick={openPalette}
        title={compact ? "Quick Search" : undefined}
      >
        <span className={styles.searchLeft}>
          <Search size={14} />
          <span className={styles.searchTriggerLabel}>Quick Search</span>
        </span>
        <span className={styles.kbd}>⌘K</span>
      </button>

      {open ? (
        <div className={styles.paletteOverlay} onClick={closePalette}>
          <div className={styles.palette} onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true">
            <div className={styles.paletteTop}>
              <label className={styles.paletteInputWrap}>
                <Search size={16} />
                <input
                  autoFocus
                  type="search"
                  value={query}
                  onChange={(event) => {
                    setQuery(event.target.value);
                    setSelectedIndex(0);
                  }}
                  placeholder="문서, 공지, 일정 검색"
                  className={styles.paletteInput}
                />
              </label>
              <button type="button" className={styles.paletteClose} onClick={closePalette} aria-label="Close command palette">
                <X size={16} />
              </button>
            </div>

            <div className={styles.paletteList}>
              {filteredItems.length ? (
                filteredItems.map((item, index) => {
                  const Icon = kindIconMap[item.kind];
                  const selected = index === selectedIndex;

                  return (
                    <button
                      key={item.id}
                      type="button"
                      className={`${styles.paletteItem} ${selected ? styles.paletteItemActive : ""}`}
                      onMouseEnter={() => setSelectedIndex(index)}
                      onClick={() => navigateTo(item)}
                    >
                      <span className={styles.paletteIcon}>
                        <Icon size={16} />
                      </span>
                      <span className={styles.paletteText}>
                        <span className={styles.paletteTitle}>{item.title}</span>
                        <span className={styles.paletteSubtitle}>{item.subtitle}</span>
                        {item.kind === "material" && item.artifactLabels?.length ? (
                          <span className={styles.paletteBadgeRow}>
                            {item.artifactLabels.map((label) => (
                              <span key={`${item.id}-${label}`} className={styles.paletteBadge}>
                                {label}
                              </span>
                            ))}
                          </span>
                        ) : null}
                      </span>
                      <span className={styles.paletteKind}>{kindLabelMap[item.kind]}</span>
                    </button>
                  );
                })
              ) : (
                <div className={styles.paletteEmpty}>
                  <p>검색 결과가 없습니다.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
