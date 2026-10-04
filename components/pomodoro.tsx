"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/api";
import type { Task, Pomodoro } from "@/db/schema";
import { findNextCourse, type CourseScheduleData } from "@/lib/course-schedule";
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
  const endAtRef = useRef<number>(0);

  const loadCount = useCallback(async () => {
    const rows = await api<Pomodoro[]>("/api/pomodoros");
    setTodayCount(rows.length);
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
    api<Task[]>("/api/tasks?filter=today").then((ts) =>
      setTasks(ts.filter((t) => t.status !== "done"))
    );
  }, [collapsed]);

  const finish = useCallback(async () => {
    await api("/api/pomodoros", {
      method: "POST",
      json: { taskId, minutes: FOCUS_MIN },
    });
    loadCount();
    if (typeof Notification !== "undefined") {
      if (Notification.permission === "granted") {
        new Notification("番茄钟完成", { body: "休息 5 分钟，喝口水。" });
      } else if (Notification.permission !== "denied") {
        Notification.requestPermission();
      }
    }
  }, [loadCount, taskId]);

  // 计时主循环（用截止时间戳，后台标签页也准）
  useEffect(() => {
    if (!running) return;
    const tick = setInterval(() => {
      const left = Math.max(0, Math.round((endAtRef.current - Date.now()) / 1000));
      setSecondsLeft(left);
      if (left <= 0) {
        clearInterval(tick);
        setRunning(false);
        finish();
      }
    }, 500);
    return () => clearInterval(tick);
  }, [finish, running]);

  const start = () => {
    endAtRef.current = Date.now() + secondsLeft * 1000;
    setRunning(true);
    if (typeof Notification !== "undefined" && Notification.permission === "default") {
      Notification.requestPermission();
    }
  };

  const pause = () => setRunning(false);

  const reset = () => {
    setRunning(false);
    setSecondsLeft(FOCUS_MIN * 60);
  };

  const active = running || secondsLeft < FOCUS_MIN * 60;
  const overlapsNextCourse =
    !!nextCourse && clock + secondsLeft * 1000 >= nextCourse.startAt.getTime();

  if (collapsed) {
    return (
      <button
        onClick={onExpand}
        title={active ? `番茄钟 ${fmt(secondsLeft)}` : "番茄钟"}
        className={`mx-2 mb-3 flex items-center justify-center rounded-lg py-2 transition-colors ${
          running ? "bg-ink text-white" : "text-muted hover:bg-bg hover:text-ink"
        }`}
      >
        <Timer size={17} strokeWidth={1.8} />
      </button>
    );
  }

  return (
    <div className="mx-3 mb-3 rounded-xl border border-line bg-bg p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-xs font-medium text-muted">
          <Timer size={13} /> 番茄钟
        </span>
        <span className="text-[10px] text-faint tnum">今日 {todayCount} 个</span>
      </div>

      <div className="mb-2 text-center">
        <span
          className={`text-3xl font-semibold tracking-tight tnum ${running ? "" : "text-muted"}`}
        >
          {fmt(secondsLeft)}
        </span>
      </div>

      <select
        value={taskId ?? ""}
        onChange={(e) => setTaskId(e.target.value ? Number(e.target.value) : null)}
        className="input mb-2 h-8 text-xs"
        disabled={running}
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
          className={`mb-2 flex gap-1.5 rounded-lg px-2 py-1.5 text-[10px] ${
            overlapsNextCourse ? "bg-amber-50 text-amber-700" : "bg-surface text-faint"
          }`}
          title={overlapsNextCourse ? "当前专注时长会跨过上课时间" : "今天的下一堂课"}
        >
          <AlarmClock size={12} className="mt-0.5 shrink-0" />
          <span className="min-w-0 truncate">
            {nextCourse.startAt.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}
            {" "}{nextCourse.course.name}
            {nextCourse.location ? ` · ${nextCourse.location}` : ""}
            {overlapsNextCourse ? " · 本轮会跨过上课时间" : ""}
          </span>
        </div>
      )}

      <div className="flex gap-1.5">
        {running ? (
          <button onClick={pause} className="btn-primary flex-1 gap-1 py-1.5 text-xs">
            <Pause size={12} /> 暂停
          </button>
        ) : (
          <button onClick={start} className="btn-primary flex-1 gap-1 py-1.5 text-xs">
            <Play size={12} /> {active ? "继续" : "开始专注"}
          </button>
        )}
        <button onClick={reset} className="btn-ghost px-2 py-1.5" title="重置">
          <RotateCcw size={13} />
        </button>
      </div>
    </div>
  );
}
