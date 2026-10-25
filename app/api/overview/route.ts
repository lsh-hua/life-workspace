import { NextResponse } from "next/server";
import { db, schema } from "@/db";
import { and, asc, desc, eq, gte, lte } from "drizzle-orm";
import { todayStr, weekDates } from "@/lib/dates";
import { localDayWindow, reviewStreak } from "@/lib/day-rules";
import { todayTaskWhere } from "@/lib/task-query";

// GET /api/overview  总览页聚合数据
export async function GET() {
  const today = todayStr();
  const days = weekDates();

  const allTasks = await db
    .select()
    .from(schema.tasks)
    .where(todayTaskWhere(schema.tasks, localDayWindow(today)))
    .orderBy(asc(schema.tasks.sortOrder), asc(schema.tasks.id));
  const todayTotal = allTasks.length;
  const todayDone = allTasks.filter((t) => t.status === "done").length;

  const weekTasks = await db
    .select()
    .from(schema.tasks)
    .where(and(gte(schema.tasks.dueDate, days[0]), lte(schema.tasks.dueDate, days[6])));
  const weekTotal = weekTasks.length;
  const weekDone = weekTasks.filter((t) => t.status === "done").length;

  const todayEvents = await db
    .select()
    .from(schema.events)
    .where(eq(schema.events.date, today));

  const reviewRows = await db
    .select()
    .from(schema.reviews)
    .where(eq(schema.reviews.date, today));

  const inspirations = await db
    .select()
    .from(schema.inspirations)
    .orderBy(desc(schema.inspirations.pinned), desc(schema.inspirations.id))
    .limit(3);

  // 连续复盘天数
  const allReviews = await db
    .select({ date: schema.reviews.date })
    .from(schema.reviews)
    .orderBy(desc(schema.reviews.date));
  const streak = reviewStreak(allReviews.map((review) => review.date), today);

  return NextResponse.json({
    today: { total: todayTotal, done: todayDone, tasks: allTasks },
    week: { total: weekTotal, done: weekDone },
    todayEvents,
    reviewWritten: reviewRows.length > 0,
    inspirations,
    streak,
  });
}
