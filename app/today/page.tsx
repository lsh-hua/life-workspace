"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { Task } from "@/db/schema";
import TaskItem from "@/components/task-item";
import { isOverdue, todayStr } from "@/lib/dates";
import { Plus } from "lucide-react";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

function SortableTask({
  task,
  onToggle,
  onDelete,
}: {
  task: Task;
  onToggle: (t: Task) => void;
  onDelete: (t: Task) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({
    id: task.id,
  });
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }}>
      <TaskItem
        task={task}
        overdue={!!task.dueDate && isOverdue(task.dueDate)}
        onToggle={onToggle}
        onDelete={onDelete}
        dragHandle={
          <span {...attributes} {...listeners} className="cursor-grab touch-none text-faint">
            <GripDots />
          </span>
        }
      />
    </div>
  );
}

function GripDots() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
      <circle cx="9" cy="6" r="1.6" />
      <circle cx="15" cy="6" r="1.6" />
      <circle cx="9" cy="12" r="1.6" />
      <circle cx="15" cy="12" r="1.6" />
      <circle cx="9" cy="18" r="1.6" />
      <circle cx="15" cy="18" r="1.6" />
    </svg>
  );
}

export default function TodayPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [input, setInput] = useState("");
  const [priority, setPriority] = useState<"high" | "medium" | "low">("medium");
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const load = useCallback(async () => {
    setTasks(await api<Task[]>("/api/tasks?filter=today"));
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const add = async () => {
    const title = input.trim();
    if (!title) return;
    await api("/api/tasks", {
      method: "POST",
      json: { title, priority, dueDate: todayStr(), isToday: 1, sortOrder: tasks.length },
    });
    setInput("");
    load();
  };

  const toggle = async (t: Task) => {
    await api(`/api/tasks/${t.id}`, {
      method: "PATCH",
      json: { status: t.status === "done" ? "todo" : "done" },
    });
    load();
  };

  const remove = async (t: Task) => {
    await api(`/api/tasks/${t.id}`, { method: "DELETE" });
    load();
  };

  const onDragEnd = async (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIdx = tasks.findIndex((t) => t.id === active.id);
    const newIdx = tasks.findIndex((t) => t.id === over.id);
    const next = arrayMove(tasks, oldIdx, newIdx);
    setTasks(next);
    await api("/api/tasks/reorder", { method: "POST", json: { ids: next.map((t) => t.id) } });
  };

  const done = tasks.filter((t) => t.status === "done").length;
  const pct = tasks.length ? Math.round((done / tasks.length) * 100) : 0;

  return (
    <div className="mx-auto max-w-2xl px-6 py-8">
      <header className="mb-6">
        <h1 className="text-xl font-semibold tracking-tight">今日待办</h1>
        <p className="mt-1 text-sm text-muted">
          {tasks.length === 0 ? "今天还没有任务" : `已完成 ${done}/${tasks.length}`}
        </p>
        {tasks.length > 0 && (
          <div className="mt-3 h-1 overflow-hidden rounded-full bg-line">
            <div
              className="h-full rounded-full bg-ink transition-all duration-300"
              style={{ width: `${pct}%` }}
            />
          </div>
        )}
      </header>

      <div className="mb-5 flex items-center gap-2 rounded-xl border border-line bg-surface px-4 py-2.5 focus-within:border-faint">
        <Plus size={16} className="shrink-0 text-faint" />
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
          placeholder="回车快速添加今日任务…"
          className="h-7 flex-1 bg-transparent text-sm outline-none placeholder:text-faint"
        />
        <select
          value={priority}
          onChange={(e) => setPriority(e.target.value as typeof priority)}
          className="bg-transparent text-xs text-muted outline-none"
        >
          <option value="high">高</option>
          <option value="medium">中</option>
          <option value="low">低</option>
        </select>
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
          <div className="anim-stagger space-y-2">
            {tasks.map((t, i) => (
              <div key={t.id} style={{ "--i": i } as React.CSSProperties}>
                <SortableTask task={t} onToggle={toggle} onDelete={remove} />
              </div>
            ))}
          </div>
        </SortableContext>
      </DndContext>

      {tasks.length === 0 && (
        <div className="rounded-xl border border-dashed border-line py-16 text-center text-sm text-faint">
          添加一条任务，开始今天
        </div>
      )}
    </div>
  );
}
