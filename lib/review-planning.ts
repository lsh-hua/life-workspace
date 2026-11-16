export function reviewTaskLines(text: string): string[] {
  const lines = text.split(/\r?\n/).map((line) => line.trim()
    .replace(/^(?:[-*•]\s+|\d+[.)、]\s*)/, "")
    .replace(/^\[[ xX]\]\s*/, "")
    .replace(/\s+/g, " ").trim());
  return [...new Set(lines.filter(Boolean))];
}

export async function reviewOriginKey(date: string, title: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(title));
  const hash = Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, "0")).join("");
  return `review:${date}:${hash}`;
}

export function appendFocusProblem(existing: string, title: string): string {
  const marker = `专注任务「${title.replace(/\s+/g, " ").trim()}」的阻碍：`;
  if (existing.includes(marker)) return existing;
  return `${existing.trimEnd()}${existing.trimEnd() ? "\n" : ""}${marker}`;
}

export function focusTaskUnavailable(task: { status: string; deletedAt?: string | null }): string | null {
  if (task.deletedAt) return "这条任务已在最近删除中，请恢复后再开始专注。";
  if (task.status === "done") return "这条任务已经完成，请选择尚未完成的任务。";
  return null;
}
