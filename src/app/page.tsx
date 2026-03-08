import prisma from "@/lib/prisma";
import { fetchWorkspaceProfile } from "@/lib/profile";
import { listMaterialArtifactLabels } from "@/lib/material-artifacts";
import { fetchUnifiedScheduleItems } from "@/lib/schedule";
import { COURSE_ID, COURSE_TITLE } from "@/lib/sync";
import { fetchSyncState } from "@/lib/sync-state";
import {
  ArrowRight,
  BookOpenCheck,
  CalendarClock,
  CheckCircle2,
  Clock3,
  ExternalLink,
  FileText,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import { syncClassroomDataAction } from "./dashboard-actions";
import DashboardContinueReading from "./DashboardContinueReading";
import styles from "./dashboard.module.css";

export const dynamic = "force-dynamic";

type ActionMaterial = {
  id: string;
  title: string;
  type: string;
  localUrl: string;
  isRead: boolean;
  noteSummary: string | null;
  artifactLabels: string[];
};

export default async function Dashboard() {
  const [profile, course, classroomSync, scheduleItems, unreadMaterials, materialsForSummary] = await Promise.all([
    fetchWorkspaceProfile(),
    prisma.course.findUnique({
      where: { id: COURSE_ID },
      include: {
        assignments: true,
      },
    }),
    fetchSyncState("CLASSROOM"),
    fetchUnifiedScheduleItems(),
    prisma.material.findMany({
      where: { isRead: false },
      orderBy: { id: "desc" },
      take: 3,
      include: {
        artifacts: {
          orderBy: { updatedAt: "desc" },
        },
      },
    }),
    prisma.material.findMany({
      orderBy: { id: "desc" },
      include: {
        artifacts: {
          orderBy: { updatedAt: "desc" },
        },
        notes: {
          orderBy: { updatedAt: "desc" },
          take: 1,
        },
      },
    }),
  ]);

  const now = new Date();
  const upcomingItems = scheduleItems
    .filter((item) => item.startAt && item.status !== "DONE" && item.startAt.getTime() >= now.getTime())
    .slice(0, 3);

  const materialsMissingSummary: ActionMaterial[] = materialsForSummary
    .filter((item) => {
      const latestNote = item.notes[0];
      return !latestNote || !latestNote.aiSummary?.trim();
    })
    .slice(0, 3)
    .map((item) => ({
      id: item.id,
      title: item.title,
      type: item.type,
      localUrl: item.localUrl,
      isRead: item.isRead,
      noteSummary: item.notes[0]?.aiSummary ?? null,
      artifactLabels: listMaterialArtifactLabels(item.artifacts),
    }));

  const totalAssignments = course?.assignments.length ?? 0;
  const dueAssignments = course?.assignments.filter((item) => item.dueDate).length ?? 0;
  const unreadCount = await prisma.material.count({ where: { isRead: false } });
  const summaryGapCount = materialsForSummary.filter((item) => {
    const latestNote = item.notes[0];
    return !latestNote || !latestNote.aiSummary?.trim();
  }).length;

  const syncToneClass =
    classroomSync.status === "SUCCESS"
      ? styles.syncToneSuccess
      : classroomSync.status === "ERROR"
        ? styles.syncToneError
        : classroomSync.status === "RUNNING"
          ? styles.syncToneRunning
          : styles.syncToneIdle;

  return (
    <>
      <header className="page-hero">
        <p className="page-kicker">Learning Console</p>
        <h1 className="page-title">Dashboard</h1>
        <p className="page-subtitle">안녕하세요, {profile.displayName}님. 지금 처리할 일정과 자료를 바로 실행하세요.</p>
      </header>

      <section className={styles.hero}>
        <article className={styles.heroMain}>
          <p className="page-kicker">Current Term</p>
          <h2 className={styles.courseTitle}>{course?.title || COURSE_TITLE}</h2>
          <p className={styles.courseMeta}>Classroom ID: {COURSE_ID}</p>
          <div className={styles.courseActions}>
            <a
              href="https://classroom.google.com/c/ODQxNjY5MTU2NzQ0"
              target="_blank"
              rel="noreferrer"
              className={styles.primaryBtn}
            >
              Google Classroom <ExternalLink size={14} />
            </a>
            <Link href="/schedule" className={styles.secondaryBtn}>
              이번 주 일정 열기
            </Link>
          </div>
          <div className={styles.heroMeta}>
            <span className={`${styles.tag} ${syncToneClass}`}>{getSyncStatusLabel(classroomSync.status)}</span>
            <span className={styles.tag}>
              {classroomSync.lastSucceededAt
                ? `마지막 성공 ${formatDateTime(classroomSync.lastSucceededAt)}`
                : "아직 동기화 기록 없음"}
            </span>
          </div>
        </article>

        <div className={styles.kpiGrid}>
          <article className={styles.kpiCard}>
            <p className={styles.kpiLabel}>Next Up</p>
            <p className={styles.kpiValue}>{upcomingItems.length}</p>
            <p className={styles.kpiHint}>가까운 마감/학사 일정</p>
          </article>
          <article className={styles.kpiCard}>
            <p className={styles.kpiLabel}>Unread</p>
            <p className={styles.kpiValue}>{unreadCount}</p>
            <p className={styles.kpiHint}>아직 열람하지 않은 자료</p>
          </article>
          <article className={styles.kpiCard}>
            <p className={styles.kpiLabel}>Summary Gap</p>
            <p className={styles.kpiValue}>{summaryGapCount}</p>
            <p className={styles.kpiHint}>요약이 없는 문서</p>
          </article>
        </div>
      </section>

      <section className={styles.priorityStrip}>
        <article className={`card ${styles.priorityCard}`}>
          <div className={styles.priorityHeader}>
            <div>
              <p className={styles.priorityKicker}>Today</p>
              <h3 className={styles.priorityTitle}>지금 바로 할 일</h3>
            </div>
            <span className={styles.priorityBadge}>{upcomingItems.length > 0 ? "Action Ready" : "Clear"}</span>
          </div>
          <div className={styles.priorityActions}>
            <Link href="/schedule" className={styles.priorityAction}>
              <CalendarClock size={16} />
              일정부터 처리하기
            </Link>
            <Link href="/materials" className={styles.priorityAction}>
              <BookOpenCheck size={16} />
              읽지 않은 자료 보기
            </Link>
            <Link href="/bulletin" className={styles.priorityAction}>
              <Sparkles size={16} />
              공지 보드 확인하기
            </Link>
          </div>
        </article>
      </section>

      <section className={styles.actionGrid}>
        <DashboardContinueReading />

        <article className={`card ${styles.section}`}>
          <div className={styles.sectionHeader}>
            <div>
              <p className={styles.sectionEyebrow}>Next Due</p>
              <h3 className={styles.sectionTitle}>다음 마감 3개</h3>
            </div>
            <Link href="/schedule" className={styles.actionLink}>
              전체 일정 보기
            </Link>
          </div>

          <ul className={styles.actionList}>
            {upcomingItems.length ? (
              upcomingItems.map((item) => (
                <li key={`${item.source}-${item.id}`}>
                  <Link
                    href={`/schedule#schedule-item-${item.source.toLowerCase()}-${item.id}`}
                    className={styles.actionRow}
                  >
                    <span className={styles.actionIconWrap}>
                      <CalendarClock size={16} className={styles.materialIcon} />
                    </span>
                    <div className={styles.actionContent}>
                      <p className={styles.materialTitle}>{item.title}</p>
                      <p className={styles.materialMeta}>
                        {item.source === "MANUAL" ? "학사 일정" : "Classroom"} · {formatDateTime(item.startAt!)}
                      </p>
                    </div>
                    <ArrowRight size={16} className={styles.actionArrow} />
                  </Link>
                </li>
              ))
            ) : (
              <li className={styles.emptyCard}>다가오는 일정이 없습니다.</li>
            )}
          </ul>
        </article>

        <article className={`card ${styles.section}`}>
          <div className={styles.sectionHeader}>
            <div>
              <p className={styles.sectionEyebrow}>Reading Queue</p>
              <h3 className={styles.sectionTitle}>읽지 않은 자료</h3>
            </div>
            <Link href="/materials" className={styles.actionLink}>
              자료 라이브러리
            </Link>
          </div>

          <ul className={styles.actionList}>
            {unreadMaterials.length ? (
              unreadMaterials.map((item) => (
                <li key={item.id}>
                  <Link href={`/materials/view?path=${encodeURIComponent(item.localUrl)}`} className={styles.actionRow}>
                    <span className={styles.actionIconWrap}>
                      <FileText size={16} className={styles.materialIcon} />
                    </span>
                    <div className={styles.actionContent}>
                      <p className={styles.materialTitle}>{item.title}</p>
                      <p className={styles.materialMeta}>{item.type.toUpperCase()} · 아직 읽지 않음</p>
                      {item.artifacts.length ? (
                        <div className={styles.artifactBadgeRow}>
                          {listMaterialArtifactLabels(item.artifacts).map((label) => (
                            <span key={`${item.id}-${label}`} className={styles.artifactBadge}>
                              {label}
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </div>
                    <ArrowRight size={16} className={styles.actionArrow} />
                  </Link>
                </li>
              ))
            ) : (
              <li className={styles.emptyCard}>
                <CheckCircle2 size={16} />
                모두 읽은 상태입니다.
              </li>
            )}
          </ul>
        </article>

        <article className={`card ${styles.section}`}>
          <div className={styles.sectionHeader}>
            <div>
              <p className={styles.sectionEyebrow}>Summary Queue</p>
              <h3 className={styles.sectionTitle}>요약 없는 문서</h3>
            </div>
            <Link href="/materials" className={styles.actionLink}>
              문서 전체 보기
            </Link>
          </div>

          <ul className={styles.actionList}>
            {materialsMissingSummary.length ? (
              materialsMissingSummary.map((item) => (
                <li key={item.id}>
                  <Link href={`/materials/view?path=${encodeURIComponent(item.localUrl)}`} className={styles.actionRow}>
                    <span className={styles.actionIconWrap}>
                      <Sparkles size={16} className={styles.materialIcon} />
                    </span>
                    <div className={styles.actionContent}>
                      <p className={styles.materialTitle}>{item.title}</p>
                      <p className={styles.materialMeta}>
                        {item.type.toUpperCase()} · {item.isRead ? "읽음" : "읽기 전"} · 요약 필요
                      </p>
                      {item.artifactLabels.length ? (
                        <div className={styles.artifactBadgeRow}>
                          {item.artifactLabels.map((label) => (
                            <span key={`${item.id}-${label}`} className={styles.artifactBadge}>
                              {label}
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </div>
                    <ArrowRight size={16} className={styles.actionArrow} />
                  </Link>
                </li>
              ))
            ) : (
              <li className={styles.emptyCard}>
                <CheckCircle2 size={16} />
                요약 누락 문서가 없습니다.
              </li>
            )}
          </ul>
        </article>

        <article className={`card ${styles.section}`}>
          <div className={styles.sectionHeader}>
            <div>
              <p className={styles.sectionEyebrow}>Operations</p>
              <h3 className={styles.sectionTitle}>Sync Center</h3>
            </div>
          </div>
          <div className={styles.syncCard}>
            <div className={styles.syncHeader}>
              <div>
                <p className={styles.syncTitle}>Classroom 자료/과제 동기화</p>
                <p className={styles.syncMeta}>{getSyncStatusDescription(classroomSync)}</p>
              </div>
              <span className={`${styles.statusPill} ${syncToneClass}`}>{getSyncStatusLabel(classroomSync.status)}</span>
            </div>
            {classroomSync.lastMessage ? <p className={styles.syncMessage}>{classroomSync.lastMessage}</p> : null}
            <div className={styles.syncStats}>
              <div className={styles.syncStat}>
                <span className={styles.syncStatLabel}>Assignments</span>
                <span className={styles.syncStatValue}>{totalAssignments}</span>
              </div>
              <div className={styles.syncStat}>
                <span className={styles.syncStatLabel}>Due Dates</span>
                <span className={styles.syncStatValue}>{dueAssignments}</span>
              </div>
            </div>
            <form action={syncClassroomDataAction}>
              <button type="submit" className={styles.secondaryBtn}>
                <RefreshCw size={14} />
                Classroom 동기화 실행
              </button>
            </form>
          </div>
        </article>
      </section>

      <section className={styles.timelineGrid}>
        <article className={`card ${styles.timeline}`}>
          <div className={styles.sectionHeader}>
            <h3 className={styles.sectionTitle}>Workflow Notes</h3>
          </div>
          <div className={styles.timelineBody}>
            <div className={styles.timelineItem}>
              <p className={styles.timelineItemTitle}>읽기 우선순위</p>
              <p className={styles.timelineItemText}>읽지 않은 문서부터 열고, 필요한 문서는 요약을 생성해 개인 지식 베이스로 저장합니다.</p>
            </div>
            <div className={styles.timelineItem}>
              <p className={styles.timelineItemTitle}>
                <Clock3 size={14} style={{ marginRight: 6, verticalAlign: "text-bottom" }} />
                운영 방식
              </p>
              <p className={styles.timelineItemText}>대시보드는 전체 인덱스가 아니라 실행 보드입니다. 자세한 목록은 각 전용 화면에서 처리합니다.</p>
            </div>
          </div>
        </article>
      </section>
    </>
  );
}

function formatDateTime(value: Date) {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(value);
}

function getSyncStatusLabel(status: string) {
  switch (status) {
    case "SUCCESS":
      return "Synced";
    case "ERROR":
      return "Failed";
    case "RUNNING":
      return "Running";
    default:
      return "Idle";
  }
}

function getSyncStatusDescription(syncState: Awaited<ReturnType<typeof fetchSyncState>>) {
  if (syncState.status === "ERROR") {
    return syncState.lastFinishedAt
      ? `실패 시각 ${formatDateTime(syncState.lastFinishedAt)}`
      : "최근 실패 기록이 있습니다.";
  }

  if (syncState.lastSucceededAt) {
    return `최근 성공 ${formatDateTime(syncState.lastSucceededAt)}${syncState.lastItemCount !== null ? ` · ${syncState.lastItemCount}건` : ""}`;
  }

  if (syncState.status === "RUNNING" && syncState.lastStartedAt) {
    return `실행 시작 ${formatDateTime(syncState.lastStartedAt)}`;
  }

  return "아직 수동 동기화를 실행하지 않았습니다.";
}
