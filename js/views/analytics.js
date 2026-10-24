/* Analytics.
   Readiness scoreboard (option B) on top: the readiness gauge (actual vs expected), chapters burn-up vs the plan with the
   gap shaded and today's pace projected to the R1 deadline, and one bullet chart per paper.
   Then: metric tiles · study hours vs target (weekly bars, cumulative vs plan) · marks trend per paper (six small
   multiples) · consistency heatmap · XP over time · overall progress vs expected · life-area trend · subject progress. */
import { html, raw, esc, fmt1, fmtN, fmtD, fmtDS, plural, diff, addDays, sum, pct, clamp, signed } from '../util.js';
import { icon } from '../icons.js';
import { card, chip, status, tile, meter } from '../components.js';
import { spot, gauge } from '../charts.js';
import { studyHeatmap, heatLegend, paperMultiples, paperBullets } from './insights.js';

function scoreboard(M) {
  const R = M.readiness, gap = R.value - R.expected, st = M.st, F = M.F, t = M.t;
  const parts = [['Syllabus (R1)', F.syllabus(t), M.EXP.syllabus(t) / 100], ['Revision (R2 + R3)', F.revision(t), M.EXP.revision(t) / 100], ['Full papers', F.mocks(t), M.EXP.mocks(t) / 100], ['Study hours', F.hours(t), M.EXP.hours(t) / 100]];
  const hero = html`<section class="card hero span-4 gauge-card" aria-label="Exam readiness"><span class="lbl">${icon('gauge')} Exam readiness</span>
    <div class="gauge-wrap">${gauge(R.value, { expected: R.expected, label: 'Readiness ' + Math.round(R.value) + ' of 100, expected ' + Math.round(R.expected) })}<div class="gauge-num"><b>${Math.round(R.value)}</b><small>of 100 · expected ${Math.round(R.expected)}</small></div></div>
    <p style="text-align:center;margin:4px 0 12px">${Math.abs(gap) < 1 ? status('On pace with the plan', 'good') : gap > 0 ? status('Ahead by ' + fmt1(gap) + ' pts', 'good') : status('Behind by ' + fmt1(-gap) + ' pts', gap > -5 ? 'warn' : 'bad')}</p>
    <ul class="parts">${parts.map((p) => html`<li><span class="small">${p[0]}</span>${meter(p[1], { thin: true, target: p[2], targetLabel: 'expected', label: p[0] })}<b class="num small">${pct(p[1])}</b></li>`)}</ul>
    <p class="small" style="color:var(--on-hero-2);margin-top:10px">The average of syllabus, revision, full papers and hours. The tick is where the plan expects you today.</p></section>`;
  const C0 = M.plan.C0, end = st.syllabusDeadline, last = t < end ? t : end, actual = [];
  for (let d = C0; d <= last; d = addDays(d, 1)) actual.push({ x: d, y: M.chaptersDoneBy(d) });
  const total = M.chapters.length, span = Math.max(1, diff(C0, end));
  const burn = card({
    cls: 'span-8', title: 'Chapters done vs the plan', icon: 'up', sub: 'R1 of all ' + total + ' chapters by ' + fmtDS(end) + ' · shaded = the gap · dotted = where today’s pace lands',
    actions: html`<span class="legend" style="margin:0"><span><i class="key line" style="--c:var(--ink)"></i>you</span><span><i class="key dash" style="--c:var(--ink-3)"></i>plan</span></span>`,
    body: t < C0 ? html`<p class="muted">The burn-up starts on ${fmtD(C0)}.</p>` : spot('an-burn', 'burnup', { from: C0, to: end, total, plan: (d) => total * clamp(diff(C0, d) / span, 0, 1), actual, unit: 'chapters', height: 250, ariaLabel: 'Chapters done against the plan from ' + fmtDS(C0) + ' to ' + fmtDS(end) })
  });
  const bullets = card({ title: 'Every paper against its checkpoint target', icon: 'target', sub: 'Last full paper · grey band = below pass ' + Math.round(st.passLine * 100) + ' · tick = the target for the next checkpoint', body: paperBullets(M) });
  return html`<div class="grid">${hero}${burn}</div>${bullets}`;
}

