"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import type { Habit } from "@/db/schema";
import { Check, Flame, Plus, Target, Trash2 } from "lucide-react";
import { addDays, format, startOfWeek, subDays } from "date-fns";
import { reviewStreak } from "@/lib/day-rules";
import { EmptyState, PageError, PageHeader, PageLoading } from "@/components/page-header";

type Log = { habitId: number; date: string };
type HabitsData = { habits: Habit[]; logs: Log[]; today: string };

function HabitCard({ habit, logs, today, busy, onToggle, onDelete }: {
  habit: Habit;
  logs: Set<string>;
  today: string;
  busy: boolean;
  onToggle: (habit: Habit) => void;
  onDelete: (habit: Habit) => void;
}) {
  const days = useMemo(() => {
    const start = startOfWeek(subDays(new Date(today + "T12:00:00"), 11 * 7), { weekStartsOn: 1 });
    return Array.from({ length: 84 }, (_, index) => format(addDays(start, index), "yyyy-MM-dd"));
  }, [today]);
  const checked = logs.has(today);
  const streak = reviewStreak(logs, today);

  return (
    <article className="card min-w-0 p-4 sm:p-5">
      <div className="mb-5 flex items-start gap-3">
        <button type="button" onClick={() => onToggle(habit)} disabled={busy} aria-pressed={checked}
          className={`grid min-h-10 w-10 shrink-0 place-items-center rounded-xl border transition-colors ${checked ? "border-accent bg-accent text-on-accent" : "border-line bg-bg text-muted hover:border-accent"}`}
          aria-label={`${habit.name}，${checked ? "取消今日打卡" : "今日打卡"}`}>
          <Check size={18} strokeWidth={checked ? 2.5 : 1.6} aria-hidden="true" />
        </button>
        <div className="min-w-0 flex-1 pt-0.5">
          <h2 className="break-words text-sm font-semibold leading-6">{habit.icon && <span className="mr-1.5" aria-hidden="true">{habit.icon}</span>}{habit.name}</h2>
          <p className="mt-1 text-xs text-muted">{checked ? "今天已完成" : "今天还未打卡"}</p>
        </div>
        <button type="button" onClick={() => onDelete(habit)} disabled={busy} className="grid min-h-9 w-9 shrink-0 place-items-center rounded-lg text-muted hover:bg-bg hover:text-danger"
          aria-label={`删除习惯 ${habit.name}`} title="删除习惯"><Trash2 size={15} /></button>
      </div>

      <div className="grid grid-flow-col gap-1" style={{ gridTemplateRows: "repeat(7, 1fr)" }} aria-label="最近12周打卡记录">
        {days.map((date) => (
          <span key={date} title={`${date}${logs.has(date) ? " 已打卡" : date > today ? " 尚未到来" : " 未打卡"}`}
            className={`aspect-square min-w-0 rounded-[3px] ${logs.has(date) ? "bg-accent" : date === today ? "bg-accent-soft ring-1 ring-accent" : "bg-bg"} ${date > today ? "opacity-40" : ""}`} />
        ))}
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
        <span>最近 12 周</span>
        {streak > 0 && <span className="inline-flex items-center gap-1 tnum"><Flame size={13} className="text-accent" />连续 {streak} 天</span>}
      </div>
    </article>
  );
}

export default function HabitsPage() {
  const [data, setData] = useState<HabitsData | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("");

  const load = useCallback(async () => {
    setData(await api<HabitsData>("/api/habits"));
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    api<HabitsData>("/api/habits", { signal: controller.signal }).then(setData).catch(() => {
      if (!controller.signal.aborted) setError("习惯记录读取失败，请重新加载。");
    });
    return () => controller.abort();
  }, []);

  const refresh = async () => {
    setError("");
    try { await load(); } catch { setError("习惯记录读取失败，请重新加载。"); }
  };

  const perform = async (action: () => Promise<unknown>, message: string) => {
    if (busy) return false;
    setBusy(true);
    setError("");
    try { await action(); await refresh(); return true; }
    catch { setError(message); return false; }
    finally { setBusy(false); }
  };

  const add = async () => {
    if (!name.trim()) return;
    const saved = await perform(() => api("/api/habits", {
      method: "POST", json: { name: name.trim(), icon: icon.trim() || null, sortOrder: data?.habits.length ?? 0 },
    }), "习惯未能创建，已保留输入，请重试。");
    if (saved) { setName(""); setIcon(""); setAdding(false); }
  };

  const toggle = (habit: Habit) => {
    void perform(() => api(`/api/habits/${habit.id}`, { method: "POST", json: { action: "toggle", date: data?.today } }), "打卡未能保存，请稍后重试。");
  };

  const remove = (habit: Habit) => {
    if (!confirm(`删除习惯「${habit.name}」？打卡记录会一起删除。`)) return;
    void perform(() => api(`/api/habits/${habit.id}`, { method: "DELETE" }), "习惯未能删除，请稍后重试。");
  };

  const logsByHabit = useMemo(() => {
    const map = new Map<number, Set<string>>();
    for (const log of data?.logs ?? []) {
      if (!map.has(log.habitId)) map.set(log.habitId, new Set());
      map.get(log.habitId)!.add(log.date);
    }
    return map;
  }, [data]);
  const habits = data?.habits ?? [];
  const doneToday = habits.filter((habit) => logsByHabit.get(habit.id)?.has(data?.today ?? "")).length;

  return (
    <div className="page-shell">
      <PageHeader title="习惯打卡" description="查看长期记录，完成今天的打卡。"
        actions={<button type="button" onClick={() => setAdding((value) => !value)} className="btn-primary" aria-expanded={adding}><Plus size={15} />新习惯</button>}
        meta={data && <span className="tnum">今天已完成 {doneToday} / {habits.length}</span>} />

      {error && <div className="mb-5"><PageError message={error} onRetry={refresh} /></div>}

      {adding && (
        <form className="card mb-6 p-5" onSubmit={(event) => { event.preventDefault(); void add(); }}>
          <h2 className="mb-4 text-sm font-semibold">新建习惯</h2>
          <div className="grid gap-4 sm:grid-cols-[5rem_minmax(0,1fr)]">
            <div><label htmlFor="habit-icon" className="mb-2 block text-xs font-medium text-muted">图标（选填）</label><input id="habit-icon" value={icon} onChange={(event) => setIcon(event.target.value)} placeholder="如：跑" className="input text-center" maxLength={2} /></div>
            <div><label htmlFor="habit-name" className="mb-2 block text-xs font-medium text-muted">习惯名称</label><input id="habit-name" autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="如：阅读 30 分钟" className="input" required /></div>
          </div>
          <div className="mt-4 flex flex-wrap justify-end gap-2"><button type="button" onClick={() => setAdding(false)} disabled={busy} className="btn-ghost">取消</button><button type="submit" disabled={busy || !name.trim()} className="btn-primary">{busy ? "正在创建…" : "创建习惯"}</button></div>
        </form>
      )}

      {!data && !error ? <PageLoading rows={3} /> : habits.length > 0 ? (
        <div className="grid min-w-0 grid-cols-1 gap-4 md:grid-cols-2">
          {habits.map((habit) => <HabitCard key={habit.id} habit={habit} logs={logsByHabit.get(habit.id) ?? new Set()} today={data!.today} busy={busy} onToggle={toggle} onDelete={remove} />)}
        </div>
      ) : data && !adding ? <EmptyState title="还没有习惯" description="从一个容易坚持的小习惯开始，例如每天阅读 20 分钟。" icon={<Target size={24} />} /> : null}
    </div>
  );
}
