/* Error Book: every lost mark by paper, chapter and error type. A review queue (a mistake is due again 3 days after
   its last review), the week's biggest leaks with the fix for each type, open marks by paper, and every entry. */
import { html, raw, esc, fmt1, fmtD, plural, diff, sortBy, sum, isDate, todayStr } from '../util.js';
import { icon } from '../icons.js';
import { card, chip, tile, empty, toast, menu, form } from '../components.js';
import { isOpen } from '../prefs.js';
import { errDue } from '../shell.js';
import * as store from '../store.js';

export const ERR_TYPES = [
  ['concept', 'Concept', 'Re-read the study-material section, then solve 3 fresh questions on it the same day.'],
  ['adjustment-missed', 'Adjustment missed', 'Number every adjustment in the margin while reading and tick each one off in your answer.'],
  ['calculation', 'Calculation', 'Recheck totals before moving on; write intermediate figures instead of chaining on the calculator.'],
  ['format', 'Format', 'Write the format blank from memory twice a week until it is perfect.'],
  ['working-notes', 'Working notes', 'Number every working note and refer to it in the main answer.'],
  ['provision-not-cited', 'Provision not cited', 'Put the section or SA on a flashcard and quote it first in theory answers.'],
  ['time', 'Time', 'Timed practice at 2–5 PM; move on when a question overruns its minutes.'],
  ['misread', 'Misread', 'Underline the requirement words before you write.'],
  ['mcq-trap', 'MCQ trap', 'Read the questions before the case; eliminate two options first.'],
  ['forgot', 'Forgot', 'Flashcard plus spaced review: that is what this queue is for.']
];
const ERR_BY = {}; ERR_TYPES.forEach((e) => { ERR_BY[e[0]] = e; });
const PAPERS = [['Accounts', 'P1 Accounts'], ['Law', 'P2 Law'], ['Tax', 'P3 Tax'], ['Costing', 'P4 Costing'], ['Audit', 'P5 Audit'], ['FM&SM', 'P6 FM & SM']];
const paperName = (k) => (PAPERS.find((p) => p[0] === k) || [k, k])[1];
let preset = {};

function row(M, e) {
  return html`<li class="err ${e.fixed ? 'fixed' : ''}"><span class="li-main"><b>${e.chapter || e.note || 'Mistake'}</b><small>${fmtD(e.date)} · ${paperName(e.paper)}${e.source ? ' · ' + e.source : ''}${e.reviews ? ' · reviewed ' + plural(e.reviews, 'time') : ''}</small>${e.note && e.chapter ? html`<span class="err-rule">${icon('info')}${e.note}</span>` : ''}</span>
    ${chip((ERR_BY[e.type] || [e.type, e.type])[1], 'line')}<b class="err-marks num">−${fmt1(+e.marks || 0)}</b>
    <span class="row" style="gap:4px">${e.fixed ? '' : html`<button type="button" class="btn sm" data-act="err-review" data-id="${e.id}">${icon('check')}Reviewed</button>`}<button type="button" class="icon-btn sm" data-act="err-menu" data-id="${e.id}" aria-label="More for this mistake" aria-haspopup="menu">${icon('moreV')}</button></span></li>`;
}

