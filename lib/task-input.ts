import { parseTaskRepeat, serializeTaskRepeat, validTaskDate } from "./task-repeat.ts";
export { validTaskDate } from "./task-repeat.ts";

export type TaskInput = {
  title?: string;
  note?: string | null;
  status?: "todo" | "done";
  priority?: "high" | "medium" | "low";
  dueDate?: string | null;
  plannedDate?: string | null;
  repeatRule?: string | null;
  originKey?: string | null;
  isToday?: number;
  sortOrder?: number;
  source?: string;
};

export function parseTaskId(value: string): number | null {
  const id = Number(value);
  return /^[1-9]\d*$/.test(value) && Number.isSafeInteger(id) ? id : null;
}

const validators: Record<string, (value: unknown) => boolean> = {
  title: (value) => typeof value === "string" && value.trim().length > 0,
  note: (value) => value === null || typeof value === "string",
  status: (value) => value === "todo" || value === "done",
  priority: (value) => typeof value === "string" && ["high", "medium", "low"].includes(value),
  dueDate: (value) => value === null || validTaskDate(value),
  plannedDate: (value) => value === null || validTaskDate(value),
  repeatRule: (value) => value === null || parseTaskRepeat(value) !== null,
  originKey: (value) => value === null || (typeof value === "string" && /^review:(\d{4}-\d{2}-\d{2}):[a-f0-9]{64}$/i.test(value) && validTaskDate(value.split(":")[1])),
  isToday: (value) => value === true || value === false || value === 0 || value === 1,
  sortOrder: (value) => Number.isSafeInteger(value) && Number(value) >= 0,
  source: (value) => value === "manual" || value === "inspiration" || value === "review",
};

const labels: Record<string, string> = {
  title: "任务标题不能为空", note: "备注必须是文本", status: "任务状态无效",
  priority: "任务优先级无效", dueDate: "任务日期无效", isToday: "今日标记无效",
  sortOrder: "任务顺序无效", source: "任务来源无效", plannedDate: "计划日期无效",
  repeatRule: "重复规则无效", originKey: "复盘行动来源无效",
};

export function parseTaskInput(body: unknown, create = false): { value: TaskInput; error?: never } | { error: string; value?: never } {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { error: "任务参数无效。" };
  const input = body as Record<string, unknown>;
  if (create && !("title" in input)) return { error: "任务标题不能为空。" };
  const keys = Object.keys(validators).filter((key) => key in input && (create || !["source", "originKey"].includes(key)));
  const invalid = keys.find((key) => !validators[key](input[key]));
  if (invalid) return { error: `${labels[invalid]}。` };
  if (!create && keys.length === 0) return { error: "没有可保存的任务内容。" };
  const value = Object.fromEntries(keys.map((key) => [key, input[key]])) as TaskInput;
  if (create && ((value.originKey && value.source !== "review") || (value.source === "review" && !value.originKey))) {
    return { error: "复盘任务必须使用有效的行动来源键。" };
  }
  if (value.title !== undefined) value.title = value.title.trim();
  if (value.originKey) value.originKey = value.originKey.toLowerCase();
  if (value.repeatRule) value.repeatRule = serializeTaskRepeat(parseTaskRepeat(value.repeatRule)!);
  if ("isToday" in value) value.isToday = input.isToday ? 1 : 0;
  return { value };
}
