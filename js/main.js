/* Boot and global event handling: storage → store → shell → router, one delegated listener per event type,
   data binding for plan records (data-bind="sec|id|field|type"), keyboard shortcuts, live countdown seconds,
   XP / level / badge celebrations. */
import * as store from './store.js';
import { model } from './model.js';
import { $, $$, esc, plural, todayStr, debounce, isDate, addDays, now } from './util.js';
import { toast, menu, closeMenu, menuOpen, modalOpen } from './components.js';
import { drawAll } from './charts.js';
import { applyTheme, setTheme, resolvedTheme, onSystemTheme, setOpen, setPref } from './prefs.js';
import { openReview, promptWeek } from './weekly.js';
import { buildShell, layoutTabs, placeIndicator, moreMenu, moreSheet, notifications, profileMenu, shortcutsHelp } from './shell.js';
import { onRoute, render, renderSoon, currentView, current, go, prefetch } from './router.js';
import { openPalette, isOpen as paletteOpen } from './palette.js';
import { open as openQuickLog } from './quicklog.js';
import * as timer from './timer.js';
import * as pwa from './pwa.js';
import * as sync from './sync.js';
import * as focus from './focus.js';
import * as widgets from './widgets.js';

// ---------- global actions (views add their own in `actions`) ----------
const toggleTheme = () => { setTheme(resolvedTheme() === 'dark' ? 'light' : 'dark'); renderSoon(); toast((resolvedTheme() === 'dark' ? 'Dark' : 'Light') + ' theme', { icon: resolvedTheme() === 'dark' ? 'moon' : 'sun', ms: 1400 }); };
const commands = () => [
  { label: 'Fill in tonight’s 10 PM log', hint: 'Quick log · L', icon: 'logbook', fn: () => openQuickLog() },
  { label: 'Start deep focus', hint: 'Full screen · one paper, one chapter or general study', icon: 'target', fn: () => focus.openSetup() },
  { label: 'Start the focus timer', hint: 'Pomodoro, Deep Work or a short break', icon: 'timer', fn: () => timer.open() },
  { label: 'Enter mock marks', hint: 'Mock Tests', icon: 'mocks', fn: () => go('#/mocks') },
  { label: 'Open today in the Study Plan', hint: 'Mission briefing', icon: 'calcheck', fn: () => go('#/study-plan') },
  { label: (resolvedTheme() === 'dark' ? 'Light' : 'Dark') + ' theme', hint: 'Theme · T', icon: resolvedTheme() === 'dark' ? 'sun' : 'moon', fn: toggleTheme },
  { label: 'Keyboard shortcuts', hint: '?', icon: 'keyboard', fn: shortcutsHelp }
];
export const GLOBAL = {
  palette: () => openPalette(commands()),
  quicklog: (el) => openQuickLog(el && el.dataset && isDate(el.dataset.date) ? el.dataset.date : undefined),
  timer: () => (focus.active() ? focus.enter() : timer.open()),
  focus: (el) => focus.openSetup(el && el.dataset && el.dataset.subject ? { kind: 'subject', subject: el.dataset.subject, chapterId: el.dataset.chapter || '' } : undefined),
  theme: toggleTheme,
  more: (el) => moreMenu(el),
  'more-sheet': () => moreSheet({ palette: GLOBAL.palette, timer: GLOBAL.timer, theme: toggleTheme }),
  notifications: (el) => notifications(el, model()),
  profile: (el) => profileMenu(el, model(), { shortcuts: shortcutsHelp, theme: toggleTheme, install: pwa.state.installEvent ? () => pwa.install() : null }),
  'go-errors': () => go('#/errors'),
  shortcuts: shortcutsHelp,
  'plan-toggle': (el) => store.togglePlanTask(el.dataset.id, el.dataset.date, el.dataset.title, el.dataset.kind || 'plan'),
  'chapter-toggle': (el) => store.setRec('chapters', el.dataset.id, 'status', el.getAttribute('aria-checked') === 'true' ? 'pending' : 'done'),
  'workout-toggle': (el) => store.setRec('days', el.dataset.date, 'workoutDone', el.getAttribute('aria-checked') === 'true' ? null : 'Yes'),
  'task-toggle': (el) => { const t = store.get('tasks', el.dataset.id); if (t) store.patch('tasks', t.id, { done: !t.done, doneAt: !t.done ? todayStr() : null }); },
  welcome: () => store.setMeta('welcomeDismissed', true),
  review: () => { openReview(model()); renderSoon(); },
  'review-later': () => { setPref('reviewSeen', promptWeek(todayStr())); renderSoon(); }
};
function dispatch(name, el, e) {
  const v = currentView(), fn = (v && v.actions && v.actions[name]) || GLOBAL[name];
  if (fn) { e.preventDefault(); fn(el, e); return true; }
  return false;
}

