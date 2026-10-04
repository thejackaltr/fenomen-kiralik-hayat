/* Fenomen: Kiralık Hayat service worker — versioned, cache-first for same-origin assets. Generated at build time. */
const VERSION = '__VERSION__';
const CACHE = 'fenomen-' + VERSION;
const PRECACHE = __PRECACHE__;
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE)));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith('fenomen-') && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
// The move page (old address) removes this worker: 'stopCaching' -> no more cache writes, the ones in flight finish,
// then 'stopped' on the reply port. Without this, a late cache.put() re-created the cache the page had just deleted.
let caching = true;
const pending = new Set();
self.addEventListener('message', (e) => {
  if (e.data === 'skipWaiting') self.skipWaiting();
  if (e.data === 'stopCaching') {
    caching = false;
    const port = e.ports && e.ports[0];
    e.waitUntil(Promise.allSettled([...pending]).then(() => { if (port) port.postMessage('stopped'); }));
  }
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;               // Umami (analiz.teserix.com script + /api/send) etc.: network only, never cached
  if (req.mode === 'navigate') {
    e.respondWith(caches.match('./index.html', { cacheName: CACHE }).then((r) => r || fetch(req)).catch(() => caches.match('./index.html')));
    return;
  }
  e.respondWith(caches.match(req, { ignoreSearch: true, cacheName: CACHE }).then((hit) => hit || fetch(req).then((res) => {
    if (caching && res.ok && res.type === 'basic') {
      const copy = res.clone();
      const p = caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {}).finally(() => pending.delete(p));
      pending.add(p);
    }
    return res;
  })));
});
