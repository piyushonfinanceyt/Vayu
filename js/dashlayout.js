/* Dashboard layout: the cards in each band (Now, Today, Progress), the order and the hidden ones you chose in
   Customise (saved on this device), and how a band's cards pack into rows of 12 columns.
   What now? and Next up stack in one column when they sit next to each other. */
import { esc } from './util.js';
import { icon } from './icons.js';
import { modal, toast } from './components.js';
import { pref, setPrefs } from './prefs.js';

export const BANDS = [['now', 'Now'], ['today', 'Today'], ['progress', 'Progress']];
// lg / md: preferred width in columns of 12 on a computer / a tablet (a phone always shows one card per row)
export const DASH = [
  { id: 'summary', band: 'top', name: 'Four key numbers', note: 'Countdown, R1 chapters, pass outlook and this week' },
  { id: 'whatnow', band: 'now', name: 'What now?', note: 'The best thing to do right now', lg: 4, md: 12 },
  { id: 'next', band: 'now', name: 'Next up', note: 'From today’s timetable', lg: 4, md: 6 },
  { id: 'timetable', band: 'now', name: 'Today’s timetable', lg: 8, md: 12 },
  { id: 'plan', band: 'today', name: 'Today’s study', note: 'The day’s study goal and its to-do list, block by block', lg: 12, md: 12 },
  { id: 'meters', band: 'today', name: 'Today’s targets', note: 'Hours, pages, steps and push-ups', lg: 12, md: 12 },
  { id: 'log', band: 'today', name: '10 PM log', lg: 4, md: 6 },
  { id: 'run', band: 'today', name: 'Today’s run', lg: 3, md: 6 },
  { id: 'arc', band: 'today', name: 'Winter Arc', note: 'Today’s arc habits', lg: 12, md: 12 },
  { id: 'finish', band: 'progress', name: 'Can I finish?', note: 'Hours needed against hours left', lg: 7, md: 12 },
  { id: 'coming', band: 'progress', name: 'Coming up', note: 'The next milestones', lg: 5, md: 12 },
  { id: 'rank', band: 'progress', name: 'Level, streak and badges', lg: 12, md: 12 },
  { id: 'content', band: 'progress', name: 'Piyush on Finance', note: 'Appears from 13 Jan', lg: 12, md: 12 }
];
const BY = {}; DASH.forEach((c) => { BY[c.id] = c; });
const STACK = ['whatnow', 'next'];

export function order() {
  const saved = (pref('dashOrder') || []).filter((id, i, a) => BY[id] && a.indexOf(id) === i);
  return saved.concat(DASH.map((c) => c.id).filter((id) => !saved.includes(id)));
}
export const hidden = () => (pref('dashHidden') || []).filter((id) => BY[id]);
export const isShown = (id) => !hidden().includes(id);
export const bandCards = (band) => order().filter((id) => BY[id].band === band);

// rows of 12: fill a row while the next card fits, then widen the row's cards to use the whole width
function pack(cells, k) {
  const rows = []; let row = [], used = 0;
  cells.forEach((c) => { if (used + c[k] > 12 && row.length) { rows.push(row); row = []; used = 0; } row.push(c); used += c[k]; });
  if (row.length) rows.push(row);
  rows.forEach((r) => {
    const tot = r.reduce((a, c) => a + c[k], 0); let left = 12;
    r.forEach((c, i) => { const s = i === r.length - 1 ? left : Math.max(1, Math.round((c[k] * 12) / tot)); c['s' + k] = s; left -= s; });
  });
}
// one band's markup: `parts` maps a card id to its rendered markup ('' = nothing to show today)
export function bandCells(band, parts) {
  const ids = bandCards(band).filter((id) => isShown(id) && parts[id] && String(parts[id]).trim());
  const cells = [];
  for (let i = 0; i < ids.length; i++) {
    const a = ids[i], b = ids[i + 1];
    if (STACK.includes(a) && STACK.includes(b)) { cells.push({ ids: [a, b], lg: 4, md: 12, stack: true }); i++; }
    else cells.push({ ids: [a], lg: BY[a].lg, md: BY[a].md });
  }
  pack(cells, 'lg'); pack(cells, 'md');
  return cells.map((c) => '<div class="dc' + (c.stack ? ' stack' : '') + '" data-card="' + c.ids.join(' ') + '" style="--s:' + c.slg + ';--s-md:' + c.smd + '">' + c.ids.map((id) => String(parts[id])).join('') + '</div>').join('');
}

