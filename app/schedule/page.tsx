"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { api } from "@/lib/api";
import type { Course, CourseOverride } from "@/db/schema";
import { WEEKDAY_CN } from "@/lib/dates";
import type { CourseScheduleData } from "@/lib/course-schedule";
import { EmptyState, PageError, PageHeader, PageLoading } from "@/components/page-header";
import { addDays, differenceInCalendarDays, format, parseISO } from "date-fns";
import { ChevronLeft, ChevronRight, GraduationCap, Pencil, Plus, Settings2, Trash2, Undo2, X } from "lucide-react";

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
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const d = await api<Data>("/api/courses");
      setData(d);
      setError(null);
      // 默认定位到当前周。
      if (d.semesterStart) {
        const w = Math.floor(differenceInCalendarDays(new Date(), parseISO(d.semesterStart)) / 7) + 1;
        setWeek(Math.min(Math.max(w, 1), d.totalWeeks));
      }
    } catch {
      setError("课程表暂时无法读取，请重试。");
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
    <div className="page-shell page-shell-wide">
      <PageHeader title="课程表" description="查看每周安排，按学期管理课程与单周调整。" meta={
          <span className="tnum">
            {data?.semesterStart
              ? `第 ${week} 周 · ${format(addDays(parseISO(data.semesterStart), (week - 1) * 7), "M月d日")} 起`
              : `第 ${week} 周 · 未设置开学日期`}
          </span>
      } actions={
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => setShowSettings(true)} disabled={!data} className="btn-ghost"><Settings2 size={15} />学期设置</button>
          <button type="button" onClick={() => setEditing("new")} disabled={!data} className="btn-primary"><Plus size={15} />添加课程</button>
        </div>
      } />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button type="button" disabled={!data || week === 1} onClick={() => setWeek((w) => Math.max(1, w - 1))} className="btn-ghost px-2" title="上一周" aria-label="上一周">
            <ChevronLeft size={16} />
          </button>
          <span className="min-w-16 text-center text-sm tnum">第 {week} 周</span>
          <button
            type="button"
            onClick={() => setWeek((w) => Math.min(data?.totalWeeks ?? 20, w + 1))}
            className="btn-ghost px-2"
            title="下一周"
            aria-label="下一周"
            disabled={!data || week === data.totalWeeks}
          >
            <ChevronRight size={16} />
          </button>
        </div>
        <p className="text-xs text-muted">点击课程可编辑，窄屏可左右滑动。</p>
      </div>

      {error && <PageError message={error} onRetry={load} />}
      {!data ? !error && <PageLoading rows={6} /> : data.courses.length === 0 ? (
        <EmptyState title="还没有课程" description="添加课程后，这里会按星期和节次展示本周安排。" icon={<GraduationCap size={24} />} />
      ) : <>

      {/* 周视图网格 */}
      <div className="card max-w-full overflow-x-auto p-3 sm:p-4" role="region" aria-label={`第 ${week} 周课程网格`} tabIndex={0}>
        <div className="min-w-[800px]">
          {/* 表头 */}
          <div className="grid grid-cols-[36px_repeat(7,1fr)] gap-1 pb-3">
            <div />
            {WEEKDAY_CN.map((w, i) => (
              <div key={w} className="text-center">
                <div className="text-sm font-medium">周{w}</div>
                <div className="mt-1 text-xs text-muted tnum">{dayDate(i + 1) ?? " "}</div>
              </div>
            ))}
          </div>
          {/* 主体 */}
          <div className="grid grid-cols-[36px_repeat(7,1fr)] gap-1">
            {/* 节次列 */}
            <div className="relative" style={{ height: PERIODS * ROW_H }}>
              {Array.from({ length: PERIODS }, (_, i) => (
                <div
                  key={i}
                  className="absolute left-0 right-0 text-center text-xs text-muted tnum"
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
                        type="button"
                        key={`${cell.course.id}-${cell.override?.id ?? "r"}`}
                        onClick={() => setEditing(cell.course)}
                        title={`${cell.course.name}，周${WEEKDAY_CN[cell.dayOfWeek - 1]}，第 ${cell.startPeriod}-${cell.endPeriod} 节${cell.location ? `，${cell.location}` : ""}`}
                        className="absolute left-0.5 right-0.5 overflow-hidden rounded-lg border-l-[3px] px-2 py-1.5 text-left text-ink transition-opacity hover:opacity-80 active:opacity-70"
                        style={{
                          top,
                          height,
                          borderColor: color,
                          background: `color-mix(in srgb, ${color} 16%, var(--color-surface))`,
                        }}
                      >
                        <div className="line-clamp-2 break-words text-xs font-semibold leading-4">
                          {cell.course.name}
                          {cell.override && <span className="ml-1 text-[10px] text-muted">调课</span>}
                        </div>
                        {height >= 40 && cell.location && (
                          <div className="mt-1 truncate text-[11px] text-muted">{cell.location}</div>
                        )}
                        {height >= 56 && cell.course.teacher && (
                          <div className="truncate text-[11px] text-muted">{cell.course.teacher}</div>
                        )}
                      </button>
                    );
                  })}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 单双周说明 */}
      {data && data.courses.some((c) => c.weekType !== "all") && (
        <p className="mt-3 text-xs leading-6 text-muted">单双周课程仅在对应周显示。当前为第 {week} 周，{week % 2 === 1 ? "单" : "双"}周。</p>
      )}
      </>}

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

