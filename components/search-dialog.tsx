"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { Search } from "lucide-react";

type Result = {
  tasks: { id: number; title: string }[];
  events: { id: number; title: string; date: string }[];
  inspirations: { id: number; content: string }[];
  reviews: { id: number; date: string; summary: string | null }[];
};

const GROUPS: { key: keyof Result; label: string; href: string }[] = [
  { key: "tasks", label: "任务", href: "/today" },
  { key: "events", label: "日程", href: "/calendar" },
  { key: "inspirations", label: "灵感", href: "/inspiration" },
  { key: "reviews", label: "复盘", href: "/review" },
];

export default function SearchDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  useEffect(() => {
    if (open) {
      setQ("");
      setResult(null);
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open]);

  useEffect(() => {
    if (!q.trim()) {
      setResult(null);
      return;
    }
    const t = setTimeout(async () => {
      const data = await api<Result>(`/api/search?q=${encodeURIComponent(q.trim())}`);
      setResult(data);
    }, 200);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    if (open) window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const go = (href: string) => {
    onClose();
    router.push(href);
  };

  const hasAny =
    result && GROUPS.some((g) => (result[g.key] as unknown[]).length > 0);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/20 pt-[15vh]"
      onClick={onClose}
    >
      <div
        className="anim-fade-up w-full max-w-lg overflow-hidden rounded-xl border border-line bg-surface shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-line px-4">
          <Search size={16} className="text-faint" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="输入关键词搜索…"
            className="h-12 flex-1 bg-transparent text-sm outline-none placeholder:text-faint"
          />
        </div>
        <div className="max-h-[50vh] overflow-y-auto p-2">
          {result && !hasAny && (
            <div className="px-3 py-8 text-center text-sm text-faint">没有找到相关内容</div>
          )}
          {result &&
            GROUPS.map((g) => {
              const items = result[g.key];
              if (!items.length) return null;
              const label = (item: (typeof items)[number]): string => {
                switch (g.key) {
                  case "tasks":
                  case "events":
                    return (item as Result["tasks"][number]).title;
                  case "inspirations":
                    return (item as Result["inspirations"][number]).content;
                  case "reviews": {
                    const r = item as Result["reviews"][number];
                    return `${r.date} ${r.summary ?? ""}`;
                  }
                }
              };
              return (
                <div key={g.key} className="mb-1">
                  <div className="px-3 py-1.5 text-[11px] font-medium text-faint">{g.label}</div>
                  {items.map((item) => (
                    <button
                      key={`${g.key}-${item.id}`}
                      onClick={() => go(g.href)}
                      className="block w-full truncate rounded-md px-3 py-2 text-left text-sm text-ink hover:bg-bg"
                    >
                      {label(item)}
                    </button>
                  ))}
                </div>
              );
            })}
          {!result && (
            <div className="px-3 py-8 text-center text-sm text-faint">
              搜索任务、日程、灵感、复盘
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
