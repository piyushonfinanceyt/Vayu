/* Command palette (Ctrl/⌘ K or /): jump to any tab, run a command, or search everything —
   chapters, plan days, mocks, goals, tasks, notes, journal, quick-log entries, resources and milestones. */
import { model } from './model.js';
import * as store from './store.js';
import { $, $$, esc, fmtD, fmtDS } from './util.js';
import { icon } from './icons.js';
import { ROUTES } from './shell.js';

let open = null;
export const isOpen = () => !!open;

function index(M, cmds) {
  const out = [];
  const add = (type, ic, title, sub, run, weight) => out.push({ type, ic, title, sub: sub || '', run, hay: (title + ' ' + (sub || '') + ' ' + type).toLowerCase(), w: weight || 5 });
  cmds.forEach((c) => add('Command', c.icon, c.label, c.hint, c.fn, 1));
  ROUTES.forEach((r) => add('Go to', r.icon, r.title, r.sub || '', () => { location.hash = '#/' + r.id; }, 2));
  M.chapters.forEach((c) => add('Chapter', 'book', '#' + c.id + ' ' + c.name, c.paper + ' ' + c.subject + ' · ' + c.status + ' · planned ' + fmtDS(c.planned), () => { location.hash = '#/subjects?q=' + encodeURIComponent('#' + c.id); }, 4));
  M.mocks.forEach((m) => add('Mock', 'mocks', 'Mock #' + m.id + ' · ' + m.paper + ' ' + m.subject, m.bossName + ' · ' + fmtD(m.date) + (m.marks != null ? ' · ' + m.marks + ' marks' : ''), () => { location.hash = '#/mocks?id=' + m.id; }, 4));
  M.days.forEach((d) => add('Plan day', 'calcheck', (d.jNum ? 'Day ' + d.jNum + ' · ' : '') + fmtD(d.date), String(d.main).replace(/\n/g, ' ').slice(0, 140), () => { location.hash = '#/study-plan?date=' + d.date; }, 6));
  M.goals.forEach((g) => add('Goal', 'target', g.title, g.category + ' · ' + Math.round(g.progress) + '%', () => { location.hash = '#/goals'; }, 3));
  M.milestones.forEach((m) => add('Milestone', 'flag', m.title, fmtD(m.date) + ' · ' + m.desc, () => { location.hash = '#/calendar?date=' + m.date; }, 5));
  store.list('tasks').filter((t) => !t.plan).forEach((t) => add('Task', 'checkCircle', t.title, (t.category || '') + (t.date ? ' · ' + fmtD(t.date) : ''), () => { location.hash = '#/goals?tab=tasks'; }, 3));
  store.list('notes').forEach((n) => add('Note', 'notes', n.title, String(n.body || '').slice(0, 100), () => { location.hash = '#/notes?open=' + n.id; }, 3));
  store.list('journal').forEach((j) => add('Journal', 'journal', 'Journal · ' + fmtD(j.date), [j.grateful, j.wins, j.better, j.body].filter(Boolean).join(' ').slice(0, 140), () => { location.hash = '#/journal?date=' + j.date; }, 5));
  store.list('logs').forEach((l) => add('Log entry', 'clock', l.text || l.cat, fmtD(l.date) + ' ' + (l.time || ''), () => { location.hash = '#/log?date=' + l.date; }, 6));
  store.list('errors').forEach((e) => add('Mistake', 'alert', e.chapter || e.note || 'Mistake', e.paper + ' · ' + (e.note || ''), () => { location.hash = '#/errors'; }, 5));
  store.list('resources').forEach((r) => add('Resource', 'folder', r.title, (r.type || '') + ' ' + (r.url || ''), () => { location.hash = '#/resources'; }, 5));
  return out;
}

