// 仅供已停止本地服务的桌面主进程调用；整体保留恢复前目录，失败时回退。
import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { pathToFileURL, fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createClient } from "@libsql/client";
import { createBackup, getBackupPath } from "./data-safety.mjs";
import { migrateDatabase } from "./migrate.mjs";
const executeFile = promisify(execFile);

// Windows 的原生数据库句柄必须随子进程退出释放，目录切换进程不打开 SQLite。
async function databasePhase(phase, directory, name, migrationsDir) {
  const { stdout } = await executeFile(process.execPath, [fileURLToPath(import.meta.url), phase, name ?? ""], {
    env: { ...process.env, WORKBENCH_DATA_DIR: directory, ...(migrationsDir ? { WORKBENCH_MIGRATIONS_DIR: migrationsDir } : {}) },
    windowsHide: true,
    timeout: 120000,
  });
  const line = stdout.split(/\r?\n/).find((value) => value.startsWith("DATABASE_RESULT="));
  if (!line) throw new Error("数据库检查结果不完整，请保留当前数据后重试。");
  return JSON.parse(line.slice("DATABASE_RESULT=".length));
}

async function writeJournal(file, value) {
  const temporary = `${file}.tmp`;
  await fs.writeFile(temporary, JSON.stringify(value), { encoding: "utf8", mode: 0o600 });
  await fs.rename(temporary, file);
}

async function exists(file) {
  return fs.lstat(file).then(() => true).catch((error) => { if (error.code === "ENOENT") return false; throw error; });
}

// 中断后先找回整个旧目录，再启动任何数据库连接。
export async function recoverRestore({ dataDir }) {
  const directory = path.resolve(dataDir);
  const journal = `${directory}.restore-pending.json`;
  if (!await exists(journal)) return null;
  const info = await fs.lstat(journal);
  if (!info.isFile() || info.isSymbolicLink()) throw new Error("恢复记录不是普通文件，请保留所有数据目录。");
  const state = JSON.parse(await fs.readFile(journal, "utf8"));
  if (!["prepared", "committed"].includes(state.phase)) throw new Error("恢复记录状态无效，请保留全部数据目录。");
  const retained = path.resolve(state.retainedDirectory ?? "");
  if (path.dirname(retained) !== path.dirname(directory) || !path.basename(retained).startsWith(`${path.basename(directory)}-before-restore-`)) throw new Error("恢复记录的目录无效，请保留原文件。");
  if (state.phase === "committed") {
    await databasePhase("--validate", directory);
  } else if (await exists(retained)) {
    if (await exists(directory)) await fs.rename(directory, `${retained}-interrupted`);
    await fs.rename(retained, directory);
  } else if (!await exists(path.join(directory, "workbench.db"))) {
    throw new Error("中断的恢复未能定位旧数据库，请保留全部目录。");
  }
  await fs.unlink(journal);
  return { recovered: true, retainedDirectory: state.phase === "committed" ? retained : null };
}

async function checkWorkbench(file) {
  const info = await fs.lstat(file);
  if (!info.isFile() || info.isSymbolicLink()) throw new Error("工作台数据库必须是普通文件。");
  const client = createClient({ url: pathToFileURL(file).href });
  try {
    await client.execute("PRAGMA query_only = ON");
    const integrity = await client.execute("PRAGMA integrity_check");
    if (integrity.rows.length !== 1 || integrity.rows[0][0] !== "ok") throw new Error("工作台数据库完整性校验失败。");
    const result = await client.execute("SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('tasks', 'reviews', 'settings')");
    if (result.rows.length !== 3) throw new Error("所选文件不是完整的工作台备份。");
  } finally { client.close(); }
}

