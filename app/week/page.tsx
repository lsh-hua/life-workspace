"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { Task } from "@/db/schema";
import { WEEKDAY_CN, todayStr, weekDates, weekRangeLabel } from "@/lib/dates";
import { Check, Plus } from "lucide-react";
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  useDraggable,
  type DragEndEvent,
} from "@dnd-kit/core";

function DayColumn({
  date,
  label,
  isTodayCol,
  tasks,
  onAdd,
  onToggle,
  children,
}: {
  date: string;
  label: string;
  isTodayCol: boolean;
  tasks: Task[];
  onAdd: (date: string, title: string) => void;
  onToggle: (t: Task) => void;
  children: (t: Task) => React.ReactNode;
}) {
  const [draft, setDraft] = useState("");
  const { setNodeRef, isOver } = useDroppable({ id: date });

  return (
    <div
      ref={setNodeRef}
      className={`flex min-h-[420px] flex-col rounded-2xl border p-2.5 transition-colors ${
        isOver ? "border-ink bg-line/40" : "border-line bg-surface"
      }`}
    >
      <div className="mb-2 flex items-baseline justify-between px-1">
        <span className={`text-[13px] font-medium ${isTodayCol ? "text-ink" : "text-muted"}`}>
          周{label}
        </span>
        <span
          className={`text-[11px] ${
            isTodayCol
              ? "rounded-full bg-ink px-1.5 py-0.5 text-white"
              : "text-faint"
          }`}
        >
          {Number(date.slice(8))}日
        </span>
      </div>
      <div className="flex-1 space-y-1.5">{tasks.map(children)}</div>
      <div className="mt-2 flex items-center gap-1.5 rounded-lg border border-dashed border-line px-2 py-1.5">
        <Plus size={13} className="shrink-0 text-faint" />
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && draft.trim()) {
              onAdd(date, draft.trim());
              setDraft("");
            }
          }}
          placeholder="添加…"
          className="w-full bg-transparent text-xs outline-none placeholder:text-faint"
        />
      </div>
    </div>
  );
}

function DraggableCard({ task, onToggle }: { task: Task; onToggle: (t: Task) => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: task.id,
  });
  const done = task.status === "done";
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      style={
        transform ? { transform: `translate(${transform.x}px, ${transform.y}px)` } : undefined
      }
      className={`cursor-grab rounded-lg border border-line bg-bg px-2.5 py-2 text-xs transition-opacity ${
        isDragging ? "z-50 opacity-70 shadow-lg" : ""
      } ${done ? "opacity-50" : ""}`}
    >
      <div className="flex items-start gap-1.5">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggle(task);
          }}
          onPointerDown={(e) => e.stopPropagation()}
          className={`mt-0.5 flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border ${
            done ? "border-ink bg-ink text-white" : "border-faint"
          }`}
        >
          {done && <Check size={10} strokeWidth={3.5} />}
        </button>
        <span className={done ? "line-through" : ""}>{task.title}</span>
      </div>
    </div>
  );
}

export default function WeekPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const days = weekDates();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const load = useCallback(async () => {
    setTasks(await api<Task[]>("/api/tasks?filter=week"));
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const add = async (date: string, title: string) => {
    await api("/api/tasks", { method: "POST", json: { title, dueDate: date } });
    load();
  };

  const toggle = async (t: Task) => {
    await api(`/api/tasks/${t.id}`, {
      method: "PATCH",
      json: { status: t.status === "done" ? "todo" : "done" },
    });
    load();
  };

  const onDragEnd = async (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over) return;
    const taskId = Number(active.id);
    const newDate = String(over.id);
    const task = tasks.find((t) => t.id === taskId);
    if (!task || task.dueDate === newDate) return;
    setTasks(tasks.map((t) => (t.id === taskId ? { ...t, dueDate: newDate } : t)));
    await api(`/api/tasks/${taskId}`, { method: "PATCH", json: { dueDate: newDate } });
  };

  const done = tasks.filter((t) => t.status === "done").length;

  return (
    <div className="px-6 py-8">
      <header className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">本周清单</h1>
          <p className="mt-1 text-sm text-muted">{weekRangeLabel()}</p>
        </div>
        <span className="text-sm text-muted">
          {done}/{tasks.length} 已完成
        </span>
      </header>

      <DndContext sensors={sensors} onDragEnd={onDragEnd}>
        <div className="grid grid-cols-7 gap-3">
          {days.map((date, i) => (
            <DayColumn
              key={date}
              date={date}
              label={WEEKDAY_CN[i]}
              isTodayCol={date === todayStr()}
              tasks={tasks.filter((t) => t.dueDate === date)}
              onAdd={add}
              onToggle={toggle}
            >
              {(t) => <DraggableCard key={t.id} task={t} onToggle={toggle} />}
            </DayColumn>
          ))}
        </div>
      </DndContext>
    </div>
  );
}
