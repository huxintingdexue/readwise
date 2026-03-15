# ReadWise — 项目上下文

> 此文件由 AI 维护，每次完成开发任务后必须更新。
> 下一个接手的 AI：请先完整阅读本文件，再开始任何修改。

---

## 当前状态（每次任务后必须更新）

- 最后完成步骤：PRD 第十一节第 12 步：数据导出 ✅
- 最近变更：邀请码白名单多用户 + 每日限流 ✅
- 最近变更：底部导航栏背景改为不透明并跟随主题 ✅
- 最近变更：主题设置移至“我的”并支持跟随系统 ✅
- 最近变更：修复跟随系统与反馈弹窗不透明 ✅
- 最近变更：新增主题调试信息复制入口 ✅
- 最近变更：用户行为埋点 + 管理员数据面板 ✅
- 最近变更：账号区块退出登录按钮 + 颜色按钮等宽 ✅
- 最近变更：调试复制兜底 + 数据面板降级 ✅
- 最近变更：移除文章列表长按菜单 ✅
- 最近变更：移除跟随系统主题选项 ✅
- 最近变更：退出登录按钮无边框 ✅
- 最近变更：管理员控制台整合 + 邀请码管理 ✅
- 最近变更：移除普通用户诊断模块 ✅
- 最近变更：手动投喂链接（翻译中可见、完成后全员可见）✅
- 最近变更：手动投喂翻译由 GitHub Actions 每 5 分钟推进 ✅
- 最近变更：读友投喂文章置顶 + 灰色卡片 ✅
- 最近变更：投喂文章标题/摘要补齐中文 + 标签仅投喂者可见 ✅
- 最近变更：阅读页加载态优化（点击即进入）✅
- 最近变更：合并 API 入口以适配 Vercel Hobby 限制 ✅
- 最近变更：我的页底部版本号提示 ✅
- 最近变更：reading_progress 改为按 (article_id, user_id) 唯一 ✅
- 待执行：Neon 迁移 reading_progress 唯一键为 (article_id, user_id)
- 待执行：Neon 创建 invite_codes 表并迁移已有邀请码
- 待执行：Neon 为 articles 表补充 `submitted_by/status/source_url/author` 字段
- 最近变更："我的"页 + 反馈/管理员入口 ✅
- 最近变更：反馈发送成功提示文案优化 ✅
- 最近变更：反馈发送改为一次点击提交 ✅
- 最近变更：PWA 秒刷新策略（SW v2 + index.html no-cache）✅
- 最近变更：阅读页沉浸模式 + 底部 Tab 轻量样式 ✅
- 最近变更：沉浸模式保留文章标题 ✅
- 最近变更：抓取全量翻译入库 + 前端移除 translate-next + 重新翻译脚本 ✅
- 最近变更：补翻译脚本优先处理短文 ✅
- 最近变更：全站暖/深色主题切换 ✅
- 最近变更：列表页灰色主题，阅读页保持暖色 ✅
- 最近变更：选文气泡/沉浸状态栏/AI 对话面板 ✅
- 最近变更：选文气泡优先显示（系统菜单仅兜底） ✅
- 最近变更：移除选文降级逻辑 ✅
- 最近变更：阅读页返回栈修复 ✅
- 最近变更：选文气泡样式与阅读暖色微调 ✅
- 最近变更：列表/阅读/气泡/问答样式统一优化 ✅
- 最近变更：选文与问答细节修复 ✅
- 最近变更：修复安卓 WebView 长按选文后需二次点击才弹出气泡的问题 ✅
- 最近变更：选文气泡三态定位（初始上方/拖动隐藏/结束下方）+ QA 气泡高度自适应 + 正文 padding 收窄 + 选区颜色 ✅
- 最近变更：修复气泡定位用实际高度/间距修正 + QA 面板固定85vh + 发送无需二次点击 + 正文 padding 缩至 8px ✅
- 最近变更：QA 发送改用 touchend 直接调用 + 背景滚动锁定 + 气泡图标大小修正（划线/查引用 28px）+ 气泡背景收紧 ✅
- 最近变更：气泡按钮 white-space:nowrap 防换行 + 按钮宽度自适应 + QA textarea rows=1 垂直居中 + 聊天气泡留白缩减 ✅
- 最近变更：划线高亮上下扩展 + 气泡图标对齐（stretch+space-between）+ 点击已划线弹"删除划线"气泡 + QA 输入框精确等高 + 发送后收键盘 ✅
- 最近变更：划线退出再进入持久化（applyHighlightsToDOM）+ 安卓 WebView touchend 检测重写 + QA 输入框 padding 垂直居中 + 预填文字自动撑高 + 弹出键盘 ✅
- 最近变更：划线后气泡闪烁修复（clearTimeout+removeAllRanges）+ QA 输入框高度精修（height=1px）+ 输入时实时撑高（input 监听）✅
- 最近变更：阅读页状态栏重构（← ............ [划线图标][☀️]）+ 划线面板卡片化（仅划线/微信读书风格卡片）✅
- 最近变更：划线面板全屏化（全屏固定层 + 纯色背景 + ← 返回按钮 + 卡片文字缩至 14px）✅
- 最近变更：主题选择（跟随系统/标准/护眼/深色）+ 全站生效 + 设置在“我的”页 ✅
- 最近变更：新增 Lenny Rachitsky（lenny）+ Naval Ravikant（naval）两个内容源 ✅
- 本地/部署是否可运行：✅ 可运行（Vercel 统一托管前端 + API）
- 数据库是否已初始化：✅（Neon 已执行 schema.sql）
- 环境变量是否已配置：DEEPSEEK_API_KEY ✅ / NEON_DATABASE_URL ✅ / API_SECRET ✅ / INVITE_CODES ✅（仅 admin 兜底）
- 当前已有真实数据：✅（抓取脚本 smoke test 已写入 2 篇：sam 1、andrej 1）
- 下一步任务：无（MVP 步骤已完成）

