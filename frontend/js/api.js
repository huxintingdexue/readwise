const INVITE_CODE_KEY = 'inviteCode';
const USER_ID_KEY = 'userId';
const UID_KEY = 'uid';

function getInviteCode() {
  return localStorage.getItem(INVITE_CODE_KEY) || '';
}

function getUid() {
  return localStorage.getItem(UID_KEY) || '';
}

function buildHeaders() {
  const headers = {
    'Content-Type': 'application/json'
  };

  const uid = getUid();
  if (uid) {
    headers['X-Uid'] = uid;
  }

  const inviteCode = getInviteCode();
  if (inviteCode) {
    headers['X-Invite-Code'] = inviteCode;
  }

  return headers;
}

async function requestJson(path, options = {}) {
  const res = await fetch(path, {
    method: options.method || 'GET',
    headers: buildHeaders(),
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    const message = data?.message || data?.error || `Request failed: ${res.status}`;
    throw new Error(message);
  }

  return data;
}

function clearSessionStorageCache() {
  try {
    Object.keys(sessionStorage).forEach((key) => {
      if (key.startsWith('rw:article-list-cache:') || key.startsWith('rw:article-detail:')) {
        sessionStorage.removeItem(key);
      }
    });
  } catch (_) {}
}

export function getStoredUid() {
  return getUid();
}

export function getStoredInviteCode() {
  return getInviteCode();
}

export function getStoredUserId() {
  return localStorage.getItem(USER_ID_KEY) || '';
}

export function setUid(uid) {
  const normalized = String(uid || '').trim();
  if (!normalized) return;
  localStorage.setItem(UID_KEY, normalized);
}

export function setLegacyAuth(inviteCode, userId) {
  const code = String(inviteCode || '').trim();
  const legacyUserId = String(userId || '').trim();
  if (code) {
    localStorage.setItem(INVITE_CODE_KEY, code);
  }
  if (legacyUserId) {
    localStorage.setItem(USER_ID_KEY, legacyUserId);
  }
}

export function clearLegacyAuth() {
  localStorage.removeItem(INVITE_CODE_KEY);
  localStorage.removeItem(USER_ID_KEY);
}

export function isLoggedIn() {
  return Boolean(getUid() || (getInviteCode() && localStorage.getItem(USER_ID_KEY)));
}

export async function registerUser(nickname, inviteCode = '', contact = '') {
  const data = await requestJson('/api/user/register', {
    method: 'POST',
    body: { nickname, inviteCode, contact }
  });
  const uid = String(data?.data?.uid || '').trim();
  if (!data?.success || !uid) {
    throw new Error(data?.message || 'register failed');
  }
  setUid(uid);
  return uid;
}

export async function migrateLegacyUser(inviteCode) {
  const code = String(inviteCode || '').trim();
  if (!code) throw new Error('missing inviteCode');
  const data = await requestJson('/api/user/migrate', {
    method: 'POST',
    body: { inviteCode: code }
  });
  const uid = String(data?.data?.uid || '').trim();
  if (!uid) {
    throw new Error(data?.message || 'migrate failed');
  }
  setUid(uid);
  return uid;
}

export async function getCurrentUser() {
  const data = await requestJson('/api/user/me');
  return data?.data || null;
}

export async function updateUserProfile(payload) {
  const data = await requestJson('/api/user/profile', {
    method: 'PATCH',
    body: payload
  });
  return data?.data || null;
}

export async function login(inviteCode) {
  const code = String(inviteCode || '').trim();
  if (!code) {
    throw new Error('invite code required');
  }
  const data = await requestJson('/api/auth/verify', {
    method: 'POST',
    body: { inviteCode: code }
  });
  if (!data?.success || !data?.userId) {
    throw new Error(data?.message || 'invalid invite code');
  }
  setLegacyAuth(code, data.userId);
  return data;
}

export function logout() {
  localStorage.removeItem(UID_KEY);
  clearLegacyAuth();
  clearSessionStorageCache();
  window.location.reload();
}

function toQuery(params) {
  const usp = new URLSearchParams();
  Object.entries(params || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      usp.set(key, value);
    }
  });
  return usp.toString();
}

export async function getArticles(params = {}) {
  const query = toQuery(params);
  const path = query ? `/api/articles?${query}` : '/api/articles';
  const data = await requestJson(path);
  return data.articles || [];
}

