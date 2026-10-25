# 人生工作台 · 架构镜像

## 目录骨架

```text
app/                  页面与 REST API；只编排交互，不复制领域规则
  settings/           本地备份创建、下载、记录与恢复说明
  api/backups/        完整快照列表、创建与受限文件下载
components/           跨页面 UI；侧边栏番茄钟承载全局课程提醒
db/                   SQLite schema、连接与增量迁移；用户数据的唯一真相源
lib/                  无 UI 的共享逻辑：请求、日期、课程实例解析
tests/                领域与保存队列回归；数据库用例仅使用临时库
scripts/              开发、快照备份、事务迁移与桌面构建
desktop-app/          Electron 主进程与预加载桥；不实现业务规则
data/workbench.db     用户真实数据，禁止删除、覆盖或作为测试库使用
```

## 文件职责

- `app/page.tsx`：总览页的数据编排与交互边界，以“今日主线”为视觉锚点组织只读概览和快捷操作。
- `app/globals.css`：全局视觉令牌与基础组件样式；保持单一强调色、统一圆角和可降级动效。
- `app/settings/page.tsx`：本地备份的用户入口与可恢复操作说明；不直接操作文件系统。
- `app/api/backups/`：调用快照模块创建/列出备份，下载仅接受受控文件名并验证完整性。
- `lib/day-rules.ts`：本地日界与连续复盘计算的唯一来源，不依赖数据库。
- `lib/task-query.ts`：今日任务统一查询口径，供任务列表与总览复用。
- `lib/review-autosave.ts`：本地草稿与串行保存状态，保证慢响应不覆盖最新输入。
- `desktop-app/draft-store.cjs`：独立于页面端口的原子草稿文件存储；仅接受合法日期键。
- `scripts/data-safety.mjs`：SQLite 一致性快照、完整性检查与受限备份路径的唯一实现。
- `scripts/migrate.mjs`：迁移前备份，每个迁移及其记录原子提交；失败中止启动。
- `app/api/courses/route.ts`：课程、学期与提醒设置的 HTTP 边界，负责输入校验与 KV 持久化。
- `app/schedule/page.tsx`：课程表展示、课程编辑、单周调整和提醒参数配置。
- `components/pomodoro.tsx`：番茄计时、完成记录、下一堂课提示与系统通知。
- `lib/course-schedule.ts`：把周期课程、单双周和单周调整解析为当天真实课程；不得依赖 UI 或数据库连接。
- `db/schema.ts`：全部表结构的单一来源；字段变更必须生成迁移。
- `tests/course-schedule.test.mjs`：课程解析的正常周、单双周、停课、调课回归用例。
- `scripts/build-desktop.mjs`：组装桌面发布包，并强制排除、检测任何用户数据库文件。
- `PROJECT.md`：环境、功能、数据与发布交接入口。
- `CHANGELOG.md`：面向版本的行为变化记录。

## 依赖方向

```text
页面 / 组件 -> API 客户端与领域逻辑 -> 数据类型
API 路由   -> 领域校验与数据库      -> SQLite
Electron   -> Next standalone       -> SQLite 用户目录
测试       -> 纯领域逻辑            -X-> 真实数据库
```

边界规则：课程生效判断只能存在于 `lib/course-schedule.ts`；API 不推断客户端时区；提醒配置进入现有 `settings` KV，避免为简单偏好扩表。

## 开发与验证

- 生产构建使用 `npx.cmd next build --webpack`，不得使用 Turbopack。
- 课程逻辑先运行 `npm.cmd test`，再运行 TypeScript、目标文件 ESLint 与生产构建。
- 测试使用系统临时目录中的独立数据库；不得调用 `scripts/seed.mjs`，不得写入 `data/workbench.db`。
- API 集成测试先完成生产构建，再运行 `npm.cmd run test:integration`；脚本自行启动与关闭临时库服务。
- 发布前用 `WORKBENCH_PACKAGED_APP` 指向新包的 win-unpacked 再跑集成测试；数据目录过滤只能匹配顶层 data，备份路由代码必须保留。
- 新迁移必须可增量执行；执行迁移前先确认数据库路径并备份真实数据。
- 桌面构建产物中不得出现 `.db`、`.sqlite` 或 `.sqlite3`；用户数据只能位于运行时 `userData` 目录。

## 架构决策

- 已加入今日的未完成任务顺延；旧已完成任务退出今日口径，当天完成的任务计入当天；历史记录保持原样。
- 复盘先落本地草稿再串行提交；加载冲突由用户选择，保存失败保留草稿并提供重试。
- 桌面草稿通过受限同步桥写入 userData/drafts，网页版使用 localStorage；随机端口不影响桌面恢复。
- 桌面每日备份与升级快照复用同一模块；备份不自动删除，安装产物按版本和构建时间隔离。
- 总览页采用渐进信息层级而非等权卡片阵列：主任务优先，统计与回顾次之，收纳和浏览型内容下沉。
- 全局界面只使用一个陶土色语义强调；层级主要依靠字号、留白和分隔，避免靠彩色卡片区分模块。
- 课程仍存“节次”而非固定钟点：课程结构稳定，学校作息通过 `settings` 配置。
- 通知在客户端本地时区解析：避免服务器 UTC 与用户作息错位。
- 通知键写入 `localStorage` 去重：刷新页面不会重复提醒，不污染业务数据库。

## 变更日志

- 2026-10-25：1.3.0 新增本地备份与安全迁移、复盘草稿保护，统一今日任务和连续复盘口径。
- 2026-10-05：总览页完成定向视觉重构；补齐加载、错误与空状态；数据结构和 API 保持不变。
- 2026-10-04：新增课程解析领域模块与测试；番茄钟接入下一堂课和课前通知；数据表保持不变。
- 2026-10-04：修复 standalone 误打包本地数据库的问题；构建脚本新增用户数据泄露断言。
- 2026-10-04：初始化 Git 仓库并推送至 `lsh-hua/life-workspace`；默认分支为 `main`。

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
