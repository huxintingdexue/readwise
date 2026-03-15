import dotenv from 'dotenv';
import fetch from 'node-fetch';
import { Pool } from 'pg';
import { getUserIdFromInviteCode } from './_utils/auth.js';
import { checkRateLimit } from './_utils/rateLimit.js';

dotenv.config({ path: '.env.local' });

const QA_PROMPT =
  '你是一个技术文章问答助手。请基于提供的上下文回答用户问题，用中文回答，2-3 句为摘要即可。若上下文不足以回答，说明“上下文不足”。';

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

async function callDeepSeek(apiKey, question, context) {
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
        { role: 'system', content: QA_PROMPT },
        {
          role: 'user',
          content: `【问题】\n${question}\n\n【上下文】\n${context}`
        }
      ]
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

  const { highlight_id, article_id, question, context } = req.body || {};
  if (!article_id || !question || !context) {
    res.status(400).json({ error: 'bad_request', message: 'article_id, question, context are required' });
    return;
  }

  try {
    const limitResult = await checkRateLimit(userId, 'qa', 50);
    if (!limitResult.allowed) {
      res.status(429).json({ error: 'rate_limited', message: '今日提问次数已用完' });
      return;
    }

    const answerSummary = await callDeepSeek(apiKey, question, context);

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
