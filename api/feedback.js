import dotenv from 'dotenv';
import { Pool } from 'pg';
import { getUserIdFromInviteCode, isAdmin, ensureOpenClawPermission } from './_utils/auth.js';

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

async function ensureTable() {
  await getPool().query(`
    CREATE TABLE IF NOT EXISTS feedback (
      id SERIAL PRIMARY KEY,
      user_id VARCHAR(50),
      content TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);
}

export default async function handler(req, res) {
  const userId = await getUserId(req, res);
  if (!userId) return;

  try {
    await ensureTable();

    if (req.method === 'POST') {
      const content = String(req.body?.content || '').trim();
      if (!content) {
        res.status(400).json({ error: 'bad_request', message: 'content is required' });
        return;
      }
      await getPool().query(
        'INSERT INTO feedback (user_id, content) VALUES ($1, $2)',
        [userId, content]
      );
      res.status(200).json({ success: true });
      return;
    }

    if (req.method === 'GET') {
      if (!isAdmin(userId)) {
        res.status(403).json({ error: 'forbidden' });
        return;
      }
      const { rows } = await getPool().query(
        'SELECT id, user_id, content, created_at FROM feedback ORDER BY created_at DESC'
      );
      res.status(200).json({ items: rows });
      return;
    }

    res.setHeader('Allow', 'GET, POST');
    res.status(405).json({ error: 'method_not_allowed' });
  } catch (err) {
    console.error('[api/feedback] error', err);
    res.status(500).json({ error: 'internal_error' });
  }
}
