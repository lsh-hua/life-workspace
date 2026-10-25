// 每次有待执行迁移时先备份；单个迁移与迁移记录在同一事务内提交。
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createClient } from "@libsql/client";
import { createBackup } from "./data-safety.mjs";

async function applyMigration(client, file, sql) {
  const transaction = await client.transaction("write");
  try {
    const done = await transaction.execute({ sql: "SELECT name FROM __migrations WHERE name = ?", args: [file] });
    if (done.rows.length > 0) {
      await transaction.commit();
      return false;
    }
    const statements = sql.split("--> statement-breakpoint").map((statement) => statement.trim()).filter(Boolean);
    for (const statement of statements) await transaction.execute(statement);
    await transaction.execute({
      sql: "INSERT INTO __migrations (name, applied_at) VALUES (?, ?)",
      args: [file, new Date().toISOString()],
    });
    await transaction.commit();
    return true;
  } catch (error) {
    if (!transaction.closed) await transaction.rollback();
    throw new Error(`迁移 ${file} 失败，已回滚本文件的变更：${error.message}`, { cause: error });
  } finally {
    transaction.close();
  }
}

export async function migrateDatabase({
  dataDir = process.env.WORKBENCH_DATA_DIR ?? path.join(process.cwd(), "data"),
  migrationsDir = process.env.WORKBENCH_MIGRATIONS_DIR ?? path.join(process.cwd(), "db", "migrations"),
} = {}) {
  const entries = await fs.readdir(migrationsDir, { withFileTypes: true });
  const files = entries.filter((entry) => entry.isFile() && entry.name.endsWith(".sql")).map((entry) => entry.name).sort();
  await fs.mkdir(dataDir, { recursive: true });
  const databasePath = path.resolve(dataDir, "workbench.db");
  const existed = await fs.lstat(databasePath).then((info) => {
    if (!info.isFile() || info.isSymbolicLink()) throw new Error("数据库必须是普通文件");
    return true;
  }).catch((error) => {
    if (error.code === "ENOENT") return false;
    throw error;
  });
  const client = createClient({ url: pathToFileURL(databasePath).href });
  try {
    const ledger = await client.execute("SELECT name FROM sqlite_master WHERE type = 'table' AND name = '__migrations'");
    const applied = ledger.rows.length ? (await client.execute("SELECT name FROM __migrations")).rows.map((row) => row.name) : [];
    const pending = files.filter((file) => !applied.includes(file));
    if (pending.length === 0) return { applied: [], backup: null };

    const backup = existed ? await createBackup({ dataDir, reason: "migration" }) : null;
    await client.execute("CREATE TABLE IF NOT EXISTS __migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)");
    const completed = [];
    for (const file of pending) {
      const sql = await fs.readFile(path.join(migrationsDir, file), "utf8");
      if (await applyMigration(client, file, sql)) completed.push(file);
    }
    return { applied: completed, backup };
  } finally {
    client.close();
  }
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  try {
    const result = await migrateDatabase();
    if (result.backup) console.log(`升级前备份已保存：${result.backup.name}`);
    console.log(`数据库检查完成，本次执行 ${result.applied.length} 个迁移`);
  } catch (error) {
    console.error(`数据库升级失败，已停止启动：${error.message}`);
    process.exitCode = 1;
  }
}
