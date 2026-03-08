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

---

## 2026-03-07 — 抓取脚本与工作流（v0.8）

### 已完成
- ✅ 实现 `scripts/fetch-articles.js`：抓取 3 个 RSS/Atom 源（Sam/Andrej/Peter）
- ✅ 支持 `INITIAL_FETCH`（默认每源抓取 1 篇，首次可传 `INITIAL_FETCH=3`）
- ✅ 实现“摘要降级”策略：正文抓取失败时仍入库，`translation_status='summary_only'`
- ✅ 实现内容双版本生成：`content_en`（清洗后 HTML）+ `content_plain`（去标签纯文本）
- ✅ 实现入库去重策略：`ON CONFLICT (url) DO NOTHING`，保证历史内容不覆盖
- ✅ 实现入库时翻译：标题 + 摘要 + `content_plain` 前 2000 字（按句子边界截断）
- ✅ 增加 feed URL 回退机制（针对 Peter 源尝试 `feed.xml/index.xml/atom.xml`）
- ✅ 新增 GitHub Actions 工作流 `.github/workflows/fetch.yml`：每天 UTC 14:00 自动运行，支持手动触发并传入 `initial_fetch`
- ✅ 完成脚本语法校验：`node --check scripts/fetch-articles.js`
- ✅ 完成一次 smoke test（`INITIAL_FETCH=1`）：成功入库 2 篇（Sam 1、Andrej 1）
- ⚠️ 发现 Peter 源当前返回 404（已容错，不阻塞其他源抓取）

### 变更文件
- scripts/fetch-articles.js（从空文件实现为完整抓取脚本）
- .github/workflows/fetch.yml（从空文件实现为定时任务）
- docs/CONTEXT.md（更新第 3 步状态与当前快照）
- docs/CHANGELOG.md（追加 v0.8）

### 待下一步
- 执行 PRD 第十一节第 4 步：后端基础 API（优先 `api/articles.js`，含阅读进度 join）

---

## 2026-03-07 — 抓取数据质量修复（v0.9）

### 已完成
- ✅ 修复 `summary_en/summary_zh` 清洗逻辑：去除所有 HTML 标签（含转义标签如 `&lt;style&gt;`）
- ✅ 强化 `content_plain` 清洗：统一走纯文本清洗函数，避免标签/样式残留
- ✅ 增加标题去重：移除 `content_plain` 开头与标题重复的文本
- ✅ 新增 `REPAIR_SUMMARY=1` 修复模式：对已存在 URL 允许更新 `summary_en/summary_zh/content_plain`
- ✅ 已对现有文章执行修复回写：2 篇记录完成修复并通过回查验证

### 变更文件
- scripts/fetch-articles.js（清洗逻辑、去重逻辑、修复模式）
- docs/CONTEXT.md（补充数据质量修复完成状态）
- docs/CHANGELOG.md（追加 v0.9）

### 待下一步
- 执行 PRD 第十一节第 4 步：后端基础 API（`api/articles.js`）

---

## 2026-03-07 — 后端基础 API（v1.0）

### 已完成
- ✅ 实现 `api/articles.js`
- ✅ 支持 `GET /api/articles`：`status/author/sort` 筛选参数
- ✅ 列表接口完成 `reading_progress` 表 join，并返回 `read_progress` 百分比（`scroll_position / length(content_plain) * 100`）
- ✅ 支持 `GET /api/articles/:id`
- ✅ 详情接口返回 `content_en` 与 `content_plain` 两个字段
- ✅ 所有接口增加 `Authorization: Bearer <API_SECRET>` 校验，不匹配返回 401
- ✅ 更新 `vercel.json` 路由，支持 `/api/articles/:id` 映射到 `api/articles.js`
- ✅ 更新 `docs/API.md` 对应接口状态为已实现

### 变更文件
- api/articles.js（从空文件实现为后端接口）
- vercel.json（新增 `/api/articles/:id` 路由映射）
- docs/API.md（两个 articles 接口状态改为 ✅）
- docs/CONTEXT.md（第 4 步状态更新）
- docs/CHANGELOG.md（追加 v1.0）

