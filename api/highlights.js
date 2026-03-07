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

async function getHighlights(req, res) {
  const { articleId } = readQuery(req);
  if (!articleId) {
    res.status(400).json({ error: 'bad_request', message: 'article_id is required' });
    return;
  }

  const sql = `
    SELECT id, article_id, text, position_start, position_end, type, created_at
    FROM highlights
    WHERE article_id = $1
      AND (user_id IS NULL OR user_id = $2)
    ORDER BY created_at DESC
  `;

  const { rows } = await getPool().query(sql, [articleId, DEFAULT_USER_ID]);
  res.status(200).json({ highlights: rows });
}

async function createHighlight(req, res) {
  const articleId = req.body?.article_id;
  const text = String(req.body?.text || '').trim();
  const type = String(req.body?.type || 'highlight');
  const start = Number.parseInt(String(req.body?.position_start ?? ''), 10);
  const end = Number.parseInt(String(req.body?.position_end ?? ''), 10);

  if (!articleId || !text || !Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start) {
    res.status(400).json({
      error: 'bad_request',
      message: 'article_id, text, valid position_start and position_end are required'
    });
    return;
  }

  const sql = `
    INSERT INTO highlights (article_id, text, position_start, position_end, type, user_id)
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING id, article_id, text, position_start, position_end, type, created_at
  `;

  const { rows } = await getPool().query(sql, [articleId, text, start, end, type, DEFAULT_USER_ID]);
  res.status(201).json(rows[0]);
}

export default async function handler(req, res) {
  if (!ensureAuthorized(req, res)) {
    return;
  }

  try {
    if (req.method === 'GET') {
      await getHighlights(req, res);
      return;
    }

    if (req.method === 'POST') {
      await createHighlight(req, res);
      return;
    }

    res.setHeader('Allow', 'GET, POST');
    res.status(405).json({ error: 'method_not_allowed' });
  } catch (err) {
    console.error('[api/highlights] error', err);
    res.status(500).json({ error: 'internal_error' });
  }
}
