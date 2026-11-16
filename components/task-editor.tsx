"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { X } from "lucide-react";
import { api } from "@/lib/api";
import type { Task } from "@/db/schema";
import { todayStr } from "@/lib/dates";
import { parseTaskRepeat, serializeTaskRepeat, type TaskRepeatRule } from "@/lib/task-repeat";

export default function TaskEditor({ task, onClose, onSaved }: {
  task: Task; onClose: () => void; onSaved: (task: Task) => void;
}) {
  const [title, setTitle] = useState(task.title);
  const [note, setNote] = useState(task.note ?? "");
  const [priority, setPriority] = useState(task.priority);
  const [dueDate, setDueDate] = useState(task.dueDate ?? "");
  const [plannedDate, setPlannedDate] = useState(task.plannedDate ?? "");
  const [originalRepeat] = useState(() => parseTaskRepeat(task.repeatRule));
  const [frequency, setFrequency] = useState<TaskRepeatRule["frequency"] | "none">(() => parseTaskRepeat(task.repeatRule)?.frequency ?? "none");
  const [basis, setBasis] = useState<TaskRepeatRule["basis"]>(() => parseTaskRepeat(task.repeatRule)?.basis ?? "schedule");
  const [isToday, setIsToday] = useState(!!task.isToday);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const repeatAnchor = originalRepeat?.anchorDate ?? (plannedDate || dueDate || todayStr());
  const dialog = useRef<HTMLDialogElement>(null);
  const titleInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const previous = document.activeElement;
    const element = dialog.current;
    element?.showModal();
    titleInput.current?.focus();
    return () => {
      element?.close();
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
      else document.getElementById("main-content")?.focus();
    };
  }, []);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !title.trim()) return;
    setBusy(true);
    setError("");
    try {
      const repeatRule = frequency === "none" ? null : serializeTaskRepeat({
        frequency, basis, anchorDate: repeatAnchor,
      });
      const saved = await api<Task>(`/api/tasks/${task.id}`, {
        method: "PATCH",
        json: { title: title.trim(), note: note.trim() || null, priority, plannedDate: plannedDate || null, dueDate: dueDate || null, repeatRule, isToday: isToday ? 1 : 0 },
      });
      window.dispatchEvent(new CustomEvent("workbench:records-changed", { detail: { source: "task-editor" } }));
      onSaved(saved);
    } catch {
      setError("任务未能保存，输入已保留，请重试。");
      setBusy(false);
    }
  }

  return (
    <dialog ref={dialog} aria-labelledby="task-editor-title" aria-describedby="task-editor-description"
      className="fixed inset-4 m-auto max-h-[90dvh] w-auto max-w-lg overflow-y-auto rounded-2xl border border-line bg-surface p-5 text-ink shadow-2xl backdrop:bg-overlay sm:p-6"
      onCancel={(event) => { event.preventDefault(); if (!busy) onClose(); }}
      onClick={(event) => {
        if (event.target !== event.currentTarget || busy) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) onClose();
      }}>
      <div className="mb-5 flex items-center justify-between gap-4">
        <div>
          <h2 id="task-editor-title" className="text-base font-semibold">编辑任务</h2>
          <p id="task-editor-description" className="mt-1 text-xs leading-6 text-muted">计划日期决定何时做，截止日期表示最晚何时完成，两项均可留空。</p>
        </div>
        <button type="button" disabled={busy} onClick={onClose} className="btn-ghost px-2" aria-label="关闭任务编辑"><X size={17} /></button>
      </div>
      <form onSubmit={save} className="space-y-4" aria-busy={busy}>
        <div><label htmlFor="task-edit-title" className="mb-2 block text-xs font-medium text-muted">任务名称</label>
          <input ref={titleInput} id="task-edit-title" value={title} onChange={(event) => setTitle(event.target.value)} disabled={busy} required className="input" /></div>
        <div><label htmlFor="task-edit-note" className="mb-2 block text-xs font-medium text-muted">备注（选填）</label>
          <textarea id="task-edit-note" value={note} onChange={(event) => setNote(event.target.value)} disabled={busy} rows={4} className="input resize-y" /></div>
        <div><label htmlFor="task-edit-priority" className="mb-2 block text-xs font-medium text-muted">优先级</label>
          <select id="task-edit-priority" value={priority} onChange={(event) => setPriority(event.target.value as Task["priority"])} disabled={busy} className="input">
            <option value="high">高</option><option value="medium">中</option><option value="low">低</option>
          </select></div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div><label htmlFor="task-edit-planned-date" className="mb-2 block text-xs font-medium text-muted">计划日期（选填）</label>
            <input id="task-edit-planned-date" type="date" value={plannedDate} onChange={(event) => setPlannedDate(event.target.value)} disabled={busy} className="input" /></div>
          <div><label htmlFor="task-edit-date" className="mb-2 block text-xs font-medium text-muted">截止日期（选填）</label>
            <input id="task-edit-date" type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} disabled={busy} className="input" /></div>
        </div>
        <fieldset className="rounded-xl border border-line p-4">
          <legend className="px-1 text-xs font-medium text-muted">重复安排</legend>
          <div className="grid gap-4 sm:grid-cols-2">
            <div><label htmlFor="task-edit-repeat" className="mb-2 block text-xs font-medium text-muted">重复频率</label>
              <select id="task-edit-repeat" value={frequency} onChange={(event) => setFrequency(event.target.value as typeof frequency)} disabled={busy} className="input">
                <option value="none">不重复</option><option value="daily">每天</option><option value="weekdays">工作日</option><option value="weekly">每周</option><option value="monthly">每月</option>
              </select></div>
            {frequency !== "none" && <div><label htmlFor="task-edit-repeat-basis" className="mb-2 block text-xs font-medium text-muted">下一次的计算方式</label>
              <select id="task-edit-repeat-basis" value={basis} onChange={(event) => setBasis(event.target.value as TaskRepeatRule["basis"])} disabled={busy} className="input">
                <option value="schedule">按原计划</option><option value="completion">从完成日开始</option>
              </select></div>}
          </div>
          {frequency !== "none" && <p className="mt-3 text-xs leading-6 text-muted">重复起点 {repeatAnchor}。完成本次后安排下一次，本次记录会保留。{basis === "schedule" ? "按首次日期保持重复节奏。" : "从实际完成日计算下一次日期。"}{task.status === "done" ? "修改本条记录不会同步到已经生成的下次任务。" : ""}</p>}
        </fieldset>
        <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm">
          <input type="checkbox" checked={isToday} onChange={(event) => setIsToday(event.target.checked)} disabled={busy} className="h-4 w-4 accent-[var(--color-accent)]" />加入今日待办
        </label>
        {error && <p role="alert" className="text-sm leading-6 text-danger">{error}</p>}
        <div className="flex justify-end gap-3 border-t border-line pt-4">
          <button type="button" disabled={busy} onClick={onClose} className="btn-ghost">取消</button>
          <button type="submit" disabled={busy || !title.trim()} className="btn-primary">{busy ? "正在保存…" : "保存修改"}</button>
        </div>
      </form>
    </dialog>
  );
}
