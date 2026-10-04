import { differenceInCalendarDays, parseISO, startOfDay } from "date-fns";
import type { Course, CourseOverride } from "@/db/schema";

export const DEFAULT_PERIOD_STARTS = [
  "08:00",
  "08:50",
  "10:00",
  "10:50",
  "14:00",
  "14:50",
  "16:00",
  "16:50",
  "19:00",
  "19:50",
  "20:40",
  "21:30",
] as const;

export type CourseScheduleData = {
  courses: Course[];
  overrides: CourseOverride[];
  semesterStart: string | null;
  totalWeeks: number;
  reminderEnabled: boolean;
  reminderMinutes: number;
  periodStarts: string[];
};

export type CourseOccurrence = {
  course: Course;
  week: number;
  startPeriod: number;
  endPeriod: number;
  location: string | null;
  startAt: Date;
};

export function isValidPeriodStart(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{2}:\d{2}$/.test(value)) return false;
  const [hour, minute] = value.split(":").map(Number);
  return hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59;
}

export function normalizePeriodStarts(value: unknown): string[] {
  if (!Array.isArray(value) || value.length !== DEFAULT_PERIOD_STARTS.length) {
    return [...DEFAULT_PERIOD_STARTS];
  }
  return value.every(isValidPeriodStart) ? value : [...DEFAULT_PERIOD_STARTS];
}

function isCourseActive(course: Course, week: number) {
  if (week < course.startWeek || week > course.endWeek) return false;
  if (course.weekType === "odd") return week % 2 === 1;
  if (course.weekType === "even") return week % 2 === 0;
  return true;
}

function weekday(date: Date) {
  return ((date.getDay() + 6) % 7) + 1;
}

function startTime(date: Date, value: string) {
  const [hour, minute] = value.split(":").map(Number);
  const result = new Date(date);
  result.setHours(hour, minute, 0, 0);
  return result;
}

// 将周期课程、单双周与单周调整收敛为某一天的真实课程实例。
export function resolveCourseOccurrences(data: CourseScheduleData, date: Date): CourseOccurrence[] {
  if (!data.semesterStart) return [];

  const semesterStart = startOfDay(parseISO(data.semesterStart));
  const day = startOfDay(date);
  const elapsedDays = differenceInCalendarDays(day, semesterStart);
  const week = Math.floor(elapsedDays / 7) + 1;
  if (week < 1 || week > data.totalWeeks) return [];

  const dayOfWeek = weekday(date);
  const periodStarts = normalizePeriodStarts(data.periodStarts);
  const rows: CourseOccurrence[] = [];

  for (const course of data.courses) {
    const override = data.overrides.find((item) => item.courseId === course.id && item.week === week);
    if (override?.action === "cancel") continue;

    const custom = override?.action === "custom" ? override : null;
    if (!custom && !isCourseActive(course, week)) continue;

    const actualDay = custom?.dayOfWeek ?? course.dayOfWeek;
    if (actualDay !== dayOfWeek) continue;

    const actualStart = custom?.startPeriod ?? course.startPeriod;
    const start = periodStarts[actualStart - 1];
    if (!start) continue;

    rows.push({
      course,
      week,
      startPeriod: actualStart,
      endPeriod: custom?.endPeriod ?? course.endPeriod,
      location: custom?.location ?? course.location,
      startAt: startTime(date, start),
    });
  }

  return rows.sort((left, right) => left.startAt.getTime() - right.startAt.getTime());
}

export function findNextCourse(data: CourseScheduleData, now: Date) {
  return resolveCourseOccurrences(data, now).find((item) => item.startAt.getTime() > now.getTime()) ?? null;
}
