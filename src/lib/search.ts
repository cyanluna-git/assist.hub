import prisma from "./prisma";
import { fetchBulletins } from "./bulletin";
import { listMaterialArtifactLabels } from "./material-artifacts";
import { fetchRecentExternalFeedItems } from "./rss-feeds";
import { fetchUnifiedScheduleItems } from "./schedule";

export type GlobalSearchItem = {
  id: string;
  kind: "material" | "bulletin" | "schedule" | "feed";
  title: string;
  subtitle: string;
  href: string;
  keywords: string;
  artifactLabels?: string[];
  sourceLabel?: string;
};

function formatDateLabel(date: Date | null) {
  if (!date) return "일정 시간 미정";

  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  let hour = date.getHours();
  const minute = String(date.getMinutes()).padStart(2, "0");
  const period = hour < 12 ? "오전" : "오후";
  hour = hour % 12 || 12;
  return `${year}. ${month}. ${day}. ${period} ${hour}:${minute}`;
}

export async function fetchGlobalSearchItems() {
  const [materials, bulletins, schedules, feedItems] = await Promise.all([
    prisma.material.findMany({
      orderBy: { title: "asc" },
      include: {
        artifacts: {
          orderBy: { updatedAt: "desc" },
        },
      },
    }),
    fetchBulletins(),
    fetchUnifiedScheduleItems(),
    fetchRecentExternalFeedItems(120),
  ]);

  const materialItems: GlobalSearchItem[] = materials.map((item) => {
    const artifactLabels = listMaterialArtifactLabels(item.artifacts);

    return {
      id: `material-${item.id}`,
      kind: "material",
      title: item.title,
      subtitle: `${item.type.toUpperCase()} · ${item.isRead ? "Read" : "Unread"}${artifactLabels.length ? ` · Artifacts ${artifactLabels.length}` : ""}`,
      href: `/materials/view?path=${encodeURIComponent(item.localUrl)}`,
      keywords: [item.title, item.type, item.localUrl, ...artifactLabels].join(" "),
      artifactLabels,
    };
  });

  const bulletinItems: GlobalSearchItem[] = bulletins.map((item) => ({
    id: `bulletin-${item.id}`,
    kind: "bulletin",
    title: item.title,
    subtitle: `${item.sourceType} · ${item.sender || "발신자 정보 없음"}`,
    href: `/bulletin#bulletin-item-${item.id}`,
    keywords: [item.title, item.sender || "", item.content, item.sourceType].join(" "),
  }));

  const scheduleItems: GlobalSearchItem[] = schedules.map((item) => ({
    id: `schedule-${item.source.toLowerCase()}-${item.id}`,
    kind: "schedule",
    title: item.title,
    subtitle: `${item.source === "MANUAL" ? "Manual" : "Classroom"} · ${formatDateLabel(item.startAt)}`,
    href: `/schedule#schedule-item-${item.source.toLowerCase()}-${item.id}`,
    keywords: [item.title, item.description || "", item.source, item.status].join(" "),
  }));

  const externalFeedSearchItems: GlobalSearchItem[] = feedItems.map((item) => ({
    id: `feed-${item.id}`,
    kind: "feed",
    title: item.title,
    subtitle: `${item.sourceLabel} · ${item.author || "외부 RSS"} · ${formatDateLabel(item.publishedAt ?? item.fetchedAt)}`,
    href: item.url,
    keywords: [item.title, item.summary || "", item.author || "", item.sourceLabel].join(" "),
    sourceLabel: item.sourceLabel,
  }));

  return [...materialItems, ...bulletinItems, ...scheduleItems, ...externalFeedSearchItems];
}
