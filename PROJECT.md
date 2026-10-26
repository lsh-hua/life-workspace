# 人生工作台 · 项目交接文档

> **给后续维护者（人或 AI 模型）**：本文档是理解本项目的唯一入口。读完本文档即可上手开发。
> **维护约定：每次完成功能迭代、架构调整或发布新版本后，必须同步更新本文档与 CHANGELOG.md。**

最后更新：2026-10-26 · 当前版本：**1.5.0**

---

## 1. 项目概述

「人生工作台」是一个**单用户、本地优先**的极简个人工作台 Web 应用，同时打包为 Windows 桌面应用（Electron）。所有数据保存在本地 SQLite 文件中，不上云。

界面布局：响应式侧边栏导航 + 顶部全局搜索 + 主内容区。设计语言：克制的编辑感与工具感，明暗主题共用语义色令牌，以字号、留白和分隔建立层级；手机使用可访问抽屉导航，桌面支持收起侧栏。

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

当前 PowerShell 中的 Node 与 npm 来自 `E:\node`；先用 `Get-Command node,npm.cmd,npx.cmd` 确认实际路径。旧环境的托管 Node 位于：

```
C:\Users\sheng\AppData\Local\Programs\kimi-desktop\resources\resources\runtime
```

只有旧环境或 Git Bash 找不到 Node 时，才需要补充对应运行时的 PATH：

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
npm.cmd test               # 纯领域、保存队列及隔离数据库回归
npm.cmd run test:integration # 生产构建后，自动启动临时库服务验证 REST API
```

## 4. 目录结构

```
app/                  # Next.js 页面与 API 路由
  page.tsx            # 总览
  today/ week/ calendar/ habits/ review/ inspiration/ launch/ schedule/
  settings/           # 本地备份管理、下载和恢复步骤
  api/                # REST 接口（tasks events reviews inspirations habits
                      #   pomodoros courses sites groups overview search report hotspots backups）
components/           # app-shell page-header sidebar topbar pomodoro search-dialog task-item
db/schema.ts          # 全部表定义（单一来源）
db/migrations/        # drizzle-kit 生成的迁移 SQL
lib/                  # API/日期、day-rules、task-query、review-autosave、课程解析与界面偏好
tests/                # node:test；数据库用例仅使用临时库或内存库
scripts/              # 开发、事务迁移、快照备份与桌面构建
desktop-app/          # Electron 壳、独立草稿存储与图标资源 + release/<版本-时间>/ 产物
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

### 5.1 备份与恢复

- 侧边栏“数据与备份”可创建完整 SQLite 快照、查看记录和下载副本；数据目录下的 `backups/` 保存每日、手动和迁移前备份，不自动删除。
- 桌面启动时检查每日备份，运行期间每小时再次检查，同一本地日期只创建一次；网页版通过该页面手动备份。
- 快照使用 `VACUUM INTO`，包括 WAL 内已提交内容，完成后执行完整性检查；不直接复制正在使用的数据库。
- 迁移有待执行文件时，先生成升级快照；每个 SQL 文件与迁移记录在同一事务内提交。失败回滚该文件并中止桌面启动，已完成的前序迁移记录保持可识别。
- 复盘未保存草稿独立于数据库快照：桌面保存在 `userData/drafts/`，不随随机服务端口改变；网页版保存在当前站点的 `localStorage`。

恢复步骤：先下载所需备份并完全退出应用；将整个现有 `data` 文件夹改名留存（一起保留数据库及 WAL/SHM 日志）；在原位置新建 `data` 文件夹，复制选定备份并命名为 `workbench.db`；启动并核对记录。旧数据与旧备份仍保存在改名后的目录。切勿在应用运行时覆盖单个数据库文件。

## 6. 桌面版打包（electron-builder 有坑）

`npm.cmd run dist`（scripts/build-desktop.mjs）是五步流程：Next standalone 构建 → 组装 server → 复制本地 Electron 运行时 → 复制桌面入口 → NSIS。流程不再调用容易被实时防护拖死的 `electron-builder dir`。

