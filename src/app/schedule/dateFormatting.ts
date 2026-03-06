const seoulDateTimePartsFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "numeric",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  hourCycle: "h23",
});

const seoulWeekdayFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "Asia/Seoul",
  weekday: "short",
});

const weekdayMap: Record<string, string> = {
  Mon: "월",
  Tue: "화",
  Wed: "수",
  Thu: "목",
  Fri: "금",
  Sat: "토",
  Sun: "일",
};

type SeoulDateParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: string;
};

function getSeoulDateParts(date: Date): SeoulDateParts {
  const parts = seoulDateTimePartsFormatter.formatToParts(date);
  const lookup = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  return {
    year: Number(lookup.year),
    month: Number(lookup.month),
    day: Number(lookup.day),
    hour: Number(lookup.hour),
    minute: lookup.minute,
  };
}

export function formatScheduleDateTime(value: string | null) {
  if (!value) return "기한 없음";

  const parts = getSeoulDateParts(new Date(value));
  const period = parts.hour < 12 ? "오전" : "오후";
  const hour = parts.hour % 12 || 12;

  return `${parts.year}. ${parts.month}. ${parts.day}. ${period} ${hour}:${parts.minute}`;
}

export function toDateTimeLocalValue(value: string | null) {
  if (!value) return "";

  const parts = getSeoulDateParts(new Date(value));
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}T${String(parts.hour).padStart(2, "0")}:${parts.minute}`;
}

export function formatScheduleMonthLabel(date: Date) {
  const parts = getSeoulDateParts(date);
  return `${parts.year}년 ${parts.month}월`;
}

export function formatScheduleDayLabel(date: Date) {
  const parts = getSeoulDateParts(date);
  const weekday = weekdayMap[seoulWeekdayFormatter.format(date)] ?? "";
  return `${parts.month}월 ${parts.day}일 ${weekday}요일`;
}

export function formatScheduleTimeLabel(value: string | null) {
  if (!value) return "시간 미정";

  const parts = getSeoulDateParts(new Date(value));
  const period = parts.hour < 12 ? "오전" : "오후";
  const hour = parts.hour % 12 || 12;
  return `${period} ${hour}:${parts.minute}`;
}
