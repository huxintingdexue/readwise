# Changelog

> 每次完成开发任务后在此追加记录，格式固定，方便 AI 解析。

---

## 2026-03-18 — 新增已入库 URL 列表接口（v2.10.16）

### 已完成
- ✅ **去重接口**：新增 `GET /api/articles/urls` 返回已入库 url/source_url 列表

### 变更文件
- api/articles.js
- docs/CONTEXT.md
- docs/CHANGELOG.md


## 2026-03-18 — 阅读进度按最大位置保存（v2.10.15）

### 已完成
- ✅ **进度更新**：阅读进度只取最大位置，避免回退覆盖

### 变更文件
- api/reading-progress.js
- docs/CONTEXT.md
- docs/CHANGELOG.md


## 2026-03-18 — 文章列表按发表时间倒序（v2.10.14）

### 已完成
- ✅ **列表排序**：文章列表按发表时间倒序排列

### 变更文件
- frontend/js/app.js
- docs/CONTEXT.md
- docs/CHANGELOG.md


## 2026-03-17 — 管理员控制台默认折叠（v2.10.13）

### 已完成
- ✅ 管理员控制台各区块默认收起
- ✅ 点击区块标题可展开/收起（支持键盘 Enter/Space）
- ✅ 每次进入控制台时重置为全部收起

### 变更文件
- frontend/js/app.js
- frontend/css/reader.css
- docs/CHANGELOG.md

---

## 2026-03-17 — 选区菜单图标文字对齐修复（v2.10.12）

### 已完成
- ✅ 选区菜单按钮改为固定两行栅格（图标槽 + 文字槽）
- ✅ 移除按 action 的 28px 实际放大，改为 `transform` 视觉放大
- ✅ 四个图标与四个文字恢复同一水平线

### 变更文件
- frontend/css/reader.css
- docs/CHANGELOG.md

---

## 2026-03-17 — /api/ingest 支持全文入库（v2.10.13）

### 已完成
- ✅ /api/ingest 新增全文模式（content_zh 直接入库）
- ✅ admin/user_claw 可用全文模式且不受每日次数限制
- ✅ 更新技术债/未来清单与架构图

### 变更文件
- api/ingest.js
- docs/CONTEXT.md
- docs/CHANGELOG.md

---

## 2026-03-17 — 管理员隐藏文章（v2.10.12）

### 已完成
- ✅ 新增文章隐藏状态，记录隐藏原因与隐藏时间
- ✅ 阅读页管理员入口支持隐藏并填写原因
- ✅ 管理员控制台新增已隐藏文章列表与取消隐藏
- ✅ 新增 `/api/admin/articles` 管理隐藏状态

### 变更文件
- api/admin/articles.js
- api/index.js
- frontend/js/api.js
- frontend/js/app.js
- frontend/index.html
- frontend/css/reader.css
- docs/schema.sql
- docs/CONTEXT.md
- docs/CHANGELOG.md

---

## 2026-03-17 — 划线选区可调整性修复（v2.10.11）

### 已完成
- ✅ 移除“菜单出现后自动清空系统选区”的逻辑
- ✅ 恢复长按选区后可继续拖拽调整范围

### 变更文件
- frontend/js/highlight.js
- docs/CHANGELOG.md

---

## 2026-03-17 — 读友标签文案与选区面板修复（v2.10.10）

### 已完成
- ✅ “我添加的”改为“已导入”，翻译中显示“导入中”
- ✅ 标签颜色更淡，且与已读/未读同一水平线
- ✅ 选区时屏蔽系统自带选择面板，避免双菜单

### 变更文件
- frontend/js/app.js
- frontend/css/reader.css
- frontend/js/highlight.js
- docs/CHANGELOG.md

---

## 2026-03-17 — PWA 图标文字重做（v2.10.9）

### 已完成
- ✅ 以旧版 PNG 视觉比例为基准重绘 VT，避免桌面图标留白
- ✅ 由 512 生成 192，保证占比一致
- ✅ 同步修正 SVG 文案样式（去除多余加粗）

### 变更文件
- frontend/icons/icon-512.png
- frontend/icons/icon-192.png
- frontend/icons/icon-512.svg
- frontend/icons/icon-192.svg
- docs/CHANGELOG.md

---

## 2026-03-17 — 进度与位置基准切换为中文（v2.10.8）

### 已完成
- ✅ 划线/提问/进度/跳转统一按 `content_zh` 计算，缺失回退 `content_plain`
- ✅ 列表阅读进度百分比按 `content_zh` 计算
- ✅ 同步更新上下文说明

### 变更文件
- frontend/js/reader.js
- frontend/js/app.js
- frontend/js/notes.js
- api/articles.js
- docs/CONTEXT.md
- docs/CHANGELOG.md

---

## 2026-03-17 — PWA 图标文案更新（v2.10.7）

### 已完成
- ✅ 图标内文案由 `RW` 改为 `VT`
- ✅ 桌面显示名称保持为“今日硅谷”（由 `manifest.json` 控制）
- ✅ 保留原始图标备份（`png` + `svg`）
- ✅ `icon-192.png` 改为直接由 `icon-512.png` 等比缩放生成，保证视觉占比一致

### 变更文件
- frontend/icons/icon-192.png
- frontend/icons/icon-192.svg
- frontend/icons/icon-512.png
- frontend/icons/icon-512.svg
- frontend/icons/icon-192.backup-20260317.png
- frontend/icons/icon-192.backup-20260317.svg
- frontend/icons/icon-512.backup-20260317.png
- frontend/icons/icon-512.backup-20260317.svg
- docs/CONTEXT.md
- docs/CHANGELOG.md

### 待下一步
- 无

---

## 2026-03-17 — 阅读页主题按钮（v2.10.8）

### 已完成
- ✅ 阅读页顶部增加颜色切换按钮，替换原位置
- ✅ 本文划线按钮移动到颜色按钮左侧
- ✅ 颜色切换与“我的”页设置同源，三档全局生效

### 变更文件
- frontend/index.html
- frontend/js/app.js
- docs/CONTEXT.md
- docs/CHANGELOG.md

## 2026-03-17 — 中文摘要改为基于全文生成（v2.10.7）

