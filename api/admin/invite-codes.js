import dotenv from 'dotenv';
import { Pool } from 'pg';
import { getUserIdFromInviteCode, isAdmin } from '../_utils/auth.js';

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

async function ensureInviteTable() {
  await getPool().query(`
    CREATE TABLE IF NOT EXISTS invite_codes (
      id SERIAL PRIMARY KEY,
      code VARCHAR(50) UNIQUE NOT NULL,
      user_id VARCHAR(50) UNIQUE NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);
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

export default async function handler(req, res) {
  const userId = await getUserId(req, res);
  if (!userId) return;

  if (!isAdmin(userId)) {
    res.status(403).json({ error: 'forbidden' });
    return;
  }

  try {
    await ensureInviteTable();

    if (req.method === 'GET') {
      const { rows } = await getPool().query(
        'SELECT id, code, user_id, created_at FROM invite_codes ORDER BY created_at DESC'
      );
      res.status(200).json({ items: rows });
      return;
    }

    if (req.method === 'POST') {
      const code = String(req.body?.code || '').trim();
      const newUserId = String(req.body?.userId || '').trim();
      if (!code || !newUserId) {
        res.status(400).json({ error: 'bad_request', message: 'code and userId are required' });
        return;
      }

      try {
        await getPool().query(
          'INSERT INTO invite_codes (code, user_id) VALUES ($1, $2)',
          [code, newUserId]
        );
        res.status(200).json({ success: true });
      } catch (err) {
        if (String(err.code) === '23505') {
          res.status(409).json({ error: 'conflict' });
          return;
        }
        throw err;
      }
      return;
    }

    res.setHeader('Allow', 'GET, POST');
    res.status(405).json({ error: 'method_not_allowed' });
  } catch (err) {
    console.error('[api/admin/invite-codes] error', err);
    res.status(500).json({ error: 'internal_error' });
  }
}
