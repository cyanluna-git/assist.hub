import prisma from "@/lib/prisma";
import { Calendar as CalendarIcon, CheckCircle, Clock, Share2 } from "lucide-react";
import { handleExport } from "./actions";
import styles from "./schedule.module.css";

function getBadgeClass(status: string) {
  const normalized = status.toLowerCase();
  if (normalized === "done") return `${styles.badge} ${styles.done}`;
  if (normalized === "in_progress") return `${styles.badge} ${styles.inprogress}`;
  return `${styles.badge} ${styles.todo}`;
}

export default async function SchedulePage() {
  const assignments = await prisma.assignment.findMany({
    orderBy: { dueDate: "asc" },
  });

  return (
    <>
      <header className="page-hero">
        <p className="page-kicker">Academic Timeline</p>
        <h1 className="page-title">Schedule</h1>
        <p className="page-subtitle">마감 일정과 과제 상태를 점검하고 Google Calendar로 동기화하세요.</p>
      </header>

      <section className={styles.header}>
        <span />
        <form action={handleExport}>
          <button type="submit" className={styles.exportBtn}>
            <Share2 size={15} /> Google Calendar로 보내기
          </button>
        </form>
      </section>

      <section className={styles.list}>
        {assignments.length === 0 ? (
          <div className={styles.empty}>
            <CalendarIcon size={38} />
            <p>아직 등록된 일정이 없습니다. 대시보드에서 동기화를 먼저 실행하세요.</p>
          </div>
        ) : (
          assignments.map((work) => (
            <article key={work.id} className={`card ${styles.cardItem}`}>
              <span className={styles.iconWrap}>
                {work.status === "DONE" ? <CheckCircle size={18} color="#1c8b57" /> : <Clock size={18} color="#b3731f" />}
              </span>

              <div>
                <h3 className={styles.title}>{work.title}</h3>
                <p className={styles.meta}>
                  {work.dueDate ? `마감: ${new Date(work.dueDate).toLocaleString()}` : "기한 없음"}
                </p>
              </div>

              <span className={getBadgeClass(work.status)}>{work.status}</span>
            </article>
          ))
        )}
      </section>
    </>
  );
}
