import assert from "node:assert/strict";
import test from "node:test";
import { after } from "node:test";
import { localDayWindow, reviewStreak } from "../lib/day-rules.ts";

const originalTimezone = process.env.TZ;
process.env.TZ = "Asia/Shanghai";
after(() => {
  if (originalTimezone === undefined) delete process.env.TZ;
  else process.env.TZ = originalTimezone;
});

test("复盘连续天数按给定本地日期计算，今天未写时从昨天起算", () => {
  assert.equal(reviewStreak(["2026-10-22", "2026-10-23", "2026-10-24"], "2026-10-25"), 3);
});

test("凌晨的本地复盘日期不偏移到 UTC 的前一天", () => {
  const now = new Date("2026-10-25T00:30:00+08:00");
  assert.equal(now.getDate(), 25);
  assert.equal(reviewStreak(["2026-10-24", "2026-10-25"], "2026-10-25"), 2);
});

test("连续复盘正确跨越月末、年末和闰日", () => {
  assert.equal(reviewStreak(["2026-09-29", "2026-09-30", "2026-10-01"], "2026-10-01"), 3);
  assert.equal(reviewStreak(["2025-12-30", "2025-12-31", "2026-01-01"], "2026-01-01"), 3);
  assert.equal(reviewStreak(["2024-02-28", "2024-02-29", "2024-03-01"], "2024-03-01"), 3);
});

test("空记录、缺少昨天和中断日期不制造连续天数", () => {
  assert.equal(reviewStreak([], "2026-10-25"), 0);
  assert.equal(reviewStreak(["2026-10-23"], "2026-10-25"), 0);
  assert.equal(reviewStreak(["2026-10-23", "2026-10-25", "2026-10-25"], "2026-10-25"), 1);
});

test("本地日窗口覆盖北京时间凌晨，结束边界属于次日", () => {
  assert.deepEqual(localDayWindow("2026-10-25"), {
    date: "2026-10-25",
    start: "2026-10-24T16:00:00.000Z",
    end: "2026-10-25T16:00:00.000Z",
  });
});
