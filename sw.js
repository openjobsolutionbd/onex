// sw.js
const CACHE_NAME = 'onex-v2-0-4';
const ASSETS = [
  '/',
  '/index.html',
  '/style.css',
  '/app.js',
  '/logger.js',
  '/assistant.js',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-512-maskable.png'
];

self.addEventListener('install', event => {
  self.skipWaiting();  // নতুন version সাথে সাথে activate হোক — পুরোনো SW-এর জন্য অপেক্ষা না করে
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(ASSETS).catch(e => console.log('Cache addAll failed', e));
    })
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(names =>
      Promise.all(names.filter(n => n !== CACHE_NAME).map(n => caches.delete(n)))
    ).then(() => self.clients.claim())  // চালু থাকা সব ট্যাব সাথে সাথে নতুন SW ব্যবহার করুক
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