### 待下一步
- 执行 PRD 第十一节第 5 步：前端基础（Tab 导航、文章列表、阅读页）

---

## 2026-03-07 — 前端基础（v1.1）

### 已完成
- ✅ 实现 `frontend/index.html`：Tab 布局（今日/笔记）、筛选栏、文章列表、阅读视图、长按菜单、toast
- ✅ 实现 `frontend/css/reader.css`：基础视觉样式与移动端适配
- ✅ 实现 `frontend/js/api.js`：统一 fetch 封装，自动带 `Authorization: Bearer <API_SECRET>`
- ✅ 实现 `frontend/js/app.js`：Tab 切换、列表拉取、筛选/排序、进度展示、长按菜单、点击进入阅读
- ✅ 实现 `frontend/js/reader.js`：文章详情渲染，返回列表交互
- ✅ 前端安全修复：列表渲染字段统一做 HTML 转义，避免 XSS 注入
- ✅ 在 `docs/CONTEXT.md` 协作约定补充“三项固定汇报模板（①②③）”

### 变更文件
- frontend/index.html
- frontend/css/reader.css
- frontend/js/api.js
- frontend/js/app.js
- frontend/js/reader.js
- docs/CONTEXT.md
- docs/CHANGELOG.md

### 待下一步
- 执行 PRD 第十一节第 6 步：PWA（manifest + sw + 缓存策略 + 阅读进度防抖/退出保存）

---

## 2026-03-07 — PWA 与阅读进度（v1.2）

### 已完成
- ✅ 实现 `frontend/manifest.json`（PWA 基础配置）
- ✅ 实现 `frontend/sw.js` 缓存策略：
  - 文章列表 `/api/articles`：Network First
  - 文章详情 `/api/articles/:id`：Cache First + 后台更新
  - 图片请求：不缓存
- ✅ 前端接入 Service Worker 自动注册（`frontend/js/app.js`）
- ✅ 实现 `api/reading-progress.js`（GET/POST，含鉴权）
- ✅ 阅读进度保存接入：
  - 10 秒防抖保存
  - `visibilitychange` 退出保存
  - `beforeunload` 使用 `keepalive` 发送最终保存
- ✅ 阅读页恢复进度：打开文章时读取 `reading_progress` 并按 `content_plain` 长度恢复滚动

### 变更文件
- frontend/manifest.json
- frontend/sw.js
- frontend/index.html
- frontend/js/api.js
- frontend/js/app.js
- frontend/js/reader.js
- api/reading-progress.js
- docs/API.md
- docs/CONTEXT.md
- docs/CHANGELOG.md

### 待下一步
- 执行 PRD 第十一节第 7 步：按需翻译（`translate-next.js` + reader 5 秒节流触发 + 查看英文图标）

---

## 2026-03-07 — PWA 离线与鉴权补丁（v1.2.1）

### 已完成
- ✅ 前端 secret 回退逻辑改为“仅 localhost 开发环境启用 localStorage”，生产默认禁用
- ✅ `getReadingProgress` 改为失败降级，不再因进度接口失败阻塞文章打开
- ✅ 更新本地配置示例注释，明确仅用于本地开发
- ✅ 在 `docs/CONTEXT.md` 新增后续安全改造待办：迁移到后端 Cookie/短期 Token 鉴权

### 变更文件
- frontend/js/api.js
- frontend/js/local-config.example.js
- docs/CONTEXT.md
- docs/CHANGELOG.md

---

## 2026-03-07 — 按需翻译（v1.3）

### 已完成
- ✅ 实现 `api/translate-next.js`（POST）：
  - 鉴权校验
  - `article_id + from_char` 入参处理
  - 每次按句子边界翻译约 2000 字
  - 携带前 200 字“上文参考（不翻译）”
  - 数据库 `translated_chars` 使用 `GREATEST` 原子更新
  - 完成后自动切换 `translation_status='full'`
- ✅ 阅读页接入按需翻译触发：
  - 到 500 字触发首次续翻
  - 每隔 1500 字续翻一次
  - 同一篇文章请求间隔至少 5 秒（节流）
