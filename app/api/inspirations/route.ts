import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db";
import { desc } from "drizzle-orm";
import { nowIso } from "@/lib/dates";

export async function GET() {
  const rows = await db
    .select()
    .from(schema.inspirations)
    .orderBy(desc(schema.inspirations.pinned), desc(schema.inspirations.id));
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const [row] = await db
    .insert(schema.inspirations)
    .values({
      content: String(body.content ?? "").trim(),
      tags: body.tags ?? "",
      createdAt: nowIso(),
    })
    .returning();
  return NextResponse.json(row, { status: 201 });
}
