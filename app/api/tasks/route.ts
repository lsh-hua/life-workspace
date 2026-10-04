import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db";
import { and, asc, eq, gte, isNull, lte, or } from "drizzle-orm";
import { todayStr, weekDates, nowIso } from "@/lib/dates";

// GET /api/tasks?filter=today|week|all&date=YYYY-MM-DD
export async function GET(req: NextRequest) {
  const filter = req.nextUrl.searchParams.get("filter") ?? "all";
  const date = req.nextUrl.searchParams.get("date");

  let where;
  if (date) {
    where = eq(schema.tasks.dueDate, date);
  } else if (filter === "today") {
    where = or(eq(schema.tasks.dueDate, todayStr()), eq(schema.tasks.isToday, 1));
  } else if (filter === "week") {
    const days = weekDates();
    where = and(gte(schema.tasks.dueDate, days[0]), lte(schema.tasks.dueDate, days[6]));
  } else if (filter === "nodate") {
    where = isNull(schema.tasks.dueDate);
  }

  const rows = await db
    .select()
    .from(schema.tasks)
    .where(where)
    .orderBy(asc(schema.tasks.sortOrder), asc(schema.tasks.id));
  return NextResponse.json(rows);
}

// POST /api/tasks
export async function POST(req: NextRequest) {
  const body = await req.json();
  const [row] = await db
    .insert(schema.tasks)
    .values({
      title: String(body.title ?? "").trim(),
      note: body.note ?? null,
      priority: body.priority ?? "medium",
      dueDate: body.dueDate ?? null,
      isToday: body.isToday ? 1 : 0,
      sortOrder: body.sortOrder ?? 0,
      source: body.source ?? "manual",
      createdAt: nowIso(),
    })
    .returning();
  return NextResponse.json(row, { status: 201 });
}
