/* Resources: links, books, PDFs and videos (type filter, search, pin), plus the books you've logged in the 10 PM log. */
import { html, raw, esc, fmtN, fmtD, plural, sortBy } from '../util.js';
import { icon } from '../icons.js';
import { card, chip, empty, toast, form } from '../components.js';
import { pref, setPref } from '../prefs.js';
import { renderSoon } from '../router.js';
import { SUBJ_OPTS } from './notes.js';
import * as store from '../store.js';

const TYPES = ['Link', 'Book', 'PDF', 'Video', 'Notes', 'Other'];
const TYPE_ICON = { Link: 'link', Book: 'reading', PDF: 'notes', Video: 'video', Notes: 'notes', Other: 'bookmark' };
function openRes(id) {
  const r = id ? store.get('resources', id) : null;
  form({
    title: r ? 'Edit resource' : 'New resource',
    fields: [{ name: 'title', label: 'Title', required: true, placeholder: 'ICAI RTP May 2026 · Taxation' }, { name: 'url', label: 'Link (optional)', type: 'url', placeholder: 'https://www.icai.org/…' }, { name: 'type', label: 'Type', type: 'select', options: TYPES, half: true }, { name: 'subject', label: 'Subject', type: 'select', options: SUBJ_OPTS, half: true }, { name: 'notes', label: 'Notes', type: 'textarea', rows: 2 }, { name: 'pinned', label: 'Pin to the top', type: 'checkbox' }],
    values: r || { type: 'Link', subject: '' },
    submitLabel: r ? 'Save' : 'Add resource',
    onSubmit: (v) => { if (v.url && !/^https?:\/\//i.test(v.url)) v.url = 'https://' + v.url; if (r) store.put('resources', Object.assign({}, r, v)); else store.add('resources', v, 'rs'); toast(r ? 'Resource saved' : 'Resource added'); },
    onDelete: r ? () => { store.remove('resources', r.id); toast('Resource deleted'); } : null
  });
}

export default {
  head() { return { title: 'Resources', actions: raw('<button type="button" class="btn primary" data-act="res-add">' + icon('plus') + 'Add resource</button>') }; },
  render(M) {
    const all = store.list('resources'), ty = pref('resType', 'all'), s = String(pref('resQ', '')).trim().toLowerCase();
    let list = all.filter((r) => ty === 'all' || r.type === ty);
    if (s) list = list.filter((r) => (r.title + ' ' + (r.notes || '') + ' ' + (r.url || '') + ' ' + (r.subject || '')).toLowerCase().includes(s));
    list = sortBy(list, (r) => (r.pinned ? '0' : '1') + r.title.toLowerCase());
    const chips = html`<div class="seg" role="group" aria-label="Type">${[['all', 'All · ' + all.length]].concat(TYPES.map((t) => [t, t])).map((c) => html`<button type="button" data-seg="res-type" data-v="${c[0]}" aria-pressed="${String(ty === c[0])}">${c[1]}</button>`)}</div>`;
    const rows = list.length ? html`<ul class="list res-list">${list.map((r) => html`<li><span class="goal-ic">${icon(TYPE_ICON[r.type] || 'bookmark')}</span><span class="li-main"><b>${r.title}${r.pinned ? html` ${icon('pin')}` : ''}</b>${r.url ? html`<a href="${r.url}" target="_blank" rel="noopener noreferrer" class="res-url">${r.url.replace(/^https?:\/\//, '')}${icon('external')}</a>` : ''}${r.notes ? html`<small>${r.notes}</small>` : ''}</span>${r.subject ? chip(r.subject, 'line') : ''}${chip(r.type)}<button type="button" class="icon-btn sm" data-act="res-edit" data-id="${r.id}" aria-label="Edit ${r.title}">${icon('edit')}</button></li>`)}</ul>`
      : empty(s ? 'No resources match “' + s + '”.' : 'Keep your RTPs, MTPs, ICAI links and books in one place.', html`<button type="button" class="btn sm primary" data-act="res-add">${icon('plus')}Add resource</button>`, 'folder');
    const books = {};
    M.days.forEach((d) => { const b = (d.rec.book || '').trim(); if (b) { books[b] = books[b] || { pages: 0, days: 0, last: d.date }; books[b].pages += +d.rec.pages || 0; books[b].days++; books[b].last = d.date; } });
    const bk = Object.keys(books).sort((a, b) => (books[a].last < books[b].last ? 1 : -1));
    return html`${card({ title: 'Your resources', icon: 'folder', actions: html`<label class="search-inline">${icon('search')}<input id="res-search" class="in sm" type="search" placeholder="Search" value="${pref('resQ', '')}" data-input="res-q" aria-label="Search resources"></label>`, body: html`${chips}<div style="margin-top:12px">${rows}</div>` })}
      ${card({ title: 'Books from your 10 PM log', icon: 'reading', sub: 'Every book you named in the log, with the pages you read', body: bk.length ? html`<ul class="list">${bk.map((b) => html`<li><span class="goal-ic">${icon('reading')}</span><span class="li-main"><b>${b}</b><small>${fmtN(books[b].pages)} pages · ${plural(books[b].days, 'day')} · last ${fmtD(books[b].last)}</small></span></li>`)}</ul>` : html`<p class="muted">Books you enter in the 10 PM log (with pages read) are listed here.</p>` })}`;
  },
  segs: { 'res-type': (v) => setPref('resType', v) },
  inputs: { 'res-q': (el) => { setPref('resQ', el.value); renderSoon(); } },
  actions: { 'res-add': () => openRes(null), 'res-edit': (el) => openRes(el.dataset.id) }
};
