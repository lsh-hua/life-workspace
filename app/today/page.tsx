"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import type { Task } from "@/db/schema";
import TaskItem from "@/components/task-item";
import TaskEditor from "@/components/task-editor";
import TaskUndoNotice from "@/components/task-undo-notice";
import { TaskRepeatCompletionNotice } from "@/components/task-schedule-meta";
import { useTaskResource } from "@/components/use-task-resource";
import { EmptyState, PageError, PageHeader, PageLoading } from "@/components/page-header";
import { isOverdue, todayStr } from "@/lib/dates";
import { ArrowRight, CheckSquare, GripVertical, Plus } from "lucide-react";
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
  sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

function SortableTask({
  task,
  onToggle,
  onDelete,
  onEdit,
  disabled,
}: {
  task: Task;
  onToggle: (t: Task) => void;
  onDelete: (t: Task) => void;
  onEdit: (t: Task) => void;
  disabled: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({
    id: task.id,
    disabled,
  });
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }}>
      <TaskItem
        task={task}
        overdue={!!task.dueDate && isOverdue(task.dueDate)}
        onToggle={onToggle}
        onDelete={onDelete}
        onEdit={onEdit}
        disabled={disabled}
        dragHandle={
          <button type="button" {...attributes} {...listeners} disabled={disabled}
            aria-label={`调整任务顺序：${task.title}`}
            className="flex h-8 w-6 shrink-0 cursor-grab touch-none items-center justify-center rounded-lg text-muted hover:bg-bg hover:text-ink active:cursor-grabbing disabled:cursor-wait">
            <GripVertical size={15} />
          </button>
        }
      />
    </div>
  );
}

export default function TodayPage() {
  const { data: tasks, setData: setTasks, loading, loaded, error, setError, refresh: load } = useTaskResource<Task[]>("/api/tasks?filter=today", [], "today", "今日任务读取失败，请重新加载。");
  const [input, setInput] = useState("");
  const [priority, setPriority] = useState<"high" | "medium" | "low">("medium");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<Task | null>(null);
  const [deleted, setDeleted] = useState<Task[]>([]);
  const [updated, setUpdated] = useState<Task | null>(null);
  const [completedRepeat, setCompletedRepeat] = useState<Task | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const runAction = async (action: () => Promise<unknown>, message: string) => {
    if (busy) return false;
    setBusy(true);
    setError(null);
    try {
      await action();
      await load();
      window.dispatchEvent(new CustomEvent("workbench:records-changed", { detail: { source: "today" } }));
      return true;
    } catch {
      setError(message);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const add = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const title = input.trim();
    if (!title) return;
    const saved = await runAction(() => api("/api/tasks", {
      method: "POST",
      json: { title, priority, dueDate: todayStr(), isToday: 1, sortOrder: tasks.length },
    }), "任务添加失败，输入已保留，请重试。");
    if (saved) setInput("");
  };

  const toggle = async (t: Task) => {
    const saved = await runAction(() => api(`/api/tasks/${t.id}`, {
      method: "PATCH",
      json: { status: t.status === "done" ? "todo" : "done" },
    }), "任务状态没有保存，请重试。");
    if (saved) setCompletedRepeat(t.status === "done" ? null : t);
  };

  const remove = async (t: Task) => {
    const saved = await runAction(() => api(`/api/tasks/${t.id}`, { method: "DELETE" }), "任务删除失败，请重试。");
    if (saved) setDeleted((items) => [t, ...items.filter((item) => item.id !== t.id)]);
  };

  const restore = async (t: Task) => {
    const saved = await runAction(() => api(`/api/tasks/${t.id}`, { method: "PATCH", json: { action: "restore" } }), "任务恢复失败，请重试。");
    if (saved) setDeleted((items) => items.filter((item) => item.id !== t.id));
  };

  const onDragEnd = async (e: DragEndEvent) => {
    const { active, over } = e;
    if (busy || !over || active.id === over.id) return;
    const oldIdx = tasks.findIndex((t) => t.id === active.id);
    const newIdx = tasks.findIndex((t) => t.id === over.id);
    if (oldIdx < 0 || newIdx < 0) return;
    const previous = tasks;
    const next = arrayMove(tasks, oldIdx, newIdx);
    setTasks(next);
    const saved = await runAction(() => api("/api/tasks/reorder", { method: "POST", json: { ids: next.map((t) => t.id) } }), "任务顺序没有保存，已恢复原顺序。");
    if (!saved) setTasks(previous);
  };

  const done = tasks.filter((t) => t.status === "done").length;
  const pct = tasks.length ? Math.round((done / tasks.length) * 100) : 0;

  return (
    <div className="page-shell">
      <PageHeader title="今日待办" description="安排今天要做的事，拖动任务可调整先后顺序。"
        actions={<><Link href="/tasks/deleted" className="btn-ghost">最近删除</Link><Link href="/week" className="btn-ghost">查看本周 <ArrowRight size={14} /></Link></>} />

      {!loading && tasks.length > 0 && <div className="mb-6 flex flex-wrap items-center gap-x-6 gap-y-2 border-y border-line py-4 text-sm text-muted tnum">
        <span><strong className="mr-1.5 text-lg font-semibold text-ink">{tasks.length - done}</strong>项待完成</span>
        <span><strong className="mr-1.5 font-medium text-ink">{done}</strong>项已完成</span>
        <span className="sm:ml-auto">完成度 <strong className="font-medium text-ink">{pct}%</strong></span>
      </div>}

      <form onSubmit={add} className="card mb-6 grid gap-4 p-4 sm:grid-cols-[minmax(0,1fr)_7rem_auto] sm:items-end sm:p-5">
        <div className="min-w-0">
          <label htmlFor="today-task-title" className="mb-2 block text-xs font-medium text-muted">任务名称</label>
          <input id="today-task-title"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="今天要完成什么？"
          disabled={busy || loading || !loaded}
          className="input"
        />
        </div>
        <div>
          <label htmlFor="today-task-priority" className="mb-2 block text-xs font-medium text-muted">优先级</label>
          <select id="today-task-priority"
          value={priority}
          onChange={(e) => setPriority(e.target.value as typeof priority)}
          disabled={busy || loading || !loaded}
          className="input"
        >
          <option value="high">高</option>
          <option value="medium">中</option>
          <option value="low">低</option>
        </select>
        </div>
        <button type="submit" disabled={busy || loading || !loaded || !input.trim()} className="btn-primary justify-center"><Plus size={15} /> 添加任务</button>
      </form>

      {error && <div className="mb-5"><PageError message={error} onRetry={load} /></div>}
      {updated && <p role="status" className="mb-5 break-words text-sm text-muted">任务已保存。<Link href={`/tasks/${updated.id}`} className="ml-2 text-accent hover:underline">查看“{updated.title}”</Link></p>}
      <TaskUndoNotice tasks={deleted} busy={busy} onRestore={restore} />
      <TaskRepeatCompletionNotice task={completedRepeat} />
      {loading ? <PageLoading rows={4} /> : loaded && <>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-2">
            {tasks.map((t) => (
              <SortableTask key={t.id} task={t} onToggle={toggle} onDelete={remove} onEdit={setEditing} disabled={busy} />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      {tasks.length === 0 && !error && <EmptyState title="今天还没有任务" description="在上方添加第一条任务，已安排的未完成任务也会显示在这里。" icon={<CheckSquare size={22} />} />}
      </>}
      {editing && <TaskEditor key={editing.id} task={editing} onClose={() => setEditing(null)} onSaved={(saved) => { setUpdated(saved); setEditing(null); }} />}
    </div>
  );
}
