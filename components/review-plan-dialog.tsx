"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { addDays, format, parseISO } from "date-fns";
import { X } from "lucide-react";
import { api } from "@/lib/api";
import { recordDate } from "@/lib/record-links";
import { reviewOriginKey, reviewTaskLines } from "@/lib/review-planning";

type PlanResult = { status: "saved" | "deleted" | "error"; message: string; taskId?: number };
type PlanRow = { title: string; selected: boolean; result: PlanResult | null };

export default function ReviewPlanDialog({ reviewDate, text, onClose }: { reviewDate: string; text: string; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [rows, setRows] = useState<PlanRow[]>(() => reviewTaskLines(text).map((title) => ({ title, selected: true, result: null })));
  const [date, setDate] = useState(() => format(addDays(parseISO(reviewDate), 1), "yyyy-MM-dd"));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pending = rows.filter((row) => row.selected && (!row.result || row.result.status === "error"));

  useEffect(() => {
    const previous = document.activeElement;
    const element = dialog.current;
    element?.showModal();
    element?.querySelector<HTMLInputElement>("input:not(:disabled)")?.focus();
    return () => {
      element?.close();
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
    };
  }, []);

  const save = async () => {
    if (busy || pending.length === 0) return;
    if (!recordDate(date)) { setError("请选择有效的计划日期。"); return; }
    setBusy(true);
    setError("");
    let changed = false;
    for (const row of pending) {
      let result: PlanResult;
      try {
        const originKey = await reviewOriginKey(reviewDate, row.title);
        const task = await api<{ id: number; deletedAt: string | null; plannedDate: string | null }>("/api/tasks", {
          method: "POST", json: { title: row.title, plannedDate: date, source: "review", originKey },
        });
        result = task.deletedAt
          ? { status: "deleted", message: "原计划在最近删除中，可打开任务后恢复。", taskId: task.id }
          : { status: "saved", message: `已确认计划${task.plannedDate ? `：${task.plannedDate}` : ""}`, taskId: task.id };
        changed = true;
      } catch {
        result = { status: "error", message: "此项未能确认，请重试；重复请求会保留同一条任务。" };
      }
      setRows((current) => current.map((item) => item.title === row.title ? { ...item, result } : item));
    }
    if (changed) window.dispatchEvent(new Event("workbench:records-changed"));
    setBusy(false);
  };

  return <dialog ref={dialog} aria-labelledby="review-plan-title" aria-describedby="review-plan-help"
    className="fixed inset-x-4 top-[10dvh] m-0 mx-auto max-h-[80dvh] w-auto max-w-xl overflow-y-auto rounded-2xl border border-line bg-surface p-5 text-ink shadow-2xl backdrop:bg-overlay sm:p-6"
    onCancel={(event) => { event.preventDefault(); if (!busy) onClose(); }}>
    <div className="mb-3 flex items-center justify-between gap-3">
      <h2 id="review-plan-title" className="text-base font-semibold">加入明日计划</h2>
      <button type="button" disabled={busy} onClick={onClose} aria-label="关闭明日计划" className="btn-ghost px-2"><X size={16} /></button>
    </div>
    <p id="review-plan-help" className="mb-5 text-sm leading-6 text-muted">已按行整理并合并重复项。勾选需要行动的内容，再确认计划日期；任务截止日期可在任务详情中另行设置。</p>
    <label htmlFor="review-plan-date" className="mb-2 block text-xs font-medium text-muted">计划日期</label>
    <input id="review-plan-date" type="date" value={date} disabled={busy} onChange={(event) => setDate(event.target.value)} className="input mb-5" />
    <div className="space-y-3">
      {rows.map((row, index) => <div key={row.title} className="rounded-xl border border-line p-3">
        <label className="flex items-start gap-3 text-sm leading-6">
          <input type="checkbox" checked={row.selected} disabled={busy || row.result?.status === "saved" || row.result?.status === "deleted"}
            onChange={(event) => setRows((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, selected: event.target.checked } : item))} className="mt-1 size-4 shrink-0 accent-accent" />
          <span className="min-w-0 break-words">{row.title}</span>
        </label>
        {row.result && <p role="status" className={`mt-2 text-xs leading-6 ${row.result.status === "error" ? "text-danger" : "text-muted"}`}>
          {row.result.message}{row.result.taskId && <Link href={`/tasks/${row.result.taskId}`} className="ml-2 underline underline-offset-4">查看任务</Link>}
        </p>}
      </div>)}
      {rows.length === 0 && <p className="rounded-xl bg-bg p-4 text-sm text-muted">还没有可加入计划的内容，请先写下明天要做的事。</p>}
    </div>
    {error && <p role="alert" className="mt-4 text-sm text-danger">{error}</p>}
    <div className="mt-6 flex flex-wrap justify-end gap-2">
      <button type="button" disabled={busy} onClick={onClose} className="btn-ghost">{pending.length ? "稍后处理" : "完成"}</button>
      <button type="button" disabled={busy || pending.length === 0} onClick={() => { void save(); }} className="btn-primary">{busy ? "正在逐项确认…" : `确认 ${pending.length} 项计划`}</button>
    </div>
  </dialog>;
}
