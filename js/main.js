/* Boot and global event handling: storage → store → shell → router, one delegated listener per event type,
   data binding for plan records (data-bind="sec|id|field|type"), keyboard shortcuts, live countdown seconds,
   XP / level / badge celebrations, the voice (voice.js: greeting, daily briefing, praise; Brief me · V) and
   Hyper study mode (hyper.js: one full screen with the timer, subjects, today and the days left · P). */
import * as store from './store.js';
import { model } from './model.js';
import { $, $$, esc, plural, todayStr, debounce, isDate, addDays, now, nowMin } from './util.js';
import { toast, menu, closeMenu, menuOpen, modalOpen } from './components.js';
import { drawAll } from './charts.js';
import { applyTheme, setTheme, resolvedTheme, onSystemTheme, setOpen, setPref, pref } from './prefs.js';
import { openReview, promptWeek } from './weekly.js';
import { buildShell, layoutTabs, placeIndicator, moreMenu, moreSheet, notifications, profileMenu, shortcutsHelp, quickMenu } from './shell.js';
import { openCustomise } from './dashlayout.js';
import { applyReplan, resetReplan } from './replan.js';
import { openCardForm } from './cards.js';
import { onRoute, render, renderSoon, currentView, current, go, prefetch } from './router.js';
import { openPalette, isOpen as paletteOpen } from './palette.js';
import { open as openQuickLog } from './quicklog.js';
import * as timer from './timer.js';
import * as pwa from './pwa.js';
import * as sync from './sync.js';
import * as focus from './focus.js';
import * as contentui from './contentui.js';
import { contentOn } from './content.js';
import { whatNow, revisionItem } from './whatnow.js';
import * as widgets from './widgets.js';
import * as voice from './voice.js';
import * as hyper from './hyper.js';

