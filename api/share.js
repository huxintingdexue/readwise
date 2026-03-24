import dotenv from 'dotenv';
import { Pool } from 'pg';

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

function getPathId(pathname) {
  const match = pathname.match(/^\/api\/share\/articles\/([^/]+)\/?$/);
  return match ? decodeURIComponent(match[1]) : null;
}

function getPathname(req) {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  return url.pathname;
}

async function getSharedArticle(res, id) {
  const sql = `
    SELECT
      a.id,
      a.source_key,
      a.title_en,
      a.title_zh,
      a.summary_zh,
      a.summary_en,
      a.author,
      a.author_avatar_url,
      a.content_zh,
      a.content_plain,
      a.url,
      a.published_at
    FROM articles a
    WHERE a.id = $1
      AND COALESCE(a.translation_job_status, a.status, 'ready') = 'ready'
      AND COALESCE(a.publish_status, 'published') = 'published'
    LIMIT 1
  `;
  const { rows } = await getPool().query(sql, [id]);
  if (!rows.length) {
    res.status(404).json({ error: 'not_found' });
    return;
  }
  res.status(200).json({ article: rows[0] });
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  try {
    const pathname = getPathname(req);
    const id = getPathId(pathname);
    if (!id) {
      res.status(400).json({ error: 'bad_request', message: 'missing article id' });
      return;
    }
    await getSharedArticle(res, id);
  } catch (err) {
    console.error('[api/share] error', err);
    res.status(500).json({ error: 'internal_error' });
  }
}
