/* Flashcards: your own cards for sections, SAs, AS numbers and formulas, drilled on the Error Book's schedule (drill.js).
   Records live in the 'cards' collection: { paper, chapterId, front, back, box, dueOn, reviews, misses, reviewedAt, fixed }.
   `fixed` means learned: right at the longest gap, so it stops coming back. A new card's first drill is tomorrow. */
import { html, raw, esc, plural, sortBy, todayStr, addDays } from './util.js';
import { chip, toast, form, modal } from './components.js';
import { errDue } from './drill.js';
import { runDrill } from './drillui.js';
import * as store from './store.js';
import { WORLDS, WMAP } from './model.js';

const PAPERS = WORLDS.map((w) => [w.key, w.code + ' ' + w.short]);
const paperName = (k) => { const w = WMAP[k]; return w ? w.code + ' ' + w.short : k; };
export const cardsDue = (t) => sortBy(store.list('cards').filter((c) => errDue(c, t)), (c) => (c.dueOn || '') + (c.createdAt || ''));
const chapterName = (c) => { const ch = c.chapterId ? store.CH_BY[c.chapterId] : null; return ch ? '#' + ch.id + ' ' + ch.name : ''; };
const addCard = (f) => store.add('cards', { paper: f.paper, chapterId: f.chapterId || null, front: f.front, back: f.back, reviews: 0, reviewedAt: null, fixed: false, dueOn: addDays(todayStr(), 1) }, 'fc');

export function drillCards(list, title) {
  runDrill({
    coll: 'cards', title, list, noun: 'flashcard', flip: 'Show the answer', doneWord: 'learned',
    view: (c) => ({
      tags: html`${chip(paperName(c.paper), 'line')}${chapterName(c) ? html`<span class="muted small">${chapterName(c)}</span>` : ''}`,
      heading: c.front, prompt: 'Say the answer, then check.',
      answer: html`<span class="lbl">Answer</span><p class="drill-rule">${c.back}</p>`
    })
  });
}
function chapterOpts(paper) { return [['', 'No particular chapter']].concat(window.__FC_DATA__.chapters.filter((c) => c.subject === paper).map((c) => [String(c.id), '#' + c.id + ' ' + c.name])); }

// add or edit one card; `v` presets the fields (from a mistake, say)
export function openCardForm(card, v) {
  const paper = (card && card.paper) || (v && v.paper) || 'Accounts';
  form({
    title: card ? 'Edit flashcard' : 'New flashcard',
    fields: [{ name: 'paper', label: 'Paper', type: 'select', options: PAPERS }, { name: 'chapterId', label: 'Chapter', type: 'select', options: chapterOpts(paper) }, { name: 'front', label: 'Front: the prompt', type: 'textarea', rows: 2, required: true, autofocus: true }, { name: 'back', label: 'Back: the answer', type: 'textarea', rows: 3, required: true }],
    values: Object.assign({ paper, chapterId: '' }, v, card),
    submitLabel: card ? 'Save' : 'Add card',
    onSubmit: (x) => {
      const rec = { paper: x.paper, chapterId: x.paper === paper && x.chapterId ? +x.chapterId : null, front: x.front, back: x.back };
      if (card) { store.patch('cards', card.id, rec); toast('Saved'); } else { addCard(rec); toast('Card added · first drill tomorrow'); }
    },
    onDelete: card ? () => { const old = store.remove('cards', card.id); toast('Card deleted', { action: { label: 'Undo', fn: () => store.put('cards', old) } }); } : null,
    deleteBody: 'This card and its schedule will be removed.'
  });
}
// several at once, one card a line: Front | Back
export function parseBulk(text) {
  const ok = [], bad = [];
  String(text || '').split('\n').map((l) => l.trim()).filter(Boolean).forEach((l) => {
    const i = l.indexOf('|'), front = i > 0 ? l.slice(0, i).trim() : '', back = i > 0 ? l.slice(i + 1).trim() : '';
    if (front && back) ok.push({ front, back }); else bad.push(l);
  });
  return { ok, bad };
}
export function openBulk(paper) {
  const m = modal({ title: 'Add several flashcards', body: raw('<div class="fields" style="grid-template-columns:minmax(0,1fr)"><label class="field"><span>Paper</span><select class="in" data-bk-p>' + PAPERS.map((p) => '<option value="' + esc(p[0]) + '"' + (p[0] === paper ? ' selected' : '') + '>' + esc(p[1]) + '</option>').join('') + '</select></label><label class="field"><span>One card a line: front | back</span><textarea class="in" rows="7" data-bk-t></textarea></label></div><p class="hint" role="alert" data-bk-e style="color:var(--bad)"></p>'), foot: raw('<button type="button" class="btn" data-close>Cancel</button><button type="button" class="btn primary" data-bk-go>Add cards</button>') });
  m.el.querySelector('[data-bk-go]').addEventListener('click', () => {
    const R = parseBulk(m.el.querySelector('[data-bk-t]').value), p = m.el.querySelector('[data-bk-p]').value, err = m.el.querySelector('[data-bk-e]');
    if (!R.ok.length) { err.textContent = 'Write at least one line as: front | back'; return; }
    if (R.bad.length) { err.textContent = plural(R.bad.length, 'line') + ' without a “|”. Fix or remove: ' + R.bad[0].slice(0, 50); return; }
    store.batch(() => R.ok.forEach((c) => addCard(Object.assign(c, { paper: p }))));
    m.close(); toast(plural(R.ok.length, 'card') + ' added · first drill tomorrow');
  });
}
