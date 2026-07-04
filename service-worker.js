const CACHE = 'arete-v86';
const ASSETS = [
  '/',
  '/index.html',
  '/style.css',
  '/data.js',
  '/app.js',
  '/connect.js',
  '/premium.js',
  '/workout.js',
  '/diet.js',
  '/coach.js',
  '/social.js',
  '/integrations.js',
  '/profile.js',
  '/manifest.json',
  '/avatar-1.png',
  '/avatar-2.png',
  '/avatar-3.png',
  '/avatar-4.png',
  '/avatar-5.png',
  '/avatar-6.png'
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

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return; // never intercept API calls
  // Network first, fall back to cache for offline
  e.respondWith(
    fetch(e.request)
      .then(res => {
        const clone = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone));
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});
