"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, RotateCcw, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import type { Task } from "@/db/schema";
import { useTaskResource } from "@/components/use-task-resource";
import { EmptyState, PageError, PageHeader, PageLoading } from "@/components/page-header";

export default function DeletedTasksPage() {
  const { data: tasks, setData: setTasks, loading, loaded, error, setError, refresh: load } = useTaskResource<Task[]>("/api/tasks?filter=deleted", [], "deleted-tasks", "最近删除读取失败，请重试。");
  const [busy, setBusy] = useState<number | null>(null);
  const [restored, setRestored] = useState<Task | null>(null);

  async function restore(task: Task) {
    if (busy !== null) return;
    setBusy(task.id);
    setError("");
    try {
      const saved = await api<Task>(`/api/tasks/${task.id}`, { method: "PATCH", json: { action: "restore" } });
      setTasks((items) => items.filter((item) => item.id !== task.id));
      setRestored(saved);
      window.dispatchEvent(new CustomEvent("workbench:records-changed", { detail: { source: "deleted-tasks" } }));
    } catch { setError("任务未能恢复，原记录仍保留，请重试。"); }
    finally { setBusy(null); }
  }

  return (
    <div className="page-shell">
      <PageHeader title="最近删除" description="已删除的任务保留原内容和关联记录，可随时恢复。"
        meta={loaded && <span className="tnum">共 {tasks.length} 项</span>}
        actions={<Link href="/today" className="btn-ghost"><ArrowLeft size={14} />今日待办</Link>} />
      {error && <div className="mb-5"><PageError message={error} onRetry={load} /></div>}
      {restored && <p role="status" className="mb-5 break-words rounded-xl border border-line bg-surface p-4 text-sm">任务已恢复。<Link href={`/tasks/${restored.id}`} className="ml-2 font-medium text-accent hover:underline">查看“{restored.title}”</Link></p>}
      {loading ? <PageLoading rows={3} /> : loaded && (tasks.length ? <ul className="space-y-3">
        {tasks.map((task) => <li key={task.id} className="card flex min-w-0 flex-col gap-4 p-4 sm:flex-row sm:items-center sm:p-5">
          <div className="min-w-0 flex-1">
            <Link href={`/tasks/${task.id}`} className="break-words text-sm font-medium leading-6 hover:text-accent hover:underline">{task.title}</Link>
            {task.note && <p className="mt-1 line-clamp-2 break-words text-xs leading-6 text-muted">{task.note}</p>}
            <p className="mt-2 text-xs text-muted tnum">{task.deletedAt ? `${new Date(task.deletedAt).toLocaleString("zh-CN")} 删除` : "已删除"}{task.plannedDate ? ` · 计划 ${task.plannedDate}` : ""}{task.dueDate ? ` · 截止 ${task.dueDate}` : ""}</p>
          </div>
          <button type="button" disabled={busy !== null} onClick={() => { void restore(task); }} className="btn-ghost shrink-0 justify-center" aria-label={`恢复任务：${task.title}`}><RotateCcw size={14} />{busy === task.id ? "正在恢复…" : "恢复"}</button>
        </li>)}
      </ul> : <EmptyState title="最近删除为空" description="删除的任务会出现在这里，恢复时会保留原来的内容、状态和日期。" icon={<Trash2 size={24} />} />)}
    </div>
  );
}
