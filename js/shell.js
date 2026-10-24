/* App chrome: the route table (single source for nav, More menu, bottom bar, palette and titles), the floating pill nav
   with priority+ overflow, the icon dock, the phone bottom bar, the live countdown pill, notifications and the profile menu. */
import { html, raw, esc, $, $$, plural, fmtDS, todayStr, diff, now } from './util.js';
import { icon } from './icons.js';
import { menu, modal } from './components.js';
import { resolvedTheme } from './prefs.js';
import * as store from './store.js';
import * as sync from './sync.js';

export const ROUTES = [
  { id: 'dashboard', title: 'Dashboard', icon: 'dashboard', group: 1 },
  { id: 'goals', title: 'Goals', icon: 'target', group: 1, sub: 'Goals, milestones and tasks' },
  { id: 'study-plan', title: 'Study Plan', icon: 'calcheck', group: 1, sub: 'All 110 days of the plan, one at a time' },
  { id: 'log', title: 'Daily Log', icon: 'logbook', group: 1, sub: 'Your 10 PM log, quick entries through the day and recent history' },
  { id: 'subjects', title: 'Subjects', icon: 'book', group: 1, sub: '105 chapters across the six papers' },
  { id: 'revision', title: 'Revision', icon: 'revision', group: 1, sub: 'R2 and R3 coverage and what to revise next' },
  { id: 'mocks', title: 'Mock Tests', icon: 'mocks', group: 1, sub: '27 full papers, written by hand · all done by 19 Dec' },
  { id: 'errors', title: 'Error Book', icon: 'alert', group: 1, sub: 'Every lost mark by paper and error type · review 20 minutes a day' },
  { id: 'notes', title: 'Notes', icon: 'notes', group: 1, examHide: true, sub: 'Notes and your formula sheet' },
  { id: 'habits', title: 'Habit Tracker', icon: 'habits', group: 1, examHide: true, sub: 'Daily habits, streaks and completion' },
  { id: 'journal', title: 'Journal', icon: 'journal', group: 2, sub: 'Mood, reflections and voice notes · one page a day' },
  { id: 'finance', title: 'Finance', icon: 'finance', group: 2, sub: 'Income, spending and savings' },
  { id: 'health', title: 'Health & Lifestyle', icon: 'health', group: 2, sub: 'Running, workouts, steps, push-ups and the Winter Arc' },
  { id: 'run-5k', title: '5K Run', icon: 'activity', group: 2, sub: '5 km in 30:00 on 28 Nov · plan, run log and progress' },
  { id: 'winter-arc', title: 'Winter Arc', icon: 'snow', group: 2, sub: 'Your 92-day challenge, levels, ranks and badges' },
  { id: 'resources', title: 'Resources', icon: 'folder', group: 2, sub: 'Links, books and study material' },
  { id: 'calendar', title: 'Calendar', icon: 'calendar', group: 2, sub: 'Everything on your timeline' },
  { id: 'analytics', title: 'Analytics', icon: 'analytics', group: 3, sub: 'Readiness, trends and consistency' },
  { id: 'tools', title: 'Tools', icon: 'tools', group: 3, sub: 'Focus timer, backup and restore' },
  { id: 'settings', title: 'Settings', icon: 'settings', group: 3, sub: 'Theme, profile, plan targets and XP rules' }
];
export const routeById = (id) => ROUTES.find((r) => r.id === id) || ROUTES[0];
const examOn = () => { const st = store.settings(); return !!st.examMode && todayStr() <= (st.examModeEnd || '2027-01-12'); };
export const errDue = (e, t) => !e.fixed && (!e.reviewedAt || diff(e.reviewedAt, t) >= 3);
const inPill = (r) => r.group === 1 && !(examOn() && r.examHide);

// Vayu: a V with arms raised in flight and a dot riding the wind above its right arm
const BRAND = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 6l5.6 12 5.6-12" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/><circle cx="19.7" cy="4.9" r="1.8" fill="currentColor"/></svg>';

