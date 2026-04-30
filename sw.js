/*
VERSION: 2.3
⚠️ ПРИ КАЖДОМ ОБНОВЛЕНИИ УВЕЛИЧИВАЙТЕ ВЕРСИЮ
*/

const VERSION = '2.3';
const CACHE_NAME = `press-calc-v${VERSION}`;

const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './apple-touch-icon.png'
];

// ─── INSTALL ──────────────────────────────────────────────────────────────
self.addEventListener('install', (event) => {
  console.log('[SW] Установка кэша:', CACHE_NAME);

  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      for (const url of ASSETS_TO_CACHE) {
        try {
          await cache.add(url);
        } catch (err) {
          console.warn('[SW] Не удалось закэшировать:', url);
        }
      }
    })
  );

  self.skipWaiting();
});

// ─── ACTIVATE ─────────────────────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  console.log('[SW] Активация:', CACHE_NAME);

  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => {
            console.log('[SW] Удаление старого кэша:', key);
            return caches.delete(key);
          })
      )
    )
  );

  clients.claim();
});

// ─── FETCH ────────────────────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const request = event.request;

  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      const fetchPromise = fetch(request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.ok) {
            const responseClone = networkResponse.clone();

            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, responseClone);
            });
          }

          return networkResponse;
        })
        .catch(() => cachedResponse);

      return cachedResponse || fetchPromise;
    })
  );
});