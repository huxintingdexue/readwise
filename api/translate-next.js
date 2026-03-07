import dotenv from 'dotenv';
import fetch from 'node-fetch';
import { Pool } from 'pg';

dotenv.config({ path: '.env.local' });

const MAX_TRANSLATE_CHARS = 2000;
const CONTEXT_REF_CHARS = 200;
const TRANSLATE_PROMPT =
  '你是一个技术文章翻译专家。请将以下英文翻译成中文，要求：保留所有专有名词英文原文（如 Transformer、Attention、LLM），人名不翻译，翻译风格自然流畅，不要逐字直译。以下【上文参考】部分仅供理解上下文，不需要翻译。';

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

function splitBySentenceBoundary(text, maxChars) {
  if (!text) return '';
  if (text.length <= maxChars) return text;

  const parts = text.match(/[^.!?。！？\n]+[.!?。！？\n]*/g) || [text];
  let result = '';
  for (const part of parts) {
    if ((result + part).length > maxChars) break;
    result += part;
  }

  if (!result) {
    return text.slice(0, maxChars);
  }
  return result.trim();
}

async function translateChunk(apiKey, contextRef, chunk) {
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
        { role: 'system', content: TRANSLATE_PROMPT },
        {
          role: 'user',
          content: `【上文参考（不翻译）】\n${contextRef || '(无)'}\n\n【需要翻译】\n${chunk}`
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
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  if (!ensureAuthorized(req, res)) {
    return;
  }

  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    res.status(503).json({ error: 'service_unavailable', message: 'Missing DEEPSEEK_API_KEY' });
    return;
  }

  const articleId = req.body?.article_id;
  const fromChar = Math.max(0, Number.parseInt(String(req.body?.from_char || 0), 10) || 0);
  if (!articleId) {
    res.status(400).json({ error: 'bad_request', message: 'article_id is required' });
    return;
  }

  try {
    const client = await getPool().connect();
    try {
      await client.query('BEGIN');

      const articleRes = await client.query(
        `SELECT id, content_plain, content_zh, translated_chars, translation_status
         FROM articles
         WHERE id = $1
         LIMIT 1
         FOR UPDATE`,
        [articleId]
      );

      if (articleRes.rows.length === 0) {
        await client.query('ROLLBACK');
        res.status(404).json({ error: 'not_found' });
        return;
      }

      const article = articleRes.rows[0];
      const contentPlain = article.content_plain || '';
      const totalChars = contentPlain.length;

      const start = Math.max(fromChar, Number(article.translated_chars || 0));
      if (start >= totalChars) {
        const finalStatus = totalChars > 0 ? 'full' : (article.translation_status || 'partial');
        if (finalStatus === 'full' && article.translation_status !== 'full') {
          await client.query(
            `UPDATE articles SET translation_status = 'full' WHERE id = $1`,
            [articleId]
          );
        }
        await client.query('COMMIT');
        res.status(200).json({ translated_chars: totalChars, status: finalStatus });
        return;
      }

      const contextStart = Math.max(0, start - CONTEXT_REF_CHARS);
      const contextRef = contentPlain.slice(contextStart, start);
      const chunk = splitBySentenceBoundary(contentPlain.slice(start), MAX_TRANSLATE_CHARS);

      let translated;
      try {
        translated = await translateChunk(apiKey, contextRef, chunk);
      } catch (err) {
        await client.query('ROLLBACK');
        res.status(503).json({ error: 'service_unavailable', message: 'translate_failed' });
        return;
      }

      const newTranslatedChars = start + chunk.length;
      const updateRes = await client.query(
        `UPDATE articles
         SET content_zh = CASE
              WHEN COALESCE(content_zh, '') = '' THEN $1
              ELSE content_zh || E'\n\n' || $1
            END,
            translated_chars = GREATEST(translated_chars, $2),
            translation_status = CASE
              WHEN GREATEST(translated_chars, $2) >= LENGTH(COALESCE(content_plain, '')) THEN 'full'
              ELSE 'partial'
            END
         WHERE id = $3
         RETURNING translated_chars, translation_status`,
        [translated, newTranslatedChars, articleId]
      );

      await client.query('COMMIT');
      res.status(200).json({
        translated_chars: Number(updateRes.rows[0].translated_chars || 0),
        status: updateRes.rows[0].translation_status || 'partial'
      });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('[api/translate-next] error', err);
    res.status(500).json({ error: 'internal_error' });
  }
}
