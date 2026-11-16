"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { addDays, format, parseISO } from "date-fns";
import type { Event as CalendarEvent } from "@/db/schema";
import { api } from "@/lib/api";
import { resolveCourseOccurrences, type CourseScheduleData } from "@/lib/course-schedule";

type Item = { date: string; time: string; title: string; key: string; kind: string };

export default function UpcomingWeek({ after }: { after: string }) {
  const [result, setResult] = useState<{ key: string; items: Item[] | null } | null>(null);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    Promise.all([api<CalendarEvent[]>("/api/events", { signal: controller.signal }), api<CourseScheduleData>("/api/courses", { signal: controller.signal })])
      .then(([events, schedule]) => {
        const start = addDays(parseISO(after), 1);
        const dates = Array.from({ length: 7 }, (_, index) => addDays(start, index));
        const keys = dates.map((date) => format(date, "yyyy-MM-dd"));
        const rows: Item[] = events.filter((event) => keys.includes(event.date)).map((event) => ({
          date: event.date, time: event.startTime ?? "", title: event.title, key: `event-${event.id}`, kind: "日程",
        }));
        for (const date of dates) {
          for (const occurrence of resolveCourseOccurrences(schedule, date)) rows.push({
            date: format(date, "yyyy-MM-dd"), time: format(occurrence.startAt, "HH:mm"), title: occurrence.course.name,
            key: `course-${occurrence.course.id}-${format(date, "yyyy-MM-dd")}`, kind: "课程",
          });
        }
        rows.sort((a, b) => `${a.date} ${a.time || "99:99"}`.localeCompare(`${b.date} ${b.time || "99:99"}`));
        if (!controller.signal.aborted) setResult({ key: after, items: rows });
      })
      .catch(() => { if (!controller.signal.aborted) setResult({ key: after, items: null }); });
    return () => controller.abort();
  }, [after, retry]);
  const current = result?.key === after ? result : null;
  return <section className="card mb-6 p-5" aria-labelledby="upcoming-week-title">
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 id="upcoming-week-title" className="text-sm font-semibold">下一周安排</h2><Link href={`/calendar?date=${format(addDays(parseISO(after), 1), "yyyy-MM-dd")}`} className="text-xs text-accent hover:underline">打开日历</Link></div>
    {!current ? <p role="status" className="mt-3 text-sm text-muted">正在读取日程和课程…</p> : current.items === null ? <p role="alert" className="mt-3 text-sm text-danger">安排读取失败。 <button type="button" onClick={() => setRetry((value) => value + 1)} className="underline">重试</button></p> : current.items.length === 0 ? <p className="mt-3 text-sm text-muted">下一周暂无日程或课程。</p> : <ul className="mt-3 divide-y divide-line">{current.items.slice(0, 20).map((item) => <li key={item.key} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2 text-sm"><span className="text-xs text-muted tnum">{item.date} {item.time}</span><span className="break-words">{item.title}</span><span className="text-xs text-muted">{item.kind}</span></li>)}{current.items.length > 20 && <li className="pt-2 text-xs text-muted">还有 {current.items.length - 20} 项，请打开日历查看。</li>}</ul>}
  </section>;
}
