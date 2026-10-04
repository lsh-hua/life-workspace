"use client";

import type { Task } from "@/db/schema";
import { Check, Trash2, GripVertical } from "lucide-react";

const PRIORITY_COLOR: Record<string, string> = {
  high: "#dc2626",
  medium: "#d97706",
  low: "#a1a1aa",
};

export default function TaskItem({
  task,
  overdue,
  onToggle,
  onDelete,
  dragHandle,
}: {
  task: Task;
  overdue?: boolean;
  onToggle: (t: Task) => void;
  onDelete: (t: Task) => void;
  dragHandle?: React.ReactNode;
}) {
  const done = task.status === "done";
  return (
    <div
      className={`group flex items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3 transition-shadow hover:shadow-sm ${
        done ? "opacity-55" : ""
      }`}
    >
      {dragHandle ?? (
        <GripVertical size={15} className="shrink-0 text-faint opacity-0 group-hover:opacity-100" />
      )}
      <button
        onClick={() => onToggle(task)}
        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors ${
          done ? "border-ink bg-ink text-white" : "border-faint hover:border-ink"
        }`}
      >
        {done && <Check size={13} strokeWidth={3} />}
      </button>
      <div className="min-w-0 flex-1">
        <div className={`truncate text-sm ${done ? "line-through" : ""}`}>{task.title}</div>
        {task.note && (
          <div className="mt-0.5 truncate text-xs text-faint">{task.note}</div>
        )}
      </div>
      {overdue && !done && (
        <span className="shrink-0 rounded bg-danger/10 px-1.5 py-0.5 text-[10px] text-danger">
          已逾期
        </span>
      )}
      <span
        className="h-2 w-2 shrink-0 rounded-full"
        style={{ background: PRIORITY_COLOR[task.priority] }}
        title={`优先级：${task.priority}`}
      />
      <button
        onClick={() => onDelete(task)}
        className="shrink-0 rounded p-1 text-faint opacity-0 transition-opacity hover:text-danger group-hover:opacity-100"
      >
        <Trash2 size={14} />
      </button>
    </div>
  );
}
