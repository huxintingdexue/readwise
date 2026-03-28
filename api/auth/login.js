import bcrypt from 'bcrypt';
import { Pool } from 'pg';
import dotenv from 'dotenv';
import { ensureUsersTable, getUserByAccount, signAuthToken } from '../_utils/auth.js';

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

function normalizeAccount(value) {
  return String(value || '').trim();
}

function normalizePassword(value) {
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

    const account = normalizeAccount(req.body?.account);
    const password = normalizePassword(req.body?.password);

    if (!account || !password) {
      res.status(400).json({ error: 'bad_request', message: '账号和密码不能为空' });
      return;
    }

    const user = await getUserByAccount(account);
    const passwordHash = String(user?.password_hash || '');
    if (!user || !passwordHash) {
      res.status(401).json({ error: 'unauthorized', message: '账号或密码错误' });
      return;
    }

    const ok = await bcrypt.compare(password, passwordHash);
    if (!ok) {
      res.status(401).json({ error: 'unauthorized', message: '账号或密码错误' });
      return;
    }

    await getPool().query('UPDATE users SET last_seen_at = NOW() WHERE id = $1', [user.id]);
    const token = signAuthToken({ uid: user.id, user_id: user.id });

    res.status(200).json({
      success: true,
      data: {
        user_id: user.id,
        nickname: user.nickname || null,
        token
      }
    });
  } catch (err) {
    console.error('[api/auth/login] error', err);
    res.status(500).json({ error: 'internal_error' });
  }
}

