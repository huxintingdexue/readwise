import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import { Pool } from 'pg';

dotenv.config({ path: '.env.local' });

const DEFAULT_JSON_PATH = '/Users/bytedance/Downloads/rewu.json';
const FALLBACK_JSON_PATH = path.resolve(process.cwd(), 'tmp_rewu.json');

function normalizeTag(tag) {
  const text = String(tag || '').trim();
  if (!text) return null;
  if (text === '个人成长') return '人生哲学';
  return text;
}

function normalizeTagList(rawTag) {
  if (Array.isArray(rawTag)) {
    return rawTag.map(normalizeTag).filter(Boolean);
  }
  const single = normalizeTag(rawTag);
  return single ? [single] : [];
}

function readJsonPath() {
  const fromArg = String(process.argv[2] || '').trim();
  if (fromArg) return path.resolve(process.cwd(), fromArg);
  if (fs.existsSync(DEFAULT_JSON_PATH)) return DEFAULT_JSON_PATH;
  return FALLBACK_JSON_PATH;
}

async function ensureAuthorsTable(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS authors (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      source_key TEXT UNIQUE,
      name TEXT NOT NULL,
      name_zh TEXT,
      bio_one_line TEXT,
      bio_full TEXT,
      tag TEXT[],
      avatar_url TEXT,
      twitter_handle TEXT,
      created_at TIMESTAMP DEFAULT now()
    );
  `);
  await pool.query('CREATE UNIQUE INDEX IF NOT EXISTS idx_authors_source_key ON authors(source_key)');
}

async function upsertAuthors(pool, rows) {
  let insertedOrUpdated = 0;
  for (const row of rows) {
    const sourceKey = String(row.source_key || '').trim();
    const name = String(row.name || '').trim();
    if (!sourceKey || !name) continue;

    const nameZh = String(row.name_zh || '').trim() || null;
    const bioOneLine = String(row.bio_one_line || '').trim() || null;
    const bioFull = String(row.bio_full || '').trim() || null;
    const tags = normalizeTagList(row.tag);
    const avatarUrl = String(row.avatar_url || '').trim() || null;
    const twitterHandle = String(row.twitter_handle || '').trim() || null;

    await pool.query(
      `
        INSERT INTO authors (
          source_key,
          name,
          name_zh,
          bio_one_line,
          bio_full,
          tag,
          avatar_url,
          twitter_handle
        )
        VALUES ($1, $2, $3, $4, $5, $6::text[], $7, $8)
        ON CONFLICT (source_key) DO UPDATE
        SET
          name = EXCLUDED.name,
          name_zh = EXCLUDED.name_zh,
          bio_one_line = EXCLUDED.bio_one_line,
          bio_full = EXCLUDED.bio_full,
          tag = EXCLUDED.tag,
          avatar_url = CASE
            WHEN EXCLUDED.avatar_url IS NULL OR EXCLUDED.avatar_url = '' THEN authors.avatar_url
            ELSE EXCLUDED.avatar_url
          END,
          twitter_handle = EXCLUDED.twitter_handle
      `,
      [sourceKey, name, nameZh, bioOneLine, bioFull, tags, avatarUrl, twitterHandle]
    );

    insertedOrUpdated += 1;
    console.log(`[seed-authors] upserted ${sourceKey} (${name})`);
  }
  return insertedOrUpdated;
}

async function backfillAvatarFromArticles(pool) {
  const { rowCount } = await pool.query(`
    UPDATE authors au
    SET avatar_url = (
      SELECT a.author_avatar_url
      FROM articles a
      WHERE a.source_key = au.source_key
        AND a.author_avatar_url IS NOT NULL
        AND a.author_avatar_url <> ''
      ORDER BY a.fetched_at DESC NULLS LAST, a.published_at DESC NULLS LAST
      LIMIT 1
    )
    WHERE (au.avatar_url IS NULL OR au.avatar_url = '')
      AND EXISTS (
        SELECT 1
        FROM articles a
        WHERE a.source_key = au.source_key
          AND a.author_avatar_url IS NOT NULL
          AND a.author_avatar_url <> ''
      );
  `);
  return Number(rowCount || 0);
}

async function main() {
  const connectionString = String(process.env.NEON_DATABASE_URL || '').trim();
  if (!connectionString) {
    throw new Error('Missing NEON_DATABASE_URL');
  }

  const jsonPath = readJsonPath();
  if (!fs.existsSync(jsonPath)) {
    throw new Error(`JSON not found: ${jsonPath}`);
  }
  const raw = fs.readFileSync(jsonPath, 'utf8');
  const payload = JSON.parse(raw);
  if (!Array.isArray(payload)) {
    throw new Error('JSON root must be an array');
  }

  const pool = new Pool({ connectionString, ssl: { rejectUnauthorized: false } });
  try {
    await ensureAuthorsTable(pool);
    const affected = await upsertAuthors(pool, payload);
    const avatarBackfilled = await backfillAvatarFromArticles(pool);
    const { rows } = await pool.query(`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE avatar_url IS NOT NULL AND avatar_url <> '')::int AS has_avatar
      FROM authors
    `);
    console.log('[seed-authors] summary', {
      jsonPath,
      input: payload.length,
      upserted: affected,
      avatar_backfilled: avatarBackfilled,
      authors_total: rows[0]?.total || 0,
      authors_has_avatar: rows[0]?.has_avatar || 0
    });
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error('[seed-authors] failed:', err.message);
  process.exit(1);
});
