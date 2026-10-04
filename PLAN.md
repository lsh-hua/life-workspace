# 极简人生工作台 · 产品规划与开发计划

> 技术栈：Next.js (App Router) + TypeScript + Tailwind CSS · Drizzle ORM + SQLite（本地文件数据库）
> 定位：单用户、本地优先、极简风格的个人工作台

---

## 一、产品定位与设计原则

- **本地优先**：所有数据存本地 SQLite 文件（如 `data/workbench.db`），无账号、无云端依赖，离线可用。
- **极简主义**：留白充足、无多余装饰；黑白灰为主 + 一个强调色；信息密度适中。
- **一屏一事**：每个模块解决一件事，主区域一次只呈现一个核心视图。
- **键盘友好**：全局搜索（`Ctrl/Cmd + K`）、快捷键新建任务。

---

## 二、整体布局结构

```
┌──────────────┬────────────────────────────────────────┐
│              │  顶部栏：全局搜索框（居中）+ 日期/设置   │
│   左侧        ├────────────────────────────────────────┤
│   侧边栏      │                                        │
│              │                                        │
│  · 总览       │           右侧主区域                    │
│  · 日历       │       （当前模块的内容视图）             │
│  · AI 热点    │                                        │
│  · 今日待办   │                                        │
│  · 本周清单   │                                        │
│  · 今日复盘   │                                        │
│  · 灵感       │                                        │
│  · 开工       │                                        │
│              │                                        │
└──────────────┴────────────────────────────────────────┘
```

- **侧边栏**（约 220px，可折叠为图标栏）：Logo + 8 个导航项 + 底部设置入口。
- **顶部栏**：全局搜索框（跨模块搜索任务/灵感/复盘），右侧显示今日日期、星期。
- **主区域**：随路由切换的模块视图。

---

## 三、核心功能模块规划

### 1. 总览（Dashboard）
- 今日概览卡片：今日待办完成进度（x/y）、本周任务进度条、今日复盘是否已写。
- 快捷入口：快速记一条待办 / 一条灵感。
- 迷你视图：今日时间轴（日历当天事件）、最新 3 条灵感、AI 热点 Top 3。
- 一句话问候 + 今日日期。

### 2. 日历（Calendar）
- 月视图为主，切换周视图。
- 事件来源：带截止日期的任务自动上日历 + 手动创建的日程事件。
- 点击某天 → 侧滑面板显示当日任务、事件、复盘入口。
- 支持新建/编辑/删除日程（标题、时间、备注、颜色标签）。

### 3. AI 热点（AI Hotspots）
- 定时抓取 AI 领域资讯（RSS / 公开 API，如 HackerNews、机器之心、量子位等可配置源）。
- 列表卡片：标题、来源、发布时间、一句话摘要。
- 本地缓存进 SQLite，手动刷新 + 自动刷新（每 N 小时）。
- 支持"收藏"某条热点 → 自动转为一条灵感。
- 失败降级：网络不可用时展示上次缓存内容。

### 4. 今日待办（Today）
- 聚焦"今天"：列出 due = 今天 的任务 + 无日期但标记为"今日"的任务。
- 快速输入框置顶（回车即创建）。
- 勾选完成（带动效）、优先级标记（高/中/低）、拖拽排序。
- 逾期任务红色提示；完成率进度条。

### 5. 本周任务清单（This Week）
- 按周一～周日分组（或按项目/标签分组，可切换）。
- 看板式列表：每天一列，任务可在列间拖拽移动（改 due 日期）。
- 本周完成率统计；上周遗留任务自动提示"是否滚入本周"。

### 6. 今日复盘（Daily Review）
- 每天一篇：日期唯一。
- 结构化模板（可自定义）：
  - 今天完成了什么？
  - 遇到什么问题 / 没完成什么？
  - 明天最重要的 1-3 件事？
  - 心情评分（1-5）+ 一句话总结。
- 历史复盘列表（按日期倒序），可回看、可编辑。
- 简单统计：连续复盘天数（streak）、本周心情曲线。

### 7. 灵感（Inspiration / Inbox）
- 闪念笔记：快速记录，支持多行文本。
- 标签系统：#工作 #想法 #摘抄 等。
- 卡片流展示（最新在前），支持置顶、搜索、按标签筛选。
- 可一键"转为待办任务"。

### 8. 开工（Launchpad）
- 用户预先自定义常用网站（如抖音、飞书、邮箱、文档等）。
- 主区域以图标卡片网格展示所有已配置网站：网站图标（自动获取 favicon）+ 名称。
- **点击卡片 → 直接在新标签页打开对应网站**（`target="_blank"`），作为每天开工的统一入口。
- 支持管理操作：
  - 添加：输入名称 + URL（自动补全 `https://`，自动抓取 favicon）。
  - 编辑 / 删除 / 拖拽排序。
  - 可选分组（如"工作""娱乐"），v1 可先不做分组，用排序即可。
