/* Hash router: #/route?key=value. Views are ES modules loaded on first visit (and prefetched when idle).
   Rendering keeps the field you are typing in, its caret, the scroll position and open <details>;
   entering a tab cross-fades (View Transitions where supported) and plays the enter animations once. */
import { $, esc, raw, reducedMotion, fmtLong, todayStr, asOf } from './util.js';
import { icon } from './icons.js';
import { model } from './model.js';
import { closeMenu, countUp } from './components.js';
import { resetSpecs, drawAll } from './charts.js';
import { ROUTES, routeById, updateShell } from './shell.js';
import { setPref } from './prefs.js';

const VIEWS = {
  dashboard: () => import('./views/dashboard.js'),
  'study-plan': () => import('./views/study-plan.js'),
  log: () => import('./views/daily-log.js'),
  mocks: () => import('./views/mocks.js'),
  subjects: () => import('./views/subjects.js'),
  revision: () => import('./views/revision.js'),
  errors: () => import('./views/errors.js'),
  goals: () => import('./views/goals.js'),
  habits: () => import('./views/habits.js'),
  'winter-arc': () => import('./views/winter-arc.js'),
  'run-5k': () => import('./views/run-5k.js'),
  analytics: () => import('./views/analytics.js'),
  notes: () => import('./views/notes.js'),
  journal: () => import('./views/journal.js'),
  finance: () => import('./views/finance.js'),
  health: () => import('./views/health.js'),
  resources: () => import('./views/resources.js'),
  calendar: () => import('./views/calendar.js'),
  tools: () => import('./views/tools.js'),
  settings: () => import('./views/settings.js')
};
const NEXT = {};
const cache = {};
let cur = { id: null, q: {} }, view = null, rendered = false, renderSeq = 0;
export const current = () => cur;
export const currentView = () => view;

export function parseHash() {
  const h = (location.hash || '').replace(/^#\/?/, '');
  const qi = h.indexOf('?'), path = qi >= 0 ? h.slice(0, qi) : h, qs = qi >= 0 ? h.slice(qi + 1) : '';
  const q = {};
  qs.split('&').forEach((p) => { if (!p) return; const i = p.indexOf('='); q[decodeURIComponent(i >= 0 ? p.slice(0, i) : p)] = decodeURIComponent(i >= 0 ? p.slice(i + 1) : ''); });
  return { id: ROUTES.some((r) => r.id === path) ? path : 'dashboard', q };
}
export const go = (hash) => { if (location.hash === hash) onRoute(); else location.hash = hash; };

function placeholder(id) {
  const r = routeById(id), n = NEXT[id] || 3;
  return {
    render: () => raw('<section class="card coming">' + icon(r.icon) + '<div><h2 style="font-size:18px">' + esc(r.title) + ' arrives in build ' + n + ' of 3</h2><p class="muted" style="margin-top:6px;max-width:52ch">Everything you log today is already saved on this device and will appear here when this tab is built.</p></div><div class="row wrap" style="justify-content:center"><a class="btn primary" href="#/dashboard">' + icon('dashboard') + 'Dashboard</a><a class="btn" href="#/log">' + icon('logbook') + 'Daily Log</a></div></section>')
  };
}
async function load(id) {
  if (!VIEWS[id]) return placeholder(id);
  if (!cache[id]) cache[id] = (await VIEWS[id]()).default;
  return cache[id];
}
export function prefetch() { Object.keys(VIEWS).forEach((k) => { if (!cache[k]) VIEWS[k]().then((m) => { cache[k] = m.default; }).catch(() => {}); }); }

export async function onRoute() {
  const r = parseHash(), changed = r.id !== cur.id;
  cur = r;
  closeMenu();
  view = await load(r.id);
  if (view.enter) view.enter(r.q);
  render(changed ? 'enter' : 'query');
  if (changed) { window.scrollTo(0, 0); const m = $('#main'); try { m.focus({ preventScroll: true }); } catch (e) { m.focus(); } }
  setPref('lastRoute', r.id);
}

// keep the field being typed in: the live element is moved into the new markup
function withFocus(fn) {
  const a = document.activeElement, main = $('#main');
  const id = a && a !== document.body && main.contains(a) ? a.id : '';
  const isField = !!(id && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) && a.type !== 'file');
  let s = null, e = null;
  if (isField) { try { if (typeof a.selectionStart === 'number') { s = a.selectionStart; e = a.selectionEnd; } } catch (x) { /* not a text field */ } }
  fn();
  if (!id) return;
  const n = document.getElementById(id);
  if (!n) return;
  if (isField && n !== a) {
    n.replaceWith(a);
    try { a.focus({ preventScroll: true }); } catch (x) { a.focus(); }
    try { if (s != null) a.setSelectionRange(s, e); } catch (x) { /* number inputs */ }
  } else if (n !== document.activeElement) { try { n.focus({ preventScroll: true }); } catch (x) { /* gone */ } }
}

function head(M, r, h) {
  const asof = asOf() ? '<p class="asof">' + icon('clock') + '<span>Viewing as ' + esc(fmtLong(todayStr())) + '</span><a href="' + esc(location.pathname) + location.hash + '">Back to today</a></p>' : '';
  return asof + '<div class="page-head"><div class="grow">' + (h.eyebrow ? '<p class="eyebrow">' + String(h.eyebrow) + '</p>' : '') +
    '<h1>' + String(h.title || esc(r.title)) + '</h1>' + (h.sub !== undefined ? (h.sub ? '<p class="page-sub">' + String(h.sub) + '</p>' : '') : r.sub ? '<p class="page-sub">' + esc(r.sub) + '</p>' : '') + '</div>' +
    (h.actions ? '<div class="page-actions">' + String(h.actions) + '</div>' : '') + '</div>';
}

export function render(mode) {
  if (!view) return;
  const M = model(), r = routeById(cur.id), enter = mode === 'enter';
  resetSpecs();
  const body = String(view.render(M, cur.q));
  const markup = head(M, r, view.head ? view.head(M, cur.q) : {}) + '<div class="page' + (enter ? ' anim' : '') + '" data-view="' + r.id + '">' + body + '</div>';
  const main = $('#main'), y = window.scrollY, token = ++renderSeq;
  let applied = false;
  const apply = () => {
    if (applied || token !== renderSeq) return;
    applied = true;
    withFocus(() => { main.innerHTML = markup; });
    const page = $('.page', main);
    if (enter) countUp(main);
    drawAll(main, enter);
    if (view.after) { try { view.after(page, M, cur.q); } catch (e) { console.error(e); } }
    updateShell(M, r.id);
    document.title = (r.id === 'dashboard' ? '' : r.title + ' · ') + 'Vayu';
    if (!enter && window.scrollY !== y) window.scrollTo(0, y);
  };
  if (enter && rendered && document.startViewTransition && !reducedMotion() && !document.hidden) {
    try {
      const vt = document.startViewTransition(apply);
      // a skipped or aborted transition (newer navigation, hidden window) must never leave the old page on screen
      [vt.ready, vt.finished].forEach((p) => p && p.catch(() => {}));
      if (vt.updateCallbackDone) vt.updateCallbackDone.catch(() => apply());
      setTimeout(apply, 400);
    } catch (e) { apply(); }
  } else apply();
  rendered = true;
}
let rq = 0, rqT = 0;
export function renderSoon() {
  if (rq) return;
  const run = () => { if (!rq) return; cancelAnimationFrame(rq); clearTimeout(rqT); rq = 0; render('update'); };
  rq = requestAnimationFrame(run) || 1;
  rqT = setTimeout(run, 120);
}
