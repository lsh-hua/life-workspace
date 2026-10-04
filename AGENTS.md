# 人生工作台 · 架构镜像

## 目录骨架

```text
app/                  页面与 REST API；只编排交互，不复制领域规则
components/           跨页面 UI；侧边栏番茄钟承载全局课程提醒
db/                   SQLite schema、连接与增量迁移；用户数据的唯一真相源
lib/                  无 UI 的共享逻辑：请求、日期、课程实例解析
tests/                纯领域逻辑测试，不连接真实数据库
scripts/              开发、迁移、种子与桌面构建脚本
desktop-app/          Electron 主进程与预加载桥；不实现业务规则
data/workbench.db     用户真实数据，禁止删除、覆盖或作为测试库使用
```

## 文件职责

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
- 测试不得调用 `scripts/seed.mjs`，不得写入 `data/workbench.db`。
- 新迁移必须可增量执行；执行迁移前先确认数据库路径并备份真实数据。
- 桌面构建产物中不得出现 `.db`、`.sqlite` 或 `.sqlite3`；用户数据只能位于运行时 `userData` 目录。

## 架构决策

- 课程仍存“节次”而非固定钟点：课程结构稳定，学校作息通过 `settings` 配置。
- 通知在客户端本地时区解析：避免服务器 UTC 与用户作息错位。
- 通知键写入 `localStorage` 去重：刷新页面不会重复提醒，不污染业务数据库。

## 变更日志

- 2026-10-04：新增课程解析领域模块与测试；番茄钟接入下一堂课和课前通知；数据表保持不变。
- 2026-10-04：修复 standalone 误打包本地数据库的问题；构建脚本新增用户数据泄露断言。
