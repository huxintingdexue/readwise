import dotenv from 'dotenv';
import { Pool } from 'pg';
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
  if (text.includes('@')) return text.split('@')[0]?.trim() || '用户';
  return text.slice(0, 6) || '用户';
}

function isValidAccount(account) {
  if (!account) return false;
  if (/^\d{11}$/.test(account)) return true;
  if (account.includes('@')) return true;
  return false;
}

async function migrateReadingProgressToAccount(fromUserId, toUserId) {
  const fromId = String(fromUserId || '').trim();
  const toId = String(toUserId || '').trim();
  if (!fromId || !toId || fromId === toId) return;

  await getPool().query(
    `
      INSERT INTO reading_progress (article_id, user_id, scroll_position, last_read_at)
      SELECT article_id, $2, scroll_position, last_read_at
      FROM reading_progress
      WHERE user_id = $1
      ON CONFLICT (article_id, user_id) DO UPDATE SET
        scroll_position = GREATEST(reading_progress.scroll_position, EXCLUDED.scroll_position),
        last_read_at = GREATEST(reading_progress.last_read_at, EXCLUDED.last_read_at)
    `,
    [fromId, toId]
  );
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
    const userIdRaw = String(req.body?.user_id || '').trim();
    const nickname = normalizeNickname(req.body?.nickname);

    if (!isValidAccount(account)) {
      res.status(400).json({ error: 'bad_request', message: '请输入邮箱或11位手机号' });
      return;
    }

    const existed = await getUserByAccount(account);
    if (existed) {
      await migrateReadingProgressToAccount(userIdRaw, existed.id);
      await getPool().query('UPDATE users SET last_seen_at = NOW() WHERE id = $1', [existed.id]);
      const token = signAuthToken({ uid: existed.id, user_id: existed.id });
      res.status(200).json({
        success: true,
        data: {
          mode: 'login',
          user_id: existed.id,
          nickname: existed.nickname || defaultNicknameFromAccount(account),
          token
        }
      });
      return;
    }

    const uid = userIdRaw || generateUid();
    const existingByUid = await getUserByUid(uid);
    const finalNickname = (existingByUid?.nickname || nickname || defaultNicknameFromAccount(account)).trim();

    if (existingByUid) {
      await getPool().query(
        `UPDATE users
         SET account = $1,
             nickname = COALESCE(NULLIF(nickname, ''), $2),
             source = CASE WHEN source = 'guest_auto' THEN 'account_bind' ELSE source END,
             last_seen_at = NOW()
         WHERE id = $3`,
        [account, finalNickname, uid]
      );
    } else {
      await getPool().query(
        `INSERT INTO users (id, nickname, contact, account, password_hash, invite_code, source, legacy_user_id, register_ip, last_seen_at)
         VALUES ($1, $2, NULL, $3, NULL, NULL, 'account_register', $1, NULL, NOW())`,
        [uid, finalNickname, account]
      );
    }

    const token = signAuthToken({ uid, user_id: uid });
    res.status(200).json({
      success: true,
      data: {
        mode: 'register',
        user_id: uid,
        nickname: finalNickname,
        token
      }
    });
  } catch (err) {
    if (err?.code === '23505') {
      const existed = await getUserByAccount(req.body?.account);
      if (existed) {
        const token = signAuthToken({ uid: existed.id, user_id: existed.id });
        res.status(200).json({
          success: true,
          data: {
            mode: 'login',
            user_id: existed.id,
            nickname: existed.nickname || null,
            token
          }
        });
        return;
      }
    }
    console.error('[api/auth/quick-auth] error', err);
    res.status(500).json({ error: 'internal_error' });
  }
}
