"use client";

import Link from "next/link";
import { RotateCcw } from "lucide-react";
import type { Task } from "@/db/schema";

export default function TaskUndoNotice({ tasks, busy, onRestore }: {
  tasks: Task[]; busy: boolean; onRestore: (task: Task) => void;
}) {
  if (!tasks.length) return null;
  return (
    <section aria-label="撤销任务删除" className="mb-5 rounded-xl border border-line bg-surface p-4">
      <p role="status" className="text-sm">已移至最近删除，内容和关联记录均保留。</p>
      <ul className="mt-2 space-y-1">
        {tasks.slice(0, 3).map((task) => <li key={task.id} className="flex min-w-0 items-center gap-3">
          <span className="min-w-0 flex-1 truncate text-xs text-muted">{task.title}</span>
          <button type="button" disabled={busy} onClick={() => onRestore(task)} className="btn-ghost shrink-0" aria-label={`撤销删除：${task.title}`}><RotateCcw size={13} />撤销</button>
        </li>)}
      </ul>
      <Link href="/tasks/deleted" className="mt-2 inline-block text-xs font-medium text-accent hover:underline">{tasks.length > 3 ? `查看全部最近删除（本次 ${tasks.length} 项）` : "查看最近删除"}</Link>
    </section>
  );
}
