/* Notes: your notes and formula sheet (pin, tags, subject, search), plus "From your logs": the notes you already wrote
   in the daily log, chapters, mocks and runs, each linking back to where it lives. */
import { html, raw, esc, fmtD, fmtDS, sortBy, plural } from '../util.js';
import { icon } from '../icons.js';
import { card, chip, empty, toast, form } from '../components.js';
import { pref, setPref, setPrefs } from '../prefs.js';
import { renderSoon } from '../router.js';
import * as store from '../store.js';

export const SUBJ_OPTS = [['', '— none —'], ['Accounts', 'Accounts'], ['Law', 'Law'], ['Tax', 'Tax'], ['Costing', 'Costing'], ['Audit', 'Audit'], ['FM&SM', 'FM & SM'], ['General', 'General']];

function openNote(id, preset) {
  const n = id ? store.get('notes', id) : null;
  form({
    title: n ? 'Edit note' : 'New note', wide: true,
    fields: [
      { name: 'title', label: 'Title', required: true, placeholder: preset && preset.tags === 'formula' ? 'EOQ, leverage ratios, AS 2 cost formulas' : 'Note title' },
      { name: 'body', label: 'Note', type: 'textarea', rows: 10, placeholder: 'Formulas, section numbers, mistakes to avoid…' },
      { name: 'tags', label: 'Tags (comma separated)', placeholder: 'formula, costing', half: true },
      { name: 'subject', label: 'Subject', type: 'select', options: SUBJ_OPTS, half: true },
      { name: 'pinned', label: 'Pin to the top', type: 'checkbox' }
    ],
    values: n ? Object.assign({}, n, { tags: (n.tags || []).join(', ') }) : Object.assign({ tags: '', subject: '' }, preset || {}),
    submitLabel: n ? 'Save note' : 'Add note',
    onSubmit: (v) => {
      const rec = Object.assign({}, n || {}, v, { tags: String(v.tags || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean) });
      if (n) store.put('notes', rec); else store.add('notes', rec, 'n');
      toast(n ? 'Note saved' : 'Note added');
    },
    onDelete: n ? () => { store.remove('notes', n.id); toast('Note deleted'); } : null
  });
}

