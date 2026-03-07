const SW_VERSION = 'v1';
const STATIC_CACHE = `readwise-static-${SW_VERSION}`;
const LIST_CACHE = `readwise-list-${SW_VERSION}`;
const ARTICLE_CACHE = `readwise-article-${SW_VERSION}`;

const STATIC_ASSETS = ['/', '/index.html', '/css/reader.css', '/js/app.js', '/js/api.js', '/js/reader.js'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(STATIC_ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => ![STATIC_CACHE, LIST_CACHE, ARTICLE_CACHE].includes(key))
          .map((key) => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

function isArticleListRequest(url) {
  return url.pathname === '/api/articles';
}

function isArticleDetailRequest(url) {
  return /^\/api\/articles\/.+/.test(url.pathname);
}

function isImageRequest(request) {
  return request.destination === 'image';
}

async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response && response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  } catch (_) {
    const cached = await cache.match(request);
    return cached || new Response(JSON.stringify({ error: 'offline' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

async function cacheFirstWithBackgroundUpdate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);

  const networkPromise = fetch(request)
    .then((response) => {
      if (response && response.ok) {
        cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => null);

  if (cached) {
    networkPromise.catch(() => null);
    return cached;
  }

  const networkResponse = await networkPromise;
  if (networkResponse) {
    return networkResponse;
  }

  return new Response(JSON.stringify({ error: 'offline' }), {
    status: 503,
    headers: { 'Content-Type': 'application/json' }
  });
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== 'GET') {
    return;
  }

  if (url.origin !== self.location.origin) {
    return;
  }

  if (isImageRequest(request)) {
    return;
  }

  if (isArticleListRequest(url)) {
    event.respondWith(networkFirst(request, LIST_CACHE));
    return;
  }

  if (isArticleDetailRequest(url)) {
    event.respondWith(cacheFirstWithBackgroundUpdate(request, ARTICLE_CACHE));
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => cached || fetch(request).catch(() => cached))
  );
});
