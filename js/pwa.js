/* Installable, offline app + the 10 PM log reminder.
   Service worker: registered on http(s) (add ?nosw to the URL to skip it while developing). A new version waits until you
   tap "Update"; the page then reloads once.
   Reminder (per device, saved in prefs): at your reminder time, if today's plan day isn't logged yet, a system notification
   (when the app is in the background and notifications are allowed) or an in-app prompt (when it's on screen).
   Browsers can't wake a closed web app at an exact time without a push server, so the reminder can also be added to your
   phone's calendar as a daily event (.ics): that one always fires. */
import { toast } from './components.js';
import { pref, setPref } from './prefs.js';
import { todayStr, now, timeToMin, fmtClock, fmt1, download, plural } from './util.js';
import { model } from './model.js';
import * as store from './store.js';

export const state = { reg: null, installEvent: null, installed: false, offlineReady: false, updateReady: false, waiting: null, version: '' };
const subs = new Set();
export const onChange = (fn) => { subs.add(fn); };
const changed = () => subs.forEach((fn) => { try { fn(); } catch (e) { console.error(e); } });

export const isStandalone = () => { try { return matchMedia('(display-mode: standalone)').matches || navigator.standalone === true; } catch (e) { return false; } };
export const platform = () => (/iphone|ipad|ipod/i.test(navigator.userAgent) ? 'ios' : /android/i.test(navigator.userAgent) ? 'android' : 'desktop');
export const swSupported = () => 'serviceWorker' in navigator && /^https?:$/.test(location.protocol);

// ---------- service worker ----------
export function registerSW(go) {
  if (!swSupported()) return;
  try { if (new URLSearchParams(location.search).has('nosw')) return; } catch (e) { /* no query */ }
  const had = !!navigator.serviceWorker.controller;
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (!had || reloading) return; reloading = true; store.flush().finally(() => location.reload()); });
  navigator.serviceWorker.addEventListener('message', (e) => { if (e.data && e.data.type === 'go' && e.data.hash) go(e.data.hash); });
  const offer = (w) => {
    state.updateReady = true; state.waiting = w; changed();
    toast('A new version of Vayu is ready', { icon: 'sparkles', ms: 20000, action: { label: 'Update', fn: () => applyUpdate() } });
  };
  navigator.serviceWorker.register('./service-worker.js').then((reg) => {
    state.reg = reg;
    if (reg.waiting && had) offer(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const w = reg.installing; if (!w) return;
      w.addEventListener('statechange', () => {
        if (w.state !== 'installed') return;
        if (navigator.serviceWorker.controller) offer(w);
        else { state.offlineReady = true; changed(); toast('Vayu now works offline', { icon: 'checkCircle' }); }
      });
    });
    setInterval(() => { reg.update().catch(() => {}); }, 60 * 60 * 1000);
  }).catch((e) => console.warn('[pwa] service worker not registered:', e && e.message));
  navigator.serviceWorker.ready.then(() => { state.offlineReady = true; changed(); });
}
export function applyUpdate() { const w = state.waiting || (state.reg && state.reg.waiting); if (w) w.postMessage('skipWaiting'); }
export async function checkForUpdate() {
  if (!state.reg) return 'unavailable';
  try { await state.reg.update(); } catch (e) { return 'offline'; }
  return state.reg.waiting || state.reg.installing ? 'found' : 'latest';
}

// ---------- install ----------
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); state.installEvent = e; changed(); });
window.addEventListener('appinstalled', () => { state.installEvent = null; state.installed = true; changed(); toast('Installed · open it from your home screen or app list', { icon: 'checkCircle' }); });
export async function install() {
  const ev = state.installEvent;
  if (!ev) return false;
  ev.prompt();
  let ok = false;
  try { const r = await ev.userChoice; ok = !!r && r.outcome === 'accepted'; } catch (e) { ok = false; }
  state.installEvent = null; changed();
  return ok;
}

