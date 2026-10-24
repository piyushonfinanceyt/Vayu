/* Chart cards shared by several tabs: the 110-day study heatmap (Winter Arc momentum board, Analytics consistency),
   the six per-paper small multiples (Mock Tests, Analytics) and the per-paper bullet list (Analytics scoreboard). */
import { html, fmt1, fmtD, fmtDS, sortBy, typeName } from '../util.js';
import { card } from '../components.js';
import { spot, bullet } from '../charts.js';

const P = (n) => Math.round(n * 100);
const SHORT_PHASE = ['Old plan · A + L', 'Old plan · rest', 'R1 · 2 papers/wk', 'R2 · 3/wk', 'Daily papers', 'Fix-it', 'Final look', 'Exams'];

export function studyHeatmap(M, o = {}) {
  const days = M.days.map((d) => ({
    date: d.date, score: d.score, mark: d.boss,
    tip: fmtD(d.date) + ' · ' + typeName(d.type) + (d.jNum ? ' · Day ' + d.jNum : '') + '|' + (d.date > M.t ? 'Planned ' + fmt1(d.target) + ' h' : d.logged ? fmt1(d.rec.hrs) + ' of ' + fmt1(d.target) + ' h · ' + Math.round(Math.min(1, d.score) * 100) + '%' : 'Not logged · target ' + fmt1(d.target) + ' h') + (d.boss ? '|Full paper day' : '')
  }));
  const phases = M.phases.map((p, i) => ({ name: p.name, short: SHORT_PHASE[i] || p.name, from: p.from, to: p.to }));
  return spot(o.id || 'heat', 'heatmap', { days, today: M.t, phases, height: o.height || 230, ariaLabel: 'Study hours against target for every plan day, ' + fmtDS(M.FIRST) + ' to ' + fmtDS(M.LAST) });
}
export const heatLegend = () => html`<div class="legend"><span><i class="key ln"></i>not logged</span><span><i class="key l1"></i>&lt; 30%</span><span><i class="key l2"></i>30–59%</span><span><i class="key l3"></i>60–89%</span><span><i class="key l4"></i>≥ 90% of target</span><span><i class="key hatch"></i>coming up</span><span><i class="key" style="--c:transparent;border:2px solid var(--bad-mark)"></i>today</span></div>`;

export function paperMultiples(M, o = {}) {
  const st = M.st, from = M.mocks[0].date, to = sortBy(M.mocks, (m) => m.date).pop().date;
  return card({
    cls: o.cls || '', title: o.title || 'Scores over time · one chart per paper', icon: 'analytics', sub: 'Same 0–100 scale on every chart, so papers compare at a glance',
    actions: html`<span class="legend" style="margin:0"><span><i class="key line" style="--c:var(--ink)"></i>your marks</span><span><i class="key dash" style="--c:var(--ink-3)"></i>checkpoint target</span><span><i class="key dash" style="--c:var(--bad-mark)"></i>pass 40</span></span>`,
    body: html`<div class="multiples">${M.worlds.map((w) => {
      const taken = w.fights.filter((f) => f.score != null), last = w.last;
      return html`<div class="mult"><div class="mult-h"><span class="row" style="gap:8px"><i class="dot" style="--c:${w.c}"></i><b>${w.code} ${w.short}</b></span><span class="small muted">${last ? 'last ' + P(last.score) : 'first ' + fmtDS(w.fights[0].date)} · target ${P(w.nextTarget)}</span></div>
        ${spot((o.prefix || 'mult-') + w.paper, 'line', { compact: true, height: 130, x: { type: 'date', from, to }, y: { min: 0, max: 100, ticks: [0, 40, 70, 100] }, fmtY: (v) => String(Math.round(v)), refs: [{ y: st.passLine * 100, color: 'var(--bad-mark)' }],
          series: [{ id: 'tgt', name: 'Target', color: 'var(--ink-3)', dash: true, dots: false, points: w.fights.map((f) => ({ x: f.date, y: P(f.target) })) }, { id: 'score', name: 'Marks', color: w.c, points: taken.map((f) => ({ x: f.date, y: f.score * 100, note: 'mock #' + f.id })) }],
          empty: { text: 'First paper on ' + fmtD(w.fights[0].date) }, ariaLabel: w.code + ' ' + w.short + ' mock scores against the target and the pass line' })}</div>`;
    })}</div>`
  });
}

export function paperBullets(M) {
  return html`<ul class="pbullets">${M.worlds.map((w) => {
    const last = w.last, v = last ? last.score * 100 : null, tgt = P(w.nextTarget), pass = P(M.st.passLine);
    const verdict = v == null ? html`<span class="chip">No paper yet · ${fmtDS(w.fights[0].date)}</span>` : v >= tgt ? html`<span class="chip good">Target met · ${Math.round(v)}</span>` : v >= pass ? html`<span class="chip warn">${Math.round(v)} · ${tgt - Math.round(v)} to target</span>` : html`<span class="chip bad">${Math.round(v)} · below pass</span>`;
    return html`<li><span class="row" style="gap:8px"><i class="dot" style="--c:${w.c}"></i><b>${w.code} ${w.short}</b></span>${bullet(v, { pass, target: tgt, label: w.code + ' ' + w.short + ': ' + (v == null ? 'no paper yet' : Math.round(v) + ' marks') + ', target ' + tgt + ', pass ' + pass })}${verdict}</li>`;
  })}</ul>`;
}