- 「一键全开工」按钮：一次打开全部（或勾选的部分）网站（需浏览器允许弹窗）。
-  favicon 获取策略：优先 Google favicon 服务（`https://www.google.com/s2/favicons?domain=xxx&sz=64`），失败则显示首字母占位图标。

### 9. 全局搜索（顶部）
- `Ctrl/Cmd + K` 唤起，搜索范围：任务标题、灵感内容、复盘内容、日程标题。
- 结果按模块分组展示，回车跳转对应模块并高亮。

---

## 四、技术架构

### 目录结构（规划）

```
life-workbench/
├── app/                      # Next.js App Router
│   ├── layout.tsx            # 全局布局：侧边栏 + 顶部栏
│   ├── page.tsx              # 总览
│   ├── calendar/page.tsx     # 日历
│   ├── hotspots/page.tsx     # AI 热点
│   ├── today/page.tsx        # 今日待办
│   ├── week/page.tsx         # 本周清单
│   ├── review/page.tsx       # 今日复盘
│   ├── inspiration/page.tsx  # 灵感
│   ├── launch/page.tsx       # 开工
│   └── api/                  # Route Handlers（服务端数据操作）
│       ├── tasks/
│       ├── events/
│       ├── reviews/
│       ├── inspirations/
│       ├── hotspots/
│       ├── sites/            # 开工网站 CRUD
│       └── search/
├── components/               # UI 组件（sidebar / topbar / search / 各模块组件）
├── db/
│   ├── schema.ts             # Drizzle 表定义
│   ├── index.ts              # 数据库连接（better-sqlite3）
│   └── migrations/           # 迁移文件
├── lib/                      # 工具函数（日期、抓取、搜索）
├── data/                     # 本地 SQLite 文件（gitignore）
└── drizzle.config.ts
```

### 关键选型

| 项 | 选择 | 说明 |
|---|---|---|
| 框架 | Next.js 15 (App Router) | 服务端组件 + Route Handlers 做 API |
| 语言 | TypeScript (strict) | 全链路类型安全 |
| 样式 | Tailwind CSS | 极简设计系统：自定义色板、间距、字体 |
| 数据库 | SQLite via `better-sqlite3` | 单文件、零配置、本地持久 |
| ORM | Drizzle ORM + drizzle-kit | 类型安全 schema + 迁移管理 |
| 拖拽 | @dnd-kit/core | 任务排序、周看板拖拽 |
| 日期 | date-fns | 周计算、日历网格生成 |
| 资讯抓取 | rss-parser | AI 热点 RSS 聚合 |
| 搜索 | SQL LIKE + 前端高亮 | 本地数据量级足够，无需引入搜索引擎 |

### 数据库 Schema（Drizzle 表设计）

```text
tasks          任务表（今日待办 + 本周清单共用）
  - id            integer PK
  - title         text 非空
  - note          text 可空
  - status        text: 'todo' | 'done'
  - priority      text: 'high' | 'medium' | 'low'，默认 medium
  - due_date      text (YYYY-MM-DD) 可空      ← 决定出现在今天/本周/日历
  - is_today      integer (0/1)               ← 手动加入"今日"
  - sort_order    integer                     ← 拖拽排序
  - source        text: 'manual' | 'inspiration'（由灵感转化的标记）
  - created_at / completed_at

events         日程事件表（日历手动事件）
  - id, title, note
  - date          text (YYYY-MM-DD)
  - start_time / end_time  text 可空
  - color         text 可空

reviews        每日复盘表
  - id
  - date          text 唯一 (YYYY-MM-DD)      ← 每天一篇
  - done_text     text（完成了什么）
  - problem_text  text（问题/未完成）
  - tomorrow_text text（明天要事）
  - mood          integer 1-5
  - summary       text 一句话总结
  - created_at / updated_at

inspirations   灵感表
  - id, content   text 非空
  - tags          text（逗号分隔或 JSON 数组）
  - pinned        integer (0/1)
  - converted     integer (0/1)               ← 是否已转为任务
  - created_at

hotspots       AI 热点缓存表
  - id, title, url, source, summary
  - published_at  text
  - fetched_at    text
  - favorited     integer (0/1)
  - 唯一约束 (source + url) 防重复

sites          开工网站表
  - id
  - name          text 非空（如"飞书"）
  - url           text 非空
  - icon_url      text 可空（favicon 地址，空则前端按域名推导）
  - sort_order    integer                   ← 卡片排序
  - created_at

settings       设置表（KV）
  - key, value    ← 资讯源列表、主题、复盘模板等
```

---

## 五、开发计划（分 7 个阶段，预计 8–13 天）