// ---------- Customise ----------
let dlg = null;
function body() {
  const H = hidden();
  const row = (c, list, i) => {
    const on = !H.includes(c.id);
    const mv = c.band === 'top' ? '' : '<span class="dz-mv"><button type="button" class="icon-btn sm" data-dz="up" data-id="' + c.id + '" aria-label="Move ' + esc(c.name) + ' up"' + (i === 0 ? ' aria-disabled="true"' : '') + '>' + icon('arrowU') + '</button><button type="button" class="icon-btn sm" data-dz="down" data-id="' + c.id + '" aria-label="Move ' + esc(c.name) + ' down"' + (i === list.length - 1 ? ' aria-disabled="true"' : '') + '>' + icon('arrowD') + '</button></span>';
    return '<li class="' + (on ? '' : 'off') + '"><button type="button" class="dz-tog" role="switch" aria-checked="' + on + '" data-dz="toggle" data-id="' + c.id + '"><span class="sw" aria-hidden="true"></span><span class="li-main"><b>' + esc(c.name) + '</b>' + (c.note ? '<small>' + esc(c.note) + '</small>' : '') + '</span></button>' + mv + '</li>';
  };
  const top = DASH.filter((c) => c.band === 'top');
  return '<p class="muted small" style="margin-bottom:6px">Switch off the cards you don’t use and move the rest into the order you want. Saved on this device.</p>' +
    '<ul class="dz-list">' + top.map((c, i) => row(c, top, i)).join('') + '</ul>' +
    BANDS.map(([b, name]) => { const list = bandCards(b).map((id) => BY[id]); return '<h3 class="dz-h">' + esc(name) + '</h3><ul class="dz-list">' + list.map((c, i) => row(c, list, i)).join('') + '</ul>'; }).join('');
}
export function openCustomise(onChange) {
  if (dlg && dlg.scrim.isConnected) return;
  const changed = () => { onChange && onChange(); };
  dlg = modal({
    title: 'Customise the dashboard', body: body(),
    foot: '<button type="button" class="btn ghost" data-dz="reset">Reset to the original</button><span class="grow"></span><button type="button" class="btn primary" data-close>Done</button>',
    onClose: () => { dlg = null; }
  });
  const box = dlg.el.querySelector('.modal-body');
  dlg.el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-dz]'); if (!b || b.getAttribute('aria-disabled') === 'true') return;
    const act = b.dataset.dz, id = b.dataset.id;
    if (act === 'reset') { setPrefs({ dashOrder: null, dashHidden: null }); toast('Dashboard back to the original', { ms: 1600 }); }
    else if (act === 'toggle') { const H = hidden(); setPrefs({ dashHidden: H.includes(id) ? H.filter((x) => x !== id) : H.concat(id) }); }
    else {
      const o = order(), band = bandCards(BY[id].band), i = band.indexOf(id), j = i + (act === 'up' ? -1 : 1);
      if (j < 0 || j >= band.length) return;
      const a = o.indexOf(band[i]), c = o.indexOf(band[j]);
      [o[a], o[c]] = [o[c], o[a]];
      setPrefs({ dashOrder: o });
    }
    box.innerHTML = body();
    const again = box.querySelector('[data-dz="' + act + '"][data-id="' + id + '"]');
    if (again && again.getAttribute('aria-disabled') !== 'true') again.focus();
    else if (id) { const t = box.querySelector('[data-dz="toggle"][data-id="' + id + '"]'); if (t) t.focus(); }
    changed();
  });
  return dlg;
}
