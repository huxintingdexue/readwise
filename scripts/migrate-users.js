import dotenv from 'dotenv';
import { Pool } from 'pg';
import { ensureUsersTable, generateUid } from '../api/_utils/auth.js';

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

async function run() {
  await ensureUsersTable();

  const { rows: inviteRows } = await getPool().query(
    'SELECT code, user_id, created_at FROM invite_codes ORDER BY created_at ASC'
  );

  let inserted = 0;
  for (const row of inviteRows) {
    const uid = generateUid();
    const result = await getPool().query(
      `
        INSERT INTO users (id, nickname, contact, invite_code, source, legacy_user_id, register_ip, created_at)
        VALUES ($1, NULL, NULL, $2, 'manual_invite', $3, NULL, COALESCE($4::timestamptz, NOW()))
        ON CONFLICT (invite_code) DO NOTHING
      `,
      [uid, row.code, row.user_id, row.created_at || null]
    );
    inserted += result.rowCount || 0;
  }

  console.log(`[migrate-users] done. invite_codes=${inviteRows.length}, inserted=${inserted}`);
}

run()
  .catch((err) => {
    console.error('[migrate-users] failed', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (pool) {
      await pool.end().catch(() => {});
    }
  });
