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
      ADD COLUMN IF NOT EXISTS publish_status VARCHAR(20)
      NOT NULL DEFAULT 'published'
      CHECK (publish_status IN ('published', 'pending_review', 'hidden'))
    `);

    await client.query(`
      UPDATE articles
      SET publish_status = 'hidden'
      WHERE hidden_at IS NOT NULL
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_articles_publish_status
      ON articles(publish_status, published_at DESC)
    `);

    // Keep the unique constraint index (users_invite_code_key), drop the duplicate custom index.
    await client.query('DROP INDEX IF EXISTS idx_users_invite_code');

    await client.query('COMMIT');
    console.log('[migrate-publish-status] done');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
    await getPool().end();
  }
}

main().catch((err) => {
  console.error('[migrate-publish-status] failed', err);
  process.exit(1);
});
