import dotenv from 'dotenv';
import { Pool } from 'pg';
import { MANUAL_AUTHOR_AVATAR_URLS, SOURCE_AVATAR_URLS } from './avatar-config.js';

dotenv.config({ path: '.env.local' });

async function main() {
  const connectionString = process.env.NEON_DATABASE_URL;
  if (!connectionString) {
    throw new Error('Missing NEON_DATABASE_URL');
  }
  const pool = new Pool({ connectionString, ssl: { rejectUnauthorized: false } });
  try {
    await pool.query(`
      ALTER TABLE articles
      ADD COLUMN IF NOT EXISTS author_avatar_url TEXT
    `);

    for (const [sourceKey, avatarUrl] of Object.entries(SOURCE_AVATAR_URLS)) {
      await pool.query(
        `
          UPDATE articles
          SET author_avatar_url = $2
          WHERE source_key = $1
            AND (author_avatar_url IS NULL OR author_avatar_url = '')
        `,
        [sourceKey, avatarUrl]
      );
    }

    for (const [author, avatarUrl] of Object.entries(MANUAL_AUTHOR_AVATAR_URLS)) {
      await pool.query(
        `
          UPDATE articles
          SET author_avatar_url = $2
          WHERE source_key = 'manual'
            AND author = $1
            AND (author_avatar_url IS NULL OR author_avatar_url = '')
        `,
        [author, avatarUrl]
      );
    }

    console.log('migrate-author-avatar-url done');
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error('[migrate-author-avatar-url] failed:', err.message);
  process.exit(1);
});
