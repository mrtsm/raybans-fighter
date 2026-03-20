const CACHE_NAME = 'pixel-brawl-v20260320';
const PRECACHE_URLS = [
  './',
  './index.html',
  './js/engine.js',
  './js/fight.js',
  './js/fighter.js',
  './js/input.js',
  './js/ai.js',
  './js/combat.js',
  './js/renderer.js',
  './js/audio.js',
  './js/sprites.js',
  './js/ui.js',
  './js/progression.js',
  './js/scoring.js',
  './js/data.js',
];

// Install: precache core JS and HTML
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS))
  );
  self.skipWaiting();
});

// Activate: clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch: cache-first for assets, network-first for HTML
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  
  // Cache-first for sprites, music, sfx (static assets)
  if (url.pathname.match(/\.(png|mp3|jpg|webp|woff2?)$/)) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached;
        return fetch(event.request).then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        });
      })
    );
    return;
  }

  // Network-first for JS/HTML (so updates deploy quickly)
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
