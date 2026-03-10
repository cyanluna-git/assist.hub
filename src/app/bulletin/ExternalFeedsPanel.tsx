import { Rss, ExternalLink } from "lucide-react";
import styles from "./bulletin.module.css";

type ExternalFeedItemView = {
  id: string;
  sourceId: string;
  sourceLabel: string;
  sourceSiteUrl: string | null;
  title: string;
  url: string;
  summary: string | null;
  author: string | null;
  publishedAt: string | null;
  fetchedAt: string;
};

type ExternalFeedsPanelProps = {
  items: ExternalFeedItemView[];
};

export default function ExternalFeedsPanel({ items }: ExternalFeedsPanelProps) {
  if (!items.length) {
    return (
      <section className={`card ${styles.feedPanel}`}>
        <div className={styles.feedPanelHeader}>
          <div>
            <p className={styles.sectionEyebrow}>External Feeds</p>
            <h3 className={styles.feedPanelTitle}>AI / Tech RSS</h3>
          </div>
        </div>
        <div className={styles.empty}>아직 동기화된 외부 RSS 항목이 없습니다.</div>
      </section>
    );
  }

  return (
    <section className={`card ${styles.feedPanel}`}>
      <div className={styles.feedPanelHeader}>
        <div>
          <p className={styles.sectionEyebrow}>External Feeds</p>
          <h3 className={styles.feedPanelTitle}>AI / Tech RSS</h3>
        </div>
      </div>

      <div className={styles.feedList}>
        {items.map((item) => (
          <article key={item.id} className={styles.feedItem}>
            <div className={styles.feedMetaRow}>
              <span className={`${styles.sourceBadge} ${styles.sourceBadgeFeed}`}>
                <Rss size={12} />
                {item.sourceLabel}
              </span>
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
          </article>
        ))}
      </div>
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
