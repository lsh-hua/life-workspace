import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const body = await req.json();
  const patch: Record<string, unknown> = {};
  for (const key of ["title", "note", "date", "startTime", "endTime", "color"] as const) {
    if (key in body) patch[key] = body[key];
  }
  const [row] = await db
    .update(schema.events)
    .set(patch)
    .where(eq(schema.events.id, Number(id)))
    .returning();
  return NextResponse.json(row);
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  await db.delete(schema.events).where(eq(schema.events.id, Number(id)));
  return NextResponse.json({ ok: true });
}
