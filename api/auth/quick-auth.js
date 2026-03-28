import dotenv from 'dotenv';
import { Pool } from 'pg';
import {
  ensureUsersTable,
  generateUid,
  getClientIp,
  getUserByAccount,
  getUserByInviteCode,
  getUserByUid,
  getUserIdFromInviteCode,
  signAuthToken
} from '../_utils/auth.js';

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

function normalizeInviteCode(value) {
  return String(value || '').trim();
}

function normalizeId(value) {
  return String(value || '').trim();
}

async function resolveLegacyUserIdByInvite(inviteCode) {
  const code = normalizeInviteCode(inviteCode);
  if (!code) return { legacyUserId: '', inviteFound: false };

  const inviteUser = await getUserByInviteCode(code);
  if (inviteUser) {
    const mapped = normalizeId(inviteUser.legacy_user_id || inviteUser.id);
    if (mapped) {
      return { legacyUserId: mapped, inviteFound: true };
    }
  }

  const mappedFromCodes = normalizeId(await getUserIdFromInviteCode(code));
  return {
    legacyUserId: mappedFromCodes,
    inviteFound: Boolean(mappedFromCodes)
  };
}

async function resolveLegacyUserIdByIp(clientIp, excludeIds = []) {
  const ip = String(clientIp || '').trim();
  if (!ip) return '';
  const excluded = new Set(excludeIds.map((item) => normalizeId(item)).filter(Boolean));
  const candidates = new Set();

  const append = (value) => {
    const normalized = normalizeId(value);
    if (!normalized) return;
    if (excluded.has(normalized)) return;
    candidates.add(normalized);
  };

  const byUsers = await getPool().query(
    `
      SELECT DISTINCT COALESCE(NULLIF(legacy_user_id, ''), id) AS mapped_user_id
      FROM users
      WHERE register_ip = $1
      ORDER BY mapped_user_id ASC
    `,
    [ip]
  );
  byUsers.rows.forEach((row) => append(row.mapped_user_id));

  try {
    const byEvents = await getPool().query(
      `
        SELECT DISTINCT user_id
        FROM events
        WHERE client_ip = $1
          AND user_id IS NOT NULL
          AND TRIM(user_id) <> ''
        ORDER BY user_id ASC
      `,
      [ip]
    );
    byEvents.rows.forEach((row) => append(row.user_id));
  } catch (_) {
    // events 表在部分环境可能不存在，不阻断登录流程
  }

  if (candidates.size !== 1) return '';
  return [...candidates][0] || '';
}

async function resolveBindLegacyUserId({ inviteCode, clientIp, excludeIds }) {
  const inviteResult = await resolveLegacyUserIdByInvite(inviteCode);
  if (normalizeInviteCode(inviteCode)) {
    if (!inviteResult.inviteFound) {
      return { legacyUserId: '', source: 'invite_invalid' };
    }
    return { legacyUserId: inviteResult.legacyUserId, source: 'invite' };
  }

  const fromIp = await resolveLegacyUserIdByIp(clientIp, excludeIds);
  if (!fromIp) return { legacyUserId: '', source: '' };
  return { legacyUserId: fromIp, source: 'ip' };
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
    const inviteCode = normalizeInviteCode(req.body?.invite_code);
    const nickname = normalizeNickname(req.body?.nickname);
    const clientIp = getClientIp(req);

    if (!isValidAccount(account)) {
      res.status(400).json({ error: 'bad_request', message: '请输入邮箱或11位手机号' });
      return;
    }

    const existed = await getUserByAccount(account);
    const excludeIds = existed
      ? [userIdRaw, existed.id, existed.legacy_user_id]
      : [userIdRaw];
    const bindTarget = await resolveBindLegacyUserId({
      inviteCode,
      clientIp,
      excludeIds
    });
    if (bindTarget.source === 'invite_invalid') {
      res.status(400).json({ error: 'bad_request', message: '邀请码无效' });
      return;
    }

    if (existed) {
      await migrateReadingProgressToAccount(userIdRaw, existed.id);
      const shouldBindLegacy = !normalizeId(existed.legacy_user_id) && normalizeId(bindTarget.legacyUserId);
      if (shouldBindLegacy) {
        await getPool().query(
          'UPDATE users SET legacy_user_id = $1, source = CASE WHEN source = $2 THEN $3 ELSE source END WHERE id = $4',
          [bindTarget.legacyUserId, 'account_register', 'account_bind', existed.id]
        );
      }
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
    const resolvedLegacyUserId = normalizeId(bindTarget.legacyUserId || uid);
    const finalNickname = (existingByUid?.nickname || nickname || defaultNicknameFromAccount(account)).trim();

    if (existingByUid) {
      await getPool().query(
        `UPDATE users
         SET account = $1,
             nickname = COALESCE(NULLIF(nickname, ''), $2),
             legacy_user_id = COALESCE(NULLIF(legacy_user_id, ''), $3),
             source = CASE WHEN source = 'guest_auto' THEN 'account_bind' ELSE source END,
             last_seen_at = NOW()
         WHERE id = $4`,
        [account, finalNickname, resolvedLegacyUserId, uid]
      );
    } else {
      await getPool().query(
        `INSERT INTO users (id, nickname, contact, account, password_hash, invite_code, source, legacy_user_id, register_ip, last_seen_at)
         VALUES ($1, $2, NULL, $3, NULL, NULL, 'account_register', $4, $5, NOW())`,
        [uid, finalNickname, account, resolvedLegacyUserId, clientIp]
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
