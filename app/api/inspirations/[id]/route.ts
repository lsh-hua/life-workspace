import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import { nowIso } from "@/lib/dates";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const body = await req.json();
  const patch: Record<string, unknown> = {};
  for (const key of ["content", "tags", "pinned", "converted"] as const) {
    if (key in body) patch[key] = body[key];
  }
  const [row] = await db
    .update(schema.inspirations)
    .set(patch)
    .where(eq(schema.inspirations.id, Number(id)))
    .returning();
  return NextResponse.json(row);
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  await db.delete(schema.inspirations).where(eq(schema.inspirations.id, Number(id)));
  return NextResponse.json({ ok: true });
}

// POST /api/inspirations/[id]  { action: "toTask", dueDate? } 转为任务
export async function POST(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const body = await req.json();
  if (body.action !== "toTask") {
    return NextResponse.json({ error: "unknown action" }, { status: 400 });
  }
  const insp = await db
    .select()
    .from(schema.inspirations)
    .where(eq(schema.inspirations.id, Number(id)));
  if (!insp[0]) return NextResponse.json({ error: "not found" }, { status: 404 });

  const [task] = await db
    .insert(schema.tasks)
    .values({
      title: insp[0].content.slice(0, 80),
      note: insp[0].content,
      dueDate: body.dueDate ?? null,
      source: "inspiration",
      createdAt: nowIso(),
    })
    .returning();
  await db
    .update(schema.inspirations)
    .set({ converted: 1 })
    .where(eq(schema.inspirations.id, Number(id)));
  return NextResponse.json(task, { status: 201 });
}
