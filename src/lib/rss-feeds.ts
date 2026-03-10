import Parser from "rss-parser";
import prisma from "./prisma";
import { runTrackedSync } from "./sync-state";

export const CURATED_RSS_SOURCES = [
  {
    id: "GEEKNEWS",
    label: "GeekNews",
    feedUrl: "https://news.hada.io/rss/news",
    siteUrl: "https://news.hada.io/",
  },
  {
    id: "OPENAI_NEWS",
    label: "OpenAI News",
    feedUrl: "https://openai.com/news/rss.xml",
    siteUrl: "https://openai.com/news/",
  },
  {
    id: "HUGGINGFACE_BLOG",
    label: "Hugging Face Blog",
    feedUrl: "https://huggingface.co/blog/feed.xml",
    siteUrl: "https://huggingface.co/blog",
  },
] as const;

export type ExternalFeedItemView = {
  id: string;
  sourceId: string;
  sourceLabel: string;
  sourceSiteUrl: string | null;
  title: string;
  url: string;
  summary: string | null;
  author: string | null;
  publishedAt: Date | null;
  fetchedAt: Date;
};

const parser = new Parser({
  timeout: 15_000,
  headers: {
    "User-Agent": "assist-hub/0.1 rss fetcher",
  },
});

function normalizeSummary(input?: string | null) {
  if (!input) return null;
  return input
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 280);
}

function buildExternalKey(entry: {
  guid?: string | null;
  id?: string | null;
  link?: string | null;
  title?: string | null;
  isoDate?: string | null;
  pubDate?: string | null;
}) {
  return (
    entry.guid ||
    entry.id ||
    entry.link ||
    [entry.title || "", entry.isoDate || entry.pubDate || ""].filter(Boolean).join("::")
  ).trim();
}

function parsePublishedAt(entry: { isoDate?: string | null; pubDate?: string | null }) {
  const raw = entry.isoDate || entry.pubDate;
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

async function ensureExternalFeedSources() {
  await Promise.all(
    CURATED_RSS_SOURCES.map((source) =>
      prisma.externalFeedSource.upsert({
        where: { id: source.id },
        update: {
          label: source.label,
          feedUrl: source.feedUrl,
          siteUrl: source.siteUrl,
          isActive: true,
          sourceType: "RSS",
        },
        create: {
          id: source.id,
          label: source.label,
          feedUrl: source.feedUrl,
          siteUrl: source.siteUrl,
          sourceType: "RSS",
          isActive: true,
        },
      }),
    ),
  );
}

export async function syncExternalRssFeeds() {
  return runTrackedSync("RSS", async () => {
    await ensureExternalFeedSources();

    let syncedCount = 0;

    for (const source of CURATED_RSS_SOURCES) {
      const feed = await parser.parseURL(source.feedUrl);
      const fetchedAt = new Date();

      for (const entry of feed.items ?? []) {
        const externalKey = buildExternalKey(entry);
        const link = entry.link?.trim();
        const title = entry.title?.trim();

        if (!externalKey || !link || !title) {
          continue;
        }

        await prisma.externalFeedItem.upsert({
          where: {
            sourceId_externalKey: {
              sourceId: source.id,
              externalKey,
            },
          },
          update: {
            title,
            url: link,
            summary: normalizeSummary(entry.contentSnippet || entry.content || null),
            author: entry.creator?.trim() || null,
            publishedAt: parsePublishedAt(entry),
            fetchedAt,
          },
          create: {
            sourceId: source.id,
            externalKey,
            title,
            url: link,
            summary: normalizeSummary(entry.contentSnippet || entry.content || null),
            author: entry.creator?.trim() || null,
            publishedAt: parsePublishedAt(entry),
            fetchedAt,
          },
        });

        syncedCount += 1;
      }

      await prisma.externalFeedSource.update({
        where: { id: source.id },
        data: {
          lastFetchedAt: fetchedAt,
        },
      });
    }

    return {
      count: syncedCount,
      message: `${CURATED_RSS_SOURCES.length}개 RSS 소스에서 ${syncedCount}건을 갱신했습니다.`,
    };
  });
}

export async function fetchRecentExternalFeedItems(limit = 12): Promise<ExternalFeedItemView[]> {
  await ensureExternalFeedSources();

  const items = await prisma.externalFeedItem.findMany({
    take: limit,
    orderBy: [{ publishedAt: "desc" }, { fetchedAt: "desc" }],
    include: {
      source: true,
    },
  });

  return items.map((item) => ({
    id: item.id,
    sourceId: item.sourceId,
    sourceLabel: item.source.label,
    sourceSiteUrl: item.source.siteUrl,
    title: item.title,
    url: item.url,
    summary: item.summary,
    author: item.author,
    publishedAt: item.publishedAt,
    fetchedAt: item.fetchedAt,
  }));
}

export async function fetchExternalFeedSources() {
  await ensureExternalFeedSources();
  return prisma.externalFeedSource.findMany({
    where: { isActive: true },
    orderBy: { label: "asc" },
  });
}
