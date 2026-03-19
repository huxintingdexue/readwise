import dotenv from 'dotenv';
import { Pool } from 'pg';
import { getUserIdFromInviteCode, ensureOpenClawPermission } from './_utils/auth.js';

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
  if (!ensureOpenClawPermission(req, res, userId)) {
    return null;
  }
  return userId;
}

function readQuery(req) {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const includeOthersRaw = req.query?.include_others || url.searchParams.get('include_others') || '';
  return {
    articleId: req.query?.article_id || url.searchParams.get('article_id') || null,
    includeOthers: ['1', 'true', 'yes'].includes(String(includeOthersRaw).toLowerCase())
  };
}

async function getHighlights(req, res, userId) {
  const { articleId, includeOthers } = readQuery(req);
  if (articleId) {
    if (!includeOthers) {
      const ownSql = `
        SELECT id, article_id, text, position_start, position_end, type, created_at
        FROM highlights
        WHERE article_id = $1
          AND user_id = $2
        ORDER BY created_at DESC
      `;
      const { rows } = await getPool().query(ownSql, [articleId, userId]);
      res.status(200).json({ highlights: rows });
      return;
    }

    const sql = `
      SELECT
        id,
        article_id,
        text,
        position_start,
        position_end,
        type,
        created_at,
        (user_id = $2) AS is_mine
      FROM highlights
      WHERE article_id = $1
      ORDER BY position_start ASC, created_at ASC
    `;
    const { rows } = await getPool().query(sql, [articleId, userId]);
    res.status(200).json({ highlights: rows });
    return;
  }

  const sql = `
    SELECT id, article_id, text, position_start, position_end, type, created_at
    FROM highlights
    WHERE user_id = $1
    ORDER BY created_at DESC
  `;
  const { rows } = await getPool().query(sql, [userId]);
  res.status(200).json({ highlights: rows });
}

async function createHighlight(req, res, userId) {
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

  const { rows } = await getPool().query(sql, [articleId, text, start, end, type, userId]);
  res.status(201).json(rows[0]);
}

export default async function handler(req, res) {
  const userId = await getUserId(req, res);
  if (!userId) return;

  try {
    if (req.method === 'GET') {
      await getHighlights(req, res, userId);
      return;
    }

    if (req.method === 'POST') {
      await createHighlight(req, res, userId);
      return;
    }

    res.setHeader('Allow', 'GET, POST');
    res.status(405).json({ error: 'method_not_allowed' });
  } catch (err) {
    console.error('[api/highlights] error', err);
    res.status(500).json({ error: 'internal_error' });
  }
}
