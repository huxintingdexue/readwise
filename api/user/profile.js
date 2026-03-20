import dotenv from 'dotenv';
import { Pool } from 'pg';
import { ensureUsersTable, getUserByInviteCode, resolveAuthContext } from '../_utils/auth.js';

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

function normalizeNickname(value) {
  const trimmed = String(value || '').trim();
  if (!trimmed) return null;
  const charLen = [...trimmed].length;
  if (charLen < 1 || charLen > 20) return null;
  return trimmed;
}

function normalizeContact(value) {
  const trimmed = String(value || '').trim();
  return trimmed || null;
}

export default async function handler(req, res) {
  if (req.method !== 'PATCH') {
    res.setHeader('Allow', 'PATCH');
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  try {
    await ensureUsersTable();
    const ctx = await resolveAuthContext(req, res);
    if (!ctx) return;

    let uid = ctx.uid;
    if (!uid) {
      const inviteCode = String(req.headers['x-invite-code'] || '').trim();
      const user = await getUserByInviteCode(inviteCode);
      uid = user?.id || null;
    }

    if (!uid) {
      res.status(404).json({ error: 'not_found', message: '用户不存在' });
      return;
    }

    const nicknameRaw = req.body?.nickname;
    const contactRaw = req.body?.contact;
    const payload = {};
    if (nicknameRaw !== undefined) {
      const nickname = normalizeNickname(nicknameRaw);
      if (!nickname) {
        res.status(400).json({ error: 'bad_request', message: '昵称长度需为 1-20 字' });
        return;
      }
      payload.nickname = nickname;
    }
    if (contactRaw !== undefined) {
      payload.contact = normalizeContact(contactRaw);
    }

    if (Object.keys(payload).length === 0) {
      res.status(400).json({ error: 'bad_request', message: 'nothing to update' });
      return;
    }

    const setSegments = [];
    const params = [];
    let idx = 1;
    for (const [key, value] of Object.entries(payload)) {
      setSegments.push(`${key} = $${idx++}`);
      params.push(value);
    }
    params.push(uid);

    const { rows } = await getPool().query(
      `
        UPDATE users
        SET ${setSegments.join(', ')}
        WHERE id = $${idx}
        RETURNING id, nickname, contact
      `,
      params
    );

    if (!rows[0]) {
      res.status(404).json({ error: 'not_found', message: '用户不存在' });
      return;
    }

    res.status(200).json({ success: true, data: rows[0] });
  } catch (err) {
    console.error('[api/user/profile] error', err);
    res.status(500).json({ error: 'internal_error' });
  }
}
