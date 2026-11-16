import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { tasks } from "../db/schema.ts";
import { localDayWindow } from "../lib/day-rules.ts";
import { taskPeriodWhere, todayTaskWhere } from "../lib/task-query.ts";
import { parseTaskInput } from "../lib/task-input.ts";
import { nextRepeatDate, nextRepeatDates, parseTaskRepeat, serializeTaskRepeat } from "../lib/task-repeat.ts";

const rule = (frequency, basis = "schedule", anchorDate = "2026-01-31") => ({ frequency, basis, anchorDate });

test("周期规则只接受有效频率、基准和真实日期", () => {
  const valid = rule("monthly");
  assert.deepEqual(parseTaskRepeat(serializeTaskRepeat(valid)), valid);
  for (const value of [null, "{", "null", "[]", JSON.stringify(rule("yearly")),
    JSON.stringify(rule("daily", "unknown")), JSON.stringify(rule("daily", "schedule", "2026-02-30"))]) {
    assert.equal(parseTaskRepeat(value), null);
  }
});

test("按计划重复的月末任务夹到二月末，下次仍恢复原来的31日", () => {
  const monthly = rule("monthly");
  assert.equal(nextRepeatDate(monthly, "2026-01-31", "2026-01-31"), "2026-02-28");
  assert.equal(nextRepeatDate(monthly, "2026-02-28", "2026-02-28"), "2026-03-31");
  assert.equal(nextRepeatDate(rule("monthly", "schedule", "2028-01-31"), "2028-01-31", "2028-01-31"), "2028-02-29");
});

test("补做按原计划跳过已错过日期，按完成日重复则保留完成日间隔", () => {
  assert.equal(nextRepeatDate(rule("weekly", "schedule", "2026-10-05"), "2026-10-05", "2026-10-14"), "2026-10-19");
  assert.equal(nextRepeatDate(rule("weekly", "completion", "2026-10-05"), "2026-10-05", "2026-10-14"), "2026-10-21");
  assert.equal(nextRepeatDate(rule("monthly"), "2026-01-31", "2026-03-02"), "2026-03-31");
  assert.equal(nextRepeatDate(rule("monthly", "completion"), "2026-01-31", "2026-03-02"), "2026-04-02");
});

test("每日与工作日续期跨年并跳过周末，提前完成不会倒退原计划", () => {
  assert.equal(nextRepeatDate(rule("daily", "schedule", "2026-12-31"), "2026-12-31", "2026-12-30"), "2027-01-01");
  assert.equal(nextRepeatDate(rule("weekdays", "schedule", "2026-10-23"), "2026-10-23", "2026-10-23"), "2026-10-26");
  assert.equal(nextRepeatDate(rule("weekdays", "completion"), "2026-10-23", "2026-10-25"), "2026-10-26");
});

test("续期保持计划日与截止日间隔，无日期任务续期后进入计划", () => {
  assert.deepEqual(nextRepeatDates(rule("weekly", "schedule", "2026-10-26"),
    { plannedDate: "2026-10-26", dueDate: "2026-10-30" }, "2026-10-26"),
  { plannedDate: "2026-11-02", dueDate: "2026-11-06" });
  assert.deepEqual(nextRepeatDates(rule("daily", "schedule", "2026-10-26"),
    { plannedDate: null, dueDate: null }, "2026-10-26"),
  { plannedDate: "2026-10-27", dueDate: null });
  assert.deepEqual(nextRepeatDates(rule("daily", "schedule", "2026-10-26"),
    { plannedDate: null, dueDate: "2026-10-26" }, "2026-10-26"),
  { plannedDate: null, dueDate: "2026-10-27" });
});

test("复盘来源键只允许真实日期和64位哈希，不能借PATCH改写来源", () => {
  const originKey = `review:2026-10-27:${"a".repeat(64)}`;
  assert.equal(parseTaskInput({ title: "行动", source: "review", originKey, plannedDate: "2026-10-28" }, true).value.originKey, originKey);
  for (const body of [{ title: "行动", originKey }, { title: "行动", source: "review" },
    { title: "行动", source: "review", originKey: `review:2026-02-30:${"a".repeat(64)}` },
    { title: "行动", source: "review", originKey: "review:2026-10-27:abc" }]) {
    assert.ok(parseTaskInput(body, true).error);
  }
  assert.deepEqual(parseTaskInput({ title: "改标题", originKey: "不应更新", source: "manual" }).value, { title: "改标题" });
});

test("计划日期和截止日期分别保留，今日顺延计划任务，周视图按计划归属", async () => {
  const client = createClient({ url: "file::memory:" });
  const database = drizzle(client);
  try {
    const directory = new URL("../db/migrations/", import.meta.url);
    for (const file of (await readdir(directory)).filter((file) => file.endsWith(".sql")).sort()) {
      await client.executeMultiple(await readFile(new URL(file, directory), "utf8"));
    }
    await database.insert(tasks).values([
      { title: "本周计划下周截止", plannedDate: "2026-10-27", dueDate: "2026-11-05", createdAt: "2026-10-27T00:00:00.000Z" },
      { title: "上周计划未完成", plannedDate: "2026-10-20", dueDate: "2026-11-02", createdAt: "2026-10-27T00:00:00.000Z" },
      { title: "下周计划本周截止", plannedDate: "2026-11-02", dueDate: "2026-10-30", createdAt: "2026-10-27T00:00:00.000Z" },
    ]);
    const week = await database.select().from(tasks).where(taskPeriodWhere(tasks, "2026-10-26", "2026-11-01"));
    assert.deepEqual(week.map((task) => task.title), ["本周计划下周截止"]);
    const today = await database.select().from(tasks).where(todayTaskWhere(tasks, localDayWindow("2026-10-27")));
    assert.deepEqual(today.map((task) => task.title), ["本周计划下周截止", "上周计划未完成"]);
    assert.equal(week[0].dueDate, "2026-11-05");
  } finally { client.close(); }
});
