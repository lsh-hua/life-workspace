"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import type { Habit, HabitLog, Review, Task } from "@/db/schema";
import { todayStr } from "@/lib/dates";
import { addDays, format, getDay, parseISO } from "date-fns";
import { Check, CheckCircle2, ChevronLeft, ChevronRight, Copy, Flame } from "lucide-react";

const MOODS = ["😞", "😕", "😐", "🙂", "😄"];
const MOOD_LABEL = ["", "很低落", "不太好", "一般", "不错", "很棒"];
const TABS = [
  { key: "day", label: "日复盘" },
  { key: "week", label: "周复盘" },
  { key: "month", label: "月复盘" },
] as const;

type Tab = (typeof TABS)[number]["key"];

export default function ReviewPage() {
  const [tab, setTab] = useState<Tab>("day");

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">复盘</h1>
        <div className="mt-3 flex gap-1 rounded-lg border border-line bg-surface p-1 w-fit">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`rounded-md px-4 py-1.5 text-sm transition-colors ${
                tab === t.key ? "bg-ink text-white" : "text-muted hover:text-ink"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </header>

      {tab === "day" && <DayReview />}
      {tab === "week" && <PeriodReview period="week" />}
      {tab === "month" && <PeriodReview period="month" />}
    </div>
  );
}

// ================= 日复盘 =================
function DayReview() {
  const today = todayStr();
  const [form, setForm] = useState({
    doneText: "",
    problemText: "",
    tomorrowText: "",
    mood: 0,
    summary: "",
  });
  const [history, setHistory] = useState<Review[]>([]);
  const [doneTasks, setDoneTasks] = useState<Task[]>([]);
  const [saved, setSaved] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    const [review, list, tasks] = await Promise.all([
      api<Review | null>(`/api/reviews?date=${today}`),
      api<Review[]>("/api/reviews"),
      api<Task[]>("/api/tasks?filter=today"),
    ]);
    if (review) {
      setForm({
        doneText: review.doneText ?? "",
        problemText: review.problemText ?? "",
        tomorrowText: review.tomorrowText ?? "",
        mood: review.mood ?? 0,
        summary: review.summary ?? "",
      });
    }
    setHistory(list.filter((r) => r.date !== today));
    setDoneTasks(tasks.filter((t) => t.status === "done"));
  }, [today]);

  useEffect(() => {
    load();
  }, [load]);

  const save = useCallback(
    async (next: typeof form) => {
      await api("/api/reviews", { method: "POST", json: { date: today, ...next, mood: next.mood || null } });
      setSaved(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setSaved(false), 1500);
    },
    [today]
  );

  const update = (patch: Partial<typeof form>) => {
    const next = { ...form, ...patch };
    setForm(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => save(next), 800); // 防抖自动保存
  };

  const streak = (() => {
    const dates = new Set(history.map((r) => r.date));
    let n = history.length > 0 || form.summary || form.doneText ? 1 : 0;
    const c = new Date();
    c.setDate(c.getDate() - 1);
    while (dates.has(c.toISOString().slice(0, 10))) {
      n++;
      c.setDate(c.getDate() - 1);
    }
    return n;
  })();

  const field = (
    label: string,
    key: "doneText" | "problemText" | "tomorrowText",
    placeholder: string
  ) => (
    <div className="card p-4">
      <label className="mb-2 block text-xs font-medium text-muted">{label}</label>
      {key === "doneText" && doneTasks.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {doneTasks.map((t) => (
            <span key={t.id} className="rounded-full bg-bg px-2 py-0.5 text-[11px] text-muted">
              ✓ {t.title}
            </span>
          ))}
        </div>
      )}
      <textarea
        value={form[key]}
        onChange={(e) => update({ [key]: e.target.value })}
        placeholder={placeholder}
        rows={3}
        className="w-full resize-none bg-transparent text-sm outline-none placeholder:text-faint"
      />
    </div>
  );

  return (
    <>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-muted tnum">
          {today} ·{" "}
          {saved ? (
            <span className="inline-flex items-center gap-1 text-muted">
              <CheckCircle2 size={13} /> 已自动保存
            </span>
          ) : (
            "编辑后自动保存"
          )}
        </p>
        {streak > 0 && (
          <span className="flex items-center gap-1 rounded-full bg-ink px-3 py-1 text-xs text-white">
            <Flame size={13} /> 连续 {streak} 天
          </span>
        )}
      </div>

      <div className="space-y-4">
        {field("今天完成了什么？", "doneText", "记录今天的进展与成果…")}
        {field("遇到什么问题 / 没完成什么？", "problemText", "阻碍、卡点、遗留…")}
        {field("明天最重要的 1-3 件事？", "tomorrowText", "给明天的自己留个指引…")}

        <div className="card p-4">
          <label className="mb-2 block text-xs font-medium text-muted">今日心情</label>
          <div className="flex gap-2">
            {MOODS.map((m, i) => (
              <button
                key={i}
                onClick={() => update({ mood: i + 1 })}
                className={`rounded-lg px-3 py-1.5 text-xl transition-transform ${
                  form.mood === i + 1 ? "scale-110 bg-bg ring-1 ring-ink" : "opacity-50 hover:opacity-100"
                }`}
              >
                {m}
              </button>
            ))}
          </div>
          <input
            value={form.summary}
            onChange={(e) => update({ summary: e.target.value })}
            placeholder="一句话总结今天…"
            className="mt-3 h-9 w-full rounded-lg border border-line bg-bg px-3 text-sm outline-none placeholder:text-faint"
          />
        </div>
      </div>

      {history.length > 0 && (
        <section className="mt-10">
          <h2 className="mb-3 text-sm font-semibold">历史复盘</h2>
          <div className="space-y-2">
            {history.slice(0, 14).map((r) => (
              <details key={r.id} className="card px-4 py-3">
                <summary className="flex cursor-pointer items-center gap-3 text-sm">
                  <span className="font-medium tnum">{r.date}</span>
                  {r.mood && <span>{MOODS[r.mood - 1]}</span>}
                  <span className="truncate text-muted">{r.summary ?? ""}</span>
                </summary>
                <div className="mt-3 space-y-2 border-t border-line pt-3 text-sm text-muted">
                  {r.doneText && <p><b className="text-ink">完成：</b>{r.doneText}</p>}
                  {r.problemText && <p><b className="text-ink">问题：</b>{r.problemText}</p>}
                  {r.tomorrowText && <p><b className="text-ink">明日：</b>{r.tomorrowText}</p>}
                </div>
              </details>
            ))}
          </div>
        </section>
      )}
    </>
  );
}

// ================= 周复盘 / 月复盘 =================
type ReportData = {
  period: "week" | "month";
  range: { start: string; end: string; label: string };
  tasks: Task[];
  reviews: Review[];
  habitLogs: HabitLog[];
  habits: Habit[];
  stats: {
    tasksDone: number;
    tasksTotal: number;
    reviewDays: number;
    avgMood: number | null;
    habitCheckins: number;
  };
};

const weekdayCn = (d: string) => "日一二三四五六"[getDay(parseISO(d))];

function PeriodReview({ period }: { period: "week" | "month" }) {
  const [offset, setOffset] = useState(0);
  const [data, setData] = useState<ReportData | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    setData(null);
    setData(await api<ReportData>(`/api/report?period=${period}&offset=${offset}`));
  }, [period, offset]);

  useEffect(() => {
    load();
  }, [load]);

  const days = data
    ? (() => {
        const out: string[] = [];
        for (let d = parseISO(data.range.start); d <= parseISO(data.range.end); d = addDays(d, 1)) {
          out.push(format(d, "yyyy-MM-dd"));
        }
        return out;
      })()
    : [];

  const hasRecord = (d: string) =>
    data!.tasks.some((t) => t.dueDate === d) ||
    data!.reviews.some((r) => r.date === d) ||
    data!.habitLogs.some((l) => l.date === d);

  // 月视图只展示有记录的天，周视图展示全部 7 天
  const shownDays = period === "month" ? days.filter(hasRecord) : days;

  const copyMarkdown = async () => {
    if (!data) return;
    const s = data.stats;
    const title = period === "week" ? `周报 ${data.range.label}` : `月报 ${data.range.label}`;
    const lines: (string | null)[] = [
      `# ${title}`,
      "",
      `- 完成任务:${s.tasksDone}/${s.tasksTotal}`,
      `- 复盘天数:${s.reviewDays}/${days.length}`,
      `- 习惯打卡:${s.habitCheckins} 次`,
      s.avgMood !== null ? `- 平均心情:${s.avgMood.toFixed(1)}/5` : null,
      "",
      "## 每日完成情况",
    ];
    for (const d of shownDays) {
      const done = data.tasks.filter((t) => t.dueDate === d && t.status === "done");
      const review = data.reviews.find((r) => r.date === d);
      const checkins = data.habitLogs.filter((l) => l.date === d).length;
      lines.push(`\n### ${d} 周${weekdayCn(d)}`);
      if (done.length === 0 && !review && checkins === 0) {
        lines.push("- 无记录");
      } else {
        done.forEach((t) => lines.push(`- [x] ${t.title}`));
        if (checkins > 0) lines.push(`- 习惯打卡 ${checkins} 次`);
        if (review?.summary) lines.push(`- 复盘:${review.summary}`);
      }
    }
    await navigator.clipboard.writeText(lines.filter((l): l is string => l !== null).join("\n"));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <>
      <div className="mb-6 flex items-center justify-between">
        <p className="text-sm text-muted">{data?.range.label ?? "加载中…"}</p>
        <div className="flex items-center gap-2">
          <button onClick={() => setOffset((v) => v - 1)} className="btn-ghost px-2" title={period === "week" ? "上一周" : "上一月"}>
            <ChevronLeft size={16} />
          </button>
          {offset !== 0 && (
            <button onClick={() => setOffset(0)} className="btn-ghost text-xs">
              {period === "week" ? "回到本周" : "回到本月"}
            </button>
          )}
          <button
            onClick={() => setOffset((v) => Math.min(0, v + 1))}
            disabled={offset === 0}
            className="btn-ghost px-2 disabled:opacity-40"
            title={period === "week" ? "下一周" : "下一月"}
          >
            <ChevronRight size={16} />
          </button>
          <button onClick={copyMarkdown} className="btn-primary gap-1.5 text-xs">
            {copied ? <Check size={14} /> : <Copy size={14} />}
            {copied ? "已复制" : "复制 Markdown"}
          </button>
        </div>
      </div>

      {!data ? (
        <div className="py-12 text-center text-sm text-faint">加载中…</div>
      ) : (
        <>
          <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="card p-4">
              <div className="text-xs text-muted">完成任务</div>
              <div className="mt-1 text-xl font-semibold tnum">
                {data.stats.tasksDone}
                <span className="text-sm font-normal text-faint">/{data.stats.tasksTotal}</span>
              </div>
            </div>
            <div className="card p-4">
              <div className="text-xs text-muted">复盘天数</div>
              <div className="mt-1 text-xl font-semibold tnum">
                {data.stats.reviewDays}
                <span className="text-sm font-normal text-faint">/{days.length}</span>
              </div>
            </div>
            <div className="card p-4">
              <div className="text-xs text-muted">习惯打卡</div>
              <div className="mt-1 text-xl font-semibold tnum">
                {data.stats.habitCheckins}
                <span className="text-sm font-normal text-faint"> 次</span>
              </div>
            </div>
            <div className="card p-4">
              <div className="text-xs text-muted">平均心情</div>
              <div className="mt-1 text-xl font-semibold tnum">
                {data.stats.avgMood !== null ? data.stats.avgMood.toFixed(1) : "--"}
                <span className="text-sm font-normal text-faint">/5</span>
              </div>
            </div>
          </div>

          {shownDays.length === 0 ? (
            <p className="py-8 text-center text-xs text-faint">本{period === "week" ? "周" : "月"}暂无记录</p>
          ) : (
            <div className="space-y-3">
              {shownDays.map((d) => {
                const done = data.tasks.filter((t) => t.dueDate === d && t.status === "done");
                const undone = data.tasks.filter((t) => t.dueDate === d && t.status !== "done");
                const review = data.reviews.find((r) => r.date === d);
                const checkins = data.habitLogs.filter((l) => l.date === d).length;
                const empty = done.length === 0 && undone.length === 0 && !review && checkins === 0;

                return (
                  <section key={d} className="card p-5">
                    <div className="mb-2 flex items-baseline justify-between">
                      <h2 className="text-sm font-semibold tnum">
                        {format(parseISO(d), "M月d日")} 周{weekdayCn(d)}
                      </h2>
                      <div className="flex items-center gap-2 text-[11px] text-faint">
                        {review?.mood ? <span>{MOOD_LABEL[review.mood]}</span> : null}
                        {checkins > 0 && <span>打卡 {checkins} 次</span>}
                      </div>
                    </div>
                    {empty ? (
                      <p className="text-xs text-faint">无记录</p>
                    ) : (
                      <div className="space-y-1.5">
                        {done.map((t) => (
                          <div key={t.id} className="flex items-center gap-2 text-sm">
                            <Check size={13} className="shrink-0 text-ink" />
                            <span>{t.title}</span>
                          </div>
                        ))}
                        {undone.map((t) => (
                          <div key={t.id} className="flex items-center gap-2 text-sm text-faint">
                            <span className="h-3 w-3 shrink-0 rounded-full border border-line" />
                            <span className="line-through">{t.title}</span>
                          </div>
                        ))}
                        {review?.summary && (
                          <p className="mt-2 rounded-lg bg-bg px-3 py-2 text-xs text-muted">
                            {review.summary}
                          </p>
                        )}
                      </div>
                    )}
                  </section>
                );
              })}
            </div>
          )}
        </>
      )}
    </>
  );
}
