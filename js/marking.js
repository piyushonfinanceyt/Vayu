/* Marking hand-off: results from Claude's marking skills (one for Law, one for the other five papers) come into Vayu
   with no typing. A skill ends its report with a "Vayu marking" JSON block and a link carrying the same JSON:
     { "vayu": "marking", "v": 1, "paper": "Law", "test": "FM-2", "date": "2026-11-04", "marks": 52, "max": 100,
       "time": 185, "attempted": 100, "fixes": ["…", "…", "…"],
       "lost": [{ "q": "Q2(a)", "chapter": "Share capital", "type": "provision-not-cited", "marks": 1, "point": "…", "fix": "…" }] }
   - A full mock (max 100) fills one of the plan's full papers in that subject: the unmarked paper nearest the test date,
     which you can change. Marks, time, attempted, "Marked by Claude", and the top fixes as its mistakes note.
   - Anything under 100 marks is a chapter test: its score goes to the 'tests' collection, which the pass forecast reads.
   - Every lost mark becomes an Error Book entry (paper, chapter, type, marks, "FM-2 Q2(a)", the fix as its rule) due
     for its first drill tomorrow. Importing the same test twice adds nothing new.
   Accepts the JSON itself, text around it (the whole report pasted), or the link (#/mocks?marking=…). */
import { html, raw, esc, fmt1, fmtD, plural, addDays, todayStr, isDate, sortBy, diff } from './util.js';
import { icon } from './icons.js';
import { modal, toast } from './components.js';
import * as store from './store.js';

const SUBJECT = {
  law: 'Law', laws: 'Law', 'corporate and other laws': 'Law', p2: 'Law',
  accounts: 'Accounts', accounting: 'Accounts', 'advanced accounting': 'Accounts', p1: 'Accounts',
  tax: 'Tax', taxation: 'Tax', p3: 'Tax',
  costing: 'Costing', cost: 'Costing', 'cost and management accounting': 'Costing', cma: 'Costing', p4: 'Costing',
  audit: 'Audit', auditing: 'Audit', 'auditing and ethics': 'Audit', p5: 'Audit',
  'fm&sm': 'FM&SM', 'fm & sm': 'FM&SM', 'fm-sm': 'FM&SM', 'fm sm': 'FM&SM', fmsm: 'FM&SM', fm: 'FM&SM', sm: 'FM&SM', 'financial management and strategic management': 'FM&SM', p6: 'FM&SM'
};
const TYPES = ['concept', 'adjustment-missed', 'calculation', 'format', 'working-notes', 'provision-not-cited', 'time', 'misread', 'mcq-trap', 'forgot'];

