import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import { nowIso } from "@/lib/dates";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const body = await req.json();
  const patch: Record<string, unknown> = { updatedAt: nowIso() };
  for (const key of ["doneText", "problemText", "tomorrowText", "mood", "summary"] as const) {
    if (key in body) patch[key] = body[key];
  }
  const [row] = await db
    .update(schema.reviews)
    .set(patch)
    .where(eq(schema.reviews.id, Number(id)))
    .returning();
  return NextResponse.json(row);
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  await db.delete(schema.reviews).where(eq(schema.reviews.id, Number(id)));
  return NextResponse.json({ ok: true });
}
