import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const body = await req.json();
  const patch: Record<string, unknown> = {};
  for (const key of ["name", "url", "iconUrl", "sortOrder", "groupId", "itemType"] as const) {
    if (key in body) patch[key] = body[key];
  }
  if (typeof patch.url === "string" && patch.url && patch.itemType !== "file" && !/^https?:\/\//i.test(patch.url)) {
    patch.url = "https://" + patch.url;
  }
  const [row] = await db
    .update(schema.sites)
    .set(patch)
    .where(eq(schema.sites.id, Number(id)))
    .returning();
  return NextResponse.json(row);
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  await db.delete(schema.sites).where(eq(schema.sites.id, Number(id)));
  return NextResponse.json({ ok: true });
}
