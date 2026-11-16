import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { appendFocusProblem, focusTaskUnavailable, reviewOriginKey, reviewTaskLines } from "../lib/review-planning.ts";

test("明日计划按行去空白、列表前缀与重复条目", () => {
  assert.deepEqual(reviewTaskLines("1. 完成报告\n- [ ] 看课程笔记\n\n2、完成报告\r\n* [x] 看课程笔记\n• 整理  资料"), ["完成报告", "看课程笔记", "整理 资料"]);
});

test("复盘来源键使用稳定SHA-256，同一条内容重试保持一致", async () => {
  const title = "完成报告";
  const expected = `review:2026-10-27:${createHash("sha256").update(title).digest("hex")}`;
  assert.equal(await reviewOriginKey("2026-10-27", title), expected);
  assert.equal(await reviewOriginKey("2026-10-27", title), expected);
  assert.notEqual(await reviewOriginKey("2026-10-28", title), expected);
});

test("专注阻碍追加保留原文，反复点击不重复插入", () => {
  const existing = "已有问题：资料不足";
  const appended = appendFocusProblem(existing, "写报告");
  assert.equal(appended, `${existing}\n专注任务「写报告」的阻碍：`);
  assert.equal(appendFocusProblem(`${appended}缺少数据`, "写报告"), `${appended}缺少数据`);
  assert.equal(appendFocusProblem("", "写报告"), "专注任务「写报告」的阻碍：");
});

test("已删除或已完成任务不能通过一键入口启动新专注", () => {
  assert.match(focusTaskUnavailable({ status: "todo", deletedAt: "2026-10-27T01:00:00Z" }), /最近删除/);
  assert.match(focusTaskUnavailable({ status: "done", deletedAt: null }), /已经完成/);
  assert.equal(focusTaskUnavailable({ status: "todo", deletedAt: null }), null);
});
