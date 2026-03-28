import dotenv from 'dotenv';
import { Pool } from 'pg';

dotenv.config({ path: '.env.local' });

const UNKNOWN_AUTHOR_KEY = 'unknown';
const DAILY_BRIEF_AUTHOR_KEY = 'daily_brief';

async function ensureAuthorKeyColumn(pool) {
  await pool.query(`ALTER TABLE articles ADD COLUMN IF NOT EXISTS author_key TEXT`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_articles_author_key ON articles(author_key)`);
}

async function ensureSystemAuthors(pool) {
  await pool.query(
    `
      INSERT INTO authors (source_key, name, name_zh, bio_one_line, bio_full, tag, avatar_url)
      VALUES
        ($1, 'AI Editor', 'AI小编', '每日快讯整理者', '系统快讯作者', ARRAY['科技']::text[], NULL),
        ($2, 'Unknown Author', '未知作者', '待补充作者信息', '历史数据中暂未识别到精确作者', ARRAY[]::text[], NULL)
      ON CONFLICT (source_key) DO UPDATE
      SET
        name = EXCLUDED.name,
        name_zh = EXCLUDED.name_zh,
        bio_one_line = EXCLUDED.bio_one_line,
        bio_full = EXCLUDED.bio_full
    `,
    [DAILY_BRIEF_AUTHOR_KEY, UNKNOWN_AUTHOR_KEY]
  );
}

async function backfillAuthorKey(pool) {
  const summary = {};

  const bySource = await pool.query(
    `
      UPDATE articles a
      SET author_key = au.source_key
      FROM authors au
      WHERE a.author_key IS NULL
        AND a.source_key = au.source_key
    `
  );
  summary.by_source_key = Number(bySource.rowCount || 0);

  const byName = await pool.query(
    `
      UPDATE articles a
      SET author_key = au.source_key
      FROM authors au
      WHERE a.author_key IS NULL
        AND COALESCE(NULLIF(BTRIM(a.author), ''), '') <> ''
        AND LOWER(BTRIM(a.author)) = LOWER(BTRIM(au.name))
    `
  );
  summary.by_author_name = Number(byName.rowCount || 0);

  const byNameZh = await pool.query(
    `
      UPDATE articles a
      SET author_key = au.source_key
      FROM authors au
      WHERE a.author_key IS NULL
        AND COALESCE(NULLIF(BTRIM(a.author), ''), '') <> ''
        AND COALESCE(NULLIF(BTRIM(au.name_zh), ''), '') <> ''
        AND LOWER(BTRIM(a.author)) = LOWER(BTRIM(au.name_zh))
    `
  );
  summary.by_author_name_zh = Number(byNameZh.rowCount || 0);

  const byNameContains = await pool.query(
    `
      UPDATE articles a
      SET author_key = (
        SELECT au.source_key
        FROM authors au
        WHERE POSITION(LOWER(au.name) IN LOWER(a.author)) > 0
        ORDER BY LENGTH(au.name) DESC
        LIMIT 1
      )
      WHERE a.author_key IS NULL
        AND COALESCE(NULLIF(BTRIM(a.author), ''), '') <> ''
        AND EXISTS (
          SELECT 1
          FROM authors au
          WHERE POSITION(LOWER(au.name) IN LOWER(a.author)) > 0
        )
    `
  );
  summary.by_author_name_contains = Number(byNameContains.rowCount || 0);

  const dailyBrief = await pool.query(
    `
      UPDATE articles
      SET author_key = $1
      WHERE author_key IS NULL
        AND source_key = 'daily_brief'
    `,
    [DAILY_BRIEF_AUTHOR_KEY]
  );
  summary.by_daily_brief = Number(dailyBrief.rowCount || 0);

  const remapUnknown = await pool.query(
    `
      UPDATE articles a
      SET author_key = (
        SELECT au.source_key
        FROM authors au
        WHERE POSITION(LOWER(au.name) IN LOWER(a.author)) > 0
        ORDER BY LENGTH(au.name) DESC
        LIMIT 1
      )
      WHERE a.author_key = $1
        AND COALESCE(NULLIF(BTRIM(a.author), ''), '') <> ''
        AND EXISTS (
          SELECT 1
          FROM authors au
          WHERE POSITION(LOWER(au.name) IN LOWER(a.author)) > 0
        )
    `,
    [UNKNOWN_AUTHOR_KEY]
  );
  summary.remap_unknown_by_contains = Number(remapUnknown.rowCount || 0);

  const fallbackUnknown = await pool.query(
    `
      UPDATE articles
      SET author_key = $1
      WHERE author_key IS NULL
    `,
    [UNKNOWN_AUTHOR_KEY]
  );
  summary.by_unknown_fallback = Number(fallbackUnknown.rowCount || 0);

  return summary;
}

async function printAudit(pool) {
  const { rows: unmatched } = await pool.query(
    `
      SELECT id::text, source_key, author
      FROM articles
      WHERE author_key = $1
      ORDER BY fetched_at DESC NULLS LAST
      LIMIT 20
    `,
    [UNKNOWN_AUTHOR_KEY]
  );
  const { rows: totals } = await pool.query(
    `
      SELECT
        COUNT(*)::int AS total_articles,
        COUNT(*) FILTER (WHERE author_key IS NULL)::int AS author_key_null,
        COUNT(*) FILTER (WHERE author_key = $1)::int AS author_key_unknown
      FROM articles
    `,
    [UNKNOWN_AUTHOR_KEY]
  );
  const { rows: top } = await pool.query(
    `
      SELECT author_key, COUNT(*)::int AS c
      FROM articles
      GROUP BY author_key
      ORDER BY c DESC
      LIMIT 20
    `
  );

  console.log('[migrate-author-key] totals', totals[0]);
  console.log('[migrate-author-key] top author_key');
  console.table(top);
  console.log('[migrate-author-key] sample unknown rows');
  console.table(unmatched);
}

async function main() {
  const connectionString = String(process.env.NEON_DATABASE_URL || '').trim();
  if (!connectionString) throw new Error('Missing NEON_DATABASE_URL');

  const pool = new Pool({ connectionString, ssl: { rejectUnauthorized: false } });
  try {
    await ensureAuthorKeyColumn(pool);
    await ensureSystemAuthors(pool);
    const summary = await backfillAuthorKey(pool);
    console.log('[migrate-author-key] backfill summary', summary);
    await printAudit(pool);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error('[migrate-author-key] failed:', err.message);
  process.exit(1);
});