---

## 协作约定（新增）

- 每完成 PRD 第十一节中的一个步骤，必须立即执行一次 Git 提交并推送到 `origin/main`
- 提交后需在 `docs/CHANGELOG.md` 追加本步骤记录，并同步更新本文件的“当前状态”与“待开发功能”勾选状态
- 每步完成后对用户固定汇报三项：①完成了什么 ②遇到了什么问题 ③下一步需要用户做什么

## 项目概述

ReadWise 是一个个人沉浸式阅读器，聚合 AI 领域大佬博客（Sam Altman、Andrej Karpathy、Lenny Rachitsky、Naval Ravikant），支持划线、AI 提问、引用追踪、离线阅读。前端为 PWA，后端为 Vercel Serverless Functions，数据库为 Neon PostgreSQL。

## 架构图

```
GitHub Actions（每天北京时间 22:00）
    ↓ 抓取RSS + 爬全文 + 生成content_plain + 全量分段翻译
Neon PostgreSQL（五张表）
    ↓ REST API（Bearer Token 鉴权，后端映射 DEFAULT_USER_ID）
Vercel Serverless Functions（/api/*）
    ↓ fetch（api.js 封装，自动带 Authorization header，不传 user_id）
前端 PWA（GitHub Pages）
    → 用户手机浏览器
    → 进度每10秒防抖保存 + 退出前保存
```

## 内容双版本说明（重要）

| 字段 | 内容 | 用途 |
|------|------|------|
| content_en | 富文本，含 HTML 标签 | 前端渲染 |
| content_plain | 纯文本，无 HTML 标签 | 划线位置计算、进度记录、翻译分段 |

**所有 position_start/end 和 scroll_position 均基于 content_plain 计算，不是 content_en。**
**content_plain 需要随文章详情一起返回给前端，前端用它计算划线位置。**

## 模块说明