**数据安全红线**：Next standalone 可能追踪并复制项目内 `data/workbench.db`。构建脚本会在组装后删除 `server/data/`，并扫描 `.db/.sqlite/.sqlite3`；发现数据库文件即中止打包。发布包只能包含空应用，真实数据始终位于运行时 `userData` 目录。

**历史排查记录（1.2.x）**：electron-builder 的 dir 阶段（解包 Electron 运行时）在本机会被 Windows 实时防护拖到超时（>5 分钟）。以下是 2026-08-26 的手动绕过流程，仅作故障背景；1.3.0 请优先使用已维护的 `npm.cmd run dist`，不能只复制旧版本入口：

1. `npx.cmd next build --webpack`
2. 手动组装 standalone（复制 `.next/standalone` + `.next/static` + `public` + 数据脚本 + `db/migrations` + `node_modules/@libsql/win32-x64-msvc` 到组装目录；1.3.0 的数据脚本必须同时包含 `migrate.mjs`、`backup.mjs`、`data-safety.mjs`）
3. 手动解压缓存的 Electron zip（`%LOCALAPPDATA%\electron\Cache\<hash>\electron-v*-win32-x64.zip`，用 `unzip`）到独立发布目录，把 `electron.exe` 改名为 `人生工作台.exe`，复制 `main.cjs preload.cjs draft-store.cjs package.json` 到 `resources/app/`，复制组装后的 server 到 `resources/app/server/`
4. `npx.cmd electron-builder --win nsis --prepackaged release/win-unpacked -c.directories.output=release`（此阶段很快）

每次构建使用独立目录：`desktop-app/release/<版本>-<构建时间>/人生工作台 Setup <版本>.exe`。发布目录不包含数据库或草稿；新包验证通过后，可清理旧版本安装包与中间产物。

**1.2.0 构建记录（2026-10-04）**：NSIS 安装器已成功生成。electron-builder 26.15.3 在项目没有 Git repository/publish 配置时，会在安装器生成后因空 provider 报错；基于 `win-unpacked` 重打包时需显式传入本地占位配置并禁止发布：

```bash
npx.cmd electron-builder --win nsis --prepackaged release/win-unpacked --config.directories.output=release --config.publish.provider=generic --config.publish.url=https://example.invalid --publish never
```

该命令只生成本地发布描述，不上传文件。

**1.2.1 构建记录（2026-10-05）**：`npm.cmd run dist` 完整通过，已生成 Windows x64 NSIS 安装器 `人生工作台 Setup 1.2.1.exe`；发布目录数据库扫描通过。

**1.3.0 构建记录（2026-10-25）**：正式验收目录为 `desktop-app/release/1.3.0-20261025T071115713Z-d1c90c/`，安装器 `人生工作台 Setup 1.3.0.exe` 为 107,657,452 字节。SHA-256：`AE1EB5B66A45C3366FFA1930204B1FE1D3F9B04D83094C762026564F620AB2CD`。40 项回归通过、1 项因 Windows 文件符号链接权限跳过；源码生产服务和包内 Electron 运行时的 7 项 API 用例均通过；备份按钮、保存失败重试及草稿重新载入已完成浏览器验证。真实项目数据库哈希保持不变。

**1.4.0 构建记录（2026-10-26）**：安装包位于 `desktop-app/release/1.4.0-20261026T112814532Z-2e9230/`，`人生工作台 Setup 1.4.0.exe` 为 107,697,434 字节。SHA-256：`E41BFC460CB59574A9BCF1397119C9CA2FD3CEE1747680A4896DDB7125AB321B`。40 项回归通过、1 项因 Windows 文件符号链接权限跳过；包内 7 项 API 集成通过；桌面 Lighthouse 性能/无障碍/最佳实践为 100/100/100，移动端为 97/100/100；9 个页面在 390px 视口无文档级横向溢出。win-unpacked 扫描未发现数据库文件；真实项目数据库 SHA-256 仍为 `A5E7389BDC504B259A08DB14970BBE3E5C96DA15E203B3D9B9D3A608B1434C2B`。

包内验收：将 `WORKBENCH_PACKAGED_APP` 临时指向发布目录中的 `win-unpacked`，运行 `npm.cmd run test:integration`；脚本以包内 Electron 的 Node 模式启动复制后的服务及迁移，只使用临时数据库并在结束后关闭。发布前必须验证包内运行文件，不能只验证源码服务。旧版失败构建和历史安装包会在新版验收后清理，不用于分发。

