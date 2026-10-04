"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import type { Event, Task } from "@/db/schema";
import { WEEKDAY_CN, fmtDate, todayStr } from "@/lib/dates";
import {
  addDays,
  addMonths,
  addWeeks,
  endOfMonth,
  endOfWeek,
  format,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { ChevronLeft, ChevronRight, Plus, Trash2, X } from "lucide-react";

type Mode = "month" | "week";

export default function CalendarPage() {
  const [cursor, setCursor] = useState(new Date());
  const [mode, setMode] = useState<Mode>("month");
  const [tasks, setTasks] = useState<Task[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [newEvent, setNewEvent] = useState({ title: "", startTime: "" });

  const load = useCallback(async () => {
    const [t, e] = await Promise.all([
      api<Task[]>("/api/tasks"),
      api<Event[]>("/api/events"),
    ]);
    setTasks(t.filter((x) => x.dueDate));
    setEvents(e);
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const days = useMemo(() => {
    if (mode === "week") {
      const s = startOfWeek(cursor, { weekStartsOn: 1 });
      return Array.from({ length: 7 }, (_, i) => addDays(s, i));
    }
    const s = startOfWeek(startOfMonth(cursor), { weekStartsOn: 1 });
    const e = endOfWeek(endOfMonth(cursor), { weekStartsOn: 1 });
    const arr: Date[] = [];
    for (let d = s; d <= e; d = addDays(d, 1)) arr.push(d);
    return arr;
  }, [cursor, mode]);

  const tasksOn = (d: string) => tasks.filter((t) => t.dueDate === d);
  const eventsOn = (d: string) => events.filter((e) => e.date === d);

  const nav = (dir: 1 | -1) =>
    setCursor((c) => (mode === "month" ? addMonths(c, dir) : addWeeks(c, dir)));

  const addEvent = async () => {
    if (!newEvent.title.trim() || !selected) return;
    await api("/api/events", {
      method: "POST",
      json: { title: newEvent.title.trim(), date: selected, startTime: newEvent.startTime || null },
    });
    setNewEvent({ title: "", startTime: "" });
    load();
  };

  const delEvent = async (id: number) => {
    await api(`/api/events/${id}`, { method: "DELETE" });
    load();
  };

  const today = todayStr();

  return (
    <div className="flex h-full">
      <div className="flex-1 px-6 py-8">
        <header className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-semibold tracking-tight">
              {format(cursor, "yyyy年M月")}
            </h1>
            <div className="flex gap-1">
              <button onClick={() => nav(-1)} className="rounded-md border border-line p-1 text-muted hover:bg-surface">
                <ChevronLeft size={15} />
              </button>
              <button
                onClick={() => setCursor(new Date())}
                className="rounded-md border border-line px-2 py-1 text-xs text-muted hover:bg-surface"
              >
                今天
              </button>
              <button onClick={() => nav(1)} className="rounded-md border border-line p-1 text-muted hover:bg-surface">
                <ChevronRight size={15} />
              </button>
            </div>
          </div>
          <div className="flex rounded-lg border border-line p-0.5 text-xs">
            {(["month", "week"] as Mode[]).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`rounded-md px-3 py-1 ${mode === m ? "bg-ink text-white" : "text-muted"}`}
              >
                {m === "month" ? "月" : "周"}
              </button>
            ))}
          </div>
        </header>

        <div className="grid grid-cols-7 gap-px overflow-hidden rounded-xl border border-line bg-line">
          {WEEKDAY_CN.map((w) => (
            <div key={w} className="bg-surface py-2 text-center text-xs font-medium text-faint">
              周{w}
            </div>
          ))}
          {days.map((d) => {
            const ds = fmtDate(d);
            const inMonth = mode === "week" || d.getMonth() === cursor.getMonth();
            const dayTasks = tasksOn(ds);
            const dayEvents = eventsOn(ds);
            return (
              <button
                key={ds}
                onClick={() => setSelected(ds)}
                className={`min-h-[90px] bg-surface p-1.5 text-left align-top transition-colors hover:bg-bg ${
                  !inMonth ? "opacity-35" : ""
                } ${selected === ds ? "ring-2 ring-inset ring-ink" : ""}`}
              >
                <span
                  className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-xs ${
                    ds === today ? "bg-ink text-white" : "text-muted"
                  }`}
                >
                  {d.getDate()}
                </span>
                <div className="mt-1 space-y-0.5">
                  {dayEvents.slice(0, 2).map((e) => (
                    <div
                      key={e.id}
                      className="truncate rounded px-1 py-0.5 text-[10px] text-white"
                      style={{ background: e.color ?? "#6366f1" }}
                    >
                      {e.startTime ? `${e.startTime} ` : ""}
                      {e.title}
                    </div>
                  ))}
                  {dayTasks.slice(0, 2).map((t) => (
                    <div
                      key={t.id}
                      className={`truncate rounded bg-bg px-1 py-0.5 text-[10px] text-muted ${
                        t.status === "done" ? "line-through opacity-60" : ""
                      }`}
                    >
                      {t.title}
                    </div>
                  ))}
                  {dayTasks.length + dayEvents.length > 4 && (
                    <div className="px-1 text-[10px] text-faint">
                      +{dayTasks.length + dayEvents.length - 4} 更多
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* 日期详情侧滑面板 */}
      {selected && (
        <aside className="anim-fade-up w-80 shrink-0 overflow-y-auto border-l border-line bg-surface px-5 py-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold">
              {format(new Date(selected + "T00:00:00"), "M月d日")} 周
              {"日一二三四五六"[new Date(selected + "T00:00:00").getDay()]}
            </h2>
            <button onClick={() => setSelected(null)} className="rounded p-1 text-faint hover:text-ink">
              <X size={15} />
            </button>
          </div>

          <h3 className="mb-2 text-xs font-medium text-faint">日程</h3>
          <div className="mb-3 space-y-1.5">
            {eventsOn(selected).map((e) => (
              <div key={e.id} className="group flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-sm">
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: e.color ?? "#6366f1" }} />
                <span className="flex-1 truncate">
                  {e.startTime && <span className="mr-1.5 text-xs text-faint">{e.startTime}</span>}
                  {e.title}
                </span>
                <button
                  onClick={() => delEvent(e.id)}
                  className="text-faint opacity-0 hover:text-danger group-hover:opacity-100"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
            {eventsOn(selected).length === 0 && (
              <div className="text-xs text-faint">暂无日程</div>
            )}
          </div>
          <div className="mb-6 flex gap-1.5">
            <input
              value={newEvent.title}
              onChange={(e) => setNewEvent((v) => ({ ...v, title: e.target.value }))}
              onKeyDown={(e) => e.key === "Enter" && addEvent()}
              placeholder="新日程…"
              className="h-8 min-w-0 flex-1 rounded-lg border border-line bg-bg px-2.5 text-xs outline-none placeholder:text-faint"
            />
            <input
              type="time"
              value={newEvent.startTime}
              onChange={(e) => setNewEvent((v) => ({ ...v, startTime: e.target.value }))}
              className="h-8 w-[84px] rounded-lg border border-line bg-bg px-2 text-xs text-muted outline-none"
            />
            <button onClick={addEvent} className="h-8 rounded-lg bg-ink px-2.5 text-white">
              <Plus size={14} />
            </button>
          </div>

          <h3 className="mb-2 text-xs font-medium text-faint">当日任务</h3>
          <div className="space-y-1.5">
            {tasksOn(selected).map((t) => (
              <div key={t.id} className="flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-sm">
                <span className={`flex-1 truncate ${t.status === "done" ? "text-faint line-through" : ""}`}>
                  {t.title}
                </span>
              </div>
            ))}
            {tasksOn(selected).length === 0 && <div className="text-xs text-faint">暂无任务</div>}
          </div>
        </aside>
      )}
    </div>
  );
}
