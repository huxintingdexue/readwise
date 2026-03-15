import dotenv from 'dotenv';
import { Pool } from 'pg';

dotenv.config({ path: '.env.local' });

let cachedInviteMap = null;
let cachedRaw = null;
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

function parseInviteCodes(raw) {
  const map = new Map();
  if (!raw) return map;
  raw.split(',').forEach((pair) => {
    const trimmed = String(pair || '').trim();
    if (!trimmed) return;
    const [code, userId] = trimmed.split(':');
    if (!code || !userId) return;
    map.set(code.trim(), userId.trim());
  });
  return map;
}

export async function getUserIdFromInviteCode(inviteCode) {
  const raw = process.env.INVITE_CODES || '';
  if (raw !== cachedRaw) {
    cachedInviteMap = parseInviteCodes(raw);
    cachedRaw = raw;
  }
  const code = String(inviteCode || '').trim();
  if (!code) return null;

  const envMatch = cachedInviteMap.get(code);
  if (envMatch) {
    return envMatch;
  }

  try {
    const { rows } = await getPool().query(
      'SELECT user_id FROM invite_codes WHERE code = $1 LIMIT 1',
      [code]
    );
    return rows[0]?.user_id || null;
  } catch (err) {
    console.error('[auth] invite_codes lookup failed', err);
    return null;
  }
}

export function isAdmin(userId) {
  return userId === 'admin';
}
