import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { eq, isNull } from "drizzle-orm";
import { tasks, pomodoros } from "../db/schema.ts";
import { localDayWindow } from "../lib/day-rules.ts";
import { todayTaskWhere } from "../lib/task-query.ts";
import { parseTaskId, parseTaskInput, validTaskDate } from "../lib/task-input.ts";

test("任务输入校验保留明确字段，拒绝空标题、无效日期和枚举", () => {
  assert.deepEqual(parseTaskInput({ title: "  任务  ", note: null, dueDate: "2028-02-29", isToday: true }, true),
    { value: { title: "任务", note: null, dueDate: "2028-02-29", isToday: 1 } });
  for (const body of [null, [], {}, { title: " " }, { title: 1 }, { title: "任务", priority: "urgent" },
    { title: "任务", dueDate: "2026-02-30" }, { title: "任务", isToday: "1" }]) {
    assert.ok(parseTaskInput(body, true).error);
  }
  for (const body of [{}, { note: 3 }, { status: "deleted" }, { sortOrder: -1 }, { dueDate: "2026-2-1" }]) {
    assert.ok(parseTaskInput(body).error);
  }
  assert.deepEqual(parseTaskInput({ title: "新标题", deletedAt: "覆盖删除标记", id: 7 }), { value: { title: "新标题" } });
  assert.equal(validTaskDate("2026-02-29"), false);
  assert.equal(validTaskDate("2028-02-29"), true);
});

test("任务编号只接受安全的正整数", () => {
  assert.equal(parseTaskId("12"), 12);
  for (const value of ["0", "-1", "1.5", "1e2", "1abc", "01", "9007199254740992"]) {
    assert.equal(parseTaskId(value), null);
  }
});

test("软删除迁移保持旧任务与专注记录，删除隐藏后可按原编号恢复", async () => {
  const client = createClient({ url: "file::memory:" });
  const database = drizzle(client);
  try {
    const directory = new URL("../db/migrations/", import.meta.url);
    const files = (await readdir(directory)).filter((file) => file.endsWith(".sql")).sort();
    for (const file of files.filter((file) => file < "0005_task_recovery.sql")) {
      await client.executeMultiple(await readFile(new URL(file, directory), "utf8"));
    }
    await client.execute("INSERT INTO tasks (id,title,note,status,priority,due_date,is_today,sort_order,source,created_at,completed_at) VALUES (7,'原任务','原备注','done','high','2026-10-27',1,4,'manual','2026-10-26T01:00:00.000Z','2026-10-27T01:00:00.000Z')");
    await client.execute("INSERT INTO pomodoros (task_id,minutes,finished_at) VALUES (7,25,'2026-10-27T01:00:00.000Z')");
    const previous = (await client.execute("SELECT * FROM tasks WHERE id=7")).rows[0];
    await client.executeMultiple(await readFile(new URL("0005_task_recovery.sql", directory), "utf8"));
    const migrated = (await client.execute("SELECT * FROM tasks WHERE id=7")).rows[0];
    assert.deepEqual(migrated, { ...previous, deleted_at: null });
    for (const file of files.filter((file) => file > "0005_task_recovery.sql")) {
      await client.executeMultiple(await readFile(new URL(file, directory), "utf8"));
    }

    const [original] = await database.select().from(tasks).where(eq(tasks.id, 7));
    await database.update(tasks).set({ deletedAt: "2026-10-27T02:00:00.000Z" }).where(eq(tasks.id, 7));
    assert.deepEqual(await database.select().from(tasks).where(isNull(tasks.deletedAt)), []);
    assert.deepEqual(await database.select().from(tasks).where(todayTaskWhere(tasks, localDayWindow("2026-10-27"))), []);
    assert.equal((await database.select().from(pomodoros))[0].taskId, original.id);
    await database.update(tasks).set({ deletedAt: null }).where(eq(tasks.id, 7));
    assert.deepEqual((await database.select().from(tasks))[0], original);
    assert.equal((await database.select().from(pomodoros))[0].taskId, original.id);
  } finally {
    client.close();
  }
});
