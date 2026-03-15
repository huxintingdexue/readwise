import dotenv from 'dotenv';
import { Pool } from 'pg';
import { getUserIdFromInviteCode } from './_utils/auth.js';

dotenv.config({ path: '.env.local' });

const VALID_EVENTS = new Set(['open_app', 'open_article', 'finish_article']);

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

function getUserId(req, res) {
  const inviteCode = req.headers['x-invite-code'] || '';
  const userId = getUserIdFromInviteCode(inviteCode);
  if (!userId) {
    res.status(401).json({ error: 'unauthorized', message: '邀请码无效' });
    return null;
  }
  return userId;
}

async function ensureTable() {
  await getPool().query(`
    CREATE TABLE IF NOT EXISTS events (
      id SERIAL PRIMARY KEY,
      user_id VARCHAR(50),
      event VARCHAR(50),
      article_id UUID,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);
}

export default async function handler(req, res) {
  const userId = getUserId(req, res);
  if (!userId) return;

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  try {
    const event = String(req.body?.event || '').trim();
    const articleId = req.body?.article_id || null;
    if (!VALID_EVENTS.has(event)) {
      res.status(200).json({ success: false });
      return;
    }

    await ensureTable();
    await getPool().query(
      'INSERT INTO events (user_id, event, article_id) VALUES ($1, $2, $3)',
      [userId, event, articleId]
    );
    res.status(200).json({ success: true });
  } catch (err) {
    console.error('[api/events] error', err);
    res.status(200).json({ success: false });
  }
}
