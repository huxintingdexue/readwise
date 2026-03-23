import dotenv from 'dotenv';
import { Pool } from 'pg';
import { resolveUserId } from './_utils/auth.js';

dotenv.config({ path: '.env.local' });

const VALID_STATUS = new Set(['unread', 'read', 'archived']);
const VALID_AUTHOR = new Set(['sam', 'andrej', 'peter', 'naval', 'manual']);
const VALID_SORT = new Set(['date_desc', 'date_asc']);

let pool;
let cachedAuthorAvatarColumnExists = null;

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

async function hasAuthorAvatarColumn() {
  if (typeof cachedAuthorAvatarColumnExists === 'boolean') {
    return cachedAuthorAvatarColumnExists;
  }
  const { rows } = await getPool().query(
    `
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'articles'
        AND column_name = 'author_avatar_url'
      LIMIT 1
    `
  );
  cachedAuthorAvatarColumnExists = rows.length > 0;
  return cachedAuthorAvatarColumnExists;
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

function isUrlsEndpoint(pathname) {
  return pathname === '/api/articles/urls';
}

function isOpenClaw(userId) {
  return userId === 'openclaw';
}

async function getUserId(req, res) {
  return resolveUserId(req, res);
}

function normalizeFilters(query) {
  const status = query.status || null;
  const author = query.author || null;
  const sort = query.sort || 'date_desc';

  if (status && !VALID_STATUS.has(status)) {
    return { error: 'Invalid status, expected unread/read/archived' };
  }
  if (author && !VALID_AUTHOR.has(author)) {
    return { error: 'Invalid author, expected sam/andrej/peter/lenny/naval' };
  }
  if (!VALID_SORT.has(sort)) {
    return { error: 'Invalid sort, expected date_desc/date_asc' };
  }

  return { status, author, sort };
}

async function listArticles(res, query, userId) {
  const isAdminUser = userId === 'admin';
  const filters = normalizeFilters(query);
  if (filters.error) {
    res.status(400).json({ error: 'bad_request', message: filters.error });
    return;
  }

  const orderClause = filters.sort === 'date_asc'
    ? 'a.published_at ASC NULLS LAST, a.fetched_at ASC'
    : 'a.published_at DESC NULLS LAST, a.fetched_at DESC';
  const avatarSelect = (await hasAuthorAvatarColumn())
    ? 'a.author_avatar_url'
    : 'NULL::text AS author_avatar_url';

  const sql = `
    SELECT
      a.id,
      a.source_key,
      a.title_en,
      a.title_zh,
      a.summary_en,
      a.summary_zh,
      a.author,
      ${avatarSelect},
      a.url,
      a.published_at,
      a.translation_status,
      a.translated_chars,
      COALESCE(a.translation_job_status, a.status, 'ready') AS status,
      a.publish_status,
      a.submitted_by,
      a.read_status,
      CASE
        WHEN NULLIF(LENGTH(COALESCE(a.content_zh, '')), 0) IS NOT NULL THEN ROUND(
          LEAST(
            100,
            GREATEST(
              0,
              (COALESCE(rp.scroll_position, 0)::numeric / NULLIF(LENGTH(COALESCE(a.content_zh, '')), 0)::numeric) * 100
            )
          )
        )::int
        WHEN NULLIF(LENGTH(COALESCE(a.content_plain, '')), 0) IS NULL THEN 0
        ELSE ROUND(
          LEAST(
            100,
            GREATEST(
              0,
              (COALESCE(rp.scroll_position, 0)::numeric / NULLIF(LENGTH(COALESCE(a.content_plain, '')), 0)::numeric) * 100
            )
          )
        )::int
      END AS read_progress,
      LEAST(
        99,
        GREATEST(
          1,
          CEIL(
            COALESCE(
              NULLIF(LENGTH(COALESCE(a.content_zh, '')), 0),
              NULLIF(LENGTH(COALESCE(a.content_plain, '')), 0),
              1
            )::numeric / 420
          )::int
        )
      ) AS estimated_read_minutes
    FROM articles a
    LEFT JOIN reading_progress rp
      ON rp.article_id = a.id
      AND rp.user_id = $1
    WHERE ($2::text IS NULL OR a.read_status = $2)
      AND ($3::text IS NULL OR a.source_key = $3)
      AND (
        COALESCE(a.translation_job_status, a.status, 'ready') = 'ready'
        OR (COALESCE(a.translation_job_status, a.status, 'ready') = 'translating' AND a.submitted_by = $1)
      )
      AND COALESCE(a.publish_status, 'published') <> 'hidden'
      AND (
        $4::boolean = TRUE
        OR COALESCE(a.publish_status, 'published') = 'published'
        OR (COALESCE(a.translation_job_status, a.status, 'ready') = 'translating' AND a.submitted_by = $1)
      )
      AND (a.user_id IS NULL OR a.user_id = $1)
    ORDER BY ${orderClause}
  `;

  const params = [userId, filters.status, filters.author, isAdminUser];
  const { rows } = await getPool().query(sql, params);
  res.status(200).json({ articles: rows });
}

async function listArticleUrls(res, userId) {
  const sql = `
    SELECT
      a.url,
      a.source_url
    FROM articles a
    WHERE (
        COALESCE(a.translation_job_status, a.status, 'ready') = 'ready'
        OR (COALESCE(a.translation_job_status, a.status, 'ready') = 'translating' AND a.submitted_by = $1)
      )
      AND COALESCE(a.publish_status, 'published') IN ('published', 'pending_review')
      AND (a.user_id IS NULL OR a.user_id = $1)
    ORDER BY a.published_at DESC NULLS LAST, a.fetched_at DESC
  `;
  const { rows } = await getPool().query(sql, [userId]);
  res.status(200).json({ urls: rows });
}

async function getArticleById(res, id, userId) {
  const isAdminUser = userId === 'admin';
  const avatarSelect = (await hasAuthorAvatarColumn())
    ? 'a.author_avatar_url'
    : 'NULL::text AS author_avatar_url';
  const sql = `
    SELECT
      a.id,
      a.source_key,
      a.title_en,
      a.title_zh,
      a.summary_en,
      a.summary_zh,
      a.author,
      ${avatarSelect},
      a.content_en,
      a.content_plain,
      a.content_zh,
      a.translation_status,
      a.translated_chars,
      a.read_status,
      a.url,
      a.published_at,
      a.fetched_at,
      COALESCE(a.translation_job_status, a.status, 'ready') AS status,
      a.publish_status,
      a.submitted_by
    FROM articles a
    WHERE a.id = $1
      AND (
        COALESCE(a.translation_job_status, a.status, 'ready') = 'ready'
        OR (COALESCE(a.translation_job_status, a.status, 'ready') = 'translating' AND a.submitted_by = $2)
      )
      AND COALESCE(a.publish_status, 'published') <> 'hidden'
      AND (
        $3::boolean = TRUE
        OR COALESCE(a.publish_status, 'published') = 'published'
        OR (COALESCE(a.translation_job_status, a.status, 'ready') = 'translating' AND a.submitted_by = $2)
      )
      AND (a.user_id IS NULL OR a.user_id = $2)
    LIMIT 1
  `;

  const { rows } = await getPool().query(sql, [id, userId, isAdminUser]);
  if (rows.length === 0) {
    res.status(404).json({ error: 'not_found' });
    return;
  }
  res.status(200).json(rows[0]);
}

async function deleteHiddenArticle(res, articleId, userId) {
  if (!isOpenClaw(userId)) {
    res.status(403).json({ error: 'forbidden' });
    return;
  }

  const { rows } = await getPool().query(
    `
      SELECT id, publish_status
      FROM articles a
      WHERE id = $1
        AND (a.user_id IS NULL OR a.user_id = $2)
      LIMIT 1
    `,
    [articleId, userId]
  );

  if (!rows.length) {
    res.status(404).json({ error: 'not_found' });
    return;
  }

  if (rows[0].publish_status !== 'hidden') {
    res.status(403).json({ error: 'forbidden', message: 'only hidden can be deleted' });
    return;
  }

  await getPool().query('DELETE FROM articles WHERE id = $1', [articleId]);
  res.status(200).json({ success: true });
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'DELETE') {
    res.setHeader('Allow', 'GET, DELETE');
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  const userId = await getUserId(req, res);
  if (!userId) return;

  try {
    const query = readQuery(req);
    if (isUrlsEndpoint(query.pathname)) {
      await listArticleUrls(res, userId);
      return;
    }
    const routeId = getPathId(query.pathname);
    const id = query.id || routeId;

    if (req.method === 'DELETE') {
      if (!id) {
        res.status(400).json({ error: 'bad_request', message: 'missing article id' });
        return;
      }
      await deleteHiddenArticle(res, id, userId);
      return;
    }

    if (id) {
      await getArticleById(res, id, userId);
      return;
    }

    await listArticles(res, query, userId);
  } catch (err) {
    console.error('[api/articles] error', err);
    res.status(500).json({ error: 'internal_error' });
  }
}