| 文件 | 职责 | 状态 |
|------|------|------|
| scripts/fetch-articles.js | 抓取RSS、爬全文、生成content_plain、全量分段翻译、写入数据库 | ✅ 已完成 |
| scripts/ingest-translate.js | 手动投喂翻译推进（5 分钟定时） | ✅ 已完成 |
| scripts/retranslate.js | 扫描未全量翻译文章并补齐全文翻译 | ✅ 已完成 |
| .github/workflows/fetch.yml | cron UTC 14:00，支持 INITIAL_FETCH | ✅ 已完成 |
| api/articles.js | GET /api/articles（join进度表返回百分比）| ✅ 已完成 |
| api/highlights.js | GET/POST /api/highlights | ✅ 已完成 |
| api/qa.js | POST /api/qa（DeepSeek 问答 + 每日限流） | ✅ 已完成 |
| api/reading-list.js | GET/POST/PATCH /api/reading-list | ✅ 已完成 |
| api/reading-progress.js | GET/POST /api/reading-progress | ✅ 已完成 |
| api/search-reference.js | POST /api/search-reference（每日限流） | ✅ 已完成 |
| api/auth/verify.js | POST /api/auth/verify（邀请码校验） | ✅ 已完成 |
| api/feedback.js | GET/POST /api/feedback（用户反馈） | ✅ 已完成 |
| api/events.js | POST /api/events（用户行为埋点） | ✅ 已完成 |
| api/admin/stats.js | GET /api/admin/stats（数据面板） | ✅ 已完成 |
| api/admin/invite-codes.js | GET/POST /api/admin/invite-codes（邀请码管理） | ✅ 已完成 |
| api/ingest.js | POST /api/ingest（手动投喂+翻译推进） | ✅ 已完成 |
| api/_utils/auth.js | 邀请码解析工具（含 isAdmin） | ✅ 已完成 |
| api/_utils/rateLimit.js | 限流统计工具 | ✅ 已完成 |
| api/export.js | GET /api/export | ✅ 已完成 |
| frontend/js/app.js | 主逻辑、Tab 切换 | ✅ 已完成（前端基础） |
| frontend/js/reader.js | 翻页、进度（防抖10秒+退出保存）、直接渲染中文/英文 | ✅ 已完成 |
| frontend/js/highlight.js | 选文菜单、划线（基于content_plain）、高亮复原 | ✅ 已完成（选区菜单 + 划线保存） |
| frontend/js/qa.js | 提问弹窗、降级提示 | ✅ 已完成 |
| frontend/js/reference.js | 查引用、Banner、失败提示"未找到来源" | ✅ 已完成 |
| frontend/js/notes.js | 笔记 Tab、本文划线面板 | ✅ 已完成 |
| frontend/js/api.js | 所有fetch封装，自动带 X-Invite-Code | ✅ 已完成 |
| frontend/js/app.js | “我的”页 + 反馈/管理员面板 | ✅ 已完成 |
| frontend/sw.js | 列表NetworkFirst，详情CacheFirst，图片不缓存 | ✅ 已完成 |
| frontend/manifest.json | PWA 配置 | ✅ 已完成 |

## 已完成功能
- ✅ 完成项目初始化：创建前后端目录骨架、Serverless API 骨架、GitHub Actions 目录骨架
- ✅ 新建基础工程配置：package.json、vercel.json、.env.example、.gitignore
- ✅ 完成数据库初始化：在 Neon 创建 5 张核心表并校验索引
- ✅ 完成抓取脚本与工作流：支持三源抓取、summary 降级、content_plain 生成、翻译前 2000 字、`INITIAL_FETCH`
- ✅ 修复抓取数据质量：清除 `summary_en/summary_zh` 中的 HTML 标签，并修复 `content_plain` 开头重复标题
- ✅ 完成后端基础 API：`GET /api/articles`（支持筛选排序、含阅读进度 join）和 `GET /api/articles/:id`（返回 `content_en` + `content_plain`）
- ✅ 完成前端基础：Tab 导航、文章列表（筛选/排序/进度百分比/长按菜单）、全文阅读视图
- ✅ 完成 PWA 与进度：manifest、service worker 分层缓存、阅读进度防抖10秒与退出保存
- ✅ 完成全量翻译入库：抓取时分段翻译、前端直接展示中文（空则英文兜底）
- ✅ 完成划线功能：选区菜单（复制/划线/原文）、`api/highlights` 保存与查询、位置按 `content_plain` 存储
- ✅ 完成 AI 提问：选区提问弹窗、上下文拼接、`api/qa` 入库与 DeepSeek 调用
- ✅ 完成引用追踪：选区查引用、书籍自动入书单、文章来源确认加入
- ✅ 完成邀请码登录 + 每日限流：邀请码白名单多用户隔离，问答/引用追踪每日次数限制
- ✅ 完成笔记 Tab：按文章聚合划线/问答，书单展示，阅读页“本文划线”入口
- ✅ 完成数据导出：`GET /api/export` 返回划线 / 问答 / 书单
- ✅ 完成手动投喂：用户粘贴 URL 触发抓取+翻译+入库，翻译中仅投喂者可见

## 待开发功能（严格按此顺序）
1. ✅ 项目初始化
2. ✅ 数据库建表
3. ✅ 抓取脚本 + GitHub Actions
4. ✅ 后端基础 API
5. ✅ 前端基础
6. ✅ PWA + 缓存 + 进度
7. ✅ 按需翻译 + 查看英文原文
8. ✅ 划线功能
9. ✅ AI 提问
10. ✅ 引用追踪
11. ✅ 笔记 Tab
12. ✅ 数据导出

