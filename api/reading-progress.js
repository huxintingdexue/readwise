import dotenv from 'dotenv';
import { Pool } from 'pg';

dotenv.config({ path: '.env.local' });

const DEFAULT_USER_ID = 'default_user';
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

function readQuery(req) {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  return {
    articleId: req.query?.article_id || url.searchParams.get('article_id') || null
  };
}

async function getProgress(req, res) {
  const { articleId } = readQuery(req);
  if (!articleId) {
    res.status(400).json({ error: 'bad_request', message: 'article_id is required' });
    return;
  }

  const sql = `
    SELECT article_id, scroll_position, last_read_at
    FROM reading_progress
    WHERE article_id = $1
      AND (user_id IS NULL OR user_id = $2)
    LIMIT 1
  `;

  const { rows } = await getPool().query(sql, [articleId, DEFAULT_USER_ID]);
  if (rows.length === 0) {
    res.status(200).json({ article_id: articleId, scroll_position: 0, last_read_at: null });
    return;
  }

  res.status(200).json(rows[0]);
}

async function upsertProgress(req, res) {
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
    ON CONFLICT (article_id) DO UPDATE SET
      scroll_position = EXCLUDED.scroll_position,
      last_read_at = NOW(),
      user_id = COALESCE(reading_progress.user_id, EXCLUDED.user_id)
    RETURNING article_id, scroll_position, last_read_at
  `;

  const { rows } = await getPool().query(sql, [articleId, rawPosition, DEFAULT_USER_ID]);
  res.status(200).json(rows[0]);
}

export default async function handler(req, res) {
  if (!ensureAuthorized(req, res)) {
    return;
  }

  try {
    if (req.method === 'GET') {
      await getProgress(req, res);
      return;
    }

    if (req.method === 'POST') {
      await upsertProgress(req, res);
      return;
    }

    res.setHeader('Allow', 'GET, POST');
    res.status(405).json({ error: 'method_not_allowed' });
  } catch (err) {
    console.error('[api/reading-progress] error', err);
    res.status(500).json({ error: 'internal_error' });
  }
}
