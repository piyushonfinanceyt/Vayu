/* Service worker: makes Vayu open offline and installable.
   - The app shell (every HTML, CSS, JS, data and icon file) is cached on install.
   - Pages: network first (so a new version shows when you're online), the cached copy when offline.
   - Files: served from the cache at once and refreshed in the background (stale-while-revalidate).
   - Google Fonts are cached the first time they load, so the Outfit font works offline too.
   - A new version waits until you tap "Update" in the app (message 'skipWaiting').
   - Tapping the 10 PM reminder notification opens the Daily Log.
   - Windows 11 widgets (manifest "widgets"): drawn from the snapshot the page keeps in the 'fc-widget' cache (js/widgets.js),
     redrawn when the page sends 'widgets', on install/resume/activate and by periodic sync, so the countdown and today's
     plan stay right after midnight while the app is closed. With sync on, install/resume/activate/periodic sync first
     fetch the summary your other devices upload (vayu-widget.json), so the widgets follow what you log elsewhere.
   Bump VERSION when you deploy so installed copies pick up the new files. Your data (IndexedDB) is never touched. */
const VERSION = 'fc-2026-10-27-7';
const FONTS = 'fc-fonts';
const WIDGET = 'fc-widget';
const SHELL = [
  './', './index.html', './manifest.webmanifest', './data/seed.js',
  './css/tokens.css', './css/base.css', './css/shell.css', './css/components.css', './css/charts.css', './css/views.css',
  './js/main.js', './js/util.js', './js/icons.js', './js/db.js', './js/store.js', './js/model.js', './js/arc.js', './js/prefs.js',
  './js/router.js', './js/shell.js', './js/components.js', './js/charts.js', './js/palette.js', './js/quicklog.js', './js/timer.js', './js/pwa.js', './js/merge.js', './js/sync.js', './js/replan.js', './js/drill.js', './js/weekly.js', './js/marking.js', './js/widgets.js',
  './js/views/parts.js', './js/views/insights.js', './js/views/dashboard.js', './js/views/goals.js', './js/views/study-plan.js', './js/views/daily-log.js',
  './js/views/subjects.js', './js/views/revision.js', './js/views/mocks.js', './js/views/errors.js', './js/views/notes.js', './js/views/habits.js',
  './js/views/journal.js', './js/views/finance.js', './js/views/health.js', './js/views/run-5k.js', './js/views/winter-arc.js', './js/views/resources.js',
  './js/views/calendar.js', './js/views/analytics.js', './js/views/tools.js', './js/views/settings.js',
  './icons/icon-192.png', './icons/icon-512.png', './icons/icon-maskable-512.png', './icons/apple-touch-icon.png', './icons/shortcut-log.png',
  './widgets/today.json', './widgets/countdown.json'
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
    await Promise.all(keys.filter((k) => k.startsWith('fc-') && k !== VERSION && k !== FONTS && k !== WIDGET).map((k) => caches.delete(k)));
    await self.clients.claim();
    await updateWidgets(true);
  })());
});

self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') self.skipWaiting();
  else if (event.data && event.data.type === 'widgets') event.waitUntil(updateWidgets());
});

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
  const wd = url.origin === self.location.origin && WIDGET_DATA[url.pathname.split('/').pop()];
  if (wd) { event.respondWith(readSnapshot().then((s) => new Response(JSON.stringify(wd(s)), { headers: { 'Content-Type': 'application/json' } }))); return; }
  if (url.origin === self.location.origin) { event.respondWith(staleWhileRevalidate(req, VERSION)); return; }
  if (url.hostname === 'fonts.gstatic.com') { event.respondWith(cacheFirst(req, FONTS)); return; }
  if (url.hostname === 'fonts.googleapis.com') { event.respondWith(staleWhileRevalidate(req, FONTS)); }
});

// focus the open Vayu window and move it to `url`, or open a new one
async function openApp(url) {
  const target = new URL(url, self.registration.scope).href;
  const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  const open = wins.find((w) => w.url.startsWith(self.registration.scope));
  if (open) { await open.focus(); open.postMessage({ type: 'go', hash: new URL(target).hash }); return; }
  await self.clients.openWindow(target);
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(openApp((event.notification.data && event.notification.data.url) || './#/log'));
});

// ---------- Windows 11 widgets ----------
const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const fmt1 = (x) => String(Math.round((+x || 0) * 10) / 10);
const plural = (n, one) => n + ' ' + (n === 1 ? one : one + 's');

async function readSnapshot() {
  try { const res = await (await caches.open(WIDGET)).match('./widgets/snapshot.json'); return res ? await res.json() : null; } catch (e) { return null; }
}
const writeSnapshot = async (s) => (await caches.open(WIDGET)).put('./widgets/snapshot.json', new Response(JSON.stringify(s), { headers: { 'Content-Type': 'application/json' } }));

