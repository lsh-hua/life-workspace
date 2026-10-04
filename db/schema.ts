import { sqliteTable, text, integer, uniqueIndex } from "drizzle-orm/sqlite-core";

// 任务表（今日待办 + 本周清单共用）
export const tasks = sqliteTable("tasks", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  title: text("title").notNull(),
  note: text("note"),
  status: text("status", { enum: ["todo", "done"] }).notNull().default("todo"),
  priority: text("priority", { enum: ["high", "medium", "low"] })
    .notNull()
    .default("medium"),
  dueDate: text("due_date"), // YYYY-MM-DD，决定出现在今天/本周/日历
  isToday: integer("is_today").notNull().default(0), // 手动加入"今日"
  sortOrder: integer("sort_order").notNull().default(0),
  source: text("source").notNull().default("manual"), // manual | inspiration
  createdAt: text("created_at").notNull(),
  completedAt: text("completed_at"),
});

// 日程事件表（日历手动事件）
export const events = sqliteTable("events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  title: text("title").notNull(),
  note: text("note"),
  date: text("date").notNull(), // YYYY-MM-DD
  startTime: text("start_time"),
  endTime: text("end_time"),
  color: text("color"),
  createdAt: text("created_at").notNull(),
});

// 每日复盘表（每天一篇，date 唯一）
export const reviews = sqliteTable(
  "reviews",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    date: text("date").notNull(), // YYYY-MM-DD
    doneText: text("done_text"),
    problemText: text("problem_text"),
    tomorrowText: text("tomorrow_text"),
    mood: integer("mood"), // 1-5
    summary: text("summary"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [uniqueIndex("reviews_date_unique").on(t.date)]
);

// 灵感表
export const inspirations = sqliteTable("inspirations", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  content: text("content").notNull(),
  tags: text("tags").notNull().default(""), // 逗号分隔
  pinned: integer("pinned").notNull().default(0),
  converted: integer("converted").notNull().default(0), // 是否已转为任务
  createdAt: text("created_at").notNull(),
});

// AI 热点缓存表
export const hotspots = sqliteTable(
  "hotspots",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    title: text("title").notNull(),
    url: text("url").notNull(),
    source: text("source").notNull(),
    summary: text("summary"),
    publishedAt: text("published_at"),
    fetchedAt: text("fetched_at").notNull(),
    favorited: integer("favorited").notNull().default(0),
  },
  (t) => [uniqueIndex("hotspots_source_url_unique").on(t.source, t.url)]
);

// 开工网站表
export const sites = sqliteTable("sites", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  url: text("url").notNull(),
  iconUrl: text("icon_url"),
  sortOrder: integer("sort_order").notNull().default(0),
  groupId: integer("group_id"), // 所属集合，null = 散件
  itemType: text("item_type", { enum: ["url", "file"] }).notNull().default("url"),
  createdAt: text("created_at").notNull(),
});

// 开工集合表（如"娱乐"集合包含 B站/抖音/快手）
export const groups = sqliteTable("groups", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  icon: text("icon"), // emoji 或图标名
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: text("created_at").notNull(),
});

// 设置表（KV）
export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

// 习惯表
export const habits = sqliteTable("habits", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  icon: text("icon"), // emoji
  sortOrder: integer("sort_order").notNull().default(0),
  archived: integer("archived").notNull().default(0),
  createdAt: text("created_at").notNull(),
});

// 习惯打卡记录（每天每个习惯最多一条）
export const habitLogs = sqliteTable(
  "habit_logs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    habitId: integer("habit_id").notNull(),
    date: text("date").notNull(), // YYYY-MM-DD
    createdAt: text("created_at").notNull(),
  },
  (t) => [uniqueIndex("habit_logs_unique").on(t.habitId, t.date)]
);

// 番茄钟记录
export const pomodoros = sqliteTable("pomodoros", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  taskId: integer("task_id"), // 可空，允许无任务纯计时
  minutes: integer("minutes").notNull().default(25),
  finishedAt: text("finished_at").notNull(),
});

// 课程表（周期性课程）
export const courses = sqliteTable("courses", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  teacher: text("teacher"),
  location: text("location"),
  color: text("color"), // hex
  dayOfWeek: integer("day_of_week").notNull(), // 1=周一 … 7=周日
  startPeriod: integer("start_period").notNull(), // 起始节次
  endPeriod: integer("end_period").notNull(), // 结束节次
  startWeek: integer("start_week").notNull().default(1),
  endWeek: integer("end_week").notNull().default(16),
  weekType: text("week_type").notNull().default("all"), // all | odd | even
  createdAt: text("created_at").notNull(),
});

// 课程单周调整（对某一周的微调：取消 或 临时改时间/地点）
export const courseOverrides = sqliteTable(
  "course_overrides",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    courseId: integer("course_id").notNull(),
    week: integer("week").notNull(),
    action: text("action").notNull(), // cancel | custom
    // action=custom 时生效的字段
    dayOfWeek: integer("day_of_week"),
    startPeriod: integer("start_period"),
    endPeriod: integer("end_period"),
    location: text("location"),
    note: text("note"),
    createdAt: text("created_at").notNull(),
  },
  (t) => [uniqueIndex("course_overrides_unique").on(t.courseId, t.week)]
);

export type Task = typeof tasks.$inferSelect;
export type Event = typeof events.$inferSelect;
export type Review = typeof reviews.$inferSelect;
export type Inspiration = typeof inspirations.$inferSelect;
export type Hotspot = typeof hotspots.$inferSelect;
export type Site = typeof sites.$inferSelect;
export type Group = typeof groups.$inferSelect;
export type Habit = typeof habits.$inferSelect;
export type HabitLog = typeof habitLogs.$inferSelect;
export type Pomodoro = typeof pomodoros.$inferSelect;
export type Course = typeof courses.$inferSelect;
export type CourseOverride = typeof courseOverrides.$inferSelect;
