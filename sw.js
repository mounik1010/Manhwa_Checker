// Manhwa Checker Service Worker - App Shell Cache
const CACHE_NAME = 'manhwa-checker-shell-v1';

// Files to cache for offline app shell
const APP_SHELL_FILES = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable.png',
  './icons/icon.svg'
];

// Install event: cache app shell files
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(APP_SHELL_FILES);
    }).then(() => {
      return self.skipWaiting();
    })
  );
});

// Activate event: clean up any older caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((name) => {
          if (name !== CACHE_NAME) {
            return caches.delete(name);
          }
        })
      );
    }).then(() => {
      return self.clients.claim();
    })
  );
});

// Fetch event: serve app shell from cache, NEVER cache API or proxy requests
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // 1. Only handle GET requests
  if (req.method !== 'GET') {
    return;
  }

  // 2. NEVER cache Worker proxy requests, API requests, or external resources
  // Check if request is to external origin or has query parameter ?url= (worker proxy)
  if (url.origin !== self.location.origin || url.searchParams.has('url')) {
    // Let network handle directly without touching SW cache
    return;
  }

  // 3. For app shell assets on our own origin: Stale-While-Revalidate
  event.respondWith(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.match(req).then((cachedResponse) => {
        const fetchPromise = fetch(req).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            cache.put(req, networkResponse.clone());
          }
          return networkResponse;
        }).catch(() => {
          // If offline and not in cache, fallback to index.html for navigation requests
          if (req.mode === 'navigate') {
            return cache.match('./index.html') || cache.match('./');
          }
        });

        // Return cached version if found, otherwise wait for network
        return cachedResponse || fetchPromise;
      });
    })
  );
});
