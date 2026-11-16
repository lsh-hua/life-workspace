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

test("任务编辑、软删除和恢复保持原编号，并从常规查询与统计隐藏", async () => {
  const title = "恢复流程专属任务";
  const created = await request("/api/tasks", { title, note: "保留备注", dueDate: today, priority: "high", isToday: 1, sortOrder: 777 });
  assert.equal(created.response.status, 201);
  const id = created.data.id;
  const patch = (body) => fetch(`${baseUrl}/api/tasks/${id}`, {
    method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  const updated = await patch({ title: title + "已编辑", note: "新备注", priority: "low" });
  assert.equal(updated.status, 200);
  assert.equal((await updated.json()).note, "新备注");
  await request("/api/pomodoros", { taskId: id, minutes: 25 });
  const before = (await request("/api/overview")).data;
  const removed = await fetch(`${baseUrl}/api/tasks/${id}`, { method: "DELETE" });
  assert.equal(removed.status, 200);
  const deleted = (await request(`/api/tasks/${id}`)).data;
  assert.equal(deleted.id, id);
  assert.ok(deleted.deletedAt);
  assert.equal((await patch({ title: "不应保存" })).status, 409);
  for (const query of ["", "?filter=today", "?filter=week", `?date=${today}`]) {
    assert.ok(!(await request(`/api/tasks${query}`)).data.some((task) => task.id === id));
  }
  assert.ok((await request("/api/tasks?filter=deleted")).data.some((task) => task.id === id));
  assert.equal((await request(`/api/search?q=${encodeURIComponent(title)}`)).data.tasks.length, 0);
  assert.ok(!(await request("/api/report")).data.tasks.some((task) => task.id === id));
  const afterDeletion = (await request("/api/overview")).data;
  assert.equal(afterDeletion.today.total, before.today.total - 1);
  assert.equal(afterDeletion.week.total, before.week.total - 1);
  await request("/api/tasks/reorder", { ids: [id] });
  assert.equal((await request(`/api/tasks/${id}`)).data.sortOrder, 777);
  await fetch(`${baseUrl}/api/tasks/${id}`, { method: "DELETE" });
  assert.equal((await request(`/api/tasks/${id}`)).data.deletedAt, deleted.deletedAt);

  const restored = await patch({ action: "restore" });
  assert.equal(restored.status, 200);
  const row = await restored.json();
  assert.deepEqual(row, { ...deleted, deletedAt: null });
  assert.equal((await patch({ action: "restore" })).status, 200);
  assert.ok((await request("/api/tasks")).data.some((task) => task.id === id));
  const client = createClient({ url: `file:${path.join(dataDir, "workbench.db")}` });
  try { assert.equal((await client.execute({ sql: "SELECT task_id FROM pomodoros WHERE task_id=?", args: [id] })).rows[0].task_id, id); }
  finally { client.close(); }
});

test("任务接口对无效编号、空标题和错误日期返回明确错误", async () => {
  for (const body of [{ title: " " }, { title: "任务", dueDate: "2026-02-30" }, { title: "任务", priority: "unknown" }]) {
    assert.equal((await request("/api/tasks", body)).response.status, 400);
  }
  assert.equal((await request("/api/tasks/invalid")).response.status, 400);
  assert.equal((await request("/api/tasks/999999999")).response.status, 404);
  assert.equal((await request("/api/tasks?date=2026-02-30")).response.status, 400);
  assert.equal((await request("/api/tasks/reorder", { ids: [1, 1] })).response.status, 400);
});

test("重复任务并发完成只创建一次后续记录，保留本次历史与日期间隔", async () => {
  const rule = JSON.stringify({ frequency: "daily", basis: "schedule", anchorDate: today });
  const deadline = new Date(`${today}T12:00:00`);
  deadline.setDate(deadline.getDate() + 2);
  const created = await request("/api/tasks", { title: "周期验收", note: "保留备注", plannedDate: today, dueDate: fmtDate(deadline), repeatRule: rule });
  assert.equal(created.response.status, 201);
  const id = created.data.id;
  const complete = () => fetch(`${baseUrl}/api/tasks/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "done" }) });
  const responses = await Promise.all([complete(), complete()]);
  assert.ok(responses.every((response) => response.ok), `并发完成状态：${responses.map((response) => response.status).join(",")}`);
  const rows = (await request("/api/tasks")).data;
  const previous = rows.find((task) => task.id === id);
  const next = rows.filter((task) => task.repeatParentId === id);
  assert.equal(previous.status, "done");
  assert.equal(next.length, 1);
  const tomorrow = new Date(`${today}T12:00:00`);
  tomorrow.setDate(tomorrow.getDate() + 1);
  deadline.setDate(deadline.getDate() + 1);
  assert.equal(next[0].plannedDate, fmtDate(tomorrow));
  assert.equal(next[0].dueDate, fmtDate(deadline));
  assert.equal(next[0].note, "保留备注");
});

test("复盘行动并发重复提交只创建一条，已删除记录不会被静默复活", async () => {
  const body = { title: "复盘行动验收", source: "review", originKey: `review:${today}:${"a".repeat(64)}`, plannedDate: today };
  const results = await Promise.all([request("/api/tasks", body), request("/api/tasks", body)]);
  assert.ok(results.every(({ response }) => [200, 201].includes(response.status)));
  assert.equal(results[0].data.id, results[1].data.id);
  const id = results[0].data.id;
  await fetch(`${baseUrl}/api/tasks/${id}`, { method: "DELETE" });
  const repeated = await request("/api/tasks", body);
  assert.equal(repeated.response.status, 200);
  assert.equal(repeated.data.id, id);
  assert.ok(repeated.data.deletedAt);
});
