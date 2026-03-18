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
  return {
    status: req.query?.status || url.searchParams.get('status') || null
  };
}

async function listItems(req, res, userId) {
  const { status } = readQuery(req);
  const params = [userId];
  let where = 'WHERE user_id = $1';
  if (status) {
    where += ' AND status = $2';
    params.push(status);
  }

  const sql = `
    SELECT id, type, title, author, url, source_highlight_id, status, added_at
    FROM reading_list
    ${where}
    ORDER BY added_at DESC
  `;
  const { rows } = await getPool().query(sql, params);
  res.status(200).json({ items: rows });
}

async function addItem(req, res, userId) {
  const type = String(req.body?.type || '').trim();
  const title = String(req.body?.title || '').trim();
  const author = String(req.body?.author || '').trim() || null;
  const url = String(req.body?.url || '').trim() || null;
  const sourceHighlightId = req.body?.source_highlight_id || null;

  if (!type || !title) {
    res.status(400).json({ error: 'bad_request', message: 'type and title are required' });
    return;
  }
  if (!['article', 'book'].includes(type)) {
    res.status(400).json({ error: 'bad_request', message: 'type must be article or book' });
    return;
  }

  const sql = `
    INSERT INTO reading_list (type, title, author, url, source_highlight_id, user_id)
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING id, type, title, author, url, source_highlight_id, status, added_at
  `;
  const { rows } = await getPool().query(sql, [
    type,
    title,
    author,
    url,
    sourceHighlightId,
    userId
  ]);
  res.status(201).json(rows[0]);
}

async function updateItem(req, res, userId) {
  const id = req.body?.id;
  const status = String(req.body?.status || '').trim();
  if (!id || !status) {
    res.status(400).json({ error: 'bad_request', message: 'id and status are required' });
    return;
  }
  if (!['pending', 'reading', 'done'].includes(status)) {
    res.status(400).json({ error: 'bad_request', message: 'invalid status' });
    return;
  }

  const sql = `
    UPDATE reading_list
    SET status = $1
    WHERE id = $2 AND user_id = $3
    RETURNING id, type, title, author, url, source_highlight_id, status, added_at
  `;
  const { rows } = await getPool().query(sql, [status, id, userId]);
  if (rows.length === 0) {
    res.status(404).json({ error: 'not_found' });
    return;
  }
  res.status(200).json(rows[0]);
}

export default async function handler(req, res) {
  const userId = await getUserId(req, res);
  if (!userId) return;

  try {
    if (req.method === 'GET') {
      await listItems(req, res, userId);
      return;
    }
    if (req.method === 'POST') {
      await addItem(req, res, userId);
      return;
    }
    if (req.method === 'PATCH') {
      await updateItem(req, res, userId);
      return;
    }
    res.setHeader('Allow', 'GET, POST, PATCH');
    res.status(405).json({ error: 'method_not_allowed' });
  } catch (err) {
    console.error('[api/reading-list] error', err);
    res.status(500).json({ error: 'internal_error' });
  }
}