// ---------- global actions (views add their own in `actions`) ----------
const toggleTheme = () => { setTheme(resolvedTheme() === 'dark' ? 'light' : 'dark'); renderSoon(); toast((resolvedTheme() === 'dark' ? 'Dark' : 'Light') + ' theme', { icon: resolvedTheme() === 'dark' ? 'moon' : 'sun', ms: 1400 }); };
// "What now?": start the chosen task (a chapter or revision opens Deep focus already set up)
function runNow(it) {
  if (it.focus) { if (!focus.active()) timer.startFocus(it.mins, it.focus); focus.enter(); }
  else if (it.log) openQuickLog();
  else if (it.setup) focus.openSetup();
  else if (it.href) go(it.href);
}
// the voice (voice.js): "Brief me" always speaks; the switch turns the greeting, briefing and praise on or off
const briefMe = () => { if (!voice.supported()) { toast('This browser can’t speak. Try Chrome or Edge.', { tone: 'warn' }); return; } voice.brief(); };
// Hyper study (P): one full screen for studying; from the deep focus screen it takes over the running session
const toggleHyper = () => { if (focus.shown()) { focus.hide(); hyper.open(); } else hyper.toggle(); };
const toggleVoice = () => {
  voice.set('voiceOn', !voice.on());
  toast(voice.on() ? 'Voice on · greeting, praise and the daily briefing' : 'Voice off · Brief me still reads the day out', { icon: voice.on() ? 'volume' : 'volumeX', ms: 2200 });
  if (voice.on()) voice.say('Hellooo, ' + (String(model().st.player || '').trim().split(/\s+/)[0] || 'there') + '! I’m back.', 'greet');
};
const commands = () => [
  { label: 'What now?', hint: 'The best thing to do right now', icon: 'zap', fn: () => runNow(whatNow(model(), nowMin()).top) },
  { label: 'Brief me about today', hint: 'Voice · today’s goal, blocks and what’s next · V', icon: 'volume', fn: briefMe },
  { label: hyper.isOpen() ? 'Leave Hyper study' : 'Hyper study mode', hint: 'Full screen · timer, subjects, today’s goal, days left · P', icon: 'maximize', fn: toggleHyper },
  voice.supported() ? { label: voice.on() ? 'Turn the voice off' : 'Turn the voice on', hint: 'Greeting, praise and the daily briefing on this device', icon: voice.on() ? 'volumeX' : 'volume', fn: toggleVoice } : null,
  { label: 'Fill in tonight’s 10 PM log', hint: 'Quick log · L', icon: 'logbook', fn: () => openQuickLog() },
  { label: 'Start deep focus', hint: 'Full screen · one paper, one chapter or general study', icon: 'target', fn: () => focus.openSetup() },
  { label: 'Start the focus timer', hint: 'Pomodoro, Deep Work or a short break', icon: 'timer', fn: () => timer.open() },
  { label: 'Enter mock marks', hint: 'Mock Tests', icon: 'mocks', fn: () => go('#/mocks') },
  { label: 'Open today in the Study Plan', hint: 'Mission briefing', icon: 'calcheck', fn: () => go('#/study-plan') },
  { label: (resolvedTheme() === 'dark' ? 'Light' : 'Dark') + ' theme', hint: 'Theme · T', icon: resolvedTheme() === 'dark' ? 'sun' : 'moon', fn: toggleTheme },
  { label: 'Keyboard shortcuts', hint: '?', icon: 'keyboard', fn: shortcutsHelp }
].filter(Boolean);
export const GLOBAL = {
  palette: () => openPalette(commands()),
  quicklog: (el) => openQuickLog(el && el.dataset && isDate(el.dataset.date) ? el.dataset.date : undefined),
  timer: () => (focus.active() ? focus.enter() : timer.open()),
  'ct-log': () => contentui.logUpload(),
  'ct-plan': () => contentui.planVideo(),
  'ct-up': (el) => contentui.markUploaded(el.dataset.id),
  'ct-edit': (el) => contentui.editEntry(el.dataset.id),
  'ct-targets': () => contentui.setTargets(model().st),
  'sync-refresh': async () => { try { const r = await sync.syncNow('manual'); toast(r && r.pulled ? 'Synced · ' + plural(r.pulled, 'update') + ' from your other device' : 'Up to date', { icon: 'sync', ms: 2000 }); } catch (e) { toast(e.message, { tone: e.kind === 'offline' ? 'warn' : 'bad', ms: 6000 }); } },
  'now-go': (el) => { const W = whatNow(model(), nowMin()), it = [W.top].concat(W.also).find((x) => x.id === el.dataset.id); if (it) runNow(it); },
  'rev-focus': (el) => { const M = model(), x = M.revq.byId[el.dataset.id]; if (x) runNow(revisionItem(M, x, +(M.st.timer || {}).pomodoro || 25)); },
  focus: (el) => focus.openSetup(el && el.dataset && el.dataset.subject ? { kind: 'subject', subject: el.dataset.subject, chapterId: el.dataset.chapter || '' } : undefined),
  theme: toggleTheme,
  more: (el) => moreMenu(el),
  'more-sheet': () => moreSheet({ palette: GLOBAL.palette, timer: GLOBAL.timer, theme: toggleTheme, hyper: toggleHyper }),
  notifications: (el) => notifications(el, model()),
  profile: (el) => profileMenu(el, model(), { shortcuts: shortcutsHelp, theme: toggleTheme, install: pwa.state.installEvent ? () => pwa.install() : null, voice: voice.supported() ? { on: voice.on(), fn: toggleVoice } : null }),
  brief: briefMe,
  hyper: toggleHyper,
  'voice-toggle': toggleVoice,
  'go-errors': () => go('#/errors'),
  shortcuts: shortcutsHelp,
  'plan-toggle': (el) => store.togglePlanTask(el.dataset.id, el.dataset.date, el.dataset.title, el.dataset.kind || 'plan'),
  'chapter-toggle': (el) => store.setRec('chapters', el.dataset.id, 'status', el.getAttribute('aria-checked') === 'true' ? 'pending' : 'done'),
  'workout-toggle': (el) => store.setRec('days', el.dataset.date, 'workoutDone', el.getAttribute('aria-checked') === 'true' ? null : 'Yes'),
  'task-toggle': (el) => { const t = store.get('tasks', el.dataset.id); if (t) store.patch('tasks', t.id, { done: !t.done, doneAt: !t.done ? todayStr() : null }); },
  welcome: () => store.setMeta('welcomeDismissed', true),
  review: () => { openReview(model()); renderSoon(); },
  'review-later': () => { setPref('reviewSeen', promptWeek(todayStr())); renderSoon(); },
  'dash-customise': () => openCustomise(() => renderSoon()),
  // catch-up dates: Study Plan's Catch up card and the Dashboard's overdue rescue
  'replan-apply': () => applyReplan(),
  'replan-reset': () => resetReplan()
};

