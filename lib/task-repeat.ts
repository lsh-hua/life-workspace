export type TaskRepeatRule = {
  frequency: "daily" | "weekdays" | "weekly" | "monthly";
  basis: "schedule" | "completion";
  anchorDate: string;
};

export function validTaskDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function parseTaskRepeat(value: unknown): TaskRepeatRule | null {
  if (typeof value !== "string") return null;
  try {
    const rule = JSON.parse(value);
    if (!rule || typeof rule !== "object" || Array.isArray(rule) ||
        !["daily", "weekdays", "weekly", "monthly"].includes(rule.frequency) ||
        !["schedule", "completion"].includes(rule.basis) || !validTaskDate(rule.anchorDate)) return null;
    return { frequency: rule.frequency, basis: rule.basis, anchorDate: rule.anchorDate };
  } catch { return null; }
}

export function serializeTaskRepeat(rule: TaskRepeatRule): string {
  return JSON.stringify({ frequency: rule.frequency, basis: rule.basis, anchorDate: rule.anchorDate });
}

const dayMs = 86_400_000;
const timestamp = (date: string) => new Date(`${date}T00:00:00Z`).getTime();
const dateKey = (time: number) => new Date(time).toISOString().slice(0, 10);
const addDays = (date: string, days: number) => dateKey(timestamp(date) + days * dayMs);

function monthDate(reference: string, monthOffset: number, targetDay: number) {
  const date = new Date(timestamp(reference));
  const first = new Date(timestamp(reference));
  first.setUTCDate(1);
  first.setUTCMonth(date.getUTCMonth() + monthOffset);
  const last = new Date(first);
  last.setUTCMonth(first.getUTCMonth() + 1);
  last.setUTCDate(0);
  first.setUTCDate(Math.min(targetDay, last.getUTCDate()));
  return dateKey(first.getTime());
}

function nextWeekday(date: string) {
  const next = addDays(date, 1);
  const weekday = new Date(timestamp(next)).getUTCDay();
  return addDays(next, weekday === 0 ? 1 : weekday === 6 ? 2 : 0);
}

export function nextRepeatDate(rule: TaskRepeatRule, currentDate: string, completedDate: string): string {
  const bound = rule.basis === "completion" ? completedDate : [currentDate, completedDate, rule.anchorDate].sort().at(-1)!;
  if (rule.frequency === "daily") return addDays(bound, 1);
  if (rule.frequency === "weekdays") return nextWeekday(bound);
  if (rule.frequency === "weekly") {
    const passed = Math.round((timestamp(bound) - timestamp(rule.anchorDate)) / dayMs);
    return addDays(bound, rule.basis === "completion" ? 7 : 7 - passed % 7);
  }
  const targetDay = new Date(timestamp(rule.basis === "completion" ? completedDate : rule.anchorDate)).getUTCDate();
  const candidate = monthDate(bound, 0, targetDay);
  return rule.basis === "schedule" && candidate > bound ? candidate : monthDate(bound, 1, targetDay);
}

export function nextRepeatDates(
  rule: TaskRepeatRule,
  dates: { plannedDate: string | null; dueDate: string | null },
  completedDate: string,
): { plannedDate: string | null; dueDate: string | null } {
  const scheduled = dates.plannedDate ?? dates.dueDate ?? rule.anchorDate;
  const next = nextRepeatDate(rule, scheduled, completedDate);
  const deadlineOffset = dates.plannedDate && dates.dueDate
    ? Math.round((timestamp(dates.dueDate) - timestamp(dates.plannedDate)) / dayMs) : 0;
  return {
    plannedDate: dates.plannedDate || !dates.dueDate ? next : null,
    dueDate: dates.dueDate ? addDays(next, deadlineOffset) : null,
  };
}