export function decodeLink(v) {
  v = String(v || '').trim();
  if (v.startsWith('{')) { try { return JSON.parse(v); } catch (e) { /* fall through */ } }
  try { if (/^%7B/i.test(v) || v.startsWith('{')) return JSON.parse(decodeURIComponent(v)); } catch (e) { /* not URI-encoded JSON */ }
  try {
    const b = atob(v.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((v.length + 3) % 4));
    return JSON.parse(new TextDecoder().decode(Uint8Array.from(b, (c) => c.charCodeAt(0))));
  } catch (e) { return null; }
}
// find the marking in whatever was pasted: the JSON, the whole report around it, or the link
export function parseMarking(text) {
  text = String(text || '');
  const link = /[#?&]marking=([^&\s)"'<>]+)/.exec(text);
  let o = link ? decodeLink(link[1]) : null;
  if (!o) {
    const i = text.indexOf('{'), j = text.lastIndexOf('}');
    if (i >= 0 && j > i) { try { o = JSON.parse(text.slice(i, j + 1)); } catch (e) { o = null; } }
  }
  if (!o || typeof o !== 'object' || o.vayu !== 'marking') return { error: 'That doesn’t look like a Vayu marking. Copy the whole “Vayu marking” block from Claude’s report.' };
  const subject = SUBJECT[String(o.paper || '').trim().toLowerCase()], max = +o.max || 0, marks = +o.marks;
  if (!subject) return { error: 'The marking doesn’t say which paper it’s for: ' + (String(o.paper || 'no paper given').slice(0, 30)) + '.' };
  if (!isFinite(marks) || max <= 0 || marks < 0 || marks > max) return { error: 'The marking’s marks or maximum don’t look right.' };
  const date = isDate(o.date) ? o.date : todayStr();
  const lost = (Array.isArray(o.lost) ? o.lost : []).filter((l) => l && +l.marks > 0).map((l) => ({
    q: String(l.q || '').slice(0, 20), chapter: String(l.chapter || '').slice(0, 120), type: TYPES.includes(l.type) ? l.type : 'concept',
    marks: Math.round(+l.marks * 2) / 2, point: String(l.point || '').slice(0, 200), fix: String(l.fix || '').slice(0, 200)
  }));
  return { subject, test: String(o.test || 'Test').slice(0, 20), date, marks, max, time: +o.time || null, attempted: o.attempted != null ? +o.attempted : null, fixes: (Array.isArray(o.fixes) ? o.fixes : []).map(String).slice(0, 3), lost, full: max >= 100 };
}

// the plan's full paper this result most likely belongs to: unmarked, in that subject, nearest the test date (earlier first)
function pickMock(M, R) {
  const open = M.mocks.filter((m) => m.subject === R.subject && m.score == null && m.status !== 'skipped');
  return sortBy(open, (m) => Math.abs(diff(m.date, R.date)) * 2 + (m.date > R.date ? 1 : 0))[0] || null;
}

export function openMarking(M, text) {
  const R = parseMarking(text);
  if (R.error) { toast(R.error, { tone: 'bad', ms: 6000 }); return; }
  const key = R.test + '|' + R.date, have = store.list('errors').filter((e) => e.marking === key);
  const fresh = R.lost.filter((l) => !have.some((e) => e.q === l.q && e.note === (l.fix || l.point)));
  const pct = Math.round((R.marks / R.max) * 100), lostSum = fresh.reduce((a, l) => a + l.marks, 0);
  const logged = store.list('tests').some((x) => x.marking === key);
  const papers = M.mocks.filter((m) => m.subject === R.subject), guess = R.full ? pickMock(M, R) : null;
  const opts = R.full ? ['<option value="">Don’t fill a full paper</option>'].concat(papers.map((m) => '<option value="' + m.id + '"' + (guess && guess.id === m.id ? ' selected' : '') + '>' + esc('Mock #' + m.id + ' · ' + fmtD(m.date) + (m.score != null ? ' · has ' + Math.round(m.score * 100) + ' marks' : '')) + '</option>')).join('') : '';
  const body = html`<div class="mk-imp">
    <div class="mk-head"><b>${R.test} · ${(M.WMAP[R.subject] || { code: '' }).code} ${R.subject}</b><span class="big">${fmt1(R.marks)}<small> / ${R.max} · ${pct}%</small></span><small class="muted">${fmtD(R.date)}${R.time ? ' · ' + R.time + ' min' : ''} · marked by Claude</small></div>
    ${R.full ? html`<label class="field"><span>Fills this full paper</span><select class="in" data-mk-mock>${raw(opts)}</select></label>`
      : html`<p class="small muted">${icon('info')} ${logged ? 'This chapter test is already in Vayu.' : 'A chapter test: its score joins the pass forecast, and no full paper changes.'}</p>`}
    <h3 class="sub-h">${fresh.length ? plural(fresh.length, 'lost mark') + ' to the Error Book · −' + fmt1(lostSum) : 'No new lost marks'}${have.length ? html` <span class="muted small">(${have.length} already added)</span>` : ''}</h3>
    ${fresh.length ? html`<ul class="mk-list">${fresh.map((l) => html`<li><b>${l.q}${l.chapter ? ' · ' + l.chapter : ''}</b><span class="num">−${fmt1(l.marks)}</span><small>${l.point}${l.fix ? ' → ' + l.fix : ''}</small></li>`)}</ul>` : ''}
    ${R.fixes.length ? html`<h3 class="sub-h">Top fixes</h3><ol class="mk-fixes">${R.fixes.map((f) => html`<li>${f}</li>`)}</ol>` : ''}</div>`;
  const m = modal({ title: 'Add marking to Vayu', body, foot: raw('<button type="button" class="btn" data-close>Cancel</button><button type="button" class="btn primary" data-mk-ok>' + icon('check') + 'Add to Vayu</button>') });
  m.el.querySelector('[data-mk-ok]').addEventListener('click', () => {
    const sel = m.el.querySelector('[data-mk-mock]'), mockId = sel && sel.value ? sel.value : null;
    const due = addDays(todayStr(), 1);
    store.batch(() => {
      if (mockId) {
        const mk = M.mocks.find((x) => String(x.id) === mockId), scale = (mk && mk.max ? mk.max : 100) / R.max;
        const f = { marks: Math.round(R.marks * scale * 2) / 2, markedBy: 'Claude' };
        if (R.time) f.time = R.time;
        if (R.attempted != null) f.attempted = R.attempted;
        if (R.fixes.length) f.mistakes = R.test + ': ' + R.fixes.join(' · ');
        store.setRecFields('mocks', mockId, f);
      }
      if (!R.full && !logged) store.add('tests', { paper: R.subject, test: R.test, date: R.date, marks: R.marks, max: R.max, time: R.time, markedBy: 'Claude', marking: key }, 'ts');
      fresh.forEach((l) => store.add('errors', { date: R.date, paper: R.subject, chapter: l.chapter, type: l.type, marks: l.marks, source: R.test + ' ' + l.q, note: l.fix || l.point, point: l.point, q: l.q, marking: key, fixed: false, reviews: 0, reviewedAt: null, dueOn: due }, 'er'));
    });
    m.close();
    toast((mockId ? 'Mock #' + mockId + ' filled · ' : !R.full && !logged ? R.test + ' added · ' : '') + plural(fresh.length, 'mistake') + ' added to the Error Book', { icon: 'checkCircle', ms: 4000 });
  });
}
// "Paste marking": read the clipboard when the browser allows it, otherwise a box to paste into
export async function pasteMarking(M) {
  let text = '';
  try { text = navigator.clipboard && navigator.clipboard.readText ? await navigator.clipboard.readText() : ''; } catch (e) { text = ''; }
  if (text && text.includes('"marking"')) { openMarking(M, text); return; }
  const m = modal({ title: 'Paste a marking', body: raw('<p class="muted small" style="margin-bottom:10px">In Claude’s report, copy the “Vayu marking” block (or the whole report), then paste it here.</p><textarea class="in" rows="7" data-mk-text placeholder="{ &quot;vayu&quot;: &quot;marking&quot;, … }"></textarea>'), foot: raw('<button type="button" class="btn" data-close>Cancel</button><button type="button" class="btn primary" data-mk-go>Read it</button>') });
  m.el.querySelector('[data-mk-go]').addEventListener('click', () => { const v = m.el.querySelector('[data-mk-text]').value; m.close(); openMarking(M, v); });
}