### 已完成
- ✅ 固定源抓取摘要：从“前文截断翻译”改为“基于全文分段生成 2-3 句中文摘要”
- ✅ 手动投喂摘要：在全文翻译完成后生成 2-3 句中文摘要
- ✅ 补翻译脚本支持强制重生成摘要
- ✅ 已对现有 26 篇文章重生成 `summary_zh`

### 变更文件
- scripts/fetch-articles.js
- api/ingest.js
- scripts/retranslate.js
- frontend/index.html
- docs/CONTEXT.md
- docs/CHANGELOG.md

## 2026-03-17 — 补齐 partial 旧翻译数据

### 已完成
- ✅ `scripts/retranslate.js` 现在会补翻 `translation_status = 'partial'` 的旧文章
- ✅ 已修复 Sam 文章 `b750898a-7208-4200-9d39-b7b64a097cbb`，状态从 `partial` 更新为 `full`

### 变更文件
- scripts/retranslate.js
- docs/CONTEXT.md
- docs/CHANGELOG.md

## 2026-03-17 — 固定源补齐按实际新增计数（v2.10.6）

### 已完成
- ✅ 修复抓取脚本：已存在文章跳过但不占名额
- ✅ 抓取前先查重，避免对已存在文章重复翻译
- ✅ 实际补齐固定源新增文章：`sam` 5 篇、`andrej` 5 篇、`naval` 5 篇

### 变更文件
- scripts/fetch-articles.js
- frontend/index.html
- docs/CONTEXT.md
- docs/CHANGELOG.md

## 2026-03-17 — 阅读进度返回即保存（v2.10.4）

### 已完成
- ✅ 阅读页返回/系统返回时立即保存阅读进度
- ✅ 返回列表后自动刷新进度显示
- ✅ 修复返回时先清空状态导致进度未写入的问题

### 变更文件
- frontend/js/app.js
- docs/CONTEXT.md
- docs/CHANGELOG.md

## 2026-03-17 — 列表隐藏滚动条 + 阅读页滚动条配色（v2.10.5）

### 已完成
- ✅ 列表页隐藏滚动条（非阅读态）
- ✅ 阅读页滚动条保留并跟随主题配色
- ✅ 禁用页面缩放，避免网页感
- ✅ 修复列表页仍显示滚动条（同步到 html）

### 变更文件
- frontend/css/reader.css
- frontend/index.html
- docs/CONTEXT.md
- docs/CHANGELOG.md

## 2026-03-17 — 校验 Neon 待执行项（v2.10.3）

### 已完成
- ✅ 确认 reading_progress 唯一索引存在
- ✅ 确认 invite_codes 表已创建
- ✅ 确认 articles 补字段已存在

### 变更文件
- docs/CONTEXT.md
- docs/CHANGELOG.md

## 2026-03-17 — 补回缺失中文正文（v2.10.2）

### 已完成
- ✅ **补翻译条件修复**：content_zh 为空也会触发补翻译
- ✅ **实际修复**：已补回缺失正文的文章

### 变更文件
- scripts/retranslate.js
- docs/CONTEXT.md
- docs/CHANGELOG.md

## 2026-03-16 — 投喂元信息修复 + 去除冗余字段（v2.10.1）

### 已完成
- ✅ **投喂标题清洗**：避免 URL 当标题，移除媒体/作者后缀
- ✅ **作者/时间提取增强**：补充常见 meta 字段，缺失时回退
- ✅ **修复脚本**：新增 `scripts/repair-ingest-meta.js` 定向修复投喂文章
- ✅ **字段简化**：移除 `is_fully_translated`，统一用 `translation_status`

### 变更文件
- api/ingest.js
- scripts/fetch-articles.js
- scripts/ingest-translate.js
- scripts/retranslate.js
- scripts/repair-ingest-meta.js
- docs/schema.sql
- frontend/index.html
- docs/CONTEXT.md
- docs/CHANGELOG.md

## 2026-03-16 — 列表宽度溢出修复（v2.10.0）

### 已完成
- ✅ **防止长标题撑宽**：列表与卡片强制 max-width 100%，标题支持换行
- ✅ **横向溢出屏蔽**：body 禁止横向滚动

### 变更文件
- frontend/css/reader.css
- frontend/index.html
- docs/CHANGELOG.md

## 2026-03-16 — 翻译完整状态回归 + 全量补翻译（v2.9.9）

### 已完成
- ✅ **状态回归**：完整翻译状态统一使用 `translation_status`
- ✅ **补翻译执行**：已对未翻译完文章补齐全文与标题/摘要

### 变更文件
- api/ingest.js
- scripts/fetch-articles.js
- scripts/ingest-translate.js
- scripts/retranslate.js
- docs/schema.sql
- docs/CONTEXT.md
- docs/CHANGELOG.md

## 2026-03-15 — 移除 Lenny 数据源（v2.9.8）

### 已完成
- ✅ **抓取配置移除**：不再抓取 Lenny RSS
- ✅ **筛选移除**：列表筛选与作者显示移除 Lenny

### 变更文件
- scripts/fetch-articles.js
- api/articles.js
- frontend/index.html
- frontend/js/app.js
- docs/CONTEXT.md
- docs/CHANGELOG.md

## 2026-03-15 — 气泡图标对齐（v2.9.7）

### 已完成
- ✅ **气泡按钮统一对齐**：图标与文字垂直居中，修复高低不一致

### 变更文件
- frontend/css/reader.css
- frontend/index.html
- docs/CHANGELOG.md

## 2026-03-15 — 选中文本定位 + 阅读页骨架屏（v2.9.6）

### 已完成
- ✅ **选中文本定位**：划线/提问改用中文内容定位，不再提示“原文位置”
- ✅ **读友投喂置灰规则**：仅翻译中置灰，完成后恢复正常
- ✅ **阅读页加载态优化**：延迟 180ms 再显示骨架屏，避免闪烁

### 变更文件
- frontend/js/highlight.js
- frontend/js/app.js
- frontend/js/reader.js
- frontend/css/reader.css
- frontend/index.html
- docs/CHANGELOG.md

## 2026-03-15 — 阅读页加载态优化（v2.9.5）

### 已完成
- ✅ **立即进入阅读页**：点击卡片后先展示加载态，再渲染正文
- ✅ **失败回退**：加载失败自动返回列表并提示

