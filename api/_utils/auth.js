import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

let cachedInviteMap = null;
let cachedRaw = null;

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

export function getUserIdFromInviteCode(inviteCode) {
  const raw = process.env.INVITE_CODES || '';
  if (raw !== cachedRaw) {
    cachedInviteMap = parseInviteCodes(raw);
    cachedRaw = raw;
  }
  const code = String(inviteCode || '').trim();
  if (!code) return null;
  return cachedInviteMap.get(code) || null;
}

export function isAdmin(userId) {
  return userId === 'admin';
}
