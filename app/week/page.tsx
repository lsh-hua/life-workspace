"use client";

import { useState, type FormEvent } from "react";
import { api } from "@/lib/api";
import Link from "next/link";
import type { Task } from "@/db/schema";
import TaskEditor from "@/components/task-editor";
import TaskUndoNotice from "@/components/task-undo-notice";
import { useTaskResource } from "@/components/use-task-resource";
import { PageError, PageHeader, PageLoading } from "@/components/page-header";
import { WEEKDAY_CN, todayStr, weekDates, weekRangeLabel } from "@/lib/dates";
import { Check, GripVertical, Pencil, Plus, Timer, Trash2 } from "lucide-react";
import TaskScheduleMeta, { TaskRepeatCompletionNotice } from "@/components/task-schedule-meta";
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  useDraggable,
  type DragEndEvent,
} from "@dnd-kit/core";

function DayColumn({
  date,
  label,
  isTodayCol,
  tasks,
  onAdd,
  disabled,
  children,
}: {
  date: string;
  label: string;
  isTodayCol: boolean;
  tasks: Task[];
  onAdd: (date: string, title: string) => Promise<boolean>;
  disabled: boolean;
  children: (t: Task) => React.ReactNode;
}) {
  const [draft, setDraft] = useState("");
  const { setNodeRef, isOver } = useDroppable({ id: date });
  const completed = tasks.filter((task) => task.status === "done").length;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft.trim() || disabled) return;
    if (await onAdd(date, draft.trim())) setDraft("");
  }

  return (
    <section
      ref={setNodeRef}
      aria-label={`周${label} ${date}`}
      className={`flex min-h-56 min-w-0 flex-col rounded-2xl border p-3 transition-colors xl:min-h-72 ${
        isOver ? "border-accent bg-accent-soft" : isTodayCol ? "border-accent/50 bg-surface" : "border-line bg-surface"
      }`}
    >
      <div className="mb-3 flex items-center justify-between gap-2 border-b border-line pb-3">
        <h2 className={`text-sm font-semibold ${isTodayCol ? "text-accent" : "text-ink"}`}>
          周{label}
        </h2>
        <span
          className={`tnum inline-flex h-7 min-w-7 items-center justify-center rounded-lg px-1.5 text-xs ${
            isTodayCol
              ? "bg-accent text-on-accent"
              : "bg-bg text-muted"
          }`}
        >
          {Number(date.slice(8))}日
        </span>
      </div>
      <div className="flex-1 space-y-2">
        {tasks.length ? tasks.map(children) : <p className="py-5 text-xs leading-5 text-muted">暂无任务</p>}
      </div>
      <p className="mb-3 mt-3 text-[11px] text-muted tnum">{completed}/{tasks.length} 已完成</p>
      <form onSubmit={submit}>
        <label htmlFor={`week-add-${date}`} className="mb-1.5 block text-[11px] font-medium text-muted">添加周{label}任务</label>
        <div className="flex items-center gap-1.5">
          <input id={`week-add-${date}`}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          disabled={disabled}
          placeholder="任务名称"
          className="input min-w-0 flex-1"
        />
          <button type="submit" disabled={disabled || !draft.trim()} className="btn-ghost shrink-0 px-2" aria-label={`添加周${label}任务`}><Plus size={14} /></button>
        </div>
      </form>
    </section>
  );
}