### 变更文件
- frontend/js/app.js
- frontend/js/reader.js
- frontend/css/reader.css
- frontend/index.html
- docs/CHANGELOG.md

## 2026-03-15 — 投喂翻译元信息 + 标签可见性（v2.9.4）

### 已完成
- ✅ **标题/摘要翻译**：投喂文章翻译完成后同步补齐中文标题与摘要
- ✅ **标签规则**：“读友推荐”改为“我添加的”，仅投喂者可见

### 变更文件
- api/ingest.js
- scripts/ingest-translate.js
- frontend/js/app.js
- frontend/index.html
- docs/CHANGELOG.md

## 2026-03-15 — 读友投喂卡片置顶与置灰（v2.9.3）

### 已完成
- ✅ **置顶显示**：读友投喂文章在列表最前方展示
- ✅ **灰色卡片**：读友投喂卡片整体置灰，弱化阅读感

### 变更文件
- frontend/js/app.js
- frontend/css/reader.css
- frontend/index.html
- docs/CHANGELOG.md

## 2026-03-15 — 顶部按钮调整 + 投喂说明（v2.9.2）

### 已完成
- ✅ **隐藏筛选入口**：今日/我的页顶部不再显示筛选按钮
- ✅ **隐藏我的页加号**：添加文章按钮仅在今日页显示
- ✅ **投喂说明文案**：添加文章面板增加翻译提示
- ✅ **待办补充**：新增“首页文章的筛选”

### 变更文件
- frontend/index.html
- frontend/css/reader.css
- frontend/js/app.js
- docs/CONTEXT.md
- docs/CHANGELOG.md

## 2026-03-15 — 手动投喂自动翻译（v2.9.1）

### 已完成
- ✅ **定时翻译推进**：新增 GitHub Actions 每 5 分钟推进翻译
- ✅ **后台脚本**：`scripts/ingest-translate.js` 每次推进多段，缩短等待

### 变更文件
- .github/workflows/ingest-translate.yml
- scripts/ingest-translate.js
- docs/CONTEXT.md
- docs/CHANGELOG.md

## 2026-03-15 — 手动投喂链接（v2.9.0）

### 已完成
- ✅ **手动投喂入口**：今日页顶部“+”按钮打开添加文章面板
- ✅ **后台抓取与入库**：新增 `POST /api/ingest`，写入 `status=translating` 并异步分段翻译
- ✅ **翻译轮询**：列表存在翻译中时，前端 30 秒轮询触发翻译推进
- ✅ **列表展示**：翻译中显示“翻译中...”，不可进入；完成后显示“读友推荐”
- ✅ **数据库字段补充**：articles 表新增 `submitted_by`、`status`、`source_url`、`author`
- ✅ **环境变量示例收敛**：INVITE_CODES 仅保留 admin 兜底示例

### 变更文件
- .env.example
- api/index.js
- api/articles.js
- api/ingest.js
- frontend/index.html
- frontend/css/reader.css
- frontend/js/app.js
- frontend/js/api.js
- docs/schema.sql
- docs/CONTEXT.md
- docs/CHANGELOG.md

## 2026-03-15 — 管理员控制台整合 + 邀请码管理（v2.8.0）

### 已完成
- ✅ **管理员控制台页面**：整合反馈、统计、邀请码管理
- ✅ **邀请码管理接口**：新增 `GET/POST /api/admin/invite-codes`
- ✅ **邀请码迁移**：auth 优先 env，后查 invite_codes 表
- ✅ **管理员入口整合**：我的页仅保留“管理员控制台”
- ✅ **移除诊断模块**：普通用户“我的”页不再显示调试入口

### 变更文件
- api/_utils/auth.js
- api/admin/invite-codes.js
- api/admin/stats.js
- api/auth/verify.js
- api/articles.js
- api/highlights.js
- api/reading-list.js
- api/reading-progress.js
- api/qa.js
- api/search-reference.js
- api/export.js
- api/feedback.js
- api/events.js
- api/index.js
- frontend/index.html
- frontend/css/reader.css
- frontend/js/app.js
- frontend/js/api.js
- docs/schema.sql
- docs/CONTEXT.md
- docs/CHANGELOG.md

## 2026-03-15 — 合并 API 入口以适配 Vercel 限制（v2.7.2）

### 已完成
- ✅ **API 合并入口**：新增 `api/index.js` 路由分发，Vercel 仅部署单函数
- ✅ **删除旧接口**：移除已不使用的 `api/translate-next.js`
- ✅ **Vercel 配置调整**：`builds`/`routes` 仅指向 `api/index.js`

### 变更文件
- api/index.js
- api/translate-next.js
- vercel.json
- docs/CONTEXT.md
- docs/CHANGELOG.md

## 2026-03-15 — 我的页版本号提示（v2.7.1）

### 已完成
- ✅ **版本号提示**：我的页底部展示版本号，便于确认更新

### 变更文件
- frontend/index.html
- frontend/css/reader.css
- docs/CONTEXT.md
- docs/CHANGELOG.md

## 2026-03-15 — MVP 用户行为监控（v2.7.0）

### 已完成
- ✅ **events 表**：新增用户行为埋点表（open_app/open_article/finish_article）
- ✅ **埋点接口**：`POST /api/events` 失败静默
- ✅ **前端埋点**：启动、打开文章、阅读完成（80%）触发
- ✅ **管理员数据面板**：新增 `/api/admin/stats` 与前端展示面板
- ✅ **调试信息复制兜底**：剪贴板失败时使用 execCommand 兜底
- ✅ **数据面板降级**：events 表不可用时返回空统计
- ✅ **退出登录按钮**：移至账号区块标题同行，轻量样式
- ✅ **颜色按钮修复**：等宽不换行
- ✅ **移除列表长按菜单**：不再显示标记已读/存档入口
- ✅ **移除跟随系统**：仅保留标准/护眼/深色三档
- ✅ **退出登录按钮无边框**：改为纯文字弱按钮

### 变更文件
- api/events.js
- api/admin/stats.js
- frontend/js/api.js
- frontend/js/app.js
- frontend/js/reader.js
- frontend/index.html
- frontend/css/reader.css
- docs/schema.sql
- docs/CONTEXT.md
- docs/CHANGELOG.md

