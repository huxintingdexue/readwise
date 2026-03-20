import dotenv from 'dotenv';
import { Pool } from 'pg';
import crypto from 'crypto';

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

function getEnvInviteMap() {
  const raw = process.env.INVITE_CODES || '';
  if (raw !== cachedRaw) {
    cachedInviteMap = parseInviteCodes(raw);
    cachedRaw = raw;
  }
  return cachedInviteMap || new Map();
}

export async function ensureUsersTable() {
  await getPool().query(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      nickname TEXT,
      contact TEXT,
      invite_code TEXT UNIQUE,
      source TEXT NOT NULL DEFAULT 'self_register',
      legacy_user_id TEXT,
      register_ip TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_seen_at TIMESTAMPTZ
    )
  `);

  await getPool().query('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_invite_code ON users(invite_code)');
  await getPool().query('CREATE INDEX IF NOT EXISTS idx_users_legacy ON users(legacy_user_id)');
  await getPool().query('CREATE INDEX IF NOT EXISTS idx_users_created_at ON users(created_at)');
}

export async function getUserIdFromInviteCode(inviteCode) {
  const envInviteMap = getEnvInviteMap();
  const code = String(inviteCode || '').trim();
  if (!code) return null;

  const envMatch = envInviteMap.get(code);
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

function normalizeUid(uid) {
  return String(uid || '').trim();
}

export function generateUid() {
  return `usr_${crypto.randomBytes(9).toString('base64url').replace(/[-_]/g, '').slice(0, 12)}`;
}

async function ensureInviteUserRecord(inviteCode) {
  const code = String(inviteCode || '').trim();
  if (!code) return null;

  await ensureUsersTable();

  let legacyUserId = null;
  let inviteCreatedAt = null;

  const inviteQuery = await getPool().query(
    'SELECT code, user_id, created_at FROM invite_codes WHERE code = $1 LIMIT 1',
    [code]
  );
  const invite = inviteQuery.rows[0];
  if (invite) {
    legacyUserId = invite.user_id || null;
    inviteCreatedAt = invite.created_at || null;
  } else {
    // 兼容仅配置在 INVITE_CODES 环境变量中的老邀请码（例如 admin）。
    const envInviteMap = getEnvInviteMap();
    legacyUserId = envInviteMap.get(code) || null;
  }

  if (!legacyUserId) return null;

  let userRow = await getPool().query(
    'SELECT id, nickname, contact, invite_code, source, legacy_user_id, register_ip, created_at, last_seen_at FROM users WHERE invite_code = $1 LIMIT 1',
    [code]
  );

  if (!userRow.rows[0]) {
    const uid = generateUid();
    await getPool().query(
      `
        INSERT INTO users (id, nickname, contact, invite_code, source, legacy_user_id, register_ip, created_at)
        VALUES ($1, NULL, NULL, $2, 'manual_invite', $3, NULL, COALESCE($4::timestamptz, NOW()))
        ON CONFLICT (invite_code) DO NOTHING
      `,
      [uid, code, legacyUserId, inviteCreatedAt]
    );

    userRow = await getPool().query(
      'SELECT id, nickname, contact, invite_code, source, legacy_user_id, register_ip, created_at, last_seen_at FROM users WHERE invite_code = $1 LIMIT 1',
      [code]
    );
  }

  return userRow.rows[0] || null;
}

export async function getUserByUid(uid) {
  const normalized = normalizeUid(uid);
  if (!normalized) return null;
  await ensureUsersTable();
  const { rows } = await getPool().query(
    'SELECT id, nickname, contact, invite_code, source, legacy_user_id, register_ip, created_at, last_seen_at FROM users WHERE id = $1 LIMIT 1',
    [normalized]
  );
  return rows[0] || null;
}

export async function getUserByInviteCode(inviteCode) {
  return ensureInviteUserRecord(inviteCode);
}

export async function getLegacyUserIdFromUid(uid) {
  const row = await getUserByUid(uid);
  if (!row) return null;
  return row.legacy_user_id || row.id;
}

function updateLastSeenAt(uid) {
  const normalized = normalizeUid(uid);
  if (!normalized) return;
  getPool().query('UPDATE users SET last_seen_at = NOW() WHERE id = $1', [normalized]).catch(() => {});
}

export function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  const fromHeader = Array.isArray(forwarded) ? forwarded[0] : String(forwarded || '');
  const first = fromHeader.split(',')[0]?.trim();
  if (first) return first;
  const realIp = String(req.headers['x-real-ip'] || '').trim();
  if (realIp) return realIp;
  return '';
}

function getPathname(req) {
  try {
    const url = new URL(req.url || '/', `http://${req.headers?.host || 'localhost'}`);
    return url.pathname;
  } catch (_) {
    return '';
  }
}

export function ensureOpenClawPermission(req, res, userId) {
  if (userId !== 'openclaw') return true;

  const method = String(req.method || 'GET').toUpperCase();
  const pathname = getPathname(req);
  const allowed = (
    (method === 'POST' && pathname === '/api/ingest') ||
    (method === 'GET' && pathname === '/api/articles/urls') ||
    (method === 'DELETE' && /^\/api\/articles\/[^/]+\/?$/.test(pathname))
  );

  if (allowed) return true;

  res.status(403).json({
    success: false,
    error: 'PERMISSION_DENIED',
    message: 'openclaw 账号仅限内容入库相关操作，无权访问此接口。如需扩展权限，请联系管理员。'
  });
  return false;
}

export function isAdmin(userId) {
  return userId === 'admin';
}

export async function resolveAuthContext(req, res, options = {}) {
  const enforceOpenClaw = options.enforceOpenClaw !== false;

  const uid = normalizeUid(req.headers['x-uid']);
  if (uid) {
    const user = await getUserByUid(uid);
    if (!user) {
      res.status(401).json({ error: 'unauthorized', message: 'UID 无效' });
      return null;
    }
    const userId = user.legacy_user_id || user.id;
    if (enforceOpenClaw && !ensureOpenClawPermission(req, res, userId)) {
      return null;
    }
    updateLastSeenAt(uid);
    return {
      uid: user.id,
      userId,
      user
    };
  }

  const inviteCode = String(req.headers['x-invite-code'] || '').trim();
  if (inviteCode) {
    const userId = await getUserIdFromInviteCode(inviteCode);
    if (!userId) {
      res.status(401).json({ error: 'unauthorized', message: '邀请码无效' });
      return null;
    }
    if (enforceOpenClaw && !ensureOpenClawPermission(req, res, userId)) {
      return null;
    }
    return {
      uid: null,
      userId,
      user: null
    };
  }

  res.status(401).json({ error: 'unauthorized', message: '缺少身份凭证' });
  return null;
}

export async function resolveUserId(req, res, options = {}) {
  const ctx = await resolveAuthContext(req, res, options);
  return ctx?.userId || null;
}
