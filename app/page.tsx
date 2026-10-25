"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  CalendarClock,
  Check,
  CheckCircle2,
  Circle,
  Flame,
  Lightbulb,
  ListChecks,
  Plus,
  RotateCcw,
} from "lucide-react";
import { api } from "@/lib/api";
import type { Event, Habit, HabitLog, Inspiration, Task } from "@/db/schema";
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

async function fetchDashboard() {
  return Promise.all([
    api<Overview>("/api/overview"),
    api<HabitsData>("/api/habits"),
  ]);
}

function greeting() {
  const hour = new Date().getHours();
  if (hour < 6) return "夜深了";
  if (hour < 12) return "早上好";
  if (hour < 18) return "下午好";
  return "晚上好";
}

function completion(done: number, total: number) {
  return total ? Math.round((done / total) * 100) : 0;
}

function ProgressRing({ done, total, label }: { done: number; total: number; label: string }) {
  const percent = completion(done, total);
  const radius = 38;
  const circumference = 2 * Math.PI * radius;

  return (
    <div
      className="relative grid h-24 w-24 shrink-0 place-items-center text-ink"
      role="img"
      aria-label={`${label}完成度 ${percent}%`}
    >
      <svg viewBox="0 0 96 96" className="absolute inset-0 -rotate-90" aria-hidden="true">
        <circle cx="48" cy="48" r={radius} fill="none" stroke="var(--color-line)" strokeWidth="5" />
        <circle
          cx="48"
          cy="48"
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - percent / 100)}
          className="transition-[stroke-dashoffset] duration-500"
        />
      </svg>
      <span className="tnum text-xl font-semibold tracking-tight">{percent}%</span>
    </div>
  );
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-28 place-items-center rounded-xl border border-dashed border-line px-5 text-center text-sm text-faint">
      {children}
    </div>
  );
}

