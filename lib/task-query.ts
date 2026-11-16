import { and, eq, gte, isNull, lt, lte, or, sql } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import type { tasks } from "../db/schema";
import type { LocalDayWindow } from "./day-rules";

type TaskDayColumns = Pick<typeof tasks, "dueDate" | "plannedDate" | "isToday" | "status" | "completedAt" | "deletedAt">;

// 计划视图优先使用计划日；没有计划日的旧任务继续按原日期归属。
export function taskScheduleDate(table: Pick<typeof tasks, "plannedDate" | "dueDate">) {
  return sql<string>`coalesce(${table.plannedDate}, ${table.dueDate})`;
}

export function taskPeriodWhere(table: TaskDayColumns, start: string, end: string): SQL {
  const date = taskScheduleDate(table);
  return and(isNull(table.deletedAt), gte(date, start), lte(date, end))!;
}

// 到期任务、手动顺延任务及本地今日完成任务共用筛选口径，不改历史。
export function todayTaskWhere(table: TaskDayColumns, day: LocalDayWindow): SQL {
  return and(isNull(table.deletedAt), or(
    eq(table.dueDate, day.date),
    and(eq(table.status, "todo"), lte(table.plannedDate, day.date)),
    and(eq(table.isToday, 1), eq(table.status, "todo")),
    and(
      eq(table.status, "done"),
      gte(table.completedAt, day.start),
      lt(table.completedAt, day.end),
    ),
  ))!;
}
