import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db";
import { asc, eq } from "drizzle-orm";
import { nowIso, todayStr } from "@/lib/dates";

// GET /api/habits → 习惯列表 + 全部打卡记录（前端算 streak / 热力图）
export async function GET() {
  const habits = await db
    .select()
    .from(schema.habits)
    .where(eq(schema.habits.archived, 0))
    .orderBy(asc(schema.habits.sortOrder), asc(schema.habits.id));
  const logs = await db
    .select({ habitId: schema.habitLogs.habitId, date: schema.habitLogs.date })
    .from(schema.habitLogs);
  return NextResponse.json({ habits, logs, today: todayStr() });
}

// POST /api/habits { name, icon? }
export async function POST(req: NextRequest) {
  const body = await req.json();
  const [row] = await db
    .insert(schema.habits)
    .values({
      name: String(body.name ?? "").trim(),
      icon: body.icon ?? null,
      sortOrder: body.sortOrder ?? 0,
      createdAt: nowIso(),
    })
    .returning();
  return NextResponse.json(row, { status: 201 });
}
