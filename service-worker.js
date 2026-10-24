/* Service worker: makes Vayu open offline and installable.
   - The app shell (every HTML, CSS, JS, data and icon file) is cached on install.
   - Pages: network first (so a new version shows when you're online), the cached copy when offline.
   - Files: served from the cache at once and refreshed in the background (stale-while-revalidate).
   - Google Fonts are cached the first time they load, so the Outfit font works offline too.
   - A new version waits until you tap "Update" in the app (message 'skipWaiting').
   - Tapping the 10 PM reminder notification opens the Daily Log.
   Bump VERSION when you deploy so installed copies pick up the new files. Your data (IndexedDB) is never touched. */
const VERSION = 'fc-2026-10-24-2';
const FONTS = 'fc-fonts';
const SHELL = [
  './', './index.html', './manifest.webmanifest', './data/seed.js',
  './css/tokens.css', './css/base.css', './css/shell.css', './css/components.css', './css/charts.css', './css/views.css',
  './js/main.js', './js/util.js', './js/icons.js', './js/db.js', './js/store.js', './js/model.js', './js/arc.js', './js/prefs.js',
  './js/router.js', './js/shell.js', './js/components.js', './js/charts.js', './js/palette.js', './js/quicklog.js', './js/timer.js', './js/pwa.js',
  './js/views/parts.js', './js/views/insights.js', './js/views/dashboard.js', './js/views/goals.js', './js/views/study-plan.js', './js/views/daily-log.js',
  './js/views/subjects.js', './js/views/revision.js', './js/views/mocks.js', './js/views/errors.js', './js/views/notes.js', './js/views/habits.js',
  './js/views/journal.js', './js/views/finance.js', './js/views/health.js', './js/views/run-5k.js', './js/views/winter-arc.js', './js/views/resources.js',
  './js/views/calendar.js', './js/views/analytics.js', './js/views/tools.js', './js/views/settings.js',
  './icons/icon-192.png', './icons/icon-512.png', './icons/icon-maskable-512.png', './icons/apple-touch-icon.png', './icons/shortcut-log.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(VERSION);
    // one failed file must not stop the rest from caching
    await Promise.allSettled(SHELL.map((url) => cache.add(new Request(url, { cache: 'reload' }))));
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith('fc-') && k !== VERSION && k !== FONTS).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => { if (event.data === 'skipWaiting') self.skipWaiting(); });

async function networkFirst(request) {
  const cache = await caches.open(VERSION);
  try {
    const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 3500));
    const res = await Promise.race([fetch(request), timeout]);
    if (res && res.ok) cache.put('./index.html', res.clone());
    return res;
  } catch (e) {
    return (await cache.match('./index.html')) || (await cache.match('./')) || Response.error();
  }
}
async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request, { ignoreSearch: cacheName === VERSION });
  const fresh = fetch(request).then((res) => { if (res && (res.ok || res.type === 'opaque')) cache.put(request, res.clone()); return res; }).catch(() => null);
  return cached || (await fresh) || Response.error();
}
async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  try { const res = await fetch(request); if (res && (res.ok || res.type === 'opaque')) cache.put(request, res.clone()); return res; } catch (e) { return Response.error(); }
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (req.mode === 'navigate' && url.origin === self.location.origin) { event.respondWith(networkFirst(req)); return; }
  if (url.origin === self.location.origin) { event.respondWith(staleWhileRevalidate(req, VERSION)); return; }
  if (url.hostname === 'fonts.gstatic.com') { event.respondWith(cacheFirst(req, FONTS)); return; }
  if (url.hostname === 'fonts.googleapis.com') { event.respondWith(staleWhileRevalidate(req, FONTS)); }
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL((event.notification.data && event.notification.data.url) || './#/log', self.registration.scope).href;
  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const open = wins.find((w) => w.url.startsWith(self.registration.scope));
    if (open) { await open.focus(); open.postMessage({ type: 'go', hash: new URL(target).hash }); return; }
    await self.clients.openWindow(target);
  })());
});