**1.4.1 构建记录（2026-10-26）**：安装包位于 `desktop-app/release/1.4.1-20261026T113934112Z-e1df65/`，`人生工作台 Setup 1.4.1.exe` 为 107,698,088 字节。SHA-256：`39C6713C75816F0386CFFDB68C07BD2AC3DE930B94AF30155568F77B787C537E`。生产构建、TypeScript、主进程语法与目标 ESLint 检查通过；正式产物沿用数据库文件排除扫描。用户数据库 SHA-256 保持不变。

**1.5.0 构建与发布记录（2026-10-26）**：安装包位于 `desktop-app/release/1.5.0-20261026T115139721Z-1b9acd/`，`人生工作台 Setup 1.5.0.exe` 为 107,957,373 字节。SHA-256：`F6977FE925B0CE4298298464DDF85D86CB7AD11E5905BC2FA501610322D164EB`。已发布 [GitHub Release v1.5.0](https://github.com/lsh-hua/life-workspace/releases/tag/v1.5.0)，资产 `Setup.1.5.0.exe` 的大小与 SHA-256 均经核对。生产构建、TypeScript、目标 ESLint 与主进程语法检查通过；程序和托盘图标资源已随包；真实项目数据库 SHA-256 仍为 `A5E7389BDC504B259A08DB14970BBE3E5C96DA15E203B3D9B9D3A608B1434C2B`。

**发布产物清理（2026-10-26）**：1.5.0 验收后清理 1.2.1 至 1.4.1 的旧安装器、失败构建目录、旧 `win-unpacked`、打包 staging 与 Next 缓存；发布目录仅保留 1.5.0。源码、正在运行的桌面目录、用户数据和备份不在清理范围。

**NSIS mmap 错误（2026-09-14 遇到）**：makensis 连续三次报 `Internal compiler error #12345: error creating mmap`，清理临时文件无效，疑与系统实时防护有关。绕过方案：改用 zip 目标 `npx.cmd electron-builder --win zip --prepackaged release/win-unpacked -c.directories.output=release`，产物为免安装便携包 `人生工作台-<版本>-win.zip`（解压即运行）。1.0.0 即以 zip 形式发布；日后机器环境变化后可重试 NSIS。

## 7. 已知坑（都是踩过的，别再踩）

1. **构建必须用 `npx next build --webpack`**：Turbopack 构建会因 lightningcss 嵌套包失败。
2. **不能用 better-sqlite3**：无 win32-x64 预编译二进制，已全面改用 @libsql/client。
3. **Git Bash 的 curl 发中文会乱码**（控制台编码问题，非应用 bug）；测 API 用 node fetch 脚本。
4. electron-builder 的 extraResources 默认过滤会丢 node_modules 和 .next，所以打包含 server 必须手动复制（build-desktop.mjs 已处理）。
5. Next 16 的 dev 命令不认 `--host`，只认 `--hostname`（scripts/dev.mjs 已做转换，Kimi Work 预览卡片依赖这个）。
6. 验证后必须停掉临时 dev server（`taskkill //PID <pid> //F`），不允许留后台进程。

## 8. 功能现状

### 已完成（1.5.0）

- **全局界面**：响应式应用壳、桌面可收起侧栏、手机焦点受限导航抽屉、系统/明/暗主题，以及跨桌面随机端口保存的界面偏好
- **总览** `/`：按任务、日程、习惯与灵感分层呈现，不重复列出今日任务；页面共享标题、加载、错误与空状态
- **数据与备份** `/settings`：创建与下载完整快照，查看每日和升级备份，提供保留旧数据的恢复步骤
- **今日待办** `/today`、**本周清单** `/week`（拖拽排序并提供日期选择操作）、**日历** `/calendar`
- **课程表** `/schedule`：周视图网格在窄屏内部滚动、第 N 周切换、单双周、单周微调（停课/调课）、学期设置，自动定位当前周；可配置节次时间与课前通知
- **习惯打卡** `/habits`：12 周热力图、连续天数、新建/删除；总览页可一键打卡
- **复盘** `/review`：三栏结构——日复盘（三问 + 心情 + 自动保存）/ 周复盘 / 月复盘（聚合统计 + 复制 Markdown）
- **番茄钟**：左侧边栏内嵌面板，25 分钟倒计时（截止时间戳实现），可绑定任务，完成记录 + 系统通知；显示下一堂课并提示专注时间冲突
- **开工** `/launch`：网站集合一键全开、本地文件（PDF 等）打开；桌面版侧边栏有开机自启动开关
- **全局搜索**：Ctrl/⌘+K
- **桌面运行**：单实例锁与重复启动聚焦；窗口大小、位置和最大化状态安全恢复
- **应用更新**：手动查询 GitHub 最新公开发行版，显示新版本并打开发布页；不自动下载或覆盖安装

### 1.4.0 界面与交互

- 所有页面统一标题、描述、错误重试和空/加载状态；表单提供可见标签，主要任务操作保持可发现。
- 浅色与深色主题共用语义令牌；主题选择跟随系统或手动设定，偏好写入同站 Cookie，适配桌面随机端口。
- 手机导航支持焦点约束、Escape 关闭和焦点归还；页面布局避免文档级横向溢出，宽网格保留模块内滚动。
- 本次只调整界面、客户端交互与 UI 偏好；不改数据库 schema、领域数据、API 路径或既有复盘草稿保存机制。

### 1.4.1 桌面可靠性

- 第二次启动聚焦已有应用，避免多个内嵌服务同时访问同一本地 SQLite 数据库。
- 窗口状态保存在 `userData/window-state.json`，原子替换；屏幕布局变化、损坏或越界时使用默认窗口，不写入业务数据库。
- 番茄钟完成的崩溃恢复仍待解决幂等记账后再实现，避免恢复时重复生成专注记录。

### 1.5.0 更新、计时与图标

- 版本检查由 `/api/updates` 同源代理 GitHub Releases；无公开发行版时明确提示。检查使用 GitHub 官方“最新发行版”接口，手动触发且有 8 秒超时。
- 番茄钟会话在 Cookie 中保存 UUID、任务绑定和截止时间，因 Cookie 不按端口隔离，可跨桌面随机服务端口恢复。
- `pomodoros.session_id` 唯一索引使结束请求可安全重试；历史行保留 NULL，迁移执行前仍由现有逻辑创建完整快照。
- SVG 是图标源，PNG 用于托盘，ICO 用于 Windows 可执行文件与安装器。
- GitHub 已公开首个 Release v1.5.0；设置页版本检查可识别当前版本，后续发布更高版本后会显示更新提示。
- 本次数据库变化只新增可空会话键与唯一索引；不更新或删除既有记录。

### 1.3.0 保存与日期规则

- 复盘加载完成前暂时禁用编辑；输入先落草稿，网络写入串行合并为最新内容；失败明确显示并可重试。草稿与服务端版本冲突时，保留双方内容供用户选择。
- 今日任务包括今天到期、手动加入今日且未完成，以及本地今天完成的任务。旧已完成任务退出今日统计但保留历史，不清除原有标记。
- 首页与复盘页使用同一连续天数函数，统一按本地日期跨月、跨年和凌晨计算。

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
- 历史：0.1.0 首个桌面版；0.2.0 集合版开工 + 开机自启；1.0.0 首个稳定交接版；1.1.0 课程表与三栏复盘；1.2.0 课程提醒与番茄钟联动；1.2.1 总览视觉重构；1.3.0 备份、安全迁移与保存可靠性；1.4.0 响应式界面与明暗主题；**1.4.1 桌面单实例与窗口恢复**。
- 源码仓库：`https://github.com/lsh-hua/life-workspace`，默认分支 `main`。

## 10. 日后规划（候选方向，按用户意愿排序）

1. 自动下载安装更新（需先发布 GitHub Release 并保留手动下载回退）
2. 应用运行状态与窗口体验的进一步收敛

当前全仓库 ESLint 尚有既有 API 路由警告；前端改动页与共享组件已通过目标 lint 和 TypeScript 检查。

---

*本文档由 AI 助手生成，后续每次迭代后请同步更新。*