export function openPalette(cmds) {
  if (open) return;
  const M = model(), all = index(M, cmds);
  const scrim = document.createElement('div');
  scrim.className = 'scrim';
  scrim.innerHTML = '<div class="palette" role="dialog" aria-modal="true" aria-label="Search and commands"><div class="palette-in">' + icon('search') +
    '<input id="pal-q" type="text" role="combobox" aria-expanded="true" aria-controls="pal-list" aria-autocomplete="list" autocomplete="off" spellcheck="false" placeholder="Search chapters, mocks, days, notes — or type a command"><span class="kbd">Esc</span></div>' +
    '<div class="palette-list" id="pal-list" role="listbox" aria-label="Results"></div>' +
    '<div class="palette-foot"><span><span class="kbd">↑</span> <span class="kbd">↓</span> move</span><span><span class="kbd">Enter</span> open</span><span><span class="kbd">Ctrl</span> <span class="kbd">K</span> anywhere</span></div></div>';
  document.body.appendChild(scrim);
  document.body.classList.add('modal-open');
  const inp = $('#pal-q', scrim), list = $('#pal-list', scrim), prev = document.activeElement;
  let results = [], sel = 0;
  const draw = () => {
    const q = inp.value.trim().toLowerCase();
    if (!q) results = all.filter((x) => x.type === 'Command').concat(all.filter((x) => x.type === 'Go to'));
    else { const words = q.split(/\s+/); results = all.filter((x) => words.every((w) => x.hay.indexOf(w) >= 0)).sort((a, b) => (a.title.toLowerCase().indexOf(words[0]) === 0 ? 0 : 1) - (b.title.toLowerCase().indexOf(words[0]) === 0 ? 0 : 1) || a.w - b.w).slice(0, 40); }
    sel = Math.min(sel, Math.max(0, results.length - 1));
    let lastType = '', h = '';
    results.forEach((r, i) => {
      if (r.type !== lastType) { h += '<h4>' + esc(r.type === 'Go to' ? 'Go to' : r.type === 'Command' ? 'Commands' : r.type + 's') + '</h4>'; lastType = r.type; }
      h += '<button type="button" class="mi' + (i === sel ? ' on' : '') + '" role="option" id="pal-' + i + '" aria-selected="' + (i === sel) + '" data-i="' + i + '">' + icon(r.ic) + '<span class="grow"><b style="font-weight:500">' + esc(r.title) + '</b>' + (r.sub ? '<small>' + esc(r.sub) + '</small>' : '') + '</span></button>';
    });
    list.innerHTML = h || '<p class="empty">No matches for “' + esc(inp.value) + '”.</p>';
    if (results.length) inp.setAttribute('aria-activedescendant', 'pal-' + sel); else inp.removeAttribute('aria-activedescendant');
  };
  const close = () => { scrim.remove(); open = null; document.body.classList.remove('modal-open'); if (prev && prev.focus) try { prev.focus({ preventScroll: true }); } catch (e) { /* gone */ } };
  const pick = (i) => { const r = results[i]; if (!r) return; close(); r.run(); };
  inp.addEventListener('input', () => { sel = 0; draw(); });
  inp.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault(); if (!results.length) return;
      sel = (sel + (e.key === 'ArrowDown' ? 1 : -1) + results.length) % results.length;
      $$('.mi', list).forEach((b, i) => { b.classList.toggle('on', i === sel); b.setAttribute('aria-selected', String(i === sel)); });
      const on = $('#pal-' + sel, list); if (on) on.scrollIntoView({ block: 'nearest' });
      inp.setAttribute('aria-activedescendant', 'pal-' + sel);
    } else if (e.key === 'Enter') { e.preventDefault(); pick(sel); }
    else if (e.key === 'Escape') { e.preventDefault(); close(); }
  });
  list.addEventListener('click', (e) => { const b = e.target.closest('[data-i]'); if (b) pick(+b.dataset.i); });
  scrim.addEventListener('click', (e) => { if (e.target === scrim) close(); });
  open = { close };
  draw();
  inp.focus();
}
