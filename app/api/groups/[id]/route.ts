import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const body = await req.json();
  const patch: Record<string, unknown> = {};
  for (const key of ["name", "icon", "sortOrder"] as const) {
    if (key in body) patch[key] = body[key];
  }
  const [row] = await db
    .update(schema.groups)
    .set(patch)
    .where(eq(schema.groups.id, Number(id)))
    .returning();
  return NextResponse.json(row);
}

// 删除集合：集合内条目降级为散件（groupId 置空），不删条目
export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  await db
    .update(schema.sites)
    .set({ groupId: null })
    .where(eq(schema.sites.groupId, Number(id)));
  await db.delete(schema.groups).where(eq(schema.groups.id, Number(id)));
  return NextResponse.json({ ok: true });
}
