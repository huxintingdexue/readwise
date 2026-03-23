import dotenv from 'dotenv';
import { Pool } from 'pg';

dotenv.config({ path: '.env.local' });

const SOURCE_AVATAR_URLS = {
  sam: '/assets/avatars/social/sam-altman.jpg',
  andrej: '/assets/avatars/social/andrej-karpathy.jpg',
  naval: '/assets/avatars/social/naval-ravikant.jpg'
};

const MANUAL_AUTHOR_AVATAR_URLS = {
  AI小编: '/assets/avatars/default.svg',
  'Peter Steinberger': '/assets/avatars/social/peter-steinberger.png',
  'Dario Amodei': '/assets/avatars/social/dario-amodei.jpg',
  'Andrej Karpathy': '/assets/avatars/social/andrej-karpathy.jpg',
  'Dan Shipper': '/assets/avatars/social/dan-shipper.jpg',
  'Fei-Fei Li': '/assets/avatars/social/fei-fei-li.jpg',
  'Hamel Husain': '/assets/avatars/social/hamel-husain.jpg',
  'Sam Altman': '/assets/avatars/social/sam-altman.jpg',
  'Simon Willison': '/assets/avatars/social/simon-willison.jpg',
  'Yann LeCun': '/assets/avatars/social/yann-lecun.jpg'
};

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
