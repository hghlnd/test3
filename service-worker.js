// Bump the cache name so browsers grab the new assets
const CACHE_NAME = 'pockets-cache-v6';

const FILES_TO_CACHE = [
  './',
  './index.html',
  './style.css?v=3',
  './script.js',
  './manifest.json',

  './icon-192x192.png',
  './icon-512x512.png',

  './app-icon.png',
  './add-icon.png',
  './delete-icon.png',
  './reminder-icon.png',

  'https://www.gstatic.com/firebasejs/8.10.1/firebase-app.js',
  'https://www.gstatic.com/firebasejs/8.10.1/firebase-firestore.js',
  'https://www.gstatic.com/firebasejs/8.10.1/firebase-auth.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(FILES_TO_CACHE))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      )
    )
  );
});

// Simple cache-first for static assets + fallback to index.html for navigation
self.addEventListener('fetch', (event) => {
  const req = event.request;

  // Only handle GET
  if (req.method !== 'GET') return;

  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;

      return fetch(req).catch(() => {
        // For navigation requests, fallback to index.html
        if (req.mode === 'navigate') {
          return caches.match('./index.html');
        }
        return new Response('Offline', { status: 503, statusText: 'Offline' });
      });
    })
  );
});
