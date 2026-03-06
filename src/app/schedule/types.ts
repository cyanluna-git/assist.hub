export type ScheduleItemView = {
  id: string;
  source: "CLASSROOM" | "MANUAL";
  title: string;
  description: string | null;
  startAt: string | null;
  endAt: string | null;
  isPinned: boolean;
  status: string;
};
