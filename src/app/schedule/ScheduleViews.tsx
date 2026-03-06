"use client";

import { useMemo, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, List } from "lucide-react";
import {
  formatScheduleDayLabel,
  formatScheduleMonthLabel,
  formatScheduleTimeLabel,
} from "./dateFormatting";
import ScheduleList from "./ScheduleList";
import type { ScheduleItemView } from "./types";
import styles from "./schedule.module.css";

type ScheduleViewsProps = {
  items: ScheduleItemView[];
  initialViewDate: string;
};

type ViewMode = "list" | "month";

type DayEntry = {
  item: ScheduleItemView;
  date: Date;
  anchorId: string;
};

const weekdayLabels = ["월", "화", "수", "목", "금", "토", "일"];

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function endOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
}

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function toDayKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatMonthLabel(date: Date) {
  return formatScheduleMonthLabel(date);
}

function formatDayLabel(date: Date) {
  return formatScheduleDayLabel(date);
}

function formatTimeLabel(item: ScheduleItemView, date: Date) {
  if (!item.startAt) return "시간 미정";

  const start = new Date(item.startAt);
  const end = item.endAt ? new Date(item.endAt) : null;

  if (!isSameDay(start, date)) {
    return "계속";
  }

  const startTime = formatScheduleTimeLabel(item.startAt);

  if (!end || !isSameDay(end, start)) {
    return startTime;
  }

  const endTime = formatScheduleTimeLabel(item.endAt);

  return `${startTime} - ${endTime}`;
}

function occursOnDate(item: ScheduleItemView, date: Date) {
  if (!item.startAt) return false;

  const day = startOfDay(date);
  const start = startOfDay(new Date(item.startAt));
  const end = item.endAt ? endOfDay(new Date(item.endAt)) : endOfDay(new Date(item.startAt));

  return day.getTime() >= start.getTime() && day.getTime() <= end.getTime();
}

function occursInMonth(item: ScheduleItemView, monthDate: Date) {
  if (!item.startAt) return false;

  const monthStart = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
  const monthEnd = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0, 23, 59, 59, 999);
  const start = new Date(item.startAt);
  const end = item.endAt ? new Date(item.endAt) : start;

  return start <= monthEnd && end >= monthStart;
}

function buildAnchorId(item: ScheduleItemView, date: Date) {
  return `chronology-${item.source.toLowerCase()}-${item.id}-${toDayKey(date)}`;
}

function sortItems(a: ScheduleItemView, b: ScheduleItemView) {
  if (a.isPinned !== b.isPinned) {
    return a.isPinned ? -1 : 1;
  }

  if (!a.startAt && !b.startAt) return 0;
  if (!a.startAt) return 1;
  if (!b.startAt) return -1;
  return new Date(a.startAt).getTime() - new Date(b.startAt).getTime();
}

function buildCalendarCells(monthDate: Date) {
  const firstDay = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
  const offset = (firstDay.getDay() + 6) % 7;
  const gridStart = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1 - offset);

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(gridStart);
    date.setDate(gridStart.getDate() + index);
    return date;
  });
}

function buildMonthChronology(items: ScheduleItemView[], monthDate: Date) {
  const monthItems = items.filter((item) => occursInMonth(item, monthDate)).sort(sortItems);
  const monthStart = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
  const monthEnd = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0);
  const groups = new Map<string, DayEntry[]>();

  for (const item of monthItems) {
    if (!item.startAt) continue;

    const rangeStart = startOfDay(new Date(item.startAt));
    const rangeEnd = item.endAt ? startOfDay(new Date(item.endAt)) : rangeStart;
    const visibleStart = rangeStart > monthStart ? rangeStart : monthStart;
    const visibleEnd = rangeEnd < monthEnd ? rangeEnd : monthEnd;

    for (let current = new Date(visibleStart); current <= visibleEnd; current.setDate(current.getDate() + 1)) {
      const date = new Date(current);
      const key = toDayKey(date);
      const entry: DayEntry = {
        item,
        date,
        anchorId: buildAnchorId(item, date),
      };
      const existing = groups.get(key) ?? [];
      existing.push(entry);
      groups.set(key, existing);
    }
  }

  return Array.from(groups.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, entries]) => ({
      key,
      date: new Date(`${key}T00:00:00`),
      entries: entries.sort((a, b) => sortItems(a.item, b.item)),
    }));
}