let builtExam = null;
export function buildShell() {
  builtExam = examOn();
  $('#brand-mark').innerHTML = BRAND;
  const tabs = $('#tabs');
  tabs.innerHTML = '<span class="tab-ind" aria-hidden="true"></span>' +
    ROUTES.filter(inPill).map((r) => '<a class="tab" href="#/' + r.id + '" data-route="' + r.id + '">' + esc(r.title) + '<span class="count" data-count-for="' + r.id + '" hidden></span></a>').join('') +
    '<button type="button" class="tab more" data-act="more" aria-haspopup="menu" aria-expanded="false">More' + icon('chevD') + '</button>';
  $('#dock').innerHTML =
    '<button type="button" data-act="palette" data-tip="Search · Ctrl K" aria-label="Search and commands (Ctrl K)">' + icon('search') + '</button>' +
    '<button type="button" data-act="quicklog" data-tip="Quick log · L" aria-label="Quick log (L)">' + icon('plus') + '</button>' +
    '<button type="button" data-act="timer" data-tip="Focus timer" aria-label="Focus timer" id="dock-timer">' + icon('timer') + '</button>' +
    '<button type="button" data-act="go-errors" data-tip="Error Book" aria-label="Error Book" id="dock-errors">' + icon('alert') + '</button>' +
    '<hr>' +
    '<button type="button" data-act="theme" data-tip="Theme · T" aria-label="Switch theme (T)" id="dock-theme"></button>';
  $('#bottombar').innerHTML =
    bb('dashboard', 'Home', 'home') + bb('study-plan', 'Plan', 'calcheck') +
    '<button type="button" class="bb-add" data-act="quicklog" aria-label="Quick log">' + icon('plus') + '</button>' +
    bb('mocks', 'Mocks', 'mocks') +
    '<button type="button" class="bb-item" data-act="more-sheet" aria-label="All sections">' + icon('menu') + '<span>More</span></button>';
}
const bb = (id, label, ic) => '<a class="bb-item" href="#/' + id + '" data-route="' + id + '">' + icon(ic) + '<span>' + label + '</span></a>';

