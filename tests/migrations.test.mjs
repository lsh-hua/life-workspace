import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import test from "node:test";

const executeFile = promisify(execFile);
const migrationModule = new URL("../scripts/migrate.mjs", import.meta.url).href;
const safetyModule = new URL("../scripts/data-safety.mjs", import.meta.url).href;
const repositoryMigrations = fileURLToPath(new URL("../db/migrations/", import.meta.url));

async function scenario(t, run) {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "workbench-migrate-test-"));
  t.after(() => fs.rm(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }));
  const source = [
    'import assert from "node:assert/strict";',
    'import { execFile } from "node:child_process";',
    'import fs from "node:fs/promises";',
    'import path from "node:path";',
    'import { promisify } from "node:util";',
    'import { fileURLToPath, pathToFileURL } from "node:url";',
    'import { createClient } from "@libsql/client";',
    "import { migrateDatabase } from " + JSON.stringify(migrationModule) + ";",
    "import { getBackupPath, listBackups } from " + JSON.stringify(safetyModule) + ";",
    "const migrateScript = fileURLToPath(" + JSON.stringify(migrationModule) + ");",
    "const executeFile = promisify(execFile);",
    "await (" + run.toString() + ")(process.env.WORKBENCH_TEST_DATA_DIR);",
  ].join("\n");
  await executeFile(process.execPath, ["--input-type=module", "--eval", source], {
    env: { ...process.env, WORKBENCH_TEST_DATA_DIR: dataDir, WORKBENCH_TEST_MIGRATIONS_DIR: repositoryMigrations }, windowsHide: true,
  });
}

test("迁移中途失败时退出非零，失败文件的结构与记录均不落库", (t) => scenario(t, async (dataDir) => {
  const migrationsDir = path.join(dataDir, "sql");
  await fs.mkdir(migrationsDir);
  const source = createClient({ url: pathToFileURL(path.join(dataDir, "workbench.db")).href });
  await source.execute("CREATE TABLE notes (content TEXT)");
  await source.execute("INSERT INTO notes VALUES ('原始记录')");
  source.close();
  await fs.writeFile(path.join(migrationsDir, "0001_failed.sql"),
    "CREATE TABLE upgrades (id INTEGER);\n--> statement-breakpoint\nINSERT INTO missing_table VALUES (1);\n");
  await assert.rejects(executeFile(process.execPath, [migrateScript], {
    env: { ...process.env, WORKBENCH_DATA_DIR: dataDir, WORKBENCH_MIGRATIONS_DIR: migrationsDir }, windowsHide: true,
  }), (error) => error.code !== 0);
  const database = createClient({ url: pathToFileURL(path.join(dataDir, "workbench.db")).href });
  assert.equal((await database.execute("SELECT name FROM sqlite_master WHERE name = 'upgrades'")).rows.length, 0);
  assert.equal((await database.execute("SELECT name FROM __migrations")).rows.length, 0);
  assert.equal((await database.execute("SELECT content FROM notes")).rows[0].content, "原始记录");
  database.close();
  const backups = await listBackups({ dataDir });
  assert.equal(backups.length, 1);
  assert.equal(backups[0].reason, "migration");
}));

test("升级前保留可读取的旧版快照，重复运行不会重复迁移或备份", (t) => scenario(t, async (dataDir) => {
  const migrationsDir = path.join(dataDir, "sql");
  await fs.mkdir(migrationsDir);
  const source = createClient({ url: pathToFileURL(path.join(dataDir, "workbench.db")).href });
  await source.execute("CREATE TABLE notes (content TEXT NOT NULL)");
  await source.execute("INSERT INTO notes VALUES ('升级前记录')");
  source.close();
  await fs.writeFile(path.join(migrationsDir, "0001_add_detail.sql"),
    "ALTER TABLE notes ADD COLUMN detail TEXT;\n--> statement-breakpoint\nUPDATE notes SET detail = '新版本';");
  const result = await migrateDatabase({ dataDir, migrationsDir });
  assert.deepEqual(result.applied, ["0001_add_detail.sql"]);
  const snapshot = createClient({ url: pathToFileURL(await getBackupPath({ dataDir, name: result.backup.name })).href });
  assert.deepEqual((await snapshot.execute("PRAGMA table_info(notes)")).rows.map((row) => row.name), ["content"]);
  assert.equal((await snapshot.execute("SELECT content FROM notes")).rows[0].content, "升级前记录");
  snapshot.close();
  assert.deepEqual(await migrateDatabase({ dataDir, migrationsDir }), { applied: [], backup: null });
  assert.equal((await listBackups({ dataDir })).length, 1);
}));

test("升级前备份失败时不执行结构变更", (t) => scenario(t, async (dataDir) => {
  const migrationsDir = path.join(dataDir, "sql");
  await fs.mkdir(migrationsDir);
  const source = createClient({ url: pathToFileURL(path.join(dataDir, "workbench.db")).href });
  await source.execute("CREATE TABLE notes (content TEXT)");
  source.close();
  await fs.writeFile(path.join(dataDir, "backups"), "占用备份目录，模拟无法保存备份");
  await fs.writeFile(path.join(migrationsDir, "0001_blocked.sql"), "CREATE TABLE should_not_exist (id INTEGER);");
  await assert.rejects(migrateDatabase({ dataDir, migrationsDir }));
  const database = createClient({ url: pathToFileURL(path.join(dataDir, "workbench.db")).href });
  const names = (await database.execute("SELECT name FROM sqlite_master WHERE type = 'table'")).rows.map((row) => row.name);
  assert.deepEqual(names, ["notes"]);
  database.close();
}));

test("全新临时库可应用仓库全部迁移并保持幂等", (t) => scenario(t, async (dataDir) => {
  const migrationsDir = process.env.WORKBENCH_TEST_MIGRATIONS_DIR;
  const result = await migrateDatabase({ dataDir, migrationsDir });
  assert.equal(result.applied.length, 4);
  assert.equal(result.backup, null);
  assert.deepEqual(await migrateDatabase({ dataDir, migrationsDir }), { applied: [], backup: null });
}));

test("迁移记录写入失败时，同一个文件的业务变更也回滚", (t) => scenario(t, async (dataDir) => {
  const migrationsDir = path.join(dataDir, "sql");
  await fs.mkdir(migrationsDir);
  const source = createClient({ url: pathToFileURL(path.join(dataDir, "workbench.db")).href });
  await source.execute("CREATE TABLE notes (content TEXT)");
  await source.execute("INSERT INTO notes VALUES ('不可丢失')");
  source.close();
  await fs.writeFile(path.join(migrationsDir, "0001_no_ledger.sql"),
    "DELETE FROM notes;\n--> statement-breakpoint\nDROP TABLE __migrations;");
  await assert.rejects(migrateDatabase({ dataDir, migrationsDir }));
  const database = createClient({ url: pathToFileURL(path.join(dataDir, "workbench.db")).href });
  assert.equal((await database.execute("SELECT content FROM notes")).rows[0].content, "不可丢失");
  assert.equal((await database.execute("SELECT * FROM __migrations")).rows.length, 0);
  database.close();
}));
