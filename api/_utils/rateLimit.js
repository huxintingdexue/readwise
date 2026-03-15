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

export async function checkRateLimit(userId, action, limit) {
  if (!userId) {
    return { allowed: false, remaining: 0 };
  }

  const baseSql = `
    SELECT COUNT(*)::int AS count
    FROM qa_records
    WHERE user_id = $1
      AND created_at >= date_trunc('day', now())
      AND created_at < date_trunc('day', now()) + interval '1 day'
  `;

  const sql = action === 'reference'
    ? `${baseSql} AND answer_summary LIKE '__reference__:%'`
    : baseSql;

  const { rows } = await getPool().query(sql, [userId]);
  const count = rows[0]?.count ?? 0;
  const remaining = Math.max(0, limit - count);
  if (count >= limit) {
    return { allowed: false, remaining: 0 };
  }
  return { allowed: true, remaining };
}
