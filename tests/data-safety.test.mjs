import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import test from "node:test";

const executeFile = promisify(execFile);
const safetyModule = new URL("../scripts/data-safety.mjs", import.meta.url).href;

// 原生数据库连接在独立进程退出时完全释放，避免 Windows 临时文件清理依赖 GC。
async function scenario(t, run) {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "workbench-backup-test-"));
  t.after(() => fs.rm(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }));
  const source = [
    'import assert from "node:assert/strict";',
    'import fs from "node:fs/promises";',
    'import path from "node:path";',
    'import { pathToFileURL } from "node:url";',
    'import { mock } from "node:test";',
    'import { createClient } from "@libsql/client";',
    "import { createBackup, ensureDailyBackup, getBackupPath, listBackups } from " + JSON.stringify(safetyModule) + ";",
    "await (" + run.toString() + ")(process.env.WORKBENCH_TEST_DATA_DIR);",
  ].join("\n");
  const result = await executeFile(process.execPath, ["--input-type=module", "--eval", source], {
    env: { ...process.env, WORKBENCH_TEST_DATA_DIR: dataDir }, windowsHide: true,
  });
  if (result.stdout.trim() === "SKIP_SYMLINK") t.skip("当前 Windows 账户没有创建文件符号链接权限");
}

test("手动备份包含 WAL 已提交数据，且后续修改不会污染快照", (t) => scenario(t, async (dataDir) => {
  const source = createClient({ url: pathToFileURL(path.join(dataDir, "workbench.db")).href });
  await source.execute("PRAGMA journal_mode = WAL");
  await source.execute("PRAGMA wal_autocheckpoint = 0");
  await source.execute("CREATE TABLE notes (content TEXT NOT NULL)");
  await source.execute({ sql: "INSERT INTO notes VALUES (?)", args: ["必须保留的原始数据"] });
  const backup = await createBackup({ dataDir, reason: "manual" });
  assert.equal(backup.reason, "manual");
  assert.ok(backup.size > 0);
  assert.ok(Number.isFinite(Date.parse(backup.createdAt)));
  const backupPath = await getBackupPath({ dataDir, name: backup.name });
  await source.execute("UPDATE notes SET content = '后续修改'");
  const snapshot = createClient({ url: pathToFileURL(backupPath).href });
  assert.equal((await snapshot.execute("SELECT content FROM notes")).rows[0].content, "必须保留的原始数据");
  source.close();
  snapshot.close();
}));

test("每日备份同一天只生成一份，并保留手动备份", (t) => scenario(t, async (dataDir) => {
  const source = createClient({ url: pathToFileURL(path.join(dataDir, "workbench.db")).href });
  await source.execute("CREATE TABLE notes (content TEXT)");
  source.close();
  mock.timers.enable({ apis: ["Date"], now: new Date("2026-10-25T09:00:00+08:00").valueOf() });
  await createBackup({ dataDir, reason: "manual" });
  mock.timers.tick(1_000);
  const [first, second] = await Promise.all([ensureDailyBackup({ dataDir }), ensureDailyBackup({ dataDir })]);
  assert.equal(first.name, second.name);
  assert.equal((await ensureDailyBackup({ dataDir })).name, first.name);
  mock.timers.tick(24 * 60 * 60 * 1000);
  await ensureDailyBackup({ dataDir });
  const backups = await listBackups({ dataDir });
  assert.deepEqual(backups.map((backup) => backup.reason), ["daily", "daily", "manual"]);
}));

test("缺少数据库时返回明确错误，且不会凭空创建源数据库", (t) => scenario(t, async (dataDir) => {
  await assert.rejects(createBackup({ dataDir, reason: "manual" }), { code: "MISSING_DATABASE" });
  assert.equal(await ensureDailyBackup({ dataDir }), null);
  await assert.rejects(fs.access(path.join(dataDir, "workbench.db")), { code: "ENOENT" });
}));

test("下载路径拒绝路径穿越、任意文件和损坏的备份", (t) => scenario(t, async (dataDir) => {
  const directory = path.join(dataDir, "backups");
  await fs.mkdir(directory);
  const name = "workbench-manual-2026-10-25T06-00-00.000Z-1234abcd.db";
  await fs.writeFile(path.join(directory, name), "损坏内容");
  for (const invalidName of ["../workbench.db", "..\\workbench.db", "workbench.db", path.join(directory, name)]) {
    await assert.rejects(getBackupPath({ dataDir, name: invalidName }), /备份文件名无效/);
  }
  await assert.rejects(getBackupPath({ dataDir, name }), /有效的 SQLite/);
  assert.deepEqual(await listBackups({ dataDir }), []);
}));

test("下载路径拒绝指向其他文件的符号链接", (t) => scenario(t, async (dataDir) => {
  const directory = path.join(dataDir, "backups");
  await fs.mkdir(directory);
  const target = path.join(dataDir, "outside.db");
  await fs.writeFile(target, "不允许读取的文件");
  const name = "workbench-manual-2026-10-25T06-00-00.000Z-1234abcd.db";
  try {
    await fs.symlink(target, path.join(directory, name), "file");
  } catch (error) {
    if (error.code === "EPERM") return console.log("SKIP_SYMLINK");
    throw error;
  }
  await assert.rejects(getBackupPath({ dataDir, name }), /普通文件/);
  assert.deepEqual(await listBackups({ dataDir }), []);
}));

test("保留 SQLite 头部但页面损坏的文件仍不能下载", (t) => scenario(t, async (dataDir) => {
  const source = createClient({ url: pathToFileURL(path.join(dataDir, "workbench.db")).href });
  await source.execute("CREATE TABLE notes (content TEXT)");
  source.close();
  const valid = await createBackup({ dataDir, reason: "manual" });
  const bytes = await fs.readFile(await getBackupPath({ dataDir, name: valid.name }));
  bytes[100] = 0;
  const name = "workbench-manual-2026-10-25T06-00-00.000Z-1234abcd.db";
  await fs.writeFile(path.join(dataDir, "backups", name), bytes);
  await assert.rejects(getBackupPath({ dataDir, name }));
  assert.deepEqual((await listBackups({ dataDir })).map((backup) => backup.name), [valid.name]);
}));

test("备份目录拒绝指向外部目录的链接或 junction", (t) => scenario(t, async (dataDir) => {
  const target = path.join(dataDir, "outside");
  await fs.mkdir(target);
  await fs.symlink(target, path.join(dataDir, "backups"), process.platform === "win32" ? "junction" : "dir");
  await assert.rejects(listBackups({ dataDir }), /备份目录无效/);
}));