function ModalFrame({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const previous = document.activeElement;
    const dialog = dialogRef.current;
    dialog?.showModal();
    dialog?.querySelector<HTMLInputElement>("input:not([disabled])")?.focus();
    return () => {
      dialog?.close();
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
    };
  }, []);
  return (
    <dialog ref={dialogRef} aria-label={title} className="m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-lg overflow-y-auto rounded-2xl border border-line bg-surface p-5 text-ink shadow-2xl backdrop:bg-overlay sm:p-6"
      onCancel={(event) => { event.preventDefault(); onClose(); }}
      onKeyDown={(event) => {
        if (event.key !== "Tab") return;
        const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>("button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex]:not([tabindex='-1'])"))
          .filter((element) => element.getClientRects().length > 0);
        const first = controls[0];
        const last = controls[controls.length - 1];
        if (event.shiftKey ? document.activeElement === first : document.activeElement === last) {
          event.preventDefault();
          (event.shiftKey ? last : first)?.focus();
        }
      }}
      onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="mb-5 flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold">{title}</h2>
        <button type="button" onClick={onClose} aria-label={`关闭${title}`} className="btn-ghost px-2"><X size={16} /></button>
      </div>
      {children}
    </dialog>
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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const commit = async (operation: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await operation();
      onSaved();
    } catch {
      setError("操作未完成，请检查课程信息后重试。输入内容已保留。");
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (!form.name.trim()) { setError("请填写课程名称。"); return; }
    if (form.endPeriod < form.startPeriod || form.endWeek < form.startWeek) { setError("结束节次和结束周不能早于开始时间。"); return; }
    await commit(() => isNew
      ? api("/api/courses", { method: "POST", json: form })
      : api(`/api/courses/${course.id}`, { method: "PATCH", json: form }));
  };

  const remove = async () => {
    if (!course || !window.confirm(`确定删除“${course.name}”及其单周调整吗？`)) return;
    await commit(() => api(`/api/courses/${course.id}`, { method: "DELETE" }));
  };

  const setOverride = async (kind: "cancel" | "custom") => {
    if (!course) return;
    await commit(() => api(`/api/courses/${course.id}`, {
      method: "POST",
      json: { action: "override", week, kind, ...ov },
    }));
  };

  const removeOverride = async () => {
    if (!course) return;
    await commit(() => api(`/api/courses/${course.id}`, { method: "POST", json: { action: "removeOverride", week } }));
  };

  const numInput = (key: keyof typeof form, min: number, max: number) => (
    <input
      type="number"
      min={min}
      max={max}
      value={form[key] as number}
      onChange={(e) => setForm({ ...form, [key]: Number(e.target.value) })}
      className="input w-full"
    />
  );

  return (
    <ModalFrame title={isNew ? "添加课程" : "编辑课程"} onClose={onClose}>
      <form onSubmit={(event) => { event.preventDefault(); void save(); }}>
        {error && <p role="alert" className="mb-4 rounded-lg border border-danger/25 px-3 py-2 text-sm leading-6 text-danger">{error}</p>}
        <fieldset disabled={busy} className="space-y-4">
          <label className="block text-xs font-medium text-muted">
            课程名称
          <input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="例如：高等数学"
            className="input mt-2"
            required
          />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs font-medium text-muted">教师（可选）
            <input
              value={form.teacher}
              onChange={(e) => setForm({ ...form, teacher: e.target.value })}
              placeholder="教师姓名"
              className="input mt-2"
            />
            </label>
            <label className="text-xs font-medium text-muted">地点（可选）
            <input
              value={form.location}
              onChange={(e) => setForm({ ...form, location: e.target.value })}
              placeholder="教室或线上链接"
              className="input mt-2"
            />
            </label>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <label className="text-xs text-muted">
              星期
              <select
                value={form.dayOfWeek}
                onChange={(e) => setForm({ ...form, dayOfWeek: Number(e.target.value) })}
                className="input mt-2"
              >
                {WEEKDAY_CN.map((w, i) => (
                  <option key={w} value={i + 1}>周{w}</option>
                ))}
              </select>
            </label>
            <label className="text-xs text-muted">
              开始节次
              <div className="mt-2">{numInput("startPeriod", 1, PERIODS)}</div>
            </label>
            <label className="text-xs text-muted">
              结束节次
              <div className="mt-2">{numInput("endPeriod", 1, PERIODS)}</div>
            </label>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <label className="text-xs text-muted">
              开始周
              <div className="mt-2">{numInput("startWeek", 1, data.totalWeeks)}</div>
            </label>
            <label className="text-xs text-muted">
              结束周
              <div className="mt-2">{numInput("endWeek", 1, data.totalWeeks)}</div>
            </label>
            <label className="text-xs text-muted">
              单双周
              <select
                value={form.weekType}
                onChange={(e) => setForm({ ...form, weekType: e.target.value as Course["weekType"] })}
                className="input mt-2"
              >
                <option value="all">每周</option>
                <option value="odd">单周</option>
                <option value="even">双周</option>
              </select>
            </label>
          </div>

          <div>
            <div id="course-color-label" className="mb-2 text-xs text-muted">课程颜色</div>
            <div role="group" aria-labelledby="course-color-label" className="flex flex-wrap gap-2">
              {PALETTE.map((c, index) => (
                <button
                  key={c}
                  type="button"
                  aria-label={`课程颜色 ${index + 1}`}
                  aria-pressed={form.color === c}
                  onClick={() => setForm({ ...form, color: c })}
                  className={`h-8 w-8 rounded-lg border-2 transition-opacity ${form.color === c ? "border-ink" : "border-transparent hover:opacity-70"}`}
                  style={{ background: c }}
                />
              ))}
            </div>
          </div>
        </fieldset>

        {/* 本周微调 */}
        {!isNew && (
          <div className="mt-5 border-t border-line pt-4">
            <div className="mb-2 text-xs font-medium text-muted">第 {week} 周微调</div>
            {existingOv ? (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-bg px-3 py-3">
                <span className="text-xs leading-6 text-muted">
                  {existingOv.action === "cancel"
                    ? "本周已停课"
                    : `本周已调至 周${WEEKDAY_CN[(existingOv.dayOfWeek ?? 1) - 1]} 第${existingOv.startPeriod}-${existingOv.endPeriod}节${existingOv.location ? ` · ${existingOv.location}` : ""}`}
                </span>
                <button type="button" disabled={busy} onClick={removeOverride} className="btn-ghost gap-1 px-2 text-xs">
                  <Undo2 size={12} /> 撤销
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <label className="text-xs text-muted">星期
                  <select
                    value={ov.dayOfWeek}
                    onChange={(e) => setOv({ ...ov, dayOfWeek: Number(e.target.value) })}
                    className="input mt-2"
                    disabled={busy}
                  >
                    {WEEKDAY_CN.map((w, i) => (
                      <option key={w} value={i + 1}>周{w}</option>
                    ))}
                  </select>
                  </label>
                  <label className="text-xs text-muted">开始节次
                  <input
                    type="number" min={1} max={PERIODS} value={ov.startPeriod}
                    onChange={(e) => setOv({ ...ov, startPeriod: Number(e.target.value) })}
                    className="input mt-2" disabled={busy}
                  />
                  </label>
                  <label className="text-xs text-muted">结束节次
                  <input
                    type="number" min={1} max={PERIODS} value={ov.endPeriod}
                    onChange={(e) => setOv({ ...ov, endPeriod: Number(e.target.value) })}
                    className="input mt-2" disabled={busy}
                  />
                  </label>
                  <label className="text-xs text-muted">地点
                  <input
                    value={ov.location}
                    onChange={(e) => setOv({ ...ov, location: e.target.value })}
                    placeholder="地点"
                    className="input mt-2" disabled={busy}
                  />
                  </label>
                </div>
                <div className="flex gap-2">
                  <button type="button" disabled={busy} onClick={() => setOverride("custom")} className="btn-ghost flex-1 justify-center text-xs">
                    应用本周调课
                  </button>
                  <button type="button" disabled={busy} onClick={() => setOverride("cancel")} className="btn-ghost flex-1 justify-center text-xs">
                    本周停课
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
          {!isNew ? (
            <button type="button" disabled={busy} onClick={remove} className="btn-ghost gap-1 text-xs text-danger">
              <Trash2 size={13} /> 删除课程
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <button type="button" disabled={busy} onClick={onClose} className="btn-ghost text-xs">取消</button>
            <button type="submit" disabled={busy} className="btn-primary gap-1 text-xs">
              <Pencil size={12} /> {busy ? "正在保存…" : isNew ? "添加" : "保存"}
            </button>
          </div>
        </div>
      </form>
    </ModalFrame>
  );
}

// ---------- 学期设置弹窗 ----------
function SettingsModal({ data, onClose, onSaved }: { data: Data; onClose: () => void; onSaved: () => void }) {
  const [semesterStart, setSemesterStart] = useState(data.semesterStart ?? "");
  const [totalWeeks, setTotalWeeks] = useState(data.totalWeeks);
  const [reminderEnabled, setReminderEnabled] = useState(data.reminderEnabled);
  const [reminderMinutes, setReminderMinutes] = useState(data.reminderMinutes);
  const [periodStarts, setPeriodStarts] = useState(data.periodStarts);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      if (reminderEnabled && typeof Notification !== "undefined" && Notification.permission === "default") {
        await Notification.requestPermission();
      }
      await api("/api/courses", { method: "PATCH", json: { semesterStart, totalWeeks, reminderEnabled, reminderMinutes, periodStarts } });
      window.dispatchEvent(new Event("course-settings-updated"));
      onSaved();
    } catch {
      setError("设置未保存，请检查日期与节次时间后重试。");
    } finally {
      setBusy(false);
    }
  };

  const updatePeriodStart = (index: number, value: string) => {
    setPeriodStarts((current) => current.map((item, i) => (i === index ? value : item)));
  };

  return (
    <ModalFrame title="学期设置" onClose={onClose}>
      <form onSubmit={(event) => { event.preventDefault(); void save(); }}>
        {error && <p role="alert" className="mb-4 text-sm leading-6 text-danger">{error}</p>}
        <fieldset disabled={busy}>
        <label className="block text-xs font-medium text-muted">
          第一周周一的日期
          <input
            type="date"
            value={semesterStart}
            onChange={(e) => setSemesterStart(e.target.value)}
            className="input mt-2"
          />
        </label>
        <label className="mt-4 block text-xs font-medium text-muted">
          学期总周数
          <input
            type="number" min={1} max={30} value={totalWeeks}
            onChange={(e) => setTotalWeeks(Number(e.target.value))}
            className="input mt-2"
          />
        </label>
        <div className="mt-4 border-t border-line pt-4">
          <label className="flex min-h-9 items-center justify-between gap-3 text-sm font-medium">
            上课提醒
            <input
              type="checkbox"
              checked={reminderEnabled}
              onChange={(event) => setReminderEnabled(event.target.checked)}
              className="h-4 w-4 accent-accent"
            />
          </label>
          <label className="mt-3 block text-xs font-medium text-muted">
            提前提醒（分钟）
            <input
              type="number"
              min={1}
              max={120}
              value={reminderMinutes}
              onChange={(event) => setReminderMinutes(Number(event.target.value))}
              className="input mt-2"
              disabled={!reminderEnabled}
            />
          </label>
          <div className="mt-5 text-sm font-medium">每节课开始时间</div>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {periodStarts.map((value, index) => (
              <label key={index} className="text-xs text-muted">
                第 {index + 1} 节
                <input
                  type="time"
                  value={value}
                  onChange={(event) => updatePeriodStart(index, event.target.value)}
                  className="input mt-2 px-2 text-xs"
                  disabled={!reminderEnabled}
                />
              </label>
            ))}
          </div>
          <p className="mt-4 text-xs leading-6 text-muted">
            提醒依赖系统通知权限，仅在工作台运行时生效。请按学校作息校准节次时间。
          </p>
        </div>
        <p className="mt-3 text-xs leading-6 text-muted">开学日期用于计算当前教学周及每一天的日期。</p>
        </fieldset>
        <div className="mt-5 flex justify-end gap-2 border-t border-line pt-4">
          <button type="button" disabled={busy} onClick={onClose} className="btn-ghost text-xs">取消</button>
          <button type="submit" disabled={busy} className="btn-primary text-xs">{busy ? "正在保存…" : "保存设置"}</button>
        </div>
      </form>
    </ModalFrame>
  );
}
