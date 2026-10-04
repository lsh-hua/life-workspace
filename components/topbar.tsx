"use client";

import { Search } from "lucide-react";
import { useEffect, useState } from "react";
import SearchDialog from "./search-dialog";

export default function Topbar() {
  const [open, setOpen] = useState(false);
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const dateLabel = now
    ? `${now.getMonth() + 1}月${now.getDate()}日 周${"日一二三四五六"[now.getDay()]}`
    : "";

  return (
    <header className="flex h-14 shrink-0 items-center border-b border-line bg-surface px-5">
      <button
        onClick={() => setOpen(true)}
        className="mx-auto flex w-full max-w-md items-center gap-2 rounded-lg border border-line bg-bg px-3.5 py-2 text-sm text-faint transition-colors hover:border-faint"
      >
        <Search size={15} />
        <span className="flex-1 text-left">搜索任务、灵感、复盘、日程…</span>
        <kbd className="rounded border border-line bg-surface px-1.5 py-0.5 text-[10px] text-faint">
          Ctrl K
        </kbd>
      </button>
      <div className="ml-auto pl-4 text-sm text-muted">{dateLabel}</div>
      <SearchDialog open={open} onClose={() => setOpen(false)} />
    </header>
  );
}
