import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db";
import { desc, eq } from "drizzle-orm";
import { nowIso } from "@/lib/dates";

// GET /api/reviews            → 全部（倒序）
// GET /api/reviews?date=YYYY-MM-DD → 单日
export async function GET(req: NextRequest) {
  const date = req.nextUrl.searchParams.get("date");
  if (date) {
    const rows = await db.select().from(schema.reviews).where(eq(schema.reviews.date, date));
    return NextResponse.json(rows[0] ?? null);
  }
  const rows = await db.select().from(schema.reviews).orderBy(desc(schema.reviews.date));
  return NextResponse.json(rows);
}

// POST /api/reviews  按 date upsert（每天一篇）
export async function POST(req: NextRequest) {
  const body = await req.json();
  const date = body.date;
  if (!date) return NextResponse.json({ error: "date required" }, { status: 400 });

  const values = {
    doneText: body.doneText ?? null,
    problemText: body.problemText ?? null,
    tomorrowText: body.tomorrowText ?? null,
    mood: body.mood ?? null,
    summary: body.summary ?? null,
    updatedAt: nowIso(),
  };

  const existing = await db.select().from(schema.reviews).where(eq(schema.reviews.date, date));
  if (existing.length > 0) {
    const [row] = await db
      .update(schema.reviews)
      .set(values)
      .where(eq(schema.reviews.date, date))
      .returning();
    return NextResponse.json(row);
  }
  const [row] = await db
    .insert(schema.reviews)
    .values({ date, ...values, createdAt: nowIso() })
    .returning();
  return NextResponse.json(row, { status: 201 });
}
