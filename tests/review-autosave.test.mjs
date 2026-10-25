import assert from "node:assert/strict";
import test from "node:test";
import { createReviewAutosave, parseReviewDraft } from "../lib/review-autosave.ts";

const empty = { doneText: "", problemText: "", tomorrowText: "", mood: 0, summary: "" };
const form = (summary) => ({ ...empty, summary });
const defer = () => {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};

function setup(save, overrides = {}) {
  const storage = { draft: null };
  const autosave = createReviewAutosave({
    date: "2026-10-25",
    server: null,
    draft: null,
    save,
    writeDraft: (draft) => { storage.draft = draft; },
    removeDraft: () => { storage.draft = null; },
    now: () => "2026-10-25T00:01:00.000Z",
    ...overrides,
  });
  return { autosave, storage };
}

test("慢请求期间的新输入串行保存，最终保存最新内容", async () => {
  const first = defer();
  const writes = [];
  const { autosave, storage } = setup(async (value) => {
    writes.push(value.summary);
    if (writes.length === 1) await first.promise;
    return { updatedAt: `version-${writes.length}` };
  });
  autosave.edit(form("第一段"));
  const pending = autosave.flush();
  autosave.edit(form("第二段"));
  autosave.edit(form("最终内容"));
  assert.deepEqual(writes, ["第一段"]);
  assert.equal(storage.draft.form.summary, "最终内容");
  first.resolve();
  await pending;
  assert.deepEqual(writes, ["第一段", "最终内容"]);
  assert.equal(autosave.snapshot().status, "saved");
  assert.equal(storage.draft, null);
});

test("保存失败保留最新草稿，重试提交最新快照", async () => {
  const first = defer();
  const writes = [];
  const { autosave, storage } = setup(async (value) => {
    writes.push(value.summary);
    if (writes.length === 1) await first.promise;
    return { updatedAt: "version-2" };
  });
  autosave.edit(form("旧内容"));
  const pending = autosave.flush();
  autosave.edit(form("失败时仍在编辑"));
  first.reject(new Error("连接中断"));
  await pending;
  assert.equal(autosave.snapshot().status, "error");
  assert.equal(autosave.snapshot().hasPending, true);
  assert.equal(storage.draft.form.summary, "失败时仍在编辑");
  await autosave.flush();
  assert.deepEqual(writes, ["旧内容", "失败时仍在编辑"]);
  assert.equal(storage.draft, null);
});

test("切换页面前的本机草稿可重新载入并保存", async () => {
  const first = setup(async () => ({ updatedAt: "saved" }));
  first.autosave.edit(form("还没有发送的内容"));
  const restored = setup(async () => ({ updatedAt: "restored" }), { draft: first.storage.draft });
  assert.equal(restored.autosave.snapshot().form.summary, "还没有发送的内容");
  assert.equal(restored.autosave.snapshot().status, "pending");
  await restored.autosave.flush();
  assert.equal(restored.autosave.snapshot().status, "saved");
});

test("服务端版本变化时不按时间静默丢弃草稿", async () => {
  const draft = {
    date: "2026-10-25", form: form("本机草稿"),
    editedAt: "2026-10-24T00:00:00.000Z", baseUpdatedAt: "old-version",
  };
  let writes = 0;
  const { autosave } = setup(async () => { writes++; return { updatedAt: "new-version" }; }, {
    draft,
    server: { form: form("服务端版本"), updatedAt: "newer-version" },
  });
  assert.equal(autosave.snapshot().conflict, true);
  assert.equal(autosave.snapshot().form.summary, "本机草稿");
  await autosave.flush();
  assert.equal(writes, 0);
  autosave.resolveConflict("draft");
  await autosave.flush();
  assert.equal(writes, 1);
});

test("选择服务端内容前草稿完整保留", () => {
  const draft = { date: "2026-10-25", form: form("本地"), editedAt: "2026-10-25T00:00:00Z", baseUpdatedAt: null };
  let removed = false;
  const { autosave } = setup(async () => ({ updatedAt: "saved" }), {
    draft,
    server: { form: form("已保存"), updatedAt: "saved" },
    removeDraft: () => { removed = true; },
  });
  assert.equal(removed, false);
  autosave.resolveConflict("server");
  assert.equal(removed, true);
  assert.equal(autosave.snapshot().form.summary, "已保存");
  assert.equal(autosave.snapshot().hasPending, false);
});

test("本机草稿写入失败时明确保留警告，仍可保存到数据库", async () => {
  const { autosave } = setup(async () => ({ updatedAt: "saved" }), {
    writeDraft: () => { throw new Error("空间不足"); },
  });
  autosave.edit(form("重要内容"));
  assert.match(autosave.snapshot().draftError, /草稿/);
  assert.equal(autosave.snapshot().hasPending, true);
  await autosave.flush();
  assert.equal(autosave.snapshot().status, "saved");
});

test("草稿解析按日期与字段校验，损坏内容不被误恢复", () => {
  const draft = { date: "2026-10-25", form: form("草稿"), editedAt: "2026-10-25T00:00:00Z", baseUpdatedAt: null };
  assert.deepEqual(parseReviewDraft(JSON.stringify(draft), "2026-10-25"), draft);
  assert.equal(parseReviewDraft(JSON.stringify(draft), "2026-10-26"), null);
  assert.equal(parseReviewDraft("not-json", "2026-10-25"), null);
  assert.equal(parseReviewDraft(JSON.stringify({ ...draft, form: { ...empty, mood: 9 } }), "2026-10-25"), null);
});