export async function getArticleById(id) {
  if (!id) {
    throw new Error('Missing article id');
  }
  return requestJson(`/api/articles/${encodeURIComponent(id)}`);
}

export async function getReadingProgress(articleId) {
  if (!articleId) {
    return { article_id: null, scroll_position: 0, last_read_at: null };
  }
  try {
    const data = await requestJson(`/api/reading-progress?article_id=${encodeURIComponent(articleId)}`);
    return {
      article_id: data.article_id || articleId,
      scroll_position: Number(data.scroll_position || 0),
      last_read_at: data.last_read_at || null
    };
  } catch (_) {
    return { article_id: articleId, scroll_position: 0, last_read_at: null };
  }
}

export async function saveReadingProgress(articleId, scrollPosition) {
  if (!articleId) {
    throw new Error('Missing article id');
  }
  const normalized = Math.max(0, Number.parseInt(String(scrollPosition || 0), 10) || 0);
  return requestJson('/api/reading-progress', {
    method: 'POST',
    body: {
      article_id: articleId,
      scroll_position: normalized
    }
  });
}

export function saveReadingProgressKeepalive(articleId, scrollPosition) {
  if (!articleId) {
    return;
  }
  const normalized = Math.max(0, Number.parseInt(String(scrollPosition || 0), 10) || 0);
  fetch('/api/reading-progress', {
    method: 'POST',
    headers: buildHeaders(),
    body: JSON.stringify({
      article_id: articleId,
      scroll_position: normalized
    }),
    keepalive: true
  }).catch(() => {});
}

export async function getHighlights(articleId, options = {}) {
  const includeOthers = options.includeOthers === true;
  const query = toQuery({
    article_id: articleId || '',
    include_others: includeOthers ? '1' : ''
  });
  const url = query ? `/api/highlights?${query}` : '/api/highlights';
  const data = await requestJson(url);
  return data.highlights || [];
}

export async function createHighlight(payload) {
  return requestJson('/api/highlights', {
    method: 'POST',
    body: payload
  });
}

export async function postQa(payload) {
  return requestJson('/api/qa', {
    method: 'POST',
    body: payload
  });
}

export async function postSearchReference(payload) {
  return requestJson('/api/search-reference', {
    method: 'POST',
    body: payload
  });
}

export async function getQaRecords(articleId) {
  const url = articleId
    ? `/api/qa?article_id=${encodeURIComponent(articleId)}`
    : '/api/qa';
  const data = await requestJson(url);
  return data.records || [];
}

export async function getReadingList(status) {
  const url = status ? `/api/reading-list?status=${encodeURIComponent(status)}` : '/api/reading-list';
  const data = await requestJson(url);
  return data.items || [];
}

export async function postFeedback(content) {
  const userId = localStorage.getItem(USER_ID_KEY) || '';
  return requestJson('/api/feedback', {
    method: 'POST',
    body: { content, userId }
  });
}

export async function getFeedback() {
  const data = await requestJson('/api/feedback');
  return data.items || [];
}

export async function getAdminStats() {
  const data = await requestJson('/api/admin/stats');
  return data || {};
}

export async function getInviteCodes() {
  const data = await requestJson('/api/admin/invite-codes');
  return data.items || [];
}

export async function addInviteCode(code, userId) {
  return requestJson('/api/admin/invite-codes', {
    method: 'POST',
    body: { code, userId }
  });
}

export async function getHiddenArticles() {
  const data = await requestJson('/api/admin/articles?status=hidden');
  return data.items || [];
}

export async function updateAdminArticleStatus(articleId, status, hiddenReason = '') {
  if (!articleId) {
    throw new Error('Missing article id');
  }
  return requestJson(`/api/admin/articles/${encodeURIComponent(articleId)}`, {
    method: 'PATCH',
    body: {
      status,
      hidden_reason: hiddenReason
    }
  });
}

export async function ingestUrl(url) {
  return requestJson('/api/ingest', {
    method: 'POST',
    body: { url }
  });
}

export async function translateIngestStep(articleId) {
  return requestJson('/api/ingest', {
    method: 'POST',
    body: { action: 'translate', article_id: articleId }
  });
}

export function trackEvent(event, articleId) {
  requestJson('/api/events', {
    method: 'POST',
    body: {
      event,
      article_id: articleId || null
    }
  }).catch(() => {});
}