export default function ScheduleViews({ items, initialViewDate }: ScheduleViewsProps) {
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [monthDate, setMonthDate] = useState(() => new Date(initialViewDate));

  const calendarCells = useMemo(() => buildCalendarCells(monthDate), [monthDate]);
  const chronologyGroups = useMemo(() => buildMonthChronology(items, monthDate), [items, monthDate]);
  const today = useMemo(() => startOfDay(new Date(initialViewDate)), [initialViewDate]);

  return (
    <section className={styles.viewsSection}>
      <div className={`card ${styles.viewToolbar}`}>
        <div className={styles.viewTabs}>
          <button
            type="button"
            className={`${styles.viewTab} ${viewMode === "list" ? styles.viewTabActive : ""}`}
            onClick={() => setViewMode("list")}
          >
            <List size={15} />
            리스트
          </button>
          <button
            type="button"
            className={`${styles.viewTab} ${viewMode === "month" ? styles.viewTabActive : ""}`}
            onClick={() => setViewMode("month")}
          >
            <CalendarDays size={15} />
            월간 보기
          </button>
        </div>

        {viewMode === "month" ? (
          <div className={styles.monthNav}>
            <button
              type="button"
              className={styles.monthNavButton}
              onClick={() => setMonthDate((current) => new Date(current.getFullYear(), current.getMonth() - 1, 1))}
              aria-label="이전 달"
            >
              <ChevronLeft size={16} />
            </button>
            <strong className={styles.monthLabel}>{formatMonthLabel(monthDate)}</strong>
            <button
              type="button"
              className={styles.monthNavButton}
              onClick={() => setMonthDate((current) => new Date(current.getFullYear(), current.getMonth() + 1, 1))}
              aria-label="다음 달"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        ) : null}
      </div>

      {viewMode === "list" ? (
        <ScheduleList items={items} />
      ) : (
        <div className={styles.monthLayout}>
          <section className={`card ${styles.monthPanel}`}>
            <div className={styles.weekdayRow}>
              {weekdayLabels.map((label) => (
                <span key={label} className={styles.weekdayLabel}>
                  {label}
                </span>
              ))}
            </div>

            <div className={styles.calendarGrid}>
              {calendarCells.map((date) => {
                const dayItems = items.filter((item) => occursOnDate(item, date)).sort(sortItems);
                const isCurrentMonth = date.getMonth() === monthDate.getMonth();
                const isToday = isSameDay(date, today);

                return (
                  <article
                    key={date.toISOString()}
                    className={`${styles.dayCell} ${isCurrentMonth ? "" : styles.dayCellMuted} ${isToday ? styles.dayCellToday : ""}`}
                  >
                    <div className={styles.dayCellHeader}>
                      <span className={styles.dayNumber}>{date.getDate()}</span>
                      {dayItems.length ? <span className={styles.dayCount}>{dayItems.length}</span> : null}
                    </div>

                    <div className={styles.dayAgenda}>
                      {dayItems.slice(0, 3).map((item) => {
                        const anchorId = buildAnchorId(item, date);
                        return (
                          <a key={`${anchorId}-summary`} href={`#${anchorId}`} className={styles.dayAgendaItem}>
                            <span className={styles.dayAgendaTime}>{formatTimeLabel(item, date)}</span>
                            <span className={styles.dayAgendaTitle}>{item.title}</span>
                          </a>
                        );
                      })}

                      {dayItems.length > 3 ? (
                        <span className={styles.dayAgendaMore}>+{dayItems.length - 3} more</span>
                      ) : null}
                    </div>
                  </article>
                );
              })}
            </div>
          </section>

          <section className={`card ${styles.chronologyPanel}`}>
            <div className={styles.chronologyHeader}>
              <div>
                <p className={styles.chronologyKicker}>Monthly Chronicle</p>
                <h2 className={styles.chronologyTitle}>{formatMonthLabel(monthDate)} 학사 연대기</h2>
              </div>
            </div>

            {chronologyGroups.length === 0 ? (
              <div className={styles.emptyMonth}>
                <p>선택한 달에는 등록된 일정이 없습니다.</p>
              </div>
            ) : (
              <div className={styles.chronologyGroups}>
                {chronologyGroups.map((group) => (
                  <section key={group.key} className={styles.chronologyGroup}>
                    <div className={styles.chronologyDate}>{formatDayLabel(group.date)}</div>
                    <div className={styles.chronologyEntries}>
                      {group.entries.map(({ item, date, anchorId }) => (
                        <article id={anchorId} key={anchorId} className={styles.chronologyEntry}>
                          <div className={styles.chronologyMeta}>
                            <span className={styles.chronologyTime}>{formatTimeLabel(item, date)}</span>
                            <span className={`${styles.sourceChip} ${item.source === "MANUAL" ? styles.manualChip : styles.classroomChip}`}>
                              {item.source === "MANUAL" ? "Manual" : "Classroom"}
                            </span>
                            {item.isPinned ? <span className={styles.pinBadge}>중요</span> : null}
                            <span className={getStatusBadgeClass(item.status, styles)}>{item.status}</span>
                          </div>
                          <h3 className={styles.chronologyEntryTitle}>{item.title}</h3>
                          {item.description ? <p className={styles.chronologyEntryText}>{item.description}</p> : null}
                          <button
                            type="button"
                            className={styles.detailLink}
                            onClick={() => {
                              const anchor = `schedule-item-${item.source.toLowerCase()}-${item.id}`;
                              setViewMode("list");
                              window.setTimeout(() => {
                                const element = document.getElementById(anchor);
                                if (element) {
                                  element.scrollIntoView({ behavior: "smooth", block: "start" });
                                  window.history.replaceState(null, "", `#${anchor}`);
                                }
                              }, 0);
                            }}
                          >
                            리스트에서 보기
                          </button>
                        </article>
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </section>
  );
}

function getStatusBadgeClass(status: string, classes: typeof styles) {
  const normalized = status.toLowerCase();
  if (normalized === "done") return `${classes.badge} ${classes.done}`;
  if (normalized === "in_progress") return `${classes.badge} ${classes.inprogress}`;
  return `${classes.badge} ${classes.todo}`;
}
