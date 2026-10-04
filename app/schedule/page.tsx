"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import type { Course, CourseOverride } from "@/db/schema";
import { WEEKDAY_CN } from "@/lib/dates";
import type { CourseScheduleData } from "@/lib/course-schedule";
import { addDays, differenceInCalendarDays, format, parseISO } from "date-fns";
import { ChevronLeft, ChevronRight, Pencil, Plus, Settings2, Trash2, Undo2 } from "lucide-react";

const PERIODS = 12;
const ROW_H = 44; // 每节课的像素高度
const PALETTE = ["#6366f1", "#0ea5e9", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#14b8a6"];

type Data = CourseScheduleData;

type Cell = {
  course: Course;
  dayOfWeek: number;
  startPeriod: number;
  endPeriod: number;
  location: string | null;
  override?: CourseOverride; // custom 调整
};

function courseColor(c: Course) {
  return c.color ?? PALETTE[c.id % PALETTE.length];
}

function inWeek(c: Course, w: number) {
  if (w < c.startWeek || w > c.endWeek) return false;
  if (c.weekType === "odd" && w % 2 === 0) return false;
  if (c.weekType === "even" && w % 2 === 1) return false;
  return true;
}

// 根据第几周解析每门课当天的真实格子
function resolveWeek(data: Data, week: number): Cell[] {
  const cells: Cell[] = [];
  for (const c of data.courses) {
    const ov = data.overrides.find((o) => o.courseId === c.id && o.week === week);
    if (ov?.action === "cancel") continue;
    if (ov?.action === "custom") {
      cells.push({
        course: c,
        dayOfWeek: ov.dayOfWeek ?? c.dayOfWeek,
        startPeriod: ov.startPeriod ?? c.startPeriod,
        endPeriod: ov.endPeriod ?? c.endPeriod,
        location: ov.location ?? c.location,
        override: ov,
      });
      continue;
    }
    if (!inWeek(c, week)) continue;
    cells.push({
      course: c,
      dayOfWeek: c.dayOfWeek,
      startPeriod: c.startPeriod,
      endPeriod: c.endPeriod,
      location: c.location,
    });
  }
  return cells;
}

export default function SchedulePage() {
  const [data, setData] = useState<Data | null>(null);
  const [week, setWeek] = useState(1);
  const [editing, setEditing] = useState<Course | "new" | null>(null);
  const [showSettings, setShowSettings] = useState(false);

  const load = useCallback(async () => {
    const d = await api<Data>("/api/courses");
    setData(d);
    // 默认定位到当前周
    if (d.semesterStart) {
      const w = Math.floor(differenceInCalendarDays(new Date(), parseISO(d.semesterStart)) / 7) + 1;
      setWeek(Math.min(Math.max(w, 1), d.totalWeeks));
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(load, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const cells = useMemo(() => (data ? resolveWeek(data, week) : []), [data, week]);

  const dayDate = (day: number) =>
    data?.semesterStart
      ? format(addDays(parseISO(data.semesterStart), (week - 1) * 7 + (day - 1)), "M/d")
      : null;

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">课程表</h1>
          <p className="mt-1 text-sm text-muted tnum">
            {data?.semesterStart
              ? `第 ${week} 周 · ${format(addDays(parseISO(data.semesterStart), (week - 1) * 7), "M月d日")} 起`
              : `第 ${week} 周 · 未设置开学日期`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setWeek((w) => Math.max(1, w - 1))} className="btn-ghost px-2" title="上一周">
            <ChevronLeft size={16} />
          </button>
          <span className="min-w-16 text-center text-sm tnum">第 {week} 周</span>
          <button
            onClick={() => setWeek((w) => Math.min(data?.totalWeeks ?? 20, w + 1))}
            className="btn-ghost px-2"
            title="下一周"
          >
            <ChevronRight size={16} />
          </button>
          <button onClick={() => setShowSettings(true)} className="btn-ghost" title="学期设置">
            <Settings2 size={15} />
          </button>
          <button onClick={() => setEditing("new")} className="btn-primary gap-1.5 text-xs">
            <Plus size={14} /> 添加课程
          </button>
        </div>
      </header>

      {/* 周视图网格 */}
      <div className="card overflow-x-auto p-3">
        <div className="min-w-[720px]">
          {/* 表头 */}
          <div className="grid grid-cols-[44px_repeat(7,1fr)] gap-1 pb-1">
            <div />
            {WEEKDAY_CN.map((w, i) => (
              <div key={w} className="text-center">
                <div className="text-xs font-medium">周{w}</div>
                <div className="text-[10px] text-faint tnum">{dayDate(i + 1) ?? " "}</div>
              </div>
            ))}
          </div>
          {/* 主体 */}
          <div className="grid grid-cols-[44px_repeat(7,1fr)] gap-1">
            {/* 节次列 */}
            <div className="relative" style={{ height: PERIODS * ROW_H }}>
              {Array.from({ length: PERIODS }, (_, i) => (
                <div
                  key={i}
                  className="absolute left-0 right-0 text-center text-[10px] text-faint tnum"
                  style={{ top: i * ROW_H, height: ROW_H, lineHeight: `${ROW_H}px` }}
                >
                  {i + 1}
                </div>
              ))}
            </div>
            {/* 7 天列 */}
            {Array.from({ length: 7 }, (_, d) => (
              <div
                key={d}
                className="relative rounded-lg bg-bg/60"
                style={{
                  height: PERIODS * ROW_H,
                  backgroundImage: `repeating-linear-gradient(to bottom, transparent 0, transparent ${ROW_H - 1}px, var(--color-line, #e4e4e7) ${ROW_H - 1}px, var(--color-line, #e4e4e7) ${ROW_H}px)`,
                }}
              >
                {cells
                  .filter((c) => c.dayOfWeek === d + 1)
                  .map((cell) => {
                    const color = courseColor(cell.course);
                    const top = (cell.startPeriod - 1) * ROW_H + 1;
                    const height = (cell.endPeriod - cell.startPeriod + 1) * ROW_H - 3;
                    return (
                      <button
                        key={`${cell.course.id}-${cell.override?.id ?? "r"}`}
                        onClick={() => setEditing(cell.course)}
                        className="absolute left-0.5 right-0.5 overflow-hidden rounded-md border-l-2 px-1.5 py-1 text-left transition-transform hover:scale-[1.02] active:scale-[0.99]"
                        style={{
                          top,
                          height,
                          borderColor: color,
                          background: `${color}14`,
                        }}
                      >
                        <div className="truncate text-[11px] font-medium leading-tight">
                          {cell.course.name}
                          {cell.override && <span className="ml-1 text-[9px] text-faint">调</span>}
                        </div>
                        {height >= 40 && cell.location && (
                          <div className="mt-0.5 truncate text-[10px] text-faint">{cell.location}</div>
                        )}
                        {height >= 56 && cell.course.teacher && (
                          <div className="truncate text-[10px] text-faint">{cell.course.teacher}</div>
                        )}
                      </button>
                    );
                  })}
              </div>
            ))}
          </div>
        </div>
        {data && data.courses.length === 0 && (
          <p className="py-8 text-center text-xs text-faint">还没有课程，点右上角「添加课程」开始</p>
        )}
      </div>

      {/* 单双周说明 */}
      {data && data.courses.some((c) => c.weekType !== "all") && (
        <p className="mt-3 text-[11px] text-faint">带单/双周设置的课程只在对应周显示，当前为第 {week} 周（{week % 2 === 1 ? "单" : "双"}周）。</p>
      )}

      {editing && (
        <CourseModal
          course={editing === "new" ? null : editing}
          data={data!}
          week={week}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
          }}
        />
      )}
      {showSettings && data && (
        <SettingsModal
          data={data}
          onClose={() => setShowSettings(false)}
          onSaved={() => {
            setShowSettings(false);
            load();
          }}
        />
      )}
    </div>
  );
}

// ---------- 课程编辑 / 新建弹窗 ----------
function CourseModal({
  course,
  data,
  week,
  onClose,
  onSaved,
}: {
  course: Course | null;
  data: Data;
  week: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isNew = !course;
  const [form, setForm] = useState({
    name: course?.name ?? "",
    teacher: course?.teacher ?? "",
    location: course?.location ?? "",
    color: course?.color ?? PALETTE[0],
    dayOfWeek: course?.dayOfWeek ?? 1,
    startPeriod: course?.startPeriod ?? 1,
    endPeriod: course?.endPeriod ?? 2,
    startWeek: course?.startWeek ?? 1,
    endWeek: course?.endWeek ?? data.totalWeeks,
    weekType: course?.weekType ?? "all",
  });
  // 本周微调表单
  const existingOv = course ? data.overrides.find((o) => o.courseId === course.id && o.week === week) : undefined;
  const [ov, setOv] = useState({
    dayOfWeek: existingOv?.dayOfWeek ?? course?.dayOfWeek ?? 1,
    startPeriod: existingOv?.startPeriod ?? course?.startPeriod ?? 1,
    endPeriod: existingOv?.endPeriod ?? course?.endPeriod ?? 2,
    location: existingOv?.location ?? course?.location ?? "",
  });

  const save = async () => {
    if (!form.name.trim()) return;
    if (isNew) {
      await api("/api/courses", { method: "POST", json: form });
    } else {
      await api(`/api/courses/${course.id}`, { method: "PATCH", json: form });
    }
    onSaved();
  };

  const remove = async () => {
    if (!course) return;
    await api(`/api/courses/${course.id}`, { method: "DELETE" });
    onSaved();
  };

  const setOverride = async (kind: "cancel" | "custom") => {
    if (!course) return;
    await api(`/api/courses/${course.id}`, {
      method: "POST",
      json: { action: "override", week, kind, ...ov },
    });
    onSaved();
  };

  const removeOverride = async () => {
    if (!course) return;
    await api(`/api/courses/${course.id}`, { method: "POST", json: { action: "removeOverride", week } });
    onSaved();
  };

  const numInput = (key: keyof typeof form, min: number, max: number) => (
    <input
      type="number"
      min={min}
      max={max}
      value={form[key] as number}
      onChange={(e) => setForm({ ...form, [key]: Number(e.target.value) })}
      className="input h-8 w-full"
    />
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <div
        className="card anim-fade-up max-h-[85vh] w-full max-w-md overflow-y-auto p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-4 text-sm font-semibold">{isNew ? "添加课程" : "编辑课程"}</h2>

        <div className="space-y-3">
          <input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="课程名称"
            className="input"
          />
          <div className="grid grid-cols-2 gap-2">
            <input
              value={form.teacher}
              onChange={(e) => setForm({ ...form, teacher: e.target.value })}
              placeholder="教师（可选）"
              className="input"
            />
            <input
              value={form.location}
              onChange={(e) => setForm({ ...form, location: e.target.value })}
              placeholder="地点（可选）"
              className="input"
            />
          </div>

          <div className="grid grid-cols-3 gap-2">
            <label className="text-xs text-muted">
              星期
              <select
                value={form.dayOfWeek}
                onChange={(e) => setForm({ ...form, dayOfWeek: Number(e.target.value) })}
                className="input mt-1 h-8"
              >
                {WEEKDAY_CN.map((w, i) => (
                  <option key={w} value={i + 1}>周{w}</option>
                ))}
              </select>
            </label>
            <label className="text-xs text-muted">
              开始节次
              <div className="mt-1">{numInput("startPeriod", 1, PERIODS)}</div>
            </label>
            <label className="text-xs text-muted">
              结束节次
              <div className="mt-1">{numInput("endPeriod", 1, PERIODS)}</div>
            </label>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <label className="text-xs text-muted">
              开始周
              <div className="mt-1">{numInput("startWeek", 1, data.totalWeeks)}</div>
            </label>
            <label className="text-xs text-muted">
              结束周
              <div className="mt-1">{numInput("endWeek", 1, data.totalWeeks)}</div>
            </label>
            <label className="text-xs text-muted">
              单双周
              <select
                value={form.weekType}
                onChange={(e) => setForm({ ...form, weekType: e.target.value as Course["weekType"] })}
                className="input mt-1 h-8"
              >
                <option value="all">每周</option>
                <option value="odd">单周</option>
                <option value="even">双周</option>
              </select>
            </label>
          </div>

          <div>
            <div className="mb-1.5 text-xs text-muted">颜色</div>
            <div className="flex gap-2">
              {PALETTE.map((c) => (
                <button
                  key={c}
                  onClick={() => setForm({ ...form, color: c })}
                  className={`h-6 w-6 rounded-full transition-transform ${form.color === c ? "scale-110 ring-2 ring-ink ring-offset-2" : ""}`}
                  style={{ background: c }}
                />
              ))}
            </div>
          </div>
        </div>

        {/* 本周微调 */}
        {!isNew && (
          <div className="mt-5 border-t border-line pt-4">
            <div className="mb-2 text-xs font-medium text-muted">第 {week} 周微调</div>
            {existingOv ? (
              <div className="flex items-center justify-between rounded-lg bg-bg px-3 py-2">
                <span className="text-xs text-muted">
                  {existingOv.action === "cancel"
                    ? "本周已停课"
                    : `本周已调至 周${WEEKDAY_CN[(existingOv.dayOfWeek ?? 1) - 1]} 第${existingOv.startPeriod}-${existingOv.endPeriod}节${existingOv.location ? ` · ${existingOv.location}` : ""}`}
                </span>
                <button onClick={removeOverride} className="btn-ghost gap-1 px-2 py-1 text-xs">
                  <Undo2 size={12} /> 撤销
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="grid grid-cols-4 gap-2">
                  <select
                    value={ov.dayOfWeek}
                    onChange={(e) => setOv({ ...ov, dayOfWeek: Number(e.target.value) })}
                    className="input h-8"
                  >
                    {WEEKDAY_CN.map((w, i) => (
                      <option key={w} value={i + 1}>周{w}</option>
                    ))}
                  </select>
                  <input
                    type="number" min={1} max={PERIODS} value={ov.startPeriod}
                    onChange={(e) => setOv({ ...ov, startPeriod: Number(e.target.value) })}
                    className="input h-8" title="开始节次"
                  />
                  <input
                    type="number" min={1} max={PERIODS} value={ov.endPeriod}
                    onChange={(e) => setOv({ ...ov, endPeriod: Number(e.target.value) })}
                    className="input h-8" title="结束节次"
                  />
                  <input
                    value={ov.location}
                    onChange={(e) => setOv({ ...ov, location: e.target.value })}
                    placeholder="地点"
                    className="input h-8"
                  />
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setOverride("custom")} className="btn-ghost flex-1 text-xs">
                    本周调到上面时间
                  </button>
                  <button onClick={() => setOverride("cancel")} className="btn-ghost flex-1 text-xs">
                    本周停课
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        <div className="mt-5 flex items-center justify-between">
          {!isNew ? (
            <button onClick={remove} className="btn-ghost gap-1 text-xs text-red-500">
              <Trash2 size={13} /> 删除课程
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <button onClick={onClose} className="btn-ghost text-xs">取消</button>
            <button onClick={save} className="btn-primary gap-1 text-xs">
              <Pencil size={12} /> {isNew ? "添加" : "保存"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------- 学期设置弹窗 ----------
function SettingsModal({ data, onClose, onSaved }: { data: Data; onClose: () => void; onSaved: () => void }) {
  const [semesterStart, setSemesterStart] = useState(data.semesterStart ?? "");
  const [totalWeeks, setTotalWeeks] = useState(data.totalWeeks);
  const [reminderEnabled, setReminderEnabled] = useState(data.reminderEnabled);
  const [reminderMinutes, setReminderMinutes] = useState(data.reminderMinutes);
  const [periodStarts, setPeriodStarts] = useState(data.periodStarts);

  const save = async () => {
    if (
      reminderEnabled &&
      typeof Notification !== "undefined" &&
      Notification.permission === "default"
    ) {
      await Notification.requestPermission();
    }
    await api("/api/courses", {
      method: "PATCH",
      json: { semesterStart, totalWeeks, reminderEnabled, reminderMinutes, periodStarts },
    });
    window.dispatchEvent(new Event("course-settings-updated"));
    onSaved();
  };

  const updatePeriodStart = (index: number, value: string) => {
    setPeriodStarts((current) => current.map((item, i) => (i === index ? value : item)));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <div
        className="card anim-fade-up max-h-[85vh] w-full max-w-md overflow-y-auto p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-4 text-sm font-semibold">学期设置</h2>
        <label className="block text-xs text-muted">
          第一周周一的日期
          <input
            type="date"
            value={semesterStart}
            onChange={(e) => setSemesterStart(e.target.value)}
            className="input mt-1"
          />
        </label>
        <label className="mt-3 block text-xs text-muted">
          学期总周数
          <input
            type="number" min={1} max={30} value={totalWeeks}
            onChange={(e) => setTotalWeeks(Number(e.target.value))}
            className="input mt-1"
          />
        </label>
        <div className="mt-4 border-t border-line pt-4">
          <label className="flex items-center justify-between text-xs text-muted">
            上课提醒
            <input
              type="checkbox"
              checked={reminderEnabled}
              onChange={(event) => setReminderEnabled(event.target.checked)}
              className="h-4 w-4 accent-ink"
            />
          </label>
          <label className="mt-3 block text-xs text-muted">
            提前提醒（分钟）
            <input
              type="number"
              min={1}
              max={120}
              value={reminderMinutes}
              onChange={(event) => setReminderMinutes(Number(event.target.value))}
              className="input mt-1"
              disabled={!reminderEnabled}
            />
          </label>
          <div className="mt-3 text-xs text-muted">每节课开始时间</div>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {periodStarts.map((value, index) => (
              <label key={index} className="text-[11px] text-faint">
                第 {index + 1} 节
                <input
                  type="time"
                  value={value}
                  onChange={(event) => updatePeriodStart(index, event.target.value)}
                  className="input mt-1 h-8 px-2 text-xs"
                  disabled={!reminderEnabled}
                />
              </label>
            ))}
          </div>
          <p className="mt-3 text-[11px] text-faint">
            提醒依赖系统通知权限，仅在工作台运行时生效。请按学校作息校准节次时间。
          </p>
        </div>
        <p className="mt-3 text-[11px] text-faint">设置后课程表会自动定位到当前周，并在表头显示每天的具体日期。</p>
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="btn-ghost text-xs">取消</button>
          <button onClick={save} className="btn-primary text-xs">保存</button>
        </div>
      </div>
    </div>
  );
}
