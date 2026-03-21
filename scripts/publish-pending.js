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

async function main() {
  const sql = `
    UPDATE articles
    SET publish_status = 'published',
        hidden_reason = NULL,
        hidden_at = NULL
    WHERE publish_status = 'pending_review'
      AND fetched_at <= NOW() - interval '4 hours'
    RETURNING id
  `;

  const { rows } = await getPool().query(sql);
  console.log(`[publish-pending] published=${rows.length}`);
  await getPool().end();
}

main().catch((err) => {
  console.error('[publish-pending] failed', err);
  process.exit(1);
});
