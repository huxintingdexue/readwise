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
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');

    await client.query(`
      ALTER TABLE articles
      ADD COLUMN IF NOT EXISTS translation_job_status VARCHAR(20)
      NOT NULL DEFAULT 'ready'
      CHECK (translation_job_status IN ('translating', 'ready'))
    `);

    await client.query(`
      UPDATE articles
      SET translation_job_status = COALESCE(NULLIF(status, ''), 'ready')
      WHERE translation_job_status IS DISTINCT FROM COALESCE(NULLIF(status, ''), 'ready')
    `);

    await client.query('COMMIT');
    console.log('[migrate-translation-job-status] done');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
    await getPool().end();
  }
}

main().catch((err) => {
  console.error('[migrate-translation-job-status] failed', err);
  process.exit(1);
});
