import dotenv from 'dotenv';
import { Pool } from 'pg';
import { ensureUsersTable, generateUid, getClientIp, getUserByInviteCode } from '../_utils/auth.js';

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

async function ensureInviteTable() {
  await getPool().query(`
    CREATE TABLE IF NOT EXISTS invite_codes (
      id SERIAL PRIMARY KEY,
      code VARCHAR(50) UNIQUE NOT NULL,
      user_id VARCHAR(50) UNIQUE NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);
}

function normalizeNickname(value) {
  const trimmed = String(value || '').trim();
  const charLen = [...trimmed].length;
  if (!trimmed || charLen < 1 || charLen > 20) {
    return null;
  }
  return trimmed;
}

function normalizeContact(value) {
  const trimmed = String(value || '').trim();
  return trimmed || null;
}

async function countIpRegistrationsToday(ip) {
  if (!ip) return 0;
  const { rows } = await getPool().query(
    `
      SELECT COUNT(*)::int AS count
      FROM users
      WHERE register_ip = $1
        AND created_at >= date_trunc('day', NOW())
        AND created_at < date_trunc('day', NOW()) + interval '1 day'
    `,
    [ip]
  );
  return rows[0]?.count || 0;
}

async function registerWithInvite(nickname, contact, inviteCode) {
  await ensureInviteTable();
  const user = await getUserByInviteCode(inviteCode);
  if (!user) {
    return null;
  }
  const { rows } = await getPool().query(
    `
      UPDATE users
      SET nickname = $1,
          contact = $2
      WHERE invite_code = $3
      RETURNING id
    `,
    [nickname, contact, inviteCode]
  );
  return rows[0]?.id || null;
}

async function registerSelf(nickname, contact, registerIp) {
  const uid = generateUid();
  const { rows } = await getPool().query(
    `
      INSERT INTO users (id, nickname, contact, invite_code, source, legacy_user_id, register_ip)
      VALUES ($1, $2, $3, NULL, 'self_register', $1, $4)
      RETURNING id
    `,
    [uid, nickname, contact, registerIp || null]
  );
  return rows[0]?.id || uid;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  try {
    await ensureUsersTable();
    const nickname = normalizeNickname(req.body?.nickname);
    const contact = normalizeContact(req.body?.contact);
    const inviteCode = String(req.body?.inviteCode || '').trim();

    if (!nickname) {
      res.status(400).json({ success: false, error: 'bad_request', message: '昵称长度需为 1-20 字' });
      return;
    }

    if (inviteCode) {
      const uid = await registerWithInvite(nickname, contact, inviteCode);
      if (!uid) {
        res.status(400).json({ success: false, error: 'bad_request', message: '邀请码不正确' });
        return;
      }
      res.status(200).json({ success: true, data: { uid } });
      return;
    }

    const registerIp = getClientIp(req);
    const usedCount = await countIpRegistrationsToday(registerIp);
    if (usedCount >= 5) {
      res.status(429).json({ success: false, error: 'rate_limited', message: '今日注册次数已达上限' });
      return;
    }

    const uid = await registerSelf(nickname, contact, registerIp);
    res.status(200).json({ success: true, data: { uid } });
  } catch (err) {
    console.error('[api/user/register] error', err);
    res.status(500).json({ error: 'internal_error' });
  }
}
