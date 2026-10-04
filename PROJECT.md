# 人生工作台 · 项目交接文档

> **给后续维护者（人或 AI 模型）**：本文档是理解本项目的唯一入口。读完本文档即可上手开发。
> **维护约定：每次完成功能迭代、架构调整或发布新版本后，必须同步更新本文档与 CHANGELOG.md。**

最后更新：2026-10-04 · 当前版本：**1.2.0**

---

## 1. 项目概述

「人生工作台」是一个**单用户、本地优先**的极简个人工作台 Web 应用，同时打包为 Windows 桌面应用（Electron）。所有数据保存在本地 SQLite 文件中，不上云。

界面布局：左侧侧边栏导航 + 顶部全局搜索 + 右侧主区域。设计语言：极简、off-white 底、off-black 文字、无渐变无阴影堆砌。

## 2. 技术栈

| 层 | 技术 |
|---|---|
| 框架 | Next.js 16 (App Router) + TypeScript |
| 样式 | Tailwind CSS 4（自定义工具类见 `app/globals.css`：`.card` `.btn-primary` `.btn-ghost` `.input` `.tnum` 等） |
| 数据库 | SQLite，经 **@libsql/client** 访问（注意：不是 better-sqlite3，原因见 §7） |
| ORM | Drizzle ORM + drizzle-kit（迁移文件在 `db/migrations/`） |
| 桌面壳 | Electron 37 + electron-builder（NSIS 安装包） |
| 日期 | date-fns |
| 图标 | lucide-react |

## 3. 运行环境与常用命令

### 3.1 本机 Node 环境（重要）

系统 PATH 里没有全局 Node。Kimi Work 托管的 Node 24 在：

```
C:\Users\sheng\AppData\Local\Programs\kimi-desktop\resources\resources\runtime
```

每次在 Git Bash 里操作前必须：

```bash
export PATH="/c/Users/sheng/AppData/Local/Programs/kimi-desktop/resources/resources/runtime:$PATH"
# npm / npx 只能以 npm.cmd / npx.cmd 调用
```

C 盘空间紧张，npm 安装依赖时加缓存重定向：`--cache "D:\workspace\.npm-cache"`。

Electron 相关命令还需追加：`/c/Windows/System32:/c/Windows/System32/WindowsPowerShell/v1.0`。

### 3.2 命令

```bash
npm.cmd run dev            # 开发服务器（scripts/dev.mjs 包装器，会把 --host 转成 --hostname）
npx.cmd next build --webpack   # 生产构建。必须用 --webpack，见 §7
npm.cmd run db:generate    # 根据 db/schema.ts 生成迁移 SQL
npm.cmd run db:migrate     # 应用迁移（scripts/migrate.mjs）
npm.cmd run dist           # 桌面版打包（见 §6，有坑）
```

## 4. 目录结构

```
app/                  # Next.js 页面与 API 路由
  page.tsx            # 总览
  today/ week/ calendar/ habits/ review/ inspiration/ launch/ schedule/
  api/                # REST 接口（tasks events reviews inspirations habits
                      #   pomodoros courses sites groups overview search report hotspots）
components/           # sidebar topbar pomodoro search-dialog task-item
db/schema.ts          # 全部表定义（单一来源）
db/migrations/        # drizzle-kit 生成的迁移 SQL
lib/                  # API/日期工具 + course-schedule.ts（课程实例解析）
tests/                # node:test 纯逻辑测试
scripts/              # dev.mjs migrate.mjs seed.mjs build-desktop.mjs
desktop-app/          # Electron 壳（main.cjs preload.cjs）+ release/ 产物
data/workbench.db     # 本地 SQLite 数据文件（用户数据，勿删）
PROJECT.md            # 本文档
CHANGELOG.md          # 版本历史
PLAN.md               # 最初的产品规划（历史文档，仅供背景参考）
```

## 5. 数据库

- 连接封装在 `db/index.ts`，支持 `WORKBENCH_DATA_DIR` 环境变量覆盖数据目录（桌面版用它指向用户数据目录）。
- 所有表：`tasks events reviews inspirations hotspots sites groups settings(KV) habits habit_logs pomodoros courses course_overrides`。
- 课程提醒配置复用 `settings` KV：`courseReminderEnabled`、`courseReminderMinutes`、`coursePeriodStarts`；没有新增表或迁移。
- 改表流程：改 `db/schema.ts` → `npm.cmd run db:generate` → `npm.cmd run db:migrate` → 构建验证。
- **hotspots 表已停用但保留**（AI 热点模块下线时用户明确要求不丢数据），`/api/hotspots` 接口仍在。

## 6. 桌面版打包（electron-builder 有坑）

`npm.cmd run dist`（scripts/build-desktop.mjs）是五步流程：Next standalone 构建 → 组装 server → 复制本地 Electron 运行时 → 复制桌面入口 → NSIS。流程不再调用容易被实时防护拖死的 `electron-builder dir`。

**数据安全红线**：Next standalone 可能追踪并复制项目内 `data/workbench.db`。构建脚本会在组装后删除 `server/data/`，并扫描 `.db/.sqlite/.sqlite3`；发现数据库文件即中止打包。发布包只能包含空应用，真实数据始终位于运行时 `userData` 目录。

**已知问题**：electron-builder 的 dir 阶段（解包 Electron 运行时）在本机会被 Windows 实时防护拖到超时（>5 分钟）。可用的绕过方案（2026-08-26 验证有效）：

