import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import quickAdd from "../desktop-app/quick-add.cjs";

function scenario(context) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "workbench-quick-add-"));
  context.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const registered = new Set();
  const blocked = new Set();
  const shortcuts = {
    register(key) { if (blocked.has(key) || registered.has(key)) return false; registered.add(key); return true; },
    unregister(key) { registered.delete(key); },
  };
  const make = () => quickAdd.createQuickAdd(directory, shortcuts, () => {});
  return { directory, registered, blocked, make, service: make() };
}

test("更换被占用的快捷键时，原注册与磁盘设置保持可用", (context) => {
  const { service, registered, blocked } = scenario(context);
  service.start();
  blocked.add("Alt+Shift+N");
  assert.throws(() => service.setShortcut("Alt+Shift+N"), /占用/);
  assert.equal(service.getState().shortcut, quickAdd.SHORTCUTS[0]);
  assert.deepEqual([...registered], [quickAdd.SHORTCUTS[0]]);
});

test("快捷键配置跨重启恢复，关闭后释放原组合", (context) => {
  const { service, registered, make } = scenario(context);
  service.start();
  service.setShortcut("Alt+Shift+N");
  assert.deepEqual([...registered], ["Alt+Shift+N"]);
  service.stop();
  const restarted = make();
  assert.equal(restarted.start().shortcut, "Alt+Shift+N");
  restarted.setShortcut("");
  assert.equal(registered.size, 0);
  assert.equal(make().start().shortcut, "");
});

test("草稿独立于页面端口保存，拒绝无效覆盖", (context) => {
  const { service, make } = scenario(context);
  const draft = JSON.stringify({ kind: "task", text: "还没提交的任务" });
  service.setDraft(draft);
  assert.equal(make().getDraft(), draft);
  for (const value of ["{", "null", "[]", "文".repeat(32768)]) assert.throws(() => service.setDraft(value));
  assert.equal(service.getDraft(), draft);
  service.removeDraft();
  assert.equal(service.getDraft(), null);
});

test("偏好写入失败时撤销新注册，原快捷键继续保留", (context) => {
  const { service, directory, registered } = scenario(context);
  service.start();
  fs.mkdirSync(path.join(directory, "quick-add-preferences.json"));
  assert.throws(() => service.setShortcut("Alt+Shift+N"), /未能保存/);
  assert.deepEqual([...registered], [quickAdd.SHORTCUTS[0]]);
});
