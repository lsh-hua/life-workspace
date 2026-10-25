import path from "node:path";
import { readFile } from "node:fs/promises";
import { NextResponse } from "next/server";
import { getBackupPath } from "@/scripts/data-safety.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ name: string }> }) {
  try {
    const { name } = await context.params;
    const dataDir = process.env.WORKBENCH_DATA_DIR ?? path.join(process.cwd(), "data");
    const backupPath = await getBackupPath({ dataDir, name });
    const bytes = new Uint8Array(await readFile(backupPath));
    return new Response(bytes, {
      headers: {
        "Content-Type": "application/vnd.sqlite3",
        "Content-Disposition": `attachment; filename="${name}"`,
        "Content-Length": String(bytes.byteLength),
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return NextResponse.json({ error: "找不到可用的备份文件，或文件未通过完整性检查。" }, { status: 404 });
  }
}
