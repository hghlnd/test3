// Bump the cache name so browsers grab the new assets (including updated JS)
const CACHE_NAME = 'pockets-cache-v6';

const FILES_TO_CACHE = [
  './',
  './index.html',
  './style.css',
  './script.js?v=2',
  './manifest.json',

  './icon-192x192.png',
  './icon-512x512.png',

  './app-icon.png',
  './add-icon.png',
  './delete-icon.png',
  './reminder-icon.png'
  // NOTE: we are NOT caching Firebase scripts here; they can be loaded from network
];

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(FILES_TO_CACHE))
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.map(key => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  // Only handle GET requests
  if (event.request.method !== 'GET') {
    return;
  }

  const url = new URL(event.request.url);

  // Only cache same-origin requests (your app files)
  if (url.origin !== self.location.origin) {
    // Let the browser handle Firebase & other external requests
    return;
  }

  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) {
        return cached;
      }

      // Not in cache: go to network and optionally cache it
      return fetch(event.request).then(response => {
        // only cache successful basic responses
        if (!response || response.status !== 200 || response.type !== 'basic') {
          return response;
        }
        const respClone = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, respClone));
        return response;
      }).catch(() => {
        // Fallback to index if offline and request not in cache
        return caches.match('./index.html');
      });
    })
  );
});