// ---------- 10 PM reminder ----------
export const reminder = () => ({ on: !!pref('remindOn'), time: /^\d{2}:\d{2}$/.test(pref('remindTime') || '') ? pref('remindTime') : '22:00' });
export const permission = () => ('Notification' in window ? Notification.permission : 'unsupported');
export async function enableReminder() {
  let p = permission();
  if (p === 'default') { try { p = await Notification.requestPermission(); } catch (e) { p = permission(); } }
  setPref('remindOn', true); changed();
  return p;
}
export function disableReminder() { setPref('remindOn', false); changed(); }
export function setReminderTime(t) { if (/^\d{2}:\d{2}$/.test(t)) { setPref('remindTime', t); setPref('remindLast', null); changed(); } }

function reminderText(M) {
  const d = M.todayDay, nz = M.noZero;
  return d ? 'Target ' + fmt1(d.target) + ' h · hours, status, pages, workout, steps, push-ups and meals' + (nz.streak ? ' · keep your ' + plural(nz.streak, 'day') + ' no-zero streak' : '') : 'Hours, pages, workout and meals';
}
async function systemNotify(title, body) {
  if (permission() !== 'granted') return false;
  const opts = { body, tag: 'fc-10pm', renotify: true, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', data: { url: './#/log' } };
  try {
    const reg = state.reg || (navigator.serviceWorker && await navigator.serviceWorker.getRegistration());
    if (reg && reg.showNotification) { await reg.showNotification(title, opts); return true; }
    const n = new Notification(title, opts); n.onclick = () => { window.focus(); location.hash = '#/log'; n.close(); };
    return true;
  } catch (e) { return false; }
}
// Called every 30 s, when the app comes back to the screen, and at start-up. test = send one now, whatever the time.
export async function checkReminder(openLog, test) {
  const R = reminder(), t = todayStr();
  if (!test) {
    if (!R.on) return 'off';
    const n = now(), at = timeToMin(R.time);
    if (n.getHours() * 60 + n.getMinutes() < at) return 'early';
    if (pref('remindLast') === t) return 'sent';
  }
  const M = model(), d = M.dayByDate[t];
  if (!test && (!d || d.logged)) { setPref('remindLast', t); return 'logged'; }
  const title = test ? 'This is how the 10 PM reminder looks' : 'Time for your 10 PM log', body = reminderText(M);
  if (document.visibilityState === 'visible') {
    toast(title, { icon: 'bell', ms: 20000, action: { label: 'Open the log', fn: openLog } });
    if (test) await systemNotify(title, body);
    setPref('remindLast', t); return 'toast';
  }
  // in the background: a system notification, or wait until the app is on screen again
  if (await systemNotify(title, body)) { setPref('remindLast', t); return 'notified'; }
  return 'pending';
}

// a daily calendar event with an alert: the reminder that fires even when the app is closed
export function calendarICS() {
  const R = reminder(), [h, m] = R.time.split(':'), day = todayStr().replace(/-/g, ''), stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  const link = /^https?:/.test(location.protocol) ? location.origin + location.pathname + '#/log' : '';
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Vayu//10 PM log//EN', 'CALSCALE:GREGORIAN', 'BEGIN:VEVENT',
    'UID:vayu-10pm-log-' + day + '@vayu','DTSTAMP:' + stamp, 'DTSTART:' + day + 'T' + h + m + '00', 'DURATION:PT10M',
    'RRULE:FREQ=DAILY;UNTIL=20270112T235959', 'SUMMARY:Fill in the 10 PM log',
    'DESCRIPTION:Hours\\, status\\, pages\\, workout\\, steps\\, push-ups\\, meals and notes. Then plan tomorrow.' + (link ? '\\n' + link : ''),
    link ? 'URL:' + link : '', 'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:Fill in the 10 PM log', 'TRIGGER:PT0M', 'END:VALARM', 'END:VEVENT', 'END:VCALENDAR'].filter(Boolean);
  return lines.join('\r\n') + '\r\n';
}
export function downloadCalendarReminder() {
  const R = reminder();
  download('vayu-' + R.time.replace(':', '') + '-log-reminder.ics', calendarICS(), 'text/calendar');
  toast('Calendar file saved · open it to add the daily ' + fmtClock(timeToMin(R.time)) + ' reminder', { icon: 'calendar', ms: 6000 });
}
