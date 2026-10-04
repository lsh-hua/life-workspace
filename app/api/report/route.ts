import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db";
import { and, asc, eq, gte, lte } from "drizzle-orm";
import { addWeeks, addMonths, startOfMonth, endOfMonth, format } from "date-fns";
import { weekDates, weekRangeLabel, fmtDate } from "@/lib/dates";

// GET /api/report?period=week|month&offset=0
// period=week: offset=0 本周，-1 上周；period=month: offset=0 本月，-1 上月
export async function GET(req: NextRequest) {
  const period = req.nextUrl.searchParams.get("period") === "month" ? "month" : "week";
  const offset = Number(req.nextUrl.searchParams.get("offset") ?? 0);

  let start: string, end: string, label: string;
  if (period === "month") {
    const ref = addMonths(new Date(), offset);
    start = fmtDate(startOfMonth(ref));
    end = fmtDate(endOfMonth(ref));
    label = format(ref, "yyyy年M月");
  } else {
    const ref = addWeeks(new Date(), offset);
    const days = weekDates(ref);
    start = days[0];
    end = days[6];
    label = weekRangeLabel(ref);
  }

  const tasks = await db
    .select()
    .from(schema.tasks)
    .where(and(gte(schema.tasks.dueDate, start), lte(schema.tasks.dueDate, end)))
    .orderBy(asc(schema.tasks.dueDate));

  const reviews = await db
    .select()
    .from(schema.reviews)
    .where(and(gte(schema.reviews.date, start), lte(schema.reviews.date, end)));

  const habitLogs = await db
    .select()
    .from(schema.habitLogs)
    .where(and(gte(schema.habitLogs.date, start), lte(schema.habitLogs.date, end)));

  const habits = await db.select().from(schema.habits).where(eq(schema.habits.archived, 0));

  const moods = reviews.map((r) => r.mood).filter((m): m is number => !!m);
  const avgMood = moods.length ? moods.reduce((a, b) => a + b, 0) / moods.length : null;

  return NextResponse.json({
    period,
    range: { start, end, label },
    tasks,
    reviews,
    habitLogs,
    habits,
    stats: {
      tasksDone: tasks.filter((t) => t.status === "done").length,
      tasksTotal: tasks.length,
      reviewDays: reviews.length,
      avgMood,
      habitCheckins: habitLogs.length,
    },
  });
}
