# ReadWise — 项目上下文

> 此文件由 AI 维护，每次完成开发任务后必须更新。
> 下一个接手的 AI：请先完整阅读本文件，再开始任何修改。

---

## 当前状态（每次任务后必须更新）

- 最后完成步骤：PRD 第十一节第 6 步：PWA ✅
- 本地/部署是否可运行：⚠️ 可启动基础骨架（页面与 API 业务逻辑尚未实现）
- 数据库是否已初始化：✅（Neon 已执行 schema.sql）
- 环境变量是否已配置：DEEPSEEK_API_KEY ✅ / NEON_DATABASE_URL ✅ / API_SECRET ✅
- 当前已有真实数据：✅（抓取脚本 smoke test 已写入 2 篇：sam 1、andrej 1）
- 下一步任务：PRD 第十一节第 7 步：按需翻译

---

## 协作约定（新增）

- 每完成 PRD 第十一节中的一个步骤，必须立即执行一次 Git 提交并推送到 `origin/main`
- 提交后需在 `docs/CHANGELOG.md` 追加本步骤记录，并同步更新本文件的“当前状态”与“待开发功能”勾选状态
- 每步完成后对用户固定汇报三项：①完成了什么 ②遇到了什么问题 ③下一步需要用户做什么

## 项目概述

ReadWise 是一个个人沉浸式阅读器，聚合 AI 领域大佬博客（Sam Altman、Andrej Karpathy、Peter Steipete），支持划线、AI 提问、引用追踪、离线阅读。前端为 PWA，后端为 Vercel Serverless Functions，数据库为 Neon PostgreSQL。

## 架构图

```
GitHub Actions（每天北京时间 22:00）
    ↓ 抓取RSS + 爬全文 + 生成content_plain + 翻译前2000字
Neon PostgreSQL（五张表）
    ↓ REST API（Bearer Token 鉴权，后端映射 DEFAULT_USER_ID）
Vercel Serverless Functions（/api/*）
    ↓ fetch（api.js 封装，自动带 Authorization header，不传 user_id）
前端 PWA（GitHub Pages）
    → 用户手机浏览器
    → 读到第500字触发translate-next，每1500字再触发（5秒节流）
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
| scripts/fetch-articles.js | 抓取RSS、爬全文、生成content_plain、翻译前2000字、写入数据库 | ✅ 已完成 |
| .github/workflows/fetch.yml | cron UTC 14:00，支持 INITIAL_FETCH | ✅ 已完成 |
| api/articles.js | GET /api/articles（join进度表返回百分比）| ✅ 已完成 |
| api/highlights.js | GET/POST /api/highlights | ⬜ 待开发 |
| api/qa.js | POST /api/qa，DeepSeek 问答，失败降级 | ⬜ 待开发 |
| api/reading-list.js | GET/POST/PATCH /api/reading-list | ⬜ 待开发 |
| api/reading-progress.js | GET/POST /api/reading-progress | ✅ 已完成 |
| api/search-reference.js | POST /api/search-reference，含失败态处理 | ⬜ 待开发 |
| api/translate-next.js | POST /api/translate-next，GREATEST原子更新 | ⬜ 待开发 |
| api/export.js | GET /api/export | ⬜ 待开发 |
| frontend/js/app.js | 主逻辑、Tab 切换 | ✅ 已完成（前端基础） |
| frontend/js/reader.js | 翻页、进度（防抖10秒+退出保存）、翻译触发（5秒节流） | ✅ 已完成（阅读基础，进度/翻译触发待第6/7步补全） |
| frontend/js/highlight.js | 选文菜单、划线（基于content_plain）、高亮复原 | ⬜ 待开发 |
| frontend/js/qa.js | 提问弹窗、降级提示 | ⬜ 待开发 |
| frontend/js/reference.js | 查引用、Banner、失败提示"未找到来源" | ⬜ 待开发 |
| frontend/js/api.js | 所有fetch封装，自动带Authorization header，不传user_id | ⬜ 待开发 |
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

## 待开发功能（严格按此顺序）
1. ✅ 项目初始化
2. ✅ 数据库建表
3. ✅ 抓取脚本 + GitHub Actions
4. ✅ 后端基础 API
5. ✅ 前端基础
6. ✅ PWA + 缓存 + 进度
7. ⬜ 按需翻译 + 查看英文原文
8. ⬜ 划线功能
9. ⬜ AI 提问
10. ⬜ 引用追踪
11. ⬜ 笔记 Tab
12. ⬜ 数据导出

## 关键设计决策

| 决策 | 选择 | 原因 |
|------|------|------|
| 内容双版本 | content_en + content_plain | 解决HTML标签干扰字符位置 |
| 划线位置基准 | content_plain | 纯文本，永远准确 |
| content_plain返回前端 | 是 | 前端需要计算划线位置 |
| 翻译原子更新 | GREATEST(translated_chars, $1) | 防并发竞态 |
| 翻译节流 | 5秒 | 防快速阅读触发并发 |
| 进度保存 | 防抖10秒+退出保存 | 平衡频率和完整性 |
| 查看英文 | 段落右侧小图标 | 避免与选文冲突 |
| 引用失败态 | 显示"未找到来源" | 不静默失败 |
| 多用户预留 | user_id保留，API层映射DEFAULT_USER_ID | 字段有意义不是摆设 |
| 内容不可覆盖 | ON CONFLICT DO NOTHING | 保护划线位置 |
| DeepSeek降级 | 翻译失败显英文，问答失败提示重试 | 不白屏 |

## 已知问题 / 技术债

- ⚠️ **重要：** 若未来需要修正翻译质量，必须新建文章记录而非覆盖，否则所有历史划线位置失效
- ⚠️ **URL去重边界：** ON CONFLICT 无法处理同一文章URL略有差异的情况，MVP暂不处理
- ⚠️ **Paul Graham暂未适配：** RSS只有标题，需单独开发爬虫
- ⚠️ **Peter RSS 地址异常：** PRD 中的 `https://steipete.me/feed.xml` 当前返回 404（脚本已加多 URL 回退与容错）

## 环境变量

```
DEEPSEEK_API_KEY     # Vercel Dashboard + GitHub Secrets
NEON_DATABASE_URL    # 带 ?sslmode=require，Vercel + GitHub Secrets
API_SECRET           # 仅Vercel Dashboard，前端api.js硬编码，后端映射DEFAULT_USER_ID
INITIAL_FETCH        # 仅首次手动触发时设为3
```
