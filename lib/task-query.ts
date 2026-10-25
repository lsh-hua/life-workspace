import { and, eq, gte, lt, or } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import type { tasks } from "../db/schema";
import type { LocalDayWindow } from "./day-rules";

type TaskDayColumns = Pick<typeof tasks, "dueDate" | "isToday" | "status" | "completedAt">;

// 到期任务、手动顺延任务及本地今日完成任务共用筛选口径，不改历史。
export function todayTaskWhere(table: TaskDayColumns, day: LocalDayWindow): SQL {
  return or(
    eq(table.dueDate, day.date),
    and(eq(table.isToday, 1), eq(table.status, "todo")),
    and(
      eq(table.status, "done"),
      gte(table.completedAt, day.start),
      lt(table.completedAt, day.end),
    ),
  )!;
}
