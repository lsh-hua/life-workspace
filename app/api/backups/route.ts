import path from "node:path";
import { NextResponse } from "next/server";
import { createBackup, listBackups } from "@/scripts/data-safety.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function dataDirectory() {
  return path.resolve(process.env.WORKBENCH_DATA_DIR ?? path.join(process.cwd(), "data"));
}

function sameOrigin(request: Request) {
  if (request.headers.get("sec-fetch-site") === "cross-site") return false;
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    const source = new URL(origin);
    const host = request.headers.get("host") ?? new URL(request.url).host;
    return ["http:", "https:"].includes(source.protocol) && source.host === host;
  } catch {
    return false;
  }
}

export async function GET() {
  try {
    const dataDir = dataDirectory();
    return NextResponse.json({
      backups: await listBackups({ dataDir }),
      dataDirectory: dataDir,
      directory: path.join(dataDir, "backups"),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("读取备份列表失败", error);
    return NextResponse.json({ error: "无法读取备份列表，请检查本地目录权限。" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) {
    return NextResponse.json({ error: "请从工作台内创建备份。" }, { status: 403 });
  }
  try {
    const backup = await createBackup({ dataDir: dataDirectory(), reason: "manual" });
    return NextResponse.json(backup, { status: 201 });
  } catch (error) {
    console.error("创建手动备份失败", error);
    const missing = error instanceof Error && "code" in error && error.code === "MISSING_DATABASE";
    return NextResponse.json(
      { error: missing ? "尚未创建数据库，请先保存一条记录。" : "备份未完成，请检查磁盘空间与目录权限后重试。" },
      { status: missing ? 409 : 500 },
    );
  }
}
