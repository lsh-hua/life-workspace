export type RecordKind = "tasks" | "events" | "inspirations" | "reviews";
export type RecordTarget = { id: number | null; date: string | null; requested: boolean; invalid: boolean };
type SearchParams = Pick<URLSearchParams, "getAll" | "has">;

export function recordId(value: string | null): number | null {
  if (!value || !/^[1-9]\d*$/.test(value)) return null;
  const id = Number(value);
  return Number.isSafeInteger(id) ? id : null;
}

export function recordDate(value: string | null): string | null {
  if (!value || !/^(?!0000)\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value ? value : null;
}

// 路由只接受类型、主键和日期；记录标题不参与 URL 构造。
export function recordHref(kind: RecordKind, record: { id: number; date?: string }): string | null {
  const id = recordId(String(record.id));
  if (!id) return null;
  if (kind === "tasks") return `/tasks/${id}`;
  if (kind === "inspirations") return `/inspiration?${new URLSearchParams({ record: String(id) })}`;
  const date = recordDate(record.date ?? null);
  if (!date) return null;
  const params = new URLSearchParams({ date, [kind === "events" ? "event" : "record"]: String(id) });
  return `${kind === "events" ? "/calendar" : "/review"}?${params}`;
}

export function recordTarget(params: SearchParams, kind: Exclude<RecordKind, "tasks">): RecordTarget {
  const idKey = kind === "events" ? "event" : "record";
  const dated = kind !== "inspirations";
  const ids = params.getAll(idKey);
  const dates = dated ? params.getAll("date") : [];
  const requested = params.has(idKey) || (dated && params.has("date"));
  const id = ids.length === 1 ? recordId(ids[0]) : null;
  const date = dates.length === 1 ? recordDate(dates[0]) : null;
  const invalid = (params.has(idKey) && !id) || (dated && params.has("date") && !date) || (dated && !!id && !date);
  return { id, date, requested, invalid };
}
