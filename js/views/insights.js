/* Chart cards shared by several tabs: the 110-day study heatmap (Winter Arc momentum board, Analytics consistency),
   the six per-paper small multiples (Mock Tests, Analytics) and the per-paper bullet list (Analytics scoreboard). */
import { html, fmt1, fmtD, fmtDS, sortBy, typeName, plural } from '../util.js';
import { card, chip, status, empty } from '../components.js';
import { icon } from '../icons.js';
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

// ---------- "Will I pass?": each paper's likely exam score (model.outlook) against ICAI's rules ----------
const OL_STATUS = {
  strong: ['Exemption range', 'good'], safe: ['On course', 'good'], risk: ['At risk', 'warn'], below: ['Below 40', 'bad'], none: ['No paper yet', '']
};
const GROUP_VERDICT = {
  pass: ['On course to pass', 'good'], borderline: ['Borderline', 'warn'], notyet: ['Not passing yet', 'bad'], incomplete: ['Waiting for papers', '']
};
const olChip = (pair) => (pair[1] ? status(pair[0], pair[1]) : chip(pair[0]));
// range bar on 0–100: the band is the likely range, the dot the likely score; ticks at 40 (pass) and 60 (exemption)
const olBar = (p) => html`<span class="ol-bar" role="img" aria-label="${p.code} ${p.short}: likely ${p.likely} marks, range ${p.low} to ${p.high}" title="Likely ${p.likely} · range ${p.low}–${p.high} · last paper ${p.last}">
  <i class="ol-tick" style="left:40%"></i><i class="ol-tick ex" style="left:60%"></i>
  <i class="ol-band" style="left:${p.low}%;width:${Math.max(1, p.high - p.low)}%"></i><i class="ol-dot" style="left:${p.likely}%"></i></span>`;
function olRow(M, p) {
  const next = p.n ? null : M.mocks.find((m) => m.subject === p.key && m.score == null && m.status !== 'skipped');
  const note = !p.n ? (next ? 'First paper ' + fmtD(next.date) : 'No paper scheduled')
    : p.need ? 'Needs +' + p.need + ' to clear 40 on a bad day'
      : p.status === 'strong' ? 'Clears 60 even on a bad day' : 'Clears 40 even on a bad day';
  return html`<li class="ol-row">
    <span class="ol-name"><i class="dot" style="--c:${p.c}"></i><span><b>${p.code} ${p.short}</b><small>${fmtDS(p.examDay)} · ${p.n ? plural(p.n, 'paper') : 'no marks yet'}</small></span></span>
    ${p.n ? olBar(p) : html`<span class="ol-bar empty" aria-hidden="true"><i class="ol-tick" style="left:40%"></i><i class="ol-tick ex" style="left:60%"></i></span>`}
    <span class="ol-num">${p.n ? html`<b>${p.likely}</b><small>${p.low}–${p.high}</small>` : html`<b>—</b>`}</span>
    <span class="ol-st">${olChip(OL_STATUS[p.status])}<small>${note}</small></span></li>`;
}
function olGroup(M, g) {
  const agg = g.needAgg == null ? (g.known ? 'Likely ' + g.sumLikely + ' so far from ' + plural(g.known, 'paper') : 'Aggregate needs 150 of 300')
    : 'Likely total ' + g.sumLikely + ' of 300 · needs 150' + (g.needAgg ? ' · short by ' + g.needAgg : ' · ' + (g.sumLikely - 150) + ' to spare');
  return html`<section class="ol-group" aria-label="${g.name}">
    <div class="ol-gh"><div><b>${g.name}</b><small>${g.dates.map(fmtDS).join(', ')}</small></div>${olChip(GROUP_VERDICT[g.verdict])}</div>
    <p class="small muted">${agg}</p>
    <ul class="ol-list">${g.papers.map((p) => olRow(M, p))}</ul></section>`;
}
export function passOutlook(M, o = {}) {
  const O = M.outlook, w = O.weakest;
  let head;
  if (!O.taken) head = 'Enter the marks from your first full paper and the forecast starts. Each subject needs at least one paper.';
  else if (w) head = w.code + ' ' + w.short + ' is the risk: likely ' + w.likely + ' (' + w.low + '–' + w.high + ')' + (w.need ? ', so it needs +' + w.need + ' marks to clear 40 even on a bad day.' : ', the lowest in a group that is short on aggregate.');
  else if (O.groups.every((g) => g.verdict === 'pass')) head = 'On your current form both groups pass, with every paper above 40 even on a bad day.';
  else head = 'No paper is below 40 so far. Write the remaining subjects to complete the forecast.';
  return card({
    cls: o.cls || '', id: 'pass-outlook', title: 'Will I pass?', icon: 'target',
    sub: 'Your likely exam score per paper, from your full papers · ICAI rules: 40 in each paper, 50% aggregate per group',
    body: html`<div class="notice ol-head ${w && w.need ? 'warn' : ''}">${icon(w ? 'alert' : 'info')}<p>${head}</p></div>
      <div class="ol-groups">${O.groups.map((g) => olGroup(M, g))}</div>
      <div class="legend"><span><i class="key ol-k-band"></i>likely range</span><span><i class="key ol-k-dot"></i>likely score</span><span><i class="key ol-k-tick"></i>40 pass</span><span><i class="key ol-k-tick ex"></i>60 exemption</span></div>
      <p class="hint">Likely score = your recent form (last 3 papers, the newest counts most) plus half your trend until that paper’s exam day, capped at ±10 marks. The range is how much your recent scores vary, and it’s wider while there are few papers. A paper with 60 or more is exempted if its group isn’t cleared. This is a guide from mock marks, not a promise.</p>`
  });
}

// ---------- leak map: the chapters most likely to cost marks (leaks.js) ----------
export function leakCard(M, o = {}) {
  const L = M.leaks, top = L.length ? L[0].score : 1;
  return card({
    cls: 'leak-card ' + (o.cls || ''), id: 'leak-map', title: 'Leak map', icon: 'activity', sub: 'Where marks are most likely to slip: open mistakes, weak papers, and overdue work and revision',
    body: L.length ? html`<ol class="leaks-map">${L.map((r, i) => { const w = M.WMAP[r.subject] || { code: '', c: 'var(--ink-3)' }; return html`<li><span class="lm-rank num">${i + 1}</span>
        <span class="lm-main"><b><i class="dot" style="--c:${w.c}"></i>${w.code} ${r.c ? '#' + r.c.id + ' ' : ''}${r.name}</b><span class="hbar" role="img" aria-label="${'Risk score ' + r.score}"><i class="${i === 0 ? 'on' : ''}" style="width:${Math.max(4, r.score / top * 100).toFixed(1)}%"></i></span><small>${r.why.join(' · ')}</small></span>
        <button type="button" class="btn sm" data-act="focus" data-subject="${r.subject}" data-chapter="${r.c && r.c.status !== 'done' ? r.c.id : ''}" aria-label="${'Deep focus on ' + r.name}">${icon('target')}Fix</button></li>`; })}</ol>`
      : empty('No leaks yet. They appear as you log mistakes, write papers and reach deadlines.', '', 'checkCircle')
  });
}
