"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowRight, CalendarClock, Check, CheckCircle2, Circle, Flame, Lightbulb, Plus } from "lucide-react";
import { api } from "@/lib/api";
import { todayStr } from "@/lib/dates";
import type { Event, Habit, HabitLog, Inspiration, Task } from "@/db/schema";
import { EmptyState, PageError, PageHeader, PageLoading } from "@/components/page-header";

type Overview = {
  today: { total: number; done: number; tasks: Task[] };
  week: { total: number; done: number };
  todayEvents: Event[];
  reviewWritten: boolean;
  inspirations: Inspiration[];
  streak: number;
};
type HabitsData = { habits: Habit[]; logs: HabitLog[]; today: string };

function fetchDashboard() {
  return Promise.all([api<Overview>("/api/overview"), api<HabitsData>("/api/habits")]);
}

export default function OverviewPage() {
  const [data, setData] = useState<Overview | null>(null);
  const [habits, setHabits] = useState<HabitsData | null>(null);
  const [quickTask, setQuickTask] = useState("");
  const [quickNote, setQuickNote] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetchDashboard().then(([overview, habitData]) => {
      if (active) { setData(overview); setHabits(habitData); }
    }).catch(() => { if (active) setError("工作台读取失败，请重新加载。"); });
    return () => { active = false; };
  }, []);

  async function refresh() {
    const [overview, habitData] = await fetchDashboard();
    setData(overview);
    setHabits(habitData);
    setError("");
  }

  async function retry() {
    try { await refresh(); } catch { setError("工作台读取失败，请重新加载。"); }
  }

  async function runAction(key: string, action: () => Promise<void>) {
    if (pending) return;
    setPending(key);
    setError("");
    try {
      await action();
      try { await refresh(); } catch { setError("操作已保存，列表刷新失败，请重新加载。"); }
    } catch {
      setError("操作未完成，请重试。输入内容仍保留。");
    } finally {
      setPending(null);
    }
  }

  function addTask(event: FormEvent) {
    event.preventDefault();
    if (!quickTask.trim()) return;
    void runAction("task", async () => {
      await api("/api/tasks", { method: "POST", json: { title: quickTask.trim(), dueDate: todayStr(), isToday: 1 } });
      setQuickTask("");
    });
  }

  function addNote(event: FormEvent) {
    event.preventDefault();
    if (!quickNote.trim()) return;
    void runAction("note", async () => {
      await api("/api/inspirations", { method: "POST", json: { content: quickNote.trim() } });
      setQuickNote("");
    });
  }

  function completeTask(task: Task) {
    void runAction("task-" + task.id, async () => {
      await api("/api/tasks/" + task.id, { method: "PATCH", json: { status: "done" } });
    });
  }

  function toggleHabit(habit: Habit) {
    void runAction("habit-" + habit.id, async () => {
      await api("/api/habits/" + habit.id, { method: "POST", json: { action: "toggle" } });
    });
  }

  if (!data) {
    return (
      <div className="page-shell">
        <PageHeader title="总览" description="今日任务、日程和记录，集中在这里。" />
        {error ? <PageError message={error} onRetry={retry} /> : <PageLoading rows={5} />}
      </div>
    );
  }

  const todayTasks = data.today.tasks.filter((task) => task.status !== "done").slice(0, 5);
  const remaining = data.today.total - data.today.done;
  const doneHabits = habits?.habits.filter((habit) =>
    habits.logs.some((log) => log.habitId === habit.id && log.date === habits.today),
  ).length ?? 0;
  const dateLabel = new Intl.DateTimeFormat("zh-CN", { month: "long", day: "numeric", weekday: "long" }).format(new Date());

  return (
    <div className="page-shell">
      <PageHeader
        title="总览"
        description={remaining > 0 ? "今天还有 " + remaining + " 项任务待处理，先选一件开始。" : "今日待办已完成，可以安排日程或记录新的想法。"}
        meta={<><span className="tnum">{dateLabel}</span>{data.streak > 0 && <span className="inline-flex items-center gap-1.5"><Flame size={13} className="text-accent" />连续复盘 {data.streak} 天</span>}</>}
      />

      {error && <PageError message={error} onRetry={retry} />}

      <div className="overview-metrics">
        <Link href="/today" className="overview-metric">
          <span className="text-xs text-muted">今日任务</span>
          <span className="tnum mt-2 block text-2xl font-semibold tracking-tight">{data.today.done}<span className="ml-1 text-sm font-normal text-muted">/ {data.today.total}</span></span>
          <span className="mt-1 block text-xs text-muted">已完成</span>
        </Link>
        <Link href="/week" className="overview-metric">
          <span className="text-xs text-muted">本周任务</span>
          <span className="tnum mt-2 block text-2xl font-semibold tracking-tight">{data.week.done}<span className="ml-1 text-sm font-normal text-muted">/ {data.week.total}</span></span>
          <span className="mt-1 block text-xs text-muted">已完成</span>
        </Link>
        <Link href="/review" className="overview-metric">
          <span className="text-xs text-muted">今日复盘</span>
          <span className="mt-2 flex items-center gap-2 text-xl font-semibold tracking-tight"><CheckCircle2 size={20} className={data.reviewWritten ? "text-accent" : "text-muted"} />{data.reviewWritten ? "已记录" : "待记录"}</span>
          <span className="mt-1 block text-xs text-muted">{data.reviewWritten ? "查看今日记录" : "记录进展与明日计划"}</span>
        </Link>
      </div>

      <div className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <section className="card min-w-0 p-5 sm:p-6" aria-labelledby="overview-tasks">
          <div className="section-heading">
            <h2 id="overview-tasks" className="section-title">今日待办</h2>
            <Link href="/today" className="inline-flex items-center gap-1 text-xs text-muted hover:text-accent">查看全部<ArrowRight size={13} /></Link>
          </div>
          {todayTasks.length === 0 ? (
            <EmptyState title={data.today.total ? "今日待办已完成" : "还没有今日任务"} description="在下方添加任务，或前往今日待办整理计划。" icon={<CheckCircle2 size={23} />} />
          ) : (
            <div className="mb-4 space-y-1">
              {todayTasks.map((task) => (
                <button key={task.id} type="button" onClick={() => completeTask(task)} disabled={pending !== null}
                  aria-label={"标记完成：" + task.title}
                  className="group flex min-h-12 w-full items-center gap-3 rounded-lg px-2.5 py-3 text-left transition-colors hover:bg-bg disabled:opacity-60">
                  <Circle size={18} className="shrink-0 text-muted group-hover:text-accent" />
                  <span className="min-w-0 flex-1 break-words text-sm leading-6">{task.title}</span>
                  {pending === "task-" + task.id && <span className="shrink-0 text-xs text-muted">保存中</span>}
                </button>
              ))}
              {remaining > 5 && <p className="px-2.5 pt-2 text-xs text-muted">还有 {remaining - 5} 项，前往今日待办查看。</p>}
            </div>
          )}
          <form onSubmit={addTask} className="border-t border-line pt-4">
            <label htmlFor="overview-task" className="mb-2 block text-xs font-medium">添加今日任务</label>
            <div className="flex gap-2">
              <input id="overview-task" value={quickTask} onChange={(event) => setQuickTask(event.target.value)}
                onKeyDown={(event) => { if (event.key === "Enter" && event.nativeEvent.isComposing) event.preventDefault(); }}
                placeholder="写下接下来要做的事" className="input min-w-0 flex-1" maxLength={500} />
              <button type="submit" className="btn-primary shrink-0" disabled={!quickTask.trim() || pending !== null}><Plus size={15} />{pending === "task" ? "保存中" : "添加"}</button>
            </div>
          </form>
        </section>

        <section className="card min-w-0 p-5 sm:p-6" aria-labelledby="overview-events">
          <div className="section-heading">
            <h2 id="overview-events" className="section-title">今日安排</h2>
            <Link href="/calendar" className="text-xs text-muted hover:text-accent">查看日历</Link>
          </div>
          {data.todayEvents.length === 0 ? (
            <EmptyState title="今天没有日程" description="有固定时间的安排，可以添加到日历。" icon={<CalendarClock size={23} />} />
          ) : (
            <div className="space-y-4">
              {data.todayEvents.map((event) => (
                <div key={event.id} className="border-l-2 py-1 pl-4" style={{ borderColor: event.color ?? "var(--color-accent)" }}>
                  <p className="tnum mb-1 text-xs text-muted">{event.startTime || "全天"}{event.endTime ? " - " + event.endTime : ""}</p>
                  <p className="break-words text-sm font-medium leading-6">{event.title}</p>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <section className="card min-w-0 p-5 sm:p-6" aria-labelledby="overview-habits">
          <div className="section-heading">
            <div className="flex items-center gap-2">
              <h2 id="overview-habits" className="section-title">习惯打卡</h2>
              {!!habits?.habits.length && <span className="tnum text-xs text-muted">{doneHabits}/{habits.habits.length}</span>}
            </div>
            <Link href="/habits" className="text-xs text-muted hover:text-accent">管理习惯</Link>
          </div>
          {!habits?.habits.length ? (
            <EmptyState title="还没有习惯" description="前往习惯打卡创建一个，从今天开始记录。" />
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {habits.habits.map((habit) => {
                const done = habits.logs.some((log) => log.habitId === habit.id && log.date === habits.today);
                return (
                  <button key={habit.id} type="button" onClick={() => toggleHabit(habit)} aria-pressed={done} disabled={pending !== null}
                    className={"flex min-h-12 items-center gap-3 rounded-lg border px-3 py-3 text-left text-sm transition-colors disabled:opacity-60 " + (done ? "border-accent/25 bg-accent-soft text-accent" : "border-line hover:border-faint")}>
                    {done ? <Check size={17} className="shrink-0" /> : <Circle size={17} className="shrink-0 text-muted" />}
                    <span className="min-w-0 flex-1 break-words">{habit.name}</span>
                    {habit.icon && <span aria-hidden="true">{habit.icon}</span>}
                  </button>
                );
              })}
            </div>
          )}
        </section>

        <section className="card min-w-0 p-5 sm:p-6" aria-labelledby="overview-inspiration">
          <div className="section-heading">
            <h2 id="overview-inspiration" className="section-title">最新灵感</h2>
            <Link href="/inspiration" className="text-xs text-muted hover:text-accent">查看全部</Link>
          </div>
          {data.inspirations.length === 0 ? (
            <EmptyState title="还没有灵感记录" description="先把想法记下来，稍后再整理。" icon={<Lightbulb size={23} />} />
          ) : (
            <div className="mb-4 space-y-3">
              {data.inspirations.map((item) => <p key={item.id} className="line-clamp-2 break-words text-sm leading-6 text-muted">{item.content}</p>)}
            </div>
          )}
          <form onSubmit={addNote} className="border-t border-line pt-4">
            <label htmlFor="overview-note" className="mb-2 block text-xs font-medium">记录灵感</label>
            <div className="flex gap-2">
              <input id="overview-note" value={quickNote} onChange={(event) => setQuickNote(event.target.value)}
                onKeyDown={(event) => { if (event.key === "Enter" && event.nativeEvent.isComposing) event.preventDefault(); }}
                placeholder="记下刚刚想到的事" className="input min-w-0 flex-1" />
              <button type="submit" disabled={!quickNote.trim() || pending !== null} className="btn-ghost shrink-0">{pending === "note" ? "保存中" : "保存"}</button>
            </div>
          </form>
        </section>
      </div>
    </div>
  );
}
