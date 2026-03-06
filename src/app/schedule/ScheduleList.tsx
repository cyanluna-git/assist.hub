"use client";

import { FormEvent, useState } from "react";
import { Calendar as CalendarIcon, CheckCircle, Clock, Pencil, Pin, Trash2 } from "lucide-react";
import {
  deleteManualScheduleAction,
  toggleManualSchedulePinnedAction,
  updateManualScheduleAction,
} from "./actions";
import { formatScheduleDateTime, toDateTimeLocalValue } from "./dateFormatting";
import type { ScheduleItemView } from "./types";
import styles from "./schedule.module.css";

type ScheduleListProps = {
  items: ScheduleItemView[];
};

function getBadgeClass(status: string) {
  const normalized = status.toLowerCase();
  if (normalized === "done") return `${styles.badge} ${styles.done}`;
  if (normalized === "in_progress") return `${styles.badge} ${styles.inprogress}`;
  return `${styles.badge} ${styles.todo}`;
}

export default function ScheduleList({ items }: ScheduleListProps) {
  const [editingId, setEditingId] = useState<string | null>(null);

  function handleDeleteSubmit(event: FormEvent<HTMLFormElement>, title: string) {
    if (!window.confirm(`'${title}' 일정을 삭제하시겠습니까?`)) {
      event.preventDefault();
    }
  }

  return (
    <section className={styles.list}>
      {items.length === 0 ? (
        <div className={styles.empty}>
          <CalendarIcon size={38} />
          <p>아직 등록된 일정이 없습니다. 동기화를 실행하거나 위 폼에서 직접 학사 일정을 추가하세요.</p>
        </div>
      ) : (
        items.map((work) => {
          const isEditing = work.source === "MANUAL" && editingId === work.id;

          return (
            <article
              id={`schedule-item-${work.source.toLowerCase()}-${work.id}`}
              key={`${work.source}-${work.id}`}
              className={`card ${styles.cardItem}`}
            >
              <span className={styles.iconWrap}>
                {work.status === "DONE" ? <CheckCircle size={18} color="#1c8b57" /> : <Clock size={18} color="#b3731f" />}
              </span>

              <div className={`${styles.content} ${work.isPinned ? styles.pinnedContent : ""}`}>
                <div className={styles.titleRow}>
                  <h3 className={styles.title}>{work.title}</h3>
                  <span className={`${styles.sourceChip} ${work.source === "MANUAL" ? styles.manualChip : styles.classroomChip}`}>
                    {work.source === "MANUAL" ? "Manual" : "Classroom"}
                  </span>
                  {work.isPinned ? (
                    <span className={styles.pinBadge}>
                      <Pin size={11} />
                      중요
                    </span>
                  ) : null}
                </div>
                <p className={styles.meta}>
                  {work.source === "MANUAL"
                    ? `일정: ${formatScheduleDateTime(work.startAt)}`
                    : `일시: ${formatScheduleDateTime(work.startAt)}`}
                </p>
                {work.description ? <p className={styles.description}>{work.description}</p> : null}

                {work.source === "MANUAL" ? (
                  <div className={styles.manualActions}>
                    <button
                      type="button"
                      className={styles.secondaryButton}
                      onClick={() => setEditingId((current) => (current === work.id ? null : work.id))}
                    >
                      <Pencil size={14} />
                      {isEditing ? "닫기" : "수정"}
                    </button>

                    <form action={toggleManualSchedulePinnedAction}>
                      <input type="hidden" name="id" value={work.id} />
                      <input type="hidden" name="nextPinned" value={String(!work.isPinned)} />
                      <button type="submit" className={`${styles.secondaryButton} ${work.isPinned ? styles.pinButtonActive : ""}`}>
                        <Pin size={14} />
                        {work.isPinned ? "중요 해제" : "중요 표시"}
                      </button>
                    </form>

                    <form action={deleteManualScheduleAction} onSubmit={(event) => handleDeleteSubmit(event, work.title)}>
                      <input type="hidden" name="id" value={work.id} />
                      <button type="submit" className={`${styles.secondaryButton} ${styles.deleteButton}`}>
                        <Trash2 size={14} />
                        삭제
                      </button>
                    </form>
                  </div>
                ) : null}

                {isEditing ? (
                  <form action={updateManualScheduleAction} className={styles.inlineEditor}>
                    <input type="hidden" name="id" value={work.id} />
                    <input name="title" className={styles.input} defaultValue={work.title} required />
                    <div className={styles.formRow}>
                      <label className={styles.field}>
                        <span className={styles.label}>시작 일시</span>
                        <input
                          name="startAt"
                          type="datetime-local"
                          className={styles.input}
                          defaultValue={toDateTimeLocalValue(work.startAt)}
                          required
                        />
                      </label>
                      <label className={styles.field}>
                        <span className={styles.label}>종료 일시</span>
                        <input
                          name="endAt"
                          type="datetime-local"
                          className={styles.input}
                          defaultValue={toDateTimeLocalValue(work.endAt)}
                        />
                      </label>
                    </div>
                    <div className={styles.formRow}>
                      <label className={styles.field}>
                        <span className={styles.label}>상태</span>
                        <select name="status" className={styles.select} defaultValue={work.status}>
                          <option value="TODO">TODO</option>
                          <option value="IN_PROGRESS">IN_PROGRESS</option>
                          <option value="DONE">DONE</option>
                        </select>
                      </label>
                    </div>
                    <textarea
                      name="description"
                      className={styles.textarea}
                      defaultValue={work.description ?? ""}
                      placeholder="메모, 링크, 장소를 수정할 수 있습니다."
                    />
                    <div className={styles.inlineEditorActions}>
                      <button type="submit" className={styles.addBtn}>
                        저장
                      </button>
                      <button
                        type="button"
                        className={styles.secondaryButton}
                        onClick={() => setEditingId(null)}
                      >
                        취소
                      </button>
                    </div>
                  </form>
                ) : null}
              </div>

              <span className={getBadgeClass(work.status)}>{work.status}</span>
            </article>
          );
        })
      )}
    </section>
  );
}
