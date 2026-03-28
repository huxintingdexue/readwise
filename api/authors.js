import dotenv from 'dotenv';
import { Pool } from 'pg';
import { resolveUserId } from './_utils/auth.js';

dotenv.config({ path: '.env.local' });

let pool;
let cachedAuthorsTableExists = null;

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

async function hasAuthorsTable() {
  if (typeof cachedAuthorsTableExists === 'boolean') {
    return cachedAuthorsTableExists;
  }
  const { rows } = await getPool().query(
    `
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name = 'authors'
      LIMIT 1
    `
  );
  cachedAuthorsTableExists = rows.length > 0;
  return cachedAuthorsTableExists;
}

async function listAuthors(res, userId) {
  const isAdminUser = userId === 'admin';
  if (!(await hasAuthorsTable())) {
    res.status(200).json({ authors: [] });
    return;
  }

  const sql = `
    SELECT
      au.id::text,
      au.source_key,
      au.name,
      au.name_zh,
      au.bio_one_line,
      au.bio_full,
      COALESCE(au.tag, ARRAY[]::text[]) AS tag,
      au.avatar_url,
      au.twitter_handle,
      COUNT(a.id)::int AS article_count
    FROM authors au
    LEFT JOIN articles a
      ON a.source_key = au.source_key
      AND (
        COALESCE(a.translation_job_status, a.status, 'ready') = 'ready'
        OR (COALESCE(a.translation_job_status, a.status, 'ready') = 'translating' AND a.submitted_by = $1)
      )
      AND COALESCE(a.publish_status, 'published') <> 'hidden'
      AND (
        $2::boolean = TRUE
        OR COALESCE(a.publish_status, 'published') = 'published'
        OR (COALESCE(a.translation_job_status, a.status, 'ready') = 'translating' AND a.submitted_by = $1)
      )
      AND (a.user_id IS NULL OR a.user_id = $1)
    GROUP BY
      au.id,
      au.source_key,
      au.name,
      au.name_zh,
      au.bio_one_line,
      au.bio_full,
      au.tag,
      au.avatar_url,
      au.twitter_handle
    ORDER BY
      CASE
        WHEN au.source_key IN ('manual', 'daily_brief') THEN 1
        ELSE 0
      END ASC,
      CASE
        WHEN COUNT(a.id) > 0 THEN 0
        ELSE 1
      END ASC,
      COUNT(a.id) DESC,
      au.name ASC
  `;

  const { rows } = await getPool().query(sql, [userId, isAdminUser]);
  res.status(200).json({ authors: rows });
}

export default async function handler(req, res) {
  try {
    const userId = await resolveUserId(req, res);
    if (!userId) return;
    if (req.method === 'GET') {
      await listAuthors(res, userId);
      return;
    }
    res.setHeader('Allow', 'GET');
    res.status(405).json({ error: 'method_not_allowed' });
  } catch (err) {
    res.status(500).json({ error: 'internal_error', message: err.message });
  }
}
