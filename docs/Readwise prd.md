# ReadWise PRD（产品需求文档）

**项目名称：** ReadWise  
**版本：** v0.4 MVP  
**日期：** 2026-03-07  
**状态：** 已确认，可交付 Codex 执行

---

## 一、项目背景

用户每晚睡前在手机上阅读 1-2 小时，内容主要是 AI 领域大佬的博客文章。现有工具无法同时满足：沉浸式阅读体验 + 划线提问 + 笔记保存 + 引用追踪。本项目目标是构建一个专属阅读器，整合内容聚合、沉浸阅读、AI 问答、笔记管理。

---

## 二、用户

- **MVP 阶段：** 单用户，无需登录
- **后续扩展：** 多用户（数据库所有表预留 `user_id TEXT NULL` 字段，API 层用默认用户常量映射，前端不传 user_id）

---

## 三、内容源

### MVP 博客源
| 作者 | RSS 地址 | 状态 |
|------|----------|------|
| Sam Altman | https://blog.samaltman.com/posts.atom | ✅ 启用 |
| Andrej Karpathy | https://karpathy.github.io/feed.xml | ✅ 启用 |
| Peter Steipete | https://steipete.me/feed.xml | ✅ 启用 |
| Paul Graham | https://www.paulgraham.com/rss.html | ⏸ 暂缓（RSS 只有标题和链接，无摘要无全文，页面结构特殊，留待后续版本单独适配） |

### 后续扩展（预留接口，MVP 不实现）
- 播客转录文本手动导入
- Paul Graham 单独适配爬虫
- 通过配置文件添加更多博客源，无需改代码

---

## 四、功能需求

### 4.1 内容抓取（GitHub Actions）

- 每天 **北京时间 22:00**（UTC 14:00）定时运行
- 抓取三个博客的最新文章全文（RSS 只有摘要时额外爬取原页面）
- 爬取失败时存摘要版本，`translation_status` 标记为 `summary_only`，不跳过
- 写入数据库时对 `url` 字段执行 `ON CONFLICT (url) DO NOTHING`，**文章一旦入库 content 永不覆盖**
- **首次初始化：** 设置环境变量 `INITIAL_FETCH=3`，每个博主抓取最近 3 篇文章；正常每日运行不设此参数
- 内容处理规则：
  - **文字：** 完整保留
  - **代码块：** 保留并用等宽字体渲染，标注"代码块"
  - **图片：** 只存原始 URL，渲染时从原网站加载，离线时不显示但不影响文字阅读
  - **公式：** 直接过滤，不处理
- **内容清洗（重要）：** 入库时生成两个版本：
  - `content_en`：保留 HTML 标签的富文本版本，用于前端渲染
  - `content_plain`：去除所有 HTML 标签的纯文本版本，用于划线字符位置计算和进度记录
  - 所有 `position_start/end` 和 `scroll_position` 均基于 `content_plain` 计算

### 4.2 按需分段翻译

**GitHub Actions 入库时：**
- 每篇文章只翻译：标题 + 摘要 + `content_plain` 前 2000 字（按句子边界切分）
- `translation_status` 标记为 `partial`，`translated_chars` 记录已翻译字符数（基于 `content_plain`）

**运行时按需续翻（translate-next）：**
- 接口 `POST /api/translate-next`，接收 `article_id` 和 `from_char`
- 每次约 2000 字，按句子边界切分，基于 `content_plain`
- 携带前段末尾约 200 字作为上下文，Prompt 注明"上文参考，不翻译"
- 数据库更新使用原子操作：`UPDATE articles SET translated_chars = GREATEST(translated_chars, $1) WHERE id = $2`，确保只增不减
- 全文完成后 `translation_status` 更新为 `full`

**前端触发逻辑（reader.js）：**
- 读到第 500 字时 fire-and-forget 触发第一次 `translate-next`
- 此后每隔 1500 字再触发一次，直到 `translation_status === 'full'`
- **节流：** 同一篇文章翻译请求间隔不少于 5 秒，防止并发竞态

