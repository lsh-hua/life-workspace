import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db";
import { desc, eq } from "drizzle-orm";
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
  const body: unknown = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "专注记录参数无效。" }, { status: 400 });
  }
  const input = body as { taskId?: unknown; minutes?: unknown; sessionId?: unknown };
  const taskId = input.taskId ?? null;
  const minutes = input.minutes ?? 25;
  if ((taskId !== null && (!Number.isInteger(taskId) || Number(taskId) < 1)) ||
      !Number.isInteger(minutes) || Number(minutes) < 1 || Number(minutes) > 180) {
    return NextResponse.json({ error: "任务或专注时长无效。" }, { status: 400 });
  }

  if (input.sessionId !== undefined) {
    if (typeof input.sessionId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.sessionId)) {
      return NextResponse.json({ error: "专注会话编号无效。" }, { status: 400 });
    }
    const values = { taskId: taskId as number | null, minutes: minutes as number };
    const [row] = await db
      .insert(schema.pomodoros)
      .values({ ...values, sessionId: input.sessionId, finishedAt: nowIso() })
      .onConflictDoNothing({ target: schema.pomodoros.sessionId })
      .returning();
    if (row) return NextResponse.json(row, { status: 201 });

    const [existing] = await db.select().from(schema.pomodoros)
      .where(eq(schema.pomodoros.sessionId, input.sessionId)).limit(1);
    if (!existing) return NextResponse.json({ error: "专注记录暂时无法确认，请重试。" }, { status: 500 });
    if (existing.taskId !== values.taskId || existing.minutes !== values.minutes) {
      return NextResponse.json({ error: "该专注会话已绑定不同内容，无法重复提交。" }, { status: 409 });
    }
    return NextResponse.json(existing);
  }

  const [row] = await db
    .insert(schema.pomodoros)
    .values({
      taskId: taskId as number | null,
      minutes: minutes as number,
      finishedAt: nowIso(),
    })
    .returning();
  return NextResponse.json(row, { status: 201 });
}
