// sw.js
const CACHE_NAME = 'onex-v2-0-0';
const ASSETS = [
  '/',
  '/index.html',
  '/style.css',
  '/app.js',
  '/logger.js',
  '/assistant.js',
  '/manifest.json'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(ASSETS).catch(e => console.log('Cache addAll failed', e));
    })
  );
});

self.addEventListener('fetch', event => {
  // Never cache GitHub API or external API calls — always go to network
  const url = new URL(event.request.url);
  if (url.hostname === 'api.github.com' || url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(fetch(event.request));
    return;
  }
  // Static assets: cache-first
  event.respondWith(
    caches.match(event.request).then(cached => cached || fetch(event.request))
  );
});