**翻译 Prompt（固定）：**
> 你是一个技术文章翻译专家。请将以下英文翻译成中文，要求：保留所有专有名词英文原文（如 Transformer、Attention、LLM），人名不翻译，翻译风格自然流畅，不要逐字直译。以下【上文参考】部分仅供理解上下文，不需要翻译。

**按需查看英文原文：**
- 段落右侧显示一个小图标，点击后展示该段落对应的 `content_plain` 原文片段
- 不做全文中英对照，只做按需查看
- 使用小图标而非点击段落，避免与选文操作冲突

**DeepSeek 降级策略：**
- 翻译失败：展示英文原文，不白屏，不静默失败
- 问答失败：提示用户"服务暂时不可用，请稍后重试"

### 4.3 沉浸式阅读

- 风格参考微信读书：黑底、Noto Serif SC 衬线字体、大字号、宽行距
- **导航：左右滑动翻页**（不支持点击区域翻页，避免误触划线）
- PWA：`manifest.json` + `sw.js`，可添加到手机主屏幕，全屏运行
- **离线阅读：** Service Worker 缓存已加载文章，断网可读（图片除外）
- **阅读进度记录：** 记住每篇文章读到的 `content_plain` 字符位置，下次打开自动恢复

### 4.4 文章列表与管理

- 文章卡片显示：标题（中文）、作者、发布时间、摘要预览、**阅读进度百分比**
- 进度数据：`reading_progress` 表，文章列表接口 join 进度表计算百分比返回
- 筛选/排序：未读 / 已读 / 存档、时间倒序、按作者
- **长按卡片**弹出操作菜单：标记已读、存档、取消存档（确保事件不冒泡，不与其他交互冲突）

### 4.5 选文操作菜单

选中文字后，底部弹出操作栏（参考微信读书交互）：

| 操作 | 行为 |
|------|------|
| 复制 | 系统复制到剪贴板 |
| 划线 | 高亮选中文字，基于 `content_plain` 保存字符位置 |
| 提问 | 弹出输入框，附带划线文字 + 前后 5 句话，调用 DeepSeek，保存摘要 |
| 查引用 | AI 识别书籍或文章，触发搜索流程 |

**划线技术说明：**
- 字符位置基于 `content_plain`（纯文本），与渲染用的 `content_en`（富文本）分离
- 前端接收 `content_plain` 用于位置计算，接收 `content_en` 用于渲染
- 手机选文需处理长按延迟，确保长按事件不冒泡影响其他交互

### 4.6 AI 提问

- 上下文：划线原文 + 前后各 5 句话（均取自 `content_plain`）
- 后端调用 DeepSeek API（Key 不暴露前端）
- 保存：文章标题 + 划线原文 + 用户问题 + AI 回答摘要 2-3 句
- 失败时提示用户重试，不白屏

### 4.7 引用追踪

```
用户选文 → 点「查引用」
→ DeepSeek 联网搜索识别书籍 or 文章/博客

→ 识别成功，文章/博客：
  顶部 Banner"找到来源：[标题]，是否加入阅读列表？"
  确认 → 加入 ｜ 忽略 → 关闭

→ 识别成功，书籍：
  静默加入待读书单
  底部轻提示"《书名》已加入书单"

→ 识别失败或搜索失败：
  显示"未找到来源，请尝试更完整的文字"
```

### 4.8 Service Worker 缓存策略

| 资源 | 策略 | 原因 |
|------|------|------|
| 文章列表 `/api/articles` | Network First | 优先最新数据，失败降级缓存 |
| 文章详情 `/api/articles/:id` | Cache First + 后台静默更新 | 已读内容离线可用 |
| 图片 | 不缓存 | 节省空间 |

### 4.9 阅读进度

- 记录 `content_plain` 字符位置
- **防抖保存：** 每 10 秒将当前进度发送到后端（防止频繁请求）
- **退出保存：** 监听 `visibilitychange` 和 `beforeunload` 事件，页面关闭前发送最终进度
- 下次进入自动恢复

