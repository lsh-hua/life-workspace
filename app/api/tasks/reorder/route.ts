import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db";
import { and, eq, isNull } from "drizzle-orm";

// 排序只更新活动任务；删除记录的原顺序仍保留。
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const ids: unknown = body?.ids;
  if (!Array.isArray(ids) || ids.some((id) => !Number.isSafeInteger(id) || id < 1) || new Set(ids).size !== ids.length) {
    return NextResponse.json({ error: "任务排序参数无效。" }, { status: 400 });
  }
  const [first, ...remaining] = ids.map((id, sortOrder) => db.update(schema.tasks).set({ sortOrder })
    .where(and(eq(schema.tasks.id, id), isNull(schema.tasks.deletedAt))));
  if (first) await db.batch([first, ...remaining]);
  return NextResponse.json({ ok: true });
}
