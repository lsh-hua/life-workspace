import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import { nowIso } from "@/lib/dates";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const body = await req.json();
  const patch: Record<string, unknown> = {};
  if ("favorited" in body) patch.favorited = body.favorited ? 1 : 0;
  const [row] = await db
    .update(schema.hotspots)
    .set(patch)
    .where(eq(schema.hotspots.id, Number(id)))
    .returning();
  return NextResponse.json(row);
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  await db.delete(schema.hotspots).where(eq(schema.hotspots.id, Number(id)));
  return NextResponse.json({ ok: true });
}

// POST /api/hotspots/[id] { action: "toInspiration" } 收藏转灵感
export async function POST(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const body = await req.json();
  if (body.action !== "toInspiration") {
    return NextResponse.json({ error: "unknown action" }, { status: 400 });
  }
  const rows = await db
    .select()
    .from(schema.hotspots)
    .where(eq(schema.hotspots.id, Number(id)));
  if (!rows[0]) return NextResponse.json({ error: "not found" }, { status: 404 });

  const h = rows[0];
  const [insp] = await db
    .insert(schema.inspirations)
    .values({
      content: `${h.title}\n${h.url}`,
      tags: "AI热点",
      createdAt: nowIso(),
    })
    .returning();
  await db
    .update(schema.hotspots)
    .set({ favorited: 1 })
    .where(eq(schema.hotspots.id, Number(id)));
  return NextResponse.json(insp, { status: 201 });
}
