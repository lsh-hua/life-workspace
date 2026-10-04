import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db";
import { desc, eq } from "drizzle-orm";
import { nowIso } from "@/lib/dates";
import Parser from "rss-parser";

export async function GET() {
  const rows = await db
    .select()
    .from(schema.hotspots)
    .orderBy(desc(schema.hotspots.publishedAt), desc(schema.hotspots.id))
    .limit(100);
  return NextResponse.json(rows);
}

// POST /api/hotspots → 抓取所有 RSS 源并入库（去重靠唯一索引）
export async function POST() {
  const settingRows = await db
    .select()
    .from(schema.settings)
    .where(eq(schema.settings.key, "hotspot_sources"));
  let sources: { name: string; url: string }[] = [];
  try {
    sources = JSON.parse(settingRows[0]?.value ?? "[]");
  } catch {
    sources = [];
  }

  const parser = new Parser({ timeout: 10000 });
  let inserted = 0;
  const errors: string[] = [];

  for (const src of sources) {
    try {
      const feed = await parser.parseURL(src.url);
      for (const item of (feed.items ?? []).slice(0, 20)) {
        if (!item.title || !item.link) continue;
        try {
          await db.insert(schema.hotspots).values({
            title: item.title.trim(),
            url: item.link,
            source: src.name,
            summary: (item.contentSnippet ?? item.content ?? "").slice(0, 200) || null,
            publishedAt: item.isoDate ?? item.pubDate ?? null,
            fetchedAt: nowIso(),
          });
          inserted++;
        } catch {
          // 唯一索引冲突 = 已存在，跳过
        }
      }
    } catch (e) {
      errors.push(`${src.name}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return NextResponse.json({ inserted, errors });
}
