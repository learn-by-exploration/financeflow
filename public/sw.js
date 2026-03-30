// FinanceFlow — Service Worker (PWA)
const CACHE_NAME = 'financeflow-v0.5.0';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/login.html',
  '/styles.css',
  '/css/login.css',
  '/js/app.js',
  '/js/utils.js',
  '/js/login.js',
  '/js/charts.js',
  '/js/notifications.js',
  '/js/ui-states.js',
  '/js/form-validator.js',
  '/js/pagination.js',
  '/js/views/dashboard.js',
  '/js/views/transactions.js',
  '/js/views/accounts.js',
  '/js/views/budgets.js',
  '/js/views/goals.js',
  '/js/views/settings.js',
  '/js/views/search.js',
  '/js/vendor/chart.min.js',
  '/manifest.json',
];

// Install: cache static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
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

// Fetch: network-first for API, cache-first for static
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // API requests: network only (never cache API data)
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(fetch(event.request));
    return;
  }

  // Static assets: cache-first, fallback to network
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        // Cache successful GET responses
        if (response.ok && event.request.method === 'GET') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      });
    }).catch(() => {
      // Offline fallback for navigation
      if (event.request.mode === 'navigate') {
        return caches.match('/index.html');
      }
    })
  );
});
