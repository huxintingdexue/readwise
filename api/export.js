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

export default async function handler(req, res) {
  if (!ensureAuthorized(req, res)) return;

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
         WHERE (user_id IS NULL OR user_id = $1)
         ORDER BY created_at DESC`,
        [DEFAULT_USER_ID]
      ),
      getPool().query(
        `SELECT id, highlight_id, article_id, question, answer_summary, created_at
         FROM qa_records
         WHERE (user_id IS NULL OR user_id = $1)
         ORDER BY created_at DESC`,
        [DEFAULT_USER_ID]
      ),
      getPool().query(
        `SELECT id, type, title, author, url, source_highlight_id, status, added_at
         FROM reading_list
         WHERE (user_id IS NULL OR user_id = $1)
         ORDER BY added_at DESC`,
        [DEFAULT_USER_ID]
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
