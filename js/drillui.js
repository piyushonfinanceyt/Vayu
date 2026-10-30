/* The drill screen shared by the Error Book and flashcards: one card at a time, recall, reveal, then Got it or Missed
   it (Space, 1, 2 on a keyboard). `view(rec)` gives a card's content; drill.js decides when it comes back. */
import { html, raw, plural, todayStr } from './util.js';
import { icon } from './icons.js';
import { modal, toast } from './components.js';
import { grade, nextText, GAPS } from './drill.js';
import * as store from './store.js';

// o = { coll, title, list, noun: ['mistake'] , flip: 'Show the rule', view(rec) → { tags, heading, prompt, answer } }
export function runDrill(o) {
  if (!o.list.length) { toast('Nothing to drill right now'); return; }
  const t = todayStr(), queue = o.list.slice(0, 20).map((e) => e.id), tally = { got: 0, missed: 0, fixed: 0 };
  let i = 0, shown = false, said = '';
  const m = modal({ title: o.title, body: raw('<div class="drill" aria-live="polite"></div>'), foot: raw('<div class="drill-foot"></div>') });
  const box = m.el.querySelector('.drill'), foot = m.el.querySelector('.drill-foot');
  const paint = () => {
    if (i >= queue.length) {
      box.innerHTML = String(html`<div class="drill-done">${icon('checkCircle')}<h3>${plural(queue.length, o.noun)} drilled</h3>
        <p>${tally.got} got it · ${tally.missed} missed${tally.missed ? ', back tomorrow' : ''}${tally.fixed ? ' · ' + tally.fixed + ' ' + (o.doneWord || 'fixed for good') : ''}</p>
        <p class="muted small">Missed ones drop to the first box and come back tomorrow. Each Got it lengthens the gap: ${GAPS.join(', ')} days, then it’s ${o.doneWord || 'fixed for good'}.</p></div>`);
      foot.innerHTML = String(html`<button type="button" class="btn primary" data-done autofocus>Done</button>`);
      foot.querySelector('[data-done]').focus();
      return;
    }
    const e = store.get(o.coll, queue[i]);
    if (!e) { i++; paint(); return; }
    const v = o.view(e), b = Math.min(+e.box || 0, GAPS.length - 1);
    box.innerHTML = String(html`<div class="drill-top"><span>${i + 1} of ${queue.length}</span>${said ? html`<span class="drill-said">${said}</span>` : ''}<span class="drill-boxes" role="img" aria-label="${'Box ' + (b + 1) + ' of ' + GAPS.length}">${GAPS.map((g, k) => html`<i class="${k <= b && e.box != null ? 'on' : ''}"></i>`)}</span></div>
      <article class="drill-card">
        <div class="row wrap" style="gap:6px">${v.tags}</div>
        <h3>${v.heading}</h3>
        <p class="drill-q">${v.prompt}</p>
        ${shown ? html`<div class="drill-a">${v.answer}</div>` : ''}
      </article>`);
    foot.innerHTML = String(shown
      ? html`<button type="button" class="btn" data-g="0">${icon('x')}Missed it <span class="kbd">1</span></button><button type="button" class="btn primary" data-g="1">${icon('check')}Got it <span class="kbd">2</span></button>`
      : html`<button type="button" class="btn primary" data-flip>${icon('eye')}${o.flip} <span class="kbd">Space</span></button>`);
    (foot.querySelector('[data-g="1"]') || foot.querySelector('[data-flip]')).focus();
  };
  const answer = (ok) => {
    const e = store.get(o.coll, queue[i]);
    if (e) {
      const p = grade(e, ok, t);
      store.patch(o.coll, e.id, p);
      if (ok) tally.got++; else tally.missed++;
      if (p.fixed) tally.fixed++;
      said = (ok ? 'Got it' : 'Missed') + ' · ' + (p.fixed && o.doneWord ? o.doneWord : nextText(p, t));
    }
    i++; shown = false; paint();
  };
  foot.addEventListener('click', (ev) => {
    if (ev.target.closest('[data-flip]')) { shown = true; paint(); }
    const g = ev.target.closest('[data-g]'); if (g) answer(g.dataset.g === '1');
    if (ev.target.closest('[data-done]')) m.close();
  });
  m.el.addEventListener('keydown', (ev) => {
    if (ev.target.matches('input, textarea, select') || i >= queue.length) return;
    if (ev.key === ' ' && !shown) { ev.preventDefault(); shown = true; paint(); }
    else if (shown && (ev.key === '1' || ev.key === 'ArrowLeft')) { ev.preventDefault(); answer(false); }
    else if (shown && (ev.key === '2' || ev.key === 'ArrowRight')) { ev.preventDefault(); answer(true); }
  });
  paint();
}
