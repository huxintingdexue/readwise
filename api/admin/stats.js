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

function getUserId(req, res) {
  const inviteCode = req.headers['x-invite-code'] || '';
  const userId = getUserIdFromInviteCode(inviteCode);
  if (!userId) {
    res.status(401).json({ error: 'unauthorized', message: '邀请码无效' });
    return null;
  }
  return userId;
}

async function ensureEventsTable() {
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

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  if (!isAdmin(userId)) {
    res.status(403).json({ error: 'forbidden' });
    return;
  }

  try {
    await ensureEventsTable();

    const todayActive = await getPool().query(
      `SELECT COUNT(DISTINCT user_id)::int AS count
       FROM events
       WHERE event = 'open_app'
         AND created_at >= date_trunc('day', now())`
    );

    const todayOpen = await getPool().query(
      `SELECT COUNT(*)::int AS count
       FROM events
       WHERE event = 'open_article'
         AND created_at >= date_trunc('day', now())`
    );

    const weeklyUser = await getPool().query(
      `SELECT user_id, COUNT(*)::int AS count
       FROM events
       WHERE event = 'finish_article'
         AND created_at >= date_trunc('week', now())
       GROUP BY user_id
       ORDER BY count DESC`
    );

    const articleCompletion = await getPool().query(
      `WITH open_counts AS (
         SELECT article_id, COUNT(*)::int AS open_count
         FROM events
         WHERE event = 'open_article'
         GROUP BY article_id
       ), finish_counts AS (
         SELECT article_id, COUNT(*)::int AS finish_count
         FROM events
         WHERE event = 'finish_article'
         GROUP BY article_id
       )
       SELECT COALESCE(a.title_zh, a.title_en, '未命名文章') AS title,
              COALESCE(f.finish_count, 0) AS finish_count,
              COALESCE(o.open_count, 0) AS open_count,
              CASE
                WHEN COALESCE(o.open_count, 0) = 0 THEN 0
                ELSE ROUND((COALESCE(f.finish_count, 0)::numeric / o.open_count) * 100)::int
              END AS rate
       FROM articles a
       LEFT JOIN open_counts o ON o.article_id = a.id
       LEFT JOIN finish_counts f ON f.article_id = a.id
       WHERE COALESCE(o.open_count, 0) > 0
       ORDER BY rate DESC, open_count DESC
       LIMIT 20`
    );

    const highlightsByUser = await getPool().query(
      `SELECT user_id, COUNT(*)::int AS count
       FROM highlights
       GROUP BY user_id
       ORDER BY count DESC`
    );

    const qaByUser = await getPool().query(
      `SELECT user_id, COUNT(*)::int AS count
       FROM qa_records
       WHERE answer_summary IS NULL OR answer_summary NOT LIKE '__reference__:%'
       GROUP BY user_id
       ORDER BY count DESC`
    );

    res.status(200).json({
      today_active_users: todayActive.rows[0]?.count ?? 0,
      today_open_articles: todayOpen.rows[0]?.count ?? 0,
      weekly_user_finishes: weeklyUser.rows,
      article_completion: articleCompletion.rows,
      highlights_by_user: highlightsByUser.rows,
      qa_by_user: qaByUser.rows
    });
  } catch (err) {
    console.error('[api/admin/stats] error', err);
    res.status(500).json({ error: 'internal_error' });
  }
}