function DraggableCard({ task, days, disabled, onToggle, onMove, onEdit, onDelete }: {
  task: Task;
  days: string[];
  disabled: boolean;
  onToggle: (t: Task) => void;
  onMove: (task: Task, date: string) => void;
  onEdit: (task: Task) => void;
  onDelete: (task: Task) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: task.id,
    disabled,
  });
  const done = task.status === "done";
  return (
    <div
      ref={setNodeRef}
      style={
        transform ? { transform: `translate(${transform.x}px, ${transform.y}px)` } : undefined
      }
      className={`relative min-w-0 rounded-xl border border-line bg-bg p-2.5 text-sm ${isDragging ? "z-10 opacity-75 shadow-soft" : ""}`}
    >
      <div className="flex items-start gap-2">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggle(task);
          }}
          onPointerDown={(e) => e.stopPropagation()}
          disabled={disabled}
          aria-label={`${done ? "标记未完成" : "完成任务"}：${task.title}`}
          aria-pressed={done}
          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border transition-colors ${
            done ? "border-ink bg-ink text-on-ink" : "border-line text-muted hover:border-accent"
          }`}
        >
          {done && <Check size={10} strokeWidth={3.5} />}
        </button>
        <Link href={`/tasks/${task.id}`} className={`min-w-0 break-words text-xs leading-6 hover:text-accent hover:underline ${done ? "text-muted line-through" : ""}`}>{task.title}</Link>
      </div>
      <div className="mt-2 flex flex-wrap gap-x-2 gap-y-1 text-[11px] leading-5"><TaskScheduleMeta task={task} /></div>
      <div className="mt-2 flex justify-end gap-1">
        {!done && <button type="button" disabled={disabled} onClick={() => window.dispatchEvent(new CustomEvent("workbench:start-focus", { detail: { taskId: task.id } }))} aria-label={`开始专注：${task.title}`} title="开始专注" className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-surface hover:text-accent"><Timer size={13} /></button>}
        <button type="button" disabled={disabled} onClick={() => onEdit(task)} aria-label={`编辑任务：${task.title}`} className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-surface hover:text-ink"><Pencil size={13} /></button>
        <button type="button" disabled={disabled} onClick={() => onDelete(task)} aria-label={`删除任务：${task.title}`} className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-danger/10 hover:text-danger"><Trash2 size={13} /></button>
      </div>
      <div className="mt-2 flex items-end gap-2">
        <button type="button" {...attributes} {...listeners} disabled={disabled}
          className="flex h-7 w-7 shrink-0 cursor-grab touch-none items-center justify-center rounded-lg text-muted hover:bg-surface active:cursor-grabbing"
          aria-label={`拖动任务调整日期：${task.title}`}><GripVertical size={14} /></button>
        <div className="min-w-0 flex-1">
          <label htmlFor={`week-move-${task.id}`} className="mb-1 block text-[11px] text-muted">计划日期</label>
          <select id={`week-move-${task.id}`} value={task.plannedDate ?? task.dueDate ?? ""} disabled={disabled}
            aria-label={`调整任务日期：${task.title}`}
            onChange={(event) => onMove(task, event.target.value)}
            className="min-h-8 w-full min-w-0 rounded-lg border border-line bg-surface px-1.5 text-[11px] text-muted outline-none focus:border-accent">
            {days.map((day, index) => <option key={day} value={day}>周{WEEKDAY_CN[index]}</option>)}
          </select>
        </div>
      </div>
    </div>
  );
}

export default function WeekPage() {
  const { data: tasks, setData: setTasks, loading, loaded, error, setError, refresh: load } = useTaskResource<Task[]>("/api/tasks?filter=week", [], "week", "本周任务读取失败，请重新加载。");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<Task | null>(null);
  const [deleted, setDeleted] = useState<Task[]>([]);
  const [updated, setUpdated] = useState<Task | null>(null);
  const [completedRepeat, setCompletedRepeat] = useState<Task | null>(null);
  const days = weekDates();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const runAction = async (action: () => Promise<unknown>, message: string) => {
    if (busy) return false;
    setBusy(true);
    setError(null);
    try {
      await action();
      await load();
      window.dispatchEvent(new CustomEvent("workbench:records-changed", { detail: { source: "week" } }));
      return true;
    } catch {
      setError(message);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const add = async (date: string, title: string) => {
    return runAction(() => api("/api/tasks", { method: "POST", json: { title, plannedDate: date } }), "任务添加失败，输入已保留，请重试。");
  };

  const toggle = async (t: Task) => {
    const saved = await runAction(() => api(`/api/tasks/${t.id}`, {
      method: "PATCH",
      json: { status: t.status === "done" ? "todo" : "done" },
    }), "任务状态没有保存，请重试。");
    if (saved) setCompletedRepeat(t.status === "done" ? null : t);
  };

  const remove = async (task: Task) => {
    const saved = await runAction(() => api(`/api/tasks/${task.id}`, { method: "DELETE" }), "任务删除失败，请重试。");
    if (saved) setDeleted((items) => [task, ...items.filter((item) => item.id !== task.id)]);
  };

  const restore = async (task: Task) => {
    const saved = await runAction(() => api(`/api/tasks/${task.id}`, { method: "PATCH", json: { action: "restore" } }), "任务恢复失败，请重试。");
    if (saved) setDeleted((items) => items.filter((item) => item.id !== task.id));
  };

  const moveTask = async (task: Task, date: string) => {
    if (busy || !days.includes(date) || (task.plannedDate ?? task.dueDate) === date) return;
    const previous = tasks;
    setTasks(tasks.map((item) => item.id === task.id ? { ...item, plannedDate: date } : item));
    const saved = await runAction(() => api(`/api/tasks/${task.id}`, { method: "PATCH", json: { plannedDate: date } }), "任务日期没有保存，已恢复原安排。");
    if (!saved) setTasks(previous);
  };

  const onDragEnd = async (e: DragEndEvent) => {
    const { active, over } = e;
    if (busy || !over) return;
    const taskId = Number(active.id);
    const newDate = String(over.id);
    const task = tasks.find((t) => t.id === taskId);
    if (task) await moveTask(task, newDate);
  };

  const done = tasks.filter((t) => t.status === "done").length;

  return (
    <div className="page-shell page-shell-wide">
      <PageHeader title="本周清单" description="按计划日期安排任务，拖动卡片只调整计划，保留原来的截止日期。未设计划日期的旧任务按截止日显示。"
        meta={<span className="tnum">{weekRangeLabel().replace(/[\u2013\u2014]/g, "-")}</span>}
        actions={<><Link href="/tasks/deleted" className="btn-ghost">最近删除</Link><span className="rounded-xl border border-line bg-surface px-4 py-2 text-sm text-muted tnum">{loaded ? <><strong className="font-medium text-ink">{done}/{tasks.length}</strong> 已完成</> : loading ? "正在读取…" : "暂不可用"}</span></>} />

      {error && <div className="mb-5"><PageError message={error} onRetry={load} /></div>}
      {updated && <p role="status" className="mb-5 break-words text-sm text-muted">任务已保存。<Link href={`/tasks/${updated.id}`} className="ml-2 text-accent hover:underline">查看“{updated.title}”</Link></p>}
      <TaskUndoNotice tasks={deleted} busy={busy} onRestore={restore} />
      <TaskRepeatCompletionNotice task={completedRepeat} />
      {loading ? <PageLoading rows={7} /> : loaded &&

      <DndContext sensors={sensors} onDragEnd={onDragEnd}>
        <div className="grid min-w-0 grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-7">
          {days.map((date, i) => (
            <DayColumn
              key={date}
              date={date}
              label={WEEKDAY_CN[i]}
              isTodayCol={date === todayStr()}
              tasks={tasks.filter((t) => (t.plannedDate ?? t.dueDate) === date)}
              onAdd={add}
              disabled={busy}
            >
              {(t) => <DraggableCard key={t.id} task={t} days={days} disabled={busy} onToggle={toggle} onMove={moveTask} onEdit={setEditing} onDelete={remove} />}
            </DayColumn>
          ))}
        </div>
      </DndContext>}
      {editing && <TaskEditor key={editing.id} task={editing} onClose={() => setEditing(null)} onSaved={(saved) => { setUpdated(saved); setEditing(null); }} />}
    </div>
  );
}
