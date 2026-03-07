const API_SECRET = 'REPLACE_WITH_YOUR_API_SECRET';

function buildHeaders() {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${API_SECRET}`
  };
}

async function requestJson(path) {
  const res = await fetch(path, { headers: buildHeaders() });
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
