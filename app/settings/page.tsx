"use client";

import { useEffect, useState } from "react";
import { Archive, Download, HardDrive, LoaderCircle, RotateCcw, ShieldCheck } from "lucide-react";
import { api } from "@/lib/api";

type Backup = {
  name: string;
  createdAt: string;
  size: number;
  reason: "manual" | "daily" | "migration";
};
type BackupList = { backups: Backup[]; directory: string; dataDirectory: string };

const REASONS = { manual: "手动备份", daily: "每日备份", migration: "升级前备份" };

function formatBytes(bytes: number) {
  return bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function createManualBackup() {
  const response = await fetch("/api/backups", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  if (!response.ok) {
    const result = await response.json().catch(() => null);
    throw new Error(result?.error ?? "备份未完成，请稍后重试。");
  }
  return response.json() as Promise<Backup>;
}

export default function SettingsPage() {
  const [data, setData] = useState<BackupList | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    api<BackupList>("/api/backups", { signal: controller.signal })
      .then(setData)
      .catch(() => {
        if (!controller.signal.aborted) setError("暂时无法读取备份列表，请重试。");
      });
    return () => controller.abort();
  }, []);

  async function refresh() {
    setError("");
    try {
      setData(await api<BackupList>("/api/backups"));
    } catch {
      setError("暂时无法读取备份列表，请重试。");
    }
  }

  async function backup() {
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const saved = await createManualBackup();
      setData((current) => current ? { ...current, backups: [saved, ...current.backups] } : current);
      setNotice("备份已通过完整性检查。可以在下方下载，另存到其他磁盘。");
      if (!data) await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "备份未完成，请重试。");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-8 sm:px-8">
      <header className="mb-8">
        <p className="mb-2 flex items-center gap-2 text-xs text-muted"><ShieldCheck size={15} /> 本地数据保护</p>
        <h1 className="text-2xl font-semibold tracking-tight">数据与备份</h1>
        <p className="mt-2 text-sm leading-6 text-muted">为任务、复盘、课程与习惯留一份完整副本。</p>
      </header>

      <section className="card p-5 sm:p-6" aria-labelledby="backup-title">
        <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-center">
          <div>
            <h2 id="backup-title" className="text-sm font-semibold">保存完整备份</h2>
            <p className="mt-2 max-w-lg text-sm leading-6 text-muted">桌面版每天自动备份一次，升级迁移前另存快照。手动备份可以随时创建，已有备份会一直保留。</p>
          </div>
          <button type="button" className="btn-primary shrink-0 justify-center py-2.5" onClick={backup} disabled={busy}>
            {busy ? <LoaderCircle size={15} className="animate-spin motion-reduce:animate-none" /> : <Archive size={15} />}
            {busy ? "正在备份…" : "立即备份"}
          </button>
        </div>
        {data && (
          <div className="mt-5 flex gap-3 rounded-xl bg-bg p-4">
            <HardDrive size={17} className="mt-0.5 shrink-0 text-muted" />
            <div className="min-w-0 text-xs leading-6 text-muted">
              <p>本机备份目录</p>
              <p className="break-all font-mono text-ink select-all">{data.directory}</p>
              <p className="mt-1">建议定期下载到其他磁盘，保留独立副本。</p>
            </div>
          </div>
        )}
      </section>

      <div className="mt-4" aria-live="polite">
        {notice && <p role="status" className="rounded-xl border border-line bg-surface px-4 py-3 text-sm">{notice}</p>}
        {error && <p role="alert" className="rounded-xl border border-danger/25 px-4 py-3 text-sm text-danger">{error}</p>}
      </div>

      <section className="mt-8" aria-labelledby="history-title">
        <div className="mb-4 flex items-center justify-between">
          <h2 id="history-title" className="text-sm font-semibold">备份记录{data ? ` · ${data.backups.length}` : ""}</h2>
          <button type="button" onClick={refresh} className="btn-ghost"><RotateCcw size={13} /> 刷新</button>
        </div>
        {!data ? (
          <p className="py-8 text-center text-sm text-muted">{error ? "备份列表未加载" : "正在读取备份记录…"}</p>
        ) : data.backups.length === 0 ? (
          <div className="rounded-xl border border-dashed border-line px-6 py-10 text-center text-sm text-muted">还没有备份，点击“立即备份”保存第一份副本。</div>
        ) : (
          <ul className="overflow-hidden rounded-xl border border-line bg-surface">
            {data.backups.map((item) => (
              <li key={item.name} className="flex items-center gap-4 border-b border-line p-4 last:border-b-0">
                <Archive size={18} className="hidden shrink-0 text-muted sm:block" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{REASONS[item.reason]}</p>
                  <p className="mt-1 text-xs text-muted tnum">{new Date(item.createdAt).toLocaleString("zh-CN")} · {formatBytes(item.size)}</p>
                </div>
                <a href={`/api/backups/${encodeURIComponent(item.name)}`} download className="btn-ghost shrink-0" aria-label={`下载${REASONS[item.reason]} ${new Date(item.createdAt).toLocaleString("zh-CN")}`}>
                  <Download size={14} /> 下载
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>

      <details className="mt-6 rounded-xl border border-line p-4 text-xs leading-6 text-muted">
        <summary className="cursor-pointer font-medium text-ink">如何恢复一份备份</summary>
        <ol className="mt-3 list-decimal space-y-2 pl-4">
          <li>先下载所需备份，然后完全退出人生工作台。</li>
          <li>将当前数据文件夹整体改名留存，例如加上“恢复前”的日期后缀。这样能一起保留旧数据库和日志文件。</li>
          <li>在原位置新建同名数据文件夹，将下载的备份复制进去，重命名为 <code>workbench.db</code>。</li>
          <li>重新打开应用，检查记录。原有数据和备份仍在改名后的文件夹中。</li>
        </ol>
        {data && <p className="mt-3 break-all">当前数据文件夹：<span className="font-mono select-all">{data.dataDirectory}</span></p>}
      </details>
    </div>
  );
}