export default {
  enter(q) { preset = { paper: q.paper || '', mock: q.mock || '' }; },
  head(M) { const due = store.list('errors').filter((e) => errDue(e, M.t)).length; return { title: 'Error Book', sub: raw(esc((due ? plural(due, 'mistake') + ' due for review · ' : 'Nothing due · ') + 'Block D every evening: one line per lost mark, with the rule that stops it next time')) }; },
  render(M) {
    const t = M.t, all = sortBy(store.list('errors'), (e) => (e.date || '') + (e.createdAt || '')).reverse();
    const wk = all.filter((e) => e.date && e.date <= t && diff(e.date, t) < 7);
    const byType = {}; wk.forEach((e) => { byType[e.type] = (byType[e.type] || 0) + (+e.marks || 0); });
    const top = Object.keys(byType).filter((k) => byType[k] > 0).sort((a, b) => byType[b] - byType[a]).slice(0, 3);
    const due = sortBy(all.filter((e) => errDue(e, t)), (e) => e.reviewedAt || e.date || ''), openE = all.filter((e) => !e.fixed);
    const tiles = html`<div class="tiles">${tile({ cls: 'hero', label: 'Due for review', icon: 'revision', value: String(due.length), foot: '20 minutes a day, oldest first' })}${tile({ label: 'Marks lost this week', icon: 'alert', value: fmt1(sum(wk, (e) => +e.marks || 0)), foot: plural(wk.length, 'mistake') + ' logged' })}${tile({ label: 'Biggest leak', icon: 'activity', value: top.length ? ERR_BY[top[0]][1] : '—', foot: top.length ? fmt1(byType[top[0]]) + ' marks this week' : 'log mistakes to see it' })}${tile({ label: 'Open mistakes', icon: 'list', value: String(openE.length), foot: (all.length - openE.length) + ' fixed for good' })}</div>`;
    const opt = (v, l, sel) => html`<option value="${v}" ${raw(sel ? 'selected' : '')}>${l}</option>`;
    const addCard = card({
      cls: 'span-6', title: 'Log a lost mark', icon: 'plus', sub: preset.mock ? 'From full paper #' + preset.mock : 'After marking: one line per mark you lost',
      body: html`<div class="err-form">
        <label class="field"><span>Date</span><input id="er-date" class="in" type="date" value="${t}"></label>
        <label class="field"><span>Paper</span><select id="er-paper" class="in">${PAPERS.map((p) => opt(p[0], p[1], p[0] === preset.paper))}</select></label>
        <label class="field"><span>Chapter</span><input id="er-ch" class="in" type="text" list="er-chapters" placeholder="Overheads"></label>
        <label class="field"><span>Error type</span><select id="er-type" class="in">${ERR_TYPES.map((e) => opt(e[0], e[1]))}</select></label>
        <label class="field"><span>Marks lost</span><input id="er-marks" class="in" type="number" inputmode="decimal" min="0" step="0.5" placeholder="2"></label>
        <label class="field"><span>Source</span><input id="er-src" class="in" type="text" placeholder="MTP Costing Q3" value="${preset.mock ? 'Full paper #' + preset.mock : ''}"></label>
        <label class="field wide"><span>The rule, in one line</span><input id="er-note" class="in" type="text" placeholder="Always show the working note for absorption rates"></label>
        <button type="button" class="btn primary wide" data-act="err-add">${icon('plus')}Log mistake</button>
        <datalist id="er-chapters">${M.chapters.map((c) => html`<option value="${c.name}"></option>`)}</datalist></div>`
    });
    const queue = card({ cls: 'span-6', title: 'Review queue', icon: 'revision', sub: 'Due 3 days after the last review', actions: chip(due.length + ' due', due.length ? 'ink' : ''), body: due.length ? html`<ul class="list">${due.slice(0, 12).map((e) => row(M, e))}</ul>${due.length > 12 ? html`<p class="hint">${due.length - 12} more due after these.</p>` : ''}` : empty('Nothing due. A mistake comes back here 3 days after you last reviewed it.', '', 'checkCircle') });
    const maxT = top.length ? byType[top[0]] : 1, byPaper = {};
    openE.forEach((e) => { byPaper[e.paper] = (byPaper[e.paper] || 0) + (+e.marks || 0); });
    const maxP = Math.max(1, ...Object.values(byPaper));
    const leaks = card({
      cls: 'span-6', title: 'Top leaks · last 7 days', icon: 'alert', sub: 'Marks lost by error type, with the fix',
      body: html`${top.length ? html`<ol class="leaks">${top.map((k) => html`<li><div class="between"><b>${ERR_BY[k][1]}</b><span class="num">${fmt1(byType[k])} marks</span></div><div class="hbar" role="img" aria-label="${ERR_BY[k][1]}: ${fmt1(byType[k])} marks"><i style="width:${(byType[k] / maxT * 100).toFixed(1)}%" class="${k === top[0] ? 'on' : ''}"></i></div><small>${ERR_BY[k][2]}</small></li>`)}</ol>` : empty('No mistakes logged in the last 7 days.', '', 'checkCircle')}
        <h3 class="sub-h">Open marks by paper</h3><ul class="hbars">${PAPERS.map((p) => html`<li><span>${p[1]}</span><div class="hbar"><i style="width:${((byPaper[p[0]] || 0) / maxP * 100).toFixed(1)}%"></i></div><b class="num">${fmt1(byPaper[p[0]] || 0)}</b></li>`)}</ul>`
    });
    const allCard = card({ cls: 'span-6', title: 'Every mistake', icon: 'list', actions: chip(plural(all.length, 'entry', 'entries')), body: all.length ? html`<details class="grp" data-key="err-all" ${raw(isOpen('err-all') ? 'open' : '')}><summary><b>Show every entry</b></summary><div class="grp-body"><ul class="list">${all.map((e) => row(M, e))}</ul></div></details>` : empty('Your first entry will appear here.', '', 'list') });
    return html`${tiles}<div class="grid">${addCard}${queue}</div><div class="grid">${leaks}${allCard}</div>`;
  },
  actions: {
    'err-add': () => {
      const v = (id) => ((document.getElementById(id) || {}).value || '').trim();
      const date = v('er-date'), marks = +v('er-marks') || 0;
      if (!isDate(date) || (!v('er-ch') && !v('er-note'))) { toast('Add the chapter or the rule, and the date.', { tone: 'warn' }); return; }
      store.add('errors', { date, paper: v('er-paper'), chapter: v('er-ch'), type: v('er-type'), marks, source: v('er-src'), note: v('er-note'), fixed: false, reviews: 0, reviewedAt: null }, 'er');
      ['er-ch', 'er-marks', 'er-note'].forEach((id) => { const el = document.getElementById(id); if (el) el.value = ''; });
      toast('Mistake logged · it comes back for review in 3 days');
    },
    'err-review': (el) => { const e = store.get('errors', el.dataset.id); if (e) { store.patch('errors', e.id, { reviewedAt: todayStr(), reviews: (+e.reviews || 0) + 1 }); toast('Reviewed · back in 3 days'); } },
    'err-menu': (el) => {
      const e = store.get('errors', el.dataset.id); if (!e) return;
      menu(el, [
        { label: 'Edit', icon: 'edit', fn: () => form({ title: 'Edit mistake', fields: [{ name: 'date', label: 'Date', type: 'date', half: true, required: true }, { name: 'paper', label: 'Paper', type: 'select', half: true, options: PAPERS }, { name: 'chapter', label: 'Chapter' }, { name: 'type', label: 'Error type', type: 'select', half: true, options: ERR_TYPES.map((x) => [x[0], x[1]]) }, { name: 'marks', label: 'Marks lost', type: 'number', min: 0, step: 0.5, half: true }, { name: 'source', label: 'Source' }, { name: 'note', label: 'The rule' }], values: e, onSubmit: (v) => { store.put('errors', Object.assign({}, e, v)); toast('Saved'); } }) },
        { label: e.fixed ? 'Reopen' : 'Fixed for good', icon: e.fixed ? 'reset' : 'checkCircle', fn: () => store.patch('errors', e.id, { fixed: !e.fixed }) },
        '-',
        { label: 'Delete', icon: 'trash', fn: () => { const old = store.remove('errors', e.id); toast('Mistake deleted', { action: { label: 'Undo', fn: () => store.put('errors', old) } }); } }
      ], { align: 'end' });
    }
  }
};
