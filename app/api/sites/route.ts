import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db";
import { asc } from "drizzle-orm";
import { nowIso } from "@/lib/dates";

export async function GET() {
  const rows = await db
    .select()
    .from(schema.sites)
    .orderBy(asc(schema.sites.sortOrder), asc(schema.sites.id));
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  let url = String(body.url ?? "").trim();
  const isFile = body.itemType === "file";
  if (url && !isFile && !/^https?:\/\//i.test(url)) url = "https://" + url;
  const [row] = await db
    .insert(schema.sites)
    .values({
      name: String(body.name ?? "").trim(),
      url,
      iconUrl: body.iconUrl ?? null,
      sortOrder: body.sortOrder ?? 0,
      groupId: body.groupId ?? null,
      itemType: body.itemType === "file" ? "file" : "url",
      createdAt: nowIso(),
    })
    .returning();
  return NextResponse.json(row, { status: 201 });
}
