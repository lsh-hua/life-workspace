// 应用 db/migrations 下所有 SQL 迁移（幂等：记录已应用的迁移）
// 桌面打包版通过环境变量定位：WORKBENCH_DATA_DIR=数据库目录，WORKBENCH_MIGRATIONS_DIR=迁移 SQL 目录
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@libsql/client";

const dataDir = process.env.WORKBENCH_DATA_DIR ?? path.join(process.cwd(), "data");
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const client = createClient({ url: "file:" + path.join(dataDir, "workbench.db") });

await client.execute(
  "CREATE TABLE IF NOT EXISTS __migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)"
);

const dir = process.env.WORKBENCH_MIGRATIONS_DIR ?? path.join(process.cwd(), "db", "migrations");
const files = fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();

for (const file of files) {
  const done = await client.execute({
    sql: "SELECT name FROM __migrations WHERE name = ?",
    args: [file],
  });
  if (done.rows.length > 0) {
    console.log("skip", file);
    continue;
  }
  const sql = fs.readFileSync(path.join(dir, file), "utf8");
  // drizzle-kit 用 --> statement-breakpoint 分隔语句
  const statements = sql
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter(Boolean);
  for (const stmt of statements) {
    await client.execute(stmt);
  }
  await client.execute({
    sql: "INSERT INTO __migrations (name, applied_at) VALUES (?, ?)",
    args: [file, new Date().toISOString()],
  });
  console.log("applied", file);
}
console.log("migrations done");
