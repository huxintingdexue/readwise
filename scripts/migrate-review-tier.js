import dotenv from 'dotenv';
import { Pool } from 'pg';

dotenv.config({ path: '.env.local' });

// AI 编辑室分级入库：A 直接发布 / B 4 小时后自动发布 / C 不确认不发布
// 兼容性迁移：只加可空列，旧代码不受影响，可先于代码发布执行。
async function main() {
  const connectionString = process.env.NEON_DATABASE_URL;
  if (!connectionString) {
    throw new Error('Missing NEON_DATABASE_URL');
  }
  const pool = new Pool({ connectionString, ssl: { rejectUnauthorized: false } });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`
      ALTER TABLE articles
      ADD COLUMN IF NOT EXISTS review_tier VARCHAR(1)
      CHECK (review_tier IN ('A', 'B', 'C'))
    `);
    await client.query('ALTER TABLE articles ADD COLUMN IF NOT EXISTS review_note TEXT');
    await client.query('COMMIT');
    const { rows } = await client.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'articles' AND column_name IN ('review_tier', 'review_note')
      ORDER BY column_name
    `);
    console.log('[migrate-review-tier] columns:', rows.map((row) => `${row.column_name}:${row.data_type}`).join(', '));
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error('[migrate-review-tier] failed', err);
  process.exit(1);
});