### 4.10 阅读页笔记入口

- 阅读时右上角提供「本文划线」入口
- 展示当前文章所有划线 + 问答记录
- 点击条目跳转到原文对应位置

### 4.11 数据导出

- 接口 `GET /api/export`，返回所有划线和问答记录的 JSON
- 供用户定期手动下载备份，不做自动备份

---

## 五、页面结构

### Tab 1「今日」
- 文章摘要卡片列表，含阅读进度百分比
- 筛选/排序：未读 / 已读 / 存档、时间倒序、按作者
- 长按卡片：标记已读、存档
- 点击卡片进入全文阅读

### Tab 2「笔记」
- 按文章分组展示所有划线 + 问答记录
- 点击条目跳转原文
- 子页面：**书单**（待读书目，含来源文章信息）

---

## 六、明确不做（MVP）

- 用户登录 / 账号系统
- 评论 / 批注
- 主题式阅读 / 书单推荐
- 播客直接抓取
- 社交功能
- 自动化测试
- 额外 CI/CD
- 中英对照显示（只做段落右侧图标按需查看）
- 图片本地缓存
- Paul Graham 适配
- 自动备份

---

## 七、技术栈

| 层级 | 技术 | 说明 |
|------|------|------|
| 前端 | HTML + CSS + Vanilla JS | 现有阅读器基础扩展 |
| PWA | Service Worker + manifest.json | 主屏幕安装 + 离线 |
| 后端 | Vercel Serverless Functions | 单次执行上限 10 秒 |
| 数据库 | Neon (PostgreSQL) | 用户已有经验 |
| AI | DeepSeek API | 翻译 + 问答 + 联网搜索 |
| 内容抓取 | GitHub Actions cron | 每天 UTC 14:00 |
| 部署 | GitHub Pages（前端）+ Vercel（后端） | 推代码自动部署 |

---

## 八、API 认证

- 环境变量 `API_SECRET`，在 Vercel Dashboard 配置
- 后端从 `API_SECRET` 映射到默认用户（`DEFAULT_USER_ID` 常量）
- 前端 `api.js` 硬编码 `API_SECRET`，请求时自动带上 `Authorization: Bearer <API_SECRET>`
- 前端不传 `user_id`，后端统一处理
- 所有 `/api/*` 接口校验请求头，不匹配返回 401

---

## 九、数据库结构

详见 `docs/schema.sql`，可直接在 Neon 执行。

**关键字段说明：**
- `content_en`：富文本（含 HTML 标签），用于前端渲染
- `content_plain`：纯文本（无 HTML 标签），用于划线位置计算、进度记录、翻译分段
- `position_start/end` 和 `scroll_position` 均基于 `content_plain`

---

## 十、项目文件结构

```
readwise/
├── frontend/
│   ├── index.html
│   ├── manifest.json
│   ├── sw.js
│   ├── css/
│   │   └── reader.css
│   └── js/
│       ├── app.js              # 主逻辑、Tab 切换
│       ├── reader.js           # 翻页、进度（防抖+退出保存）、触发翻译（5秒节流）
│       ├── highlight.js        # 选文菜单、划线（基于content_plain）、高亮复原
│       ├── qa.js               # 提问弹窗、降级提示
│       ├── reference.js        # 查引用、Banner、失败提示、阅读列表
│       └── api.js              # 所有 fetch 封装，自动带 Authorization header
│
├── api/
│   ├── articles.js             # GET /api/articles（join进度表）
│   ├── highlights.js           # GET/POST /api/highlights
│   ├── qa.js                   # POST /api/qa
│   ├── reading-list.js         # GET/POST/PATCH /api/reading-list
│   ├── reading-progress.js     # GET/POST /api/reading-progress
│   ├── search-reference.js     # POST /api/search-reference（含失败态处理）
│   ├── translate-next.js       # POST /api/translate-next（GREATEST原子更新）
│   └── export.js               # GET /api/export
│
├── scripts/
│   └── fetch-articles.js       # 抓取+清洗生成content_plain+翻译前2000字
│
├── .github/
│   └── workflows/
│       └── fetch.yml
│
├── docs/
│   ├── PRD.md
│   ├── CONTEXT.md
│   ├── CHANGELOG.md
│   ├── API.md
│   ├── SETUP.md
│   └── schema.sql
│
├── .env.example
├── .gitignore
├── vercel.json
└── package.json
```