export default function OverviewPage() {
  const [data, setData] = useState<Overview | null>(null);
  const [habits, setHabits] = useState<HabitsData | null>(null);
  const [quickTask, setQuickTask] = useState("");
  const [quickNote, setQuickNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<"task" | "note" | null>(null);

  const load = useCallback(async () => {
    try {
      const [overview, habitsData] = await fetchDashboard();
      setError(null);
      setData(overview);
      setHabits(habitsData);
    } catch {
      setError("暂时无法读取工作台数据，请稍后重试。");
    }
  }, []);

  useEffect(() => {
    let active = true;
    fetchDashboard()
      .then(([overview, habitsData]) => {
        if (!active) return;
        setData(overview);
        setHabits(habitsData);
      })
      .catch(() => {
        if (active) setError("暂时无法读取工作台数据，请稍后重试。");
      });
    return () => {
      active = false;
    };
  }, []);

  const toggleHabit = async (habit: Habit) => {
    await api(`/api/habits/${habit.id}`, { method: "POST", json: { action: "toggle" } });
    load();
  };

  const toggleTask = async (task: Task) => {
    await api(`/api/tasks/${task.id}`, {
      method: "PATCH",
      json: { status: task.status === "done" ? "todo" : "done" },
    });
    load();
  };

  const addQuickTask = async (event: FormEvent) => {
    event.preventDefault();
    if (!quickTask.trim() || submitting) return;
    setSubmitting("task");
    try {
      await api("/api/tasks", {
        method: "POST",
        json: { title: quickTask.trim(), dueDate: todayStr(), isToday: 1 },
      });
      setQuickTask("");
      await load();
    } finally {
      setSubmitting(null);
    }
  };

  const addQuickNote = async (event: FormEvent) => {
    event.preventDefault();
    if (!quickNote.trim() || submitting) return;
    setSubmitting("note");
    try {
      await api("/api/inspirations", {
        method: "POST",
        json: { content: quickNote.trim() },
      });
      setQuickNote("");
      await load();
    } finally {
      setSubmitting(null);
    }
  };

  if (error) {
    return (
      <div className="grid min-h-full place-items-center px-6 py-12">
        <div className="max-w-sm text-center">
          <p className="text-base font-medium">数据没有加载成功</p>
          <p className="mt-2 text-sm leading-6 text-muted">{error}</p>
          <button type="button" onClick={load} className="btn-primary mt-5">
            <RotateCcw size={14} />
            重新加载
          </button>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="mx-auto w-full max-w-6xl px-5 py-8 sm:px-8 lg:px-10" aria-busy="true">
        <div className="h-7 w-32 animate-pulse rounded-lg bg-line" />
        <div className="mt-3 h-4 w-64 animate-pulse rounded bg-line" />
        <div className="mt-10 grid gap-5 lg:grid-cols-[minmax(0,1.55fr)_minmax(17rem,.75fr)]">
          <div className="h-96 animate-pulse rounded-2xl bg-surface" />
          <div className="h-96 animate-pulse rounded-2xl bg-surface" />
        </div>
        <span className="sr-only">正在加载工作台</span>
      </div>
    );
  }

  const now = new Date();
  const todayTasks = data.today.tasks.filter((task) => task.status !== "done").slice(0, 5);
  const habitsDone = habits?.habits.filter((habit) =>
    habits.logs.some((log) => log.habitId === habit.id && log.date === habits.today),
  ).length ?? 0;

  return (
    <div className="overview-page min-h-full">
      <div className="mx-auto w-full max-w-6xl px-5 py-7 sm:px-8 sm:py-9 lg:px-10 lg:py-10">
        <header className="anim-fade-up flex flex-col gap-5 border-b border-line pb-7 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="mb-2 text-sm text-muted tnum">
              {now.getMonth() + 1}月{now.getDate()}日 · 周{"日一二三四五六"[now.getDay()]}
            </p>
            <h1 className="text-3xl font-semibold tracking-[-0.035em] sm:text-4xl">{greeting()}</h1>
            <p className="mt-2 max-w-xl text-sm leading-6 text-muted">先看清今天，再决定下一步。重要的事留在视线里，其余交给系统。</p>
          </div>
          {data.streak > 0 && (
            <div className="inline-flex w-fit items-center gap-2 rounded-full border border-line bg-surface px-3 py-2 text-xs text-muted">
              <Flame size={14} className="text-accent" aria-hidden="true" />
              <span>连续复盘</span>
              <strong className="tnum font-semibold text-ink">{data.streak} 天</strong>
            </div>
          )}
        </header>

        <main className="mt-7 space-y-8">
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1.55fr)_minmax(17rem,.75fr)]">
            <section className="focus-panel anim-fade-up overflow-hidden rounded-2xl border border-ink bg-ink text-white [animation-delay:40ms]">
              <div className="flex flex-col gap-7 p-6 sm:p-8">
                <div className="flex items-start justify-between gap-5">
                  <div>
                    <p className="text-xs font-medium text-white/55">今日主线</p>
                    <h2 className="mt-2 text-2xl font-semibold tracking-tight">把今天收束成几件事</h2>
                  </div>
                  <div className="tnum text-right">
                    <strong className="block text-3xl font-semibold">{data.today.done}</strong>
                    <span className="text-xs text-white/50">已完成 / {data.today.total}</span>
                  </div>
                </div>

                <div className="min-h-44">
                  {todayTasks.length === 0 ? (
                    <div className="grid min-h-44 place-items-center rounded-xl border border-white/15 bg-white/[0.04] px-6 text-center">
                      <div>
                        <Check size={22} className="mx-auto text-white/70" />
                        <p className="mt-3 text-sm text-white/75">今天的待办已经清空</p>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-1">
                      {todayTasks.map((task, index) => (
                        <button
                          key={task.id}
                          type="button"
                          onClick={() => toggleTask(task)}
                          className="group flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition-colors hover:bg-white/[0.07]"
                        >
                          <span className="tnum w-5 text-xs text-white/35">{String(index + 1).padStart(2, "0")}</span>
                          <Circle size={16} className="shrink-0 text-white/40 transition-colors group-hover:text-white" />
                          <span className="min-w-0 flex-1 truncate text-sm text-white/90">{task.title}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between border-t border-white/15 pt-5">
                  <span className="text-xs text-white/45">最多展示 5 项未完成任务</span>
                  <Link href="/today" className="inline-flex items-center gap-2 text-sm font-medium text-white hover:text-white/70">
                    管理今日待办 <ArrowRight size={15} />
                  </Link>
                </div>
              </div>
            </section>

            <aside className="anim-fade-up rounded-2xl border border-line bg-surface p-6 [animation-delay:80ms] sm:p-7">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted">本周进度</p>
                  <p className="mt-1 text-sm font-medium">保持稳定，比冲刺更重要</p>
                </div>
                <ProgressRing done={data.week.done} total={data.week.total} label="本周任务" />
              </div>

              <dl className="mt-7 grid grid-cols-2 gap-5 border-y border-line py-5">
                <div>
                  <dt className="text-xs text-faint">本周完成</dt>
                  <dd className="tnum mt-1 text-xl font-semibold">{data.week.done}</dd>
                </div>
                <div>
                  <dt className="text-xs text-faint">剩余任务</dt>
                  <dd className="tnum mt-1 text-xl font-semibold">{Math.max(data.week.total - data.week.done, 0)}</dd>
                </div>
              </dl>

              <Link href="/review" className="group mt-5 flex items-center gap-3 rounded-xl bg-bg px-4 py-3.5">
                <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${data.reviewWritten ? "bg-ink text-white" : "border border-line bg-surface text-muted"}`}>
                  <CheckCircle2 size={17} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">今日复盘</span>
                  <span className="mt-0.5 block text-xs text-muted">{data.reviewWritten ? "已经写完，今天有了句点" : "还没写，留几分钟给自己"}</span>
                </span>
                <ArrowRight size={15} className="text-faint transition-transform group-hover:translate-x-0.5" />
              </Link>
            </aside>
          </div>

          <section aria-labelledby="capture-title" className="anim-fade-up [animation-delay:120ms]">
            <div className="mb-3 flex items-center justify-between">
              <h2 id="capture-title" className="text-sm font-semibold">快速收纳</h2>
              <p className="hidden text-xs text-faint sm:block">按回车即可保存</p>
            </div>
            <div className="grid overflow-hidden rounded-2xl border border-line bg-surface sm:grid-cols-2 sm:divide-x sm:divide-line">
              <form onSubmit={addQuickTask} className="group flex items-center gap-3 px-4 py-3.5 focus-within:bg-bg/70">
                <ListChecks size={17} className="shrink-0 text-muted" />
                <label htmlFor="quick-task" className="sr-only">快速添加今日任务</label>
                <input
                  id="quick-task"
                  value={quickTask}
                  onChange={(event) => setQuickTask(event.target.value)}
                  placeholder="加一条今日任务"
                  className="h-8 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-faint"
                />
                <button type="submit" disabled={!quickTask.trim() || submitting !== null} className="quick-submit" aria-label="添加今日任务">
                  <Plus size={15} />
                </button>
              </form>
              <form onSubmit={addQuickNote} className="group flex items-center gap-3 border-t border-line px-4 py-3.5 focus-within:bg-bg/70 sm:border-t-0">
                <Lightbulb size={17} className="shrink-0 text-muted" />
                <label htmlFor="quick-note" className="sr-only">快速记录灵感</label>
                <input
                  id="quick-note"
                  value={quickNote}
                  onChange={(event) => setQuickNote(event.target.value)}
                  placeholder="记一条刚冒出来的想法"
                  className="h-8 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-faint"
                />
                <button type="submit" disabled={!quickNote.trim() || submitting !== null} className="quick-submit" aria-label="记录灵感">
                  <Plus size={15} />
                </button>
              </form>
            </div>
          </section>

          <div className="grid gap-x-10 gap-y-8 lg:grid-cols-[minmax(0,1.2fr)_minmax(18rem,.8fr)]">
            <section aria-labelledby="timeline-title" className="anim-fade-up [animation-delay:160ms]">
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CalendarClock size={17} className="text-muted" />
                  <h2 id="timeline-title" className="text-sm font-semibold">今日安排</h2>
                </div>
                <Link href="/calendar" className="text-xs text-muted hover:text-ink">查看日历</Link>
              </div>
              {data.todayEvents.length === 0 && todayTasks.length === 0 ? (
                <EmptyState>今天没有日程和待办，可以安心留白。</EmptyState>
              ) : (
                <div className="border-t border-line">
                  {data.todayEvents.map((event) => (
                    <div key={event.id} className="grid grid-cols-[3.5rem_1rem_minmax(0,1fr)] items-center gap-2 border-b border-line py-3.5 text-sm">
                      <span className="tnum text-xs text-faint">{event.startTime ?? "全天"}</span>
                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: event.color ?? "var(--color-accent)" }} aria-hidden="true" />
                      <span className="truncate">{event.title}</span>
                    </div>
                  ))}
                  {todayTasks.map((task) => (
                    <button key={task.id} type="button" onClick={() => toggleTask(task)} className="group grid w-full grid-cols-[3.5rem_1rem_minmax(0,1fr)] items-center gap-2 border-b border-line py-3.5 text-left text-sm">
                      <span className="text-xs text-faint">待办</span>
                      <Circle size={13} className="text-faint group-hover:text-ink" />
                      <span className="truncate">{task.title}</span>
                    </button>
                  ))}
                </div>
              )}
            </section>

            <section aria-labelledby="inspiration-title" className="anim-fade-up [animation-delay:200ms]">
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Lightbulb size={17} className="text-muted" />
                  <h2 id="inspiration-title" className="text-sm font-semibold">最新灵感</h2>
                </div>
                <Link href="/inspiration" className="text-xs text-muted hover:text-ink">查看全部</Link>
              </div>
              {data.inspirations.length === 0 ? (
                <EmptyState>灵感箱还是空的，先记下第一个念头。</EmptyState>
              ) : (
                <div className="space-y-1">
                  {data.inspirations.map((inspiration) => (
                    <p key={inspiration.id} className="line-clamp-2 border-b border-line py-3 text-sm leading-6 text-muted last:border-b-0">
                      {inspiration.content}
                    </p>
                  ))}
                </div>
              )}
            </section>
          </div>

          <section aria-labelledby="habits-title" className="anim-fade-up border-t border-line pt-7 [animation-delay:240ms]">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <h2 id="habits-title" className="text-sm font-semibold">习惯打卡</h2>
                  {habits && habits.habits.length > 0 && (
                    <span className="tnum text-xs text-faint">{habitsDone}/{habits.habits.length}</span>
                  )}
                </div>
                <p className="mt-1 text-xs text-muted">让重复的小事，慢慢成为生活的骨架。</p>
              </div>
              <Link href="/habits" className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-ink">
                管理习惯 <ArrowRight size={13} />
              </Link>
            </div>

            {!habits || habits.habits.length === 0 ? (
              <div className="mt-5">
                <EmptyState>还没有习惯，去习惯打卡页创建一个。</EmptyState>
              </div>
            ) : (
              <div className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {habits.habits.map((habit) => {
                  const done = habits.logs.some((log) => log.habitId === habit.id && log.date === habits.today);
                  return (
                    <button
                      key={habit.id}
                      type="button"
                      onClick={() => toggleHabit(habit)}
                      className={`flex min-h-12 items-center gap-3 rounded-xl border px-4 py-3 text-left text-sm transition-colors ${
                        done ? "border-ink bg-ink text-white" : "border-line bg-surface hover:border-faint"
                      }`}
                    >
                      {done ? <CheckCircle2 size={16} className="shrink-0" /> : <Circle size={16} className="shrink-0 text-faint" />}
                      <span className={`min-w-0 flex-1 truncate ${done ? "text-white/75 line-through" : ""}`}>{habit.name}</span>
                      {habit.icon && <span className="shrink-0" aria-hidden="true">{habit.icon}</span>}
                    </button>
                  );
                })}
              </div>
            )}
          </section>
        </main>
      </div>
    </div>
  );
}
