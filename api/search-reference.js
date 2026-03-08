import dotenv from 'dotenv';
import fetch from 'node-fetch';
import { Pool } from 'pg';

dotenv.config({ path: '.env.local' });

const DEFAULT_USER_ID = 'default_user';
const SEARCH_PROMPT = `
你是引用追踪助手。根据用户提供的文字，判断它更可能来源于“书籍”还是“文章/博客”。
请只输出 JSON，结构如下：
{
  "type": "book" | "article" | "unknown",
  "title": "标题",
  "author": "作者（可空）",
  "url": "文章链接（仅 article 时填写）",
  "confidence": 0-1,
  "reason": "一句话理由"
}
如果无法判断，请返回 type=unknown，并留空其他字段。
`;

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

function ensureAuthorized(req, res) {
  const expected = process.env.API_SECRET;
  if (!expected) {
    res.status(500).json({ error: 'server_misconfigured', message: 'Missing API_SECRET' });
    return false;
  }
  const auth = req.headers.authorization || '';
  if (auth !== `Bearer ${expected}`) {
    res.status(401).json({ error: 'unauthorized' });
    return false;
  }
  return true;
}

function extractJson(text) {
  if (!text) return null;
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end < 0 || end <= start) return null;
  const raw = text.slice(start, end + 1);
  try {
    return JSON.parse(raw);
  } catch (_) {
    return null;
  }
}

function normalizeCandidate(data) {
  if (!data || typeof data !== 'object') return { type: 'unknown' };
  const type = String(data.type || '').toLowerCase();
  if (type !== 'book' && type !== 'article') {
    return { type: 'unknown' };
  }
  return {
    type,
    title: String(data.title || '').trim(),
    author: String(data.author || '').trim(),
    url: String(data.url || '').trim(),
    confidence: Number(data.confidence || 0),
    reason: String(data.reason || '').trim()
  };
}

async function callDeepSeek(apiKey, text) {
  const res = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      temperature: 0.2,
      messages: [
        { role: 'system', content: SEARCH_PROMPT },
        { role: 'user', content: `【内容】\n${text}` }
      ]
    })
  });
  if (!res.ok) {
    throw new Error(`DeepSeek ${res.status}`);
  }
  const data = await res.json();
  return data?.choices?.[0]?.message?.content?.trim() || '';
}

async function insertReadingList({ type, title, author, url, highlightId }) {
  const sql = `
    INSERT INTO reading_list (type, title, author, url, source_highlight_id, user_id)
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING id, type, title, author, url, status, added_at
  `;
  const { rows } = await getPool().query(sql, [
    type,
    title,
    author || null,
    url || null,
    highlightId || null,
    DEFAULT_USER_ID
  ]);
  return rows[0];
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  if (!ensureAuthorized(req, res)) return;

  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    res.status(503).json({ error: 'service_unavailable', message: 'Missing DEEPSEEK_API_KEY' });
    return;
  }

  const { text, highlight_id, article_id, confirm_add, candidate } = req.body || {};
  const highlightId = highlight_id || null;
  const articleId = article_id || null;

  if (confirm_add) {
    const normalized = normalizeCandidate(candidate);
    if (normalized.type === 'unknown' || !normalized.title) {
      res.status(400).json({ error: 'bad_request', message: 'candidate is required' });
      return;
    }
    const entry = await insertReadingList({
      type: normalized.type,
      title: normalized.title,
      author: normalized.author,
      url: normalized.url,
      highlightId
    });
    res.status(200).json({ status: 'added', entry });
    return;
  }

  if (!text || !String(text).trim()) {
    res.status(400).json({ error: 'bad_request', message: 'text is required' });
    return;
  }

  try {
    const raw = await callDeepSeek(apiKey, text);
    const parsed = extractJson(raw);
    const normalized = normalizeCandidate(parsed);

    if (normalized.type === 'book' && normalized.title) {
      const entry = await insertReadingList({
        type: 'book',
        title: normalized.title,
        author: normalized.author,
        url: null,
        highlightId
      });
      res.status(200).json({ status: 'book_added', entry });
      return;
    }

    if (normalized.type === 'article' && normalized.title) {
      res.status(200).json({
        status: 'article_found',
        candidate: {
          type: 'article',
          title: normalized.title,
          author: normalized.author,
          url: normalized.url,
          confidence: normalized.confidence,
          reason: normalized.reason
        }
      });
      return;
    }

    res.status(200).json({ status: 'not_found' });
  } catch (err) {
    console.error('[api/search-reference] error', err);
    res.status(503).json({ error: 'service_unavailable' });
  }
}
