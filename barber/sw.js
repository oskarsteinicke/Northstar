// Scoped to /barber/ only — the Arete service worker at the site root keeps
// its own cache and never sees these requests.
const CACHE = 'chair-v1';
const ASSETS = [
  '/barber/',
  '/barber/index.html',
  '/barber/style.css',
  '/barber/app.js',
  '/barber/manifest.json',
  '/barber/icon.svg',
];

self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS).catch(() => {})));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Network first so a deploy is picked up straight away, cache as the fallback
// so the shop still opens with no signal.
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  if (new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then(res => {
        const clone = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone));
        return res;
      })
      .catch(() => caches.match(e.request).then(r => r || caches.match('/barber/index.html')))
  );
});