export default {
  head(M) { return { title: 'Analytics', sub: raw(esc('Readiness ' + Math.round(M.readiness.value) + ' of 100 · ' + plural(M.daysToExam(), 'day') + ' to Paper 1 · ' + fmtN(M.hoursLogged) + ' hours logged')) }; },
  render(M) {
    const a = M.analytics, K = M.kpi;
    const tiles = html`<div class="tiles six">
      ${tile({ label: 'Today', icon: 'book', value: raw(fmt1(a.dailyHours) + '<small> / ' + fmt1(K.study.target) + ' h</small>'), foot: signed(K.study.delta) + ' h vs yesterday' })}
      ${tile({ cls: 'hero', label: 'This week', icon: 'calendar', value: raw(fmt1(a.weeklyHours) + '<small> / ' + fmt1(a.weeklyTarget) + ' h</small>'), foot: K.week.pct == null ? '' : Math.round(K.week.pct * 100) + '% of the week’s target' })}
      ${tile({ label: 'Per logged day', icon: 'clock', value: fmt1(a.avgPerLoggedDay) + ' h', foot: M.mult ? '×' + M.mult.toFixed(1) + ' vs August (' + fmt1(M.avgAug) + ' h)' : 'August average ' + fmt1(M.avgAug) + ' h' })}
      ${tile({ label: 'Habits · 7 days', icon: 'habits', value: a.habitCompletion == null ? '—' : pct(a.habitCompletion), foot: 'of habit checks done' })}
      ${tile({ label: 'Plan items · 7 days', icon: 'checkCircle', value: a.taskCompletion == null ? '—' : pct(a.taskCompletion), foot: a.tasksDone7 + ' of ' + a.tasksTotal7 + ' done' })}
      ${tile({ label: 'Goals at risk', icon: 'alert', value: String(a.goalRisk.length), foot: a.goalRisk.length ? a.goalRisk.slice(0, 2).map((g) => g.title).join(' · ') : 'every goal on track or ahead' })}</div>`;
    // study hours: weekly bars + cumulative vs plan
    const wl = M.weeks.map((w) => 'W' + w.n), tips = M.weeks.map((w) => 'Week ' + w.n + ' · ' + fmtDS(w.start) + '–' + fmtDS(w.end)), cw = M.weeks.findIndex((w) => M.t >= w.start && M.t <= w.end);
    const hoursBars = card({ cls: 'span-6', title: 'Study hours by week', icon: 'clock', sub: 'Solid = logged · hatched = planned', body: spot('an-hours', 'bars', { labels: wl, tips, values: M.weeks.map((w) => (w.start <= M.t ? w.hrs : null)), targets: M.weeks.map((w) => w.target), highlight: cw, fmt: (v) => fmt1(v) + ' h', height: 220, ariaLabel: 'Study hours logged against the plan for each week' }) });
    const C0 = M.plan.C0, end = M.t < M.LAST ? M.t : M.LAST, cum = [], planCum = [];
    let pc = 0;
    M.days.filter((d) => d.date >= C0).forEach((d) => { pc += d.target; planCum.push({ x: d.date, y: pc }); });
    for (let d = C0; d <= end; d = addDays(d, 1)) cum.push({ x: d, y: M.cumHoursAt(d) });
    const cumCard = card({ cls: 'span-6', title: 'Hours since ' + fmtDS(C0) + ' vs the plan', icon: 'up', sub: fmtN(M.cumHoursAt(M.t)) + ' of ' + fmtN(M.plan.totalHours) + ' planned hours', body: spot('an-cum', 'line', { height: 220, x: { type: 'date', from: C0, to: M.LAST }, y: { auto: true }, fmtY: (v) => fmtN(v) + ' h', series: [{ id: 'plan', name: 'Plan', color: 'var(--ink-3)', dash: true, dots: false, points: planCum.filter((p, i) => i % 3 === 0 || p.x === M.LAST) }, { id: 'you', name: 'Logged', color: 'var(--ink)', dots: false, area: true, points: cum }], empty: { text: 'Hours count from ' + fmtD(C0) + '.' }, ariaLabel: 'Cumulative study hours against the plan' }) });
    // XP by week + overall vs expected
    const xpCard = card({ cls: 'span-6', title: 'XP by week', icon: 'sparkles', sub: fmtN(M.xp) + ' XP · level ' + M.level, body: spot('an-xp', 'bars', { labels: wl, tips, values: M.weeks.map((w) => (w.start <= M.t ? w.xp : null)), highlight: cw, fmt: (v) => fmtN(v) + ' XP', height: 200, ariaLabel: 'XP earned each week' }) });
    const from = M.st.planStart, act = [], exp = [];
    for (let d = from; d <= M.t && d <= M.LAST; d = addDays(d, 1)) { const v = M.analytics.overallAt(d); if (v != null) act.push({ x: d, y: v }); exp.push({ x: d, y: M.analytics.overallExpAt(d) }); }
    const overall = card({ cls: 'span-6', title: 'Overall progress vs expected', icon: 'analytics', sub: 'Average of every life area with data, revision and full papers', actions: html`<span class="legend" style="margin:0"><span><i class="key line" style="--c:var(--ink)"></i>actual</span><span><i class="key dash" style="--c:var(--ink-3)"></i>expected</span></span>`, body: spot('an-overall', 'line', { height: 200, x: { type: 'date', from, to: M.t > from ? M.t : addDays(from, 7) }, y: { min: 0, max: 100, ticks: [0, 25, 50, 75, 100] }, fmtY: (v) => Math.round(v) + '%', series: [{ id: 'exp', name: 'Expected', color: 'var(--ink-3)', dash: true, dots: false, points: exp.filter((p, i) => i % 2 === 0) }, { id: 'act', name: 'Actual', color: 'var(--ink)', dots: false, points: act }], ariaLabel: 'Overall progress compared with the expected pace' }) });
    // life areas
    const areas = M.areas.filter((x) => !x.hidden && x.hasData).slice(0, 4);
    const laFrom = areas.length ? areas.map((x) => x.points[0].date).sort()[0] : M.t;
    const lifeCard = card({ cls: 'span-7', title: 'Life areas', icon: 'activity', sub: 'Each area’s progress to its own target · change them in Settings', actions: html`<span class="legend" style="margin:0">${areas.map((x) => html`<span><i class="key line" style="--c:${x.color}"></i>${x.name} ${Math.round(x.latest.value)}%</span>`)}</span>`, body: areas.length ? spot('an-life', 'line', { height: 220, x: { type: 'date', from: laFrom, to: M.t > laFrom ? M.t : addDays(laFrom, 7) }, y: { min: 0, max: 100, ticks: [0, 25, 50, 75, 100] }, fmtY: (v) => Math.round(v) + '%', series: areas.map((x) => ({ id: x.id, name: x.name, color: x.color, dots: false, points: x.points.filter((p, i) => i % 2 === 0 || i === x.points.length - 1).map((p) => ({ x: p.date, y: p.value })) })), ariaLabel: 'Progress in each life area over time' }) : html`<p class="muted">No life area has data yet.</p>` });
    const subj = card({ cls: 'span-5', title: 'Subject progress', icon: 'book', sub: 'Chapters done per paper', body: html`<ul class="hbars">${M.worlds.map((w) => html`<li><span class="row" style="gap:8px"><i class="dot" style="--c:${w.c}"></i>${w.code} ${w.short}</span><div class="hbar"><i style="width:${(w.pct * 100).toFixed(1)}%"></i></div><b class="num">${w.done}/${w.chapters}</b></li>`)}</ul>` });
    return html`${scoreboard(M)}${tiles}
      <div class="grid">${hoursBars}${cumCard}</div>
      ${paperMultiples(M, { prefix: 'amult-', title: 'Marks trend per paper' })}
      ${card({ title: 'Consistency', icon: 'calendar', sub: 'Every plan day, shaded by its share of the hours target', body: html`${heatLegend()}${studyHeatmap(M, { id: 'an-heat' })}` })}
      <div class="grid">${xpCard}${overall}</div>
      <div class="grid">${lifeCard}${subj}</div>`;
  }
};
