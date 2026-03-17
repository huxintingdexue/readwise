import dotenv from 'dotenv';
import fetch from 'node-fetch';
import { Pool } from 'pg';
import { getUserIdFromInviteCode } from './_utils/auth.js';
import { checkRateLimit } from './_utils/rateLimit.js';

dotenv.config({ path: '.env.local' });

const QA_PROMPT =
  '你是一个技术文章问答助手，场景是科技/商业/AI头部大佬博客的翻译阅读。请结合上下文（仅供参考，不必拘泥）回答用户问题，用中文回答，2-3 句即可。若无法确定，请明确标注“不确定/可能”，并指出还缺什么信息。避免编造具体事实或细节。';

const QA_DIRECT_PROMPT =
  '你是一个技术文章问答助手，场景是科技/商业/AI头部大佬博客的翻译阅读。请直接回答用户问题，用中文回答，2-3 句即可。若无法确定，请明确标注“不确定/可能”，并指出还缺什么信息。避免编造具体事实或细节。';

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

async function callDeepSeek(apiKey, question, context, prompt = QA_PROMPT) {
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
        { role: 'system', content: prompt },
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

function shouldRetryWithFallback(answer) {
  if (!answer) return false;
  return (
    answer.includes('上下文不足') ||
    answer.includes('不确定') ||
    answer.includes('无法确定') ||
    answer.includes('无法判断') ||
    answer.includes('可能') ||
    answer.includes('信息不足')
  );
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

  const { highlight_id, article_id, question, context, fallback_context } = req.body || {};
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

    let answerSummary = await callDeepSeek(apiKey, question, context);
    if (fallback_context && shouldRetryWithFallback(answerSummary)) {
      const nextAnswer = await callDeepSeek(apiKey, question, fallback_context);
      if (nextAnswer) {
        answerSummary = nextAnswer;
      }
    }
    if (shouldRetryWithFallback(answerSummary)) {
      const directAnswer = await callDeepSeek(apiKey, question, '', QA_DIRECT_PROMPT);
      if (directAnswer) {
        answerSummary = directAnswer;
      }
    }

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
