"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { Task } from "@/db/schema";
import { api } from "@/lib/api";

export default function ReviewFocusTask({ taskId, disabled, onAppend }: { taskId: number; disabled: boolean; onAppend: (title: string) => boolean }) {
  const [result, setResult] = useState<{ task: Task | null; error: string } | null>(null);
  const [reload, setReload] = useState(0);
  const [notice, setNotice] = useState("");
  const card = useRef<HTMLElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    api<Task>(`/api/tasks/${taskId}`, { signal: controller.signal })
      .then((task) => { if (!controller.signal.aborted) setResult({ task, error: "" }); })
      .catch(() => { if (!controller.signal.aborted) setResult({ task: null, error: "关联任务读取失败，记录可能已不存在。" }); });
    return () => controller.abort();
  }, [taskId, reload]);

  useEffect(() => {
    if (!result) return;
    card.current?.focus({ preventScroll: true });
    card.current?.scrollIntoView({ behavior: "auto", block: "nearest" });
  }, [result]);

  return <section ref={card} tabIndex={-1} aria-label="专注关联任务" className="card mb-5 scroll-mt-5 p-4 focus:outline-none">
    <h2 className="mb-2 text-sm font-semibold">记录这次专注的阻碍</h2>
    {!result ? <p role="status" className="text-sm text-muted">正在读取关联任务…</p> : result.error ? <div className="flex flex-wrap items-center gap-3">
      <p role="alert" className="text-sm text-danger">{result.error}</p><button type="button" className="btn-ghost" onClick={() => setReload((value) => value + 1)}>重新读取</button>
    </div> : result.task && <>
      <p className="break-words text-sm leading-6">{result.task.title}</p>
      {result.task.deletedAt ? <p className="mt-2 text-xs text-muted">任务已在最近删除中，可先打开任务恢复。</p> : <button type="button" disabled={disabled} className="btn-ghost mt-3" onClick={() => {
        setNotice(onAppend(result.task!.title) ? "已追加到今日问题记录，可继续补充阻碍。" : "今日问题记录中已包含这条专注任务。");
      }}>将任务加入今日问题记录</button>}
      <Link href={`/tasks/${result.task.id}`} className="ml-3 inline-flex py-2 text-xs text-muted underline underline-offset-4">查看任务</Link>
      {notice && <p role="status" className="mt-2 text-xs leading-6 text-muted">{notice}</p>}
    </>}
  </section>;
}