// While this copy is closed: fetch the summary your other devices upload with each sync (vayu-widget.json in the sync
// gist, js/sync.js), decrypt it with the key the app left in IndexedDB 'vayu-worker', and keep it if it's newer than ours.
function syncDetails() {
  return new Promise((resolve) => {
    const r = indexedDB.open('vayu-worker', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('kv');
    r.onerror = () => resolve(null);
    r.onsuccess = () => {
      const db = r.result, q = db.transaction('kv').objectStore('kv').get('sync');
      q.onsuccess = () => { db.close(); resolve(q.result || null); };
      q.onerror = () => { db.close(); resolve(null); };
    };
  });
}
const fromB64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
let lastPull = 0;
async function pullSnapshot() {
  if (Date.now() - lastPull < 60000) return;
  lastPull = Date.now();
  const c = await syncDetails();
  if (!c || !c.token || !c.gistId || !c.key) return;
  try {
    const res = await fetch('https://api.github.com/gists/' + c.gistId, { cache: 'no-store', headers: { Accept: 'application/vnd.github+json', Authorization: 'Bearer ' + c.token } });
    if (!res.ok) return;
    const f = ((await res.json()).files || {})['vayu-widget.json'];
    if (!f) return;
    const env = JSON.parse(f.truncated ? await (await fetch(f.raw_url, { cache: 'no-store' })).text() : f.content);
    if (!env || env.app !== 'vayu-widget') return;
    const s = JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(env.iv) }, c.key, fromB64(env.data))));
    const mine = await readSnapshot();
    if (s && s.exam && s.days && (!mine || (+s.at || 0) > (+mine.at || 0))) await writeSnapshot(s);
  } catch (e) { console.warn('[widgets] background refresh:', e && e.message); }
}
// what both cards share: whole days left on the clock (69 days 23 h reads as 69, like the in-app countdown) and today's plan day
function base(s) {
  if (!s || !s.exam) return { ready: false };
  const n = new Date(), t = ymd(n), days = Math.max(0, Math.floor((s.exam.at - n.getTime()) / 864e5)), d = s.days[t] || null;
  return { ready: true, n, t, d, days: String(days), daysWord: days === 1 ? 'day' : 'days', when: s.exam.when, dayLine: d ? d.label + (d.phase ? ' · ' + d.phase : '') : 'Outside the plan' };
}
const WIDGET_DATA = {
  'countdown-data.json': (s) => { const b = base(s); delete b.n; delete b.t; delete b.d; return b; },
  'today-data.json': (s) => {
    const b = base(s);
    if (!b.ready) return b;
    const d = b.d, mins = b.n.getHours() * 60 + b.n.getMinutes(), [rh, rm] = String(s.remind || '22:00').split(':').map(Number);
    return {
      ready: true, days: b.days, dayLine: b.dayLine,
      study: d ? (d.hrs != null ? fmt1(d.hrs) : '–') + ' / ' + fmt1(d.target) + ' h · ' + d.type : 'No plan day',
      plan: d ? (d.total ? d.done + ' of ' + d.total + ' done' : 'Nothing planned') : '–',
      log: !d ? '–' : d.logged ? 'Logged' : mins >= rh * 60 + rm ? 'Due now · log before you sleep' : 'Not logged yet',
      streak: plural(s.streak, 'day') + ' no-zero · min ' + fmt1(s.minHrs) + ' h'
    };
  }
};

async function renderWidget(widget) {
  const def = widget.definition, data = WIDGET_DATA[String(def.data || '').split('/').pop()];
  if (!data) return;
  const template = await (await caches.match(def.msAcTemplate, { ignoreSearch: true }) || await fetch(def.msAcTemplate)).text();
  await self.widgets.updateByTag(def.tag, { template, data: JSON.stringify(data(await readSnapshot())) });
}
// pull: also fetch your other devices' latest summary first (not when this copy's own page just sent fresh data)
async function updateWidgets(pull) {
  if (!self.widgets) return;
  try {
    const list = await self.widgets.matchAll({ installed: true });
    if (!list.length) return;
    if (pull) await pullSnapshot();
    await Promise.all(list.map((w) => renderWidget(w).catch((e) => console.warn('[widgets]', e && e.message))));
  } catch (e) { console.warn('[widgets]', e && e.message); }
}
async function onWidgetInstall(widget) {
  const def = widget.definition;
  try {
    const ps = self.registration.periodicSync;
    if (ps && def.update && !(await ps.getTags()).includes(def.tag)) await ps.register(def.tag, { minInterval: def.update * 1000 });
  } catch (e) { /* periodic sync not allowed: the widget still updates whenever Vayu is open */ }
  await pullSnapshot();
  await renderWidget(widget);
}
self.addEventListener('widgetinstall', (event) => { event.waitUntil(onWidgetInstall(event.widget)); });
// the board resumes widgets when you open it after a while: a good moment to fetch what you logged elsewhere
self.addEventListener('widgetresume', (event) => { event.waitUntil(pullSnapshot().then(() => renderWidget(event.widget))); });
self.addEventListener('widgetuninstall', (event) => {
  event.waitUntil((async () => {
    const w = event.widget, ps = self.registration.periodicSync;
    if (ps && w.instances.length <= 1 && w.definition.update) await ps.unregister(w.definition.tag).catch(() => {});
  })());
});
self.addEventListener('widgetclick', (event) => {
  const to = { log: './#/log', timer: './#/dashboard?do=timer' }[event.action] || './#/dashboard';
  event.waitUntil(openApp(to));
});
self.addEventListener('periodicsync', (event) => { if (self.widgets) event.waitUntil(updateWidgets(true)); });
