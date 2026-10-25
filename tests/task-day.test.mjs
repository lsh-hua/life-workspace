import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test, { after } from "node:test";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { asc, count, eq, sql } from "drizzle-orm";
import { tasks } from "../db/schema.ts";
import { localDayWindow } from "../lib/day-rules.ts";
import { todayTaskWhere } from "../lib/task-query.ts";

const originalTimezone = process.env.TZ;
process.env.TZ = "Asia/Shanghai";
after(() => {
  if (originalTimezone === undefined) delete process.env.TZ;
  else process.env.TZ = originalTimezone;
});

async function withTasks(rows, run) {
  const client = createClient({ url: "file::memory:" });
  const database = drizzle(client);
  try {
    const migration = await readFile(new URL("../db/migrations/0000_legal_mulholland_black.sql", import.meta.url), "utf8");
    await client.executeMultiple(migration);
    if (rows.length) {
      await database.insert(tasks).values(rows.map((row) => ({ createdAt: "2026-10-01T00:00:00.000Z", ...row })));
    }
    await run(database);
  } finally {
    client.close();
  }
}

async function todayTitles(database, date) {
  const rows = await database.select().from(tasks).where(todayTaskWhere(tasks, localDayWindow(date))).orderBy(asc(tasks.id));
  return rows.map((row) => row.title);
}

test("旧已完成的手动今日任务从今日移除，历史记录保持可读", async () => {
  await withTasks([
    { title: "旧已完成", dueDate: "2026-10-24", isToday: 1, status: "done", completedAt: "2026-10-24T04:00:00.000Z" },
  ], async (database) => {
    assert.deepEqual(await todayTitles(database, "2026-10-25"), []);
    assert.deepEqual((await database.select().from(tasks)).map((row) => row.title), ["旧已完成"]);
  });
});

test("旧截止日但今天完成的任务按本地日计入，包含未手动加入今日的任务", async () => {
  await withTasks([
    { title: "今日凌晨完成", dueDate: "2026-10-20", isToday: 0, status: "done", completedAt: "2026-10-24T16:00:00.000Z" },
    { title: "昨天最后一刻完成", dueDate: "2026-10-20", isToday: 1, status: "done", completedAt: "2026-10-24T15:59:59.999Z" },
    { title: "今天最后一刻完成", dueDate: null, isToday: 0, status: "done", completedAt: "2026-10-25T15:59:59.999Z" },
    { title: "明日零点完成", dueDate: "2026-10-20", isToday: 1, status: "done", completedAt: "2026-10-25T16:00:00.000Z" },
    { title: "旧完成无时间戳", dueDate: "2026-10-20", isToday: 1, status: "done", completedAt: null },
  ], async (database) => {
    assert.deepEqual(await todayTitles(database, "2026-10-25"), ["今日凌晨完成", "今天最后一刻完成"]);
  });
});

test("今日截止日优先保留，手动未完成可顺延，未标记的旧未完成不擅自加入", async () => {
  await withTasks([
    { title: "今日截止未完成", dueDate: "2026-10-25", isToday: 0, status: "todo" },
    { title: "今日截止旧完成", dueDate: "2026-10-25", isToday: 0, status: "done", completedAt: "2026-10-23T04:00:00.000Z" },
    { title: "旧手动未完成", dueDate: "2026-10-20", isToday: 1, status: "todo" },
    { title: "旧未标记未完成", dueDate: "2026-10-20", isToday: 0, status: "todo" },
    { title: "未来截止但手动今日", dueDate: "2026-11-01", isToday: 1, status: "todo" },
    { title: "未来截止未标记", dueDate: "2026-11-01", isToday: 0, status: "todo" },
    { title: "无日期手动今日", dueDate: null, isToday: 1, status: "todo" },
  ], async (database) => {
    assert.deepEqual(await todayTitles(database, "2026-10-25"), [
      "今日截止未完成", "今日截止旧完成", "旧手动未完成", "未来截止但手动今日", "无日期手动今日",
    ]);
  });
});

test("跨日后只顺延未完成手动任务，历史完成任务仍保留", async () => {
  await withTasks([
    { title: "继续做", dueDate: "2026-10-24", isToday: 1, status: "todo" },
    { title: "今天完成", dueDate: "2026-10-24", isToday: 1, status: "done", completedAt: "2026-10-25T04:00:00.000Z" },
  ], async (database) => {
    assert.deepEqual(await todayTitles(database, "2026-10-25"), ["继续做", "今天完成"]);
    assert.deepEqual(await todayTitles(database, "2026-10-26"), ["继续做"]);
    assert.equal((await database.select().from(tasks)).length, 2);
  });
});

test("首页统计与今日列表共用筛选后，总量及完成量一致", async () => {
  await withTasks([
    { title: "今日计划", dueDate: "2026-10-25", isToday: 0, status: "todo" },
    { title: "今日完成旧任务", dueDate: "2026-10-24", isToday: 0, status: "done", completedAt: "2026-10-25T02:00:00.000Z" },
    { title: "昨日完成", dueDate: "2026-10-24", isToday: 1, status: "done", completedAt: "2026-10-24T02:00:00.000Z" },
  ], async (database) => {
    const where = todayTaskWhere(tasks, localDayWindow("2026-10-25"));
    const rows = await database.select().from(tasks).where(where);
    const [summary] = await database.select({
      total: count(),
      done: sql`sum(case when ${eq(tasks.status, "done")} then 1 else 0 end)`,
    }).from(tasks).where(where);
    assert.deepEqual(rows.map((row) => row.title), ["今日计划", "今日完成旧任务"]);
    assert.deepEqual(summary, { total: 2, done: 1 });
  });
});
