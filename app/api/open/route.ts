import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";

// 禁止通过此接口直接启动的可执行类型
const BLOCKED_EXT = new Set([".exe", ".bat", ".cmd", ".ps1", ".sh", ".msi", ".com", ".scr", ".vbs", ".js"]);

// POST /api/open  { path: "D:\\docs\\xx.pdf" }
// 用系统默认程序打开本地文件（本地单用户应用）
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const target = typeof body.path === "string" ? body.path.trim() : "";
  if (!target || !path.isAbsolute(target)) {
    return NextResponse.json({ error: "需要绝对路径" }, { status: 400 });
  }
  if (BLOCKED_EXT.has(path.extname(target).toLowerCase())) {
    return NextResponse.json({ error: "不允许打开可执行文件" }, { status: 400 });
  }
  if (!fs.existsSync(target)) {
    return NextResponse.json({ error: "文件不存在：" + target }, { status: 404 });
  }

  // Windows：用 cmd start 交给系统默认程序
  await new Promise<void>((resolve, reject) => {
    execFile("cmd", ["/c", "start", "", target], { windowsHide: true }, (err) =>
      err ? reject(err) : resolve()
    );
  });
  return NextResponse.json({ ok: true });
}
