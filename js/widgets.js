/* Home-screen glance: the Windows 11 widgets and the app-icon badge.
   The page writes a small snapshot of today and the next 6 days into Cache Storage (cache 'fc-widget') whenever your data
   changes; the service worker reads it to draw the Widgets Board cards (widgets/*.json), so they stay right after midnight
   and while the app is closed. The badge (a dot on the app icon, where the system supports it) shows from your reminder
   time until today's plan day is logged. */
import { model } from './model.js';
import { todayStr, addDays, fmtD, fmtClock, typeName, debounce, now, timeToMin } from './util.js';
import * as pwa from './pwa.js';

export const WIDGET_CACHE = 'fc-widget';
export const SNAPSHOT_URL = './widgets/snapshot.json';

export function snapshot(M) {
  const t = todayStr(), st = M.st, days = {};
  for (let i = 0; i < 7; i++) {
    const date = addDays(t, i), d = M.dayByDate[date];
    if (!d) continue;
    const items = M.focusItems(date);
    days[date] = { label: d.label, phase: d.phase, type: typeName(d.type), target: d.target, logged: d.logged, hrs: d.rec.hrs == null || d.rec.hrs === '' ? null : +d.rec.hrs || 0, done: items.filter((x) => x.done).length, total: items.length };
  }
  return {
    v: 1, at: Date.now(), today: t,
    exam: { at: M.examAt.getTime(), when: fmtD(st.examDate) + ' · ' + fmtClock(M.examAt.getHours() * 60 + M.examAt.getMinutes()) },
    streak: M.noZero.streak, minHrs: M.noZero.min, remind: pwa.reminder().time, days
  };
}

// a dot on the app icon from the reminder time until today is logged (Windows taskbar, iPhone home screen, some launchers)
function badge(M) {
  if (!('setAppBadge' in navigator)) return;
  const d = M.todayDay, due = !!d && !d.logged && now().getHours() * 60 + now().getMinutes() >= timeToMin(pwa.reminder().time);
  (due ? navigator.setAppBadge() : navigator.clearAppBadge()).catch(() => {});
}

// compared with what's in the cache, not our last write: the service worker may have put another device's summary there
const sig = (s) => JSON.stringify(Object.assign({}, s, { at: 0 }));
async function write() {
  const M = model();
  badge(M);
  if (!('caches' in window) || !pwa.swSupported()) return;
  const s = snapshot(M);
  try {
    const cache = await caches.open(WIDGET_CACHE), old = await cache.match(SNAPSHOT_URL);
    if (old && sig(await old.json()) === sig(s)) return;
    await cache.put(SNAPSHOT_URL, new Response(JSON.stringify(s), { headers: { 'Content-Type': 'application/json' } }));
    const reg = await navigator.serviceWorker.getRegistration();
    if (reg && reg.active) reg.active.postMessage({ type: 'widgets' });
  } catch (e) { console.warn('[widgets]', e && e.message); }
}
// called on every data change, at start-up, each 30 s tick and when the day rolls over
export const refresh = debounce(() => { write(); }, 800);
