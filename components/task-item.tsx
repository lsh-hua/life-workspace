"use client";

import type { Task } from "@/db/schema";
import { Check, Trash2 } from "lucide-react";

const PRIORITIES: Record<string, { label: string; color: string }> = {
  high: { label: "高优先级", color: "var(--color-danger)" },
  medium: { label: "中优先级", color: "var(--color-accent)" },
  low: { label: "低优先级", color: "var(--color-muted)" },
};

export default function TaskItem({
  task,
  overdue,
  onToggle,
  onDelete,
  dragHandle,
  disabled = false,
}: {
  task: Task;
  overdue?: boolean;
  onToggle: (t: Task) => void;
  onDelete: (t: Task) => void;
  dragHandle?: React.ReactNode;
  disabled?: boolean;
}) {
  const done = task.status === "done";
  const priority = PRIORITIES[task.priority] ?? PRIORITIES.medium;
  return (
    <div
      className={`group flex items-start gap-2 rounded-xl border border-line px-3 py-3 sm:items-center sm:gap-3 sm:px-4 ${
        done ? "bg-bg/50" : "bg-surface"
      }`}
    >
      {dragHandle}
      <button
        type="button"
        onClick={() => onToggle(task)}
        disabled={disabled}
        aria-label={`${done ? "标记未完成" : "完成任务"}：${task.title}`}
        aria-pressed={done}
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border transition-colors disabled:cursor-wait ${
          done ? "border-ink bg-ink text-on-ink" : "border-line text-muted hover:border-accent hover:text-accent"
        }`}
      >
        {done && <Check size={13} strokeWidth={3} />}
      </button>
      <div className="min-w-0 flex-1">
        <div className={`break-words text-sm leading-6 ${done ? "text-muted line-through" : ""}`}>{task.title}</div>
        {task.note && (
          <div className="mt-0.5 line-clamp-2 break-words text-xs leading-5 text-muted">{task.note}</div>
        )}
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] leading-5">
          <span style={{ color: priority.color }}>{priority.label}</span>
          {overdue && !done && <span className="text-danger">已逾期</span>}
          {done && <span className="text-muted">已完成</span>}
        </div>
      </div>
      <button
        type="button"
        onClick={() => onDelete(task)}
        disabled={disabled}
        aria-label={`删除任务：${task.title}`}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:bg-danger/10 hover:text-danger disabled:cursor-wait"
      >
        <Trash2 size={14} />
      </button>
    </div>
  );
}
