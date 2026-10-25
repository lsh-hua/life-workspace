import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import drafts from "../desktop-app/draft-store.cjs";

const { createDraftStore } = drafts;
const key = "workbench:review-draft:2026-10-25";

function draft(date = "2026-10-25", text = "今天的草稿") {
  return JSON.stringify({
    date,
    form: { doneText: text, problemText: "", tomorrowText: "", summary: "", mood: 0 },
    editedAt: "2026-10-25T03:00:00.000Z",
    baseUpdatedAt: null,
  });
}

function temporaryStore(context) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "life-workbench-drafts-"));
  context.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return { directory, store: createDraftStore(directory) };
}

test("桌面复盘草稿跨适配器重启可读，删除后返回空值", (context) => {
  const { directory, store } = temporaryStore(context);
  assert.equal(store.getItem(key), null);
  store.setItem(key, draft());
  assert.equal(createDraftStore(directory).getItem(key), draft());
  store.removeItem(key);
  assert.equal(store.getItem(key), null);
});

test("草稿键仅接受固定前缀与真实日期，拒绝路径穿越及任意存储键", (context) => {
  const { directory, store } = temporaryStore(context);
  const invalidKeys = [
    "../../workbench.db", "workbench:review-draft:../2026-10-25", "review-draft:2026-10-25",
    "workbench:review-draft:2026-02-29", "workbench:review-draft:2026-13-01",
    "workbench:review-draft:2026-10-25/extra", "workbench:review-draft:2026-10-25\n", "", null, 42,
  ];
  for (const invalidKey of invalidKeys) {
    assert.throws(() => store.getItem(invalidKey), /草稿.*(无效|日期)/);
    assert.throws(() => store.setItem(invalidKey, draft()), /草稿.*(无效|日期)/);
    assert.throws(() => store.removeItem(invalidKey), /草稿.*(无效|日期)/);
  }
  assert.deepEqual(fs.readdirSync(directory), []);
});

test("拒绝非字符串、无效 JSON 或日期不一致的覆盖，并保留原草稿", (context) => {
  const { store } = temporaryStore(context);
  store.setItem(key, draft());
  for (const invalidValue of [null, {}, "{", "null", "[]", draft("2026-10-24")]) {
    assert.throws(() => store.setItem(key, invalidValue), /草稿/);
    assert.equal(store.getItem(key), draft());
  }
});

test("按 UTF-8 字节限制 5 MiB，拒绝过大的中文草稿", (context) => {
  const { store } = temporaryStore(context);
  const oversized = draft("2026-10-25", "中".repeat(Math.ceil(5 * 1024 * 1024 / 3)));
  assert.ok(oversized.length < 5 * 1024 * 1024);
  assert.throws(() => store.setItem(key, oversized), /5 MiB/);
  assert.equal(store.getItem(key), null);
});

test("草稿按日期隔离，覆盖与删除不影响另一日期或目录其他文件", (context) => {
  const { directory, store } = temporaryStore(context);
  const otherKey = "workbench:review-draft:2026-10-24";
  fs.writeFileSync(path.join(directory, "unrelated.txt"), "保留文件");
  store.setItem(key, draft());
  store.setItem(otherKey, draft("2026-10-24", "昨天的草稿"));
  store.setItem(key, draft("2026-10-25", "更新后的草稿"));
  assert.equal(store.getItem(key), draft("2026-10-25", "更新后的草稿"));
  store.removeItem(key);
  store.removeItem(key);
  assert.equal(store.getItem(otherKey), draft("2026-10-24", "昨天的草稿"));
  assert.equal(fs.readFileSync(path.join(directory, "unrelated.txt"), "utf8"), "保留文件");
});

test("磁盘中的损坏或错日期草稿必须显式报错", (context) => {
  const { directory, store } = temporaryStore(context);
  store.setItem(key, draft());
  const storedFile = path.join(directory, fs.readdirSync(directory)[0]);
  fs.writeFileSync(storedFile, "损坏的 JSON");
  assert.throws(() => store.getItem(key), /草稿.*JSON/);
  fs.writeFileSync(storedFile, draft("2026-10-24"));
  assert.throws(() => store.getItem(key), /日期.*不一致/);
});

test("原子替换失败时旧草稿仍可读，临时文件被清理", (context) => {
  const { directory, store } = temporaryStore(context);
  store.setItem(key, draft());
  const replacement = context.mock.method(fs, "renameSync", () => {
    throw Object.assign(new Error("模拟文件替换失败"), { code: "EACCES" });
  });
  assert.throws(() => store.setItem(key, draft("2026-10-25", "新草稿")), /保存复盘草稿失败/);
  replacement.mock.restore();
  assert.equal(createDraftStore(directory).getItem(key), draft());
  assert.equal(fs.readdirSync(directory).some((filename) => filename.endsWith(".tmp")), false);
});

test("读取与删除的文件系统异常不会伪装为空草稿或操作成功", (context) => {
  const { store } = temporaryStore(context);
  store.setItem(key, draft());
  const reading = context.mock.method(fs, "readFileSync", () => {
    throw Object.assign(new Error("模拟读取失败"), { code: "EACCES" });
  });
  assert.throws(() => store.getItem(key), /读取复盘草稿失败/);
  reading.mock.restore();
  const deleting = context.mock.method(fs, "unlinkSync", () => {
    throw Object.assign(new Error("模拟删除失败"), { code: "EACCES" });
  });
  assert.throws(() => store.removeItem(key), /删除复盘草稿失败/);
  deleting.mock.restore();
  assert.equal(store.getItem(key), draft());
});
