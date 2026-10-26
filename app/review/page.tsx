"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { api } from "@/lib/api";
import type { Habit, HabitLog, Review, Task } from "@/db/schema";
import { todayStr } from "@/lib/dates";
import { reviewStreak } from "@/lib/day-rules";
import { EmptyState, PageError, PageHeader, PageLoading } from "@/components/page-header";
import {
  createReviewAutosave, EMPTY_REVIEW, parseReviewDraft, sameReview,
  type ReviewAutosave, type ReviewForm, type ReviewSaveSnapshot,
} from "@/lib/review-autosave";
import { addDays, format, getDay, parseISO } from "date-fns";
import { AlertCircle, Check, CheckCircle2, ChevronLeft, ChevronRight, Copy, Flame, RotateCcw } from "lucide-react";

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
    <div className="page-shell">
      <PageHeader title="复盘" description="记录进展、整理问题，为下一步留出清晰方向。" actions={
        <div role="tablist" aria-label="复盘周期" className="grid w-full grid-cols-3 gap-1 rounded-xl border border-line bg-surface p-1 sm:w-auto">
          {TABS.map((t) => (
            <button
              key={t.key}
              id={`review-tab-${t.key}`}
              type="button"
              role="tab"
              aria-selected={tab === t.key}
              aria-controls={`review-panel-${t.key}`}
              tabIndex={tab === t.key ? 0 : -1}
              onClick={() => setTab(t.key)}
              onKeyDown={(event) => {
                const index = TABS.findIndex((item) => item.key === tab);
                const next = event.key === "ArrowRight" ? (index + 1) % TABS.length
                  : event.key === "ArrowLeft" ? (index + TABS.length - 1) % TABS.length
                    : event.key === "Home" ? 0 : event.key === "End" ? TABS.length - 1 : -1;
                if (next < 0) return;
                event.preventDefault();
                setTab(TABS[next].key);
                document.getElementById(`review-tab-${TABS[next].key}`)?.focus();
              }}
              className={`min-h-9 rounded-lg px-4 py-2 text-sm font-medium whitespace-nowrap transition-colors ${
                tab === t.key ? "bg-ink text-on-ink" : "text-muted hover:bg-bg hover:text-ink"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      } />

      <section role="tabpanel" id={`review-panel-${tab}`} aria-labelledby={`review-tab-${tab}`}>
        {tab === "day" && <DayReview />}
        {tab === "week" && <PeriodReview period="week" />}
        {tab === "month" && <PeriodReview period="month" />}
      </section>
    </div>
  );
}

// ================= 日复盘 =================
const reviewSessions = new Map<string, { autosave: ReviewAutosave; notice: string | null }>();
const loadingSnapshot: ReviewSaveSnapshot = {
  form: EMPTY_REVIEW, savedForm: EMPTY_REVIEW, status: "idle", conflict: false,
  hasPending: false, hasSaved: false, error: null, draftError: null,
};
const subscribeNothing = () => () => {};
const getLoadingSnapshot = () => loadingSnapshot;

function toReviewForm(review: Review | null): ReviewForm {
  return {
    doneText: review?.doneText ?? "", problemText: review?.problemText ?? "",
    tomorrowText: review?.tomorrowText ?? "", mood: review?.mood ?? 0, summary: review?.summary ?? "",
  };
}

function getReviewSession(date: string, review: Review | null) {
  const existing = reviewSessions.get(date);
  if (existing && (existing.autosave.snapshot().hasPending || sameReview(existing.autosave.snapshot().savedForm, toReviewForm(review)))) return existing;
  const key = `workbench:review-draft:${date}`;
  let draft = null;
  let notice = null;
  try {
    const raw = (window.workbench?.reviewDrafts ?? window.localStorage).getItem(key);
    draft = parseReviewDraft(raw, date);
    if (raw && !draft) notice = "本机草稿格式异常，原记录仍保留，请先核对已保存内容。";
    else if (draft && !sameReview(draft.form, toReviewForm(review))) notice = "已恢复本机未保存的草稿。";
  } catch {
    notice = "无法读取本机草稿，请确认保存成功后再离开。";
  }
  const autosave = createReviewAutosave({
    date, draft,
    server: review ? { form: toReviewForm(review), updatedAt: review.updatedAt } : null,
    save: (form) => api<Review>("/api/reviews", { method: "POST", json: { date, ...form, mood: form.mood || null } }),
    writeDraft: (value) => (window.workbench?.reviewDrafts ?? window.localStorage).setItem(key, JSON.stringify(value)),
    removeDraft: (form) => {
      const storage = window.workbench?.reviewDrafts ?? window.localStorage;
      const current = parseReviewDraft(storage.getItem(key), date);
      if (current && sameReview(current.form, form)) storage.removeItem(key);
    },
  });
  const session = { autosave, notice };
  reviewSessions.set(date, session);
  return session;
}

function DayReview() {
  const [today] = useState(todayStr);
  const [session, setSession] = useState<ReviewAutosave | null>(null);
  const [history, setHistory] = useState<Review[]>([]);
  const [doneTasks, setDoneTasks] = useState<Task[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const state = useSyncExternalStore(
    session?.subscribe ?? subscribeNothing,
    session?.snapshot ?? getLoadingSnapshot,
    getLoadingSnapshot,
  );
  const form = state.form;

  useEffect(() => {
    let active = true;
    Promise.all([
      api<Review | null>(`/api/reviews?date=${today}`),
      api<Review[]>("/api/reviews").catch(() => []),
      api<Task[]>("/api/tasks?filter=today").catch(() => []),
    ])
      .then(([review, list, tasks]) => {
        if (!active) return;
        const loaded = getReviewSession(today, review);
        setSession(loaded.autosave);
        setNotice(loaded.notice);
        setHistory(list.filter((item) => item.date !== today));
        setDoneTasks(tasks.filter((task) => task.status === "done"));
        setLoadError(null);
      })
      .catch(() => {
        if (active) setLoadError("复盘读取失败，本机草稿会保留。请重新加载后继续编辑。");
      });
    return () => { active = false; };
  }, [today, reload]);

  useEffect(() => {
    if (!session || state.status !== "pending" || state.conflict) return;
    const timer = window.setTimeout(() => { void session.flush(); }, 800);
    return () => window.clearTimeout(timer);
  }, [session, state.form, state.status, state.conflict]);

  useEffect(() => {
    if (!session) return;
    const flush = () => { void session.flush(); };
    const onVisibility = () => { if (document.visibilityState === "hidden") flush(); };
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!session.snapshot().hasPending) return;
      flush();
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onVisibility);
      flush();
    };
  }, [session]);

  const update = (patch: Partial<ReviewForm>) => {
    if (session) session.edit({ ...session.snapshot().form, ...patch });
  };
  const savedToday = state.hasSaved;
  const streak = reviewStreak([...history.map((review) => review.date), ...(savedToday ? [today] : [])], today);
  const statusLabel = !session ? "正在加载，暂时无法编辑" : {
    idle: "编辑后自动保存", pending: "待保存", saving: "保存中…", saved: "已保存", error: "保存失败",
  }[state.status];

  const field = (
    label: string,
    key: "doneText" | "problemText" | "tomorrowText",
    placeholder: string
  ) => (
    <div className={`card p-5 ${key === "doneText" ? "md:col-span-2" : ""}`}>
      <label htmlFor={`review-${key}`} className="mb-3 block text-sm font-medium">{label}</label>
      {key === "doneText" && doneTasks.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {doneTasks.map((t) => (
            <span key={t.id} className="rounded-md bg-bg px-2 py-1 text-xs text-muted">
              ✓ {t.title}
            </span>
          ))}
        </div>
      )}
      <textarea
        id={`review-${key}`}
        value={form[key]}
        onChange={(e) => update({ [key]: e.target.value })}
        placeholder={placeholder}
        rows={3}
        className="min-h-28 w-full resize-y rounded-lg bg-transparent text-sm leading-7 outline-none placeholder:text-faint"
      />
    </div>
  );

  return (
    <>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 border-b border-line pb-4">
        <p className="text-sm text-muted tnum">
          {today} ·{" "}
          <span id="review-save-status" role="status" aria-live="polite" className={`inline-flex items-center gap-1 ${state.status === "error" ? "text-danger" : "text-muted"}`}>
            {state.status === "saved" && <CheckCircle2 size={13} />}{statusLabel}
          </span>
        </p>
        {streak > 0 && (
          <span className="flex items-center gap-1.5 rounded-lg bg-accent-soft px-3 py-1.5 text-xs font-medium text-accent">
            <Flame size={13} /> 连续 {streak} 天
          </span>
        )}
      </div>

      {loadError && (
        <div role="alert" className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface p-4 text-sm">
          <AlertCircle size={16} className="shrink-0 text-danger" />
          <span className="flex-1">{loadError}</span>
          <button type="button" onClick={() => setReload((value) => value + 1)} className="btn-ghost"><RotateCcw size={13} />重新加载</button>
        </div>
      )}
      {(notice || state.draftError) && (
        <p role="status" className="mb-4 rounded-xl border border-line bg-surface px-4 py-3 text-xs leading-6 text-muted">{state.draftError ?? notice}</p>
      )}
      {state.conflict && (
        <div role="alert" className="mb-4 rounded-xl border border-line bg-surface p-4 text-sm">
          <p className="font-medium">本机草稿与已保存内容不同</p>
          <p className="mt-1 text-xs leading-6 text-muted">下方显示本机草稿。已保存内容也有变化，请核对后选择，再继续编辑。</p>
          <details className="mt-2 text-xs text-muted">
            <summary className="cursor-pointer py-1">查看已保存内容</summary>
            <div className="mt-2 space-y-2 whitespace-pre-wrap rounded-lg bg-bg p-3">
              <p>完成：{state.savedForm.doneText || "未填写"}</p>
              <p>问题：{state.savedForm.problemText || "未填写"}</p>
              <p>明日：{state.savedForm.tomorrowText || "未填写"}</p>
              <p>总结：{state.savedForm.summary || "未填写"}</p>
              <p>心情：{MOOD_LABEL[state.savedForm.mood] || "未填写"}</p>
            </div>
          </details>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={() => session?.resolveConflict("draft")} className="btn-primary">保留草稿并保存</button>
            <button type="button" onClick={() => session?.resolveConflict("server")} className="btn-ghost">使用已保存内容，放弃草稿</button>
          </div>
        </div>
      )}
      {state.error && (
        <div role="alert" className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface p-4 text-sm">
          <span className="flex-1 text-danger">{state.error}</span>
          <button type="button" onClick={() => { void session?.flush(); }} className="btn-ghost"><RotateCcw size={13} />重新保存</button>
        </div>
      )}

      <fieldset disabled={!session || !!loadError || state.conflict} aria-describedby="review-save-status" className="grid min-w-0 gap-4 disabled:opacity-60 md:grid-cols-2">
        {field("今天完成了什么？", "doneText", "记录今天的进展与成果…")}
        {field("遇到什么问题 / 没完成什么？", "problemText", "阻碍、卡点、遗留…")}
        {field("明天最重要的 1-3 件事？", "tomorrowText", "给明天的自己留个指引…")}

        <div className="card min-w-0 p-5 md:col-span-2">
          <p id="review-mood-label" className="mb-3 text-sm font-medium">今日心情</p>
          <div role="group" aria-labelledby="review-mood-label" className="flex flex-wrap gap-2">
            {MOODS.map((m, i) => (
              <button
                key={i}
                type="button"
                aria-label={MOOD_LABEL[i + 1]}
                aria-pressed={form.mood === i + 1}
                onClick={() => update({ mood: i + 1 })}
                className={`min-h-11 min-w-11 rounded-lg border px-3 py-2 text-xl transition-colors ${
                  form.mood === i + 1 ? "border-accent bg-accent-soft" : "border-line hover:bg-bg"
                }`}
              >
                {m}
              </button>
            ))}
          </div>
          <label htmlFor="review-summary" className="mb-2 mt-5 block text-sm font-medium">一句话总结今天</label>
          <input
            id="review-summary"
            value={form.summary}
            onChange={(e) => update({ summary: e.target.value })}
            placeholder="一句话总结今天…"
            className="input"
          />
        </div>
      </fieldset>

      {history.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-4 text-sm font-semibold">历史复盘</h2>
          <div className="overflow-hidden rounded-xl border border-line bg-surface">
            {history.slice(0, 14).map((r) => (
              <details key={r.id} className="border-b border-line px-4 py-4 last:border-b-0 sm:px-5">
                <summary className="flex min-h-7 cursor-pointer items-center gap-3 text-sm">
                  <span className="font-medium tnum">{r.date}</span>
                  {r.mood && <span>{MOODS[r.mood - 1]}</span>}
                  <span className="min-w-0 flex-1 truncate text-muted">{r.summary || "展开查看"}</span>
                </summary>
                <div className="mt-3 space-y-3 whitespace-pre-wrap break-words border-t border-line pt-4 text-sm leading-7 text-muted">
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
  const [report, setReport] = useState<{ key: string; data: ReportData | null; error: string | null } | null>(null);
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const key = `${period}:${offset}`;
  const data = report?.key === key ? report.data : null;
  const error = report?.key === key ? report.error : null;

  useEffect(() => {
    let active = true;
    api<ReportData>(`/api/report?period=${period}&offset=${offset}`)
      .then((data) => { if (active) setReport({ key, data, error: null }); })
      .catch(() => { if (active) setReport({ key, data: null, error: "复盘统计加载失败，请重试。" }); });
    return () => { active = false; };
  }, [key, period, offset, reload]);

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
    try {
      await navigator.clipboard.writeText(lines.filter((l): l is string => l !== null).join("\n"));
      setCopyError(null);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopyError("复制未完成，请检查剪贴板权限后重试。");
    }
  };

  return (
    <>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm font-medium text-muted tnum">{data?.range.label.replace(/[\u2013\u2014]/g, "-") ?? "正在加载统计"}</p>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => setOffset((v) => v - 1)} className="btn-ghost px-2" title={period === "week" ? "上一周" : "上一月"} aria-label={period === "week" ? "上一周" : "上一月"}>
            <ChevronLeft size={16} />
          </button>
          {offset !== 0 && (
            <button type="button" onClick={() => setOffset(0)} className="btn-ghost text-xs">
              {period === "week" ? "回到本周" : "回到本月"}
            </button>
          )}
          <button
            type="button"
            onClick={() => setOffset((v) => Math.min(0, v + 1))}
            disabled={offset === 0}
            className="btn-ghost px-2 disabled:opacity-40"
            title={period === "week" ? "下一周" : "下一月"}
            aria-label={period === "week" ? "下一周" : "下一月"}
          >
            <ChevronRight size={16} />
          </button>
          <button type="button" disabled={!data} onClick={copyMarkdown} className="btn-primary gap-1.5 text-xs">
            {copied ? <Check size={14} /> : <Copy size={14} />}
            {copied ? "已复制" : "复制 Markdown"}
          </button>
        </div>
      </div>
      {copyError && <p role="alert" className="mb-4 text-sm text-danger">{copyError}</p>}

      {!data ? error ? (
        <PageError message={error} onRetry={() => setReload((value) => value + 1)} />
      ) : (
        <PageLoading rows={4} />
      ) : (
        <>
          <dl className="mb-6 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-4">
            <div className="bg-surface p-4 sm:p-5">
              <dt className="text-xs text-muted">完成任务</dt>
              <dd className="mt-2 text-2xl font-semibold tnum">
                {data.stats.tasksDone}
                <span className="text-sm font-normal text-faint">/{data.stats.tasksTotal}</span>
              </dd>
            </div>
            <div className="bg-surface p-4 sm:p-5">
              <dt className="text-xs text-muted">复盘天数</dt>
              <dd className="mt-2 text-2xl font-semibold tnum">
                {data.stats.reviewDays}
                <span className="text-sm font-normal text-faint">/{days.length}</span>
              </dd>
            </div>
            <div className="bg-surface p-4 sm:p-5">
              <dt className="text-xs text-muted">习惯打卡</dt>
              <dd className="mt-2 text-2xl font-semibold tnum">
                {data.stats.habitCheckins}
                <span className="text-sm font-normal text-faint"> 次</span>
              </dd>
            </div>
            <div className="bg-surface p-4 sm:p-5">
              <dt className="text-xs text-muted">平均心情</dt>
              <dd className="mt-2 text-2xl font-semibold tnum">
                {data.stats.avgMood !== null ? data.stats.avgMood.toFixed(1) : "--"}
                <span className="text-sm font-normal text-faint">/5</span>
              </dd>
            </div>
          </dl>

          {shownDays.length === 0 ? (
            <EmptyState title={`本${period === "week" ? "周" : "月"}暂无记录`} description="完成任务、写下复盘或打卡后，会在这里汇总。" />
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
                    <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
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
                          <div key={t.id} className="flex items-start gap-2 text-sm leading-6">
                            <Check size={13} className="mt-1.5 shrink-0 text-ink" />
                            <span className="min-w-0 break-words">{t.title}</span>
                          </div>
                        ))}
                        {undone.map((t) => (
                          <div key={t.id} className="flex items-start gap-2 text-sm leading-6 text-muted">
                            <span className="mt-1.5 h-3 w-3 shrink-0 rounded-full border border-line" />
                            <span className="min-w-0 break-words line-through">{t.title}</span>
                          </div>
                        ))}
                        {review?.summary && (
                          <p className="mt-3 whitespace-pre-wrap break-words rounded-lg bg-bg px-3 py-3 text-sm leading-6 text-muted">
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
