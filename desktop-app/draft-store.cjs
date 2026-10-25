const fs = require("node:fs");
const path = require("node:path");
const { randomUUID } = require("node:crypto");

const MAX_DRAFT_BYTES = 5 * 1024 * 1024;

function draftDate(key) {
  const match = typeof key === "string" && /^workbench:review-draft:(\d{4}-\d{2}-\d{2})$/.exec(key);
  if (!match) throw new Error("草稿键无效，只允许按日期保存复盘草稿。");
  const date = new Date(`${match[1]}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== match[1]) {
    throw new Error("草稿日期无效，请使用真实的年月日。");
  }
  return match[1];
}

function validateValue(value, date) {
  if (typeof value !== "string") throw new Error("草稿内容必须是 JSON 字符串。");
  if (Buffer.byteLength(value, "utf8") > MAX_DRAFT_BYTES) throw new Error("草稿内容超过 5 MiB，无法保存。");
  let parsed;
  try {
    parsed = JSON.parse(value);
  } catch (cause) {
    throw new Error("草稿内容不是有效 JSON，文件可能已损坏。", { cause });
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed) || parsed.date !== date) {
    throw new Error("草稿内容中的日期与草稿键不一致。");
  }
}

function cleanTemporary(file, cause) {
  try {
    fs.unlinkSync(file);
  } catch (cleanupCause) {
    if (cleanupCause.code !== "ENOENT") {
      throw new AggregateError([cause, cleanupCause], "保存复盘草稿失败，临时文件也未能清理。");
    }
  }
}

function atomicWrite(directory, file, value) {
  const temporary = `${file}.${randomUUID()}.tmp`;
  try {
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(temporary, value, { encoding: "utf8", flag: "wx", mode: 0o600, flush: true });
    fs.renameSync(temporary, file);
  } catch (cause) {
    cleanTemporary(temporary, cause);
    throw new Error("保存复盘草稿失败，请检查磁盘空间和目录权限。", { cause });
  }
}

function readDraft(file, date) {
  let value;
  try {
    if (fs.statSync(file).size > MAX_DRAFT_BYTES) throw new Error("草稿文件超过 5 MiB。");
    value = fs.readFileSync(file, "utf8");
  } catch (cause) {
    if (cause.code === "ENOENT") return null;
    throw new Error("读取复盘草稿失败，文件可能损坏或无法访问。", { cause });
  }
  validateValue(value, date);
  return value;
}

function createDraftStore(directory) {
  const root = path.resolve(directory);
  const fileFor = (date) => path.join(root, `review-draft-${date}.json`);
  return {
    getItem(key) {
      const date = draftDate(key);
      return readDraft(fileFor(date), date);
    },
    setItem(key, value) {
      const date = draftDate(key);
      validateValue(value, date);
      atomicWrite(root, fileFor(date), value);
    },
    removeItem(key) {
      const date = draftDate(key);
      try {
        fs.unlinkSync(fileFor(date));
      } catch (cause) {
        if (cause.code !== "ENOENT") throw new Error("删除复盘草稿失败，请检查目录权限。", { cause });
      }
    },
  };
}

module.exports = { createDraftStore };
