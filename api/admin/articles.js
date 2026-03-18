import dotenv from 'dotenv';
import { Pool } from 'pg';
import { getUserIdFromInviteCode, isAdmin, ensureOpenClawPermission } from '../_utils/auth.js';

dotenv.config({ path: '.env.local' });

const VALID_STATUS = new Set(['hidden', 'ready']);

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

function readQuery(req) {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  return {
    status: req.query?.status || url.searchParams.get('status') || null,
    pathname: url.pathname
  };
}

function getPathId(pathname) {
  const match = pathname.match(/^\/api\/admin\/articles\/([^/]+)\/?$/);
  return match ? decodeURIComponent(match[1]) : null;
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

async function listHiddenArticles(res) {
  const { rows } = await getPool().query(
    `
      SELECT id, title_en, title_zh, hidden_reason, hidden_at
      FROM articles
      WHERE status = 'hidden'
      ORDER BY hidden_at DESC NULLS LAST, fetched_at DESC NULLS LAST
    `
  );
  res.status(200).json({ items: rows });
}

async function updateArticleStatus(res, articleId, status, hiddenReason) {
  if (!VALID_STATUS.has(status)) {
    res.status(400).json({ error: 'bad_request', message: 'invalid status' });
    return;
  }

  if (status === 'hidden') {
    const reason = String(hiddenReason || '').trim();
    if (!reason) {
      res.status(400).json({ error: 'bad_request', message: 'hidden_reason is required' });
      return;
    }
    const { rows } = await getPool().query(
      `
        UPDATE articles
        SET status = 'hidden',
            hidden_reason = $1,
            hidden_at = NOW()
        WHERE id = $2
        RETURNING id
      `,
      [reason, articleId]
    );
    if (!rows.length) {
      res.status(404).json({ error: 'not_found' });
      return;
    }
    res.status(200).json({ success: true });
    return;
  }

  const { rows } = await getPool().query(
    `
      UPDATE articles
      SET status = 'ready',
          hidden_reason = NULL,
          hidden_at = NULL
      WHERE id = $1
      RETURNING id
    `,
    [articleId]
  );
  if (!rows.length) {
    res.status(404).json({ error: 'not_found' });
    return;
  }
  res.status(200).json({ success: true });
}

export default async function handler(req, res) {
  const userId = await getUserId(req, res);
  if (!userId) return;

  if (!isAdmin(userId)) {
    res.status(403).json({ error: 'forbidden' });
    return;
  }

  try {
    const query = readQuery(req);
    const routeId = getPathId(query.pathname);

    if (req.method === 'GET') {
      const status = query.status || 'hidden';
      if (status !== 'hidden') {
        res.status(400).json({ error: 'bad_request', message: 'only hidden is supported' });
        return;
      }
      await listHiddenArticles(res);
      return;
    }

    if (req.method === 'PATCH') {
      const articleId = routeId;
      if (!articleId) {
        res.status(400).json({ error: 'bad_request', message: 'missing article id' });
        return;
      }
      const status = String(req.body?.status || '').trim();
      const hiddenReason = req.body?.hidden_reason || req.body?.hiddenReason || '';
      await updateArticleStatus(res, articleId, status, hiddenReason);
      return;
    }

    res.setHeader('Allow', 'GET, PATCH');
    res.status(405).json({ error: 'method_not_allowed' });
  } catch (err) {
    console.error('[api/admin/articles] error', err);
    res.status(500).json({ error: 'internal_error' });
  }
}
