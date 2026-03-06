"use client";

import { useMemo, useState } from "react";
import { Archive, BookOpenCheck, ChevronDown, Inbox, MailOpen, Pin, Search } from "lucide-react";
import { toggleBulletinArchiveAction, toggleBulletinPinAction, toggleBulletinReadAction } from "./actions";
import styles from "./bulletin.module.css";

type BulletinItemView = {
  id: string;
  sourceType: string;
  title: string;
  content: string;
  sender: string | null;
  receivedAt: string;
  isRead: boolean;
  isPinned: boolean;
  isArchived: boolean;
};

type BulletinBoardProps = {
  items: BulletinItemView[];
};

type SourceFilter = "ALL" | "SMS" | "GMAIL";
type DateFilter = "ALL" | "7D" | "30D" | "90D";
type ViewMode = "ACTIVE" | "UNREAD" | "ARCHIVED" | "ALL";

function normalizeParagraphs(input: string) {
  return input
    .replace(/\r/g, "")
    .replace(/<((?:https?:\/\/)[^>]+)>/g, "$1")
    .replace(/[ \t]+/g, " ")
    .replace(/([.!?]|[가-힣](?:다|요|죠|니다)\.)\s+(?=[A-Z0-9가-힣*※\-])/g, "$1\n")
    .replace(/([.?!])\s+(?=\d+\.)/g, "$1\n")
    .replace(/([다요죠]\.)\s+(?=[가-힣])/g, "$1\n")
    .replace(/\s+(\d+\.)\s/g, "\n$1 ")
    .replace(/\s+(※)/g, "\n$1 ")
    .replace(/\s+([-*])\s/g, "\n$1 ")
    .replace(/\s+(https?:\/\/)/g, "\n$1")
    .replace(/\n{3,}/g, "\n\n")
    .split(/\n\s*\n/)
    .map((block) =>
      block
        .replace(/[ \t]+\n/g, "\n")
        .replace(/[ \t]{2,}/g, " ")
        .replace(/\n{2,}/g, "\n")
        .trim(),
    )
    .filter(Boolean);
}

function parseEmailContent(content: string) {
  const normalized = content.replace(/\r/g, "").trim();
  const replyMarkerRegex =
    /(?:^|\n)(On .+ wrote:|From:\s.+|보낸사람:\s.+|-----Original Message-----|________________________________)/i;
  const markerMatch = normalized.match(replyMarkerRegex);

  if (!markerMatch || markerMatch.index === undefined) {
    return {
      body: normalizeParagraphs(normalized),
      quoted: [] as string[],
    };
  }

  const body = normalized.slice(0, markerMatch.index).trim();
  const quoted = normalized.slice(markerMatch.index).trim();

  return {
    body: normalizeParagraphs(body),
    quoted: normalizeParagraphs(quoted.replace(/^>\s?/gm, "")),
  };
}

function getPreview(content: string) {
  return content.replace(/\s+/g, " ").trim().slice(0, 140);
}

function renderLinkedText(text: string) {
  const urlRegex = /(https?:\/\/[^\s)]+(?:\([^\s)]+\))?[^\s,.;:!?)]?)/g;
  const parts = text.split(urlRegex);

  return parts.map((part, index) => {
    if (!part) return null;

    if (/^https?:\/\//.test(part)) {
      return (
        <a
          key={`${part}-${index}`}
          href={part}
          target="_blank"
          rel="noreferrer"
          className={styles.inlineLink}
        >
          {part}
        </a>
      );
    }

    return <span key={`${part}-${index}`}>{part}</span>;
  });
}

function matchesDateFilter(receivedAt: string, filter: DateFilter) {
  if (filter === "ALL") return true;

  const diff = Date.now() - new Date(receivedAt).getTime();
  const days = diff / (1000 * 60 * 60 * 24);

  if (filter === "7D") return days <= 7;
  if (filter === "30D") return days <= 30;
  return days <= 90;
}

function matchesViewMode(item: BulletinItemView, mode: ViewMode) {
  if (mode === "ACTIVE") return !item.isArchived;
  if (mode === "UNREAD") return !item.isArchived && !item.isRead;
  if (mode === "ARCHIVED") return item.isArchived;
  return true;
}

