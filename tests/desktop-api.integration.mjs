// 生产服务端到端验证；只在系统临时目录内创建独立数据库。
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import net from "node:net";
import { fileURLToPath } from "node:url";
import { createClient } from "@libsql/client";
import { fmtDate, todayStr } from "../lib/dates.ts";

const root = fileURLToPath(new URL("../", import.meta.url));
const packagedApp = process.env.WORKBENCH_PACKAGED_APP;
const packagedServer = packagedApp ? path.join(packagedApp, "resources", "app", "server") : null;
const runner = packagedApp ? path.join(packagedApp, "人生工作台.exe") : process.execPath;
const dataDir = await mkdtemp(path.join(tmpdir(), "workbench-api-test-"));
const today = todayStr();
const yesterdayDate = new Date();
yesterdayDate.setDate(yesterdayDate.getDate() - 1);
const yesterday = fmtDate(yesterdayDate);
let service;
let baseUrl;
let output = "";
let backupName;

function runMigration() {
  return new Promise((resolve, reject) => {
    const migration = packagedServer ? path.join(packagedServer, "migrate.mjs") : "scripts/migrate.mjs";
    const child = spawn(runner, [migration], {
      cwd: root,
      env: {
        ...process.env,
        WORKBENCH_DATA_DIR: dataDir,
        ...(packagedServer ? { ELECTRON_RUN_AS_NODE: "1", WORKBENCH_MIGRATIONS_DIR: path.join(packagedServer, "migrations") } : {}),
      },
      windowsHide: true,
    });
    let log = "";
    child.stdout.on("data", (chunk) => { log += chunk; });
    child.stderr.on("data", (chunk) => { log += chunk; });
    child.on("error", reject);
    child.on("exit", (code) => code === 0 ? resolve() : reject(new Error(log)));
  });
}

function availablePort() {
  return new Promise((resolve, reject) => {
    const listener = net.createServer();
    listener.on("error", reject);
    listener.listen(0, "127.0.0.1", () => {
      const port = listener.address().port;
      listener.close(() => resolve(port));
    });
  });
}

async function request(url, body) {
  const response = await fetch(baseUrl + url, body === undefined ? undefined : {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { response, data: await response.json() };
}

async function createFixtures() {
  const client = createClient({ url: `file:${path.join(dataDir, "workbench.db")}` });
  const insert = "INSERT INTO tasks(title,status,due_date,is_today,created_at,completed_at) VALUES (?,?,?,?,?,?)";
  await client.batch([
    { sql: insert, args: ["昨日已完成", "done", yesterday, 1, new Date().toISOString(), yesterday + "T00:00:00.000Z"] },
    { sql: insert, args: ["顺延未完成", "todo", yesterday, 1, new Date().toISOString(), null] },
    { sql: insert, args: ["今日新任务", "todo", today, 1, new Date().toISOString(), null] },
    { sql: insert, args: ["今日完成旧任务", "done", yesterday, 0, new Date().toISOString(), new Date().toISOString()] },
  ], "write");
  client.close();
}

before(async () => {
  await runMigration();
  await createFixtures();
  const port = await availablePort();
  baseUrl = `http://127.0.0.1:${port}`;
  const args = packagedServer
    ? [path.join(packagedServer, "server.js")]
    : ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", String(port)];
  service = spawn(runner, args, {
    cwd: packagedServer ?? root,
    env: {
      ...process.env, NODE_ENV: "production", WORKBENCH_DATA_DIR: dataDir,
      ...(packagedServer ? { ELECTRON_RUN_AS_NODE: "1", PORT: String(port), HOSTNAME: "127.0.0.1" } : {}),
    },
    windowsHide: true,
  });
  service.stdout.on("data", (chunk) => { output += chunk; });
  service.stderr.on("data", (chunk) => { output += chunk; });
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      if ((await fetch(baseUrl + "/api/tasks")).ok) return;
    } catch {}
    if (service.exitCode !== null) throw new Error(output);
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("测试服务启动超时：" + output);
}, { timeout: 30000 });

after(async () => {
  if (service && service.exitCode === null) {
    const stopped = new Promise((resolve) => service.once("exit", resolve));
    service.kill();
    await stopped;
  }
  assert.ok(path.resolve(dataDir).startsWith(path.resolve(tmpdir()) + path.sep));
  await rm(dataDir, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
});

test("总览与今日列表一致，旧已完成移出今日但历史保留", async () => {
  const { data: tasks } = await request("/api/tasks?filter=today");
  assert.deepEqual(tasks.map((task) => task.title).sort(), ["顺延未完成", "今日新任务", "今日完成旧任务"].sort());
  const { data: overview } = await request("/api/overview");
  assert.equal(overview.today.total, 3);
  assert.equal(overview.today.done, 1);
  const { data: all } = await request("/api/tasks");
  assert.equal(all.length, 4);
});

test("同一天并发首次保存复盘不会撞唯一索引", async () => {
  const results = await Promise.all([
    request("/api/reviews", { date: today, doneText: "第一次保存" }),
    request("/api/reviews", { date: today, doneText: "第二次保存" }),
  ]);
  assert.ok(results.every(({ response }) => response.ok));
  const { data } = await request("/api/reviews");
  assert.equal(data.filter((review) => review.date === today).length, 1);
});

test("无效复盘日期返回明确的400错误", async () => {
  const { response } = await request("/api/reviews", { date: "2026-02-30", doneText: "错误日期" });
  assert.equal(response.status, 400);
});

test("手动备份限制跨站请求，且备份目录属于临时测试库", async () => {
  const blocked = await fetch(baseUrl + "/api/backups", { method: "POST", headers: { Origin: "https://example.invalid" } });
  assert.equal(blocked.status, 403);
  const { response, data } = await request("/api/backups", {});
  assert.equal(response.status, 201);
  assert.equal(data.reason, "manual");
  backupName = data.name;
  const list = await request("/api/backups");
  assert.equal(list.data.dataDirectory, dataDir);
  assert.ok(list.data.backups.some((backup) => backup.name === backupName));
});

test("浏览器携带真实同源Origin时可以创建备份", async () => {
  const response = await fetch(baseUrl + "/api/backups", {
    method: "POST",
    headers: { Origin: baseUrl, "Sec-Fetch-Site": "same-origin", "Content-Type": "application/json" },
    body: "{}",
  });
  assert.equal(response.status, 201);
});

test("备份下载为完整SQLite快照，后续写入不会污染备份", async () => {
  await request("/api/reviews", { date: "2001-01-01", doneText: "备份之后保存" });
  const response = await fetch(baseUrl + "/api/backups/" + encodeURIComponent(backupName));
  assert.equal(response.status, 200);
  assert.ok(response.headers.get("content-disposition").includes("attachment"));
  const bytes = new Uint8Array(await response.arrayBuffer());
  const copy = path.join(dataDir, "download-copy.db");
  await writeFile(copy, bytes);
  assert.equal((await readFile(copy)).subarray(0, 15).toString(), "SQLite format 3");
  const client = createClient({ url: `file:${copy}` });
  const result = await client.execute("SELECT COUNT(*) AS total FROM reviews WHERE date='2001-01-01'");
  assert.equal(Number(result.rows[0].total), 0);
  assert.equal((await client.execute("PRAGMA integrity_check")).rows[0].integrity_check, "ok");
  client.close();
});

test("下载接口不能读取原始数据库或穿越备份目录", async () => {
  for (const name of ["workbench.db", "..%2Fworkbench.db", "not-a-backup.db"]) {
    const response = await fetch(baseUrl + "/api/backups/" + name);
    assert.equal(response.status, 404);
  }
});
