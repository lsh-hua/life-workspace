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
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "复盘内容格式不正确" }, { status: 400 });
  }
  const date = body.date;
  const parsedDate = typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date)
    ? new Date(`${date}T00:00:00.000Z`) : null;
  if (!parsedDate || !Number.isFinite(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== date) {
    return NextResponse.json({ error: "请选择有效的复盘日期" }, { status: 400 });
  }
  for (const key of ["doneText", "problemText", "tomorrowText", "summary"]) {
    if (body[key] != null && typeof body[key] !== "string") {
      return NextResponse.json({ error: "复盘文本必须是文字" }, { status: 400 });
    }
  }
  if (body.mood != null && (!Number.isInteger(body.mood) || body.mood < 1 || body.mood > 5)) {
    return NextResponse.json({ error: "心情必须为 1 到 5 之间的整数" }, { status: 400 });
  }

  const values = {
    doneText: body.doneText ?? null,
    problemText: body.problemText ?? null,
    tomorrowText: body.tomorrowText ?? null,
    mood: body.mood ?? null,
    summary: body.summary ?? null,
    updatedAt: nowIso(),
  };

  const [row] = await db
    .insert(schema.reviews)
    .values({ date, ...values, createdAt: nowIso() })
    .onConflictDoUpdate({ target: schema.reviews.date, set: values })
    .returning();
  return NextResponse.json(row);
}
