# Changelog

> 每次完成开发任务后在此追加记录，格式固定，方便 AI 解析。

---

## 2026-03-07 — 项目规划阶段（v0.1）

### 已完成
- ✅ 与用户完成初始需求讨论
- ✅ 确定技术栈：Vercel + Neon + DeepSeek + GitHub Actions + PWA
- ✅ 完成 PRD v0.1 初稿

### 变更文件
- docs/PRD.md（新建）
- docs/CONTEXT.md（新建）
- docs/CHANGELOG.md（新建）

### 待下一步
- 方案优化讨论

---

## 2026-03-07 — 方案优化（v0.2）

### 已完成
- ✅ 翻译改为按需分段（GitHub Actions 只翻译前 2000 字，运行时 translate-next 续翻）
- ✅ 新增 API_SECRET 鉴权机制
- ✅ SW 缓存改为分层策略（列表 NetworkFirst，详情 CacheFirst）
- ✅ articles 表新增 translation_status 和 translated_chars 字段
- ✅ 内容写入改为 ON CONFLICT DO NOTHING
- ✅ Paul Graham 暂时从内容源移除

### 变更文件
- docs/PRD.md（更新至 v0.2）
- docs/CONTEXT.md（同步更新）

---

## 2026-03-07 — 工程规范与产品补充（v0.3）

### 已完成
- ✅ CONTEXT.md 新增"当前状态快照"区块
- ✅ 模块状态改为四种（⬜🔨✅⚠️）
- ✅ CHANGELOG 格式细化到子步骤
- ✅ 新增 docs/API.md（模板）
- ✅ 新增 docs/SETUP.md
- ✅ 新增 docs/schema.sql
- ✅ PRD 新增：点击段落查看英文原文
- ✅ PRD 新增：长按卡片标记已读/存档（改为长按菜单，避免与翻页滑动冲突）
- ✅ PRD 新增：文章列表显示阅读进度百分比
- ✅ PRD 新增：DeepSeek 降级策略
- ✅ PRD 新增：URL 去重边界问题记录
- ✅ PRD 新增：GET /api/export 手动导出接口
- ✅ articles 表新增 read_status 字段

### 变更文件
- docs/PRD.md（更新至 v0.3）
- docs/CONTEXT.md（同步更新）
- docs/CHANGELOG.md（追加）
- docs/API.md（新建）
- docs/SETUP.md（新建）
- docs/schema.sql（新建）

### 待下一步
- Codex 执行 PRD 第十一节第 1 步：项目初始化

## 2026-03-07 — 技术细节补充（v0.4）

### 已完成
- ✅ 新增 content_plain 字段（纯文本，用于划线位置计算），解决 HTML 标签干扰问题
- ✅ 确认 content_plain 需返回前端（前端计算划线位置必须用它）
- ✅ translate-next 改为 GREATEST 原子更新，防并发竞态
- ✅ reader.js 翻译触发加 5 秒节流
- ✅ 进度保存改为防抖 10 秒 + visibilitychange/beforeunload 退出保存
- ✅ 引用追踪加失败态 UI："未找到来源，请尝试更完整的文字"
- ✅ "点击段落查看英文"改为段落右侧小图标触发，避免与选文冲突
- ✅ 多用户预留方案明确：user_id 字段保留，API 层用 DEFAULT_USER_ID 常量映射，前端不传
- ✅ schema.sql 新增 content_plain 字段及注释

### 变更文件
- docs/PRD.md（更新至 v0.4）
- docs/CONTEXT.md（同步更新，新增内容双版本说明）
- docs/CHANGELOG.md（追加）
- docs/schema.sql（新增 content_plain 字段）
- docs/API.md（更新文章详情返回字段）

### 待下一步
- Codex 执行 PRD 第十一节第 1 步：项目初始化

---

## 2026-03-07 — 项目初始化（v0.5）

### 已完成
- ✅ 按 PRD 第十节创建完整目录与文件骨架（frontend/api/scripts/.github/workflows/docs）
- ✅ 新建 `package.json`（含 `node-fetch`、`pg`、`@vercel/node` 等依赖）
- ✅ 新建 `vercel.json`（前端静态目录与 `/api/*` 路由）
- ✅ 新建 `.env.example`（`DEEPSEEK_API_KEY`、`NEON_DATABASE_URL`、`API_SECRET`）
- ✅ 新建 `.gitignore`（忽略 `node_modules`、`.env.local`）
- ✅ 更新 `docs/CONTEXT.md` 当前状态快照并将第 1 步标记为完成

### 变更文件
- package.json（新建）
- vercel.json（新建）
- .env.example（新建）
- .gitignore（新建）
- frontend/*（骨架新建）
- api/*（骨架新建）
- scripts/fetch-articles.js（骨架新建）
- .github/workflows/fetch.yml（骨架新建）
- docs/PRD.md（新建，标准化路径）
- docs/CONTEXT.md（新建并更新状态）
- docs/CHANGELOG.md（新建并追加）
- docs/API.md（新建，标准化路径）
- docs/SETUP.md（新建，标准化路径）
- docs/schema.sql（新建，标准化路径）

### 待下一步
- 执行 PRD 第十一节第 2 步：数据库初始化（在 Neon 执行 `docs/schema.sql`）
- 用户需准备：DEEPSEEK_API_KEY、NEON_DATABASE_URL、API_SECRET

---

## 2026-03-07 — 数据库初始化（v0.6）

### 已完成
- ✅ 使用 `docs/schema.sql` 在 Neon 成功执行建表
- ✅ 成功创建 5 张核心表：`articles`、`highlights`、`qa_records`、`reading_list`、`reading_progress`
- ✅ 成功创建 6 个索引：`idx_articles_source_key`、`idx_articles_read_status`、`idx_articles_published_at`、`idx_highlights_article_id`、`idx_qa_records_article_id`、`idx_reading_list_status`
- ✅ 校验 `pgcrypto` 扩展已启用
- ✅ 更新 `docs/CONTEXT.md` 当前状态快照，将数据库初始化标记为完成

### 变更文件
- docs/CONTEXT.md（更新：步骤2状态、环境变量状态、下一步任务）
- docs/CHANGELOG.md（追加 v0.6 记录）

### 待下一步
- 执行 PRD 第十一节第 3 步：抓取脚本 + GitHub Actions

---

## 2026-03-07 — Git 同步规范补充（v0.7）

### 已完成
- ✅ 确认当前本地仓库已绑定远端：`origin -> https://github.com/huxintingdexue/readwise.git`
- ✅ 在 `docs/CONTEXT.md` 新增协作约定：每完成一个 PRD 步骤，必须立即提交并 push 到 `origin/main`
- ✅ `.gitignore` 新增 `.DS_Store`，避免系统文件误提交

### 变更文件
- docs/CONTEXT.md（新增“协作约定”）
- docs/CHANGELOG.md（追加 v0.7 记录）
- .gitignore（新增 `.DS_Store`）

### 待下一步
- 执行 PRD 第十一节第 3 步：抓取脚本 + GitHub Actions（完成后按新约定立即 push）
