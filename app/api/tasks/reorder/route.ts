import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";

// POST /api/tasks/reorder  { ids: number[] } 按数组顺序重排 sort_order
export async function POST(req: NextRequest) {
  const { ids } = (await req.json()) as { ids: number[] };
  for (let i = 0; i < ids.length; i++) {
    await db.update(schema.tasks).set({ sortOrder: i }).where(eq(schema.tasks.id, ids[i]));
  }
  return NextResponse.json({ ok: true });
}