// ---------- data binding: plan records ----------
function commit(el, final) {
  const [sec, id, field, type] = String(el.dataset.bind).split('|');
  let v = el.dataset.v !== undefined && el.tagName === 'BUTTON' ? el.dataset.v : el.value;
  if (type === 'num') {
    v = String(v).trim() === '' ? null : Number(v);
    if (v !== null && (!isFinite(v) || v < 0)) return;
    if (v !== null && el.max && v > +el.max) { if (!final) return; v = +el.max; el.value = v; }
  } else if (type === 'sel') v = v || null;
  else if (type === 'bool') v = !!v;
  store.setRec(sec, id, field, v);
}
document.addEventListener('input', (e) => {
  const el = e.target;
  if (el.dataset && el.dataset.bind && el.tagName !== 'SELECT' && el.type !== 'checkbox' && el.type !== 'date') commit(el, false);
  else if (el.dataset && el.dataset.input) { const v = currentView(); if (v && v.inputs && v.inputs[el.dataset.input]) v.inputs[el.dataset.input](el, e); }
});
document.addEventListener('change', (e) => {
  const el = e.target;
  if (el.dataset && el.dataset.bind) { commit(el, true); return; }
  if (el.dataset && el.dataset.navDate && isDate(el.value)) { go('#/' + el.dataset.navDate + '?date=' + el.value); return; }
  if (el.dataset && el.dataset.change) { const v = currentView(); if (v && v.changes && v.changes[el.dataset.change]) v.changes[el.dataset.change](el, e); }
});
document.addEventListener('toggle', (e) => { const d = e.target; if (d && d.tagName === 'DETAILS' && d.dataset.key) setOpen(d.dataset.key, d.open); }, true);

document.addEventListener('click', (e) => {
  const t = e.target.closest('button, [data-act], [role="tab"]');
  if (!t || t.disabled || t.getAttribute('aria-disabled') === 'true') return;
  if (t.dataset.step) {
    const inp = document.getElementById(t.dataset.for); if (!inp) return;
    const v = Math.max(0, Math.min(24, (parseFloat(inp.value) || 0) + parseFloat(t.dataset.step)));
    inp.value = v ? String(v) : ''; commit(inp, true); return;
  }
  if (t.dataset.bind && t.tagName === 'BUTTON') {
    const [sec, id, field, type] = t.dataset.bind.split('|'), pressed = t.getAttribute('aria-pressed') === 'true';
    if (type === 'bool') store.setRec(sec, id, field, !pressed);
    else store.setRec(sec, id, field, pressed && !(sec === 'chapters' && field === 'status') ? null : t.dataset.v);
    // groups inside modals are not re-rendered: update their pressed state here
    $$('[data-bind="' + t.dataset.bind + '"]').forEach((b) => b.setAttribute('aria-pressed', String(b === t ? (type === 'bool' ? !pressed : !pressed || (sec === 'chapters' && field === 'status')) : false)));
    return;
  }
  if (t.dataset.seg) { const v = currentView(); const fn = v && v.segs && v.segs[t.dataset.seg]; if (fn) { fn(t.dataset.v, t); renderSoon(); } return; }
  if (t.getAttribute('role') === 'tab' && t.dataset.tab) { const v = currentView(); const fn = v && v.tabs && v.tabs[t.dataset.tab]; if (fn) { fn(t.dataset.v, t); renderSoon(); setTimeout(() => { const n = document.getElementById(t.id); if (n) n.focus(); }, 30); } return; }
  if (t.dataset.act) dispatch(t.dataset.act, t, e);
});

// ---------- keyboard ----------
let gPending = 0;
document.addEventListener('keydown', (e) => {
  const tgt = e.target, inField = /^(INPUT|TEXTAREA|SELECT)$/.test(tgt.tagName) || tgt.isContentEditable;
  if ((e.key === 'k' || e.key === 'K') && (e.ctrlKey || e.metaKey)) { e.preventDefault(); if (!paletteOpen()) GLOBAL.palette(); return; }
  // arrow keys inside a tablist
  if (tgt.getAttribute && tgt.getAttribute('role') === 'tab' && (e.key === 'ArrowRight' || e.key === 'ArrowLeft' || e.key === 'Home' || e.key === 'End')) {
    const list = $$('[role="tab"]', tgt.closest('[role="tablist"]')), i = list.indexOf(tgt);
    const n = e.key === 'Home' ? list[0] : e.key === 'End' ? list[list.length - 1] : list[(i + (e.key === 'ArrowRight' ? 1 : -1) + list.length) % list.length];
    e.preventDefault(); n.click(); return;
  }
  if (e.key === 'Escape' && menuOpen()) { closeMenu(); return; }
  if (inField || e.ctrlKey || e.metaKey || e.altKey || modalOpen() || paletteOpen() || document.body.classList.contains('modal-open')) return;
  const k = e.key.toLowerCase();
  if (gPending) {
    clearTimeout(gPending); gPending = 0;
    const to = { d: 'dashboard', p: 'study-plan', l: 'log', m: 'mocks', s: 'subjects', a: 'analytics', w: 'winter-arc', c: 'calendar' }[k];
    if (to) { e.preventDefault(); go('#/' + to); }
    return;
  }
  if (k === 'g') { gPending = setTimeout(() => { gPending = 0; }, 900); return; }
  if (e.key === '/') { e.preventDefault(); GLOBAL.palette(); }
  else if (k === 'l') { e.preventDefault(); openQuickLog(); }
  else if (k === 't') { e.preventDefault(); toggleTheme(); }
  else if (e.key === '?') { e.preventDefault(); shortcutsHelp(); }
  else if (e.key === '[' || e.key === ']') { const v = currentView(); if (v && v.step) { e.preventDefault(); v.step(e.key === ']' ? 1 : -1, current().q); } }
});

