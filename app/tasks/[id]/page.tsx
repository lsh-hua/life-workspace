"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Check, Pencil, RotateCcw, Timer, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import type { Task } from "@/db/schema";
import TaskEditor from "@/components/task-editor";
import { TaskRepeatMeta } from "@/components/task-schedule-meta";
import { useTaskResource } from "@/components/use-task-resource";
import { PageError, PageHeader, PageLoading } from "@/components/page-header";

const PRIORITIES = { high: "高", medium: "中", low: "低" };

export default function TaskDetailPage() {
  const { id } = useParams<{ id: string }>();
  return <TaskDetail key={id} id={id} />;
}

function TaskDetail({ id }: { id: string }) {
  const source = `task:${id}`;
  const { data: task, setData: setTask, loading, error, setError, refresh: load } = useTaskResource<Task | null>(`/api/tasks/${id}`, null, source, "暂时无法读取这条任务，请确认任务地址后重试。");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);

  async function mutate(action: "toggle" | "delete" | "restore") {
    if (busy || !task) return;
    setBusy(true);
    setError("");
    try {
      if (action === "delete") await api(`/api/tasks/${id}`, { method: "DELETE" });
      else await api(`/api/tasks/${id}`, {
        method: "PATCH",
        json: action === "restore" ? { action: "restore" } : { status: task.status === "done" ? "todo" : "done" },
      });
      await load();
      window.dispatchEvent(new CustomEvent("workbench:records-changed", { detail: { source } }));
    } catch {
      setError(action === "restore" ? "任务恢复失败，请重试。" : action === "delete" ? "任务删除失败，请重试。" : "任务状态未能保存，请重试。");
    } finally { setBusy(false); }
  }

  return (
    <div className="page-shell">
      <PageHeader title="任务详情" description="分别安排计划日期和截止日期，按需要设置重复任务。"
        actions={<Link href="/today" className="btn-ghost"><ArrowLeft size={14} />今日待办</Link>} />
      {error && <div className="mb-5"><PageError message={error} onRetry={load} /></div>}
      {loading ? <PageLoading rows={3} /> : task && <article className="card p-5 sm:p-6" aria-busy={busy}>
        {task.deletedAt && <div role="status" className="mb-5 rounded-xl border border-line bg-bg p-4 text-sm leading-6">
          <p>这条任务已移至最近删除，内容和关联记录仍保留。</p>
          <button type="button" disabled={busy} onClick={() => { void mutate("restore"); }} className="btn-primary mt-3"><RotateCcw size={14} />{busy ? "正在恢复…" : "恢复任务"}</button>
          <Link href="/tasks/deleted" className="btn-ghost ml-2 mt-3">查看最近删除</Link>
        </div>}
        <h2 className={`break-words text-xl font-semibold leading-8 ${task.status === "done" ? "text-muted line-through" : ""}`}>{task.title}</h2>
        <dl className="mt-5 grid gap-4 border-y border-line py-4 text-sm sm:grid-cols-2">
          <div><dt className="text-xs text-muted">状态</dt><dd className="mt-1.5">{task.status === "done" ? "已完成" : "待完成"}</dd></div>
          <div><dt className="text-xs text-muted">优先级</dt><dd className="mt-1.5">{PRIORITIES[task.priority]}</dd></div>
          <div><dt className="text-xs text-muted">计划日期</dt><dd className="mt-1.5 tnum">{task.plannedDate || "未设置"}</dd></div>
          <div><dt className="text-xs text-muted">截止日期</dt><dd className="mt-1.5 tnum">{task.dueDate || "未设置"}</dd></div>
        </dl>
        {task.repeatRule && <div className="mt-4 text-xs leading-6"><TaskRepeatMeta rule={task.repeatRule} /><p className="mt-1 text-muted">{task.status === "done" ? "本次完成记录已保留，下一次任务可在全部任务中查看。" : "完成后会安排下一次，本次完成记录会保留。"}</p>{task.status === "done" && <Link href="/tasks" className="text-accent hover:underline">查看全部任务</Link>}</div>}
        {task.repeatParentId && <p className="mt-3 text-xs text-muted">这是一项重复任务的独立记录。<Link href={`/tasks/${task.repeatParentId}`} className="ml-1 text-accent hover:underline">查看上一次</Link></p>}
        <div className="mt-5"><h3 className="text-xs font-medium text-muted">备注</h3><p className="mt-2 break-words whitespace-pre-wrap text-sm leading-7">{task.note || "暂无备注"}</p></div>
        {!!task.isToday && <p className="mt-4 text-xs text-muted">已加入今日待办</p>}
        {!task.deletedAt && <div className="mt-6 flex flex-wrap gap-3 border-t border-line pt-5">
          <button type="button" disabled={busy} onClick={() => setEditing(true)} className="btn-primary"><Pencil size={14} />编辑任务</button>
          {task.status !== "done" && <button type="button" disabled={busy} onClick={() => window.dispatchEvent(new CustomEvent("workbench:start-focus", { detail: { taskId: task.id } }))} className="btn-ghost"><Timer size={14} />开始专注</button>}
          <button type="button" disabled={busy} onClick={() => { void mutate("toggle"); }} className="btn-ghost"><Check size={14} />{task.status === "done" ? "标记未完成" : "完成任务"}</button>
          <button type="button" disabled={busy} onClick={() => { void mutate("delete"); }} className="btn-ghost text-danger"><Trash2 size={14} />移至最近删除</button>
        </div>}
      </article>}
      {editing && task && <TaskEditor key={task.id} task={task} onClose={() => setEditing(false)} onSaved={(saved) => { setTask(saved); setEditing(false); }} />}
    </div>
  );
}
