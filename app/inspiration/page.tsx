"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { Inspiration } from "@/db/schema";
import { Lightbulb, Pin, PinOff, Trash2, ArrowUpRight } from "lucide-react";

export default function InspirationPage() {
  const [items, setItems] = useState<Inspiration[]>([]);
  const [draft, setDraft] = useState("");
  const [tagDraft, setTagDraft] = useState("");
  const [filter, setFilter] = useState("");

  const load = useCallback(async () => {
    setItems(await api<Inspiration[]>("/api/inspirations"));
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const add = async () => {
    const content = draft.trim();
    if (!content) return;
    await api("/api/inspirations", {
      method: "POST",
      json: { content, tags: tagDraft.trim() },
    });
    setDraft("");
    setTagDraft("");
    load();
  };

  const togglePin = async (it: Inspiration) => {
    await api(`/api/inspirations/${it.id}`, { method: "PATCH", json: { pinned: it.pinned ? 0 : 1 } });
    load();
  };

  const remove = async (it: Inspiration) => {
    await api(`/api/inspirations/${it.id}`, { method: "DELETE" });
    load();
  };

  const toTask = async (it: Inspiration) => {
    await api(`/api/inspirations/${it.id}`, { method: "POST", json: { action: "toTask" } });
    load();
  };

  const allTags = [...new Set(items.flatMap((i) => i.tags.split(",").map((t) => t.trim()).filter(Boolean)))];
  const shown = filter ? items.filter((i) => i.tags.includes(filter)) : items;

  return (
    <div className="mx-auto max-w-2xl px-6 py-8">
      <header className="mb-6">
        <h1 className="text-xl font-semibold tracking-tight">灵感</h1>
        <p className="mt-1 text-sm text-muted">闪念速记，稍后整理</p>
      </header>

      <div className="mb-5 rounded-xl border border-line bg-surface p-3 focus-within:border-faint">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) add();
          }}
          placeholder="记下此刻的想法…（Ctrl+Enter 保存）"
          rows={2}
          className="w-full resize-none bg-transparent px-1 text-sm outline-none placeholder:text-faint"
        />
        <div className="flex items-center gap-2 border-t border-line pt-2">
          <input
            value={tagDraft}
            onChange={(e) => setTagDraft(e.target.value)}
            placeholder="标签（逗号分隔，可空）"
            className="h-7 flex-1 bg-transparent px-1 text-xs outline-none placeholder:text-faint"
          />
          <button
            onClick={add}
            className="rounded-lg bg-ink px-3 py-1.5 text-xs text-white hover:opacity-85"
          >
            保存
          </button>
        </div>
      </div>

      {allTags.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-1.5">
          <button
            onClick={() => setFilter("")}
            className={`rounded-full px-2.5 py-1 text-[11px] ${!filter ? "bg-ink text-white" : "bg-surface text-muted border border-line"}`}
          >
            全部
          </button>
          {allTags.map((t) => (
            <button
              key={t}
              onClick={() => setFilter(filter === t ? "" : t)}
              className={`rounded-full px-2.5 py-1 text-[11px] ${filter === t ? "bg-ink text-white" : "bg-surface text-muted border border-line"}`}
            >
              #{t}
            </button>
          ))}
        </div>
      )}

      <div className="space-y-2">
        {shown.map((it) => (
          <div
            key={it.id}
            className={`group card card-hover p-4 ${
              it.pinned ? "border-ink/30" : "border-line"
            }`}
          >
            <p className="whitespace-pre-wrap text-sm leading-relaxed">{it.content}</p>
            <div className="mt-2.5 flex items-center gap-2">
              {it.tags &&
                it.tags.split(",").filter(Boolean).map((t) => (
                  <span key={t} className="rounded-full bg-bg px-2 py-0.5 text-[11px] text-muted">
                    #{t.trim()}
                  </span>
                ))}
              {!!it.converted && (
                <span className="rounded-full bg-ink/5 px-2 py-0.5 text-[11px] text-faint">已转任务</span>
              )}
              <div className="ml-auto flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                {!it.converted && (
                  <button onClick={() => toTask(it)} title="转为任务" className="rounded p-1.5 text-faint hover:bg-bg hover:text-ink">
                    <ArrowUpRight size={14} />
                  </button>
                )}
                <button onClick={() => togglePin(it)} title={it.pinned ? "取消置顶" : "置顶"} className="rounded p-1.5 text-faint hover:bg-bg hover:text-ink">
                  {it.pinned ? <PinOff size={14} /> : <Pin size={14} />}
                </button>
                <button onClick={() => remove(it)} title="删除" className="rounded p-1.5 text-faint hover:bg-bg hover:text-danger">
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {shown.length === 0 && (
        <div className="rounded-xl border border-dashed border-line py-16 text-center">
          <Lightbulb size={20} className="mx-auto mb-2 text-faint" />
          <p className="text-sm text-faint">还没有灵感，记一条吧</p>
        </div>
      )}
    </div>
  );
}
