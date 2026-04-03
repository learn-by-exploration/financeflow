// FinanceFlow — Service Worker (PWA)
const CACHE_NAME = 'financeflow-v7.3.1';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/landing.html',
  '/login.html',
  '/styles.css',
  '/css/login.css',
  '/css/landing.css',
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
  '/js/views/reports.js',
  '/js/views/tags.js',
  '/js/views/categories.js',
  '/js/views/subscriptions.js',
  '/js/views/groups.js',
  '/js/views/splits.js',
  '/js/views/recurring.js',
  '/js/views/insights.js',
  '/js/views/rules.js',
  '/js/views/export.js',
  '/js/views/calendar.js',
  '/js/views/calculators.js',
  '/js/views/challenges.js',
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

// ─── Offline mutation queue (P25) ───
const DB_NAME = 'financeflow-offline';
const STORE_NAME = 'offlineQueue';

function openOfflineDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function queueMutation(method, url, body, authToken) {
  const db = await openOfflineDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).add({ method, url, body, authToken, timestamp: Date.now() });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function replayQueue() {
  const db = await openOfflineDB();
  const tx = db.transaction(STORE_NAME, 'readonly');
  const store = tx.objectStore(STORE_NAME);
  const all = await new Promise((resolve) => {
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result);
  });
  for (const item of all) {
    try {
      const headers = { 'Content-Type': 'application/json' };
      if (item.authToken) headers['X-Session-Token'] = item.authToken;
      await fetch(item.url, {
        method: item.method,
        headers,
        body: item.body ? JSON.stringify(item.body) : undefined,
      });
      // Remove on success
      const delTx = db.transaction(STORE_NAME, 'readwrite');
      delTx.objectStore(STORE_NAME).delete(item.id);
    } catch { /* keep in queue for next retry */ }
  }
  notifyClients();
}

async function notifyClients() {
  const db = await openOfflineDB();
  const tx = db.transaction(STORE_NAME, 'readonly');
  const count = await new Promise((resolve) => {
    const req = tx.objectStore(STORE_NAME).count();
    req.onsuccess = () => resolve(req.result);
  });
  const clients = await self.clients.matchAll();
  clients.forEach(client => client.postMessage({ type: 'pending-sync', count }));
}

// Sync event for replay
self.addEventListener('sync', (event) => {
  if (event.tag === 'replay-mutations') {
    event.waitUntil(replayQueue());
  }
});

// Fetch: network-first for API, cache-first for static
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // API requests: network with offline queue fallback for mutations
  if (url.pathname.startsWith('/api/')) {
    const method = event.request.method;
    // Skip queuing for auth requests and GET
    if (method === 'GET' || url.pathname.startsWith('/api/auth/')) {
      event.respondWith(fetch(event.request));
      return;
    }
    // For mutations (POST/PUT/DELETE), try network first, queue on failure
    event.respondWith(
      fetch(event.request.clone()).catch(async () => {
        // Queue the failed mutation
        let body = null;
        try { body = await event.request.clone().json(); } catch { /* no body */ }
        const authToken = event.request.headers.get('X-Session-Token');
        await queueMutation(method, event.request.url, body, authToken);
        notifyClients();
        return new Response(JSON.stringify({ queued: true }), {
          status: 202,
          headers: { 'Content-Type': 'application/json' },
        });
      })
    );
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
