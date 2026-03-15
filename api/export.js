import dotenv from 'dotenv';
import { Pool } from 'pg';
import { getUserIdFromInviteCode } from './_utils/auth.js';

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
  return userId;
}

export default async function handler(req, res) {
  const userId = await getUserId(req, res);
  if (!userId) return;

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  try {
    const [highlights, qaRecords, readingList] = await Promise.all([
      getPool().query(
        `SELECT id, article_id, text, position_start, position_end, type, created_at
         FROM highlights
         WHERE user_id = $1
         ORDER BY created_at DESC`,
        [userId]
      ),
      getPool().query(
        `SELECT id, highlight_id, article_id, question, answer_summary, created_at
         FROM qa_records
         WHERE user_id = $1 AND (answer_summary IS NULL OR answer_summary NOT LIKE '__reference__:%')
         ORDER BY created_at DESC`,
        [userId]
      ),
      getPool().query(
        `SELECT id, type, title, author, url, source_highlight_id, status, added_at
         FROM reading_list
         WHERE user_id = $1
         ORDER BY added_at DESC`,
        [userId]
      )
    ]);

    res.status(200).json({
      exported_at: new Date().toISOString(),
      highlights: highlights.rows,
      qa_records: qaRecords.rows,
      reading_list: readingList.rows
    });
  } catch (err) {
    console.error('[api/export] error', err);
    res.status(500).json({ error: 'internal_error' });
  }
}
