// 桌面主进程通过独立 Node 子进程执行备份，避免依赖 Electron 内的原生数据库模块。
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createBackup, ensureDailyBackup } from "./data-safety.mjs";

export async function runBackup({
  dataDir = process.env.WORKBENCH_DATA_DIR ?? path.join(process.cwd(), "data"),
  daily = false,
} = {}) {
  return daily ? ensureDailyBackup({ dataDir }) : createBackup({ dataDir, reason: "manual" });
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  try {
    const backup = await runBackup({ daily: process.argv.includes("--daily") });
    console.log(backup ? `备份已就绪：${backup.name}` : "尚无数据库，本次不创建备份");
  } catch (error) {
    console.error(`备份失败：${error.message}`);
    process.exitCode = 1;
  }
}