### 阶段 0：脚手架与基础设施（0.5 天）
- [ ] `create-next-app`（TS + Tailwind + App Router + ESLint）
- [ ] 安装依赖：drizzle-orm、better-sqlite3、drizzle-kit、date-fns、@dnd-kit、rss-parser
- [ ] 配置 drizzle.config.ts；设计并写入全部 schema；生成首个迁移
- [ ] 定义 Tailwind 设计令牌（色板/字体/圆角/阴影），确定极简视觉基调
- [ ] 写 seed 脚本（示例数据，便于开发调试）

**里程碑**：`npm run dev` 可启动，空库自动建表，seed 数据可查询。

### 阶段 1：全局布局 + 数据库 API 层（1 天）
- [ ] 侧边栏组件（8 个导航项、当前路由高亮、可折叠）
- [ ] 顶部栏（日期显示 + 搜索框占位）
- [ ] Route Handlers：tasks / events / reviews / inspirations / sites 的 CRUD API
- [ ] 前端数据请求封装（fetcher + 错误处理）
- [ ] 全局状态约定（服务端组件直取 + 客户端 mutate 后 revalidate）

**里程碑**：八个路由页面可切换，布局成型，API 经 Postman/curl 验证通过。

### 阶段 2：任务系统 —— 今日待办 + 本周清单（2 天）
- [ ] 今日待办：快速创建、勾选完成、优先级、拖拽排序、逾期提示、进度条
- [ ] 本周清单：按天分组看板、跨列拖拽（更新 due_date）、周完成率
- [ ] 任务编辑弹窗（标题/备注/日期/优先级）
- [ ] 遗留任务滚入提示逻辑

**里程碑**：任务的完整生命周期（增删改查、今日/本周/逾期视图）可用。

### 阶段 3：日历 + 今日复盘（2 天）
- [ ] 月视图日历网格（date-fns 生成），任务/事件按日落点
- [ ] 日期点击 → 当日详情侧滑面板；事件 CRUD
- [ ] 周视图切换
- [ ] 复盘：当日编辑器（结构化模板 + 心情评分）、历史列表、streak 统计
- [ ] 复盘与任务联动（自动带入"今日已完成任务"作为参考）

**里程碑**：日历可管理日程，复盘可每日记录并回看。

### 阶段 4：灵感 + AI 热点 + 开工（2 天）
- [ ] 灵感：快速记录、标签、置顶、卡片流、转任务
- [ ] AI 热点：RSS 源配置（settings 表）、抓取服务、入库去重、列表展示
- [ ] 手动刷新 + 定时自动刷新；收藏转灵感
- [ ] 网络失败降级（展示缓存）
- [ ] 开工：sites CRUD 页面、图标卡片网格（favicon 自动获取 + 首字母兜底）、点击新标签打开
- [ ] 开工：拖拽排序、「一键全开工」批量打开

**里程碑**：灵感闭环（记录→筛选→转任务）；热点可持续更新；开工网站可配置、可直达。

### 阶段 5：总览 + 全局搜索 + 打磨（1.5 天）
- [ ] 总览页：进度卡片、快捷入口、迷你视图聚合
- [ ] 全局搜索：`Cmd+K` 弹窗、跨表搜索、分组结果、跳转高亮
- [ ] 空状态设计、加载骨架、微动效（勾选、悬停）
- [ ] 快捷键体系（新建任务、切换模块）
- [ ] 响应式适配（窄屏侧边栏折叠）

**里程碑**：八大模块全部贯通，体验完整。

### 阶段 6：测试与交付（0.5–1 天）
- [ ] 核心流程自测清单（新建→完成→复盘→回看 全链路）
- [ ] 数据持久化验证（重启应用数据不丢）
- [ ] 边界处理：空数据库首启、跨年周计算、长文本
- [ ] README（启动方式、数据文件位置、备份说明）

**里程碑**：可日常使用的 v1.0。

---

## 六、风险与注意事项

1. ~~**better-sqlite3 是原生模块**~~ **已解决**：本机缺 VS Build Tools，且 better-sqlite3 未提供 win32-x64 预编译包，已改用 **@libsql/client**（预编译、API 兼容、Drizzle 官方支持），数据库文件位置不变。
2. **Next.js + SQLite 的部署形态**：本项目定位本地应用，用 `next dev` / `next start` 即可；不要部署到 Serverless 平台（SQLite 无法持久）。
3. **周视图边界**：明确"周"的定义（周一为一周之始），跨年周单独测试。
4. **RSS 源稳定性**：源失效时静默降级，不阻塞其他模块。
5. **数据备份**：整个数据即一个 `.db` 文件，README 中说明复制即备份。
6. **「一键全开工」的弹窗拦截**：浏览器会拦截一次打开多个标签页，需用户授权弹窗权限；降级方案是逐个点击或使用浏览器允许的窗口打开方式。

---

## 七、v1 之外的可选方向（暂不开发）

- 数据可视化（月度热力图、心情曲线大图）
- 深色模式
- 数据导出（Markdown / JSON）
- 本地 AI 摘要接入（对复盘/热点做总结）
- 全局快捷键唤起（Tauri/Electron 桌面化）