1. `npx.cmd next build --webpack`
2. 手动组装 standalone（复制 `.next/standalone` + `.next/static` + `public` + `scripts/migrate.mjs` + `db/migrations` + `node_modules/@libsql/win32-x64-msvc` 到 `desktop-build/server`）
3. 手动解压缓存的 Electron zip（`%LOCALAPPDATA%\electron\Cache\<hash>\electron-v*-win32-x64.zip`，用 `unzip`）到 `desktop-app/release/win-unpacked`，把 `electron.exe` 改名为 `人生工作台.exe`，复制 `main.cjs preload.cjs package.json` 到 `resources/app/`，复制 `desktop-build/server` 到 `resources/app/server/`
4. `npx.cmd electron-builder --win nsis --prepackaged release/win-unpacked -c.directories.output=release`（此阶段很快）

产物：`desktop-app/release/人生工作台 Setup <版本>.exe`。

**1.2.0 构建记录（2026-10-04）**：NSIS 安装器已成功生成。electron-builder 26.15.3 在项目没有 Git repository/publish 配置时，会在安装器生成后因空 provider 报错；基于 `win-unpacked` 重打包时需显式传入本地占位配置并禁止发布：

```bash
npx.cmd electron-builder --win nsis --prepackaged release/win-unpacked --config.directories.output=release --config.publish.provider=generic --config.publish.url=https://example.invalid --publish never
```

该命令只生成本地发布描述，不上传文件。

**NSIS mmap 错误（2026-09-14 遇到）**：makensis 连续三次报 `Internal compiler error #12345: error creating mmap`，清理临时文件无效，疑与系统实时防护有关。绕过方案：改用 zip 目标 `npx.cmd electron-builder --win zip --prepackaged release/win-unpacked -c.directories.output=release`，产物为免安装便携包 `人生工作台-<版本>-win.zip`（解压即运行）。1.0.0 即以 zip 形式发布；日后机器环境变化后可重试 NSIS。

## 7. 已知坑（都是踩过的，别再踩）

1. **构建必须用 `npx next build --webpack`**：Turbopack 构建会因 lightningcss 嵌套包失败。
2. **不能用 better-sqlite3**：无 win32-x64 预编译二进制，已全面改用 @libsql/client。
3. **Git Bash 的 curl 发中文会乱码**（控制台编码问题，非应用 bug）；测 API 用 node fetch 脚本。
4. electron-builder 的 extraResources 默认过滤会丢 node_modules 和 .next，所以打包含 server 必须手动复制（build-desktop.mjs 已处理）。
5. Next 16 的 dev 命令不认 `--host`，只认 `--hostname`（scripts/dev.mjs 已做转换，Kimi Work 预览卡片依赖这个）。
6. 验证后必须停掉临时 dev server（`taskkill //PID <pid> //F`），不允许留后台进程。

## 8. 功能现状

### 已完成（1.2.0）

- **总览** `/`：问候、今日/本周进度环、快速加任务/灵感、今日安排、习惯打卡卡、最新灵感
- **今日待办** `/today`、**本周清单** `/week`（拖拽排序）、**日历** `/calendar`
- **课程表** `/schedule`：周视图网格、第 N 周切换、单双周、单周微调（停课/调课）、学期设置，自动定位当前周；可配置节次时间与课前通知
- **习惯打卡** `/habits`：12 周热力图、连续天数、新建/删除；总览页可一键打卡
- **复盘** `/review`：三栏结构——日复盘（三问 + 心情 + 自动保存）/ 周复盘 / 月复盘（聚合统计 + 复制 Markdown）
- **番茄钟**：左侧边栏内嵌面板，25 分钟倒计时（截止时间戳实现），可绑定任务，完成记录 + 系统通知；显示下一堂课并提示专注时间冲突
- **开工** `/launch`：网站集合一键全开、本地文件（PDF 等）打开；桌面版侧边栏有开机自启动开关
- **全局搜索**：Ctrl/⌘+K

### 已下线

- **AI 热点**：页面与导航入口已删，数据与 API 保留（见 §5）。
- **独立周报页** `/report`：1.1.0 起并入复盘页，`/api/report` 保留并泛化为 period=week|month。

## 9. 版本管理（语义化版本 SemVer）

- 版本号同时维护在 `package.json` 与 `desktop-app/package.json` 的 `version` 字段，**两处必须一致**。
- 规则：`主版本.次版本.修订号`
  - 不兼容变更（删模块、改数据结构且需迁移）→ 主版本 +1
  - 新功能（向后兼容）→ 次版本 +1
  - 修复/小调整 → 修订号 +1
- 每次发版：更新两处 version → 在 CHANGELOG.md 记录 → 重新打 exe（产物文件名自动带版本号）。
- 历史：0.1.0 首个桌面版；0.2.0 集合版开工 + 开机自启；1.0.0 首个稳定交接版；1.1.0 课程表与三栏复盘；**1.2.0 课程提醒与番茄钟联动**。

## 10. 日后规划（候选方向，按用户意愿排序）

1. 数据备份/导出（JSON 全量导出）
2. 应用自定义图标（当前 exe 用 Electron 默认图标）
3. 考虑引入 git 做源码版本控制（当前项目无 git，版本仅靠 package.json + CHANGELOG）

---

*本文档由 AI 助手生成，后续每次迭代后请同步更新。*
