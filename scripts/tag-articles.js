import dotenv from 'dotenv';
import { Pool } from 'pg';
import { inferArticleTag } from '../api/_utils/article-tag.js';

dotenv.config({ path: '.env.local' });

const SLEEP_MS = 500;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function shortTitle(row) {
  const title = String(row.title_zh || row.title_en || row.summary_zh || '').trim();
  if (!title) return '无标题';
  return title.slice(0, 20);
}

async function main() {
  const connectionString = String(process.env.NEON_DATABASE_URL || '').trim();
  const apiKey = String(process.env.DEEPSEEK_API_KEY || '').trim();
  if (!connectionString) {
    throw new Error('Missing NEON_DATABASE_URL');
  }
  if (!apiKey) {
    throw new Error('Missing DEEPSEEK_API_KEY');
  }

  const pool = new Pool({ connectionString, ssl: { rejectUnauthorized: false } });
  try {
    const { rows } = await pool.query(
      `
        SELECT id, title_zh, title_en, summary_zh
        FROM articles
        WHERE tag IS NULL
          AND status != 'hidden'
          AND COALESCE(publish_status, 'published') != 'hidden'
          AND summary_zh IS NOT NULL
      `
    );

    console.log(`[tag-articles] pending=${rows.length}`);

    for (const row of rows) {
      const id = String(row.id || '').trim();
      const summaryZh = String(row.summary_zh || '').trim();
      if (!id || !summaryZh) continue;

      let tag = null;
      try {
        tag = await inferArticleTag(apiKey, summaryZh);
      } catch (err) {
        console.error(`[${id}] ${shortTitle(row)} → 打标失败: ${err.message}`);
      }

      if (tag) {
        await pool.query('UPDATE articles SET tag = $2 WHERE id = $1', [id, tag]);
        console.log(`[${id}] ${shortTitle(row)} → ${tag}`);
      } else {
        console.log(`[${id}] ${shortTitle(row)} → 未命中标签`);
      }

      await sleep(SLEEP_MS);
    }
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error('[tag-articles] failed:', err.message);
  process.exit(1);
});