## 2026-03-15 — 顶部标题栏固定 + 主题跟随系统（v2.6.1）

### 已完成
- ✅ **顶部标题栏固定**：列表页 topbar 设为 `position: sticky`，背景不透明
- ✅ **主题设置移至“我的”**：新增 4 个选项（跟随系统/标准/护眼/深色）
- ✅ **跟随系统主题**：使用 `matchMedia` 自动切换浅色/深色
- ✅ **顶部移除主题按钮**：不再在 topbar 显示切换按钮
- ✅ **跟随系统修复**：使用 `matchMedia` 的 change 监听兼容写法
- ✅ **反馈弹窗不透明**：避免后方内容透出
- ✅ **诊断入口**：新增“复制主题调试信息”按钮便于手机端排查

### 变更文件
- frontend/index.html
- frontend/css/reader.css
- frontend/js/app.js
- docs/CONTEXT.md
- docs/CHANGELOG.md

## 2026-03-15 — 底部导航优化 + 我的页 + 反馈（v2.6.0）

### 已完成
- ✅ **底部导航均分**：两个 tab 各占 50% 宽度居中对齐
- ✅ **副标题更新**："直连硅谷，一手信息触手可及" → "全球一手信息触手可及"
- ✅ **“我的”页**：账号邀请码展示、导出入口、反馈入口
- ✅ **反馈接口**：新增 `POST /api/feedback` 写入 feedback 表
- ✅ **管理员入口**：`zhaodagua:admin` + 反馈查看面板与 GET /api/feedback
- ✅ **反馈提示优化**：发送成功提示“发送成功，感谢反馈！”并关闭弹窗
- ✅ **反馈发送一击提交**：改用 `touchend` 防止需二次点击

### 变更文件
- frontend/index.html
- frontend/css/reader.css
- frontend/js/app.js
- frontend/js/api.js
- api/feedback.js
- api/_utils/auth.js
- docs/schema.sql
- .env.example
- docs/CONTEXT.md
- docs/CHANGELOG.md

## 2026-03-15 — 多用户阅读进度唯一键修复（v2.5.2）

### 已完成
- ✅ **reading_progress 唯一键调整**：由 `article_id` 改为 `(article_id, user_id)`，避免多用户进度互相覆盖
- ✅ **upsert 逻辑同步**：进度写入使用 `(article_id, user_id)` 冲突键

### 变更文件
- api/reading-progress.js
- docs/schema.sql
- docs/CONTEXT.md
- docs/CHANGELOG.md

## 2026-03-15 — 底部导航栏不透明背景（v2.5.1）

### 已完成
- ✅ **底部导航栏背景修复**：改为使用主题色 `var(--bg)`，避免内容透出
- ✅ **安全区适配**：`padding-bottom` 使用 `env(safe-area-inset-bottom, 12px)`
- ✅ **深色模式实色**：移除深色模式下的半透明覆盖

### 变更文件
- frontend/css/reader.css
- docs/CONTEXT.md
- docs/CHANGELOG.md

## 2026-03-15 — 邀请码白名单多用户 + 每日限流（v2.5.0）

### 已完成
- ✅ **邀请码校验接口**：新增 `POST /api/auth/verify` 校验邀请码并返回 user_id
- ✅ **全 API 多用户隔离**：API 统一从 `X-Invite-Code` 解析 user_id，替换 DEFAULT_USER_ID
- ✅ **问答/引用每日限流**：QA 50 次/天、引用追踪 10 次/天
- ✅ **前端登录遮罩**：邀请码登录、错误提示、长按主题按钮显示“退出登录”
- ✅ **导出与笔记过滤**：参考请求不展示在 QA 列表/导出中
- ✅ **环境变量补充**：新增 `INVITE_CODES`

### 变更文件
- api/_utils/auth.js
- api/_utils/rateLimit.js
- api/auth/verify.js
- api/articles.js
- api/highlights.js
- api/qa.js
- api/reading-list.js
- api/reading-progress.js
- api/search-reference.js
- api/export.js
- frontend/index.html
- frontend/css/reader.css
- frontend/js/api.js
- frontend/js/app.js
- .env.example
- docs/CONTEXT.md
- docs/CHANGELOG.md

## 2026-03-15 — 抓取全量翻译 + 前端移除 translate-next（v2.4.0）

### 已完成
- ✅ **抓取改为全量翻译入库**：正文按 1500 字分段串行翻译；单段失败记录错误并用英文段落回填
- ✅ **translated_chars 全量写入**：入库时直接写 `length(content_plain)`，避免前中后英混杂
- ✅ **前端阅读页简化**：移除滚动触发 translate-next 与中英拼接逻辑，优先渲染 `content_zh`，为空则显示 `content_en`
- ✅ **新增补翻译脚本**：`node scripts/retranslate.js` 扫描未全量翻译文章并回填全文翻译
- ✅ **补翻译顺序优化**：优先处理短文（按 `length(content_plain)` 升序）
- ✅ **抓取工作流加长超时**：GitHub Actions `timeout-minutes` 调整为 30
- ✅ **移除 Peter RSS 源**：避免持续 404 干扰日志

### 变更文件
- scripts/fetch-articles.js
- scripts/retranslate.js
- frontend/js/reader.js
- frontend/js/api.js
- .github/workflows/fetch.yml
- docs/CONTEXT.md
- docs/CHANGELOG.md

## 2026-03-14 — 新增 Lenny & Naval 内容源（v2.3.0）

### 已完成
- ✅ **新增 Lenny Rachitsky**：`source_key: lenny`，RSS `https://www.lennysnewsletter.com/feed`（Substack）
- ✅ **新增 Naval Ravikant**：`source_key: naval`，RSS `https://nav.al/feed`
- ✅ **作者筛选下拉新增两项**：`lenny → Lenny Rachitsky`、`naval → Naval Ravikant`
- ✅ **`sourceName()` 辅助函数同步更新**：文章卡片元数据正确显示作者名

### 首次抓取结果（INITIAL_FETCH=3，本地执行）
| 源 | 抓取结果 |
|----|----------|
| sam | 2 篇新增（1 篇已存在跳过；1 篇 fallback-summary） |
| andrej | 2 篇新增（1 篇已存在跳过；1 篇 fallback-summary） |
| peter | ❌ 全部 feed URL 返回 404（已知问题，暂未修复） |
| lenny | ✅ 3 篇全部新增 |
| naval | ✅ 3 篇全部新增 |
| **合计** | **10 篇新增** |

