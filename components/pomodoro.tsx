"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/api";
import type { Task, Pomodoro } from "@/db/schema";
import { findNextCourse, type CourseScheduleData } from "@/lib/course-schedule";
import {
  clearPomodoroSession,
  readPomodoroSession,
  savePomodoroSession,
  type PomodoroSession,
} from "@/lib/pomodoro-session";
import { AlarmClock, Pause, Play, RotateCcw, Timer } from "lucide-react";

const FOCUS_MIN = 25;

function fmt(sec: number) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

// 侧边栏内嵌番茄钟。collapsed 时显示为图标按钮，点击展开侧边栏。
export default function Pomodoro({
  collapsed,
  onExpand,
}: {
  collapsed: boolean;
  onExpand: () => void;
}) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [taskId, setTaskId] = useState<number | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(FOCUS_MIN * 60);
  const [running, setRunning] = useState(false);
  const [todayCount, setTodayCount] = useState(0);
  const [schedule, setSchedule] = useState<CourseScheduleData | null>(null);
  const [clock, setClock] = useState(() => Date.now());
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<PomodoroSession | null>(null);
  const [saving, setSaving] = useState(false);
  const endAtRef = useRef<number>(0);
  const finishingSession = useRef<string | null>(null);

  const loadCount = useCallback(async () => {
    try {
      const rows = await api<Pomodoro[]>("/api/pomodoros");
      setTodayCount(rows.length);
    } catch {
      setError("今日专注记录暂时无法读取。");
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(loadCount, 0);
    return () => window.clearTimeout(timer);
  }, [loadCount]);

  const loadSchedule = useCallback(() => {
    api<CourseScheduleData>("/api/courses").then(setSchedule).catch(() => setSchedule(null));
  }, []);

  useEffect(() => {
    const initialLoad = window.setTimeout(loadSchedule, 0);
    const refreshClock = () => setClock(Date.now());
    const clockTimer = window.setInterval(refreshClock, 30_000);
    const scheduleTimer = window.setInterval(loadSchedule, 5 * 60_000);
    window.addEventListener("focus", loadSchedule);
    window.addEventListener("course-settings-updated", loadSchedule);
    return () => {
      window.clearTimeout(initialLoad);
      window.clearInterval(clockTimer);
      window.clearInterval(scheduleTimer);
      window.removeEventListener("focus", loadSchedule);
      window.removeEventListener("course-settings-updated", loadSchedule);
    };
  }, [loadSchedule]);

  const nextCourse = useMemo(
    () => (schedule ? findNextCourse(schedule, new Date(clock)) : null),
    [clock, schedule]
  );

  // 每堂课只提醒一次；localStorage 防止刷新页面后重复弹出。
  useEffect(() => {
    if (!schedule?.reminderEnabled || !nextCourse) return;
    const millisecondsLeft = nextCourse.startAt.getTime() - clock;
    if (millisecondsLeft <= 0 || millisecondsLeft > schedule.reminderMinutes * 60_000) return;
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return;

    const date = nextCourse.startAt.toLocaleDateString("sv-SE");
    const key = `course-reminder:${date}:${nextCourse.course.id}:${nextCourse.startPeriod}`;
    if (window.localStorage.getItem(key)) return;

    const minutesLeft = Math.max(1, Math.ceil(millisecondsLeft / 60_000));
    const location = nextCourse.location ? `，地点：${nextCourse.location}` : "";
    new Notification(`${minutesLeft} 分钟后上课`, {
      body: `${nextCourse.course.name}${location}`,
    });
    window.localStorage.setItem(key, new Date(clock).toISOString());
  }, [clock, nextCourse, schedule]);

  useEffect(() => {
    if (collapsed) return;
    let active = true;
    const refresh = () => {
      api<Task[]>("/api/tasks?filter=today")
        .then((items) => { if (active) setTasks(items.filter((task) => task.status !== "done")); })
        .catch(() => { if (active) setError("任务暂时无法读取，仍可直接开始专注。"); });
    };
    refresh();
    window.addEventListener("focus", refresh);
    return () => { active = false; window.removeEventListener("focus", refresh); };
  }, [collapsed]);

  const finish = useCallback(async (completed: PomodoroSession) => {
    if (finishingSession.current === completed.sessionId) return;
    finishingSession.current = completed.sessionId;
    setSaving(true);
    try {
      await api("/api/pomodoros", {
        method: "POST",
        json: { taskId: completed.taskId, minutes: FOCUS_MIN, sessionId: completed.sessionId },
      });
      clearPomodoroSession();
      setSession(null);
      setSecondsLeft(FOCUS_MIN * 60);
      setError(null);
      loadCount();
      if (typeof Notification !== "undefined") {
        if (Notification.permission === "granted") {
          new Notification("番茄钟完成", { body: "休息 5 分钟，喝口水。" });
        } else if (Notification.permission !== "denied") {
          Notification.requestPermission();
        }
      }
    } catch {
      setError("本次专注已结束，记录待保存。联网后可安全重试。");
    } finally {
      setSaving(false);
      finishingSession.current = null;
    }
  }, [loadCount]);

  const completeSession = useCallback((current: PomodoroSession) => {
    const pending: PomodoroSession = {
      ...current,
      status: "pending",
      secondsLeft: 0,
      endsAt: null,
      updatedAt: Date.now(),
    };
    savePomodoroSession(pending);
    setSession(pending);
    setSecondsLeft(0);
    setRunning(false);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const saved = readPomodoroSession();
      if (!saved) return;
      setSession(saved);
      setTaskId(saved.taskId);
      if (saved.status === "running") {
        const seconds = Math.max(0, Math.ceil(((saved.endsAt ?? Date.now()) - Date.now()) / 1000));
        endAtRef.current = saved.endsAt ?? Date.now();
        if (seconds === 0) completeSession(saved);
        else {
          setSecondsLeft(seconds);
          setRunning(true);
        }
        return;
      }
      setSecondsLeft(saved.secondsLeft);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [completeSession]);

  useEffect(() => {
    if (session?.status !== "pending") return;
    const timer = window.setTimeout(() => { void finish(session); }, 0);
    return () => window.clearTimeout(timer);
  }, [finish, session]);

  // 计时主循环（用截止时间戳，后台标签页也准）
  useEffect(() => {
    if (!running || session?.status !== "running") return;
    const tick = setInterval(() => {
      const left = Math.max(0, Math.round((endAtRef.current - Date.now()) / 1000));
      setSecondsLeft(left);
      if (left <= 0) {
        clearInterval(tick);
        completeSession(session);
      }
    }, 500);
    return () => clearInterval(tick);
  }, [completeSession, running, session]);

  const start = () => {
    if (saving || session?.status === "pending" || secondsLeft <= 0) return;
    setError(null);
    const endsAt = Date.now() + secondsLeft * 1000;
    const nextSession: PomodoroSession = {
      version: 1,
      sessionId: session?.sessionId ?? crypto.randomUUID(),
      taskId,
      status: "running",
      secondsLeft,
      endsAt,
      updatedAt: Date.now(),
    };
    endAtRef.current = endsAt;
    setSession(nextSession);
    savePomodoroSession(nextSession);
    setRunning(true);
    if (typeof Notification !== "undefined" && Notification.permission === "default") {
      Notification.requestPermission();
    }
  };

  const pause = () => {
    if (!session || session.status !== "running") return;
    const seconds = Math.max(0, Math.round((endAtRef.current - Date.now()) / 1000));
    if (seconds === 0) {
      completeSession(session);
      return;
    }
    const paused: PomodoroSession = { ...session, status: "paused", secondsLeft: seconds, endsAt: null, updatedAt: Date.now() };
    savePomodoroSession(paused);
    setSession(paused);
    setSecondsLeft(seconds);
    setRunning(false);
  };

  const reset = () => {
    if (saving) return;
    clearPomodoroSession();
    setSession(null);
    setRunning(false);
    setSecondsLeft(FOCUS_MIN * 60);
  };

  const chooseTask = (nextTaskId: number | null) => {
    setTaskId(nextTaskId);
    if (session?.status !== "paused") return;
    const updated = { ...session, taskId: nextTaskId, updatedAt: Date.now() };
    savePomodoroSession(updated);
    setSession(updated);
  };

  const active = running || secondsLeft < FOCUS_MIN * 60;
  const overlapsNextCourse =
    !!nextCourse && clock + secondsLeft * 1000 >= nextCourse.startAt.getTime();

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={onExpand}
        title={active ? `番茄钟 ${fmt(secondsLeft)}` : "番茄钟"}
        aria-label={active ? `展开番茄钟，剩余 ${fmt(secondsLeft)}` : "展开番茄钟"}
        className={`mx-2 mb-3 flex min-h-10 items-center justify-center rounded-lg py-2 transition-colors ${
          running ? "bg-ink text-on-ink" : "text-muted hover:bg-bg hover:text-ink"
        }`}
      >
        <Timer size={17} strokeWidth={1.8} />
      </button>
    );
  }

  return (
    <section aria-label="番茄钟" className="mx-3 mb-3 rounded-xl border border-line bg-bg p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-xs font-medium text-muted">
          <Timer size={13} /> 番茄钟
        </span>
        <span className="text-[11px] text-muted tnum">今日 {todayCount} 个</span>
      </div>

      <div className="mb-3 text-center" aria-label={`剩余时间 ${fmt(secondsLeft)}`}>
        <span
          className={`text-[32px] leading-none font-semibold tracking-tight tnum ${running ? "text-ink" : "text-muted"}`}
        >
          {fmt(secondsLeft)}
        </span>
      </div>

      <label htmlFor="pomodoro-task" className="mb-1.5 block text-[11px] font-medium text-muted">专注任务</label>
      <select
        id="pomodoro-task"
        value={taskId ?? ""}
        onChange={(e) => chooseTask(e.target.value ? Number(e.target.value) : null)}
        className="input mb-2 text-xs"
        disabled={running || saving || session?.status === "pending"}
      >
        <option value="">不绑定任务</option>
        {tasks.map((t) => (
          <option key={t.id} value={t.id}>
            {t.title}
          </option>
        ))}
      </select>

      {nextCourse && (
        <div
          className={`mb-2 flex gap-2 rounded-lg px-2 py-2 text-[11px] leading-5 ${
            overlapsNextCourse ? "bg-accent-soft text-accent" : "bg-surface text-muted"
          }`}
          title={overlapsNextCourse ? "当前专注时长会跨过上课时间" : "今天的下一堂课"}
        >
          <AlarmClock size={12} className="mt-0.5 shrink-0" />
          <span className="min-w-0">
            <span className="block truncate">{nextCourse.startAt.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })} {nextCourse.course.name}</span>
            {nextCourse.location && <span className="block truncate">{nextCourse.location}</span>}
            {overlapsNextCourse && <span className="block">本轮专注会跨过上课时间</span>}
          </span>
        </div>
      )}

      <div className="flex gap-1.5">
        {running ? (
          <button type="button" onClick={pause} disabled={saving} className="btn-primary flex-1 justify-center gap-1 text-xs">
            <Pause size={12} /> 暂停
          </button>
        ) : session?.status === "pending" ? (
          <button type="button" onClick={() => void finish(session)} disabled={saving} className="btn-primary flex-1 justify-center gap-1 text-xs">
            <RotateCcw size={12} /> {saving ? "正在保存…" : "重试保存"}
          </button>
        ) : (
          <button type="button" onClick={start} disabled={saving} className="btn-primary flex-1 justify-center gap-1 text-xs">
            <Play size={12} /> {active ? "继续" : "开始专注"}
          </button>
        )}
        <button type="button" onClick={reset} disabled={saving} className="btn-ghost px-2" title="重置" aria-label="重置番茄钟">
          <RotateCcw size={13} />
        </button>
      </div>
      {error && <p role="status" className="mt-2 text-[11px] leading-5 text-danger">{error}</p>}
    </section>
  );
}
