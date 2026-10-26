"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { api } from "@/lib/api";
import type { Event, Task } from "@/db/schema";
import { PageError, PageHeader, PageLoading } from "@/components/page-header";
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

async function readCalendar(signal?: AbortSignal) {
  const [tasks, events] = await Promise.all([
    api<Task[]>("/api/tasks", { signal }),
    api<Event[]>("/api/events", { signal }),
  ]);
  return { tasks: tasks.filter((task) => task.dueDate), events };
}

function eventStyle(color: string | null) {
  const accent = color ?? "var(--color-accent)";
  return {
    backgroundColor: `color-mix(in srgb, ${accent} 12%, var(--color-surface))`,
    borderLeft: `2px solid ${accent}`,
    color: "var(--color-ink)",
  };
}

export default function CalendarPage() {
  const [cursor, setCursor] = useState(new Date());
  const [mode, setMode] = useState<Mode>("month");
  const [tasks, setTasks] = useState<Task[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [newEvent, setNewEvent] = useState({ title: "", startTime: "" });
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const details = useRef<HTMLElement>(null);

  const load = useCallback(async () => {
    try {
      const data = await readCalendar();
      setTasks(data.tasks);
      setEvents(data.events);
      setLoaded(true);
      setError(null);
    } catch {
      setError("日历数据读取失败，请重新加载。");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    readCalendar(controller.signal)
      .then((data) => { setTasks(data.tasks); setEvents(data.events); setLoaded(true); })
      .catch(() => { if (!controller.signal.aborted) setError("日历数据读取失败，请重新加载。"); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!selected || !details.current) return;
    details.current.focus({ preventScroll: true });
    if (window.matchMedia("(max-width: 1535px)").matches) {
      details.current.scrollIntoView({ behavior: "auto", block: "nearest" });
    }
  }, [selected]);

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

  const addEvent = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!newEvent.title.trim() || !selected || busy) return;
    setBusy(true);
    setError(null);
    try {
      await api("/api/events", {
        method: "POST",
        json: { title: newEvent.title.trim(), date: selected, startTime: newEvent.startTime || null },
      });
      setNewEvent({ title: "", startTime: "" });
      await load();
    } catch {
      setError("日程添加失败，输入已保留，请重试。");
    } finally {
      setBusy(false);
    }
  };

  const delEvent = async (id: number) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await api(`/api/events/${id}`, { method: "DELETE" });
      await load();
    } catch {
      setError("日程删除失败，请重试。");
    } finally {
      setBusy(false);
    }
  };

  const today = todayStr();

  return (
    <div className="page-shell page-shell-wide">
      <PageHeader title="日历" description="集中查看任务与日程，选择日期可查看详情或添加安排。"
        actions={<div className="flex rounded-xl border border-line bg-surface p-1" role="group" aria-label="日历视图">
          {(["month", "week"] as Mode[]).map((item) => <button key={item} type="button" onClick={() => setMode(item)} aria-pressed={mode === item}
            className={`min-h-9 rounded-lg px-4 text-xs font-medium transition-colors ${mode === item ? "bg-ink text-on-ink" : "text-muted hover:bg-bg"}`}>
            {item === "month" ? "月视图" : "周视图"}
          </button>)}
        </div>} />

      {error && <div className="mb-5"><PageError message={error} onRetry={load} /></div>}
      {loading ? <PageLoading rows={6} /> : loaded && <div className={`grid min-w-0 gap-5 ${selected ? "2xl:grid-cols-[minmax(0,1fr)_20rem]" : ""}`}>
      <section className="min-w-0" aria-label="日期选择">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold tracking-tight tnum">{format(cursor, "yyyy年M月")}</h2>
          <div className="flex items-center gap-1.5">
              <button type="button" onClick={() => nav(-1)} className="btn-ghost px-2" aria-label={mode === "month" ? "上个月" : "上一周"}>
                <ChevronLeft size={15} />
              </button>
              <button
                type="button"
                onClick={() => setCursor(new Date())}
                className="btn-ghost"
              >
                今天
              </button>
              <button type="button" onClick={() => nav(1)} className="btn-ghost px-2" aria-label={mode === "month" ? "下个月" : "下一周"}>
                <ChevronRight size={15} />
              </button>
          </div>
        </div>

        <div className="max-w-full overflow-x-auto rounded-2xl border border-line">
        <div className="grid min-w-[560px] grid-cols-7 gap-px bg-line">
          {WEEKDAY_CN.map((w) => (
            <div key={w} className="bg-bg py-3 text-center text-xs font-medium text-muted">
              周{w}
            </div>
          ))}
          {days.map((d) => {
            const ds = fmtDate(d);
            const inMonth = mode === "week" || d.getMonth() === cursor.getMonth();
            const dayTasks = tasksOn(ds);
            const dayEvents = eventsOn(ds);
            const hidden = Math.max(0, dayTasks.length - 2) + Math.max(0, dayEvents.length - 2);
            return (
              <button
                key={ds}
                type="button"
                onClick={() => setSelected(ds)}
                aria-label={`${format(d, "yyyy年M月d日")}，${dayEvents.length}项日程，${dayTasks.length}项任务`}
                aria-pressed={selected === ds}
                className={`flex min-h-28 min-w-0 flex-col items-stretch p-2 text-left transition-colors hover:bg-accent-soft ${
                  inMonth ? "bg-surface" : "bg-bg"
                } ${selected === ds ? "ring-2 ring-inset ring-accent" : ""}`}
              >
                <span
                  className={`inline-flex h-7 w-7 items-center justify-center rounded-lg text-xs font-medium tnum ${
                    ds === today ? "bg-accent text-on-accent" : "text-muted"
                  }`}
                >
                  {d.getDate()}
                </span>
                <div className="mt-2 space-y-1">
                  {dayEvents.slice(0, 2).map((e) => (
                    <div
                      key={e.id}
                      className="truncate rounded-md px-1.5 py-1 text-[11px]"
                      style={eventStyle(e.color)}
                      title={e.title}
                    >
                      {e.startTime ? `${e.startTime} ` : ""}
                      {e.title}
                    </div>
                  ))}
                  {dayTasks.slice(0, 2).map((t) => (
                    <div
                      key={t.id}
                      title={t.title}
                      className={`truncate rounded-md bg-bg px-1.5 py-1 text-[11px] text-muted ${
                        t.status === "done" ? "line-through" : ""
                      }`}
                    >
                      {t.title}
                    </div>
                  ))}
                  {hidden > 0 && (
                    <div className="px-1 text-[11px] text-muted">
                      另有 {hidden} 项
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
        </div>
      </section>

      {/* 日期详情：窄屏置于日历下方，宽屏并列显示 */}
      {selected && (
        <aside ref={details} id="calendar-details" tabIndex={-1} aria-labelledby="calendar-details-title" className="card min-w-0 scroll-mt-5 self-start p-5 focus:outline-none">
          <div className="mb-4 flex items-center justify-between">
            <h2 id="calendar-details-title" className="text-base font-semibold">
              {format(new Date(selected + "T00:00:00"), "M月d日")} 周
              {"日一二三四五六"[new Date(selected + "T00:00:00").getDay()]}
            </h2>
            <button type="button" onClick={() => setSelected(null)} className="btn-ghost px-2" aria-label="关闭日期详情">
              <X size={15} />
            </button>
          </div>

          <h3 className="mb-3 text-xs font-semibold text-muted">日程</h3>
          <div className="mb-3 space-y-1.5">
            {eventsOn(selected).map((e) => (
              <div key={e.id} className="flex items-start gap-2 rounded-xl border border-line py-2 pl-3 pr-2 text-sm" style={eventStyle(e.color)}>
                <div className="min-w-0 flex-1">
                  <p className="break-words leading-6">{e.title}</p>
                  <span className="text-xs text-muted tnum">{e.startTime || "全天"}</span>
                </div>
                <button
                  type="button"
                  onClick={() => delEvent(e.id)}
                  disabled={busy}
                  aria-label={`删除日程：${e.title}`}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-danger/10 hover:text-danger"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
            {eventsOn(selected).length === 0 && (
              <p className="rounded-xl border border-dashed border-line p-4 text-xs leading-5 text-muted">当天没有日程，可在下方添加。</p>
            )}
          </div>
          <form onSubmit={addEvent} className="mb-6 grid gap-3 rounded-xl bg-bg p-3 sm:grid-cols-[minmax(0,1fr)_9rem_auto] sm:items-end 2xl:grid-cols-1">
            <div>
            <label htmlFor="calendar-event-title" className="mb-1.5 block text-xs font-medium text-muted">日程名称</label>
            <input id="calendar-event-title"
              value={newEvent.title}
              onChange={(e) => setNewEvent((v) => ({ ...v, title: e.target.value }))}
              disabled={busy}
              placeholder="这一天有什么安排？"
              className="input min-w-0"
            />
            </div>
            <div>
            <label htmlFor="calendar-event-time" className="mb-1.5 block text-xs font-medium text-muted">开始时间（可选）</label>
            <input id="calendar-event-time"
              type="time"
              value={newEvent.startTime}
              onChange={(e) => setNewEvent((v) => ({ ...v, startTime: e.target.value }))}
              disabled={busy}
              className="input"
            />
            </div>
            <button type="submit" disabled={busy || !newEvent.title.trim()} className="btn-primary justify-center">
              <Plus size={14} /> 添加日程
            </button>
          </form>

          <h3 className="mb-3 text-xs font-semibold text-muted">当日任务</h3>
          <div className="space-y-1.5">
            {tasksOn(selected).map((t) => (
              <div key={t.id} className="flex items-start gap-2 rounded-xl border border-line px-3 py-3 text-sm">
                <span className={`min-w-0 flex-1 break-words leading-6 ${t.status === "done" ? "text-muted line-through" : ""}`}>
                  {t.title}
                </span>
                <span className="shrink-0 text-[11px] text-muted">{t.status === "done" ? "已完成" : "待完成"}</span>
              </div>
            ))}
            {tasksOn(selected).length === 0 && <p className="text-xs text-muted">暂无任务</p>}
          </div>
        </aside>
      )}
      </div>}
    </div>
  );
}
