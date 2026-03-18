import dotenv from 'dotenv';
import fetch from 'node-fetch';
import { Pool } from 'pg';
import { getUserIdFromInviteCode } from './_utils/auth.js';
import { checkRateLimit } from './_utils/rateLimit.js';

dotenv.config({ path: '.env.local' });

let pool;

function getPool() {
  if (!pool) {
    const connectionString = process.env.NEON_DATABASE_URL;
    if (!connectionString) {
      throw new Error('Missing NEON_DATABASE_URL');
    }
    pool = new Pool({ connectionString, ssl: { rejectUnauthorized: false } });
  }
  return pool;
}

async function getUserId(req, res) {
  const inviteCode = req.headers['x-invite-code'] || '';
  const userId = await getUserIdFromInviteCode(inviteCode);
  if (!userId) {
    res.status(401).json({ error: 'unauthorized', message: '邀请码无效' });
    return null;
  }
  return userId;
}

function normalizeHistory(history) {
  if (!Array.isArray(history)) return [];
  return history
    .map((item) => ({
      role: item?.role === 'assistant' ? 'assistant' : item?.role === 'user' ? 'user' : null,
      content: String(item?.content || '').trim()
    }))
    .filter((item) => item.role && item.content);
}

function extractLocalContext(contentZh, selectedText) {
  const text = String(contentZh || '');
  const target = String(selectedText || '').trim();
  if (!text || !target) return '';

  const paragraphs = text
    .split(/\n+/)
    .map((p) => p.trim())
    .filter(Boolean);

  if (!paragraphs.length) return '';

  let index = paragraphs.findIndex((p) => p.includes(target));
  if (index < 0) {
    const shortTarget = target.slice(0, Math.max(6, Math.floor(target.length * 0.6)));
    if (shortTarget) {
      index = paragraphs.findIndex((p) => p.includes(shortTarget));
    }
  }
  if (index < 0) return '';

  const from = Math.max(0, index - 3);
  const to = Math.min(paragraphs.length, index + 4);
  return paragraphs.slice(from, to).join('\n\n');
}

function buildSystemPrompt({ titleZh, summaryZh, selectedText, context }) {
  return `你是「今日硅谷」App 的阅读助手，帮助用户深度理解
AI、科技、商业领域顶尖人物的文章。

## 你的知识来源（按优先级）
1. 用户划线的文章段落（最优先）
2. 文章标题和摘要（了解全文主旨）
3. 划线位置前后的段落（了解局部上下文）
4. 你自身的知识储备（解释概念、补充背景、关联延伸）

## 回答原则
- 用中文回答，语言自然流畅，像懂行的朋友在解释
- 长度根据问题复杂度决定：简单概念2-3句，复杂问题适当展开
- 如果问题超出文章范围，直接用你的知识回答，
  不要说"文章中没有提到"
- 如果涉及你不了解的最新动态，主动说明
  "这超出了我的知识范围，建议搜索最新信息"
- 不编造具体数字、人名、事件，不确定时明确说"我不确定"

## 当前文章
标题：${titleZh || '（无标题）'}
摘要：${summaryZh || '（无摘要）'}

【用户划线的段落】
${selectedText || '（无）'}

【划线位置前后各2-3段】
${context || '（无）'}`;
}

async function getArticleMeta(articleId) {
  const { rows } = await getPool().query(
    `
      SELECT title_zh, summary_zh, content_zh
      FROM articles
      WHERE id = $1
      LIMIT 1
    `,
    [articleId]
  );
  return rows[0] || null;
}

async function callDeepSeek(apiKey, messages) {
  const res = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      temperature: 0.2,
      messages
    })
  });

  if (!res.ok) {
    throw new Error(`DeepSeek ${res.status}`);
  }
  const data = await res.json();
  return data?.choices?.[0]?.message?.content?.trim() || '';
}

export default async function handler(req, res) {
  const userId = await getUserId(req, res);
  if (!userId) return;

  if (req.method === 'GET') {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const articleId = req.query?.article_id || url.searchParams.get('article_id');
    const params = [userId];
    let where = `WHERE user_id = $1 AND (answer_summary IS NULL OR answer_summary NOT LIKE '__reference__:%')`;
    if (articleId) {
      where += ' AND article_id = $2';
      params.push(articleId);
    }

    const sql = `
      SELECT id, highlight_id, article_id, question, answer_summary, created_at
      FROM qa_records
      ${where}
      ORDER BY created_at DESC
    `;
    const { rows } = await getPool().query(sql, params);
    res.status(200).json({ records: rows });
    return;
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    res.status(503).json({ error: 'service_unavailable', message: 'Missing DEEPSEEK_API_KEY' });
    return;
  }

  const { highlight_id, article_id, selected_text, question, history } = req.body || {};
  if (!article_id || !question) {
    res.status(400).json({ error: 'bad_request', message: 'article_id and question are required' });
    return;
  }

  try {
    const limitResult = await checkRateLimit(userId, 'qa', 50);
    if (!limitResult.allowed) {
      res.status(429).json({ error: 'rate_limited', message: '今日提问次数已用完' });
      return;
    }

    const article = await getArticleMeta(article_id);
    if (!article) {
      res.status(404).json({ error: 'not_found', message: 'article not found' });
      return;
    }

    const selectedText = String(selected_text || '').trim();
    const context = extractLocalContext(article.content_zh || '', selectedText);
    const normalizedHistory = normalizeHistory(history);
    const messages = [
      {
        role: 'system',
        content: buildSystemPrompt({
          titleZh: article.title_zh || '',
          summaryZh: article.summary_zh || '',
          selectedText,
          context
        })
      },
      ...normalizedHistory,
      { role: 'user', content: String(question).trim() }
    ];

    const answerSummary = await callDeepSeek(apiKey, messages);

    const sql = `
      INSERT INTO qa_records (highlight_id, article_id, question, answer_summary, user_id)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id, answer_summary, created_at
    `;

    const { rows } = await getPool().query(sql, [highlight_id || null, article_id, question, answerSummary, userId]);
    res.status(200).json({
      id: rows[0].id,
      answer_summary: rows[0].answer_summary,
      created_at: rows[0].created_at
    });
  } catch (err) {
    console.error('[api/qa] error', err);
    res.status(503).json({ error: 'service_unavailable' });
  }
}
