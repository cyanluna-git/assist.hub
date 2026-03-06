import prisma from "@/lib/prisma";
import { syncMaterials } from "@/lib/sync";
import { Clock3, ExternalLink, FileText } from "lucide-react";
import Link from "next/link";
import styles from "./dashboard.module.css";

export default async function Dashboard() {
  await syncMaterials();

  const course = await prisma.course.findUnique({
    where: { id: "841669156744" },
    include: {
      materials: {
        take: 5,
        orderBy: { id: "desc" },
      },
      assignments: true,
    },
  });

  const totalAssignments = course?.assignments.length ?? 0;
  const dueAssignments = course?.assignments.filter((item) => item.dueDate).length ?? 0;
  const unreadMaterials = course?.materials.filter((item) => !item.isRead).length ?? 0;

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
          <h2 className={styles.courseTitle}>{course?.title || "수업 정보 없음"}</h2>
          <p className={styles.courseMeta}>Classroom ID: 841669156744</p>
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
            <span className={styles.tag}>Sync Enabled</span>
            <span className={styles.tag}>Prisma + SQLite</span>
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
              <li className={styles.materialRow}>동기화된 자료가 없습니다.</li>
            )}
          </ul>
        </article>

        <article className={`card ${styles.section}`}>
          <div className={styles.sectionHeader}>
            <h3 className={styles.sectionTitle}>Next Action</h3>
          </div>
          <div className={styles.timelineItem}>
            <p className={styles.timelineItemTitle}>일정 동기화 점검</p>
            <p className={styles.timelineItemText}>Schedule 화면에서 Google Calendar 내보내기를 실행해 이번 주 마감 일정을 반영하세요.</p>
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
                준비 중 기능
              </p>
              <p className={styles.timelineItemText}>과제 상태 자동 추적과 타임라인 시각화를 다음 라운드에서 통합할 예정입니다.</p>
            </div>
          </div>
        </article>
      </section>
    </>
  );
}
