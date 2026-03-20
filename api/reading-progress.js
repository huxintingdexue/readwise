import dotenv from 'dotenv';
import { Pool } from 'pg';
import { resolveUserId } from './_utils/auth.js';

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
  return resolveUserId(req, res);
}

function readQuery(req) {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  return {
    articleId: req.query?.article_id || url.searchParams.get('article_id') || null
  };
}

async function getProgress(req, res, userId) {
  const { articleId } = readQuery(req);
  if (!articleId) {
    res.status(400).json({ error: 'bad_request', message: 'article_id is required' });
    return;
  }

  const sql = `
    SELECT article_id, scroll_position, last_read_at
    FROM reading_progress
    WHERE article_id = $1
      AND user_id = $2
    LIMIT 1
  `;

  const { rows } = await getPool().query(sql, [articleId, userId]);
  if (rows.length === 0) {
    res.status(200).json({ article_id: articleId, scroll_position: 0, last_read_at: null });
    return;
  }

  res.status(200).json(rows[0]);
}

async function upsertProgress(req, res, userId) {
  const articleId = req.body?.article_id;
  const rawPosition = Number.parseInt(String(req.body?.scroll_position ?? ''), 10);

  if (!articleId || !Number.isFinite(rawPosition) || rawPosition < 0) {
    res.status(400).json({
      error: 'bad_request',
      message: 'article_id and non-negative scroll_position are required'
    });
    return;
  }

  const sql = `
    INSERT INTO reading_progress (article_id, scroll_position, last_read_at, user_id)
    VALUES ($1, $2, NOW(), $3)
    ON CONFLICT (article_id, user_id) DO UPDATE SET
      scroll_position = GREATEST(reading_progress.scroll_position, EXCLUDED.scroll_position),
      last_read_at = NOW(),
      user_id = EXCLUDED.user_id
    RETURNING article_id, scroll_position, last_read_at
  `;

  const { rows } = await getPool().query(sql, [articleId, rawPosition, userId]);
  res.status(200).json(rows[0]);
}

export default async function handler(req, res) {
  const userId = await getUserId(req, res);
  if (!userId) return;

  try {
    if (req.method === 'GET') {
      await getProgress(req, res, userId);
      return;
    }

    if (req.method === 'POST') {
      await upsertProgress(req, res, userId);
      return;
    }

    res.setHeader('Allow', 'GET, POST');
    res.status(405).json({ error: 'method_not_allowed' });
  } catch (err) {
    console.error('[api/reading-progress] error', err);
    res.status(500).json({ error: 'internal_error' });
  }
}
