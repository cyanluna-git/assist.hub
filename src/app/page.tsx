import prisma from "@/lib/prisma";
import { COURSE_ID, COURSE_TITLE } from "@/lib/sync";
import { fetchSyncState } from "@/lib/sync-state";
import { Clock3, ExternalLink, FileText, RefreshCw } from "lucide-react";
import Link from "next/link";
import { syncClassroomDataAction } from "./dashboard-actions";
import styles from "./dashboard.module.css";

export default async function Dashboard() {
  const [course, classroomSync] = await Promise.all([
    prisma.course.findUnique({
      where: { id: COURSE_ID },
      include: {
        materials: {
          take: 5,
          orderBy: { id: "desc" },
        },
        assignments: true,
      },
    }),
    fetchSyncState("CLASSROOM"),
  ]);

  const totalAssignments = course?.assignments.length ?? 0;
  const dueAssignments = course?.assignments.filter((item) => item.dueDate).length ?? 0;
  const unreadMaterials = course?.materials.filter((item) => !item.isRead).length ?? 0;

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
        <p className="page-subtitle">안녕하세요, 박근윤님. 오늘 학습 흐름과 우선순위를 확인하세요.</p>
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
            <Link href="/materials" className={styles.secondaryBtn}>
              자료 라이브러리 열기
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
            <p className={styles.kpiLabel}>Assignments</p>
            <p className={styles.kpiValue}>{totalAssignments}</p>
            <p className={styles.kpiHint}>전체 등록 과제</p>
          </article>
          <article className={styles.kpiCard}>
            <p className={styles.kpiLabel}>Due Dates</p>
            <p className={styles.kpiValue}>{dueAssignments}</p>
            <p className={styles.kpiHint}>마감일 지정 항목</p>
          </article>
          <article className={styles.kpiCard}>
            <p className={styles.kpiLabel}>Unread</p>
            <p className={styles.kpiValue}>{unreadMaterials}</p>
            <p className={styles.kpiHint}>최근 자료 기준</p>
          </article>
        </div>
      </section>

      <section className={styles.contentGrid}>
        <article className={`card ${styles.section}`}>
          <div className={styles.sectionHeader}>
            <h3 className={styles.sectionTitle}>Recent Materials</h3>
            <Link href="/materials" className={styles.actionLink}>
              View all
            </Link>
          </div>

          <ul className={styles.materialList}>
            {course?.materials.length ? (
              course.materials.map((item) => (
                <li key={item.id}>
                  <Link href={`/materials/view?path=${encodeURIComponent(item.localUrl)}`} className={styles.materialRow}>
                    <FileText size={16} className={styles.materialIcon} />
                    <div className={styles.materialText}>
                      <p className={styles.materialTitle}>{item.title}</p>
                      <p className={styles.materialMeta}>{item.type.toUpperCase()} • {item.isRead ? "Read" : "Unread"}</p>
                    </div>
                  </Link>
                </li>
              ))
            ) : (
              <li className={styles.materialRow}>동기화된 자료가 없습니다. 아래 Sync Center에서 직접 동기화를 실행하세요.</li>
            )}
          </ul>
        </article>

        <article className={`card ${styles.section}`}>
          <div className={styles.sectionHeader}>
            <h3 className={styles.sectionTitle}>Sync Center</h3>
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
            <form action={syncClassroomDataAction}>
              <button type="submit" className={styles.secondaryBtn}>
                <RefreshCw size={14} />
                Classroom 동기화 실행
              </button>
            </form>
          </div>
        </article>

        <article className={`card ${styles.timeline}`}>
          <div className={styles.sectionHeader}>
            <h3 className={styles.sectionTitle}>Timeline</h3>
          </div>
          <div className={styles.timelineBody}>
            <div className={styles.timelineItem}>
              <p className={styles.timelineItemTitle}>자료 읽기 파이프라인</p>
              <p className={styles.timelineItemText}>최근 업로드된 문서부터 열람하고 요약을 저장해 개인 지식 베이스를 확장합니다.</p>
            </div>
            <div className={styles.timelineItem}>
              <p className={styles.timelineItemTitle}>
                <Clock3 size={14} style={{ marginRight: 6, verticalAlign: "text-bottom" }} />
                운영 방식
              </p>
              <p className={styles.timelineItemText}>외부 API 동기화는 렌더 중 자동 실행하지 않습니다. 필요할 때 직접 실행하고, 실패 원인은 상태 카드에서 바로 확인합니다.</p>
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