- ✅ 实现段落右侧 `EN` 图标，点击弹出对应 `content_plain` 英文片段
- ✅ 更新 `docs/API.md`：`POST /api/translate-next` 状态改为 ✅
- ✅ 同步前端健壮性：`getReadingProgress` 失败降级不阻塞阅读

### 变更文件
- api/translate-next.js
- frontend/js/api.js
- frontend/js/reader.js
- frontend/js/app.js
- frontend/index.html
- frontend/css/reader.css
- docs/API.md
- docs/CONTEXT.md
- docs/CHANGELOG.md

### 待下一步
- 执行 PRD 第十一节第 8 步：划线功能（`highlight.js` + `api/highlights.js`）

---

## 2026-03-07 — 划线功能（v1.4）

### 已完成
- ✅ 实现 `api/highlights.js`（GET/POST，含鉴权）
- ✅ 实现 `frontend/js/highlight.js`：阅读区选区菜单（复制 / 划线 / 原文）
- ✅ 划线保存入库字段：`article_id`、`text`、`position_start`、`position_end`、`type`
- ✅ 划线位置按 `content_plain` 计算并存储（满足后续 QA/引用链路）
- ✅ 英文原文查看逻辑调整为“选区驱动”而非段落 `EN` 粗映射
- ✅ 同步修正文档接口状态（`docs/API.md`）

### 变更文件
- api/highlights.js
- frontend/js/highlight.js
- frontend/js/api.js
- frontend/js/app.js
- frontend/js/reader.js
- frontend/index.html
- frontend/css/reader.css
- docs/API.md
- docs/CONTEXT.md
- docs/CHANGELOG.md

### 待下一步
- 执行 PRD 第十一节第 9 步：AI 提问（`qa.js` + `api/qa.js`）

---

## 2026-03-07 — 划线定位优化（v1.4.1）

### 已完成
- ✅ 中文翻译内容选区无法定位时改为“近似映射”兜底（基于中英长度比例）
- ✅ 选区定位为近似时给出提示，避免误解精确度

### 变更文件
- frontend/js/highlight.js

---

## 2026-03-07 — 划线可视化与原文面板修复（v1.4.2）

### 已完成
- ✅ 选区划线后即时渲染高亮背景（`highlight-mark`）
- ✅ 修复“点击原文无显示”问题（阻止点击事件冒泡导致面板被关闭）
- ✅ 取消“近似匹配”提示（记录为已知问题，后续优化对齐算法）

### 变更文件
- frontend/js/highlight.js
- frontend/css/reader.css
- docs/CONTEXT.md
- docs/CHANGELOG.md

---

## 2026-03-07 — AI 提问（v1.5）

### 已完成
- ✅ 实现 `api/qa.js`（鉴权 + DeepSeek 调用 + 入库）
- ✅ 实现 `frontend/js/qa.js`（提问弹窗 + 提交逻辑）
- ✅ 选区菜单加入“提问”，自动拼接上下文（前后各 5 句）
- ✅ 前端新增 QA 弹窗 UI 与样式
- ✅ 补全 `docs/API.md` 中 `POST /api/qa` 状态

### 变更文件
- api/qa.js
- frontend/js/qa.js
- frontend/js/highlight.js
- frontend/js/api.js
- frontend/index.html
- frontend/css/reader.css
- docs/API.md
- docs/CONTEXT.md
- docs/CHANGELOG.md

---

## 2026-03-08 — QA 弹窗兜底（v1.5.1）

### 已完成
- ✅ 当页面缺少 QA 弹窗节点时，前端自动注入弹窗结构（避免弹窗不显示）

### 变更文件
- frontend/js/qa.js
- docs/CHANGELOG.md

---

## 2026-03-08 — 修复提问弹窗触发（v1.5.2）

### 已完成
- ✅ 修复“提问”按钮点击后弹窗不出现的问题（避免清空选区引用）

### 变更文件
- frontend/js/highlight.js
- docs/CHANGELOG.md

