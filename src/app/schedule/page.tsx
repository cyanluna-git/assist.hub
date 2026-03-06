import { fetchUnifiedScheduleItems } from "@/lib/schedule";
import { PlusSquare, Share2 } from "lucide-react";
import { addManualScheduleAction, handleExport } from "./actions";
import ScheduleList from "./ScheduleList";
import styles from "./schedule.module.css";

export default async function SchedulePage() {
  const items = await fetchUnifiedScheduleItems();

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

      <section className={styles.topGrid}>
        <article className={`card ${styles.panel}`}>
          <h2 className={styles.panelTitle}>
            <PlusSquare size={18} style={{ marginRight: 8, verticalAlign: "text-bottom" }} />
            학사 일정 직접 추가
          </h2>
          <p className={styles.panelText}>수업, 인터뷰, 특강, 학사팀 안내 일정을 직접 등록해 한 곳에서 관리합니다.</p>

          <form action={addManualScheduleAction} className={styles.form}>
            <input name="title" className={styles.input} placeholder="예: 오리엔테이션, 특강, 인터뷰" required />
            <div className={styles.formRow}>
              <label className={styles.field}>
                <span className={styles.label}>시작 일시</span>
                <input name="startAt" type="datetime-local" className={styles.input} required />
              </label>
              <label className={styles.field}>
                <span className={styles.label}>종료 일시</span>
                <input name="endAt" type="datetime-local" className={styles.input} />
              </label>
            </div>
            <div className={styles.formRow}>
              <label className={styles.field}>
                <span className={styles.label}>상태</span>
                <select name="status" className={styles.select} defaultValue="TODO">
                  <option value="TODO">TODO</option>
                  <option value="IN_PROGRESS">IN_PROGRESS</option>
                  <option value="DONE">DONE</option>
                </select>
              </label>
            </div>
            <textarea
              name="description"
              className={styles.textarea}
              placeholder="Zoom 링크, 장소, 준비사항, 메모를 적어둘 수 있습니다."
            />
            <button type="submit" className={styles.addBtn}>
              일정 저장
            </button>
          </form>
        </article>

        <article className={`card ${styles.panel}`}>
          <h2 className={styles.panelTitle}>운영 방식</h2>
          <p className={styles.panelText}>
            동기화된 Classroom 과제와 수동으로 입력한 학사 일정을 같은 타임라인에서 확인합니다.
          </p>

          <ul className={styles.helperList}>
            <li>수동 일정은 Google Calendar 내보내기 대상에도 포함됩니다.</li>
            <li>종료 일시를 비워두면 Calendar에서는 기본 1시간 일정으로 등록됩니다.</li>
            <li>상태는 `TODO`, `IN_PROGRESS`, `DONE`으로 관리합니다.</li>
          </ul>
        </article>
      </section>

      <ScheduleList
        items={items.map((item) => ({
          ...item,
          startAt: item.startAt ? item.startAt.toISOString() : null,
          endAt: item.endAt ? item.endAt.toISOString() : null,
        }))}
      />
    </>
  );
}