## 关键设计决策

| 决策 | 选择 | 原因 |
|------|------|------|
| 内容双版本 | content_en + content_plain | 解决HTML标签干扰字符位置 |
| 划线位置基准 | content_plain | 纯文本，永远准确 |
| content_plain返回前端 | 是 | 前端需要计算划线位置 |
| 全量翻译分段 | 1500字串行 | 避免超长输入与并发请求 |
| 翻译节流 | 不再使用 | 前端取消按需翻译触发 |
| 进度保存 | 防抖10秒+退出保存 | 平衡频率和完整性 |
| 查看英文 | 选区菜单触发（长按/选文后） | 与划线/提问共用选区能力，提升对应精度 |
| 引用失败态 | 显示"未找到来源" | 不静默失败 |
| 多用户预留 | user_id保留，API层按邀请码映射真实 user_id | 字段有意义不是摆设 |
| 内容不可覆盖 | ON CONFLICT DO NOTHING | 保护划线位置 |
| DeepSeek降级 | 翻译失败显英文，问答失败提示重试 | 不白屏 |
| 进度唯一键 | (article_id, user_id) | 支持多用户独立阅读进度 |

## 已知问题 / 技术债

- ⚠️ **重要：** 若未来需要修正翻译质量，必须新建文章记录而非覆盖，否则所有历史划线位置失效
- ⚠️ **URL去重边界：** ON CONFLICT 无法处理同一文章URL略有差异的情况，MVP暂不处理
- ⚠️ **Paul Graham暂未适配：** RSS只有标题，需单独开发爬虫
- ⚠️ **Peter RSS 地址异常：** PRD 中的 `https://steipete.me/feed.xml` 当前返回 404（已从抓取配置中移除）
- ⚠️ **QA 多轮上下文缺失：** api/qa.js 每次独立调用 DeepSeek，不携带历史消息，追问效果差。修复方式：前端把对话历史拼成 messages 数组传给后端，后端透传给 DeepSeek。
- ⚠️ **鉴权安全债（已知）：** X-Invite-Code 在 header 中明文传输，抓包可见，MVP 阶段接受此方案，后续改为后端 Session Cookie。
- ⚠️ **DeepSeek 会员额度与 API 额度不通：** 网页版订阅无法用于 API 调用，暂无解法。
- ⚠️ **选区定位精度：** 目前中文翻译选区到英文 `content_plain` 的映射为近似匹配，需后续设计更精确的对齐方案
- ⚠️ **AI 提问质量一般：** 当前仅取前后各 5 句作为上下文，Prompt 也未做结构化优化，需后续统一调优

## 环境变量

```
DEEPSEEK_API_KEY     # Vercel Dashboard + GitHub Secrets
NEON_DATABASE_URL    # 带 ?sslmode=require，Vercel + GitHub Secrets
API_SECRET           # 仅Vercel Dashboard（遗留接口使用）
INVITE_CODES         # 邀请码白名单兜底（仅 admin 推荐保留）
INITIAL_FETCH        # 仅首次手动触发时设为3
```

## 未来优化清单

- [ ] 分享功能：分享文章给朋友（链接/截图/划线内容）
- [ ] 阅读状态栏整合：返回列表、夜间模式切换、字体设置整合到顶部同一行，沉浸模式时隐藏
- [ ] 字体选择与本地托管：Noto Serif SC，只下载 weight 400 子集化版本
- [ ] 夜间模式切换：并入状态栏
- [ ] 首页文章的筛选
- [x] 手动投喂链接：POST /api/ingest 接口，用户粘贴 URL 触发抓取+翻译+入库
- [ ] QA 多轮上下文修复：携带对话历史调用 DeepSeek
- [ ] 投喂链接溯源：用户粘贴二手文章链接，AI 自动识别原文 URL 后投喂
- [ ] AI 提问质量优化：改进上下文策略和 Prompt 结构
- [ ] Paul Graham 适配：RSS 只有标题，需单独开发爬虫
- [ ] 多用户支持：鉴权改为 Cookie/Token 方案
- [ ] 文章列表增强：显示作者头像、点赞和分享按钮
- [ ] 气泡"原文"功能：选中中文翻译后点"原文"，展示对应 content_plain 英文片段，帮助核对原文；之前已有实现但被移除，待重新加回气泡菜单
