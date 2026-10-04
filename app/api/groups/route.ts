import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db";
import { asc, eq } from "drizzle-orm";
import { nowIso } from "@/lib/dates";

// GET /api/groups → 集合列表（含每个集合的条目）
export async function GET() {
  const groups = await db
    .select()
    .from(schema.groups)
    .orderBy(asc(schema.groups.sortOrder), asc(schema.groups.id));
  const sites = await db
    .select()
    .from(schema.sites)
    .orderBy(asc(schema.sites.sortOrder), asc(schema.sites.id));
  return NextResponse.json(
    groups.map((g) => ({ ...g, items: sites.filter((s) => s.groupId === g.id) }))
  );
}

// POST /api/groups  { name, icon? }
export async function POST(req: NextRequest) {
  const body = await req.json();
  const [row] = await db
    .insert(schema.groups)
    .values({
      name: String(body.name ?? "").trim(),
      icon: body.icon ?? null,
      sortOrder: body.sortOrder ?? 0,
      createdAt: nowIso(),
    })
    .returning();
  return NextResponse.json(row, { status: 201 });
}
