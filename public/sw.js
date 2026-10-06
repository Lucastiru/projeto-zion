const CACHE = 'zion-pwa-v3';
const CORE = ['/', '/offline.html', '/favicon.svg', '/zion-logo.png', '/icons/icon-192.png', '/icons/icon-512.png', '/icons/icon-maskable-512.png'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(CORE)));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).then(async response => {
      if (response.ok && url.pathname === '/' && !url.search) {
        await caches.open(CACHE).then(cache => cache.put('/', response.clone()));
      }
      return response;
    }).catch(async () => (url.pathname === '/' ? (await caches.match('/')) : null) || caches.match('/offline.html')));
    return;
  }

  if (['script', 'style', 'font', 'image'].includes(request.destination) || url.pathname.startsWith('/icons/')) {
    event.respondWith(caches.match(request).then(cached => cached || fetch(request).then(async response => {
      if (response.ok) {
        await caches.open(CACHE).then(cache => cache.put(request, response.clone()));
      }
      return response;
    })));
  }
});
