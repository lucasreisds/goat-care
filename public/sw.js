/* Goat Care service worker: offline app shell + push notifications.
 * Bump VERSION when this file's caching rules change; build assets are hashed, so they never go stale. */
const VERSION = 'goat-care-v1';
const SHELL = ['/', '/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-512.png', '/icons/apple-touch-icon.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(VERSION).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== VERSION).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

const isLocalDev = self.location.hostname === 'localhost' || self.location.hostname === '127.0.0.1';

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  // Only our own files. Firestore, Auth and the Firebase helper pages (/__/) always go to the network.
  if (isLocalDev || request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/__/')) return;

  if (request.mode === 'navigate') {
    // Network first so a new release shows up at once; the cached shell opens the app offline.
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          void caches.open(VERSION).then((cache) => cache.put('/', copy));
          return response;
        })
        .catch(() => caches.match('/').then((cached) => cached || Response.error())),
    );
    return;
  }

  // Hashed build assets never change: cache first. Everything else (art, manifests): cache, refreshed in the background.
  const immutable = url.pathname.startsWith('/assets/');
  event.respondWith(
    caches.open(VERSION).then(async (cache) => {
      const cached = await cache.match(request);
      if (cached && immutable) return cached;
      const refresh = fetch(request)
        .then((response) => {
          if (response.ok) void cache.put(request, response.clone());
          return response;
        })
        .catch(() => cached || Response.error());
      return cached || refresh;
    }),
  );
});

// ---------------------------------------------------------------- push
// The server sends data-only messages: { title, body, url, tag }. iOS requires every push to show a notification.
self.addEventListener('push', (event) => {
  let payload = {};
  try {
    const raw = event.data ? event.data.json() : {};
    payload = raw.data || raw;
  } catch {
    payload = {};
  }
  const title = payload.title || 'Goat Care';
  event.waitUntil(
    self.registration.showNotification(title, {
      body: payload.body || '',
      icon: '/icons/icon-192.png',
      badge: '/icons/favicon-32.png',
      tag: payload.tag || undefined,
      data: { url: payload.url || '/' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      const open = windows.find((w) => 'focus' in w);
      return open ? open.focus() : self.clients.openWindow(target);
    }),
  );
});