// ---------- hold the + (bottom bar, dock) for the quick actions; a plain tap still opens the quick log ----------
const QUICK = {
  now: () => runNow(whatNow(model(), nowMin()).top),
  log: () => openQuickLog(),
  focus: () => focus.openSetup(),
  marks: () => go('#/mocks'),
  mistake: () => go('#/errors?add=1'),
  card: () => openCardForm(null, {}),
  hyper: toggleHyper,
  brief: briefMe
};
let holdT = 0, held = false, holdAt = null;
const openQuick = (b) => { held = true; clearTimeout(holdT); try { if (navigator.vibrate) navigator.vibrate(10); } catch (x) { /* no vibration */ } quickMenu(b, QUICK); };
document.addEventListener('pointerdown', (e) => {
  held = false; clearTimeout(holdT);
  const b = e.target.closest('[data-hold]'); if (!b || e.button > 0) return;
  holdAt = [e.clientX, e.clientY];
  holdT = setTimeout(() => openQuick(b), 450);
});
document.addEventListener('pointermove', (e) => { if (holdAt && Math.hypot(e.clientX - holdAt[0], e.clientY - holdAt[1]) > 12) clearTimeout(holdT); }, { passive: true });
['pointerup', 'pointercancel'].forEach((ev) => document.addEventListener(ev, () => { clearTimeout(holdT); holdAt = null; }));
document.addEventListener('contextmenu', (e) => { const b = e.target.closest('[data-hold]'); if (!b) return; e.preventDefault(); if (!held) openQuick(b); });
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
  if (t.dataset.hold && held) { held = false; e.preventDefault(); return; }   // the hold opened the quick actions
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
  // in Hyper study: Esc leaves, Space starts or pauses the timer (unless a button or link has the focus)
  if (hyper.isOpen() && !focus.shown() && !gPending) {
    if (e.key === 'Escape') { e.preventDefault(); hyper.close(); return; }
    if (e.key === ' ' && !tgt.closest('button, a, summary, [role="checkbox"]')) { e.preventDefault(); hyper.toggleTimer(); return; }
  }
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
  else if (k === 'p') { e.preventDefault(); toggleHyper(); }   // Hyper study mode, again to leave
  else if (k === 'v') { e.preventDefault(); if (voice.speaking()) voice.stop(); else briefMe(); }   // Brief me, again to stop
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

// Piyush on Finance appears on 13 Jan: the goal is created (store.releaseCheck) and each device says so once
function checkRelease() {
  store.releaseCheck();
  if (contentOn(todayStr()) && !store.S.meta.contentSeen) {
    store.setMeta('contentSeen', true, true);
    toast('Piyush on Finance is live. Your new goal and upload tracker are in Goals.', { icon: 'video', ms: 9000, action: { label: 'Open', fn: () => go('#/goals') } });
  }
}
// once per device: what changed in getting around
function navNews() {
  if (pref('navNews')) return;
  setPref('navNews', 1);
  setTimeout(() => toast('New: section chips on long pages, your own shortcuts, and hold + for quick actions', { icon: 'sparkles', ms: 10000, action: { label: 'Set up', fn: () => go('#/settings?nav=1') } }), 1800);
}
// once per device: the voice is here
function voiceNews() {
  if (pref('voiceNews') || !voice.supported()) return;
  setPref('voiceNews', 1);
  setTimeout(() => toast('New: Vayu has a voice. She greets you, briefs you on the day and cheers what you finish.', { icon: 'volume', ms: 10000, action: { label: 'Voice settings', fn: () => go('#/settings?voice=1') } }), 2200);
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
  if (pref('hyper')) hyper.open(); else focus.resume();   // Hyper study and a deep focus session survive a reload
  checkRelease();
  navNews();
  celebrate();
  // the voice: greets on your first tap, briefs you once a day, cheers what you finish (Settings → Voice)
  voice.onChange(() => { if (current() && current().id === 'settings') renderSoon(); });
  voice.start();
  voiceNews();
  document.body.classList.add('ready');
  if (kind === 'memory') { $('#banner').innerHTML = '<div class="banner" role="alert">This browser is blocking storage, so changes won’t survive a reload. Download a backup from Tools before closing.</div>'; }
  onSystemTheme(() => renderSoon());
  setInterval(() => { timer.tick(); tickCountdowns(); }, 1000);
  timer.tick();
  // installable offline app + the 10 PM reminder
  pwa.registerSW((hash) => go(hash));
  pwa.onChange(() => renderSoon());
  // sync between devices (Settings → Sync between devices); does nothing until you connect it
  // the sync line updates in place; a full redraw only when the Settings card or the connection itself changes
  let syncKey = '';
  const syncLines = () => $$('[data-sync-ago]').forEach((el) => { const t = sync.statusText(); if (el.textContent !== t) el.textContent = t; });
  sync.onChange(() => {
    const key = sync.connected() + '|' + (sync.state.kind || '');
    if (key !== syncKey || (current() && current().id === 'settings')) { syncKey = key; renderSoon(); } else syncLines();
  });
  setInterval(syncLines, 15000);
  sync.start();
  // the Windows widgets' snapshot and the app-icon badge
  widgets.refresh();
  const remind = () => { widgets.refresh(); pwa.checkReminder(() => openQuickLog()).catch((e) => console.warn('[reminder]', e)); };
  let day = todayStr();
  setInterval(() => { if (todayStr() !== day) { day = todayStr(); checkRelease(); render('update'); } remind(); }, 30000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { if (todayStr() !== day) { day = todayStr(); checkRelease(); render('update'); } remind(); } });
  setTimeout(remind, 2500);
  window.addEventListener('resize', debounce(() => { drawAll($('#main'), false); layoutTabs(); }, 150));
  const onScroll = () => document.body.classList.toggle('scrolled', window.scrollY > 8);
  window.addEventListener('scroll', onScroll, { passive: true }); onScroll();
  (window.requestIdleCallback || ((f) => setTimeout(f, 1500)))(() => prefetch());
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { layoutTabs(); placeIndicator(); });
}
boot();

export { plural, addDays };
