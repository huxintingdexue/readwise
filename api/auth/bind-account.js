import bcrypt from 'bcrypt';
import { Pool } from 'pg';
import dotenv from 'dotenv';
import { ensureUsersTable, getUserByAccount, getUserByUid, signAuthToken } from '../_utils/auth.js';

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

function normalize(value) {
  return String(value || '').trim();
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  try {
    await ensureUsersTable();

    const userId = normalize(req.body?.user_id);
    const account = normalize(req.body?.account);
    const password = normalize(req.body?.password);

    if (!userId || !account || !password) {
      res.status(400).json({ error: 'bad_request', message: '参数不完整' });
      return;
    }
    if (password.length < 6) {
      res.status(400).json({ error: 'bad_request', message: '密码至少6位' });
      return;
    }

    const user = await getUserByUid(userId);
    if (!user) {
      res.status(404).json({ error: 'not_found', message: '用户不存在' });
      return;
    }

    const accountOwner = await getUserByAccount(account);
    if (accountOwner && accountOwner.id !== userId) {
      res.status(409).json({ error: 'account_exists', message: '该账号已被使用' });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 10);
    await getPool().query(
      `UPDATE users
       SET account = $1,
           password_hash = $2,
           source = CASE WHEN source = 'guest_auto' THEN 'account_bind' ELSE source END,
           last_seen_at = NOW()
       WHERE id = $3`,
      [account, passwordHash, userId]
    );

    const token = signAuthToken({ uid: userId, user_id: userId });
    res.status(200).json({
      success: true,
      data: {
        user_id: userId,
        nickname: user.nickname || null,
        token
      }
    });
  } catch (err) {
    if (err?.code === '23505') {
      res.status(409).json({ error: 'account_exists', message: '该账号已被使用' });
      return;
    }
    console.error('[api/auth/bind-account] error', err);
    res.status(500).json({ error: 'internal_error' });
  }
}
