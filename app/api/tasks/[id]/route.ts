import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db";
import { and, eq, isNull } from "drizzle-orm";
import { nowIso, todayStr } from "@/lib/dates";
import { parseTaskId, parseTaskInput } from "@/lib/task-input";
import { nextRepeatDates, parseTaskRepeat } from "@/lib/task-repeat";

type Ctx = { params: Promise<{ id: string }> };
const invalidId = () => NextResponse.json({ error: "任务编号无效。" }, { status: 400 });
const notFound = () => NextResponse.json({ error: "没有找到这项任务。" }, { status: 404 });

async function findTask(id: number) {
  const [row] = await db.select().from(schema.tasks).where(eq(schema.tasks.id, id)).limit(1);
  return row;
}

export async function GET(_req: NextRequest, ctx: Ctx) {
  const id = parseTaskId((await ctx.params).id);
  if (id === null) return invalidId();
  const row = await findTask(id);
  return row ? NextResponse.json(row) : notFound();
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const id = parseTaskId((await ctx.params).id);
  if (id === null) return invalidId();
  const body = await req.json().catch(() => null);
  const existing = await findTask(id);
  if (!existing) return notFound();
  if (body && typeof body === "object" && "action" in body) {
    if (body.action !== "restore" || Object.keys(body).length !== 1) {
      return NextResponse.json({ error: "恢复任务时不能同时修改其他内容。" }, { status: 400 });
    }
    const [row] = await db.update(schema.tasks).set({ deletedAt: null }).where(eq(schema.tasks.id, id)).returning();
    return NextResponse.json(row);
  }
  if (existing.deletedAt) return NextResponse.json({ error: "任务已删除，请先恢复后再编辑。" }, { status: 409 });
  const parsed = parseTaskInput(body);
  if (!parsed.value) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const values = parsed.value;
  const result = await db.transaction(async (transaction) => {
    const [current] = await transaction.select().from(schema.tasks).where(eq(schema.tasks.id, id)).limit(1);
    if (!current || current.deletedAt) return { error: "任务已删除，请刷新后重试。" };
    const completing = values.status === "done" && current.status !== "done";
    const patch = { ...values,
      ...(completing ? { completedAt: nowIso() } : {}),
      ...(values.status === "todo" ? { completedAt: null } : {}),
    };
    const [row] = await transaction.update(schema.tasks).set(patch)
      .where(and(eq(schema.tasks.id, id), isNull(schema.tasks.deletedAt))).returning();
    const rule = parseTaskRepeat(row.repeatRule);
    if (completing && rule) {
      await transaction.insert(schema.tasks).values({
        title: row.title, note: row.note, priority: row.priority, source: row.source,
        repeatRule: row.repeatRule, repeatParentId: row.id, createdAt: nowIso(),
        ...nextRepeatDates(rule, row, todayStr()),
      }).onConflictDoNothing({ target: schema.tasks.repeatParentId });
    }
    return { row };
  });
  return result.row ? NextResponse.json(result.row) : NextResponse.json({ error: result.error }, { status: 409 });
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const id = parseTaskId((await ctx.params).id);
  if (id === null) return invalidId();
  const existing = await findTask(id);
  if (!existing) return notFound();
  const [deleted] = await db.update(schema.tasks).set({ deletedAt: existing.deletedAt ?? nowIso() })
    .where(eq(schema.tasks.id, id)).returning();
  return NextResponse.json({ ok: true, task: deleted });
}
