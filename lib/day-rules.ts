function localDate(date: string) {
  return new Date(`${date}T12:00:00`);
}

function dateKey(date: Date) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

export type LocalDayWindow = { date: string; start: string; end: string };

// 查询使用 UTC 时间戳边界，边界本身按本地日历推进。
export function localDayWindow(date: string): LocalDayWindow {
  const start = localDate(date);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { date, start: start.toISOString(), end: end.toISOString() };
}

// 日期键始终使用本地日历；中午游标避免跨日与夏令时偏移。
export function reviewStreak(dates: Iterable<string>, today: string): number {
  const writtenDates = new Set(dates);
  const cursor = localDate(today);
  if (!writtenDates.has(today)) cursor.setDate(cursor.getDate() - 1);
  let streak = 0;
  while (writtenDates.has(dateKey(cursor))) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}
