"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { CheckCircle2, LoaderCircle, X } from "lucide-react";
import { api } from "@/lib/api";

type Draft = { kind: "task" | "inspiration"; text: string; plannedDate: string; dueDate: string; priority: "high" | "medium" | "low"; isToday: boolean };
const EMPTY: Draft = { kind: "task", text: "", plannedDate: "", dueDate: "", priority: "medium", isToday: false };
const KEY = "workbench:quick-add-draft";

function parseDraft(raw: string | null): Draft {
  if (!raw) return { ...EMPTY };
  const value = JSON.parse(raw);
  if (!value || !["task", "inspiration"].includes(value.kind) || typeof value.text !== "string" ||
      typeof value.dueDate !== "string" || (value.plannedDate !== undefined && typeof value.plannedDate !== "string") || !["high", "medium", "low"].includes(value.priority) ||
      typeof value.isToday !== "boolean") throw new Error("草稿格式无效");
  return { ...value, plannedDate: value.plannedDate ?? "" };
}

function draftStorage() {
  const desktop = window.workbench?.quickAdd?.drafts;
  return desktop ?? {
    getItem: () => window.localStorage.getItem(KEY),
    setItem: (value: string) => window.localStorage.setItem(KEY, value),
    removeItem: () => window.localStorage.removeItem(KEY),
  };
}

