import dotenv from 'dotenv';
import { Pool } from 'pg';

dotenv.config({ path: '.env.local' });

// 2026-10-25 主编要求只要最近两周的内容。把编辑室重建后（2026-10-24 16:30 UTC 起）入库、
// 但发布时间早于 14 天前的文章隐藏（可在管理台恢复）。默认只预览，DRY_RUN=0 才写库。
const DRY_RUN = process.env.DRY_RUN !== '0';
const REASON = '超过两周的旧内容，按主编要求下架（2026-10-25）';

async function main() {
  const pool = new Pool({ connectionString: process.env.NEON_DATABASE_URL, ssl: { rejectUnauthorized: false } });
  try {
    const { rows } = await pool.query(`
      SELECT id, title_zh, author, source_key, publish_status, published_at
      FROM articles
      WHERE fetched_at >= '2026-10-24T16:30:00Z'
        AND published_at < NOW() - interval '14 days'
        AND publish_status <> 'hidden'
      ORDER BY published_at
    `);
    console.log(`[hide-old] mode=${DRY_RUN ? 'DRY_RUN' : 'WRITE'} count=${rows.length}`);
    for (const row of rows) {
      console.log(`[hide-old] ${String(row.published_at?.toISOString?.() || row.published_at).slice(0, 10)} ${row.publish_status} ${row.author} | ${row.title_zh}`);
    }
    if (!DRY_RUN && rows.length) {
      const { rowCount } = await pool.query(
        "UPDATE articles SET publish_status = 'hidden', hidden_reason = $2, hidden_at = NOW() WHERE id = ANY($1::uuid[])",
        [rows.map((row) => row.id), REASON]
      );
      console.log(`[hide-old] hidden=${rowCount}`);
    }
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error('[hide-old] failed', err);
  process.exit(1);
});
