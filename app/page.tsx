"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import type { Event, Habit, HabitLog, Inspiration, Task } from "@/db/schema";
import { CheckCircle2, Circle, Flame, Plus } from "lucide-react";
import { todayStr } from "@/lib/dates";

type Overview = {
  today: { total: number; done: number; tasks: Task[] };
  week: { total: number; done: number };
  todayEvents: Event[];
  reviewWritten: boolean;
  inspirations: Inspiration[];
  streak: number;
};

type HabitsData = { habits: Habit[]; logs: HabitLog[]; today: string };

function greeting() {
  const h = new Date().getHours();
  if (h < 6) return "夜深了";
  if (h < 12) return "早上好";
  if (h < 18) return "下午好";
  return "晚上好";
}

function ProgressRing({ done, total }: { done: number; total: number }) {
  const pct = total ? done / total : 0;
  const r = 26;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative h-16 w-16">
      <svg viewBox="0 0 64 64" className="h-16 w-16 -rotate-90">
        <circle cx="32" cy="32" r={r} fill="none" stroke="#e4e4e7" strokeWidth="5" />
        <circle
          cx="32" cy="32" r={r} fill="none" stroke="#18181b" strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct)}
          className="transition-all duration-500"
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-xs font-medium">
        {Math.round(pct * 100)}%
      </span>
    </div>
  );
}