// ---------- live countdown seconds ----------
function tickCountdowns() {
  $$('[data-cd-at]').forEach((box) => {
    const ms = Math.max(0, +box.dataset.cdAt - now().getTime()), s = Math.floor(ms / 1000);
    const p = { d: Math.floor(s / 86400), h: Math.floor((s % 86400) / 3600), m: Math.floor((s % 3600) / 60), s: s % 60 };
    ['d', 'h', 'm', 's'].forEach((k) => { const el = box.querySelector('[data-cd="' + k + '"]'); const v = k === 'd' ? String(p.d) : String(p[k]).padStart(2, '0'); if (el && el.textContent !== v) el.textContent = v; });
  });
}

// ---------- celebrations: XP, level, badges ----------
let last = null, quiet = false;
const celebrate = debounce(() => {
  const M = model();
  if (last && !quiet) {
    const gained = Math.round(M.xp - last.xp);
    if (M.level > last.level) toast('Level up · level ' + M.level + ' · ' + String(M.rank ? M.rank.name : '').replace(/^\S+\s/, ''), { icon: 'award', ms: 4500 });
    else if (gained > 0) toast('+' + gained.toLocaleString('en-IN') + ' XP', { icon: 'sparkles', ms: 1600 });
    M.badges.forEach((b, i) => { if (b.on && last.badges[i] === false) toast('Badge unlocked · ' + b.name, { icon: 'trophy', ms: 4500 }); });
  }
  quiet = false;
  last = { xp: M.xp, level: M.level, badges: M.badges.map((b) => b.on) };
}, 650);

// ---------- links that run an action: #/dashboard?do=timer (app shortcut, Windows widget) ----------
function deepAction() {
  const m = /[?&]do=(timer|quicklog|focus)\b/.exec(location.hash);
  if (!m) return;
  history.replaceState(null, '', location.pathname + location.search + location.hash.replace(/([?&])do=\w+&?/, '$1').replace(/[?&]$/, ''));
  GLOBAL[m[1]]();
}

// ---------- boot ----------
async function boot() {
  applyTheme();
  buildShell();
  let kind;
  try { kind = await store.init(); }
  catch (e) { console.error(e); $('#main').innerHTML = '<div class="banner">' + esc('Couldn’t open your data: ' + e.message) + '</div>'; return; }
  store.subscribe((info) => { if (info && info.coll === '*') quiet = true; renderSoon(); celebrate(); widgets.refresh(); });
  window.addEventListener('hashchange', () => onRoute().then(deepAction));
  if (!location.hash) history.replaceState(null, '', location.pathname + location.search + '#/dashboard');
  await onRoute();
  deepAction();
  focus.resume();   // a deep focus session survives a reload
  celebrate();
  document.body.classList.add('ready');
  if (kind === 'memory') { $('#banner').innerHTML = '<div class="banner" role="alert">This browser is blocking storage, so changes won’t survive a reload. Download a backup from Tools before closing.</div>'; }
  onSystemTheme(() => renderSoon());
  setInterval(() => { timer.tick(); tickCountdowns(); }, 1000);
  timer.tick();
  // installable offline app + the 10 PM reminder
  pwa.registerSW((hash) => go(hash));
  pwa.onChange(() => renderSoon());
  // sync between devices (Settings → Sync between devices); does nothing until you connect it
  sync.onChange(() => renderSoon());
  sync.start();
  // the Windows widgets' snapshot and the app-icon badge
  widgets.refresh();
  const remind = () => { widgets.refresh(); pwa.checkReminder(() => openQuickLog()).catch((e) => console.warn('[reminder]', e)); };
  let day = todayStr();
  setInterval(() => { if (todayStr() !== day) { day = todayStr(); render('update'); } remind(); }, 30000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { if (todayStr() !== day) { day = todayStr(); render('update'); } remind(); } });
  setTimeout(remind, 2500);
  window.addEventListener('resize', debounce(() => { drawAll($('#main'), false); layoutTabs(); }, 150));
  const onScroll = () => document.body.classList.toggle('scrolled', window.scrollY > 8);
  window.addEventListener('scroll', onScroll, { passive: true }); onScroll();
  (window.requestIdleCallback || ((f) => setTimeout(f, 1500)))(() => prefetch());
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { layoutTabs(); placeIndicator(); });
}
boot();

export { plural, addDays };
