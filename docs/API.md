# ReadWise API 文档

> 所有接口均需请求头：`Authorization: Bearer <API_SECRET>`，否则返回 401。
> 后端从 API_SECRET 映射到 DEFAULT_USER_ID，前端无需传 user_id。
> 每实现一个接口后在此补充完整说明。

---

## GET /api/articles

获取文章列表，包含阅读进度百分比。

**Query 参数**
| 参数 | 类型 | 说明 |
|------|------|------|
| status | string | `unread` / `read` / `archived`，不传返回全部 |
| author | string | `sam` / `andrej` / `peter`，不传返回全部 |
| sort | string | `date_desc`（默认）/ `date_asc` |

**Response**
```json
{
  "articles": [
    {
      "id": "uuid",
      "source_key": "andrej",
      "title_zh": "文章标题中文",
      "title_en": "Article Title",
      "summary_zh": "摘要中文",
      "published_at": "2026-03-07T14:00:00Z",
      "translation_status": "partial",
      "read_status": "unread",
      "read_progress": 40
    }
  ]
}
```
注：`read_progress` 由后端 join `reading_progress` 表计算（scroll_position / length(content_plain) * 100）。

**状态：** ✅ 已实现

---

## GET /api/articles/urls

获取已入库文章的 url/source_url 列表（用于去重）。

**Response**
```json
{
  "urls": [
    { "url": "https://...", "source_url": "https://..." }
  ]
}
```

**状态：** ✅ 已实现

---

## DELETE /api/articles/:id

OpenCloud 专用：仅允许删除 `publish_status = hidden` 的文章（用于重推覆盖）。

**权限**
- 仅 `X-Invite-Code: openclaw`

**Response**
```json
{ "success": true }
```

**状态：** ✅ 已实现

---
## GET /api/articles/:id

获取单篇文章详情（含全文）。

**Response**
```json
{
  "id": "uuid",
  "title_zh": "...",
  "title_en": "...",
  "content_en": "...",
  "content_plain": "...",
  "content_zh": "...",
  "translation_status": "partial",
  "translated_chars": 2000,
  "url": "https://...",
  "read_status": "unread"
}
```

**注意：**
- `content_en`：富文本（含 HTML 标签），用于前端渲染
- `content_plain`：纯文本（无 HTML 标签），用于前端计算划线字符位置
- 两个字段都必须返回

**状态：** ✅ 已实现

---

## POST /api/translate-next

触发翻译下一段。

**Body**
```json
{ "article_id": "uuid", "from_char": 2000 }
```

**Response**
```json
{ "translated_chars": 4000, "status": "partial" }
```

**实现要求：**
- 数据库更新必须使用原子操作：
  `UPDATE articles SET translated_chars = GREATEST(translated_chars, $1) WHERE id = $2`
- 防止并发请求导致 translated_chars 回退

**状态：** ✅ 已实现

---

## GET/POST /api/highlights

**GET** 获取划线（可按文章过滤）
Query: `?article_id=uuid`（可选，缺省返回全部）

**POST** 新增划线
```json
{
  "article_id": "uuid",
  "text": "划线原文",
  "position_start": 1024,
  "position_end": 1089,
  "type": "highlight"
}
```
注：`position_start/end` 基于 `content_plain` 计算，不是 `content_en`。

**状态：** ✅ 已实现

---

## GET/POST /api/qa

发起 AI 提问。

**Body**
```json
{
  "highlight_id": "uuid",
  "article_id": "uuid",
  "question": "用户问题",
  "context": "划线原文 + 前后各5句（取自content_plain）"
}
```

**Response**
```json
{ "answer_summary": "AI 回答摘要 2-3 句" }
```

**降级：** DeepSeek 失败时返回 `{ "error": "service_unavailable" }`，前端提示"服务暂时不可用，请稍后重试"。

**状态：** ✅ 已实现

**GET** 查询问答记录
Query: `?article_id=uuid`（可选）

**Response**
```json
{
  "records": [
    {
      "id": "uuid",
      "highlight_id": "uuid",
      "article_id": "uuid",
      "question": "...",
      "answer_summary": "...",
      "created_at": "2026-03-08T12:00:00Z"
    }
  ]
}
```

---

## POST /api/search-reference

查引用，识别书籍或文章。

**Body**
```json
{ "text": "划线原文" }
```

**Response（识别成功，文章）**
```json
{
  "status": "article_found",
  "candidate": {
    "type": "article",
    "title": "文章标题",
    "url": "https://...",
    "author": "作者名"
  }
}
```

**Response（识别成功，书籍自动加入）**
```json
{
  "status": "book_added",
  "entry": {
    "id": "uuid",
    "type": "book",
    "title": "书名",
    "author": "作者名"
  }
}
```

**Response（失败）**
```json
{ "status": "not_found" }
```
前端收到 `status=not_found` 时显示："未找到来源，请尝试更完整的文字"

---

## POST /api/ingest

新增文章（两种模式：链接抓取 / 全文直入）。

### 模式 A：链接抓取（原有）
**Body**
```json
{
  "url": "https://example.com/article",
  "publish_status": "published"
}
```

`publish_status` 可选：`published`（默认）或 `pending_review`。

**Response（成功）**
```json
{ "success": true, "articleId": "uuid", "status": "translating" }
```

**Response（已存在）**
```json
{ "success": false, "message": "文章已存在", "articleId": "uuid" }
```

**权限**
- 普通用户：仅可用该模式，且每日限 5 次
- admin / openclaw：可用且不受次数限制

### 模式 B：全文直入（content_zh）
当请求体包含 `content_zh` 时，跳过抓取与翻译，直接入库，`status=ready`。

**Body**
```json
{
  "title_zh": "必填",
  "title_en": "必填",
  "summary_zh": "必填",
  "summary_en": "可选",
  "content_zh": "必填，完整中文全文",
  "content_en": "建议填，英文原文",
  "author": "必填",
  "source_url": "必填，用于去重",
  "published_at": "必填，ISO格式"
}
```

**Response（成功）**
```json
{ "success": true, "articleId": "uuid", "status": "ready" }
```

**Response（已存在）**
```json
{ "success": false, "message": "文章已存在", "articleId": "uuid" }
```

**权限**
- 仅 admin / openclaw 可用

**确认加入（文章）**
```json
{
  "confirm_add": true,
  "candidate": { "type": "article", "title": "...", "author": "...", "url": "..." }
}
```
成功返回：
```json
{ "status": "added", "entry": { "id": "uuid", "type": "article", "title": "...", "url": "..." } }
```

**状态：** ✅ 已实现

---

## GET/POST/PATCH /api/reading-list

**GET** 获取阅读列表
Query: `?status=pending`

**POST** 新增条目
```json
{
  "type": "article",
  "title": "...",
  "url": "...",
  "author": "...",
  "source_highlight_id": "uuid"
}
```

**PATCH** 更新状态
```json
{ "id": "uuid", "status": "reading" }
```

**状态：** ⬜ 待实现
**状态：** ✅ 已实现

---

## GET/POST /api/reading-progress

**GET** 获取进度
Query: `?article_id=uuid`

**POST** 更新进度（前端防抖10秒调用，退出时也调用）
```json
{ "article_id": "uuid", "scroll_position": 1500 }
```
注：`scroll_position` 基于 `content_plain` 字符位置。

**状态：** ✅ 已实现

---

## GET /api/export

导出所有划线和问答记录。

**Response**
```json
{
  "exported_at": "2026-03-07T14:00:00Z",
  "highlights": [...],
  "qa_records": [...],
  "reading_list": [...]
}
```

**状态：** ✅ 已实现