function formatReceivedAt(receivedAt: string) {
  const date = new Date(receivedAt);
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  let hour = date.getHours();
  const minute = String(date.getMinutes()).padStart(2, "0");
  const period = hour < 12 ? "오전" : "오후";
  hour = hour % 12 || 12;
  return `${year}. ${month}. ${day}. ${period} ${hour}:${minute}`;
}

export default function BulletinBoard({ items }: BulletinBoardProps) {
  const [openId, setOpenId] = useState<string | null>(items[0]?.id ?? null);
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("ALL");
  const [dateFilter, setDateFilter] = useState<DateFilter>("ALL");
  const [viewMode, setViewMode] = useState<ViewMode>("ACTIVE");
  const [keyword, setKeyword] = useState("");

  const filteredItems = useMemo(() => {
    const normalizedKeyword = keyword.trim().toLowerCase();

    return [...items]
      .filter((item) => matchesViewMode(item, viewMode))
      .filter((item) => (sourceFilter === "ALL" ? true : item.sourceType === sourceFilter))
      .filter((item) => matchesDateFilter(item.receivedAt, dateFilter))
      .filter((item) => {
        if (!normalizedKeyword) return true;

        const haystack = `${item.title}\n${item.sender ?? ""}\n${item.content}`.toLowerCase();
        return haystack.includes(normalizedKeyword);
      })
      .sort((a, b) => {
        if (a.isPinned !== b.isPinned) {
          return a.isPinned ? -1 : 1;
        }

        if (a.isRead !== b.isRead) {
          return a.isRead ? 1 : -1;
        }

        return new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime();
      });
  }, [items, viewMode, sourceFilter, dateFilter, keyword]);

  const activeCount = items.filter((item) => !item.isArchived).length;
  const unreadCount = items.filter((item) => !item.isArchived && !item.isRead).length;
  const archivedCount = items.filter((item) => item.isArchived).length;

  if (!items.length) {
    return (
      <div className={styles.empty}>
        <Inbox size={40} />
        <p>아직 등록된 공지가 없습니다. 문자 등록 또는 Gmail 동기화를 먼저 실행하세요.</p>
      </div>
    );
  }

  return (
    <section className={styles.boardSection}>
      <div className={`card ${styles.filterBar}`}>
        <div className={styles.viewTabs}>
          <button
            type="button"
            className={`${styles.tabButton} ${viewMode === "ACTIVE" ? styles.tabButtonActive : ""}`}
            onClick={() => setViewMode("ACTIVE")}
          >
            활성 공지 <span className={styles.tabCount}>{activeCount}</span>
          </button>
          <button
            type="button"
            className={`${styles.tabButton} ${viewMode === "UNREAD" ? styles.tabButtonActive : ""}`}
            onClick={() => setViewMode("UNREAD")}
          >
            읽지 않음 <span className={styles.tabCount}>{unreadCount}</span>
          </button>
          <button
            type="button"
            className={`${styles.tabButton} ${viewMode === "ARCHIVED" ? styles.tabButtonActive : ""}`}
            onClick={() => setViewMode("ARCHIVED")}
          >
            아카이브 <span className={styles.tabCount}>{archivedCount}</span>
          </button>
          <button
            type="button"
            className={`${styles.tabButton} ${viewMode === "ALL" ? styles.tabButtonActive : ""}`}
            onClick={() => setViewMode("ALL")}
          >
            전체 보기 <span className={styles.tabCount}>{items.length}</span>
          </button>
        </div>

        <div className={styles.filterControls}>
          <label className={styles.searchBox}>
            <Search size={15} />
            <input
              type="search"
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              placeholder="제목, 발신자, 본문 검색"
              className={styles.searchInput}
            />
          </label>

          <select
            value={sourceFilter}
            onChange={(event) => setSourceFilter(event.target.value as SourceFilter)}
            className={styles.select}
          >
            <option value="ALL">전체 출처</option>
            <option value="SMS">SMS</option>
            <option value="GMAIL">Gmail</option>
          </select>

          <select
            value={dateFilter}
            onChange={(event) => setDateFilter(event.target.value as DateFilter)}
            className={styles.select}
          >
            <option value="ALL">전체 기간</option>
            <option value="7D">최근 7일</option>
            <option value="30D">최근 30일</option>
            <option value="90D">최근 90일</option>
          </select>
        </div>
      </div>

      {!filteredItems.length ? (
        <div className={styles.empty}>
          <Inbox size={40} />
          <p>현재 필터 조건에 맞는 공지가 없습니다.</p>
        </div>
      ) : (
        <section className={styles.board}>
          {filteredItems.map((item) => {
            const isOpen = item.id === openId;
            const parsed = parseEmailContent(item.content);
            const preview = getPreview(item.content);
            const sourceBadgeClass =
              item.sourceType === "SMS" ? styles.sourceBadgeSms : styles.sourceBadgeGmail;

            return (
              <article
                id={`bulletin-item-${item.id}`}
                key={item.id}
                className={`card ${styles.item} ${isOpen ? styles.itemOpen : ""} ${!item.isRead ? styles.itemUnread : ""}`}
              >
                <button
                  type="button"
                  className={styles.itemButton}
                  onClick={() => setOpenId((current) => (current === item.id ? null : item.id))}
                  aria-expanded={isOpen}
                >
                  <div className={styles.itemTop}>
                    <div className={styles.metaGroup}>
                      <span className={`${styles.sourceBadge} ${sourceBadgeClass}`}>{item.sourceType}</span>
                      {!item.isRead ? <span className={styles.unreadBadge}>UNREAD</span> : null}
                      {item.isPinned ? <span className={styles.pinBadge}>PINNED</span> : null}
                      {item.isArchived ? <span className={styles.archiveBadge}>ARCHIVED</span> : null}
                    </div>
                    <span className={styles.date}>{formatReceivedAt(item.receivedAt)}</span>
                  </div>
                  <div className={styles.itemHeader}>
                    <div className={styles.itemHeaderText}>
                      <h2 className={styles.title}>{item.title}</h2>
                      <p className={styles.sender}>{item.sender || "발신자 정보 없음"}</p>
                      {!isOpen ? <p className={styles.preview}>{preview}</p> : null}
                    </div>
                    <ChevronDown size={18} className={`${styles.chevron} ${isOpen ? styles.chevronOpen : ""}`} />
                  </div>
                </button>

                {isOpen ? (
                  <div className={styles.body}>
                    <div className={styles.bodyInner}>
                      <div className={styles.actionRow}>
                        <form action={toggleBulletinReadAction}>
                          <input type="hidden" name="id" value={item.id} />
                          <input type="hidden" name="nextRead" value={String(!item.isRead)} />
                          <button type="submit" className={styles.itemActionButton}>
                            {item.isRead ? <MailOpen size={14} /> : <BookOpenCheck size={14} />}
                            {item.isRead ? "안읽음으로" : "읽음 처리"}
                          </button>
                        </form>

                        <form action={toggleBulletinPinAction}>
                          <input type="hidden" name="id" value={item.id} />
                          <input type="hidden" name="nextPinned" value={String(!item.isPinned)} />
                          <button type="submit" className={styles.itemActionButton}>
                            <Pin size={14} />
                            {item.isPinned ? "핀 해제" : "상단 고정"}
                          </button>
                        </form>

                        <form action={toggleBulletinArchiveAction}>
                          <input type="hidden" name="id" value={item.id} />
                          <input type="hidden" name="nextArchived" value={String(!item.isArchived)} />
                          <button type="submit" className={styles.itemActionButton}>
                            <Archive size={14} />
                            {item.isArchived ? "복원" : "아카이브"}
                          </button>
                        </form>
                      </div>

                      {parsed.body.map((paragraph, index) => (
                        <p key={`${item.id}-body-${index}`} className={styles.contentParagraph}>
                          {renderLinkedText(paragraph)}
                        </p>
                      ))}

                      {parsed.quoted.length ? (
                        <details className={styles.quoted}>
                          <summary className={styles.quotedSummary}>이전 메일 / 회신 내역 보기</summary>
                          <div className={styles.quotedBody}>
                            {parsed.quoted.map((paragraph, index) => (
                              <p key={`${item.id}-quoted-${index}`} className={styles.quotedParagraph}>
                                {renderLinkedText(paragraph)}
                              </p>
                            ))}
                          </div>
                        </details>
                      ) : null}
                    </div>
                  </div>
                ) : null}
              </article>
            );
          })}
        </section>
      )}
    </section>
  );
}