export default function OverviewPage() {
  const [data, setData] = useState<Overview | null>(null);
  const [habits, setHabits] = useState<HabitsData | null>(null);
  const [quickTask, setQuickTask] = useState("");
  const [quickNote, setQuickNote] = useState("");

  const load = useCallback(async () => {
    const [o, h] = await Promise.all([
      api<Overview>("/api/overview"),
      api<HabitsData>("/api/habits"),
    ]);
    setData(o);
    setHabits(h);
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const toggleHabit = async (h: Habit) => {
    await api(`/api/habits/${h.id}`, { method: "POST", json: { action: "toggle" } });
    load();
  };

  const toggle = async (t: Task) => {
    await api(`/api/tasks/${t.id}`, {
      method: "PATCH",
      json: { status: t.status === "done" ? "todo" : "done" },
    });
    load();
  };

  const addQuickTask = async () => {
    if (!quickTask.trim()) return;
    await api("/api/tasks", {
      method: "POST",
      json: { title: quickTask.trim(), dueDate: todayStr(), isToday: 1 },
    });
    setQuickTask("");
    load();
  };

  const addQuickNote = async () => {
    if (!quickNote.trim()) return;
    await api("/api/inspirations", { method: "POST", json: { content: quickNote.trim() } });
    setQuickNote("");
    load();
  };

  if (!data) {
    return <div className="px-6 py-8 text-sm text-faint">加载中…</div>;
  }

  const todayTasks = data.today.tasks.filter((t) => t.status !== "done").slice(0, 5);

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">{greeting()}</h1>
        <p className="mt-1 text-sm text-muted tnum">
          {new Date().getMonth() + 1}月{new Date().getDate()}日 · 周
          {"日一二三四五六"[new Date().getDay()]}
          {data.streak > 0 && (
            <span className="ml-2 inline-flex items-center gap-1 text-muted">
              <Flame size={13} /> 已连续复盘 {data.streak} 天
            </span>
          )}
        </p>
      </header>

      {/* 概览卡片 */}
      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Link href="/today" className="card card-hover flex items-center gap-4 p-5">
          <ProgressRing done={data.today.done} total={data.today.total} />
          <div>
            <div className="text-sm font-medium">今日待办</div>
            <div className="mt-0.5 text-xs text-muted tnum">
              {data.today.done}/{data.today.total} 已完成
            </div>
          </div>
        </Link>
        <Link href="/week" className="card card-hover flex items-center gap-4 p-5">
          <ProgressRing done={data.week.done} total={data.week.total} />
          <div>
            <div className="text-sm font-medium">本周任务</div>
            <div className="mt-0.5 text-xs text-muted tnum">
              {data.week.done}/{data.week.total} 已完成
            </div>
          </div>
        </Link>
        <Link href="/review" className="card card-hover flex items-center gap-4 p-5">
          <span className={`flex h-16 w-16 items-center justify-center rounded-full ${data.reviewWritten ? "bg-ink text-white" : "bg-bg text-faint"}`}>
            <CheckCircle2 size={24} strokeWidth={1.6} />
          </span>
          <div>
            <div className="text-sm font-medium">今日复盘</div>
            <div className="mt-0.5 text-xs text-muted">{data.reviewWritten ? "已完成" : "还没写，去写 →"}</div>
          </div>
        </Link>
      </div>

      {/* 快速记录 */}
      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex items-center gap-2 rounded-xl border border-line bg-surface px-4 py-2.5 focus-within:border-faint">
          <Plus size={15} className="shrink-0 text-faint" />
          <input
            value={quickTask}
            onChange={(e) => setQuickTask(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addQuickTask()}
            placeholder="快速加一条今日任务…"
            className="h-7 flex-1 bg-transparent text-sm outline-none placeholder:text-faint"
          />
        </div>
        <div className="flex items-center gap-2 rounded-xl border border-line bg-surface px-4 py-2.5 focus-within:border-faint">
          <Plus size={15} className="shrink-0 text-faint" />
          <input
            value={quickNote}
            onChange={(e) => setQuickNote(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addQuickNote()}
            placeholder="快速记一条灵感…"
            className="h-7 flex-1 bg-transparent text-sm outline-none placeholder:text-faint"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {/* 今日时间线 */}
        <section className="card p-5">
          <h2 className="mb-3 text-sm font-semibold">今日安排</h2>
          {data.todayEvents.length === 0 && todayTasks.length === 0 && (
            <p className="py-4 text-xs text-faint">今天没有日程和待办</p>
          )}
          <div className="space-y-1.5">
            {data.todayEvents.map((e) => (
              <div key={e.id} className="flex items-center gap-2 text-sm">
                <span className="w-10 shrink-0 text-xs text-faint tnum">{e.startTime ?? "全天"}</span>
                <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: e.color ?? "#6366f1" }} />
                <span className="truncate">{e.title}</span>
              </div>
            ))}
            {todayTasks.map((t) => (
              <button key={t.id} onClick={() => toggle(t)} className="flex w-full items-center gap-2 text-left text-sm">
                <Circle size={13} className="shrink-0 text-faint" />
                <span className="truncate">{t.title}</span>
              </button>
            ))}
          </div>
        </section>

        {/* 最新灵感 */}
        <section className="card p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold">最新灵感</h2>
            <Link href="/inspiration" className="text-xs text-faint hover:text-ink">全部 →</Link>
          </div>
          {data.inspirations.length === 0 && <p className="py-4 text-xs text-faint">暂无灵感</p>}
          <div className="space-y-2">
            {data.inspirations.map((i) => (
              <p key={i.id} className="truncate rounded-lg bg-bg px-3 py-2 text-xs text-muted">
                {i.content}
              </p>
            ))}
          </div>
        </section>

        {/* 习惯打卡 */}
        <section className="card p-5 md:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold">习惯打卡</h2>
            <Link href="/habits" className="text-xs text-faint hover:text-ink">全部 →</Link>
          </div>
          {!habits || habits.habits.length === 0 ? (
            <p className="py-4 text-xs text-faint">还没有习惯，去「习惯打卡」页创建一个</p>
          ) : (
            <div className="space-y-1">
              {habits.habits.map((h) => {
                const done = habits.logs.some((l) => l.habitId === h.id && l.date === habits.today);
                return (
                  <button
                    key={h.id}
                    onClick={() => toggleHabit(h)}
                    className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-sm hover:bg-bg"
                  >
                    {done ? (
                      <CheckCircle2 size={16} className="shrink-0 text-ink" />
                    ) : (
                      <Circle size={16} className="shrink-0 text-faint" />
                    )}
                    <span className={done ? "text-faint line-through" : ""}>{h.name}</span>
                    {h.icon && <span className="ml-auto shrink-0 text-sm">{h.icon}</span>}
                  </button>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
