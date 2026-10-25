// 备份只创建一致性快照，不覆盖源数据库或已有备份。
import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import { createClient } from "@libsql/client";

const BACKUP_NAME = /^workbench-(manual|daily|migration)-(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.\d{3}Z)-([a-f0-9]{8})\.db$/;
const REASONS = new Set(["manual", "daily", "migration"]);
const dailyTasks = new Map();

async function regularFile(filePath) {
  const info = await fs.lstat(filePath);
  if (!info.isFile() || info.isSymbolicLink()) throw new Error("数据库必须是普通文件");
  return info;
}

async function backupDirectory(dataDir) {
  const directory = path.resolve(dataDir, "backups");
  await fs.mkdir(directory, { recursive: true });
  const info = await fs.lstat(directory);
  if (!info.isDirectory() || info.isSymbolicLink()) throw new Error("备份目录无效");
  return directory;
}

function backupMetadata(name, size) {
  if (typeof name !== "string") throw new Error("备份文件名无效");
  const match = BACKUP_NAME.exec(name);
  if (!match) throw new Error("备份文件名无效");
  const createdAt = match[2].replace(/T(\d{2})-(\d{2})-(\d{2})/, "T$1:$2:$3");
  if (!Number.isFinite(Date.parse(createdAt)) || new Date(createdAt).toISOString() !== createdAt) {
    throw new Error("备份时间无效");
  }
  return { name, createdAt, size, reason: match[1] };
}

async function verifyDatabase(filePath) {
  await regularFile(filePath);
  const file = await fs.open(filePath, "r");
  try {
    const header = Buffer.alloc(16);
    await file.read(header, 0, 16, 0);
    if (header.toString("binary") !== "SQLite format 3\0") throw new Error("备份不是有效的 SQLite 数据库");
  } finally {
    await file.close();
  }
  const client = createClient({ url: pathToFileURL(filePath).href });
  try {
    await client.execute("PRAGMA query_only = ON");
    const result = await client.execute("PRAGMA integrity_check");
    if (result.rows.length !== 1 || result.rows[0][0] !== "ok") throw new Error("备份完整性校验失败");
  } finally {
    client.close();
  }
}

export async function createBackup({ dataDir, reason }) {
  if (!REASONS.has(reason)) throw new Error("备份原因无效");
  const sourcePath = path.resolve(dataDir, "workbench.db");
  try {
    await regularFile(sourcePath);
  } catch (error) {
    if (error.code === "ENOENT") {
      throw Object.assign(new Error("尚未创建数据库，请先添加数据后再备份"), { code: "MISSING_DATABASE" });
    }
    throw error;
  }
  const directory = await backupDirectory(dataDir);
  const stamp = new Date().toISOString().replaceAll(":", "-");
  const name = `workbench-${reason}-${stamp}-${randomUUID().slice(0, 8)}.db`;
  const targetPath = path.join(directory, name);
  const temporaryPath = path.join(directory, `.${name}.tmp`);
  const source = createClient({ url: pathToFileURL(sourcePath).href });
  let published = false;
  try {
    // VACUUM INTO 包含 WAL 中已提交的数据；源库无须停机或直接复制。
    await source.execute({ sql: "VACUUM INTO ?", args: [temporaryPath] });
    // Windows 下必须先释放快照句柄，才能原子发布备份文件。
    source.close();
    await fs.rename(temporaryPath, targetPath);
    published = true;
    await verifyDatabase(targetPath);
    return backupMetadata(name, (await fs.stat(targetPath)).size);
  } catch (error) {
    source.close();
    await fs.rm(temporaryPath, { force: true }).catch(() => {});
    if (published) await fs.rm(targetPath, { force: true }).catch(() => {});
    throw error;
  } finally {
    source.close();
  }
}

export async function getBackupPath({ dataDir, name }) {
  backupMetadata(name, 0);
  const directory = await backupDirectory(dataDir);
  const filePath = path.join(directory, name);
  await verifyDatabase(filePath);
  return filePath;
}

export async function listBackups({ dataDir }) {
  const directory = await backupDirectory(dataDir);
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const backups = [];
  for (const entry of entries) {
    if (!entry.isFile() || !BACKUP_NAME.test(entry.name)) continue;
    try {
      const filePath = await getBackupPath({ dataDir, name: entry.name });
      backups.push(backupMetadata(entry.name, (await fs.stat(filePath)).size));
    } catch {
      // 残缺、损坏或被替换的文件不作为可用备份展示。
    }
  }
  return backups.sort((left, right) => right.createdAt.localeCompare(left.createdAt) || right.name.localeCompare(left.name));
}

function localDay(date) {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

async function dailyBackup(dataDir) {
  const today = localDay(new Date());
  const existing = (await listBackups({ dataDir })).find((backup) =>
    backup.reason === "daily" && localDay(new Date(backup.createdAt)) === today,
  );
  if (existing) return existing;
  try {
    return await createBackup({ dataDir, reason: "daily" });
  } catch (error) {
    if (error.code === "MISSING_DATABASE") return null;
    throw error;
  }
}

export async function ensureDailyBackup({ dataDir }) {
  const key = path.resolve(dataDir);
  if (!dailyTasks.has(key)) {
    dailyTasks.set(key, dailyBackup(key).finally(() => dailyTasks.delete(key)));
  }
  return dailyTasks.get(key);
}
