import bcrypt from 'bcrypt';
import { Pool } from 'pg';
import dotenv from 'dotenv';
import { ensureUsersTable, generateUid, getUserByAccount, getUserByUid, signAuthToken } from '../_utils/auth.js';

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

function normalizeNickname(value) {
  const trimmed = String(value || '').trim();
  if (!trimmed) return null;
  const charLen = [...trimmed].length;
  if (charLen < 1 || charLen > 20) return null;
  return trimmed;
}

function defaultNicknameFromAccount(account) {
  const text = normalizeAccount(account);
  if (!text) return '用户';
  if (text.includes('@')) {
    const prefix = text.split('@')[0].trim();
    return prefix || '用户';
  }
  return text.slice(0, 6) || '用户';
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
    const userIdRaw = String(req.body?.user_id || '').trim();
    const nicknameInput = req.body?.nickname;
    const nickname = normalizeNickname(nicknameInput);

    if (!account) {
      res.status(400).json({ error: 'bad_request', message: '账号不能为空' });
      return;
    }
    if (!password || password.length < 6) {
      res.status(400).json({ error: 'bad_request', message: '密码至少6位' });
      return;
    }
    if (nicknameInput !== undefined && nickname === null) {
      res.status(400).json({ error: 'bad_request', message: '昵称长度需为 1-20 字' });
      return;
    }

    const existed = await getUserByAccount(account);
    if (existed) {
      res.status(409).json({ error: 'account_exists', message: '该账号已注册' });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const userId = userIdRaw || generateUid();
    const finalNickname = nickname || defaultNicknameFromAccount(account);
    const existingUser = await getUserByUid(userId);

    if (existingUser) {
      await getPool().query(
        `UPDATE users
         SET account = $1,
             password_hash = $2,
             nickname = COALESCE(NULLIF($3, ''), nickname),
             source = CASE WHEN source = 'guest_auto' THEN 'account_bind' ELSE source END,
             last_seen_at = NOW()
         WHERE id = $4`,
        [account, passwordHash, finalNickname, userId]
      );
    } else {
      await getPool().query(
        `INSERT INTO users (id, nickname, contact, account, password_hash, invite_code, source, legacy_user_id, register_ip, last_seen_at)
         VALUES ($1, $2, NULL, $3, $4, NULL, 'account_register', $1, NULL, NOW())`,
        [userId, finalNickname, account, passwordHash]
      );
    }

    const token = signAuthToken({ uid: userId, user_id: userId });
    res.status(200).json({
      success: true,
      data: {
        user_id: userId,
        nickname: finalNickname,
        token
      }
    });
  } catch (err) {
    if (err?.code === '23505') {
      res.status(409).json({ error: 'account_exists', message: '该账号已注册' });
      return;
    }
    console.error('[api/auth/register] error', err);
    res.status(500).json({ error: 'internal_error' });
  }
}