### 变更文件
- scripts/fetch-articles.js
- frontend/index.html
- frontend/js/app.js

---

## 2026-03-14 — 三档主题切换 + 按钮移至列表页（v2.2.0）

### 已完成
- ✅ **三档主题循环**：白天（☀️）→ 护眼（🌿）→ 深色（🌙）→ 白天，按钮点击依次循环
- ✅ **主题 CSS 变量全局化**：从 `.reading-mode / .reading-mode.theme-dark`（仅阅读页生效）迁移至 `body.theme-warm / body.theme-dark`（全站生效），`:root` 作为白天模式默认值
  - 白天：`--bg: #F5F5F0`，`--panel: #fff`，`--text: #1a1a1a`，`--muted: #888`
  - 护眼：`--bg: #F5ECD7`，`--panel: rgba(255,255,255,0.6)`，`--text: #1a1a1a`
  - 深色：`--bg: #1a1a1a`，`--panel: #181c23`，`--text: #c8c8c8`，`--muted: #666`
- ✅ **localStorage 默认白天**：旧存档 `'warm'` 和 `'dark'` 继续兼容，其余均 fallback 到 `'day'`
- ✅ **主题切换按钮移位**：从阅读页状态栏移除，移至列表页顶部 topbar 右侧，位于筛选漏斗图标的左边；在阅读模式下随 topbar 一起隐藏（`reading-mode .topbar { display:none }`）
- ✅ **`.topbar-actions`**：新增右侧按钮组（主题 + 筛选并排），`display:flex; gap:8px`

### 关键设计
- `.reading-mode` 不再承担颜色变量，仅做 UI 布局（隐藏导航栏等）
- `.reading-mode.theme-dark .bottom-nav` → `body.theme-dark .bottom-nav`（深色底部导航全站生效）

### 变更文件
- frontend/index.html
- frontend/css/reader.css
- frontend/js/app.js

---

## 2026-03-14 — 划线面板全屏化（v2.1.1）

### 已完成
- ✅ **划线面板全屏化**：`.notes-panel` 从浮层（`right:16px; bottom:16px; width:min(420px,...); max-height:70vh; border-radius; box-shadow`）改为全屏固定层（`top:0; left:0; right:0; bottom:0; background:var(--bg)`），背景色使用纯色 `var(--bg)` 不再透明，文章正文不再透出
- ✅ **面板头部重构**：关闭按钮改为左侧 `←` 返回箭头（复用 `.back-btn` 样式），标题"本文划线"居中靠左；使用 `gap + flex` 布局替换 `justify-content:space-between`
- ✅ **卡片文字缩小**：`.note-item` 和 `.note-item-text` 的 `font-size` 从 `15px` 降至 `14px`
- ✅ **面板内容区**：`.notes-panel-body` 添加 `flex:1` 使内容区撑满剩余空间，`padding` 增加至 `16px`

### 变更文件
- frontend/index.html
- frontend/css/reader.css

---

## 2026-03-14 — 阅读页状态栏重构 + 划线面板卡片化（v2.1.0）

### 已完成
- ✅ **状态栏布局重构**：移除标题区域，改为 `← ............ [划线图标] [☀️]`；返回按钮独立靠左，划线按钮与日夜切换靠右并排；`#readerTitle`/`#readerMeta` 保留在 DOM 供 JS 使用但 `display:none` 不展示
- ✅ **划线按钮改为图标**：`#articleNotesBtn` 从文字"本文划线"改为 SVG 高亮笔图标（与选文气泡保持一致），样式与主题切换按钮统一（36×36 圆形）
- ✅ **划线面板卡片化**：`notes.js` `initArticleNotesPanel` 改为只显示划线（不含问答），每条划线渲染为 WeChat Reading 卡片风格：左侧暖黄图标圆角方块 + 右侧正文最多 3 行省略；点击卡片跳转到对应段落并关闭面板
- ✅ **面板标题**："本文划线与问答" → "本文划线"
- ✅ `reading-mode #articleNotesBtn { display: none }` 规则已移除，划线按钮在阅读模式下正常显示
- ✅ `.reader-header` 从 `grid-template-columns: auto 1fr auto` 改为 `flex + space-between`，新增 `.reader-header-right` 右侧按钮组，新增 `.header-icon-btn` 图标按钮样式，新增 `.note-item-icon` 和 `.note-item-text` 卡片子元素样式

### 变更文件
- frontend/index.html
- frontend/css/reader.css
- frontend/js/notes.js
- docs/CONTEXT.md
- docs/CHANGELOG.md

### 待下一步
- 无

---

## 2026-03-14 — 划线后气泡闪烁彻底修复 + QA 输入框自动撑高精修（v2.0.8）

### 已完成
- ✅ **划线后气泡闪烁（v2）**：根本原因是 `surroundContents()` 触发 `selectionchange` 开始 300ms 计时，而 `await createHighlight(...)` 网络请求往往 >300ms，计时器到期后 `onSelectionChange` 重新弹出菜单，此时 `clearTimeout` 已来不及。修复：① 立即 `clearTimeout` ② DOM 包裹 ③ `removeAllRanges() + hideMenu()` ④ `createHighlight(...).catch()` 改为非阻塞——前三步全部在网络请求之前同步完成，300ms 后选区已为空，菜单不会重弹
- ✅ **QA 输入框预填高度多一行空白**：`height = 'auto'` 在安卓 WebView 上因 `rows="1"` 属性影响，scrollHeight 计算结果偏大。改为 `height = '1px'`（强制压到最小），再读 scrollHeight，确保返回"刚好容纳内容"的最小高度
- ✅ **QA 输入框用户输入不自动展开**：之前 autoResize 只在 openQaModal 时执行一次。在 `ensureModal()` 里给 textarea 加 `input` 事件监听，实时调用 `autoResize()`，用户每次击键输入都会触发高度更新；提取 `autoResize(el, minH=40)` 为模块级辅助函数复用

### 变更文件
- frontend/js/highlight.js
- frontend/js/qa.js
- docs/CONTEXT.md
- docs/CHANGELOG.md