export default function QuickAddDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [storageNotice, setStorageNotice] = useState("");
  const [draftStored, setDraftStored] = useState(true);
  const [saved, setSaved] = useState<{ title: string; href: string } | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const text = useRef<HTMLTextAreaElement>(null);
  const submitting = useRef(false);
  const canPersist = useRef(true);
  const persistedRaw = useRef<string | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        persistedRaw.current = draftStorage().getItem();
        setDraft(parseDraft(persistedRaw.current));
      }
      catch { canPersist.current = false; setStorageNotice("本机原草稿未能读取，已保留原文件。本次输入请保存成功后再退出应用。"); }
      setReady(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const changed = (event: StorageEvent) => {
      if (event.key !== KEY || event.newValue === persistedRaw.current) return;
      canPersist.current = false;
      setDraftStored(false);
      setStorageNotice("另一个窗口更新了草稿，已保留双方内容。请先保存当前输入，再继续记录。");
    };
    window.addEventListener("storage", changed);
    return () => window.removeEventListener("storage", changed);
  }, []);

  useEffect(() => {
    if (!busy && (draftStored || !draft.text.trim())) return;
    const protect = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", protect);
    return () => window.removeEventListener("beforeunload", protect);
  }, [busy, draftStored, draft.text]);

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement;
    const element = dialog.current;
    element?.showModal();
    text.current?.focus();
    return () => {
      element?.close();
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
    };
  }, [open, ready]);

  function update(patch: Partial<Draft>) {
    const next = { ...draft, ...patch };
    setDraft(next);
    setSaved(null);
    setError("");
    setDraftStored(false);
    if (!canPersist.current) return;
    try {
      const storage = draftStorage();
      if (storage.getItem() !== persistedRaw.current) {
        canPersist.current = false;
        setStorageNotice("另一个窗口更新了草稿，已保留双方内容。请先保存当前输入，再继续记录。");
        return;
      }
      const raw = JSON.stringify(next);
      storage.setItem(raw);
      persistedRaw.current = raw;
      setDraftStored(true);
      setStorageNotice("");
    } catch { setStorageNotice("本机草稿未能保存，输入仍在当前窗口。请提交成功后再退出应用。"); }
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!draft.text.trim() || submitting.current || !ready) return;
    submitting.current = true;
    const submittedRaw = persistedRaw.current;
    setBusy(true);
    setError("");
    try {
      const task = draft.kind === "task";
      const row = await api<{ id: number }>(task ? "/api/tasks" : "/api/inspirations", {
        method: "POST",
        json: task ? { title: draft.text.trim(), plannedDate: draft.plannedDate || null, dueDate: draft.dueDate || null, priority: draft.priority, isToday: draft.isToday ? 1 : 0 }
          : { content: draft.text.trim() },
      });
      setSaved({ title: task ? "任务已保存" : "灵感已保存", href: task ? `/tasks/${row.id}` : `/inspiration?record=${row.id}` });
      setDraft({ ...EMPTY, kind: draft.kind });
      setDraftStored(true);
      if (canPersist.current) {
        try {
          const storage = draftStorage();
          if (storage.getItem() === submittedRaw) {
            storage.removeItem();
            persistedRaw.current = null;
            setStorageNotice("");
          } else {
            canPersist.current = false;
            setStorageNotice("记录已保存，另一个窗口的新草稿仍保留。");
          }
        }
        catch { setStorageNotice("记录已经保存，旧草稿未能清除；下次打开时请核对，避免重复提交。"); }
      }
      window.dispatchEvent(new Event("workbench:records-changed"));
      text.current?.focus();
    } catch {
      setError("保存未完成，输入和草稿仍保留，请重试。");
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  if (!open) return null;

  return (
    <dialog ref={dialog} aria-labelledby="quick-add-title" className="fixed inset-x-4 top-[12dvh] m-0 mx-auto max-h-[80dvh] w-auto max-w-lg overflow-y-auto rounded-2xl border border-line bg-surface p-5 text-ink shadow-2xl backdrop:bg-overlay sm:p-6"
      onCancel={(event) => { event.preventDefault(); if (!busy) onClose(); }}>
      <div className="mb-5 flex items-center justify-between gap-4">
        <h2 id="quick-add-title" className="text-base font-semibold">快速记录</h2>
        <button type="button" onClick={onClose} disabled={busy} aria-label="关闭快速记录" className="btn-ghost px-2"><X size={17} /></button>
      </div>
      {saved && <p role="status" className="mb-4 flex flex-wrap items-center gap-2 text-sm"><CheckCircle2 size={16} className="text-accent" />{saved.title}<Link href={saved.href} onClick={onClose} className="text-accent underline underline-offset-4">查看记录</Link></p>}
      <form onSubmit={save} aria-busy={busy}>
        <fieldset disabled={busy || !ready} className="space-y-4 disabled:opacity-70">
          <div role="group" aria-label="记录类型" className="flex gap-2">
            {(["task", "inspiration"] as const).map((kind) => <button key={kind} type="button" aria-pressed={draft.kind === kind} onClick={() => update({ kind })}
              className={`rounded-lg border px-4 py-2 text-sm ${draft.kind === kind ? "border-accent/40 bg-accent-soft text-accent" : "border-line text-muted"}`}>{kind === "task" ? "任务" : "灵感"}</button>)}
          </div>
          <div>
            <label htmlFor="quick-add-text" className="mb-2 block text-sm font-medium">{draft.kind === "task" ? "要做什么？" : "记下你的想法"}</label>
            <textarea id="quick-add-text" ref={text} value={draft.text} onChange={(event) => update({ text: event.target.value })} rows={3} maxLength={4000} required
              placeholder={draft.kind === "task" ? "先记下一句话，稍后再安排" : "想法、摘录或待研究的问题"}
              onKeyDown={(event) => { if (event.key === "Enter" && (event.ctrlKey || event.metaKey) && !event.nativeEvent.isComposing) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }}
              className="input min-h-28 w-full resize-y leading-6" />
          </div>
          {draft.kind === "task" && <>
            <div className="grid grid-cols-2 gap-3">
              <div><label htmlFor="quick-add-planned" className="mb-2 block text-xs text-muted">计划日期（选填）</label><input id="quick-add-planned" type="date" value={draft.plannedDate} onChange={(event) => update({ plannedDate: event.target.value })} className="input" /></div>
              <div><label htmlFor="quick-add-date" className="mb-2 block text-xs text-muted">截止日期（选填）</label><input id="quick-add-date" type="date" value={draft.dueDate} onChange={(event) => update({ dueDate: event.target.value })} className="input" /></div>
            </div>
            <div><label htmlFor="quick-add-priority" className="mb-2 block text-xs text-muted">优先级</label><select id="quick-add-priority" value={draft.priority} onChange={(event) => update({ priority: event.target.value as Draft["priority"] })} className="input"><option value="high">高</option><option value="medium">中</option><option value="low">低</option></select></div>
            <label className="flex min-h-10 items-center gap-2 text-sm"><input type="checkbox" checked={draft.isToday} onChange={(event) => update({ isToday: event.target.checked })} />加入今日待办</label>
            <p className="text-xs leading-5 text-muted">暂未安排日期的任务，可在“全部任务”中继续整理。</p>
          </>}
        </fieldset>
        {storageNotice && <p role="status" className="mt-3 text-xs leading-5 text-danger">{storageNotice}</p>}
        {error && <p role="alert" className="mt-3 text-sm text-danger">{error}</p>}
        <div className="mt-5 flex items-center justify-between gap-4 border-t border-line pt-4">
          <span className="text-xs text-muted">Ctrl / ⌘ + Enter 保存</span>
          <button type="submit" disabled={!ready || busy || !draft.text.trim()} className="btn-primary whitespace-nowrap">{busy && <LoaderCircle size={14} className="animate-spin motion-reduce:animate-none" />}{busy ? "正在保存…" : "保存记录"}</button>
        </div>
      </form>
    </dialog>
  );
}
