// 写入示例数据（幂等：表非空则跳过对应表）
import path from "node:path";
import fs from "node:fs";
import { createClient } from "@libsql/client";

const dataDir = path.join(process.cwd(), "data");
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
const client = createClient({ url: "file:" + path.join(dataDir, "workbench.db") });

const now = new Date().toISOString();
const fmt = (d) => d.toISOString().slice(0, 10);
const today = new Date();
const plus = (n) => fmt(new Date(today.getTime() + n * 86400000));

async function count(table) {
  const r = await client.execute(`SELECT COUNT(*) AS c FROM ${table}`);
  return Number(r.rows[0].c);
}

if ((await count("tasks")) === 0) {
  const tasks = [
    ["写人生工作台需求文档", "done", "high", plus(0), 1],
    ["搭建 Next.js 脚手架", "done", "high", plus(0), 1],
    ["完成今日待办页面", "todo", "high", plus(0), 1],
    ["设计日历组件", "todo", "medium", plus(1), 0],
    ["整理本周周报素材", "todo", "medium", plus(3), 0],
    ["读 30 页书", "todo", "low", plus(-1), 0], // 逾期示例
  ];
  for (let i = 0; i < tasks.length; i++) {
    const [title, status, priority, due, isToday] = tasks[i];
    await client.execute({
      sql: `INSERT INTO tasks (title, status, priority, due_date, is_today, sort_order, source, created_at, completed_at)
            VALUES (?, ?, ?, ?, ?, ?, 'manual', ?, ?)`,
      args: [title, status, priority, due, isToday, i, now, status === "done" ? now : null],
    });
  }
  console.log("seeded tasks");
}

if ((await count("events")) === 0) {
  await client.execute({
    sql: `INSERT INTO events (title, note, date, start_time, end_time, color, created_at)
          VALUES ('周会', '产品周例会', ?, '10:00', '11:00', '#6366f1', ?)`,
    args: [plus(1), now],
  });
  console.log("seeded events");
}

if ((await count("inspirations")) === 0) {
  const items = [
    ["把每周复盘做成可视化年报会很酷", "想法", 1],
    ["极简不是没有，而是刚刚好", "摘抄", 0],
  ];
  for (const [content, tags, pinned] of items) {
    await client.execute({
      sql: `INSERT INTO inspirations (content, tags, pinned, converted, created_at) VALUES (?, ?, ?, 0, ?)`,
      args: [content, tags, pinned, now],
    });
  }
  console.log("seeded inspirations");
}

if ((await count("sites")) === 0) {
  const sites = [
    ["飞书", "https://www.feishu.cn"],
    ["抖音", "https://www.douyin.com"],
    ["GitHub", "https://github.com"],
    ["Gmail", "https://mail.google.com"],
  ];
  for (let i = 0; i < sites.length; i++) {
    await client.execute({
      sql: `INSERT INTO sites (name, url, icon_url, sort_order, created_at) VALUES (?, ?, NULL, ?, ?)`,
      args: [sites[i][0], sites[i][1], i, now],
    });
  }
  console.log("seeded sites");
}

if ((await count("settings")) === 0) {
  const defaults = {
    hotspot_sources: JSON.stringify([
      { name: "Hacker News", url: "https://hnrss.org/frontpage" },
      { name: "机器之心", url: "https://www.jiqizhixin.com/rss" },
      { name: "量子位", url: "https://www.qbitai.com/feed" },
    ]),
  };
  for (const [key, value] of Object.entries(defaults)) {
    await client.execute({
      sql: "INSERT INTO settings (key, value) VALUES (?, ?)",
      args: [key, value],
    });
  }
  console.log("seeded settings");
}

console.log("seed done");
