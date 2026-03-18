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
