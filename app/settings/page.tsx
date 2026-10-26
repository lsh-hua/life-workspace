"use client";

import { useEffect, useState } from "react";
import { Archive, CheckCircle2, Download, ExternalLink, HardDrive, LoaderCircle, RotateCcw } from "lucide-react";
import { api } from "@/lib/api";
import { EmptyState, PageError, PageHeader, PageLoading } from "@/components/page-header";
import { APP_VERSION } from "@/lib/app-version";

type Backup = {
  name: string;
  createdAt: string;
  size: number;
  reason: "manual" | "daily" | "migration";
};
type BackupList = { backups: Backup[]; directory: string; dataDirectory: string };
type UpdateResult = {
  status: "available" | "current" | "unreleased";
  currentVersion: string;
  latestVersion?: string;
  publishedAt?: string | null;
  releasesUrl: string;
};

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
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<"all" | Backup["reason"]>("all");
  const [visibleCount, setVisibleCount] = useState(8);
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [updateResult, setUpdateResult] = useState<UpdateResult | null>(null);
  const [updateError, setUpdateError] = useState("");

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
    if (refreshing) return;
    setRefreshing(true);
    setError("");
    try {
      setData(await api<BackupList>("/api/backups"));
    } catch {
      setError("暂时无法读取备份列表，请重试。");
    } finally {
      setRefreshing(false);
    }
  }

  async function checkUpdate() {
    if (checkingUpdate) return;
    setCheckingUpdate(true);
    setUpdateError("");
    setUpdateResult(null);
    try {
      setUpdateResult(await api<UpdateResult>("/api/updates", { cache: "no-store" }));
    } catch {
      setUpdateError("暂时无法检查版本，请确认网络连接后重试。");
    } finally {
      setCheckingUpdate(false);
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
      setFilter("all");
      setVisibleCount(8);
      if (!data) await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "备份未完成，请重试。");
    } finally {
      setBusy(false);
    }
  }

  const backups = data?.backups ?? [];
  const filtered = filter === "all" ? backups : backups.filter((item) => item.reason === filter);

  return (
    <div className="page-shell">
      <PageHeader title="数据与备份" description="保存完整副本，定期下载到其他磁盘。"
        meta={data && <span className="tnum">已保留 {backups.length} 份备份</span>} />

      <section className="card mb-4 flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between" aria-labelledby="update-title" aria-busy={checkingUpdate}>
        <div className="min-w-0">
          <h2 id="update-title" className="text-sm font-semibold">应用版本</h2>
          <p className="mt-1 text-sm text-muted">当前版本 <span className="font-medium text-ink">{APP_VERSION}</span></p>
          <div className="mt-2 min-h-5 text-xs leading-5 text-muted" aria-live="polite">
            {updateResult?.status === "available" && <p>发现新版本 {updateResult.latestVersion}{updateResult.publishedAt ? ` · ${new Date(updateResult.publishedAt).toLocaleDateString("zh-CN")} 发布` : ""}</p>}
            {updateResult?.status === "current" && <p>当前已是最新版本。</p>}
            {updateResult?.status === "unreleased" && <p>仓库还没有公开发行版，发布后可在这里检查更新。</p>}
            {updateError && <p role="status" className="text-danger">{updateError}</p>}
          </div>
          {updateResult && <a href={updateResult.releasesUrl} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline">
            {updateResult.status === "available" ? "查看版本与下载安装包" : "打开 GitHub Releases"}<ExternalLink size={12} />
          </a>}
        </div>
        <button type="button" onClick={checkUpdate} disabled={checkingUpdate} className="btn-ghost shrink-0 justify-center">
          {checkingUpdate ? <LoaderCircle size={14} className="animate-spin motion-reduce:animate-none" /> : <RotateCcw size={14} />}
          {checkingUpdate ? "正在检查…" : "检查更新"}
        </button>
      </section>

      <section className="card p-5 sm:p-6" aria-labelledby="backup-title" aria-busy={busy}>
        <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-center">
          <div>
            <h2 id="backup-title" className="text-sm font-semibold">保存完整备份</h2>
            <p className="mt-2 max-w-xl text-sm leading-6 text-muted">桌面版每天自动备份，升级迁移前另存快照。你也可以随时创建一份副本，已有备份不会自动删除。</p>
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
        {notice && <p role="status" className="flex items-start gap-2 rounded-xl border border-line bg-surface px-4 py-3 text-sm leading-6"><CheckCircle2 size={16} className="mt-1 shrink-0 text-accent" />{notice}</p>}
        {error && <PageError message={error} onRetry={!data ? refresh : undefined} />}
      </div>

      <section className="mt-8" aria-labelledby="history-title">
        <div className="mb-4 flex items-center justify-between">
          <h2 id="history-title" className="text-sm font-semibold">备份记录</h2>
          <button type="button" onClick={refresh} disabled={refreshing || busy} className="btn-ghost"><RotateCcw size={14} />{refreshing ? "正在刷新…" : "刷新"}</button>
        </div>
        {backups.length > 0 && <nav className="mb-4 flex flex-wrap gap-2" aria-label="按备份类型筛选">
          {(["all", "manual", "daily", "migration"] as const).map((reason) => <button key={reason} type="button" aria-pressed={filter === reason}
            onClick={() => { setFilter(reason); setVisibleCount(8); }}
            className={`rounded-lg border px-3 py-2 text-xs ${filter === reason ? "border-accent/30 bg-accent-soft text-accent" : "border-line bg-surface text-muted hover:text-ink"}`}>{reason === "all" ? "全部" : REASONS[reason]}</button>)}
        </nav>}
        {!data && !error ? (
          <PageLoading rows={3} />
        ) : data && filtered.length === 0 ? (
          <EmptyState title={backups.length === 0 ? "还没有备份" : "没有这一类备份"}
            description={backups.length === 0 ? "点击“立即备份”，为当前记录保存第一份完整副本。" : "切换类型查看其他备份记录。"} icon={<Archive size={24} />} />
        ) : data ? (
          <>
          <ul className="overflow-hidden rounded-xl border border-line bg-surface" aria-label="可下载的备份">
            {filtered.slice(0, visibleCount).map((item) => (
              <li key={item.name} className="flex min-w-0 flex-wrap items-center gap-3 border-b border-line p-4 last:border-b-0 sm:gap-4">
                <Archive size={18} className="hidden shrink-0 text-muted sm:block" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{REASONS[item.reason]}</p>
                  <p className="mt-1 text-xs leading-5 text-muted tnum">{new Date(item.createdAt).toLocaleString("zh-CN")}<span className="ml-3 inline-block">{formatBytes(item.size)}</span></p>
                </div>
                <a href={`/api/backups/${encodeURIComponent(item.name)}`} download className="btn-ghost shrink-0" aria-label={`下载${REASONS[item.reason]} ${new Date(item.createdAt).toLocaleString("zh-CN")}`}>
                  <Download size={14} /> 下载
                </a>
              </li>
            ))}
          </ul>
          {filtered.length > visibleCount && <div className="mt-4 flex justify-center"><button type="button" onClick={() => setVisibleCount((count) => count + 8)} className="btn-ghost">显示更多备份（还剩 {filtered.length - visibleCount} 份）</button></div>}
          </>
        ) : null}
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
