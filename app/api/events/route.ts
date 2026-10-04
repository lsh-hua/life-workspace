import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db";
import { asc, eq } from "drizzle-orm";
import { nowIso } from "@/lib/dates";

export async function GET() {
  const rows = await db.select().from(schema.events).orderBy(asc(schema.events.date));
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const [row] = await db
    .insert(schema.events)
    .values({
      title: String(body.title ?? "").trim(),
      note: body.note ?? null,
      date: body.date,
      startTime: body.startTime ?? null,
      endTime: body.endTime ?? null,
      color: body.color ?? null,
      createdAt: nowIso(),
    })
    .returning();
  return NextResponse.json(row, { status: 201 });
}
