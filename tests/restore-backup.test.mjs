import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import test from "node:test";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { restoreBackup, recoverRestore } from "../scripts/restore-backup.mjs";

const executeFile = promisify(execFile);

async function database(directory, operation) {
  const code = `import {createClient} from '@libsql/client'; import {pathToFileURL} from 'node:url'; import path from 'node:path'; import {migrateDatabase} from './scripts/migrate.mjs'; import {createBackup} from './scripts/data-safety.mjs';
    const dataDir=process.argv[1]; let result;
    if(process.argv[2]==='fixture'){await migrateDatabase({dataDir});const c=createClient({url:pathToFileURL(path.join(dataDir,'workbench.db')).href});await c.execute("INSERT INTO tasks (title,created_at) VALUES ('备份时的内容','2026-10-27T00:00:00Z')");c.close();result=true;}
    else if(process.argv[2]==='backup'){result=await createBackup({dataDir,reason:'manual'});}
    else if(process.argv[2]==='mutate'){const c=createClient({url:pathToFileURL(path.join(dataDir,'workbench.db')).href});await c.execute("UPDATE tasks SET title='恢复前的新内容'");c.close();result=true;}
    else if(process.argv[2]==='future'){const c=createClient({url:pathToFileURL(dataDir).href});await c.execute("INSERT INTO __migrations(name,applied_at) VALUES ('9999_future.sql','2026-10-28')");c.close();result=true;}
    else{const c=createClient({url:pathToFileURL(path.join(dataDir,'workbench.db')).href});result=(await c.execute('SELECT title FROM tasks')).rows[0].title;c.close();} console.log(JSON.stringify(result));`;
  const { stdout } = await executeFile(process.execPath, ["--input-type=module", "-e", code, directory, operation], { windowsHide: true });
  return JSON.parse(stdout.trim().split(/\r?\n/).at(-1));
}

async function fixture(context) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "workbench-restore-"));
  context.after(() => fs.rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }));
  const dataDir = path.join(root, "data");
  await database(dataDir, "fixture");
  const backup = await database(dataDir, "backup");
  await database(dataDir, "mutate");
  return { dataDir, name: backup.name };
}

test("恢复保留整个旧目录、最新数据与全部备份，活动库来自所选快照", async (context) => {
  const { dataDir, name } = await fixture(context);
  const result = await restoreBackup({ dataDir, name });
  assert.equal(await database(dataDir, "read"), "备份时的内容");
  assert.equal(await database(result.retainedDirectory, "read"), "恢复前的新内容");
  await fs.access(path.join(result.retainedDirectory, "backups", name));
  await fs.access(path.join(result.retainedDirectory, "backups", result.previousSnapshot));
});

test("复制失败后完整退回旧目录，记录和备份仍可读取", async (context) => {
  const { dataDir, name } = await fixture(context);
  await assert.rejects(restoreBackup({ dataDir, name, copySnapshot: async () => { throw new Error("模拟磁盘失败"); } }), /已回到恢复前/);
  assert.equal(await database(dataDir, "read"), "恢复前的新内容");
  await fs.access(path.join(dataDir, "backups", name));
});

test("无效备份名和路径穿越在移动数据前被拒绝", async (context) => {
  const { dataDir } = await fixture(context);
  await assert.rejects(restoreBackup({ dataDir, name: "../workbench.db" }));
  assert.equal(await database(dataDir, "read"), "恢复前的新内容");
});

test("目录切换中断后，下次启动恢复旧数据，不创建空白工作台", async (context) => {
  const { dataDir } = await fixture(context);
  const retainedDirectory = `${dataDir}-before-restore-test`;
  await fs.writeFile(`${dataDir}.restore-pending.json`, JSON.stringify({ phase: "prepared", retainedDirectory }));
  await fs.rename(dataDir, retainedDirectory);
  await fs.mkdir(dataDir);
  await fs.writeFile(path.join(dataDir, "未完成复制.tmp"), "中断");
  await recoverRestore({ dataDir });
  assert.equal(await database(dataDir, "read"), "恢复前的新内容");
  await fs.access(path.join(`${retainedDirectory}-interrupted`, "未完成复制.tmp"));
});

test("来自未来版本的备份在目录切换前被拒绝", async (context) => {
  const { dataDir, name } = await fixture(context);
  await database(path.join(dataDir, "backups", name), "future");
  await assert.rejects(restoreBackup({ dataDir, name }), /不兼容的版本/);
  assert.equal(await database(dataDir, "read"), "恢复前的新内容");
});

test("恢复已经提交但清理记录前中断时，保留新库和旧目录", async (context) => {
  const { dataDir, name } = await fixture(context);
  const retainedDirectory = `${dataDir}-before-restore-test-committed`;
  await fs.rename(dataDir, retainedDirectory);
  await fs.mkdir(dataDir);
  await fs.copyFile(path.join(retainedDirectory, "backups", name), path.join(dataDir, "workbench.db"));
  await fs.writeFile(`${dataDir}.restore-pending.json`, JSON.stringify({ phase: "committed", retainedDirectory }));
  const recovered = await recoverRestore({ dataDir });
  assert.equal(recovered.retainedDirectory, retainedDirectory);
  assert.equal(await database(dataDir, "read"), "备份时的内容");
  assert.equal(await database(retainedDirectory, "read"), "恢复前的新内容");
});
