import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db";
import { desc } from "drizzle-orm";
import { nowIso, todayStr } from "@/lib/dates";

// GET /api/pomodoros → 今日番茄记录
export async function GET() {
  const rows = await db
    .select()
    .from(schema.pomodoros)
    .orderBy(desc(schema.pomodoros.id))
    .limit(200);
  const today = todayStr();
  return NextResponse.json(rows.filter((r) => r.finishedAt.slice(0, 10) === today));
}

// POST /api/pomodoros { taskId?, minutes }
export async function POST(req: NextRequest) {
  const body = await req.json();
  const [row] = await db
    .insert(schema.pomodoros)
    .values({
      taskId: body.taskId ?? null,
      minutes: body.minutes ?? 25,
      finishedAt: nowIso(),
    })
    .returning();
  return NextResponse.json(row, { status: 201 });
}
