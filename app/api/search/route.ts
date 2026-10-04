import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db";
import { like } from "drizzle-orm";

// GET /api/search?q=xxx  跨表搜索
export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
  if (!q) return NextResponse.json({ tasks: [], events: [], inspirations: [], reviews: [] });
  const pattern = `%${q}%`;

  const [tasks, events, inspirations, reviews] = await Promise.all([
    db
      .select({ id: schema.tasks.id, title: schema.tasks.title })
      .from(schema.tasks)
      .where(like(schema.tasks.title, pattern))
      .limit(8),
    db
      .select({ id: schema.events.id, title: schema.events.title, date: schema.events.date })
      .from(schema.events)
      .where(like(schema.events.title, pattern))
      .limit(8),
    db
      .select({ id: schema.inspirations.id, content: schema.inspirations.content })
      .from(schema.inspirations)
      .where(like(schema.inspirations.content, pattern))
      .limit(8),
    db
      .select({ id: schema.reviews.id, date: schema.reviews.date, summary: schema.reviews.summary })
      .from(schema.reviews)
      .where(like(schema.reviews.summary, pattern))
      .limit(8),
  ]);

  return NextResponse.json({ tasks, events, inspirations, reviews });
}
