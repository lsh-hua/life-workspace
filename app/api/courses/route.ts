import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db";
import { asc } from "drizzle-orm";
import { nowIso } from "@/lib/dates";
import { DEFAULT_PERIOD_STARTS, normalizePeriodStarts } from "@/lib/course-schedule";

// GET /api/courses → 全部课程 + 全部单周调整 + 学期设置
export async function GET() {
  const courses = await db
    .select()
    .from(schema.courses)
    .orderBy(asc(schema.courses.dayOfWeek), asc(schema.courses.startPeriod));
  const overrides = await db.select().from(schema.courseOverrides);
  const settingRows = await db.select().from(schema.settings);
  const map = Object.fromEntries(settingRows.map((s) => [s.key, s.value]));
  let savedPeriodStarts: unknown = null;
  try {
    savedPeriodStarts = JSON.parse(map.coursePeriodStarts ?? "null");
  } catch {
    savedPeriodStarts = null;
  }
  return NextResponse.json({
    courses,
    overrides,
    semesterStart: map.semesterStart ?? null, // 学期第一周周一的日期 YYYY-MM-DD
    totalWeeks: Number(map.totalWeeks ?? 20),
    reminderEnabled: map.courseReminderEnabled === "true",
    reminderMinutes: Math.min(
      120,
      Math.max(1, Number(map.courseReminderMinutes ?? 10) || 10)
    ),
    periodStarts: normalizePeriodStarts(savedPeriodStarts),
  });
}

// POST /api/courses 新建课程
export async function POST(req: NextRequest) {
  const body = await req.json();
  const name = String(body.name ?? "").trim();
  if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });
  const [row] = await db
    .insert(schema.courses)
    .values({
      name,
      teacher: body.teacher ?? null,
      location: body.location ?? null,
      color: body.color ?? null,
      dayOfWeek: Number(body.dayOfWeek),
      startPeriod: Number(body.startPeriod),
      endPeriod: Number(body.endPeriod ?? body.startPeriod),
      startWeek: Number(body.startWeek ?? 1),
      endWeek: Number(body.endWeek ?? 16),
      weekType: body.weekType ?? "all",
      createdAt: nowIso(),
    })
    .returning();
  return NextResponse.json(row, { status: 201 });
}

// PATCH /api/courses  保存学期与提醒设置
export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const values: Record<string, string> = {};

  if (body.semesterStart !== undefined) {
    const value = String(body.semesterStart);
    if (value && !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      return NextResponse.json({ error: "invalid semesterStart" }, { status: 400 });
    }
    values.semesterStart = value;
  }
  if (body.totalWeeks !== undefined) {
    values.totalWeeks = String(Math.min(30, Math.max(1, Number(body.totalWeeks) || 20)));
  }
  if (body.reminderEnabled !== undefined) {
    values.courseReminderEnabled = body.reminderEnabled === true ? "true" : "false";
  }
  if (body.reminderMinutes !== undefined) {
    values.courseReminderMinutes = String(
      Math.min(120, Math.max(1, Number(body.reminderMinutes) || 10))
    );
  }
  if (body.periodStarts !== undefined) {
    const periodStarts = normalizePeriodStarts(body.periodStarts);
    if (
      !Array.isArray(body.periodStarts) ||
      body.periodStarts.length !== DEFAULT_PERIOD_STARTS.length ||
      periodStarts.some((value, index) => value !== body.periodStarts[index])
    ) {
      return NextResponse.json({ error: "invalid periodStarts" }, { status: 400 });
    }
    values.coursePeriodStarts = JSON.stringify(periodStarts);
  }

  for (const [key, value] of Object.entries(values)) {
    await db
      .insert(schema.settings)
      .values({ key, value })
      .onConflictDoUpdate({ target: schema.settings.key, set: { value } });
  }
  return NextResponse.json({ ok: true });
}
