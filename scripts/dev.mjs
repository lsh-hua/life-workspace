// dev 启动包装器：把 --host 转成 Next.js 16 认识的 --hostname，其余参数原样透传
// （Kimi Work 预览等外部工具会传入 --host，Next 16 只接受 --hostname）
import { spawn } from "node:child_process";
import path from "node:path";

const args = process.argv.slice(2).map((a) => {
  if (a === "--host") return "--hostname";
  if (a.startsWith("--host=")) return "--hostname=" + a.slice("--host=".length);
  return a;
});

const nextBin = path.join(process.cwd(), "node_modules", "next", "dist", "bin", "next");
const child = spawn(process.execPath, [nextBin, "dev", ...args], { stdio: "inherit" });

child.on("exit", (code) => process.exit(code ?? 0));
process.on("SIGINT", () => child.kill("SIGINT"));
process.on("SIGTERM", () => child.kill("SIGTERM"));
