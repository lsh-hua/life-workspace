"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowUpRight, CalendarDays, CheckSquare, Lightbulb, PenLine, Search, SearchX, X } from "lucide-react";
import { api } from "@/lib/api";

type Result = {
  tasks: { id: number; title: string }[];
  events: { id: number; title: string; date: string }[];
  inspirations: { id: number; content: string }[];
  reviews: { id: number; date: string; summary: string | null }[];
};

const GROUPS = [
  { key: "tasks", label: "任务", href: "/today", icon: CheckSquare },
  { key: "events", label: "日程", href: "/calendar", icon: CalendarDays },
  { key: "inspirations", label: "灵感", href: "/inspiration", icon: Lightbulb },
  { key: "reviews", label: "复盘", href: "/review", icon: PenLine },
] as const;

type SearchResponse = { query: string; result: Result | null; error: boolean };

export default function SearchDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return open ? <SearchContent onClose={onClose} /> : null;
}

function SearchContent({ onClose }: { onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [response, setResponse] = useState<SearchResponse | null>(null);
  const [reload, setReload] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const router = useRouter();
  const term = query.trim();
  const current = response?.query === term ? response : null;
  const result = current?.result ?? null;
  const loading = !!term && !current;
  const total = result ? GROUPS.reduce((count, group) => count + result[group.key].length, 0) : 0;

  useEffect(() => {
    const previous = document.activeElement;
    const dialog = dialogRef.current;
    dialog?.showModal();
    inputRef.current?.focus();
    return () => {
      dialog?.close();
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
    };
  }, []);

  useEffect(() => {
    if (!term) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      api<Result>(`/api/search?q=${encodeURIComponent(term)}`, { signal: controller.signal })
        .then((result) => { if (!controller.signal.aborted) setResponse({ query: term, result, error: false }); })
        .catch(() => { if (!controller.signal.aborted) setResponse({ query: term, result: null, error: true }); });
    }, 200);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [term, reload]);

  function go(href: string) {
    onClose();
    router.push(href);
  }

  function resultLabel(item: Result[keyof Result][number]) {
    if ("title" in item) return item.title;
    if ("content" in item) return item.content;
    return item.summary || `${item.date} 的复盘`;
  }

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="global-search-title"
      aria-describedby="global-search-help"
      className="fixed inset-x-4 top-[10dvh] m-0 mx-auto w-auto max-w-xl overflow-hidden rounded-2xl border border-line bg-surface p-0 text-ink shadow-2xl backdrop:bg-overlay"
      onCancel={(event) => { event.preventDefault(); onClose(); }}
      onKeyDown={(event) => {
        if (event.key !== "Tab") return;
        const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>("button:not(:disabled), input:not(:disabled), a[href], [tabindex]:not([tabindex='-1'])"))
          .filter((element) => element.getClientRects().length > 0);
        const first = controls[0];
        const last = controls[controls.length - 1];
        if (event.shiftKey ? document.activeElement === first : document.activeElement === last) {
          event.preventDefault();
          (event.shiftKey ? last : first)?.focus();
        }
      }}
      onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}
    >
      <div className="border-b border-line px-5 pb-4 pt-5 sm:px-6">
        <div className="mb-4 flex items-center justify-between gap-4">
          <h2 id="global-search-title" className="text-base font-semibold">全局搜索</h2>
          <button type="button" onClick={onClose} aria-label="关闭搜索" className="btn-ghost px-2"><X size={16} /></button>
        </div>
        <label htmlFor="global-search-input" className="mb-2 block text-xs font-medium text-muted">搜索任务、日程、灵感或复盘</label>
        <div className="flex items-center gap-2 rounded-lg border border-line bg-bg px-3 focus-within:border-accent">
          <Search size={17} className="shrink-0 text-muted" aria-hidden="true" />
          <input
            id="global-search-input"
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                dialogRef.current?.querySelector<HTMLButtonElement>("[data-search-result]")?.focus();
              }
            }}
            placeholder="输入关键词"
            autoComplete="off"
            className="h-11 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-faint"
          />
        </div>
      </div>

      <div className="max-h-[55dvh] min-h-40 overflow-y-auto px-3 py-3" aria-live="polite" aria-busy={loading}>
        {!term && <div className="px-5 py-8 text-center text-sm leading-6 text-muted">输入内容，查找工作台中的记录。</div>}
        {loading && (
          <div role="status" aria-label="正在搜索" className="space-y-3 px-3 py-4 motion-safe:animate-pulse">
            <div className="h-4 w-20 rounded bg-line" />
            <div className="h-10 rounded-lg bg-bg" />
            <div className="h-10 rounded-lg bg-bg" />
          </div>
        )}
        {current?.error && (
          <div role="alert" className="px-5 py-7 text-center">
            <p className="text-sm text-muted">搜索暂时不可用，请重试。</p>
            <button type="button" onClick={() => { setResponse(null); setReload((value) => value + 1); }} className="btn-ghost mt-4">重新搜索</button>
          </div>
        )}
        {result && total === 0 && (
          <div className="px-5 py-7 text-center">
            <SearchX size={24} className="mx-auto mb-3 text-muted" aria-hidden="true" />
            <p className="text-sm font-medium">没有找到相关记录</p>
            <p className="mt-1 text-xs leading-6 text-muted">试试更短的关键词，或换一种说法。</p>
          </div>
        )}
        {result && GROUPS.map(({ key, label, href, icon: Icon }) => {
          const items = result[key];
          if (!items.length) return null;
          return (
            <section key={key} aria-label={label} className="mb-3 last:mb-0">
              <h3 className="flex items-center gap-2 px-3 py-2 text-xs font-medium text-muted"><Icon size={14} />{label}<span className="tnum">{items.length}</span></h3>
              {items.map((item) => (
                <button key={`${key}-${item.id}`} type="button" data-search-result onClick={() => go(href)} className="group flex min-h-11 w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left hover:bg-bg">
                  <span className="min-w-0 flex-1">
                    <span className="line-clamp-2 break-words text-sm leading-6">{resultLabel(item)}</span>
                    {"date" in item && <span className="mt-0.5 block text-xs text-muted tnum">{item.date}</span>}
                  </span>
                  <ArrowUpRight size={15} className="shrink-0 text-faint group-hover:text-accent" aria-hidden="true" />
                </button>
              ))}
            </section>
          );
        })}
      </div>
      <p id="global-search-help" className="border-t border-line px-5 py-3 text-xs text-muted sm:px-6">使用 Tab 选择结果，回车打开；按 Esc 关闭。</p>
    </dialog>
  );
}
