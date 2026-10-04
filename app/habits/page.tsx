"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import type { Habit } from "@/db/schema";
import { Check, Flame, Plus, Trash2 } from "lucide-react";
import { addDays, format, subDays } from "date-fns";

type Log = { habitId: number; date: string };

/** 最近 N 周的日期网格（周一开头，按列=周） */
function useHeatmapDays(weeks: number) {
  return useMemo(() => {
    const today = new Date();
    const total = weeks * 7;
    const start = subDays(today, total - 1 - ((today.getDay() + 6) % 7)); // 对齐到周一
    return Array.from({ length: total }, (_, i) => format(addDays(start, i), "yyyy-MM-dd"));
  }, [weeks]);
}

function streakOf(dates: Set<string>, today: string): number {
  let n = 0;
  let cursor = today;
  // 今天没打不算断签，从昨天往前数
  if (!dates.has(cursor)) cursor = format(subDays(new Date(cursor + "T00:00:00"), 1), "yyyy-MM-dd");
  while (dates.has(cursor)) {
    n++;
    cursor = format(subDays(new Date(cursor + "T00:00:00"), 1), "yyyy-MM-dd");
  }
  return n;
}

function HabitCard({
  habit,
  logs,
  today,
  onToggle,
  onDelete,
}: {
  habit: Habit;
  logs: Set<string>;
  today: string;
  onToggle: (h: Habit) => void;
  onDelete: (h: Habit) => void;
}) {
  const days = useHeatmapDays(12);
  const checked = logs.has(today);
  const streak = streakOf(logs, today);

  return (
    <div className="card group p-4">
      <div className="mb-3 flex items-center gap-2.5">
        <button
          onClick={() => onToggle(habit)}
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border transition-all active:scale-90 ${
            checked ? "border-ink bg-ink text-white" : "border-line bg-bg text-faint hover:border-ink"
          }`}
          title={checked ? "今天已打卡，点击取消" : "打卡"}
        >
          <Check size={15} strokeWidth={3} />
        </button>
        <span className="min-w-0 flex-1 truncate text-sm font-medium">
          {habit.icon && <span className="mr-1">{habit.icon}</span>}
          {habit.name}
        </span>
        {streak > 0 && (
          <span className="flex shrink-0 items-center gap-0.5 text-xs text-muted tnum">
            <Flame size={12} /> {streak} 天
          </span>
        )}
        <button
          onClick={() => onDelete(habit)}
          className="shrink-0 rounded p-1 text-faint opacity-0 transition-opacity hover:text-danger group-hover:opacity-100"
        >
          <Trash2 size={13} />
        </button>
      </div>

      {/* 12 周热力图 */}
      <div className="grid grid-flow-col gap-[3px]" style={{ gridTemplateRows: "repeat(7, 1fr)" }}>
        {days.map((d) => (
          <span
            key={d}
            title={d}
            className={`aspect-square w-full rounded-[3px] ${
              logs.has(d) ? "bg-ink" : d === today ? "bg-line ring-1 ring-faint" : "bg-bg"
            }`}
          />
        ))}
      </div>
      <div className="mt-1.5 flex justify-between text-[10px] text-faint">
        <span>12 周前</span>
        <span>今天</span>
      </div>
    </div>
  );
}

export default function HabitsPage() {
  const [habits, setHabits] = useState<Habit[]>([]);
  const [logs, setLogs] = useState<Log[]>([]);
  const [today, setToday] = useState("");
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("");

  const load = useCallback(async () => {
    const data = await api<{ habits: Habit[]; logs: Log[]; today: string }>("/api/habits");
    setHabits(data.habits);
    setLogs(data.logs);
    setToday(data.today);
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const add = async () => {
    if (!name.trim()) return;
    await api("/api/habits", {
      method: "POST",
      json: { name: name.trim(), icon: icon.trim() || null, sortOrder: habits.length },
    });
    setName("");
    setIcon("");
    setAdding(false);
    load();
  };

  const toggle = async (h: Habit) => {
    await api(`/api/habits/${h.id}`, { method: "POST", json: { action: "toggle", date: today } });
    load();
  };

  const remove = async (h: Habit) => {
    if (!confirm(`删除习惯「${h.name}」？打卡记录会一起删除。`)) return;
    await api(`/api/habits/${h.id}`, { method: "DELETE" });
    load();
  };

  const logsByHabit = useMemo(() => {
    const map = new Map<number, Set<string>>();
    for (const l of logs) {
      if (!map.has(l.habitId)) map.set(l.habitId, new Set());
      map.get(l.habitId)!.add(l.date);
    }
    return map;
  }, [logs]);

  const doneToday = habits.filter((h) => logsByHabit.get(h.id)?.has(today)).length;

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <header className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">习惯打卡</h1>
          <p className="mt-1 text-sm text-muted tnum">
            {habits.length === 0 ? "种下第一个习惯" : `今天 ${doneToday}/${habits.length} 已打卡`}
          </p>
        </div>
        <button onClick={() => setAdding(true)} className="btn-ghost">
          <Plus size={13} /> 新习惯
        </button>
      </header>

      {adding && (
        <div className="card anim-fade-up mb-4 border-ink/30 p-4">
          <div className="flex gap-2">
            <input
              value={icon}
              onChange={(e) => setIcon(e.target.value)}
              placeholder="🏃"
              className="input w-14! text-center"
              maxLength={2}
            />
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && add()}
              placeholder="习惯名称，如：跑步 30 分钟"
              className="input flex-1"
            />
            <button onClick={add} className="btn-primary">创建</button>
            <button onClick={() => setAdding(false)} className="btn-ghost">取消</button>
          </div>
        </div>
      )}

      <div className="anim-stagger grid grid-cols-1 gap-3 sm:grid-cols-2">
        {habits.map((h, i) => (
          <div key={h.id} style={{ "--i": i } as React.CSSProperties}>
            <HabitCard
              habit={h}
              logs={logsByHabit.get(h.id) ?? new Set()}
              today={today}
              onToggle={toggle}
              onDelete={remove}
            />
          </div>
        ))}
      </div>

      {habits.length === 0 && !adding && (
        <div className="rounded-xl border border-dashed border-line py-16 text-center text-sm text-faint">
          点右上角「新习惯」，比如：阅读 30 分钟、不喝奶茶
        </div>
      )}
    </div>
  );
}