export default {
  enter(q) { if (q.tag) setPref('notesTag', q.tag); if (q.open) setTimeout(() => openNote(q.open), 80); },
  head() { const n = store.list('notes').length; return { title: 'Notes', sub: raw(esc(plural(n, 'note') + ' · formulas, sections and the mistakes you never want to repeat')), actions: raw('<button type="button" class="btn primary" data-act="note-add">' + icon('plus') + 'New note</button>') }; },
  render(M) {
    const all = store.list('notes'), tag = pref('notesTag', 'all'), s = String(pref('notesQ', '')).trim().toLowerCase();
    const tags = ['formula'].concat(Array.from(new Set([].concat(...all.map((n) => n.tags || [])))).filter((t) => t !== 'formula').sort());
    let list = all;
    if (tag === 'pinned') list = list.filter((n) => n.pinned); else if (tag !== 'all') list = list.filter((n) => (n.tags || []).includes(tag));
    if (s) list = list.filter((n) => (n.title + ' ' + (n.body || '') + ' ' + (n.tags || []).join(' ') + ' ' + (n.subject || '')).toLowerCase().includes(s));
    list = sortBy(list, (n) => (n.pinned ? '0' : '1') + (9999999999999 - Date.parse(n.updatedAt || 0)));
    const chips = html`<div class="seg" role="group" aria-label="Filter notes">${[['all', 'All · ' + all.length], ['pinned', 'Pinned']].concat(tags.map((t) => [t, t === 'formula' ? 'Formula sheet' : '#' + t])).map((c) => html`<button type="button" data-seg="notes-tag" data-v="${c[0]}" aria-pressed="${String(tag === c[0])}">${c[0] === 'formula' ? icon('sigma') : ''}${c[1]}</button>`)}</div>`;
    const cards = list.length ? html`<div class="note-grid">${list.map((n) => html`<article class="note ${n.pinned ? 'pinned' : ''}"><button type="button" class="note-open" data-act="note-edit" data-id="${n.id}"><b>${n.title}</b><p>${String(n.body || '').slice(0, 260)}${String(n.body || '').length > 260 ? '…' : ''}</p></button>
      <div class="note-foot">${n.subject ? chip(n.subject, 'line') : ''}${(n.tags || []).map((t) => chip('#' + t))}<span class="grow"></span><small class="muted">${fmtDS((n.updatedAt || '').slice(0, 10) || M.t)}</small><button type="button" class="icon-btn sm" data-act="note-pin" data-id="${n.id}" aria-pressed="${String(!!n.pinned)}" aria-label="${(n.pinned ? 'Unpin ' : 'Pin ') + n.title}">${icon('pin')}</button></div></article>`)}</div>`
      : empty(tag === 'formula' ? 'Your formula sheet is empty. Add the formulas, ratios and sections you want at your fingertips.' : s ? 'No notes match “' + s + '”.' : 'Start your first note: a formula, a section number or a rule from a lost mark.', html`<button type="button" class="btn sm primary" data-act="note-add">${icon('plus')}${tag === 'formula' ? 'Add a formula note' : 'New note'}</button>`, tag === 'formula' ? 'sigma' : 'notes');
    const logs = [];
    M.days.forEach((d) => { if ((d.rec.notes || '').trim()) logs.push({ date: d.date, src: 'Daily log', text: d.rec.notes, href: '#/log?date=' + d.date }); });
    M.chapters.forEach((c) => { if ((c.notes || '').trim()) logs.push({ date: c.doneAt || c.planned, src: 'Chapter #' + c.id + ' · ' + c.subject, text: c.notes, href: '#/subjects?q=' + encodeURIComponent('#' + c.id) }); });
    M.mocks.forEach((m) => { if ((m.mistakes || '').trim()) logs.push({ date: m.date, src: 'Mock #' + m.id + ' mistakes', text: m.mistakes, href: '#/mocks?id=' + m.id }); });
    M.runs.forEach((r) => { if ((r.notes || '').trim()) logs.push({ date: r.date, src: 'Run · ' + r.session, text: r.notes, href: '#/run-5k' }); });
    store.list('logs').forEach((l) => { if (l.cat === 'note' && (l.text || '').trim()) logs.push({ date: l.date, src: 'Quick log', text: l.text, href: '#/log?date=' + l.date }); });
    const fromLogs = sortBy(logs.filter((l) => !s || (l.text + ' ' + l.src).toLowerCase().includes(s)), (l) => l.date).reverse();
    return html`${card({ title: tag === 'formula' ? 'Formula sheet' : 'Your notes', icon: tag === 'formula' ? 'sigma' : 'notes', actions: html`<label class="search-inline">${icon('search')}<input id="notes-search" class="in sm" type="search" placeholder="Search notes" value="${pref('notesQ', '')}" data-input="notes-q" aria-label="Search notes"></label>`, body: html`${chips}<div style="margin-top:14px">${cards}</div>` })}
      ${card({ title: 'From your logs', icon: 'list', sub: 'Notes written in the daily log, chapters, mocks, runs and the quick log', actions: chip(String(fromLogs.length)), body: fromLogs.length ? html`<ul class="list lognotes">${fromLogs.map((l) => html`<li><a href="${l.href}" class="li-main" style="text-decoration:none"><small>${fmtD(l.date)} · ${l.src}</small><span>${l.text}</span></a>${icon('arrowR')}</li>`)}</ul>` : html`<p class="muted">Notes you write in the daily log, chapters, mocks and runs show up here.</p>` })}`;
  },
  segs: { 'notes-tag': (v) => setPref('notesTag', v) },
  inputs: { 'notes-q': (el) => { setPref('notesQ', el.value); renderSoon(); } },
  actions: {
    'note-add': () => { const t = pref('notesTag', 'all'); openNote(null, t !== 'all' && t !== 'pinned' ? { tags: t } : null); },
    'note-edit': (el) => openNote(el.dataset.id),
    'note-pin': (el) => { const n = store.get('notes', el.dataset.id); if (n) store.patch('notes', n.id, { pinned: !n.pinned }); }
  }
};
export { setPrefs };
