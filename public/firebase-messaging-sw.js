/* MyCashback service worker: offline app shell + Firebase Cloud Messaging.
 *
 * Served by app.js at <BASE_URL>/firebase-messaging-sw.js with
 *   self.__FIREBASE_CONFIG (or null) and self.__BASE_URL
 * prepended, so FCM is initialised on every worker start — not only after a
 * page posts its config (the old approach lost push handling whenever the
 * browser recycled the worker).
 *
 * Caching:
 *   - /static/*  : stale-while-revalidate (URLs are content-hashed via ?v=)
 *   - pages      : network-first, cached copy when offline
 *   - /api/*     : network only (never serve stale money numbers)
 */
/* eslint-env serviceworker */
/* global firebase */

const VERSION = 'v2.0.0';
const STATIC_CACHE = 'mcb-static-' + VERSION;
const PAGE_CACHE = 'mcb-pages-' + VERSION;
const SCOPE = self.registration.scope;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => cache.addAll([SCOPE + 'static/icons/icon-192.png']).catch(() => {}))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== STATIC_CACHE && k !== PAGE_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || !req.url.startsWith(SCOPE)) return;
  const rel = req.url.slice(SCOPE.length);

  if (rel.startsWith('api/') || rel.startsWith('auth/')) return; // network only

  if (rel.startsWith('static/')) {
    event.respondWith(caches.open(STATIC_CACHE).then(async (cache) => {
      const cached = await cache.match(req);
      const fetching = fetch(req).then((res) => {
        if (res && res.status === 200) cache.put(req, res.clone()).catch(() => {});
        return res;
      }).catch(() => cached);
      return cached || fetching;
    }));
    return;
  }

  if (req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html')) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.status === 200 && !res.redirected) {
            const copy = res.clone();
            caches.open(PAGE_CACHE).then((c) => c.put(req, copy)).catch(() => {});
          }
          return res;
        })
        .catch(() => caches.match(req).then((r) => r || caches.match(SCOPE) || new Response(
          '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
          + '<body style="font-family:system-ui;padding:32px;text-align:center;color:#334155">'
          + '<h1 style="font-size:20px">目前離線</h1><p>請確認網路連線後重新整理。</p></body>',
          { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
        )))
    );
  }
});

// ─── Push ───
const ICON = SCOPE + 'static/icons/icon-192.png';

if (self.__FIREBASE_CONFIG) {
  try {
    importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js');
    importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js');
    firebase.initializeApp(self.__FIREBASE_CONFIG);
    const messaging = firebase.messaging();
    // Notification payloads are shown by the SDK automatically; this covers
    // data-only messages.
    messaging.onBackgroundMessage((payload) => {
      if (payload.notification) return;
      const data = payload.data || {};
      if (!data.title) return;
      self.registration.showNotification(data.title, { body: data.body || '', icon: ICON, badge: ICON, data });
    });
  } catch (err) {
    // Push is optional; the offline shell still works.
  }
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  const fcm = data.FCM_MSG && data.FCM_MSG.data;
  const target = (fcm && fcm.url) || data.url || SCOPE;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if (client.url.startsWith(SCOPE) && 'focus' in client) {
          client.navigate(new URL(target, SCOPE).href).catch(() => {});
          return client.focus();
        }
      }
      return self.clients.openWindow(new URL(target, SCOPE).href);
    })
  );
});
