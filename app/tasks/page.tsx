"use client";

import { useState } from "react";
import Link from "next/link";
import { CheckSquare } from "lucide-react";
import { api } from "@/lib/api";
import { isOverdue } from "@/lib/dates";
import type { Task } from "@/db/schema";
import TaskItem from "@/components/task-item";
import TaskEditor from "@/components/task-editor";
import TaskUndoNotice from "@/components/task-undo-notice";
import { TaskRepeatCompletionNotice } from "@/components/task-schedule-meta";
import { useTaskResource } from "@/components/use-task-resource";
import { EmptyState, PageError, PageHeader, PageLoading } from "@/components/page-header";

const FILTERS = [
  { key: "all", label: "全部" },
  { key: "todo", label: "未完成" },
  { key: "done", label: "已完成" },
  { key: "undated", label: "未设日期" },
] as const;
type Filter = typeof FILTERS[number]["key"];

export default function TasksPage() {
  const { data: tasks, loading, loaded, error, setError, refresh: load } = useTaskResource<Task[]>("/api/tasks", [], "tasks-list", "任务列表读取失败，请重新加载。");
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [visibleCount, setVisibleCount] = useState(50);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<Task | null>(null);
  const [deleted, setDeleted] = useState<Task[]>([]);
  const [updated, setUpdated] = useState<Task | null>(null);
  const [completedRepeat, setCompletedRepeat] = useState<Task | null>(null);
  const term = query.trim().toLocaleLowerCase();
  const filtered = tasks.filter((task) => {
    const matchesStatus = filter === "all" || (filter === "undated" ? !task.plannedDate && !task.dueDate : task.status === filter);
    return matchesStatus && (!term || `${task.title}\n${task.note ?? ""}`.toLocaleLowerCase().includes(term));
  });

  async function runAction(action: () => Promise<unknown>, failure: string) {
    if (busy) return false;
    setBusy(true);
    setError(null);
    try {
      await action();
      await load();
      window.dispatchEvent(new CustomEvent("workbench:records-changed", { detail: { source: "tasks-list" } }));
      return true;
    } catch { setError(failure); return false; }
    finally { setBusy(false); }
  }

  async function toggle(task: Task) {
    const saved = await runAction(() => api(`/api/tasks/${task.id}`, { method: "PATCH", json: { status: task.status === "done" ? "todo" : "done" } }), "任务状态未能保存，请重试。");
    if (saved) setCompletedRepeat(task.status === "done" ? null : task);
  }

  async function remove(task: Task) {
    const saved = await runAction(() => api(`/api/tasks/${task.id}`, { method: "DELETE" }), "任务删除失败，请重试。");
    if (saved) setDeleted((items) => [task, ...items.filter((item) => item.id !== task.id)]);
  }

  async function restore(task: Task) {
    const saved = await runAction(() => api(`/api/tasks/${task.id}`, { method: "PATCH", json: { action: "restore" } }), "任务恢复失败，请重试。");
    if (saved) setDeleted((items) => items.filter((item) => item.id !== task.id));
  }

  return (
    <div className="page-shell">
      <PageHeader title="全部任务" description="所有未删除的任务都在这里，未设日期或安排在未来的任务也能找到。"
        meta={loaded && <span className="tnum">共 {tasks.length} 项任务</span>}
        actions={<><Link href="/today" className="btn-ghost">今日待办</Link><Link href="/tasks/deleted" className="btn-ghost">最近删除</Link></>} />
      <div className="mb-5 space-y-4">
        <nav className="flex flex-wrap gap-2" aria-label="按任务状态筛选">
          {FILTERS.map((item) => <button key={item.key} type="button" aria-pressed={filter === item.key}
            onClick={() => { setFilter(item.key); setVisibleCount(50); }}
            className={`min-h-10 rounded-lg border px-3 py-2 text-xs ${filter === item.key ? "border-accent/30 bg-accent-soft text-accent" : "border-line bg-surface text-muted hover:text-ink"}`}>{item.label}</button>)}
        </nav>
        <div><label htmlFor="tasks-filter-query" className="mb-2 block text-xs font-medium text-muted">筛选任务名称或备注</label>
          <input id="tasks-filter-query" value={query} onChange={(event) => { setQuery(event.target.value); setVisibleCount(50); }} className="input" placeholder="输入关键词" /></div>
      </div>
      {error && <div className="mb-5"><PageError message={error} onRetry={load} /></div>}
      {updated && <p role="status" className="mb-5 break-words text-sm text-muted">任务已保存。<Link href={`/tasks/${updated.id}`} className="ml-2 text-accent hover:underline">查看“{updated.title}”</Link></p>}
      <TaskUndoNotice tasks={deleted} busy={busy} onRestore={restore} />
      <TaskRepeatCompletionNotice task={completedRepeat} />
      {loading ? <PageLoading rows={5} /> : loaded && (filtered.length ? <>
        <p className="mb-3 text-xs text-muted tnum">找到 {filtered.length} 项任务</p>
        <div className="space-y-2">{filtered.slice(0, visibleCount).map((task) => <TaskItem key={task.id} task={task} overdue={!!task.dueDate && isOverdue(task.dueDate)} disabled={busy} onToggle={toggle} onDelete={remove} onEdit={setEditing} />)}</div>
        {filtered.length > visibleCount && <div className="mt-5 flex justify-center"><button type="button" onClick={() => setVisibleCount((count) => count + 50)} className="btn-ghost">显示更多任务（还剩 {filtered.length - visibleCount} 项）</button></div>}
      </> : <EmptyState title={tasks.length ? "没有符合条件的任务" : "还没有任务"} description={tasks.length ? "可以切换状态或缩短搜索关键词。" : "使用顶部“快速记录”，随时添加任务；日期可以稍后再定。"} icon={<CheckSquare size={24} />} />)}
      {editing && <TaskEditor key={editing.id} task={editing} onClose={() => setEditing(null)} onSaved={(saved) => { setUpdated(saved); setEditing(null); }} />}
    </div>
  );
}
