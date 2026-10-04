import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import { nowIso } from "@/lib/dates";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const body = await req.json();
  const patch: Record<string, unknown> = {};
  for (const key of ["title", "note", "status", "priority", "dueDate", "isToday", "sortOrder"] as const) {
    if (key in body) patch[key] = body[key];
  }
  if (body.status === "done") patch.completedAt = nowIso();
  if (body.status === "todo") patch.completedAt = null;

  const [row] = await db
    .update(schema.tasks)
    .set(patch)
    .where(eq(schema.tasks.id, Number(id)))
    .returning();
  return NextResponse.json(row);
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  await db.delete(schema.tasks).where(eq(schema.tasks.id, Number(id)));
  return NextResponse.json({ ok: true });
}