---

## 2026-03-08 — QA 提问结果展示（v1.5.3）

### 已完成
- ✅ 提问提交后在弹窗内展示 AI 回答

### 变更文件
- frontend/js/qa.js
- frontend/js/highlight.js
- frontend/index.html
- frontend/css/reader.css
- docs/CHANGELOG.md

---

## 2026-03-08 — 引用追踪（v1.6）

### 已完成
- ✅ 实现 `api/search-reference.js`（鉴权 + DeepSeek 识别 + 失败态）
- ✅ 书籍识别后自动加入阅读列表，文章识别需确认加入
- ✅ 前端选区菜单新增“查引用”，展示 Banner 与失败提示
- ✅ 补全 `docs/API.md` 中 `POST /api/search-reference` 状态

### 变更文件
- api/search-reference.js
- frontend/js/reference.js
- frontend/js/highlight.js
- frontend/js/api.js
- frontend/js/reader.js
- frontend/index.html
- frontend/css/reader.css
- docs/API.md
- docs/CONTEXT.md
- docs/CHANGELOG.md

---

## 2026-03-08 — 引用追踪测试面板（v1.6.1）

### 已完成
- ✅ 增加本地临时“引用测试”输入框，便于验证 search-reference

### 变更文件
- frontend/index.html
- frontend/css/reader.css
- frontend/js/reference.js
- frontend/js/app.js
- docs/CHANGELOG.md

---

## 2026-03-08 — 移除引用测试面板（v1.6.2）

### 已完成
- ✅ 移除临时“引用测试”输入框

### 变更文件
- frontend/index.html
- frontend/css/reader.css
- frontend/js/reference.js
- frontend/js/app.js
- docs/CHANGELOG.md

---

## 2026-03-08 — 笔记 Tab（v1.7）

### 已完成
- ✅ 新增笔记 Tab：按文章聚合划线与问答
- ✅ 新增书单展示（reading_list）
- ✅ 阅读页“本文划线”入口与面板
- ✅ 补齐 `api/reading-list.js`、`GET /api/qa`、`GET /api/highlights` 全量查询
- ✅ 同步更新 API/Context/Changelog 文档

### 变更文件
- api/reading-list.js
- api/qa.js
- api/highlights.js
- frontend/js/notes.js
- frontend/js/app.js
- frontend/js/reader.js
- frontend/js/api.js
- frontend/index.html
- frontend/css/reader.css
- docs/API.md
- docs/CONTEXT.md
- docs/CHANGELOG.md

---

## 2026-03-08 — 笔记返回显示修复（v1.7.1）

### 已完成
- ✅ 从文章返回笔记页时不再显示“今日”列表

### 变更文件
- frontend/js/app.js
- docs/CHANGELOG.md

---

## 2026-03-08 — 数据导出（v1.8）

### 已完成
- ✅ 实现 `GET /api/export`，返回划线 / 问答 / 书单
- ✅ 更新 `docs/API.md` 与 `docs/CONTEXT.md`

### 变更文件
- api/export.js
- docs/API.md
- docs/CONTEXT.md
- docs/CHANGELOG.md

---

## 2026-03-08 — 前端硬编码 API_SECRET（v1.8.2）

### 已完成
- ✅ `frontend/js/api.js` 改为硬编码 API_SECRET 占位，移除 localStorage 逻辑

### 变更文件
- frontend/js/api.js
- docs/CHANGELOG.md

---

## 2026-03-08 — PWA 图标补齐（v1.8.3）

### 已完成
- ✅ 补充 PWA icons（192/512）以满足安装为独立应用

### 变更文件
- frontend/manifest.json
- frontend/icons/icon-192.svg
- frontend/icons/icon-512.svg
- docs/CHANGELOG.md

---

## 2026-03-08 — Vercel 统一托管前端（v1.8.1）

### 已完成
- ✅ 调整 `vercel.json`：前端 `/frontend` 作为静态根目录，`/` 可直接访问

### 变更文件
- vercel.json
- docs/CONTEXT.md
- docs/CHANGELOG.md