### 待下一步
- 无

---

## 2026-03-14 — 已划线高亮持久化 + 触摸检测重写 + QA 输入框居中 + 预填自动展开（v2.0.7）

### 已完成
- ✅ **划线持久化**：文章渲染后调用 `getHighlights(articleId)` 重新获取历史划线记录，通过 `applyHighlightsToDOM()` 用 TreeWalker 定位文本节点并用 `.highlight-mark` span 重新包裹，退出再进入文章后划线高亮不再消失
- ✅ **点击已划线触摸检测重写**：安卓 WebView 对 `user-select: text` 的文字节点 `click` 事件不可靠；改为监听 `touchend`，命中 `.highlight-mark` 时 `preventDefault()` 阻断后续 click，等 50ms 后检查 getSelection()：无选区则显示"删除划线"气泡（纯点击），有选区则走普通选文气泡逻辑（长按扩展选区）
- ✅ **QA 输入框 placeholder 垂直居中**：`line-height: 40px` 对 textarea 无效（文字始终贴顶）；改为 `padding: 9px 14px` + `box-sizing: border-box`，利用上下等距内边距实现真正垂直居中；同步加 `overflow: hidden` 配合自动高度计算
- ✅ **QA 预填文字自动展开 + 弹出键盘**：`openQaModal` 传入 `selectionText` 时，在 `requestAnimationFrame` 内 `height='auto'` → `scrollHeight` 动态撑高输入框，随后 `focus()` + `setSelectionRange(len, len)` 将光标定位到末尾并弹出输入法（豆包风格）
- ✅ `highlight.js` 新增并导出 `applyHighlightsToDOM(readerContent, highlights)`
- ✅ `reader.js` 新增 `getHighlights` 与 `applyHighlightsToDOM` 导入，在 `renderReader` 设置 innerHTML 后异步调用

### 变更文件
- frontend/js/highlight.js
- frontend/js/reader.js
- frontend/js/qa.js
- frontend/css/reader.css
- docs/CONTEXT.md
- docs/CHANGELOG.md

### 待下一步
- 无（删除划线暂只做本地 DOM 操作，后端 deleteHighlight API 待日后补充）

---

## 2026-03-14 — 划线高亮填充 + 气泡图标对齐 + 点击已划线弹窗 + QA 输入框精修（v2.0.6）

### 已完成
- ✅ `.highlight-mark`：`padding: 0 2px` → `4px 3px`，加 `box-decoration-break: clone`，高亮背景上下各溢出约 4px，多行划线每行均完整显示
- ✅ 气泡图标垂直对齐：`.selection-menu` 改为 `align-items: stretch`，按钮内部加 `justify-content: space-between`，所有图标上对齐、所有文字标签下对齐，视觉统一
- ✅ 点击已划线文字弹出专属气泡：`highlight.js` 新增 `showMenuOnHighlight()` 及 `readerContent.click` 委托监听；气泡将"划线"按钮换成"删除划线"（data-action="remove-highlight"），点击后解包 `.highlight-mark` span 还原纯文本并提示"已删除划线"；关闭菜单时自动恢复按钮状态
- ✅ 菜单 click 委托改为 `.closest('[data-action]')`，`<span class="btn-label">` 包裹文字标签，解决子元素点击无法识别 data-action 的问题
- ✅ QA 输入框：`height: 40px; line-height: 40px; padding: 0 14px`，不依赖 rows 控制高度，placeholder 随 line-height 自然垂直居中；发送按钮同为 `height: 40px`，两者精确等高
- ✅ QA 发送后 `questionInput.blur()`，主动收起键盘，不再弹回输入法

### 变更文件
- frontend/js/highlight.js
- frontend/js/qa.js
- frontend/css/reader.css
- docs/CONTEXT.md
- docs/CHANGELOG.md

### 待下一步
- 无（删除划线暂只做本地 DOM 操作，后端 deleteHighlight API 待日后补充）

---

## 2026-03-14 — 气泡文字换行修复 + QA 输入框居中收紧 + 聊天气泡留白缩减（v2.0.5）

### 已完成
- ✅ 选文气泡按钮：加 `white-space: nowrap` 防止"查引用"文字换两行；去掉 `flex: 1`，每个按钮按内容自然撑宽；`padding: 4px 2px` → `6px 10px`，视觉更舒展；图标到文字 gap 从 6px 缩至 4px
- ✅ QA textarea 改为 `rows="1"`，`padding: 10px 14px` → `8px 14px`，占位符文字自然垂直居中；输入栏整体高度减少约 30%（原两行高 ~60px → 单行高 ~42px）；加 `resize: none` 禁用拖拽
- ✅ QA 发送按钮加 `align-self: center`，与单行输入框上下对齐更美观
- ✅ QA 聊天气泡 `padding: 12px 16px` → `8px 12px`，文字之外留白缩减约 30%

### 变更文件
- frontend/js/qa.js
- frontend/css/reader.css
- docs/CONTEXT.md
- docs/CHANGELOG.md

### 待下一步
- 无

---

## 2026-03-14 — QA 发送修复 + 背景滚动锁定 + 气泡图标与收紧（v2.0.4）

### 已完成
- ✅ QA 发送按钮改用 `touchend` + `preventDefault()` 直接调用提取的 `handleSubmit` 函数，彻底解决安卓 WebView 键盘收起后需二次点击的问题（`pointerdown` 方案无效，换用 `touchend` 绕过 blur/layout-shift 循环）
- ✅ QA 弹窗打开时执行 `document.body.style.overflow = 'hidden'`，关闭时恢复，防止背景文章被滑动
- ✅ QA 弹窗内添加 `touchmove` 监听：仅允许 `.qa-chat-body` 内部滚动，其余区域 `preventDefault()`，防止聊天区滚动穿透到正文
- ✅ `.qa-chat-body` 增加 `overscroll-behavior: contain`，阻止橡皮筋滚动溢出
- ✅ 气泡图标大小修正：`划线`/`查引用` SVG 改为 28px（线条较细视觉偏小），`复制`/`提问` 保持 20px
- ✅ 气泡背景收紧：移除固定 `width: 280px`，`padding` 从 `12px 8px` 缩至 `8px 6px`，`gap` 从 `6px` 缩至 `4px`，气泡随内容宽度自适应