let lastRoute = 'dashboard';
export function updateShell(M, routeId) {
  lastRoute = routeId;
  if (examOn() !== builtExam) buildShell();   // exam mode moved tabs between the bar and More
  $$('[data-route]').forEach((a) => { const on = a.dataset.route === routeId; if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
  const more = $('#tabs .more');
  const inMore = !ROUTES.filter(inPill).some((r) => r.id === routeId) || ($('#tabs [data-route="' + routeId + '"]') || {}).classList?.contains('is-overflow');
  if (more) { if (inMore) more.setAttribute('aria-current', 'page'); else more.removeAttribute('aria-current'); }
  // counts on tabs: overdue chapters, mocks waiting for marks, mistakes due
  const setCount = (id, n) => { const el = $('[data-count-for="' + id + '"]'); if (el) { el.hidden = !n; el.textContent = n || ''; } };
  setCount('subjects', M.overdueCount);
  setCount('mocks', M.mocks.filter((m) => m.status === 'missed' || (m.status === 'today')).length);
  const due = store.list('errors').filter((e) => errDue(e, M.t)).length;
  setCount('errors', due);
  const db = $('#dock-errors');
  if (db) db.innerHTML = String(icon('alert')) + (due ? '<span class="badge">' + due + '</span>' : '');
  // live countdown pill
  const live = $('#live'), ms = M.examAt - now(), d = M.daysToExam();
  live.innerHTML = '<i aria-hidden="true"></i>' + (d >= 1 ? esc(plural(d, 'day')) + ' to P1' : ms > 0 ? esc(Math.ceil(ms / 36e5) + ' h to P1') : M.t <= '2027-01-12' ? 'Exams under way' : 'Exams done');
  live.setAttribute('aria-label', d > 0 ? d + ' days to Paper 1 on ' + fmtDS(M.st.examDate) : 'Exam window');
  // bell + avatar + theme
  const n = M.notifications.length, bell = $('#bell');
  bell.innerHTML = String(icon('bell')) + (n ? '<span class="dot" aria-hidden="true"></span>' : '');
  bell.setAttribute('aria-label', 'Notifications' + (n ? ' (' + n + ')' : ''));
  $('#avatar').textContent = (M.st.player || 'P').trim().charAt(0).toUpperCase();
  const th = $('#dock-theme');
  if (th) { th.innerHTML = String(icon(resolvedTheme() === 'dark' ? 'sun' : 'moon')); th.dataset.tip = (resolvedTheme() === 'dark' ? 'Light' : 'Dark') + ' theme · T'; }
  layoutTabs();
}

// priority+: Group 1 tabs that don't fit at this width move into More
export function layoutTabs() {
  const tabs = $('#tabs'); if (!tabs || getComputedStyle(tabs).display === 'none') return;
  const items = $$('.tab[data-route]', tabs), more = $('.tab.more', tabs), bar = $('#topbar');
  items.forEach((t) => t.classList.remove('is-overflow'));
  const avail = bar.clientWidth - $('.brand', bar).offsetWidth - $('.top-right', bar).offsetWidth - 20 - 10 - more.offsetWidth;
  let used = 0;
  items.forEach((t) => { used += t.offsetWidth; if (used > avail) t.classList.add('is-overflow'); });
  // keep the active tab visible when it fits by giving up an earlier one
  const active = items.find((t) => t.dataset.route === lastRoute);
  if (active && active.classList.contains('is-overflow')) { const vis = items.filter((t) => !t.classList.contains('is-overflow')); if (vis.length > 1) { vis[vis.length - 1].classList.add('is-overflow'); active.classList.remove('is-overflow'); } }
  placeIndicator();
}
export function placeIndicator() {
  const tabs = $('#tabs'), ind = $('.tab-ind', tabs); if (!ind) return;
  const target = $('.tab[aria-current="page"]:not(.is-overflow)', tabs);
  if (!target) { ind.classList.remove('on'); return; }
  ind.style.width = target.offsetWidth + 'px';
  ind.style.transform = 'translateX(' + target.offsetLeft + 'px)';
  ind.classList.add('on');
}

// ---------- menus ----------
export function moreMenu(anchor) {
  const over = $$('#tabs .tab.is-overflow').map((t) => routeById(t.dataset.route));
  const exam = ROUTES.filter((r) => r.group === 1 && examOn() && r.examHide);
  const sec = (title, list) => list.length ? '<section><h4>' + esc(title) + '</h4>' + list.map((r) => '<a class="mi" href="#/' + r.id + '"' + (r.id === lastRoute ? ' aria-current="page"' : '') + '>' + icon(r.icon) + '<span class="grow">' + esc(r.title) + '</span></a>').join('') + '</section>' : '';
  const g1 = over.concat(exam);
  menu(anchor, [], { cls: 'more-pop', align: 'end', html: '<div class="more-grid">' + sec('Study', g1) + sec('Life', ROUTES.filter((r) => r.group === 2)) + sec('Insight and system', ROUTES.filter((r) => r.group === 3)) + '</div>' });
}
export function moreSheet(actions) {
  const sheet = document.createElement('div');
  const scrim = document.createElement('div');
  scrim.className = 'scrim'; scrim.style.background = 'rgba(12,12,11,.42)';
  const grp = (title, list) => '<h4>' + esc(title) + '</h4><div class="sheet-grid">' + list.map((r) => '<a href="#/' + r.id + '"' + (r.id === lastRoute ? ' aria-current="page"' : '') + '>' + icon(r.icon) + '<span>' + esc(r.title) + '</span></a>').join('') + '</div>';
  sheet.className = 'sheet';
  sheet.setAttribute('role', 'dialog'); sheet.setAttribute('aria-modal', 'true'); sheet.setAttribute('aria-label', 'All sections');
  sheet.innerHTML = grp('Study', ROUTES.filter((r) => r.group === 1)) + grp('Life', ROUTES.filter((r) => r.group === 2)) + grp('Insight and system', ROUTES.filter((r) => r.group === 3)) +
    '<h4>Tools</h4><div class="sheet-grid"><button type="button" data-sheet="palette">' + icon('search') + '<span>Search</span></button><button type="button" data-sheet="timer">' + icon('timer') + '<span>Focus timer</span></button><button type="button" data-sheet="theme">' + icon(resolvedTheme() === 'dark' ? 'sun' : 'moon') + '<span>' + (resolvedTheme() === 'dark' ? 'Light' : 'Dark') + ' theme</span></button></div>';
  const close = () => { sheet.remove(); scrim.remove(); document.body.classList.remove('modal-open'); };
  scrim.addEventListener('click', close);
  sheet.addEventListener('click', (e) => { if (e.target.closest('a')) close(); const b = e.target.closest('[data-sheet]'); if (b) { close(); actions[b.dataset.sheet](); } });
  sheet.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
  document.body.append(scrim, sheet);
  document.body.classList.add('modal-open');
  const f = $('[aria-current="page"], a', sheet); if (f) f.focus();
}
export function notifications(anchor, M) {
  const items = M.notifications.map((x) => ({ label: x.title, hint: x.body, icon: x.icon, href: x.href }));
  const st = store.saveStatus();
  if (st.kind === 'memory') items.push({ label: 'Storage is blocked', hint: 'Changes won’t survive a reload · download a backup', icon: 'alert', href: '#/tools' });
  if (sync.connected() && sync.state.error && sync.state.kind !== 'offline') items.push({ label: 'Sync needs attention', hint: sync.state.error, icon: 'alert', href: '#/settings' });
  if (!items.length) items.push({ label: 'You’re all caught up', hint: 'Nothing needs your attention right now', icon: 'checkCircle', fn: () => {} });
  menu(anchor, [{ heading: 'Notifications' }].concat(items), { align: 'end', cls: 'notif-pop' });
}
export function profileMenu(anchor, M, actions) {
  menu(anchor, [
    { heading: (M.st.player || 'You') + ' · ' + (M.st.subtitle || '') },
    { label: 'Level ' + M.level + ' · ' + String(M.rank ? M.rank.name : '').replace(/^\S+\s/, ''), hint: M.xp.toLocaleString('en-IN') + ' XP · ' + M.badgeCount + ' of ' + M.badges.length + ' badges', icon: 'award', href: '#/winter-arc' },
    '-',
    { label: 'Settings', icon: 'settings', href: '#/settings' },
    { label: 'Backup and restore', icon: 'database', href: '#/tools' },
    actions.install ? { label: 'Install the app', hint: 'Opens offline, from your home screen', icon: 'install', fn: actions.install } : null,
    { label: 'Keyboard shortcuts', icon: 'keyboard', kbd: '?', fn: actions.shortcuts },
    { label: (resolvedTheme() === 'dark' ? 'Light' : 'Dark') + ' theme', icon: resolvedTheme() === 'dark' ? 'sun' : 'moon', kbd: 'T', fn: actions.theme }
  ], { align: 'end' });
}
export function shortcutsHelp() {
  const row = (k, t) => '<li class="between" style="padding:8px 0;border-top:1px solid var(--line)"><span>' + esc(t) + '</span><span class="row" style="gap:4px">' + k.map((x) => '<span class="kbd">' + esc(x) + '</span>').join('') + '</span></li>';
  modal({ title: 'Keyboard shortcuts', body: raw('<ul>' + [
    [['Ctrl', 'K'], 'Search and commands'], [['/'], 'Search'], [['L'], 'Quick log for today'], [['T'], 'Switch light / dark theme'],
    [['G', 'D'], 'Go to Dashboard'], [['G', 'P'], 'Go to Study Plan'], [['G', 'L'], 'Go to Daily Log'], [['G', 'M'], 'Go to Mock Tests'], [['G', 'S'], 'Go to Subjects'],
    [['['], 'Previous day (Plan, Log)'], [[']'], 'Next day (Plan, Log)'], [['←', '→'], 'Step through chart points'], [['Esc'], 'Close'], [['?'], 'This list']
  ].map((x) => row(x[0], x[1])).join('') + '</ul>') });
}
export { html };
