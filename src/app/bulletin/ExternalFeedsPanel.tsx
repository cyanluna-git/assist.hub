import { Archive, ExternalLink, MailOpen, Rss } from "lucide-react";
import {
  toggleExternalFeedArchiveAction,
  toggleExternalFeedReadAction,
  toggleExternalFeedSourceAction,
} from "./actions";
import styles from "./bulletin.module.css";

type ExternalFeedItemView = {
  id: string;
  sourceId: string;
  sourceLabel: string;
  sourceSiteUrl: string | null;
  sourceFeedUrl: string;
  sourceIsActive: boolean;
  title: string;
  url: string;
  summary: string | null;
  author: string | null;
  isRead: boolean;
  isArchived: boolean;
  publishedAt: string | null;
  fetchedAt: string;
};

type ExternalFeedSourceView = {
  id: string;
  label: string;
  feedUrl: string;
  siteUrl: string | null;
  isActive: boolean;
};

type ExternalFeedsPanelProps = {
  items: ExternalFeedItemView[];
  sources: ExternalFeedSourceView[];
};

export default function ExternalFeedsPanel({ items, sources }: ExternalFeedsPanelProps) {
  return (
    <section className={`card ${styles.feedPanel}`}>
      <div className={styles.feedPanelHeader}>
        <div>
          <p className={styles.sectionEyebrow}>External Feeds</p>
          <h3 className={styles.feedPanelTitle}>AI / Tech RSS</h3>
        </div>
      </div>

      <div className={styles.feedSources}>
        {sources.map((source) => (
          <form key={source.id} action={toggleExternalFeedSourceAction} className={styles.feedSourceItem}>
            <input type="hidden" name="id" value={source.id} />
            <input type="hidden" name="nextActive" value={String(!source.isActive)} />
            <div className={styles.feedSourceText}>
              <p className={styles.feedSourceTitle}>{source.label}</p>
              <a href={source.feedUrl} target="_blank" rel="noreferrer" className={styles.inlineLink}>
                {source.feedUrl}
              </a>
            </div>
            <button type="submit" className={styles.itemActionButton}>
              {source.isActive ? "On" : "Off"}
            </button>
          </form>
        ))}
      </div>

      {!items.length ? (
        <div className={styles.empty}>아직 동기화된 외부 RSS 항목이 없습니다.</div>
      ) : (
        <div className={styles.feedList}>
          {items.map((item) => (
            <article
              key={item.id}
              className={`${styles.feedItem} ${item.isArchived ? styles.feedItemArchived : ""} ${!item.isRead ? styles.itemUnread : ""}`}
            >
              <div className={styles.feedMetaRow}>
                <div className={styles.metaGroup}>
                  <span className={`${styles.sourceBadge} ${styles.sourceBadgeFeed}`}>
                    <Rss size={12} />
                    {item.sourceLabel}
                  </span>
                  {!item.isRead ? <span className={styles.unreadBadge}>UNREAD</span> : null}
                  {item.isArchived ? <span className={styles.archiveBadge}>ARCHIVED</span> : null}
                  {!item.sourceIsActive ? <span className={styles.archiveBadge}>SOURCE OFF</span> : null}
                </div>
                <span className={styles.feedDate}>
                  {item.publishedAt ? formatDateTime(item.publishedAt) : `수집 ${formatDateTime(item.fetchedAt)}`}
                </span>
              </div>

              <a href={item.url} target="_blank" rel="noreferrer" className={styles.feedTitleLink}>
                {item.title}
                <ExternalLink size={14} />
              </a>
              {item.summary ? <p className={styles.feedSummary}>{item.summary}</p> : null}
              {item.author ? <p className={styles.feedAuthor}>{item.author}</p> : null}

              <div className={styles.actionRow}>
                <form action={toggleExternalFeedReadAction}>
                  <input type="hidden" name="id" value={item.id} />
                  <input type="hidden" name="nextRead" value={String(!item.isRead)} />
                  <button type="submit" className={styles.itemActionButton}>
                    <MailOpen size={14} />
                    {item.isRead ? "안읽음으로" : "읽음 처리"}
                  </button>
                </form>
                <form action={toggleExternalFeedArchiveAction}>
                  <input type="hidden" name="id" value={item.id} />
                  <input type="hidden" name="nextArchived" value={String(!item.isArchived)} />
                  <button type="submit" className={styles.itemActionButton}>
                    <Archive size={14} />
                    {item.isArchived ? "보관 해제" : "보관"}
                  </button>
                </form>
                <a href={item.url} target="_blank" rel="noreferrer" className={styles.attachmentLink}>
                  열기
                </a>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function formatDateTime(value: string) {
  const date = new Date(value);
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}
