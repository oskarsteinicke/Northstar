const CACHE = 'arete-v120';
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
  '/bodymap.js',
  '/integrations.js',
  '/profile.js',
  '/privacy.html',
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

// ── PUSH REMINDERS ────────────────────────────────────────────────────────
// Pushes are sent with no payload. That needs only VAPID auth, skipping the
// RFC 8291 payload encryption entirely, and means nothing about your habits or
// meals ever passes through Apple's or Google's push service — the wording is
// chosen here, on the device, from the local clock.
const PUSH_SLOTS = [
  { from: 4,  to: 11, title: 'Good morning ☀️',
    body: 'New day, new chance to show up. Set the tone early.' },
  { from: 11, to: 16, title: 'Log your meals 🥗',
    body: 'A few seconds of tracking keeps your targets honest.' },
  { from: 16, to: 24, title: 'Finish the day strong 🔥',
    body: "Any habits still open? Don't let a streak break tonight." },
];

function pushMessage() {
  const h = new Date().getHours();
  return PUSH_SLOTS.find(s => h >= s.from && h < s.to) || PUSH_SLOTS[2];
}

self.addEventListener('push', e => {
  let msg = pushMessage();
  // Honour a payload if one is ever sent, but never require it
  try {
    if (e.data) {
      const d = e.data.json();
      if (d && d.title) msg = { title: d.title, body: d.body || msg.body };
    }
  } catch (err) {}
  e.waitUntil(self.registration.showNotification(msg.title, {
    body: msg.body,
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: 'arete-reminder',   // a later reminder replaces an unread one
    data: { url: '/' },
  }));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || '/';
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const c of list) if ('focus' in c) return c.focus();
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })
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
