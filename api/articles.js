import dotenv from 'dotenv';
import { Pool } from 'pg';

dotenv.config({ path: '.env.local' });

const DEFAULT_USER_ID = 'default_user';
const VALID_STATUS = new Set(['unread', 'read', 'archived']);
const VALID_AUTHOR = new Set(['sam', 'andrej', 'peter']);
const VALID_SORT = new Set(['date_desc', 'date_asc']);

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

function readQuery(req) {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  return {
    status: req.query?.status || url.searchParams.get('status') || null,
    author: req.query?.author || url.searchParams.get('author') || null,
    sort: req.query?.sort || url.searchParams.get('sort') || 'date_desc',
    id: req.query?.id || url.searchParams.get('id') || null,
    pathname: url.pathname
  };
}

function getPathId(pathname) {
  const match = pathname.match(/^\/api\/articles\/([^/]+)\/?$/);
  return match ? decodeURIComponent(match[1]) : null;
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

function normalizeFilters(query) {
  const status = query.status || null;
  const author = query.author || null;
  const sort = query.sort || 'date_desc';

  if (status && !VALID_STATUS.has(status)) {
    return { error: 'Invalid status, expected unread/read/archived' };
  }
  if (author && !VALID_AUTHOR.has(author)) {
    return { error: 'Invalid author, expected sam/andrej/peter' };
  }
  if (!VALID_SORT.has(sort)) {
    return { error: 'Invalid sort, expected date_desc/date_asc' };
  }

  return { status, author, sort };
}

async function listArticles(res, query) {
  const filters = normalizeFilters(query);
  if (filters.error) {
    res.status(400).json({ error: 'bad_request', message: filters.error });
    return;
  }

  const orderClause = filters.sort === 'date_asc'
    ? 'a.published_at ASC NULLS LAST, a.fetched_at ASC'
    : 'a.published_at DESC NULLS LAST, a.fetched_at DESC';

  const sql = `
    SELECT
      a.id,
      a.source_key,
      a.title_en,
      a.title_zh,
      a.summary_en,
      a.summary_zh,
      a.url,
      a.published_at,
      a.translation_status,
      a.translated_chars,
      a.read_status,
      CASE
        WHEN NULLIF(LENGTH(COALESCE(a.content_plain, '')), 0) IS NULL THEN 0
        ELSE ROUND(
          LEAST(
            100,
            GREATEST(
              0,
              (COALESCE(rp.scroll_position, 0)::numeric / NULLIF(LENGTH(a.content_plain), 0)::numeric) * 100
            )
          )
        )::int
      END AS read_progress
    FROM articles a
    LEFT JOIN reading_progress rp
      ON rp.article_id = a.id
      AND (rp.user_id IS NULL OR rp.user_id = $1)
    WHERE ($2::text IS NULL OR a.read_status = $2)
      AND ($3::text IS NULL OR a.source_key = $3)
      AND (a.user_id IS NULL OR a.user_id = $1)
    ORDER BY ${orderClause}
  `;

  const params = [DEFAULT_USER_ID, filters.status, filters.author];
  const { rows } = await getPool().query(sql, params);
  res.status(200).json({ articles: rows });
}

async function getArticleById(res, id) {
  const sql = `
    SELECT
      a.id,
      a.source_key,
      a.title_en,
      a.title_zh,
      a.summary_en,
      a.summary_zh,
      a.content_en,
      a.content_plain,
      a.content_zh,
      a.translation_status,
      a.translated_chars,
      a.read_status,
      a.url,
      a.published_at,
      a.fetched_at
    FROM articles a
    WHERE a.id = $1
      AND (a.user_id IS NULL OR a.user_id = $2)
    LIMIT 1
  `;

  const { rows } = await getPool().query(sql, [id, DEFAULT_USER_ID]);
  if (rows.length === 0) {
    res.status(404).json({ error: 'not_found' });
    return;
  }
  res.status(200).json(rows[0]);
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  if (!ensureAuthorized(req, res)) {
    return;
  }

  try {
    const query = readQuery(req);
    const routeId = getPathId(query.pathname);
    const id = query.id || routeId;

    if (id) {
      await getArticleById(res, id);
      return;
    }

    await listArticles(res, query);
  } catch (err) {
    console.error('[api/articles] error', err);
    res.status(500).json({ error: 'internal_error' });
  }
}
