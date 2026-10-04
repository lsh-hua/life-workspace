import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db";
import { and, eq } from "drizzle-orm";
import { nowIso, todayStr } from "@/lib/dates";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const body = await req.json();
  const patch: Record<string, unknown> = {};
  for (const key of ["name", "icon", "sortOrder", "archived"] as const) {
    if (key in body) patch[key] = body[key];
  }
  const [row] = await db
    .update(schema.habits)
    .set(patch)
    .where(eq(schema.habits.id, Number(id)))
    .returning();
  return NextResponse.json(row);
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  await db.delete(schema.habitLogs).where(eq(schema.habitLogs.habitId, Number(id)));
  await db.delete(schema.habits).where(eq(schema.habits.id, Number(id)));
  return NextResponse.json({ ok: true });
}

// POST /api/habits/[id] { action: "toggle", date? } 打卡/取消打卡，date 缺省为今天
export async function POST(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const body = await req.json();
  if (body.action !== "toggle") {
    return NextResponse.json({ error: "need action=toggle" }, { status: 400 });
  }
  const date = typeof body.date === "string" && body.date ? body.date : todayStr();
  const habitId = Number(id);
  const existing = await db
    .select()
    .from(schema.habitLogs)
    .where(and(eq(schema.habitLogs.habitId, habitId), eq(schema.habitLogs.date, date)));
  if (existing.length > 0) {
    await db.delete(schema.habitLogs).where(eq(schema.habitLogs.id, existing[0].id));
    return NextResponse.json({ checked: false });
  }
  await db.insert(schema.habitLogs).values({ habitId, date, createdAt: nowIso() });
  return NextResponse.json({ checked: true });
}
