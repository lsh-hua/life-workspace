import type { Task } from "@/db/schema";
import Link from "next/link";
import { parseTaskRepeat } from "@/lib/task-repeat";

const FREQUENCIES = { daily: "每天", weekdays: "每个工作日", weekly: "每周", monthly: "每月" };

export function TaskRepeatMeta({ rule }: { rule: string | null }) {
  const repeat = parseTaskRepeat(rule);
  if (!repeat) return null;
  const anchor = new Date(`${repeat.anchorDate}T00:00:00`);
  const scheduleSuffix = { daily: "", weekdays: "", weekly: `（周${"日一二三四五六"[anchor.getDay()]}）`, monthly: `（${anchor.getDate()}日）` };
  const suffix = repeat.basis === "schedule" ? scheduleSuffix[repeat.frequency] : "";
  return <span className="text-muted">{FREQUENCIES[repeat.frequency]}{suffix}重复 · {repeat.basis === "schedule" ? "按原计划" : "按完成日计算"}</span>;
}

export default function TaskScheduleMeta({ task }: { task: Task }) {
  return <>
    {task.plannedDate && <span className="text-muted tnum">计划 {task.plannedDate}</span>}
    {task.dueDate && <span className="text-muted tnum">截止 {task.dueDate}</span>}
    <TaskRepeatMeta rule={task.repeatRule} />
  </>;
}

export function TaskRepeatCompletionNotice({ task }: { task: Task | null }) {
  if (!task || !parseTaskRepeat(task.repeatRule)) return null;
  return <p role="status" className="mb-5 break-words rounded-xl border border-line bg-surface p-4 text-sm leading-6">已完成“{task.title}”，下次任务已安排，本次记录仍保留。<Link href="/tasks" className="ml-2 text-accent hover:underline">查看全部任务</Link></p>;
}
