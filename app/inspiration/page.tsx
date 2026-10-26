"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { Inspiration } from "@/db/schema";
import { ArrowUpRight, Check, Lightbulb, Pin, PinOff, Trash2 } from "lucide-react";
import { EmptyState, PageError, PageHeader, PageLoading } from "@/components/page-header";

function tagsOf(item: Inspiration) {
  return [...new Set(item.tags.split(",").map((tag) => tag.trim()).filter(Boolean))];
}

export default function InspirationPage() {
  const [items, setItems] = useState<Inspiration[] | null>(null);
  const [draft, setDraft] = useState("");
  const [tagDraft, setTagDraft] = useState("");
  const [filter, setFilter] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setItems(await api<Inspiration[]>("/api/inspirations"));
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    api<Inspiration[]>("/api/inspirations", { signal: controller.signal }).then(setItems).catch(() => {
      if (!controller.signal.aborted) setError("灵感读取失败，请重新加载。");
    });
    return () => controller.abort();
  }, []);

  const refresh = async () => {
    setError("");
    try { await load(); } catch { setError("灵感读取失败，请重新加载。"); }
  };

  const perform = async (action: () => Promise<unknown>, failure: string) => {
    if (busy) return false;
    setBusy(true);
    setError("");
    setNotice("");
    try { await action(); await refresh(); return true; }
    catch { setError(failure); return false; }
    finally { setBusy(false); }
  };

  const add = async () => {
    const content = draft.trim();
    if (!content) return;
    const saved = await perform(() => api("/api/inspirations", {
      method: "POST", json: { content, tags: tagDraft.trim() },
    }), "灵感未能保存，已保留输入，请重试。");
    if (saved) { setDraft(""); setTagDraft(""); setNotice("灵感已保存。"); }
  };

  const togglePin = (item: Inspiration) => {
    void perform(() => api(`/api/inspirations/${item.id}`, { method: "PATCH", json: { pinned: item.pinned ? 0 : 1 } }), "置顶状态未能保存，请重试。");
  };

  const remove = (item: Inspiration) => {
    void perform(() => api(`/api/inspirations/${item.id}`, { method: "DELETE" }), "灵感未能删除，请重试。");
  };

  const toTask = async (item: Inspiration) => {
    const saved = await perform(() => api(`/api/inspirations/${item.id}`, { method: "POST", json: { action: "toTask" } }), "未能转为任务，请重试。");
    if (saved) {
      setItems((current) => current?.map((value) => value.id === item.id ? { ...value, converted: 1 } : value) ?? null);
      setNotice("已转为任务，可在任务列表中查看。");
    }
  };

  const allTags = [...new Set((items ?? []).flatMap(tagsOf))];
  const shown = filter ? (items ?? []).filter((item) => tagsOf(item).includes(filter)) : items ?? [];

  return (
    <div className="page-shell">
      <PageHeader title="灵感" description="随手记录，再把值得行动的想法转为任务。" meta={items && <span className="tnum">共 {items.length} 条记录</span>} />

      <form className="card mb-6 p-5" onSubmit={(event) => { event.preventDefault(); void add(); }}>
        <label htmlFor="inspiration-content" className="mb-2 block text-sm font-semibold">记录想法</label>
        <textarea id="inspiration-content" value={draft} onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && (event.metaKey || event.ctrlKey) && !event.nativeEvent.isComposing) {
              event.preventDefault(); void add();
            }
          }}
          placeholder="有什么值得记下来的？" rows={3} required
          className="w-full resize-y rounded-xl border border-line bg-bg px-3 py-2.5 text-sm leading-6 outline-none placeholder:text-faint focus:border-accent" />
        <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-end">
          <div className="min-w-0 flex-1">
            <label htmlFor="inspiration-tags" className="mb-2 block text-xs font-medium text-muted">标签（选填）</label>
            <input id="inspiration-tags" value={tagDraft} onChange={(event) => setTagDraft(event.target.value)} placeholder="多个标签用英文逗号分隔" className="input" />
          </div>
          <div className="flex items-center justify-between gap-4 sm:justify-end">
            <span className="text-xs text-muted">Ctrl / ⌘ + Enter 保存</span>
            <button type="submit" disabled={busy || !draft.trim()} className="btn-primary shrink-0">{busy ? "正在保存…" : "保存灵感"}</button>
          </div>
        </div>
      </form>

      {error && <div className="mb-5"><PageError message={error} onRetry={refresh} /></div>}
      {notice && <p role="status" className="mb-5 flex items-center gap-2 text-sm text-muted"><Check size={15} className="text-accent" />{notice}</p>}

      {allTags.length > 0 && (
        <nav className="mb-5 flex flex-wrap gap-2" aria-label="按标签筛选灵感">
          <button type="button" onClick={() => setFilter("")} aria-pressed={!filter} className={`rounded-lg border px-3 py-2 text-xs ${!filter ? "border-accent/30 bg-accent-soft text-accent" : "border-line bg-surface text-muted hover:text-ink"}`}>全部</button>
          {allTags.map((tag) => <button key={tag} type="button" onClick={() => setFilter(filter === tag ? "" : tag)} aria-pressed={filter === tag}
            className={`max-w-full break-words rounded-lg border px-3 py-2 text-xs ${filter === tag ? "border-accent/30 bg-accent-soft text-accent" : "border-line bg-surface text-muted hover:text-ink"}`}>#{tag}</button>)}
        </nav>
      )}

      {!items && !error ? <PageLoading rows={4} /> : shown.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {shown.map((item) => (
            <article key={item.id} className={`card flex min-w-0 flex-col p-5 ${item.pinned ? "border-accent/35" : ""}`}>
              {!!item.pinned && <p className="mb-3 inline-flex items-center gap-1.5 text-xs font-medium text-accent"><Pin size={12} />已置顶</p>}
              <p className="flex-1 break-words whitespace-pre-wrap text-sm leading-7">{item.content}</p>
              <div className="mt-5 flex flex-wrap gap-2">
                {tagsOf(item).map((tag) => <span key={tag} className="max-w-full break-words rounded-md bg-bg px-2 py-1 text-xs text-muted">#{tag}</span>)}
                {!!item.converted && <span className="inline-flex items-center gap-1 rounded-md bg-accent-soft px-2 py-1 text-xs text-accent"><Check size={12} />已转任务</span>}
              </div>
              <div className="mt-4 flex items-center justify-between gap-2 border-t border-line pt-3">
                {!item.converted ? <button type="button" disabled={busy} onClick={() => { void toTask(item); }} className="btn-ghost"><ArrowUpRight size={14} />转为任务</button> : <span className="text-xs text-muted">已加入待办</span>}
                <div className="flex gap-1">
                  <button type="button" disabled={busy} onClick={() => togglePin(item)} aria-label={item.pinned ? "取消置顶" : "置顶灵感"} title={item.pinned ? "取消置顶" : "置顶灵感"}
                    className="grid min-h-9 w-9 place-items-center rounded-lg text-muted hover:bg-bg hover:text-ink">{item.pinned ? <PinOff size={15} /> : <Pin size={15} />}</button>
                  <button type="button" disabled={busy} onClick={() => remove(item)} aria-label="删除灵感" title="删除灵感" className="grid min-h-9 w-9 place-items-center rounded-lg text-muted hover:bg-bg hover:text-danger"><Trash2 size={15} /></button>
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : items ? <EmptyState title={filter ? "这个标签下没有记录" : "灵感箱还是空的"}
        description={filter ? "切换标签，或在上方记录一个新想法。" : "在上方写下想法，后续可以置顶、分类或转成任务。"}
        icon={<Lightbulb size={24} />} action={filter ? <button type="button" onClick={() => setFilter("")} className="btn-ghost">查看全部</button> : undefined} /> : null}
    </div>
  );
}
