// 使用打包版 Electron 的 Node 模式和系统临时库，不启动真实桌面应用。
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import test from "node:test";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execute = promisify(execFile);
const packaged = process.env.WORKBENCH_PACKAGED_APP;

test("打包版运行时恢复备份并保留恢复前数据库和备份目录", { skip: !packaged, timeout: 120000 }, async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "workbench-packaged-restore-"));
  context.after(async () => {
    if (!path.resolve(root).startsWith(path.resolve(os.tmpdir()) + path.sep)) throw new Error("临时目录位置无效");
    await fs.rm(root, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
  });
  const dataDir = path.join(root, "data");
  const server = path.join(packaged, "resources", "app", "server");
  const runner = path.join(packaged, "人生工作台.exe");
  const env = { ...process.env, ELECTRON_RUN_AS_NODE: "1", WORKBENCH_DATA_DIR: dataDir, WORKBENCH_MIGRATIONS_DIR: path.join(server, "migrations") };
  const run = (args) => execute(runner, args, { cwd: server, env, windowsHide: true, timeout: 60000 });
  const sql = async (directory, statement) => {
    const code = `import {createClient} from '@libsql/client'; import {pathToFileURL} from 'node:url'; import path from 'node:path'; const c=createClient({url:pathToFileURL(path.join(process.argv[1],'workbench.db')).href}); const result=await c.execute(process.argv[2]); c.close(); console.log(JSON.stringify(result.rows));`;
    return JSON.parse((await run(["--input-type=module", "-e", code, directory, statement])).stdout.trim());
  };
  await run([path.join(server, "migrate.mjs")]);
  await sql(dataDir, "INSERT INTO tasks(title,created_at) VALUES ('备份中的任务','2026-10-28T00:00:00Z')");
  await run([path.join(server, "backup.mjs")]);
  const names = (await fs.readdir(path.join(dataDir, "backups"))).filter((name) => name.startsWith("workbench-manual-"));
  assert.equal(names.length, 1);
  await sql(dataDir, "UPDATE tasks SET title='恢复之前的新内容'");
  const { stdout } = await run([path.join(server, "restore-backup.mjs"), names[0]]);
  const line = stdout.split(/\r?\n/).find((value) => value.startsWith("RESTORE_RESULT="));
  assert.ok(line, "未收到恢复结果");
  const result = JSON.parse(line.slice("RESTORE_RESULT=".length));
  assert.equal(path.dirname(result.retainedDirectory), root);
  assert.equal((await sql(dataDir, "SELECT title FROM tasks"))[0].title, "备份中的任务");
  assert.equal((await sql(result.retainedDirectory, "SELECT title FROM tasks"))[0].title, "恢复之前的新内容");
  await fs.access(path.join(result.retainedDirectory, "backups", names[0]));
  await fs.access(path.join(result.retainedDirectory, "backups", result.previousSnapshot));
  await assert.rejects(fs.access(`${dataDir}.restore-pending.json`));
});
