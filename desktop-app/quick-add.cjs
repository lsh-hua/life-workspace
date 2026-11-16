// 桌面快速录入：受限草稿文件与可切换的系统快捷键，不访问业务数据库。
const fs = require("node:fs");
const path = require("node:path");
const { randomUUID } = require("node:crypto");

const SHORTCUTS = ["CommandOrControl+Shift+Space", "CommandOrControl+Alt+N", "Alt+Shift+N", ""];

function writeAtomic(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${randomUUID()}.tmp`;
  try {
    fs.writeFileSync(temporary, value, { encoding: "utf8", mode: 0o600 });
    fs.renameSync(temporary, file);
  } finally {
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
  }
}

function createQuickAdd(directory, shortcuts, onOpen) {
  const preferences = path.join(directory, "quick-add-preferences.json");
  const draftFile = path.join(directory, "quick-add-draft.json");
  let shortcut = SHORTCUTS[0];
  let registered = false;
  let error = null;
  try {
    const saved = JSON.parse(fs.readFileSync(preferences, "utf8"));
    if (SHORTCUTS.includes(saved.shortcut)) shortcut = saved.shortcut;
  } catch (cause) {
    if (cause.code !== "ENOENT") error = "快捷键设置无法读取，已使用默认选项。";
  }

  const getState = () => ({ shortcut, registered, error });

  function start() {
    if (!shortcut || registered) return getState();
    registered = shortcuts.register(shortcut, onOpen);
    if (!registered) error = "快捷键已被其他程序占用，请在数据与备份中更换组合。";
    return getState();
  }

  function setShortcut(next) {
    if (!SHORTCUTS.includes(next)) throw new Error("快捷键选项无效。");
    if (next === shortcut && (registered || !next)) return getState();
    if (next && !shortcuts.register(next, onOpen)) throw new Error("这个快捷键已被占用，请选择其他组合。");
    try {
      writeAtomic(preferences, JSON.stringify({ shortcut: next }));
    } catch {
      if (next) shortcuts.unregister(next);
      throw new Error("快捷键设置未能保存，原设置仍保留。");
    }
    if (registered && shortcut !== next) shortcuts.unregister(shortcut);
    shortcut = next;
    registered = !!next;
    error = null;
    return getState();
  }

  function getDraft() {
    try { return fs.readFileSync(draftFile, "utf8"); }
    catch (cause) { if (cause.code === "ENOENT") return null; throw cause; }
  }

  function setDraft(value) {
    if (typeof value !== "string" || Buffer.byteLength(value, "utf8") > 32768) throw new Error("快速录入草稿过大或格式无效。");
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("快速录入草稿格式无效。");
    writeAtomic(draftFile, value);
  }

  function removeDraft() {
    try { fs.unlinkSync(draftFile); }
    catch (cause) { if (cause.code !== "ENOENT") throw cause; }
  }

  function stop() {
    if (registered) shortcuts.unregister(shortcut);
    registered = false;
  }

  return { start, stop, getState, setShortcut, getDraft, setDraft, removeDraft };
}

module.exports = { createQuickAdd, SHORTCUTS };