async function checkMigrationCompatibility(file, migrationsDir) {
  const known = new Set((await fs.readdir(migrationsDir)).filter((name) => name.endsWith(".sql")));
  const client = createClient({ url: pathToFileURL(file).href });
  try {
    await client.execute("PRAGMA query_only = ON");
    const ledger = await client.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='__migrations'");
    if (!ledger.rows.length) return;
    const applied = await client.execute("SELECT name FROM __migrations");
    if (applied.rows.some((row) => !known.has(String(row.name)))) throw new Error("备份来自不兼容的版本，请先更新应用再恢复。");
  } finally { client.close(); }
}

export async function restoreBackup({ dataDir, name, copySnapshot = fs.copyFile, migrationsDir = process.env.WORKBENCH_MIGRATIONS_DIR ?? path.join(process.cwd(), "db", "migrations") }) {
  if (!dataDir) throw new Error("恢复必须显式指定数据目录。");
  const directory = path.resolve(dataDir);
  await recoverRestore({ dataDir: directory });
  const info = await fs.lstat(directory);
  if (!info.isDirectory() || info.isSymbolicLink()) throw new Error("数据目录必须是普通目录。");
  await databasePhase("--prepare", directory, name, migrationsDir);
  const snapshot = await databasePhase("--snapshot", directory);
  const stamp = new Date().toISOString().replace(/[-:.]/g, "");
  const retainedDirectory = `${directory}-before-restore-${stamp}-${randomUUID().slice(0, 8)}`;
  const failedDirectory = `${retainedDirectory}-failed`;
  const relativeBackup = path.join("backups", name);
  const journal = `${directory}.restore-pending.json`;
  await writeJournal(journal, { phase: "prepared", retainedDirectory });
  try {
    await fs.rename(directory, retainedDirectory);
    await fs.mkdir(directory);
    await copySnapshot(path.join(retainedDirectory, relativeBackup), path.join(directory, "workbench.db"));
    await databasePhase("--finish", directory, null, migrationsDir);
    await writeJournal(journal, { phase: "committed", retainedDirectory });
  } catch (error) {
    try {
      if (await exists(retainedDirectory)) {
        await fs.rename(directory, failedDirectory).catch((cause) => { if (cause.code !== "ENOENT") throw cause; });
        await fs.rename(retainedDirectory, directory);
      }
      await fs.unlink(journal);
    } catch (rollback) {
      throw new Error(`恢复与回退未完成，请保留 ${retainedDirectory} 和 ${failedDirectory}，不要覆盖任何文件。`, { cause: rollback });
    }
    throw new Error("恢复未完成，已回到恢复前的数据。", { cause: error });
  }
  await fs.unlink(journal);
  return { name, retainedDirectory, previousSnapshot: snapshot.name, restoredAt: new Date().toISOString() };
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  try {
    if (!process.env.WORKBENCH_DATA_DIR) throw new Error("恢复必须显式指定数据目录。");
    const dataDir = process.env.WORKBENCH_DATA_DIR;
    if (["--prepare", "--snapshot", "--validate", "--finish"].includes(process.argv[2])) {
      let result = null;
      if (process.argv[2] === "--prepare") {
        const selected = await getBackupPath({ dataDir, name: process.argv[3] });
        await checkWorkbench(selected);
        if (process.env.WORKBENCH_MIGRATIONS_DIR) await checkMigrationCompatibility(selected, process.env.WORKBENCH_MIGRATIONS_DIR);
      } else if (process.argv[2] === "--snapshot") {
        result = await createBackup({ dataDir, reason: "manual" });
      } else {
        await checkWorkbench(path.join(dataDir, "workbench.db"));
        if (process.argv[2] === "--finish") await migrateDatabase({ dataDir, migrationsDir: process.env.WORKBENCH_MIGRATIONS_DIR });
      }
      console.log(`DATABASE_RESULT=${JSON.stringify(result)}`);
      process.exit(0);
    }
    const result = process.argv[2] === "--recover"
      ? await recoverRestore({ dataDir: process.env.WORKBENCH_DATA_DIR })
      : await restoreBackup({ dataDir: process.env.WORKBENCH_DATA_DIR, name: process.argv[2] });
    console.log(`RESTORE_RESULT=${JSON.stringify(result)}`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
