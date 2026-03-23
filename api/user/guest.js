import dotenv from 'dotenv';
import { Pool } from 'pg';
import { ensureUsersTable, generateUid, getClientIp, getUserByUid } from '../_utils/auth.js';

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

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  try {
    await ensureUsersTable();

    const headerUid = String(req.headers['x-uid'] || '').trim();
    if (headerUid) {
      const existing = await getUserByUid(headerUid);
      if (existing) {
        res.status(200).json({ success: true, data: { uid: existing.id, source: existing.source || 'guest_auto' } });
        return;
      }
    }

    const uid = generateUid();
    const registerIp = getClientIp(req);
    await getPool().query(
      `
        INSERT INTO users (id, nickname, contact, invite_code, source, legacy_user_id, register_ip)
        VALUES ($1, NULL, NULL, NULL, 'guest_auto', $1, $2)
      `,
      [uid, registerIp || null]
    );

    res.status(200).json({ success: true, data: { uid, source: 'guest_auto' } });
  } catch (err) {
    console.error('[api/user/guest] error', err);
    res.status(500).json({ error: 'internal_error' });
  }
}

