import dotenv from 'dotenv';
import { Pool } from 'pg';

dotenv.config({ path: '.env.local' });

// 把 AI 编辑室（user_id = openclaw）的邀请码换成 EDITOR_INVITE_CODE。
// 新码只放在 GitHub Secret 和本机 ~/.readwise-editor.env，日志里不打印。
async function main() {
  const connectionString = process.env.NEON_DATABASE_URL;
  const code = String(process.env.EDITOR_INVITE_CODE || '').trim();
  if (!connectionString) throw new Error('Missing NEON_DATABASE_URL');
  if (code.length < 24) throw new Error('EDITOR_INVITE_CODE must be at least 24 chars');

  const pool = new Pool({ connectionString, ssl: { rejectUnauthorized: false } });
  try {
    const { rowCount } = await pool.query(
      "UPDATE invite_codes SET code = $1 WHERE user_id = 'openclaw'",
      [code]
    );
    if (rowCount === 0) {
      await pool.query("INSERT INTO invite_codes (code, user_id) VALUES ($1, 'openclaw')", [code]);
      console.log('[rotate-editor-code] inserted new code for openclaw');
    } else {
      console.log(`[rotate-editor-code] updated ${rowCount} row(s) for openclaw`);
    }
    const { rows } = await pool.query("SELECT COUNT(*)::int AS n FROM invite_codes WHERE code = 'openclaw'");
    console.log(`[rotate-editor-code] legacy plain code rows remaining: ${rows[0].n}`);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error('[rotate-editor-code] failed', err.message);
  process.exit(1);
});
