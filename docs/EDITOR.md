# AI 编辑室规则

> 两个 Codex 定时任务（每日快讯、每日人物巡检）只做一件事：读本文件照做。
> 想改口味、改来源、改阈值，改这里即可；阈值代码在 `api/_utils/content-quality.js`，两边保持一致。

## 1. 给谁看、要什么

读者是主编本人和少量朋友，每晚睡前在手机上读 1–2 小时。要的是 31 位人物的**一手内容**：本人写的文章、本人讲的话。宁缺毋滥，每天新增的精选长文不超过 3 篇。

## 2. 三条内容线

| 内容线 | 谁负责 | 时间（北京） | 档位 |
|---|---|---|---|
| 个人博客 RSS（7 人） | GitHub Actions `fetch.yml` | 每天 22:00 | 质量检查通过为 A，有警告为 C |
| 每日硅谷快讯 | Codex 定时任务 | 每天 08:00 | A |
| 人物巡检：公司博客、访谈、播客 | Codex 定时任务 | 每天 21:00 | 按第 3 节定档 |

人物和来源清单见 `docs/editor-sources.json`（`channel` 字段：rss / daily / weekly / classic）。

## 3. 分级入库

| 档位 | 什么内容 | 入库后 |
|---|---|---|
| **A** | 本人博客原文；官方博客上本人署名的文章；每日快讯 | 直接发布 |
| **B** | 和本人强相关但不是本人写的：本人为主讲的访谈、播客、演讲文字稿；官方文章里本人是主要发言人 | 待确认，4 小时没人处理就自动发布 |
| **C** | 不在名单上的人；二手转载或媒体报道；敏感话题（政治、法律纠纷、医疗健康建议、人身攻击）；身份存疑；质量检查有警告 | 待确认，**不确认就不发布** |

- 拿不准时往高一档走（A 拿不准就给 B，B 拿不准就给 C）。
- 服务端会再检查一遍，有警告的自动降到 C，不会升档。
- B、C 档入库后，工具会自动给主编发飞书私信。

## 4. 质量校验

阈值来自 2026-10 对线上 202 篇文章的回测。完整译文的中英字数比中位数约 0.48；Anthropic 这类文风低至 0.30，经段落核对确认是完整的；技术文英文术语多，可以高到 1.0。

| 检查 | 拒收（不入库） | 降到 C 档 |
|---|---|---|
| 中文字数 ÷ 英文字符数 | < 0.28，或 > 1.5（代码占比不高时） | 0.28–0.30，或 0.9–1.5 |
| 中文段数 ÷ 英文 HTML 段落数（英文 ≥ 8 段时才检查） | < 0.5 | 0.5–0.75 |
| 中文里有 `\uXXXX` 转义字符 | ≥ 20 处 | — |
| 中文里汉字占比 | < 2%（代码多时放宽到 < 5%） | — |
| 英文原文字段里主要是中文 | 汉字 > 20% | — |
| 正文首尾残留订阅、赞助、相关文章等内容 | — | 命中即降 |
| 英文正文不到 1500 字符（多半是播客节目页、摘要页） | — | 命中即降 |
| 中文标题没翻译 | — | 命中即降 |
| 付费墙截断 | — | 命中即降 |

被拒收时：**重新完整翻译一次**再提交；还是不过，就放弃这篇，并在运行总结里写明原因。**禁止为了过检查而删减或注水。**

## 5. 去广告

正文一律先过 `node scripts/editor/editor.mjs extract <url>`。它用 Readability 提取正文，并删掉以下内容：

- 导航、页脚、侧栏、表单、按钮、评论区
- 订阅框、Newsletter 引导、赞助口播（例如 Simon Willison 文章里的 "Sponsored by: …"）
- 「相关文章 / 推荐阅读」、分享按钮文案、Substack 页尾的 "No posts"

提取结果里 `remainingNoise` 不为空，说明还有残留：手动删掉对应段落再翻译。删不干净，就照常提交，服务端会把它降到 C。

播客、访谈文字稿另外要删口播广告段，例如「本期节目由 XX 赞助」和中插广告。

## 6. 翻译规范

- **全文翻译，不摘要、不精简、不改写结构**；英文一段对应中文一段，段与段之间空一行。
- 专有名词保留英文（Transformer、LLM、Claude Code、产品名、公司名），人名不翻译。
- 代码块原样保留，不翻译代码。
- 输出真正的中文字符；不许出现 `人` 这类转义。
- `content_en` 填 extract 输出的 `contentHtml`（清洗后的英文 HTML），**不要**把译文填进去。
- `summary_zh`：2–3 句，最多 120 个汉字，信息密度高，不说空话。
- 中文原文（例如景鲲的访谈）不需要翻译：`content_en` 留空，`content_zh` 填原文。

## 7. 每日硅谷快讯（每天 08:00）

