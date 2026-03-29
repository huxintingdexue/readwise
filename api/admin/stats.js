import dotenv from 'dotenv';
import { Pool } from 'pg';
import { resolveUserId, isAdmin } from '../_utils/auth.js';

dotenv.config({ path: '.env.local' });

let pool;
const CN_TZ = 'Asia/Shanghai';

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
  return resolveUserId(req, res);
}

async function ensureEventsTable() {
  await getPool().query(`
    CREATE TABLE IF NOT EXISTS events (
      id SERIAL PRIMARY KEY,
      user_id VARCHAR(50),
      client_ip TEXT,
      event VARCHAR(50),
      article_id UUID,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);
  await getPool().query(`
    ALTER TABLE events
    ADD COLUMN IF NOT EXISTS client_ip TEXT
  `);
}

function parseSelectedDate(req) {
  try {
    const base = req.headers?.host ? `https://${req.headers.host}` : 'http://localhost';
    const url = new URL(req.url, base);
    const value = String(url.searchParams.get('date') || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    return value;
  } catch (_) {
    return null;
  }
}

async function safeQuery(sql, params = [], fallbackRows = []) {
  try {
    return await getPool().query(sql, params);
  } catch (err) {
    console.warn('[api/admin/stats] query degraded', err?.message || err);
    return { rows: fallbackRows };
  }
}

export default async function handler(req, res) {
  const userId = await getUserId(req, res);
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
    const selectedDate = parseSelectedDate(req);

    let eventsReady = true;
    try {
      await ensureEventsTable();
    } catch (_) {
      eventsReady = false;
    }

    const todayActive = eventsReady
      ? await safeQuery(
          `SELECT COUNT(DISTINCT user_id)::int AS count
           FROM events
           WHERE ((created_at AT TIME ZONE 'UTC') AT TIME ZONE '${CN_TZ}')::date
                 = COALESCE($1::date, (now() AT TIME ZONE '${CN_TZ}')::date)
             AND NULLIF(TRIM(user_id), '') IS NOT NULL`,
          [selectedDate],
          [{ count: 0 }]
        )
      : { rows: [{ count: 0 }] };

    const todayOpen = eventsReady
      ? await safeQuery(
          `SELECT COUNT(*)::int AS count
           FROM events
           WHERE event = 'open_article'
             AND ((created_at AT TIME ZONE 'UTC') AT TIME ZONE '${CN_TZ}')::date
                 = COALESCE($1::date, (now() AT TIME ZONE '${CN_TZ}')::date)`,
          [selectedDate],
          [{ count: 0 }]
        )
      : { rows: [{ count: 0 }] };

    const todayUniqueIps = eventsReady
      ? await safeQuery(
          `SELECT COUNT(DISTINCT client_ip)::int AS count
           FROM events
           WHERE ((created_at AT TIME ZONE 'UTC') AT TIME ZONE '${CN_TZ}')::date
                 = COALESCE($1::date, (now() AT TIME ZONE '${CN_TZ}')::date)
             AND NULLIF(TRIM(client_ip), '') IS NOT NULL`,
          [selectedDate],
          [{ count: 0 }]
        )
      : { rows: [{ count: 0 }] };

    const todayActiveUsers = eventsReady
      ? await safeQuery(
          `SELECT t.user_id, t.nickname
           FROM (
             SELECT DISTINCT e.user_id,
                    NULLIF(TRIM(u.nickname), '') AS nickname
             FROM events e
             LEFT JOIN users u ON u.id = e.user_id
             WHERE ((e.created_at AT TIME ZONE 'UTC') AT TIME ZONE '${CN_TZ}')::date
                   = COALESCE($1::date, (now() AT TIME ZONE '${CN_TZ}')::date)
               AND NULLIF(TRIM(e.user_id), '') IS NOT NULL
           ) t
           ORDER BY COALESCE(t.nickname, t.user_id) ASC`,
          [selectedDate],
          []
        )
      : { rows: [] };

    const weeklyUser = eventsReady
      ? await safeQuery(
          `SELECT e.user_id,
                  NULLIF(TRIM(u.nickname), '') AS nickname,
                  COUNT(*)::int AS count
           FROM events e
           LEFT JOIN users u ON u.id = e.user_id
           WHERE e.event = 'finish_article'
             AND ((e.created_at AT TIME ZONE 'UTC') AT TIME ZONE '${CN_TZ}')
                 >= date_trunc('week', now() AT TIME ZONE '${CN_TZ}')
           GROUP BY e.user_id, u.nickname
           ORDER BY count DESC`
        )
      : { rows: [] };

    const articleCompletion = eventsReady
      ? await safeQuery(
          `WITH open_counts AS (
             SELECT article_id::text AS article_id, COUNT(*)::int AS open_count
             FROM events
             WHERE event = 'open_article'
             GROUP BY article_id::text
           ), finish_counts AS (
             SELECT article_id::text AS article_id, COUNT(*)::int AS finish_count
             FROM events
             WHERE event = 'finish_article'
             GROUP BY article_id::text
           )
           SELECT COALESCE(a.title_zh, a.title_en, '鏈懡鍚嶆枃绔?) AS title,
                  COALESCE(f.finish_count, 0) AS finish_count,
                  COALESCE(o.open_count, 0) AS open_count,
                  CASE
                    WHEN COALESCE(o.open_count, 0) = 0 THEN 0
                    ELSE ROUND((COALESCE(f.finish_count, 0)::numeric / o.open_count) * 100)::int
                  END AS rate
           FROM articles a
           LEFT JOIN open_counts o ON o.article_id = a.id::text
           LEFT JOIN finish_counts f ON f.article_id = a.id::text
           WHERE COALESCE(o.open_count, 0) > 0
           ORDER BY rate DESC, open_count DESC
           LIMIT 20`
        )
      : { rows: [] };

    const highlightsByUser = await safeQuery(
      `SELECT h.user_id,
              NULLIF(TRIM(u.nickname), '') AS nickname,
              COUNT(*)::int AS count
       FROM highlights h
       LEFT JOIN users u ON u.id = h.user_id
       GROUP BY h.user_id, u.nickname
       ORDER BY count DESC`
    );

    const qaByUser = await safeQuery(
      `SELECT q.user_id,
              NULLIF(TRIM(u.nickname), '') AS nickname,
              COUNT(*)::int AS count
       FROM qa_records q
       LEFT JOIN users u ON u.id = q.user_id
       WHERE answer_summary IS NULL OR answer_summary NOT LIKE '__reference__:%'
       GROUP BY q.user_id, u.nickname
       ORDER BY count DESC`
    );

    res.status(200).json({
      selected_date: selectedDate || null,
      today_active_users: todayActive.rows[0]?.count ?? 0,
      today_unique_visitors: todayUniqueIps.rows[0]?.count ?? 0,
      today_active_user_ids: todayActiveUsers.rows.map((row) => row.user_id).filter(Boolean),
      today_active_users_detail: todayActiveUsers.rows.map((row) => ({
        user_id: row.user_id || '',
        nickname: row.nickname || null
      })),
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