### 变更文件
- frontend/js/qa.js
- frontend/css/reader.css
- docs/CONTEXT.md
- docs/CHANGELOG.md

### 待下一步
- 无

---

## 2026-03-14 — 气泡定位精修 + QA 面板与排版优化（v2.0.3）

### 已完成
- ✅ 重构 `showMenu`：改为在 `requestAnimationFrame` 内用 `offsetHeight` 测量真实菜单高度，彻底消除估算偏差导致的位置错误
- ✅ 上方 gap 从 24px 增至 48px，下方 gap 也设为 48px，两侧各露出约半行文字
- ✅ 修复拖动后气泡仍显示在上方的 bug：将 `_wasMenuVisible` flag 改为 `currentSelection !== null` 判断（首次选区 → null → 上方；拖动调整 → 非 null → 下方）
- ✅ QA 面板高度改回 `height: 85vh`（固定不变）
- ✅ QA 发送按钮加 `pointerdown` + `preventDefault()`，阻止 textarea 失焦/键盘收起，一次点击即可发送
- ✅ 正文左右 padding 从 16px 缩至 8px，文字更加横铺屏幕

### 变更文件
- frontend/js/highlight.js
- frontend/js/qa.js
- frontend/css/reader.css
- docs/CONTEXT.md
- docs/CHANGELOG.md

### 待下一步
- 无

---

## 2026-03-14 — 选文气泡三态定位与阅读体验优化（v2.0.2）

### 已完成
- ✅ 选文气泡三态定位逻辑（参考微信读书）：
  - 初始长按选中 → 气泡出现在选区上方（底部距选区顶部 24px）
  - 用户拖动调整选区 → selectionchange 触发时立即隐藏气泡
  - 拖动结束（300ms 无事件）→ 气泡出现在选区下方（顶部距选区底部 40px）
  - 边界处理：上方不足则翻转至下方，下方不足则翻转至上方
- ✅ 气泡箭头方向随位置自动切换（上方：向下三角；下方：向上三角），新增 `.menu-below` CSS 类
- ✅ 图标一致性：`.selection-menu svg` 增加 `flex-shrink: 0`，防止不同路径设计导致视觉大小不一
- ✅ QA 对话气泡高度自适应：`.qa-sheet` 改用 `max-height: 85vh` + flex 布局，`.qa-chat-body` 改用 flex column + `align-items: flex-start`，"思考中..."气泡不再撑开大空白
- ✅ 正文左右 padding 从 24px 收窄至 16px，文字横铺屏幕，贴近微信读书排版
- ✅ 新增 `::selection` / `::-webkit-selection` 规则，选区高亮色改为暖黄 rgba(255,180,60,0.4)

### 变更文件
- frontend/js/highlight.js
- frontend/css/reader.css
- docs/CONTEXT.md
- docs/CHANGELOG.md

### 待下一步
- 无

---

## 2026-03-14 — 修复安卓 WebView 选文气泡二次点击问题（v1.9.8）

### 已完成
- ✅ 修复安卓 WebView 长按选文后需再点击一次才弹出自定义操作气泡的问题
- ✅ 根因：安卓 `touchend` 在 OS 填充 `window.getSelection()` 之前触发，导致首次 `onSelectionChange` 读到空选区直接返回
- ✅ 新增 `document.selectionchange` 监听（300ms 防抖），在选区真正就绪后触发菜单，无需额外点击

### 变更文件
- frontend/js/highlight.js
- docs/CONTEXT.md
- docs/CHANGELOG.md

### 待下一步
- 无

---

## 2026-03-14 — 阅读沉浸与底部 Tab 优化（v1.9.2）

### 已完成
- ✅ 阅读页进入沉浸模式：隐藏列表页元素，仅保留左上返回箭头
- ✅ 底部 Tab 样式轻量化：背景与页面融合、选中高亮、未选中灰色
- ✅ 调整沉浸模式：保留文章标题，隐藏元信息

### 变更文件
- frontend/index.html
- frontend/css/reader.css
- frontend/js/app.js
- docs/CHANGELOG.md

### 待下一步
- 无

---

## 2026-03-14 — 配色与主题切换（v1.9.3）

### 已完成
- ✅ 默认暖色主题（背景/正文/次要文字）并应用到全站
- ✅ 深色主题适配（背景/正文/次要文字）
- ✅ 阅读页右上角新增主题切换按钮（☀️/🌙），使用 localStorage 记忆
- ✅ 当前背景更新为 #1A1A1A（深色主题）

### 变更文件
- frontend/index.html
- frontend/css/reader.css
- frontend/js/app.js
- docs/CHANGELOG.md

### 待下一步
- 无

---

## 2026-03-14 — 列表页灰色主题（v1.9.4）

### 已完成
- ✅ 首页/列表页改为微信读书风格灰色背景与浅色卡片
- ✅ 阅读页继续使用暖色主题，主题切换仅作用于阅读模式

### 变更文件
- frontend/css/reader.css
- docs/CHANGELOG.md

### 待下一步
- 无

---

## 2026-03-14 — 选文/沉浸/AI 提问改版（v1.9.5）

### 已完成
- ✅ 选文气泡改为长按即出、上方横排图标+文字（复制/划线/提问/查引用）
- ✅ 自定义气泡失败时降级为系统选文菜单
- ✅ 进入阅读默认隐藏顶部状态栏，点击正文切换显示
- ✅ 状态栏整合返回箭头 + 本文划线 + 夜间切换
- ✅ AI 提问改为底部滑入对话面板，支持连续对话与思考中动画（最多保留 5 轮）

### 变更文件
- frontend/index.html
- frontend/css/reader.css
- frontend/js/app.js
- frontend/js/highlight.js
- frontend/js/qa.js
- docs/CHANGELOG.md

### 待下一步
- 无

---

## 2026-03-14 — 选文菜单修复（v1.9.6）

### 已完成
- ✅ 恢复自定义选文气泡优先级，默认禁用系统选文菜单
- ✅ 仅在自定义气泡失败时才退回系统菜单

### 变更文件
- frontend/js/highlight.js
- docs/CHANGELOG.md

### 待下一步
- 无

---

## 2026-03-14 — 去除选文降级逻辑（v1.9.7）

