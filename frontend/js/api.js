const API_SECRET = '8a40444901904981d2da474df1102be07ed384ae1badc9eb041ccaa6e51e2633';

function buildHeaders() {
  const secret = API_SECRET;
  if (!secret) {
    throw new Error('Missing API secret, please set API_SECRET in frontend/js/api.js');
  }

  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${secret}`
  };
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
    // Progress fetch failure should not block article reading.
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

export async function getHighlights(articleId) {
  const url = articleId
    ? `/api/highlights?article_id=${encodeURIComponent(articleId)}`
    : '/api/highlights';
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
