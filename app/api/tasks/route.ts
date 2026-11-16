import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db";
import { and, asc, desc, eq, isNotNull, isNull } from "drizzle-orm";
import { todayStr, weekDates, nowIso } from "@/lib/dates";
import { localDayWindow } from "@/lib/day-rules";
import { taskPeriodWhere, taskScheduleDate, todayTaskWhere } from "@/lib/task-query";
import { parseTaskInput, validTaskDate } from "@/lib/task-input";

// 最近删除单独查询；常规入口始终排除已删除任务。
export async function GET(req: NextRequest) {
  const filter = req.nextUrl.searchParams.get("filter") ?? "all";
  const date = req.nextUrl.searchParams.get("date");

  if (!["all", "today", "week", "nodate", "deleted"].includes(filter) || (date !== null && !validTaskDate(date))) {
    return NextResponse.json({ error: "任务筛选或日期无效。" }, { status: 400 });
  }
  const days = weekDates();
  const filters = {
    all: undefined,
    today: todayTaskWhere(schema.tasks, localDayWindow(todayStr())),
    week: taskPeriodWhere(schema.tasks, days[0], days[6]),
    nodate: and(isNull(schema.tasks.dueDate), isNull(schema.tasks.plannedDate)),
    deleted: isNotNull(schema.tasks.deletedAt),
  };
  const deleted = filter === "deleted";
  const where = and(deleted ? isNotNull(schema.tasks.deletedAt) : isNull(schema.tasks.deletedAt),
    date ? eq(taskScheduleDate(schema.tasks), date) : filters[filter as keyof typeof filters]);
  const rows = await db
    .select()
    .from(schema.tasks)
    .where(where)
    .orderBy(deleted ? desc(schema.tasks.deletedAt) : asc(schema.tasks.sortOrder), asc(schema.tasks.id));
  return NextResponse.json(rows);
}

// POST /api/tasks
export async function POST(req: NextRequest) {
  const parsed = parseTaskInput(await req.json().catch(() => null), true);
  if (!parsed.value) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const [row] = await db
    .insert(schema.tasks)
    .values({
      ...parsed.value,
      title: parsed.value.title!,
      createdAt: nowIso(),
      completedAt: parsed.value.status === "done" ? nowIso() : null,
    })
    .onConflictDoNothing({ target: schema.tasks.originKey })
    .returning();
  if (row) return NextResponse.json(row, { status: 201 });
  const [existing] = await db.select().from(schema.tasks).where(eq(schema.tasks.originKey, parsed.value.originKey!)).limit(1);
  return existing ? NextResponse.json(existing) : NextResponse.json({ error: "暂时无法确认任务是否保存，请稍后重试。" }, { status: 500 });
}