### 已完成
- ✅ 移除自定义气泡失败降级逻辑，强制禁止系统选文菜单

### 变更文件
- frontend/js/highlight.js
- docs/CHANGELOG.md

### 待下一步
- 无

---

## 2026-03-14 — 阅读返回栈修复（v1.9.8）

### 已完成
- ✅ 进入文章时写入 history 栈，安卓右滑返回可回列表
- ✅ 监听 popstate，返回列表页而非退出 App

### 变更文件
- frontend/js/app.js
- docs/CHANGELOG.md

### 待下一步
- 无

---

## 2026-03-14 — 选文气泡与阅读配色微调（v1.9.9）

### 已完成
- ✅ 点击非气泡区域取消选中并隐藏气泡
- ✅ 选文气泡改为深灰背景 + 白字，底部三角指向选区
- ✅ 阅读暖色背景调整为 #F5ECD7，正文字色 #1A1A1A
- ✅ 划线高亮色改为 rgba(255, 180, 60, 0.3)

### 变更文件
- frontend/css/reader.css
- frontend/js/highlight.js
- docs/CHANGELOG.md

### 待下一步
- 无

---

## 2026-03-14 — 列表/阅读/气泡/问答全面优化（v2.0.0）

### 已完成
- ✅ 列表页改为暖白背景与白色卡片阴影，隐藏“共 X 篇”
- ✅ 阅读页暖色配色、行高/段距/页边距优化
- ✅ 划线高亮色统一为更暖的 rgba(255, 193, 80, 0.35)
- ✅ 选文气泡固定宽度 280px，竖排图标+文字与箭头指向
- ✅ 复制功能增加 execCommand 兜底，成功提示“已复制”
- ✅ AI 问答面板改为豆包风格：白底遮罩、气泡样式与底部输入栏

### 变更文件
- frontend/css/reader.css
- frontend/js/app.js
- frontend/js/highlight.js
- docs/CHANGELOG.md

### 待下一步
- 无

---

## 2026-03-14 — 选文与问答细节修复（v2.0.1）

### 已完成
- ✅ 选文气泡图标统一 20px、文字 12px、等宽布局
- ✅ 打开 AI 问答时清除选区并隐藏气泡
- ✅ 发送按钮与输入框 focus 颜色改为 #3C3C3C
- ✅ 对话气泡高度自适应（移除固定高度）

### 变更文件
- frontend/css/reader.css
- frontend/js/highlight.js
- docs/CHANGELOG.md

### 待下一步
- 无

---

## 2026-03-14 — PWA 秒刷新策略（v1.9.1）

### 已完成
- ✅ Service Worker 立即接管（`skipWaiting + clientsClaim` 已存在），新增导航/静态资源 Network First
- ✅ `sw.js` 版本升级为 `v2`，触发缓存更新
- ✅ `index.html` 与 `/` 增加 `Cache-Control: no-cache` 响应头

### 变更文件
- frontend/sw.js
- vercel.json
- docs/CHANGELOG.md

### 待下一步
- 无

---

## 2026-03-14 — 应用改名与 UI 调整（v1.9.0）

### 已完成
- ✅ App 名称与副标题改为“今日硅谷 / 直连硅谷，一手信息触手可及”，同步更新 `title` 与 manifest
- ✅ Tab 导航移至底部固定栏，顶部移除切换按钮
- ✅ 筛选改为右上角漏斗按钮弹出面板（状态/作者/排序）
- ✅ 文章卡片优化：摘要两行截断、间距收紧、阅读状态改为右上角小字
- ✅ 文案与展示修复：未读/已读文案统一中文、作者显示全名、日期格式改为“2月12日”
- ✅ `docs/CONTEXT.md` 追加“未来优化清单”

### 变更文件
- frontend/index.html
- frontend/css/reader.css
- frontend/js/app.js
- frontend/js/reader.js
- frontend/manifest.json
- docs/CONTEXT.md
- docs/CHANGELOG.md

### 待下一步
- 无

---

## 2026-03-13 — 文档清理（v1.0.1）

### 已完成
- ✅ 删除 docs 中旧命名的重复文档（Readwise api/changelog/context/prd/schema/setup），保留标准命名的一套

### 变更文件
- docs/Readwise api（删除）
- docs/Readwise changelog（删除）
- docs/Readwise context（删除）
- docs/Readwise prd.md（删除）
- docs/Readwise schema（删除）
- docs/Readwise setup（删除）
- docs/CHANGELOG.md（追加 v1.0.1）

### 待下一步
- 无

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

## 2026-03-08 — PWA PNG 图标（v1.8.4）

### 已完成
- ✅ 生成 192/512 PNG 应用图标并更新 manifest 引用

### 变更文件
- frontend/manifest.json
- frontend/icons/icon-192.png
- frontend/icons/icon-512.png
- docs/CHANGELOG.md

---

## 2026-03-08 — PWA Service Worker 路由（v1.8.5）

### 已完成
- ✅ 显式将 `/sw.js` 路由到 `frontend/sw.js`

### 变更文件
- vercel.json
- docs/CHANGELOG.md

---

## 2026-03-08 — PWA Service Worker 兜底注册（v1.8.6）

### 已完成
- ✅ 在 `index.html` 中增加 SW 兜底注册，确保 PWABuilder 可检测
- ✅ `/sw.js` 响应头补充 `Service-Worker-Allowed`

### 变更文件
- frontend/index.html
- vercel.json
- docs/CHANGELOG.md

---

## 2026-03-08 — 补充 manifest id（v1.8.7）

### 已完成
- ✅ manifest 添加 `id: "/"`，提升可安装性/打包兼容性

### 变更文件
- frontend/manifest.json
- docs/CHANGELOG.md

---

## 2026-03-08 — 移动端选区菜单优化（v1.8.8）

### 已完成
- ✅ 禁止默认长按菜单，优先展示自定义选区菜单

### 变更文件
- frontend/js/highlight.js
- frontend/css/reader.css
- docs/CHANGELOG.md

---

## 2026-03-08 — Vercel 统一托管前端（v1.8.1）

### 已完成
- ✅ 调整 `vercel.json`：前端 `/frontend` 作为静态根目录，`/` 可直接访问

### 变更文件
- vercel.json
- docs/CONTEXT.md
- docs/CHANGELOG.md