---

## 十一、MVP 开发顺序

每完成一步立即更新 `docs/CONTEXT.md` 和 `docs/CHANGELOG.md`，并向用户汇报：①完成了什么 ②遇到什么问题 ③下一步需要用户做什么。

1. **项目初始化** — 文件结构、package.json、vercel.json、.env.example、.gitignore、SETUP.md 初稿
2. **数据库初始化** — 执行 schema.sql（五张表）
3. **抓取脚本** — fetch-articles.js + fetch.yml，抓取 + 生成 content_plain + 翻译前 2000 字，支持 INITIAL_FETCH
4. **后端基础 API** — articles.js（含进度 join），补充 API.md
5. **前端基础** — Tab 导航、文章列表（含进度百分比、长按菜单）、全文阅读
6. **PWA** — manifest.json + sw.js，分层缓存，进度防抖+退出保存
7. **按需翻译** — translate-next.js（GREATEST原子更新）+ reader.js 5秒节流触发 + 段落右侧图标查看英文
8. **划线功能** — highlight.js（基于content_plain）+ 后端接口
9. **AI 提问** — qa.js + DeepSeek + 降级处理
10. **引用追踪** — reference.js + DeepSeek 联网搜索 + 失败态 UI
11. **笔记 Tab** — 划线问答展示、书单、阅读页「本文划线」入口
12. **数据导出** — export.js

---

## 十二、环境变量

| 变量 | 配置位置 | 说明 |
|------|----------|------|
| DEEPSEEK_API_KEY | Vercel + GitHub Secrets | DeepSeek API Key |
| NEON_DATABASE_URL | Vercel + GitHub Secrets | 带 ?sslmode=require |
| API_SECRET | 仅 Vercel Dashboard | 前端请求鉴权，硬编码在 api.js，后端映射为 DEFAULT_USER_ID |
| INITIAL_FETCH | 仅首次手动触发时设置为 3 | 正常运行不设 |

---

## 十三、已确认设计决策

| 决策 | 选择 | 原因 |
|------|------|------|
| 内容双版本 | content_en（富文本渲染）+ content_plain（纯文本划线） | 解决 HTML 标签干扰字符位置问题 |
| 划线位置基准 | content_plain | 纯文本，位置永远准确 |
| content_plain 是否返回前端 | 是，随文章详情一起返回 | 前端需要它计算划线位置 |
| 翻译原子更新 | GREATEST(translated_chars, $1) | 防止并发竞态导致数据回退 |
| 翻译节流 | 同一文章 5 秒内不重复请求 | 防止快速阅读触发并发 |
| 进度保存 | 防抖 10 秒 + 退出保存 | 平衡请求频率和数据完整性 |
| 查看英文原文 | 段落右侧小图标触发 | 避免与选文操作冲突 |
| 文章管理 | 长按卡片弹出菜单 | 避免与翻页滑动冲突 |
| 引用失败态 | 显示"未找到来源"提示 | 不允许静默失败 |
| 多用户预留 | user_id 字段保留，API 层映射默认用户 | 保留字段有意义，不是摆设 |
| 翻译方案 | 按需分段 2000 字 | 控制成本 |
| 内容不可覆盖 | ON CONFLICT (url) DO NOTHING | 保护划线字符位置 |
| DeepSeek 降级 | 翻译失败显示英文，问答失败提示重试 | 不允许白屏 |
| SW 缓存 | 列表 NetworkFirst，详情 CacheFirst | 平衡新鲜度和离线 |
| API 认证 | Bearer Token | 单用户 MVP |
| Paul Graham | 暂缓 | RSS 无内容 |
