import dotenv from 'dotenv';
import { Pool } from 'pg';
import { resolveUserId, isAdmin } from '../_utils/auth.js';

dotenv.config({ path: '.env.local' });

const VALID_STATUS = new Set(['hidden', 'ready']);
const VALID_ADMIN_LIST_STATUS = new Set(['hidden', 'pending']);
const VALID_PUBLISH_STATUS = new Set(['published', 'hidden']);

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

function getPublishPathId(pathname) {
  const match = pathname.match(/^\/api\/admin\/articles\/([^/]+)\/publish\/?$/);
  return match ? decodeURIComponent(match[1]) : null;
}

async function getUserId(req, res) {
  return resolveUserId(req, res);
}

async function listHiddenArticles(res) {
  const { rows } = await getPool().query(
    `
      SELECT id, title_en, title_zh, hidden_reason, hidden_at
      FROM articles
      WHERE COALESCE(publish_status, 'published') = 'hidden'
      ORDER BY hidden_at DESC NULLS LAST, fetched_at DESC NULLS LAST
    `
  );
  res.status(200).json({ items: rows });
}

async function listPendingArticles(res) {
  const { rows } = await getPool().query(
    `
      SELECT id, title_en, title_zh, submitted_by, published_at, fetched_at
      FROM articles
      WHERE COALESCE(publish_status, 'published') = 'pending_review'
      ORDER BY fetched_at DESC NULLS LAST, published_at DESC NULLS LAST
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
        SET publish_status = 'hidden',
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
      SET publish_status = 'published',
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

async function updatePendingPublishStatus(res, articleId, publishStatus, hiddenReason) {
  if (!VALID_PUBLISH_STATUS.has(publishStatus)) {
    res.status(400).json({ error: 'bad_request', message: 'publish_status must be published or hidden' });
    return;
  }

  if (publishStatus === 'hidden') {
    const reason = String(hiddenReason || '').trim();
    if (!reason) {
      res.status(400).json({ error: 'bad_request', message: 'hidden_reason is required' });
      return;
    }
    const { rows } = await getPool().query(
      `
        UPDATE articles
        SET publish_status = 'hidden',
            hidden_reason = $1,
            hidden_at = NOW()
        WHERE id = $2
          AND COALESCE(publish_status, 'published') = 'pending_review'
        RETURNING id
      `,
      [reason, articleId]
    );
    if (!rows.length) {
      res.status(404).json({ error: 'not_found', message: 'pending article not found' });
      return;
    }
    res.status(200).json({ success: true });
    return;
  }

  const { rows } = await getPool().query(
    `
      UPDATE articles
      SET publish_status = 'published',
          hidden_reason = NULL,
          hidden_at = NULL
      WHERE id = $1
        AND COALESCE(publish_status, 'published') = 'pending_review'
      RETURNING id
    `,
    [articleId]
  );
  if (!rows.length) {
    res.status(404).json({ error: 'not_found', message: 'pending article not found' });
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
    const publishPathId = getPublishPathId(query.pathname);
    const routeId = getPathId(query.pathname);

    if (req.method === 'GET' && !publishPathId) {
      const status = query.status || 'hidden';
      if (!VALID_ADMIN_LIST_STATUS.has(status)) {
        res.status(400).json({ error: 'bad_request', message: 'status must be hidden or pending' });
        return;
      }
      if (status === 'pending') {
        await listPendingArticles(res);
        return;
      }
      await listHiddenArticles(res);
      return;
    }

    if (req.method === 'PATCH' && publishPathId) {
      const publishStatus = String(req.body?.publish_status || req.body?.status || '').trim();
      const hiddenReason = req.body?.hidden_reason || req.body?.hiddenReason || '';
      await updatePendingPublishStatus(res, publishPathId, publishStatus, hiddenReason);
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
