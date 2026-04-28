/* Service Worker for Points & Cashback Hub PWA.
 * Strategy:
 *   - HTML & API responses: network-first (always fresh, fallback to cache when offline).
 *   - Static assets (/static/*): stale-while-revalidate.
 *   - Skips ranges, non-GET, and cross-origin Firebase auth requests.
 */
const VERSION = 'v1.0.0';
const STATIC_CACHE = `static-${VERSION}`;
const RUNTIME_CACHE = `runtime-${VERSION}`;

// SW scope is whatever directory it was registered under, so paths starting
// with self.registration.scope already include BASE_URL.
const SCOPE = self.registration.scope;
const PRECACHE = [
  SCOPE, // root
  SCOPE + 'static/css/styles.css',
  SCOPE + 'static/js/common.js',
  SCOPE + 'static/icons/icon-192.png',
  SCOPE + 'static/icons/icon-512.png',
  SCOPE + 'manifest.webmanifest'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) =>
      cache.addAll(PRECACHE).catch(() => {/* offline-first install allowed */})
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys
        .filter((k) => k !== STATIC_CACHE && k !== RUNTIME_CACHE)
        .map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

function isStatic(url) {
  return url.pathname.includes('/static/');
}
function isApi(url) {
  return url.pathname.includes('/api/');
}
function sameOrigin(url) {
  return url.origin === self.location.origin;
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (!sameOrigin(url)) return; // let CDN / Firebase requests pass through

  // API: network-first
  if (isApi(url)) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(RUNTIME_CACHE).then((cache) => cache.put(req, copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match(req).then((r) => r || new Response(JSON.stringify({ error: 'OFFLINE' }), {
          status: 503, headers: { 'Content-Type': 'application/json' }
        })))
    );
    return;
  }

  // Static assets: stale-while-revalidate
  if (isStatic(url)) {
    event.respondWith(
      caches.open(STATIC_CACHE).then(async (cache) => {
        const cached = await cache.match(req);
        const fetched = fetch(req).then((res) => {
          if (res && res.status === 200) cache.put(req, res.clone()).catch(() => {});
          return res;
        }).catch(() => cached);
        return cached || fetched;
      })
    );
    return;
  }

  // HTML pages: network-first with cache fallback for offline shell
  if (req.headers.get('accept')?.includes('text/html')) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(RUNTIME_CACHE).then((cache) => cache.put(req, copy)).catch(() => {});
          return res;
        })
        .catch(() =>
          caches.match(req).then((r) => r || caches.match(SCOPE) || new Response(
            '<h1>離線中</h1><p>請連線後重試。</p>',
            { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
          ))
        )
    );
  }
});
