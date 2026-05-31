// BenzTech Service Worker — offline-first for core assets
const CACHE_NAME = 'benztech-v1.2';
const CORE_ASSETS = [
  './',
  './index.html',
  './manifest.json'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) return caches.delete(key);
        })
      )
    ).then(() => self.clients.claim())
  );
});

// Network-first for HTML, cache-first for everything else with graceful fallback
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Skip cross-origin (CDNs for Tailwind/Tesseract still need network)
  if (url.origin !== location.origin) {
    return; // Let the browser handle it normally
  }

  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) {
        // Serve cached immediately, update in background for next visit
        const update = fetch(req).then((fresh) => {
          if (fresh && fresh.ok) {
            caches.open(CACHE_NAME).then((c) => c.put(req, fresh.clone()));
          }
          return fresh;
        }).catch(() => cached);
        return cached || update;
      }

      // Not cached — try network then cache
      return fetch(req)
        .then((res) => {
          if (res && res.ok && req.method === 'GET') {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => {
          // Offline fallback for navigation
          if (req.mode === 'navigate') {
            return caches.match('./index.html');
          }
          return new Response('Offline', { status: 503, statusText: 'Offline' });
        });
    })
  );
});