1. `node scripts/editor/editor.mjs brief-source`，读取它输出的 JSON 文件。`skip` 不为空就停：发一条飞书说明原因，结束运行。
2. 素材来自 Zara Zhang 的 [follow-builders](https://github.com/zarazhangrui/follow-builders)：26 位建造者近 24 小时的推文、6 档播客的新文字稿、Anthropic Engineering 和 Claude Blog 的新文章。素材每天北京时间 14:17 更新，所以 08:00 拿到的是前一天的。
3. 挑 4–8 条有实质内容的：原创观点、产品发布、技术讨论、行业判断。跳过日常闲聊、无评论转发、广告、活动打卡。同一人的多条推文合并成一段。播客和官方博客有新内容的，各写一段放在最后。
4. 标题写**当天日期**（北京时间），不写素材日期。格式固定如下：

```markdown
# 硅谷快讯 — 10月25日

## 摘要
一到两句话，点出当天最重要的 2–3 件事。

---

导语：一段 150–250 字，把当天的主线串起来。

---

## 人名（身份/公司）｜一句话标题

2–4 句中文解读：说了什么、为什么重要。工具、产品、Demo 要写出名字。

> 一句话看法：编辑的判断，一句话。

原帖：https://x.com/...
```

5. 入库字段：

| 字段 | 值 |
|---|---|
| `source_key` | `daily_brief` |
| `review_tier` | `A` |
| `author` | `AI小编` |
| `title_zh` | `硅谷快讯 — 10月25日` |
| `title_en` | `Silicon Valley Brief — October 25` |
| `source_url` | `https://readwise.byguang.online/digest/2026-10-25` |
| `published_at` | `2026-10-25T00:00:00+08:00` |
| `summary_zh` | 摘要那一段 |
| `content_zh` | 全文 Markdown |
| `content_en` | 不填 |
| `_meta.zaraGeneratedAt` | 素材 JSON 里的 `zaraGeneratedAt`，工具用它防止重复发同一份素材 |

6. 写成 JSON 文件，先 `check` 再 `submit`。

## 8. 每日人物巡检（每天 21:00）

1. `node scripts/editor/editor.mjs state` 查看各人上次巡检时间。
2. 本次检查范围：
   - `channel=daily` 的 12 人：每天都看。
   - `channel=weekly` 的 10 人：只看距上次巡检 ≥ 7 天的，每次最多 3 人。
   - `channel=rss` 的人不用看，GitHub 每天自动抓；只在 `also` 里有访谈、播客的时候，顺带按 weekly 的节奏看一下。
3. 只收**最近两周（14 天）内**发布的内容，更早的一律不收。每个候选先 `existing <url>` 去重，再 `extract` 提取正文。
4. 选文标准：本人观点密度高、篇幅够读 5 分钟以上、主编明天睡前会想读。产品发布说明、招聘贴、纯活动通知一律不收。
5. 每次运行**最多入库 3 篇**，按第 3 节定档。翻译完 `check`，通过后 `submit`。
6. 看过的人都要标记：`mark-checked <key...>`，没有找到新内容的也要标。
7. 结束时发一条飞书总结：看了谁、收了哪几篇（各是什么档位）、跳过了什么、失败原因。

## 9. 时效：只要最近两周

- 主编要求（2026-10-25）：**只收发布时间在最近 14 天内的内容**，太久的不要。RSS 脚本、`editor.mjs submit`、服务端 `/api/ingest` 三处都按 14 天卡死，编辑室不能绕过。
- 不做存量回填，不补历史快讯。人物没有近两周的新内容，就让他空着。
- 每日快讯只写当天一期，不补发往期。

## 10. 入库字段（`POST /api/ingest` 全文直入）

`title_zh`、`title_en`、`summary_zh`、`content_zh`、`content_en`、`author`（必须与人物库 `authors.name` 完全一致，例如 `Simon Willison`）、`author_key`（可选，人物库 key）、`source_url`、`published_at`（ISO 格式）、`source_key`（`manual` 或 `daily_brief`）、`review_tier`（A/B/C）、`review_note`（可选，定档理由）。

返回值里的 `publish_status`、`review_tier`、`review_note` 是服务端最终定的结果，以它为准。

## 11. 运行环境与安全

- 本机配置在 `~/.readwise-editor/.env`：`READWISE_EDITOR_CODE`（编辑室邀请码）、`READWISE_API_BASE`、`FEISHU_NOTIFY_OPEN_ID`。**邀请码不得写进仓库、日志或飞书消息**（本仓库是公开的）。
- 运行状态记在 `~/.readwise-editor/state.json`，每次提交记一行 `log.jsonl`。
- 飞书通知用 lark-cli 的机器人身份发送（`bash ~/.local/bin/lark-cli`）。
- 编辑室账号只能调用三个接口：`POST /api/ingest`、`GET /api/articles/urls`、`DELETE /api/articles/:id`。只有主编明确要求时，才能删除文章。
