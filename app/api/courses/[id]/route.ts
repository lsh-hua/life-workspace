import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db";
import { and, eq } from "drizzle-orm";
import { nowIso } from "@/lib/dates";

type Ctx = { params: Promise<{ id: string }> };

// PATCH /api/courses/[id]  编辑课程基本信息
export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const body = await req.json();
  const patch: Record<string, unknown> = {};
  for (const k of ["name", "teacher", "location", "color", "weekType"] as const) {
    if (body[k] !== undefined) patch[k] = body[k];
  }
  for (const k of ["dayOfWeek", "startPeriod", "endPeriod", "startWeek", "endWeek"] as const) {
    if (body[k] !== undefined) patch[k] = Number(body[k]);
  }
  await db.update(schema.courses).set(patch).where(eq(schema.courses.id, Number(id)));
  return NextResponse.json({ ok: true });
}

// DELETE /api/courses/[id]  删除课程及其所有单周调整
export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  await db.delete(schema.courseOverrides).where(eq(schema.courseOverrides.courseId, Number(id)));
  await db.delete(schema.courses).where(eq(schema.courses.id, Number(id)));
  return NextResponse.json({ ok: true });
}

// POST /api/courses/[id]  单周微调
// { action: "override", week, kind: "cancel" | "custom", dayOfWeek?, startPeriod?, endPeriod?, location?, note? }
// { action: "removeOverride", week }  撤销某周的调整
export async function POST(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const courseId = Number(id);
  const body = await req.json();
  const week = Number(body.week);

  if (body.action === "removeOverride") {
    await db
      .delete(schema.courseOverrides)
      .where(and(eq(schema.courseOverrides.courseId, courseId), eq(schema.courseOverrides.week, week)));
    return NextResponse.json({ ok: true });
  }

  if (body.action === "override") {
    if (!week || !["cancel", "custom"].includes(body.kind)) {
      return NextResponse.json({ error: "need week & kind(cancel|custom)" }, { status: 400 });
    }
    // 每周每门课最多一条调整：先清后插
    await db
      .delete(schema.courseOverrides)
      .where(and(eq(schema.courseOverrides.courseId, courseId), eq(schema.courseOverrides.week, week)));
    const [row] = await db
      .insert(schema.courseOverrides)
      .values({
        courseId,
        week,
        action: body.kind,
        dayOfWeek: body.kind === "custom" ? Number(body.dayOfWeek) : null,
        startPeriod: body.kind === "custom" ? Number(body.startPeriod) : null,
        endPeriod: body.kind === "custom" ? Number(body.endPeriod ?? body.startPeriod) : null,
        location: body.kind === "custom" ? (body.location ?? null) : null,
        note: body.note ?? null,
        createdAt: nowIso(),
      })
      .returning();
    return NextResponse.json(row, { status: 201 });
  }

  return NextResponse.json({ error: "unknown action" }, { status: 400 });
}
