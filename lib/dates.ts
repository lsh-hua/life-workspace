import { format, addDays, startOfWeek, endOfWeek, isToday as dfIsToday, isBefore, parseISO } from "date-fns";

export const fmtDate = (d: Date) => format(d, "yyyy-MM-dd");
export const todayStr = () => fmtDate(new Date());
export const nowIso = () => new Date().toISOString();

/** 本周（周一开始）7 天的日期字符串 */
export function weekDates(ref: Date = new Date()): string[] {
  const start = startOfWeek(ref, { weekStartsOn: 1 });
  return Array.from({ length: 7 }, (_, i) => fmtDate(addDays(start, i)));
}

export function weekRangeLabel(ref: Date = new Date()): string {
  const s = startOfWeek(ref, { weekStartsOn: 1 });
  const e = endOfWeek(ref, { weekStartsOn: 1 });
  return `${format(s, "M月d日")} – ${format(e, "M月d日")}`;
}

export const isOverdue = (dateStr: string) =>
  isBefore(parseISO(dateStr), parseISO(todayStr())) && dateStr !== todayStr();

export const isToday = dfIsToday;

export const WEEKDAY_CN = ["一", "二", "三", "四", "五", "六", "日"];
